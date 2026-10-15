import 'server-only';
import { db } from '@/lib/base/db';
import { CacheKeys, invalidate } from '@/lib/base/memo';
import { runAutomations } from './automations';

/**
 * Every website contact-form / chat inquiry also lands in Workflow ▸ Leads, linked to an
 * existing contact with the same email when there is one. Never throws: the inquiry itself is
 * already saved, so a problem here must not affect the visitor.
 */
export async function leadFromInquiry(inquiry: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  interest: string | null;
  message: string;
  source: 'contact_form' | 'website_chat';
}) {
  try {
    const [{ data: contact }, { data: settings }] = await Promise.all([
      db().from('crm_contacts').select('id, owner_id').ilike('email', inquiry.email).limit(1).maybeSingle(),
      db().from('crm_settings').select('default_owner_id').eq('id', 1).maybeSingle(),
    ]);
    const owner = contact?.owner_id ?? settings?.default_owner_id ?? null;
    const { data: lead, error } = await db()
      .from('crm_leads')
      .insert({
        title: `${inquiry.interest ?? (inquiry.source === 'website_chat' ? 'Chat request' : 'Website inquiry')} — ${inquiry.name}`.slice(0, 160),
        name: inquiry.name,
        email: inquiry.email,
        phone: inquiry.phone,
        message: inquiry.message,
        source: inquiry.source === 'website_chat' ? 'Website chat' : 'Website form',
        owner_id: owner,
        contact_id: contact?.id ?? null,
        inquiry_id: inquiry.id,
      })
      .select('id, owner_id')
      .single();
    if (error || !lead) {
      if (error) console.error('[crm] lead from inquiry failed', error.message);
      return;
    }
    await runAutomations('lead_created', { lead });
    invalidate(CacheKeys.crmBadges);
  } catch (err) {
    console.error('[crm] lead from inquiry failed', err);
  }
}
