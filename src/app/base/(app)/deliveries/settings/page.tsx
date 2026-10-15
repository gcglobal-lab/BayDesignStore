import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, PageHeader } from '@/components/base/ui';
import { DlSettingsForm } from '@/components/deliveries/Forms';
import { AppearancePicker } from '@/components/crm/SettingsForms';
import { requireDeliveries } from '@/lib/base/auth';
import { getDlSettings } from '@/lib/deliveries/data';
import { readTheme } from '@/lib/portal/theme';

export const metadata: Metadata = { title: 'Deliveries settings' };

export default async function DeliveriesSettingsPage() {
  const viewer = await requireDeliveries({ dispatcher: true });
  const [settings, theme] = await Promise.all([getDlSettings(), readTheme()]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader plain title="Deliveries settings" />
      <Card title="Warehouse, timing & reasons"><DlSettingsForm settings={settings} /></Card>
      <Card title="Appearance">
        <p className="mb-4 text-sm text-muted">Light or dark for Workflow and Deliveries on this device.</p>
        <AppearancePicker current={theme} />
      </Card>
      {viewer.level === 'admin' && <p className="text-sm text-muted">Who can drive or dispatch is set in <Link href="/base/settings?section=apps" className="font-medium text-brass-dark">Time ▸ Settings ▸ App access</Link>.</p>}
    </div>
  );
}
