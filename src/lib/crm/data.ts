import 'server-only';
import { cache } from 'react';
import { audit } from '@/lib/base/audit';
import type { Viewer } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { CacheKeys, invalidate, memo } from '@/lib/base/memo';
import { listEmployees } from '@/lib/base/queries';
import { fullName } from '@/lib/base/types';
import type { CrmSettings, Person, Pipeline, Stage } from './types';

const DEFAULT_SETTINGS: CrmSettings = { lead_sources: [], lost_reasons: [], deal_tags: [], default_owner_id: null, quote_terms: '' };

/** Pipelines (with their stages, in order) and Workflow settings. Changes rarely; cached briefly. */
export const getCrmSetup = cache(
  (): Promise<{ pipelines: Pipeline[]; settings: CrmSettings }> =>
    memo(CacheKeys.crmSetup, 30_000, async () => {
      const [p, s, st] = await Promise.all([
        db().from('crm_pipelines').select('id, name, position, is_default').order('position'),
        db().from('crm_stages').select('id, pipeline_id, name, color, probability, rot_days, position').order('position'),
        db().from('crm_settings').select('lead_sources, lost_reasons, deal_tags, default_owner_id, quote_terms').eq('id', 1).maybeSingle(),
      ]);
      const pipelines = must<Omit<Pipeline, 'stages'>[]>(p, 'load pipelines');
      const stages = must<Stage[]>(s, 'load pipeline stages');
      return {
        pipelines: pipelines.map((pl) => ({ ...pl, stages: stages.filter((x) => x.pipeline_id === pl.id) })),
        settings: { ...DEFAULT_SETTINGS, ...(must<CrmSettings | null>(st, 'load Workflow settings') ?? {}) },
      };
    }),
);

export const invalidateCrmSetup = () => invalidate(CacheKeys.crmSetup);

/** Names of everyone on the roster (for showing owners), and who can own Workflow records. */
export const getCrmPeople = cache(async (): Promise<{ owners: Person[]; names: Map<string, string> }> => {
  const all = await listEmployees(true);
  const names = new Map(all.map((e) => [e.id, fullName(e)]));
  const owners = all
    .filter((e) => e.status !== 'terminated' && (e.access_level === 'admin' || e.crm_role !== 'none'))
    .map((e) => ({ id: e.id, name: fullName(e) }));
  return { owners, names };
});

/** Users can change records they own (or nobody owns); Workflow managers and admins can change anything. */
export const canEditRecord = (viewer: Viewer, ownerId: string | null | undefined) =>
  viewer.crm === 'manager' || !ownerId || ownerId === viewer.employeeId;

/** Text safe to put inside a PostgREST `or=(…ilike…)` filter. */
export const searchTerm = (q: unknown) =>
  typeof q === 'string' ? q.replace(/[,()*%\\:"']/g, ' ').trim().slice(0, 80) : '';

type Links = { deal_id?: string | null; contact_id?: string | null; company_id?: string | null; lead_id?: string | null };

/**
 * One line in a record's history ("moved to Negotiation"), shown on its timeline, plus the
 * same sentence in Settings ▸ Recent activity.
 */
export async function logCrm(viewer: Pick<Viewer, 'employeeId' | 'name'>, text: string, links: Links, action = 'crm.update') {
  if (Object.values(links).some(Boolean)) {
    await db()
      .from('crm_activities')
      .insert({ type: 'log', subject: text.slice(0, 200), done: true, done_at: new Date().toISOString(), created_by: viewer.employeeId, author_name: viewer.name, ...links });
  }
  if (links.contact_id) await touchContact(links.contact_id);
  invalidate(CacheKeys.crmBadges);
  await audit(viewer, action, 'crm', links.deal_id ?? links.lead_id ?? links.contact_id ?? links.company_id ?? null, { text });
}

export async function touchContact(contactId: string | null | undefined) {
  if (contactId) await db().from('crm_contacts').update({ last_activity_at: new Date().toISOString() }).eq('id', contactId);
}

/** Up to `limit` records by id → display label, for linking rows to their contact / company. */
export async function labelsFor(table: 'crm_contacts' | 'crm_companies', ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (unique.length === 0) return new Map();
  if (table === 'crm_contacts') {
    const rows = must<{ id: string; first_name: string; last_name: string }[]>(await db().from('crm_contacts').select('id, first_name, last_name').in('id', unique.slice(0, 500)), 'load contacts');
    return new Map(rows.map((r) => [r.id, `${r.first_name} ${r.last_name}`.trim()]));
  }
  const rows = must<{ id: string; name: string }[]>(await db().from('crm_companies').select('id, name').in('id', unique.slice(0, 500)), 'load companies');
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Small option lists for pickers (most recently active first). */
export async function pickerOptions() {
  const [contacts, companies] = await Promise.all([
    db().from('crm_contacts').select('id, first_name, last_name, email, company_id').order('updated_at', { ascending: false }).limit(500),
    db().from('crm_companies').select('id, name').order('name').limit(500),
  ]);
  return {
    contacts: must<{ id: string; first_name: string; last_name: string; email: string | null; company_id: string | null }[]>(contacts, 'load contacts').map((c) => ({
      id: c.id,
      name: `${c.first_name} ${c.last_name}`.trim() + (c.email ? ` · ${c.email}` : ''),
      company_id: c.company_id,
    })),
    companies: must<{ id: string; name: string }[]>(companies, 'load companies'),
  };
}

/** Everything the quote editor's pickers need. */
export async function quoteEditorOptions() {
  const [deals, products, pick] = await Promise.all([
    db().from('crm_deals').select('id, title').order('updated_at', { ascending: false }).limit(300),
    db().from('crm_products').select('*').order('name').limit(1000),
    pickerOptions(),
  ]);
  return {
    deals: must<{ id: string; title: string }[]>(deals, 'load deals').map((d) => ({ id: d.id, name: d.title })),
    products: must<import('./types').Product[]>(products, 'load products').map((p) => ({ ...p, unit_price: Number(p.unit_price), cost: p.cost == null ? null : Number(p.cost) })),
    contacts: pick.contacts,
    companies: pick.companies,
  };
}
