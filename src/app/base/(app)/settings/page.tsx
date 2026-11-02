import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BadgeDollarSign, LayoutGrid, Truck, Workflow, CalendarClock, Clock3, Info, KeyRound, MapPin, Palmtree, Plus, Tags, Timer } from 'lucide-react';
import { Dialog } from '@/components/base/Dialog';
import PunchMap from '@/components/base/map/PunchMap';
import { BasicInfoPanel, LocationForm, OvertimePanel, PayrollPanel, SchedulePanel, TimeClockPanel, TimeOffPanel } from '@/components/base/SettingsForms';
import { AppAccessTable } from '@/components/portal/AppAccessForm';
import { requireAdmin } from '@/lib/base/auth';
import { storePoints } from '@/lib/base/mapPoints';
import { listEmployees, listLocations } from '@/lib/base/queries';
import { getSettings } from '@/lib/base/settings';
import { fullName } from '@/lib/base/types';

export const metadata: Metadata = { title: 'Settings' };

type SectionKey = 'basic' | 'locations' | 'schedule' | 'clock' | 'overtime' | 'payroll' | 'time-off' | 'team' | 'apps';
const NAV: { group: string; items: { key: SectionKey; label: string; icon: typeof Info }[] }[] = [
  { group: 'Location', items: [{ key: 'basic', label: 'Basic info', icon: Info }, { key: 'locations', label: 'Stores & geofences', icon: MapPin }] },
  { group: 'Scheduling', items: [{ key: 'schedule', label: 'Schedule enforcement', icon: CalendarClock }] },
  { group: 'Time tracking', items: [{ key: 'clock', label: 'Time clock options', icon: Clock3 }, { key: 'overtime', label: 'Overtime', icon: Timer }] },
  { group: 'Payroll', items: [{ key: 'payroll', label: 'Payroll settings', icon: BadgeDollarSign }] },
  { group: 'Team management', items: [{ key: 'time-off', label: 'Time off', icon: Palmtree }, { key: 'team', label: 'Roles & passwords', icon: Tags }, { key: 'apps', label: 'App access', icon: LayoutGrid }] },
];

export default async function SettingsPage({ searchParams }: PageProps<'/base/settings'>) {
  await requireAdmin();
  const sp = await searchParams;
  // Recent activity now has its own page in each app's menu.
  if (sp.section === 'activity') redirect('/base/activity');
  const section: SectionKey = NAV.flatMap((g) => g.items).some((i) => i.key === sp.section) ? (sp.section as SectionKey) : 'basic';
  const settings = await getSettings();

  let panel: ReactNode;
  switch (section) {
    case 'basic':
      panel = <BasicInfoPanel settings={settings} />;
      break;
    case 'locations':
      panel = <LocationsPanel />;
      break;
    case 'schedule':
      panel = <SchedulePanel settings={settings} />;
      break;
    case 'clock':
      panel = <TimeClockPanel settings={settings} />;
      break;
    case 'overtime':
      panel = <OvertimePanel settings={settings} />;
      break;
    case 'payroll':
      panel = <PayrollPanel settings={settings} />;
      break;
    case 'time-off':
      panel = <TimeOffPanel settings={settings} />;
      break;
    case 'team':
      panel = <TeamPanel />;
      break;
    case 'apps':
      panel = <AppAccessPanel />;
      break;
  }

  return (
    <div className="mx-auto max-w-[1200px]">
      <h1 className="mb-6 text-[2rem] font-semibold tracking-tight text-ink">Settings</h1>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="lg:sticky lg:top-6 lg:self-start">
          <div className="flex gap-4 overflow-x-auto pb-2 lg:block lg:space-y-5 lg:overflow-visible lg:pb-0">
            {NAV.map((g) => (
              <div key={g.group} className="flex-none">
                <p className="mb-1.5 px-3 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-ink/80">{g.group}</p>
                <ul className="flex gap-1 lg:block lg:space-y-0.5">
                  {g.items.map((i) => {
                    const on = i.key === section;
                    return (
                      <li key={i.key}>
                        <Link
                          href={`/base/settings?section=${i.key}`}
                          aria-current={on ? 'page' : undefined}
                          className={`flex items-center gap-2.5 whitespace-nowrap rounded-xl px-2.5 py-2 text-sm transition-colors ${on ? 'bg-white font-semibold text-ink shadow-sm ring-1 ring-stone/60' : 'text-ink/80 hover:bg-white/70'}`}
                        >
                          <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-lg ${on ? 'bg-gradient-to-br from-brass to-brass-dark text-white shadow-sm' : 'bg-sand/70 text-muted'}`}><i.icon size={14} /></span>
                          {i.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>
        <div className="min-w-0">{panel}</div>
      </div>
    </div>
  );
}

function PanelShell({ title, description, actions, children }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="b-card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone/50 bg-gradient-to-r from-white to-linen/60 px-5 py-5 sm:px-7">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">{title}</h2>
          {description && <p className="mt-1 max-w-xl text-sm text-muted">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="px-5 py-5 sm:px-7">{children}</div>
    </section>
  );
}

/** Who can open Workflow (CRM) and Deliveries. Time is for everyone; admins have everything. */
async function AppAccessPanel() {
  const people = (await listEmployees()).filter((e) => e.status !== 'terminated');
  const levelRank = { admin: 0, manager: 1, employee: 2 } as const;
  people.sort((a, b) => levelRank[a.access_level] - levelRank[b.access_level] || fullName(a).localeCompare(fullName(b)));
  const others = people.filter((e) => e.access_level !== 'admin');
  return (
    <PanelShell title="App access" description={<>Everyone can use <b>Time</b>. You decide, person by person, who can also open <b>Workflow</b> and <b>Deliveries</b>. Click a button — it saves straight away.</>}>
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-linen/70 px-4 py-3 text-sm">
          <p className="mb-1 flex items-center gap-1.5 font-semibold"><Workflow size={15} /> Workflow — {others.filter((e) => e.crm_role !== 'none').length} people</p>
          <p className="text-xs text-muted"><b>User</b>: works their own leads and deals, sees everyone’s. <b>Manager</b>: also deletes and changes pipelines, automations and settings.</p>
        </div>
        <div className="rounded-2xl bg-linen/70 px-4 py-3 text-sm">
          <p className="mb-1 flex items-center gap-1.5 font-semibold"><Truck size={15} /> Deliveries — {others.filter((e) => e.deliveries_role !== 'none').length} people</p>
          <p className="text-xs text-muted"><b>Driver</b>: sees only their own route on their phone. <b>Dispatcher</b>: orders, dispatch board, trucks and reports.</p>
        </div>
      </div>
      <AppAccessTable
        people={people.map((e) => ({ id: e.id, name: fullName(e), level: e.access_level, role: e.roles[0]?.name ?? null, crm: e.crm_role, deliveries: e.deliveries_role }))}
      />
    </PanelShell>
  );
}

async function LocationsPanel() {
  const locations = await listLocations();
  return (
    <PanelShell
      title="Stores & geofences"
      description="Each store’s address and the circle punch-ins are checked against. Punch-ins outside are still allowed and record the street address."
      actions={
        <Dialog trigger={<><Plus size={14} /> Add a location</>} triggerClassName="b-btn-ghost b-btn-sm" title="Add a location" wide>
          <LocationForm />
        </Dialog>
      }
    >
      {locations.length > 0 && <PunchMap points={[]} stores={storePoints(locations)} height={300} />}
      <div className="mt-6 space-y-8">
        {locations.map((l) => (
          <div key={l.id} className="rounded-2xl border border-stone/60 p-4 sm:p-5">
            <p className="mb-4 flex items-center gap-2 font-semibold">
              <MapPin size={16} className={l.latitude != null ? 'text-emerald-600' : 'text-amber-600'} /> {l.name}
              <span className="text-xs font-normal text-muted">{l.latitude != null ? `Geofence on · ${l.geofence_radius_m} m` : 'No coordinates yet'}</span>
            </p>
            <LocationForm location={l} />
          </div>
        ))}
        {locations.length === 0 && <p className="text-sm text-muted">No locations yet.</p>}
      </div>
    </PanelShell>
  );
}

async function TeamPanel() {
  const employees = await listEmployees();
  const missing = employees.filter((e) => !e.has_password).length;
  return (
    <PanelShell title="Roles & passwords" description="Where to manage the team’s roles and sign-in details.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/base/team/roles" className="group rounded-2xl border border-stone/60 p-5 transition-colors hover:border-violet-300 hover:bg-violet-50/40">
          <Tags size={20} className="text-brass" />
          <p className="mt-3 font-semibold">Departments & roles</p>
          <p className="mt-1 text-sm text-muted">Create roles, choose their colours and which time clock (showroom, designer, warehouse, driver) they get.</p>
        </Link>
        <Link href="/base/team" className="group rounded-2xl border border-stone/60 p-5 transition-colors hover:border-violet-300 hover:bg-violet-50/40">
          <KeyRound size={20} className="text-brass" />
          <p className="mt-3 font-semibold">Passwords</p>
          <p className="mt-1 text-sm text-muted">
            Only admins create and change passwords. Team ▸ Roster shows every login ID and password; click a name to change it.
            {missing > 0 && <span className="mt-2 block font-medium text-amber-700">{missing} team member{missing === 1 ? '' : 's'} have no password yet.</span>}
          </p>
        </Link>
      </div>
    </PanelShell>
  );
}
