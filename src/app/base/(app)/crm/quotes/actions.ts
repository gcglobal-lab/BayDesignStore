'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { requireCrm } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { runAutomations } from '@/lib/crm/automations';
import { canEditRecord, getCrmSetup, logCrm } from '@/lib/crm/data';
import { money, quoteStatusLabel, quoteTotals } from '@/lib/crm/types';

const itemSchema = z.object({
  product_id: z.string().uuid().nullable().catch(null),
  description: z.string().trim().min(1).max(300),
  quantity: z.coerce.number().positive().max(100_000),
  unit_price: z.coerce.number().min(0).max(9_999_999),
  discount_pct: z.coerce.number().min(0).max(100).catch(0),
});
const quoteSchema = z.object({
  title: z.string().trim().min(1, 'Give the quote a title.').max(160),
  deal_id: z.string().uuid().nullable().catch(null),
  contact_id: z.string().uuid().nullable().catch(null),
  company_id: z.string().uuid().nullable().catch(null),
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
  discount_pct: z.coerce.number().min(0).max(100).catch(0),
  tax_pct: z.coerce.number().min(0).max(30).catch(0),
  delivery_fee: z.coerce.number().min(0).max(999_999).catch(0),
  notes: z.string().trim().max(5000).transform((v) => v || null),
  terms: z.string().trim().max(5000).transform((v) => v || null),
  items: z.array(itemSchema).max(200),
});

function parse(fd: FormData) {
  let items: unknown = [];
  try {
    items = JSON.parse(String(fd.get('items') ?? '[]'));
  } catch {
    items = [];
  }
  return quoteSchema.safeParse({
    title: fd.get('title'),
    deal_id: fd.get('deal_id') || null,
    contact_id: fd.get('contact_id') || null,
    company_id: fd.get('company_id') || null,
    valid_until: fd.get('valid_until') || null,
    discount_pct: fd.get('discount_pct') || 0,
    tax_pct: fd.get('tax_pct') || 0,
    delivery_fee: fd.get('delivery_fee') || 0,
    notes: fd.get('notes') ?? '',
    terms: fd.get('terms') ?? '',
    items,
  });
}

async function writeItems(quoteId: string, items: z.infer<typeof itemSchema>[]) {
  await db().from('crm_quote_items').delete().eq('quote_id', quoteId);
  if (items.length) await db().from('crm_quote_items').insert(items.map((it, i) => ({ ...it, quote_id: quoteId, position: i })));
}

/** Creates or saves a quote with its lines. */
export async function saveQuote(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireCrm();
  const parsed = parse(fd);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check the quote — every line needs a description, quantity and price.');
  const { items, ...q } = parsed.data;
  // Fill the contact / company from the deal when they weren't chosen.
  if (q.deal_id && (!q.contact_id || !q.company_id)) {
    const { data: deal } = await db().from('crm_deals').select('contact_id, company_id').eq('id', q.deal_id).maybeSingle();
    q.contact_id ??= deal?.contact_id ?? null;
    q.company_id ??= deal?.company_id ?? null;
  }
  const id = fd.get('id');
  const total = quoteTotals(items, q).total;
  if (typeof id === 'string' && id) {
    const { data: before } = await db().from('crm_quotes').select('owner_id, number').eq('id', id).maybeSingle();
    if (!before) return fail('Quote not found.');
    if (!canEditRecord(viewer, before.owner_id)) return fail('Only the owner or a Workflow manager can edit this quote.');
    const { error } = await db().from('crm_quotes').update(q).eq('id', id);
    if (error) return fail('Couldn’t save the quote.');
    await writeItems(id, items);
    await logCrm(viewer, `updated quote #${before.number} (${money(total, true)})`, { deal_id: q.deal_id, contact_id: q.contact_id }, 'crm.quote_update');
    revalidatePath('/base', 'layout');
    return done('Quote saved.');
  }
  const { settings } = await getCrmSetup();
  const { data, error } = await db()
    .from('crm_quotes')
    .insert({ ...q, terms: q.terms ?? settings.quote_terms, owner_id: viewer.employeeId, created_by: viewer.employeeId })
    .select('id, number')
    .single();
  if (error || !data) return fail('Couldn’t create the quote.');
  await writeItems(data.id, items);
  await logCrm(viewer, `created quote #${data.number} “${q.title}” (${money(total, true)})`, { deal_id: q.deal_id, contact_id: q.contact_id, company_id: q.company_id }, 'crm.quote_create');
  revalidatePath('/base', 'layout');
  redirect(`/base/crm/quotes/${data.id}`);
}

/** Draft → Sent → Accepted / Declined. Accepting updates the deal's value to the quote total. */
export async function setQuoteStatus(fd: FormData) {
  const viewer = await requireCrm();
  const parsed = z.object({ id: z.string().uuid(), status: z.enum(['draft', 'sent', 'accepted', 'declined', 'expired']) }).safeParse({ id: fd.get('id'), status: fd.get('status') });
  if (!parsed.success) return;
  const { id, status } = parsed.data;
  const { data: quote } = await db().from('crm_quotes').select('*, items:crm_quote_items(quantity, unit_price, discount_pct)').eq('id', id).maybeSingle();
  if (!quote || !canEditRecord(viewer, quote.owner_id)) return;
  const now = new Date().toISOString();
  await db()
    .from('crm_quotes')
    .update({ status, ...(status === 'sent' ? { sent_at: now } : {}), ...(status === 'accepted' || status === 'declined' ? { decided_at: now } : {}) })
    .eq('id', id);
  const total = quoteTotals(
    (quote.items as { quantity: number; unit_price: number; discount_pct: number }[]).map((i) => ({ quantity: Number(i.quantity), unit_price: Number(i.unit_price), discount_pct: Number(i.discount_pct) })),
    { discount_pct: Number(quote.discount_pct), tax_pct: Number(quote.tax_pct), delivery_fee: Number(quote.delivery_fee) },
  ).total;
  await logCrm(viewer, `marked quote #${quote.number} as ${quoteStatusLabel[status].toLowerCase()}${status === 'accepted' ? ` (${money(total, true)})` : ''}`, { deal_id: quote.deal_id, contact_id: quote.contact_id }, 'crm.quote_status');
  if (status === 'accepted') {
    if (quote.deal_id) {
      const { data: deal } = await db().from('crm_deals').select('id, owner_id, contact_id, company_id, tags, status').eq('id', quote.deal_id).maybeSingle();
      if (deal?.status === 'open') await db().from('crm_deals').update({ value: Math.round(total * 100) / 100 }).eq('id', deal.id);
      await runAutomations('quote_accepted', { deal, actorId: viewer.employeeId });
    } else await runAutomations('quote_accepted', { actorId: viewer.employeeId });
  }
  revalidatePath('/base', 'layout');
}

/** Copy a quote (new number, back to draft). */
export async function duplicateQuote(fd: FormData) {
  const viewer = await requireCrm();
  const id = z.string().uuid().safeParse(fd.get('id'));
  if (!id.success) return;
  const { data: q } = await db().from('crm_quotes').select('*, items:crm_quote_items(product_id, description, quantity, unit_price, discount_pct, position)').eq('id', id.data).maybeSingle();
  if (!q) return;
  const { id: _id, number: _n, created_at: _c, updated_at: _u, items, sent_at: _s, decided_at: _d, ...rest } = q;
  void _id; void _n; void _c; void _u; void _s; void _d;
  const { data } = await db().from('crm_quotes').insert({ ...rest, title: `${q.title} (copy)`.slice(0, 160), status: 'draft', owner_id: viewer.employeeId, created_by: viewer.employeeId }).select('id, number').single();
  if (!data) return;
  if ((items as unknown[]).length) await db().from('crm_quote_items').insert((items as Record<string, unknown>[]).map((it) => ({ ...it, quote_id: data.id })));
  await logCrm(viewer, `copied quote #${q.number} to #${data.number}`, { deal_id: q.deal_id, contact_id: q.contact_id }, 'crm.quote_copy');
  revalidatePath('/base', 'layout');
  redirect(`/base/crm/quotes/${data.id}`);
}

export async function deleteQuote(fd: FormData) {
  const viewer = await requireCrm({ manager: true });
  const id = z.string().uuid().safeParse(fd.get('id'));
  if (!id.success) return;
  const { data } = await db().from('crm_quotes').select('number, deal_id').eq('id', id.data).maybeSingle();
  if (!data) return;
  await db().from('crm_quotes').delete().eq('id', id.data);
  await logCrm(viewer, `deleted quote #${data.number}`, { deal_id: data.deal_id }, 'crm.quote_delete');
  revalidatePath('/base', 'layout');
  redirect('/base/crm/quotes');
}
