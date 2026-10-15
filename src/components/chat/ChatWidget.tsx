'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bot, Loader2, MessageCircle, RotateCcw, Send, Sparkles, X } from 'lucide-react';

export type ChatTurn = { role: 'user' | 'assistant'; content: string };
export type ChatReply = { reply: string; [key: string]: unknown };

/**
 * Floating chat assistant (bottom-right on every page). The look follows the page's palette:
 * brass on the website, indigo/violet inside Bay Design Base. `renderExtra` lets each assistant
 * add cards under a reply (the website's inquiry form, Base's password actions).
 */
export default function ChatWidget({
  endpoint,
  title,
  subtitle,
  greeting,
  suggestions,
  renderExtra,
  footer,
}: {
  endpoint: string;
  title: string;
  subtitle: string;
  greeting: string;
  suggestions: string[];
  renderExtra?: (reply: ChatReply, history: ChatTurn[], send: (text: string) => void) => ReactNode;
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<(ChatTurn & { meta?: ChatReply })[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // The conversation is kept in memory only: it carries across pages, and a reload starts fresh.
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);
  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const history: ChatTurn[] = [...turns.map(({ role, content: c }) => ({ role, content: c })), { role: 'user', content }];
    setTurns((t) => [...t, { role: 'user', content }]);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history.slice(-12) }) });
      const data = (await res.json().catch(() => null)) as ChatReply | null;
      const reply = data?.reply || 'Sorry — I couldn’t answer that just now. Please try again in a moment.';
      setTurns((t) => [...t, { role: 'assistant', content: reply, meta: data ?? undefined }]);
    } catch {
      setTurns((t) => [...t, { role: 'assistant', content: 'I couldn’t reach the server. Check your connection and try again.' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Launcher */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Close chat' : 'Open chat'}
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-[70] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brass-light via-brass to-brass-dark text-white shadow-[0_18px_40px_-12px_rgb(var(--c-brass)/0.85)] ring-4 ring-white/70 transition-transform duration-300 hover:scale-105 active:scale-95 print:hidden sm:bottom-6 sm:right-6"
      >
        {open ? <X size={24} /> : <MessageCircle size={25} />}
        {!open && turns.length === 0 && <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 animate-pulse rounded-full border-2 border-white bg-emerald-500" />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={title}
          className="fixed inset-x-2 bottom-24 z-[70] flex max-h-[min(640px,calc(100dvh-7.5rem))] flex-col overflow-hidden rounded-3xl border border-stone/70 bg-ivory text-ink shadow-[0_40px_90px_-30px_rgba(23,23,58,0.55)] print:hidden sm:inset-x-auto sm:right-6 sm:w-[400px]"
        >
          <header className="flex items-center gap-3 bg-gradient-to-r from-ink via-charcoal to-brass-dark px-4 py-3.5 text-white">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-white/15"><Sparkles size={19} /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.98rem] font-semibold">{title}</p>
              <p className="flex items-center gap-1.5 truncate text-xs text-white/75"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {subtitle}</p>
            </div>
            {turns.length > 0 && (
              <button type="button" onClick={() => setTurns([])} className="rounded-xl p-2 text-white/75 hover:bg-white/10 hover:text-white" aria-label="Start a new conversation" title="New conversation">
                <RotateCcw size={16} />
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl p-2 text-white/75 hover:bg-white/10 hover:text-white" aria-label="Close chat">
              <X size={18} />
            </button>
          </header>

          <div ref={list} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            <Bubble role="assistant">{greeting}</Bubble>
            {turns.length === 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-brass/40 bg-white px-3 py-1.5 text-xs font-medium text-brass-dark transition-colors hover:bg-brass hover:text-white">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className="space-y-2">
                <Bubble role={t.role}>{t.content}</Bubble>
                {t.role === 'assistant' && t.meta && renderExtra?.(t.meta, turns.slice(0, i), send)}
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-muted">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sand text-brass-dark"><Bot size={14} /></span>
                <span className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brass [animation-delay:-0.2s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brass [animation-delay:-0.1s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brass" />
                </span>
              </div>
            )}
          </div>

          <form
            className="border-t border-stone/60 bg-white p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <div className="flex items-end gap-2 rounded-2xl border border-stone bg-ivory px-3 py-2 focus-within:border-brass focus-within:ring-2 focus-within:ring-brass/20">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={1}
                maxLength={1500}
                placeholder="Type your question…"
                className="max-h-28 min-h-[1.5rem] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted/70"
                aria-label="Message"
              />
              <button type="submit" disabled={busy || !input.trim()} className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-brass text-white transition-opacity disabled:opacity-40" aria-label="Send">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
            {footer && <div className="mt-2 text-center text-[0.68rem] text-muted">{footer}</div>}
          </form>
        </div>
      )}
    </>
  );
}

/** Replies may use **bold**; show it as bold instead of asterisks (nothing else is interpreted). */
function rich(text: ReactNode): ReactNode {
  if (typeof text !== 'string') return text;
  return text
    .replace(/^#{1,4}\s+/gm, '')
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) => (part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
}

function Bubble({ role, children }: { role: 'user' | 'assistant'; children: ReactNode }) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-gradient-to-br from-brass to-brass-dark px-3.5 py-2.5 text-sm text-white shadow-sm">{children}</p>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-sand text-brass-dark"><Bot size={14} /></span>
      <p className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-sm leading-relaxed text-ink shadow-sm ring-1 ring-stone/60">{rich(children)}</p>
    </div>
  );
}
