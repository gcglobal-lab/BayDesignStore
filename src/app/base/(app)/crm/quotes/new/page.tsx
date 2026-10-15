import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, PageHeader } from '@/components/base/ui';
import QuoteEditor from '@/components/crm/QuoteEditor';
import { requireCrm } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { getCrmSetup, quoteEditorOptions } from '@/lib/crm/data';

export const metadata: Metadata = { title: 'New quote' };

export default async function NewQuotePage({ searchParams }: PageProps<'/base/crm/quotes/new'>) {
  await requireCrm();
  const sp = await searchParams;
  const dealId = typeof sp.deal === 'string' && /^[0-9a-f-]{36}$/.test(sp.deal) ? sp.deal : undefined;
  const contactId = typeof sp.contact === 'string' && /^[0-9a-f-]{36}$/.test(sp.contact) ? sp.contact : undefined;
  const [opts, { settings }, deal] = await Promise.all([
    quoteEditorOptions(),
    getCrmSetup(),
    dealId ? db().from('crm_deals').select('title, contact_id').eq('id', dealId).maybeSingle().then((r) => r.data) : Promise.resolve(null),
  ]);
  return (
    <>
      <Link href={dealId ? `/base/crm/deals/${dealId}` : '/base/crm/quotes'} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} /> Back</Link>
      <PageHeader plain title="New quote" />
      <Card>
        <QuoteEditor {...opts} defaults={{ deal_id: dealId, contact_id: contactId ?? deal?.contact_id ?? undefined, title: deal?.title, terms: settings.quote_terms }} />
      </Card>
    </>
  );
}
