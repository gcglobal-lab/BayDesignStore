import { z } from 'zod';
import { companyInfo } from '@/data/siteData';
import { STORE_SYSTEM_PROMPT, storeKnowledge } from '@/lib/ai/knowledge';
import { allow } from '@/lib/ai/limit';
import { chat } from '@/lib/ai/llm';
import { clientIp } from '@/lib/base/request';

/** The website chat assistant: answers store questions and offers to pass requests to the team. */
const body = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(1500) }))
    .min(1)
    .max(20),
});

const INQUIRY_TAG = /\[\[\s*INQUIRY\s*\]\]/i;
const WANTS_CONTACT = /\b(appointment|book|consult|quote|price|cost|call me|contact me|email me|reach me|visit|designer|measure|estimate|order|available|in stock)\b/i;

/** Answers for the most common questions when no AI model is reachable. */
function offlineAnswer(question: string): string {
  const c = companyInfo;
  const q = question.toLowerCase();
  if (/hour|open|close|today|sunday|saturday|weekend/.test(q)) return `Downtown showroom (${c.address}): ${c.hoursDowntown}.\nWarehouse & North Naples showroom (${c.warehouseAddress}): ${c.hoursWarehouse}.`;
  if (/where|address|locat|direction|parking|map/.test(q)) return `We have two locations in Naples, FL:\n• Downtown showroom — ${c.address} · ${c.phone}\n• Warehouse & North Naples showroom — ${c.warehouseAddress} · ${c.warehousePhone}`;
  if (/phone|call|number|email|contact/.test(q)) return `Call the Downtown showroom at ${c.phone}, the warehouse at ${c.warehousePhone}, or email ${c.email}. I can also send your message to the team right here.`;
  if (/deliver|install/.test(q)) return 'Our white-glove team delivers and installs with care — same-day delivery is often available for in-stock pieces in the Naples area. A team member can confirm timing for your order.';
  if (/design|instant|consult/.test(q)) return 'We offer the complimentary Instant Design Program (a designer furnishes a room from our in-stock collection) and full-service interior design. Leave your details and a designer will reach out.';
  return `Thanks for your message! I can help with our locations, hours, services and design consultations. For anything else, call ${c.phone} or send your question to our team below.`;
}

export async function POST(request: Request) {
  const ip = (await clientIp()) ?? 'unknown';
  if (!allow(`chat:min:${ip}`, 12, 60_000) || !allow(`chat:day:${ip}`, 200, 86_400_000)) {
    return Response.json({ reply: `You’re sending messages quickly — please wait a moment. You can also call us at ${companyInfo.phone}.`, inquiry: false }, { status: 429 });
  }
  let parsed;
  try {
    parsed = body.safeParse(await request.json());
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (!parsed.success) return Response.json({ error: 'Invalid request.' }, { status: 400 });
  const history = parsed.data.messages.slice(-10);
  const last = history[history.length - 1].content;

  const result = await chat([{ role: 'system', content: STORE_SYSTEM_PROMPT + storeKnowledge() }, ...history], { maxTokens: 900, budgetMs: 30_000 });
  if (!result.ok) {
    return Response.json({ reply: offlineAnswer(last), inquiry: WANTS_CONTACT.test(last), offline: true });
  }
  const inquiry = INQUIRY_TAG.test(result.text) || WANTS_CONTACT.test(last);
  return Response.json({ reply: result.text.replace(/\[\[\s*INQUIRY\s*\]\]/gi, '').trim(), inquiry, model: result.model });
}

/** AI replies and large reports can take a while; give them up to a minute (Vercel). */
export const maxDuration = 60;
