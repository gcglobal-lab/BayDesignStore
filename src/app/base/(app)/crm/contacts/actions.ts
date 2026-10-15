'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { requireCrm } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { canEditRecord, logCrm } from '@/lib/crm/data';

const optText = (max: number) => z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable().catch(null);
const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'That email doesn’t look right.');

const contactSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required.').max(80),
  last_name: z.string().trim().max(80).catch(''),
  email,
  phone: optText(40),
  title: optText(120),
  company_id: z.string().uuid().nullable().catch(null),
  lifecycle: z.enum(['lead', 'prospect', 'customer', 'past_customer', 'designer', 'vendor', 'other']).catch('lead'),
  source: optText(80),
  owner_id: z.string().uuid().nullable().catch(null),
  address1: optText(200),
  address2: optText(200),
  city: optText(80),
  state: optText(40),
  postal_code: optText(20),
  tags: z.string().max(400).transform((s) => [...new Set(s.split(',').map((t) => t.trim()).filter(Boolean))].slice(0, 12)).catch([]),
  notes: optText(5000),
  do_not_contact: z.boolean(),
});

const read = (fd: FormData) =>
  contactSchema.safeParse({
    ...Object.fromEntries(['first_name', 'last_name', 'email', 'phone', 'title', 'lifecycle', 'source', 'address1', 'address2', 'city', 'state', 'postal_code', 'tags', 'notes'].map((k) => [k, fd.get(k) ?? ''])),
    company_id: fd.get('company_id') || null,
    owner_id: fd.get('owner_id') || null,
    do_not_contact: fd.get('do_not_contact') === 'on',
  });

const refresh = () => revalidatePath('/base', 'layout');

export async function createContact(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireCrm();
  const parsed = read(fd);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check the contact.');
  const v = parsed.data;
  if (v.email) {
    const { data: dupe } = await db().from('crm_contacts').select('id, first_name, last_name').ilike('email', v.email).limit(1).maybeSingle();
    if (dupe) return fail(`${dupe.first_name} ${dupe.last_name} already has that email — open their contact instead.`);
  }
  const { data, error } = await db()
    .from('crm_contacts')
    .insert({ ...v, owner_id: v.owner_id ?? viewer.employeeId, created_by: viewer.employeeId })
    .select('id')
    .single();
  if (error || !data) return fail('Couldn’t save the contact.');
  await logCrm(viewer, `added the contact ${v.first_name} ${v.last_name}`.trim(), { contact_id: data.id, company_id: v.company_id }, 'crm.contact_create');
  refresh();
  redirect(`/base/crm/contacts/${data.id}`);
}

export async function updateContact(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireCrm();
  const id = z.string().uuid().safeParse(fd.get('id'));
  const parsed = read(fd);
  if (!id.success) return fail('Contact not found.');
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check the contact.');
  const { data: before } = await db().from('crm_contacts').select('owner_id, lifecycle').eq('id', id.data).maybeSingle();
  if (!before) return fail('Contact not found.');
  if (!canEditRecord(viewer, before.owner_id)) return fail('Only the owner or a Workflow manager can edit this contact.');
  const v = parsed.data;
  const { error } = await db()
    .from('crm_contacts')
    .update({ ...v, owner_id: viewer.crm === 'manager' || !before.owner_id ? v.owner_id : before.owner_id })
    .eq('id', id.data);
  if (error) return fail('Couldn’t save the contact.');
  await logCrm(viewer, before.lifecycle !== v.lifecycle ? `changed the stage to ${v.lifecycle.replace('_', ' ')}` : 'updated the contact details', { contact_id: id.data }, 'crm.contact_update');
  refresh();
  return done('Contact saved.');
}

export async function deleteContact(fd: FormData) {
  const viewer = await requireCrm({ manager: true });
  const id = z.string().uuid().safeParse(fd.get('id'));
  if (!id.success) return;
  const { data } = await db().from('crm_contacts').select('first_name, last_name').eq('id', id.data).maybeSingle();
  if (!data) return;
  await db().from('crm_contacts').delete().eq('id', id.data);
  await logCrm(viewer, `deleted the contact ${data.first_name} ${data.last_name}`.trim(), {}, 'crm.contact_delete');
  refresh();
  redirect('/base/crm/contacts');
}

/** Splits one CSV line, honouring "quoted, values". */
function csvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const HEADER_ALIASES: Record<string, string> = {
  'first name': 'first_name', first: 'first_name', firstname: 'first_name',
  'last name': 'last_name', last: 'last_name', lastname: 'last_name', surname: 'last_name',
  name: 'name', 'full name': 'name',
  email: 'email', 'e-mail': 'email', 'email address': 'email',
  phone: 'phone', mobile: 'phone', 'phone number': 'phone', cell: 'phone',
  company: 'company', organization: 'company', 'company name': 'company',
  title: 'title', 'job title': 'title',
  address: 'address1', street: 'address1', address1: 'address1',
  city: 'city', state: 'state', zip: 'postal_code', 'zip code': 'postal_code', postcode: 'postal_code', 'postal code': 'postal_code',
  source: 'source', tags: 'tags', notes: 'notes', stage: 'lifecycle', lifecycle: 'lifecycle',
};

/**
 * Bulk import from a CSV export (Excel, Google Contacts, another CRM). Matches common column
 * names, skips rows whose email already exists, and creates companies by name.
 */
export async function importContacts(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireCrm();
  const file = fd.get('file');
  const pasted = String(fd.get('csv') ?? '');
  const text = file instanceof File && file.size > 0 ? (file.size > 2_000_000 ? '' : await file.text()) : pasted;
  if (!text.trim()) return fail('Choose a CSV file (up to 2 MB) or paste the rows.');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return fail('The CSV needs a header row and at least one contact.');
  const headers = csvLine(lines[0]).map((h) => HEADER_ALIASES[h.toLowerCase()] ?? '');
  if (!headers.includes('first_name') && !headers.includes('name')) return fail('Couldn’t find a “First name” or “Name” column.');
  const lifecycle = (fd.get('lifecycle') as string) || 'lead';

  const { data: existing } = await db().from('crm_contacts').select('email').not('email', 'is', null).limit(20000);
  const seen = new Set((existing ?? []).map((r) => (r.email as string).toLowerCase()));
  const companyIds = new Map<string, string>();
  let added = 0;
  let skipped = 0;
  const rows: Record<string, unknown>[] = [];
  for (const line of lines.slice(1, 5001)) {
    const cells = csvLine(line);
    const r: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h && cells[i]) r[h] = cells[i];
    });
    if (r.name && !r.first_name) [r.first_name, r.last_name] = [r.name.split(/\s+/)[0], r.name.split(/\s+/).slice(1).join(' ')];
    const mail = r.email?.toLowerCase();
    if (!r.first_name || (mail && (seen.has(mail) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)))) {
      skipped++;
      continue;
    }
    if (mail) seen.add(mail);
    let companyId: string | null = null;
    if (r.company) {
      const key = r.company.toLowerCase();
      if (!companyIds.has(key)) {
        const { data: co } = await db().from('crm_companies').select('id').ilike('name', r.company).limit(1).maybeSingle();
        companyIds.set(key, co?.id ?? (await db().from('crm_companies').insert({ name: r.company.slice(0, 160), owner_id: viewer.employeeId, created_by: viewer.employeeId }).select('id').single()).data?.id ?? '');
      }
      companyId = companyIds.get(key) || null;
    }
    const lc = ['lead', 'prospect', 'customer', 'past_customer', 'designer', 'vendor', 'other'].includes(r.lifecycle?.toLowerCase().replace(' ', '_')) ? r.lifecycle.toLowerCase().replace(' ', '_') : lifecycle;
    rows.push({
      first_name: r.first_name.slice(0, 80),
      last_name: (r.last_name ?? '').slice(0, 80),
      email: mail ?? null,
      phone: r.phone?.slice(0, 40) ?? null,
      title: r.title?.slice(0, 120) ?? null,
      company_id: companyId,
      address1: r.address1?.slice(0, 200) ?? null,
      city: r.city?.slice(0, 80) ?? null,
      state: r.state?.slice(0, 40) ?? null,
      postal_code: r.postal_code?.slice(0, 20) ?? null,
      source: (r.source ?? 'Import').slice(0, 80),
      tags: r.tags ? r.tags.split(/[;,]/).map((t) => t.trim()).filter(Boolean).slice(0, 12) : [],
      notes: r.notes?.slice(0, 5000) ?? null,
      lifecycle: lc,
      owner_id: viewer.employeeId,
      created_by: viewer.employeeId,
    });
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error, count } = await db().from('crm_contacts').insert(rows.slice(i, i + 500), { count: 'exact' });
    if (error) return fail(`Imported ${added} contacts, then stopped: ${error.message.slice(0, 120)}`);
    added += count ?? 0;
  }
  await audit(viewer, 'crm.contact_import', 'crm_contacts', null, { text: `imported ${added} contacts from CSV` });
  refresh();
  return done(`Imported ${added} contact${added === 1 ? '' : 's'}${skipped ? ` · skipped ${skipped} (duplicate email or no name)` : ''}.`);
}
