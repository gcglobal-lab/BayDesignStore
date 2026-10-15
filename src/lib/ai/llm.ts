import 'server-only';

/**
 * One chat call, tried against a chain of models until one answers:
 *
 *   1. NVIDIA (build.nvidia.com / NIM, OpenAI-compatible) — only if NVIDIA_API_KEY is set.
 *      Model from NVIDIA_MODEL (default: Nemotron 3 Ultra), base URL from NVIDIA_BASE_URL.
 *   2. OpenRouter free models, in order (OPENROUTER_MODELS, comma-separated, or the defaults
 *      below), ending with "openrouter/free", OpenRouter's router across its free models.
 *
 * Embedding and content-safety models can't write replies, so they're not in the default
 * chain (a request to them would only fail and add delay).
 */
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type ChatResult = { ok: true; text: string; model: string } | { ok: false; error: string };

const DEFAULT_OPENROUTER_MODELS = ['nvidia/nemotron-3.5-lightning:free', 'google/gemma-4-26b-a4b-it:free', 'openrouter/free'];
const NON_CHAT = /embed|content-safety|guard/i;

type Provider = { name: string; url: string; key: string; model: string; headers?: Record<string, string>; extra?: Record<string, unknown> };

function providers(): Provider[] {
  const list: Provider[] = [];
  const nvidiaKey = (process.env.NVIDIA_API_KEY ?? process.env.NVIDEAAPIKEY)?.trim();
  if (nvidiaKey) {
    // Ultra first; Super (much faster) when Ultra is busy — NVIDIA's free tier often answers 503 "overloaded".
    const models = [process.env.NVIDIA_MODEL?.trim() || 'nvidia/nemotron-3-ultra-550b-a55b', 'nvidia/nemotron-3-super-120b-a12b'];
    for (const model of [...new Set(models)]) {
      list.push({
        name: 'nvidia',
        url: `${(process.env.NVIDIA_BASE_URL?.trim() || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '')}/chat/completions`,
        key: nvidiaKey,
        model,
      });
    }
  }
  const orKey = (process.env.OPENROUTER_API_KEY ?? process.env.OPENROUTER)?.trim();
  if (orKey) {
    const models = (process.env.OPENROUTER_MODELS?.split(',').map((m) => m.trim()).filter(Boolean) ?? DEFAULT_OPENROUTER_MODELS).filter((m) => !NON_CHAT.test(m));
    for (const model of models) {
      list.push({
        name: 'openrouter',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        key: orKey,
        model,
        headers: { 'HTTP-Referer': process.env.SITE_URL || 'https://baydesignstore.com', 'X-Title': 'Bay Design Store' },
        // Nemotron and other reasoning models: think briefly and send only the answer, so the
        // token budget goes to the reply (otherwise the reply can come back empty).
        extra: { reasoning: { effort: 'low', exclude: true } },
      });
    }
  }
  return list;
}

export const isAiConfigured = () => providers().length > 0;

/** Reasoning models sometimes include their thinking; only the answer is shown. */
function clean(text: string) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^<think>[\s\S]*$/i, '')
    .trim();
}

/** A model that keeps failing is skipped for a minute so it doesn't slow every reply. */
const cooldown = new Map<string, number>();

/** If a model hasn't answered after this long, the next one in the chain starts alongside it. */
const HEDGE_MS = 6000;

const idOf = (p: Provider) => `${p.name}:${p.model}`;

async function ask(p: Provider, messages: ChatMessage[], maxTokens: number, temperature: number, signal: AbortSignal): Promise<ChatResult> {
  const id = idOf(p);
  try {
    const res = await fetch(p.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json', Accept: 'application/json', ...p.headers },
      body: JSON.stringify({ model: p.model, messages, max_tokens: maxTokens, temperature, stream: false, ...p.extra }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(22_000)]),
      cache: 'no-store',
    });
    if (!res.ok) {
      if (res.status === 429 || res.status >= 500 || res.status === 404 || res.status === 400) cooldown.set(id, Date.now() + 60_000);
      return { ok: false, error: `${id} → HTTP ${res.status}` };
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[]; model?: string };
    const text = clean(data.choices?.[0]?.message?.content ?? '');
    if (!text) return { ok: false, error: `${id} → empty reply` };
    return { ok: true, text, model: data.model ?? p.model };
  } catch (err) {
    // Cancelled because another model already answered (or the budget ran out): not this model's fault.
    if (!signal.aborted) cooldown.set(id, Date.now() + 30_000);
    return { ok: false, error: `${id} → ${err instanceof Error ? err.name : 'error'}` };
  }
}

/**
 * Asks the first model; if it fails, the next starts at once, and if it is merely slow, the next
 * starts after HEDGE_MS alongside it. The first good answer wins and the rest are cancelled.
 */
export async function chat(messages: ChatMessage[], { maxTokens = 900, temperature = 0.3, budgetMs = 40_000 } = {}): Promise<ChatResult> {
  const all = providers();
  if (all.length === 0) return { ok: false, error: 'No AI provider is configured (set OPENROUTER or NVIDIA_API_KEY).' };
  const ready = all.filter((p) => (cooldown.get(idOf(p)) ?? 0) <= Date.now());
  const chain = ready.length ? ready : all;

  const cancel = new AbortController();
  const signal = AbortSignal.any([cancel.signal, AbortSignal.timeout(budgetMs)]);
  const errors: string[] = [];

  const result = await new Promise<ChatResult>((resolve) => {
    let next = 0;
    let pending = 0;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (r: ChatResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(r);
    };
    const launch = () => {
      clearTimeout(timer);
      if (done) return;
      if (next >= chain.length || signal.aborted) {
        if (pending === 0) finish({ ok: false, error: errors.join(' | ') || 'No model answered.' });
        return;
      }
      const p = chain[next++];
      pending++;
      ask(p, messages, maxTokens, temperature, signal).then((r) => {
        pending--;
        if (r.ok) return finish(r);
        errors.push(r.error);
        launch();
      });
      timer = setTimeout(launch, HEDGE_MS);
    };
    launch();
  });

  cancel.abort();
  if (!result.ok) console.error('[ai] every model failed:', result.error);
  return result;
}
