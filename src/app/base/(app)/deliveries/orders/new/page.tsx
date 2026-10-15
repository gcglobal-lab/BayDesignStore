import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, PageHeader } from '@/components/base/ui';
import OrderForm from '@/components/deliveries/OrderForm';
import { requireDeliveries } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { getDlSettings, orderFormOptions } from '@/lib/deliveries/data';
import type { OrderItem } from '@/lib/deliveries/types';

export const metadata: Metadata = { title: 'New delivery' };

/** New order — opened from a won deal or a contact, it fills in the customer and the accepted quote's items. */
export default async function NewOrderPage({ searchParams }: PageProps<'/base/deliveries/orders/new'>) {
  await requireDeliveries({ dispatcher: true });
  const sp = await searchParams;
  const dealId = typeof sp.deal === 'string' && /^[0-9a-f-]{36}$/.test(sp.deal) ? sp.deal : undefined;
  let contactId = typeof sp.contact === 'string' && /^[0-9a-f-]{36}$/.test(sp.contact) ? sp.contact : undefined;
  const date = typeof sp.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : undefined;
  const [opts, settings] = await Promise.all([orderFormOptions(), getDlSettings()]);

  let items: OrderItem[] | undefined;
  if (dealId) {
    const { data: deal } = await db().from('crm_deals').select('contact_id').eq('id', dealId).maybeSingle();
    contactId ??= deal?.contact_id ?? undefined;
    const { data: quote } = await db()
      .from('crm_quotes')
      .select('items:crm_quote_items(description, quantity, position)')
      .eq('deal_id', dealId)
      .in('status', ['accepted', 'sent'])
      .order('status')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const lines = (quote?.items ?? []) as { description: string; quantity: number; position: number }[];
    if (lines.length) items = lines.sort((a, b) => a.position - b.position).map((l) => ({ description: l.description.slice(0, 200), sku: null, quantity: Math.max(1, Math.round(Number(l.quantity))), assembly: false, notes: null }));
  }

  return (
    <>
      <Link href={dealId ? `/base/crm/deals/${dealId}` : '/base/deliveries/orders'} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} /> Back</Link>
      <PageHeader plain title="New delivery order" description={items ? 'Items were copied from the deal’s quote — check them before saving.' : undefined} />
      <Card>
        <OrderForm contacts={opts.contacts} deals={opts.deals} defaults={{ deal_id: dealId ?? null, contact_id: contactId ?? null, scheduled_date: date ?? null, items }} windowHours={settings.window_hours} />
      </Card>
    </>
  );
}
