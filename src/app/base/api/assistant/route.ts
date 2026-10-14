import { z } from 'zod';
import { BASE_GUIDE } from '@/lib/ai/knowledge';
import { allow } from '@/lib/ai/limit';
import { chat } from '@/lib/ai/llm';
import { getViewer, isManager } from '@/lib/base/auth';
import { listEmployees } from '@/lib/base/queries';
import { fullName, type Employee } from '@/lib/base/types';

/**
 * The Bay Design Base assistant. Answers how-to questions from the guide. For passwords it
 * never changes anything itself: it returns a proposed action that the signed-in person
 * confirms in the chat (admins only for setting/showing passwords; everyone can ask the
 * admin for help).
 */
const body = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(1500) }))
    .min(1)
    .max(20),
});

type Action =
  | { type: 'set_password'; employeeId: string; name: string; login: string }
  | { type: 'show_password'; employeeId: string; name: string; login: string }
  | { type: 'password_help' };

const ACTION_TAG = /\[\[\s*ACTION\s*(\{[\s\S]*?\})\s*\]\]/i;
/** Password actions only make sense when the question is about signing in. */
const ABOUT_PASSWORDS = /pass\s?word|passcode|log ?in|sign ?in|locked out|credential/i;
const STOP_WORDS = new Set(['how', 'the', 'and', 'can', 'what', 'where', 'does', 'for', 'you', 'my', 'do', 'is', 'to', 'a', 'i']);

/** When no model answers: the guide lines that share the most words with the question. */
function guideAnswer(question: string): string | null {
  const words = (question.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !STOP_WORDS.has(w));
  if (!words.length) return null;
  const scored = BASE_GUIDE.split('\n')
    .filter((l) => l.startsWith('- '))
    .map((l) => ({ l, score: words.filter((w) => l.toLowerCase().includes(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return scored.length ? `Here’s what the guide says:\n${scored.map((x) => x.l.replace(/^- /, '• ')).join('\n')}` : null;
}

/** The roster member a message or a model's action refers to (login ID or full / first name). */
function findPerson(text: string, people: Employee[]): Employee | null {
  const t = text.toLowerCase();
  return (
    people.find((e) => t.includes(e.login_id.toLowerCase())) ??
    people.find((e) => t.includes(fullName(e).toLowerCase())) ??
    (() => {
      const byFirst = people.filter((e) => new RegExp(`\\b${e.first_name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t));
      return byFirst.length === 1 ? byFirst[0] : null;
    })()
  );
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: 'Not signed in.' }, { status: 401 });
  if (!allow(`assistant:${viewer.id}`, 20, 60_000)) return Response.json({ reply: 'Too many messages at once — wait a few seconds and try again.' }, { status: 429 });

  let parsed;
  try {
    parsed = body.safeParse(await request.json());
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (!parsed.success) return Response.json({ error: 'Invalid request.' }, { status: 400 });
  const history = parsed.data.messages.slice(-10);
  const last = history[history.length - 1].content;

  const admin = viewer.level === 'admin';
  const people = isManager(viewer) ? (await listEmployees()).filter((e) => e.id !== viewer.employeeId) : [];
  const roster = admin ? `\nTEAM (login IDs, for password actions):\n${people.map((e) => `- ${fullName(e)} — ${e.login_id}${e.has_password ? '' : ' (no password yet)'}`).join('\n')}\n` : '';

  const system = `You are the help assistant inside Bay Design Base, the team scheduling and time-clock app of Bay Design Store (Naples, FL).
The person chatting is ${viewer.name}, signed in as ${viewer.level === 'admin' ? 'an ADMIN' : viewer.level === 'manager' ? 'a MANAGER' : 'an EMPLOYEE'}.
Answer with short, numbered steps using the exact menu names from the guide. Be friendly and brief. If something isn't in the guide, say so and suggest asking a manager.

Password actions — add ONE tag on its own line at the end of your reply when it applies:
${admin
  ? `- The admin asks to set / reset / change / generate a password for someone → [[ACTION {"type":"set_password","login":"<their login ID>"}]]
- The admin asks what someone's password or login is → [[ACTION {"type":"show_password","login":"<their login ID>"}]]
Say you've prepared it and they just need to confirm below. Never write a password yourself.`
  : `- The person forgot their password, can't sign in on another device, or wants it changed → explain that only the admin sets passwords, then add [[ACTION {"type":"password_help"}]] so they can send the admin a request.
You cannot see or change anyone's password.`}
${roster}
${BASE_GUIDE}`;

  const result = await chat([{ role: 'system', content: system }, ...history], { maxTokens: 900, budgetMs: 30_000 });
  let reply = result.ok ? result.text : '';
  let action: Action | null = null;

  // 1) The model's own action tag (ignored unless the question is about passwords).
  const tag = reply.match(ACTION_TAG);
  if (tag) reply = reply.replace(ACTION_TAG, '').trim();
  if (tag && ABOUT_PASSWORDS.test(last)) {
    try {
      const raw = JSON.parse(tag[1]) as { type?: string; login?: string };
      if (raw.type === 'password_help') action = { type: 'password_help' };
      else if (admin && (raw.type === 'set_password' || raw.type === 'show_password')) {
        const person = findPerson(`${raw.login ?? ''} ${last}`, people);
        if (person) action = { type: raw.type, employeeId: person.id, name: fullName(person), login: person.login_id };
      }
    } catch {
      // Storage or parsing can fail (private mode); nothing to do.
    }
  }
  // 2) Plain-language fallback, in case the model didn't tag it (or no model answered).
  if (!action && ABOUT_PASSWORDS.test(last)) {
    if (admin) {
      const person = findPerson(last, people);
      if (person) action = { type: /what|show|see|tell|look ?up/i.test(last) && !/reset|change|new|set|generate/i.test(last) ? 'show_password' : 'set_password', employeeId: person.id, name: fullName(person), login: person.login_id };
    } else if (/forg|reset|change|new|lost|can.?t|locked|help/i.test(last)) {
      action = { type: 'password_help' };
    }
  }

  if (!reply) {
    reply = action
      ? action.type === 'password_help'
        ? 'Only the admin can set passwords. Send them a request below and they’ll give you a new one.'
        : `I’ve prepared that for ${action.name} — confirm below.`
      : (guideAnswer(last) ?? 'The assistant is busy right now. Most answers are in the menu: Home, Team, Shifts, Timesheets, Reports and Settings. Please try again in a moment.');
  }
  return Response.json({ reply, action });
}

/** AI replies and large reports can take a while; give them up to a minute (Vercel). */
export const maxDuration = 60;
