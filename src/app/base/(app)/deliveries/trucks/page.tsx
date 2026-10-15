import type { Metadata } from 'next';
import Link from 'next/link';
import { Pencil, Plus, Trash2, Truck as TruckIcon, Users } from 'lucide-react';
import { Dialog } from '@/components/base/Dialog';
import { SubmitButton } from '@/components/base/forms';
import { Avatar, Card, EmptyState, PageHeader } from '@/components/base/ui';
import { TruckForm } from '@/components/deliveries/Forms';
import { requireDeliveries } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { listEmployees } from '@/lib/base/queries';
import { fullName } from '@/lib/base/types';
import { deliveriesRoleLabel } from '@/lib/portal/apps';
import type { Truck } from '@/lib/deliveries/types';
import { deleteTruck } from './actions';

export const metadata: Metadata = { title: 'Trucks & crews' };

export default async function TrucksPage() {
  const viewer = await requireDeliveries({ dispatcher: true });
  const [trucks, people] = await Promise.all([db().from('dl_trucks').select('*').order('name').then((r) => must<Truck[]>(r, 'load trucks')), listEmployees()]);
  const crew = people.filter((e) => e.deliveries_role !== 'none' || e.access_level === 'admin');

  return (
    <>
      <PageHeader
        plain
        title="Trucks & crews"
        description="Your fleet (capacity drives auto-planning and the calendar) and who can drive or dispatch."
        actions={
          <Dialog trigger={<><Plus size={15} /> Add truck</>} triggerClassName="b-btn-brass" title="New truck">
            <TruckForm />
          </Dialog>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card title="Trucks" pad={false}>
          {trucks.length === 0 ? (
            <EmptyState icon={<TruckIcon size={20} />} title="No trucks yet.">Add each truck or van that goes out on deliveries.</EmptyState>
          ) : (
            <ul className="divide-y divide-stone/50">
              {trucks.map((t) => (
                <li key={t.id} className={`flex items-center gap-4 px-5 py-3.5 ${t.active ? '' : 'opacity-50'}`}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: t.color }}><TruckIcon size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{t.name} {!t.active && <span className="b-badge-gray ml-1">Out of service</span>}</p>
                    <p className="text-xs text-muted">{t.plate ? `${t.plate} · ` : ''}{t.capacity_stops} stops a day{t.notes ? ` · ${t.notes}` : ''}</p>
                  </div>
                  <Dialog trigger={<Pencil size={14} />} triggerClassName="b-btn-quiet b-btn-sm" title={`Edit ${t.name}`}>
                    <TruckForm truck={t} />
                  </Dialog>
                  <form action={deleteTruck}>
                    <input type="hidden" name="id" value={t.id} />
                    <SubmitButton className="b-btn-quiet b-btn-sm" confirm={`Remove ${t.name}? Past routes keep their history.`}><Trash2 size={14} /></SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Crew" actions={viewer.level === 'admin' ? <Link href="/base/settings?section=apps" className="text-xs font-semibold text-brass-dark">Manage access →</Link> : undefined} pad={false}>
          {crew.length === 0 ? (
            <EmptyState icon={<Users size={20} />} title="Nobody has Deliveries access yet." />
          ) : (
            <ul className="divide-y divide-stone/50">
              {crew.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-5 py-2.5">
                  <Avatar name={fullName(e)} size="sm" />
                  <span className="flex-1 text-sm font-medium">{fullName(e)}</span>
                  <span className="b-badge-gray">{e.access_level === 'admin' ? 'Admin' : deliveriesRoleLabel[e.deliveries_role]}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-stone/50 px-5 py-3 text-xs text-muted">Admins give Driver or Dispatcher access in Time ▸ Settings ▸ App access, or on a team member’s page.</p>
        </Card>
      </div>
    </>
  );
}
