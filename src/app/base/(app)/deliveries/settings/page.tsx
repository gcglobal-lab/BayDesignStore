import type { Metadata } from 'next';
import Link from 'next/link';
import { Palette, Truck, Users } from 'lucide-react';
import { Card } from '@/components/base/ui';
import { DlSettingsForm } from '@/components/deliveries/Forms';
import { AppearancePicker } from '@/components/crm/SettingsForms';
import SettingsLayout from '@/components/ui/SettingsLayout';
import { requireDeliveries } from '@/lib/base/auth';
import { getDlSettings } from '@/lib/deliveries/data';
import { readTheme } from '@/lib/portal/theme';

export const metadata: Metadata = { title: 'Deliveries settings' };

export default async function DeliveriesSettingsPage({ searchParams }: PageProps<'/base/deliveries/settings'>) {
  const viewer = await requireDeliveries({ dispatcher: true });
  const sp = await searchParams;
  const [settings, theme] = await Promise.all([getDlSettings(), readTheme()]);
  const sections = [
    { key: 'routing', label: 'Warehouse & routing', description: 'Start point, times, speed and failure reasons', icon: <Truck size={18} />, tone: '#1264A3' },
    { key: 'appearance', label: 'Appearance', description: 'Light, dark or match your device', icon: <Palette size={18} />, tone: '#4A154B' },
    { key: 'crew', label: 'Drivers & dispatchers', description: 'Who can drive or run deliveries', icon: <Users size={18} />, tone: '#007A5A' },
  ];
  const section = sections.find((s) => s.key === sp.section)?.key ?? 'routing';
  return (
    <SettingsLayout title="Deliveries settings" subtitle="How routes are planned and what customers and drivers see." base="/base/deliveries/settings" sections={sections} active={section}>
      {section === 'routing' && <Card><DlSettingsForm settings={settings} /></Card>}
      {section === 'appearance' && (
        <Card>
          <p className="mb-4 text-sm text-muted">Light or dark for Workflow and Deliveries on this device.</p>
          <AppearancePicker current={theme} />
        </Card>
      )}
      {section === 'crew' && (
        <Card>
          <p className="text-sm text-muted">
            Drivers see only their own route on their phone; dispatchers run orders, the dispatch board, trucks and reports.{' '}
            {viewer.level === 'admin' ? (
              <>Give access in <Link href="/base/settings?section=apps" className="font-medium text-brass-dark">Time ▸ Settings ▸ App access</Link>.</>
            ) : (
              'An admin gives this access in Time ▸ Settings ▸ App access.'
            )}
          </p>
          <Link href="/base/deliveries/trucks" className="b-btn-ghost mt-4">See trucks & crews</Link>
        </Card>
      )}
    </SettingsLayout>
  );
}
