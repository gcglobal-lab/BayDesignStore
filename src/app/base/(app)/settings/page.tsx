import type { Metadata } from 'next';
import { MapPin, Plus, ShieldCheck } from 'lucide-react';
import { Dialog } from '@/components/base/Dialog';
import MapEmbed from '@/components/base/MapEmbed';
import { CompanySettingsForm, LocationForm } from '@/components/base/SettingsForms';
import { Card, PageHeader } from '@/components/base/ui';
import { requireAdmin } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { listLocations } from '@/lib/base/queries';
import { getSettings } from '@/lib/base/settings';
import { fmtDate, fmtTime } from '@/lib/base/time';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  await requireAdmin();
  const [settings, locations, auditRes] = await Promise.all([
    getSettings(),
    listLocations(),
    db().from('audit_log').select('id, actor_label, action, entity, created_at, ip').order('created_at', { ascending: false }).limit(40),
  ]);
  const log = must<{ id: number; actor_label: string; action: string; entity: string | null; created_at: string; ip: string | null }[]>(auditRes, 'load the activity log');
  const zone = settings.timezone;

  return (
    <>
      <PageHeader eyebrow="Admin" title="Settings" description="Company details, locations, the time clock and payroll rules." />
      <div className="space-y-6">
        <Card
          title="Locations"
          actions={
            <Dialog trigger={<><Plus size={14} /> Add a new location</>} triggerClassName="b-btn-ghost b-btn-sm" title="Add a location" wide>
              <LocationForm />
            </Dialog>
          }
        >
          <div className="space-y-8">
            {locations.map((l) => (
              <div key={l.id} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                <LocationForm location={l} />
                <div className="space-y-2">
                  {l.latitude != null && l.longitude != null ? (
                    <>
                      <MapEmbed lat={l.latitude} lng={l.longitude} title={`${l.name} map`} />
                      <p className="flex items-center gap-1.5 text-xs text-muted"><MapPin size={12} className="text-emerald-600" /> Geofence on · {l.geofence_radius_m} m radius</p>
                    </>
                  ) : (
                    <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-stone bg-linen/50 p-6 text-center text-sm text-muted">
                      <MapPin size={20} className="text-amber-600" />
                      No coordinates yet — punch-ins are recorded but not checked against this location.
                    </div>
                  )}
                </div>
              </div>
            ))}
            {locations.length === 0 && <p className="text-sm text-muted">No locations yet.</p>}
          </div>
        </Card>

        <Card title="Company & time clock">
          <CompanySettingsForm settings={settings} />
        </Card>

        <Card title={<h2 className="b-h2 flex items-center gap-2"><ShieldCheck size={18} className="text-brass" /> Recent activity</h2>} pad={false}>
          <div className="max-h-[420px] overflow-y-auto">
            <table className="b-table">
              <thead className="sticky top-0 bg-white"><tr><th>When</th><th>Who</th><th>What</th><th>IP</th></tr></thead>
              <tbody>
                {log.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap text-xs text-muted">{fmtDate(new Date(a.created_at), zone, 'MMM d')} · {fmtTime(a.created_at, zone)}</td>
                    <td className="text-sm">{a.actor_label}</td>
                    <td className="font-mono text-xs">{a.action}</td>
                    <td className="font-mono text-xs text-muted">{a.ip ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
