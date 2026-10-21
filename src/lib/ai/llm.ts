import 'server-only';

/**
 * One chat call, tried against a chain of models until one answers:
 *
 *   1. NVIDIA (build.nvidia.com / NIM, OpenAI-compatible) — only if NVIDIA_API_KEY is set.
 *      Model from NVIDIA_MODEL (default: Nemotron 3 Super), then Ultra; base URL from NVIDIA_BASE_URL.
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
    // Super first: it answers in ~3–4 s, while Ultra is slower and often 503 "overloaded" on the free tier.
    const models = [process.env.NVIDIA_MODEL?.trim() || 'nvidia/nemotron-3-super-120b-a12b', 'nvidia/nemotron-3-ultra-550b-a55b'];
    for (const model of [...new Set(models)]) {
      list.push({
        name: 'nvidia',
        url: `${(process.env.NVIDIA_BASE_URL?.trim() || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '')}/chat/completions`,
        key: nvidiaKey,
        model,
        // Skip the "thinking" pass: same answers for chat, and replies come back about twice as fast.
        extra: { chat_template_kwargs: { enable_thinking: false } },
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

/** Reasoning models sometimes include their thinking; only the answer is shown. */
function clean(text: string) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^<think>[\s\S]*$/i, '')
    .trim();
}

/** A model that keeps failing is skipped for a minute so it doesn't slow every reply. */
const cooldown = new Map<string, number>();

/** Tries one model at a time, in order; the first good answer is returned. */
export async function chat(messages: ChatMessage[], { maxTokens = 900, temperature = 0.3, budgetMs = 40_000 } = {}): Promise<ChatResult> {
  const started = Date.now();
  const errors: string[] = [];
  const chain = providers();
  if (chain.length === 0) return { ok: false, error: 'No AI provider is configured (set OPENROUTER or NVIDIA_API_KEY).' };

  for (const p of chain) {
    const id = `${p.name}:${p.model}`;
    if ((cooldown.get(id) ?? 0) > Date.now()) continue;
    const left = budgetMs - (Date.now() - started);
    if (left < 3000) break;
    try {
      const res = await fetch(p.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json', Accept: 'application/json', ...p.headers },
        body: JSON.stringify({ model: p.model, messages, max_tokens: maxTokens, temperature, stream: false, ...p.extra }),
        // A model that hangs is given up on quickly so the next one still has time to answer.
        signal: AbortSignal.timeout(Math.min(left, 15_000)),
        cache: 'no-store',
      });
      if (!res.ok) {
        errors.push(`${id} → HTTP ${res.status}`);
        if (res.status === 429 || res.status >= 500 || res.status === 404 || res.status === 400) cooldown.set(id, Date.now() + 60_000);
        continue;
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[]; model?: string };
      const text = clean(data.choices?.[0]?.message?.content ?? '');
      if (!text) {
        errors.push(`${id} → empty reply`);
        cooldown.set(id, Date.now() + 60_000);
        continue;
      }
      return { ok: true, text, model: data.model ?? p.model };
    } catch (err) {
      errors.push(`${id} → ${err instanceof Error ? err.name : 'error'}`);
      cooldown.set(id, Date.now() + 30_000);
    }
  }
  console.error('[ai] every model failed:', errors.join(' | '));
  return { ok: false, error: errors.join(' | ') || 'No model answered.' };
}
