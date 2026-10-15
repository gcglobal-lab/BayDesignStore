import { audit } from '@/lib/base/audit';
import { getViewer } from '@/lib/base/auth';
import { csvResponse, toCsv } from '@/lib/base/csv';
import { db } from '@/lib/base/db';
import { isDbConfigured } from '@/lib/base/env';
import { getSettings } from '@/lib/base/settings';
import { toYmd } from '@/lib/base/time';
import { getCrmPeople, getCrmSetup, labelsFor } from '@/lib/crm/data';
import { lifecycleLabel, type Contact, type Deal, type Lead, type Lifecycle } from '@/lib/crm/types';

/** CSV downloads of contacts, deals or leads (anyone with Workflow access). */
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer || viewer.crm === 'none' || !isDbConfigured()) return new Response('Not found', { status: 404 });
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const [{ timezone: zone }, people] = await Promise.all([getSettings(), getCrmPeople()]);
  const today = toYmd(new Date(), zone);
  const day = (iso: string | null) => (iso ? toYmd(new Date(iso), zone) : '');
  const owner = (id: string | null) => (id ? (people.names.get(id) ?? '') : '');

  if (type === 'contacts') {
    let q = db().from('crm_contacts').select('*').order('last_name').limit(50000);
    const stage = url.searchParams.get('stage');
    if (stage && stage in lifecycleLabel) q = q.eq('lifecycle', stage);
    const { data, error } = await q;
    if (error) return new Response('Could not load contacts', { status: 500 });
    const rows = data as Contact[];
    const companies = await labelsFor('crm_companies', rows.map((r) => r.company_id));
    await audit(viewer, 'crm.export', 'crm_contacts', null, { text: `exported ${rows.length} contacts` });
    return csvResponse(
      `workflow-contacts-${today}.csv`,
      toCsv([
        ['First name', 'Last name', 'Email', 'Phone', 'Company', 'Title', 'Stage', 'Source', 'Owner', 'Address', 'City', 'State', 'Zip', 'Tags', 'Do not contact', 'Last activity', 'Added'],
        ...rows.map((c) => [c.first_name, c.last_name, c.email, c.phone, c.company_id ? companies.get(c.company_id) : '', c.title, lifecycleLabel[c.lifecycle as Lifecycle], c.source, owner(c.owner_id), [c.address1, c.address2].filter(Boolean).join(', '), c.city, c.state, c.postal_code, c.tags.join('; '), c.do_not_contact ? 'yes' : '', day(c.last_activity_at), day(c.created_at)]),
      ]),
    );
  }

  if (type === 'leads') {
    const { data, error } = await db().from('crm_leads').select('*').order('created_at', { ascending: false }).limit(50000);
    if (error) return new Response('Could not load leads', { status: 500 });
    const rows = data as Lead[];
    await audit(viewer, 'crm.export', 'crm_leads', null, { text: `exported ${rows.length} leads` });
    return csvResponse(
      `workflow-leads-${today}.csv`,
      toCsv([['Received', 'Name', 'Email', 'Phone', 'Company', 'Title', 'Source', 'Status', 'Estimated value', 'Owner', 'Message'], ...rows.map((l) => [day(l.created_at), l.name, l.email, l.phone, l.company_name, l.title, l.source, l.status, l.estimated_value, owner(l.owner_id), l.message])]),
    );
  }

  // Deals
  const { pipelines } = await getCrmSetup();
  const stages = new Map(pipelines.flatMap((p) => p.stages.map((s) => [s.id, s] as const)));
  const pipeName = new Map(pipelines.map((p) => [p.id, p.name]));
  let q = db().from('crm_deals').select('*').order('created_at', { ascending: false }).limit(50000);
  const pipeline = url.searchParams.get('pipeline');
  if (pipeline && /^[0-9a-f-]{36}$/.test(pipeline)) q = q.eq('pipeline_id', pipeline);
  const { data, error } = await q;
  if (error) return new Response('Could not load deals', { status: 500 });
  const rows = data as Deal[];
  const [contacts, companies] = await Promise.all([labelsFor('crm_contacts', rows.map((r) => r.contact_id)), labelsFor('crm_companies', rows.map((r) => r.company_id))]);
  await audit(viewer, 'crm.export', 'crm_deals', null, { text: `exported ${rows.length} deals` });
  return csvResponse(
    `workflow-deals-${today}.csv`,
    toCsv([
      ['Deal', 'Pipeline', 'Stage', 'Status', 'Value', 'Probability %', 'Contact', 'Company', 'Owner', 'Source', 'Priority', 'Tags', 'Expected close', 'Lost reason', 'Created', 'Closed'],
      ...rows.map((d) => [d.title, pipeName.get(d.pipeline_id), stages.get(d.stage_id)?.name, d.status, Number(d.value), stages.get(d.stage_id)?.probability, d.contact_id ? contacts.get(d.contact_id) : '', d.company_id ? companies.get(d.company_id) : '', owner(d.owner_id), d.source, d.priority, d.tags.join('; '), d.expected_close, d.lost_reason, day(d.created_at), day(d.closed_at)]),
    ]),
  );
}
