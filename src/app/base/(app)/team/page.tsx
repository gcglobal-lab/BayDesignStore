import type { Metadata } from 'next';
import Link from 'next/link';
import { Download, Plus, Search, UserRound } from 'lucide-react';
import PrintButton from '@/components/base/PrintButton';
import { Avatar, EmptyState, PageHeader } from '@/components/base/ui';
import { requireManager } from '@/lib/base/auth';
import { listEmployees, listLocations } from '@/lib/base/queries';
import { fullName, wageLabel, type Employee } from '@/lib/base/types';

export const metadata: Metadata = { title: 'Team Roster' };

function StatusCell({ e }: { e: Employee }) {
  if (e.status === 'terminated') return <span className="b-badge-gray">Terminated</span>;
  if (!e.has_password) return <span className="b-badge-amber" title="No password set yet — they can’t sign in">Pending</span>;
  if (e.status === 'pending') return <span className="b-badge-amber">Pending</span>;
  return <span className="b-badge-green">Active</span>;
}

export default async function RosterPage({ searchParams }: PageProps<'/base/team'>) {
  await requireManager();
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q.trim().toLowerCase().slice(0, 80) : '';
  const showTerminated = sp.terminated === '1';
  const [all, locations] = await Promise.all([listEmployees(true), listLocations()]);

  const visible = all
    .filter((e) => showTerminated || e.status !== 'terminated')
    .filter((e) => !q || [fullName(e), e.email, e.phone, e.login_id, ...e.roles.map((r) => r.name)].some((v) => v?.toLowerCase().includes(q)));
  const activeCount = all.filter((e) => e.status !== 'terminated').length;
  const locationName = (id: string | null) => locations.find((l) => l.id === id)?.name ?? '—';

  return (
    <>
      <PageHeader
        eyebrow="Team"
        title="Team roster"
        description={`${activeCount} team member${activeCount === 1 ? '' : 's'}`}
        actions={
          <>
            <PrintButton />
            <a href={`/base/team/export${showTerminated ? '?terminated=1' : ''}`} className="b-btn-ghost"><Download size={15} /> Export</a>
            <Link href="/base/team/new" className="b-btn-brass"><Plus size={16} /> Add team member</Link>
          </>
        }
      />

      <div className="b-card overflow-hidden">
        <form className="flex flex-wrap items-center gap-3 border-b border-stone/50 px-4 py-3 sm:px-5" role="search">
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input name="q" defaultValue={q} className="b-input pl-9" placeholder="Search name, email, phone or role…" aria-label="Search team members" />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="terminated" value="1" defaultChecked={showTerminated} className="b-check" /> Show terminated
          </label>
          <button type="submit" className="b-btn-ghost b-btn-sm">Apply</button>
          <span className="ml-auto text-xs text-muted">{visible.length} shown</span>
        </form>

        {visible.length === 0 ? (
          <EmptyState icon={<UserRound size={20} />} title="No team members match your search." />
        ) : (
          <div className="overflow-x-auto">
            <table className="b-table min-w-[900px]">
              <thead>
                <tr>
                  <th>Team member</th>
                  <th>Contact information</th>
                  <th>Access level</th>
                  <th>Location</th>
                  <th>Role</th>
                  <th>Wage</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => (
                  <tr key={e.id} className={e.status === 'terminated' ? 'opacity-60' : ''}>
                    <td>
                      <Link href={`/base/team/${e.id}`} className="group flex items-center gap-3">
                        <Avatar name={fullName(e)} />
                        <span>
                          <span className="block font-medium text-ink underline-offset-2 group-hover:text-brass-dark group-hover:underline">{fullName(e)}</span>
                          {(e.title || e.is_contractor) && <span className="block text-xs text-muted">{e.title ?? 'Contractor'}</span>}
                        </span>
                      </Link>
                    </td>
                    <td className="text-sm">
                      {e.email ? <a href={`mailto:${e.email}`} className="block max-w-[240px] truncate hover:text-brass-dark">{e.email}</a> : <Link href={`/base/team/${e.id}`} className="block text-xs text-brass-dark underline">Add email</Link>}
                      {e.phone ? <a href={`tel:${e.phone}`} className="block text-muted">{e.phone}</a> : <Link href={`/base/team/${e.id}`} className="block text-xs text-brass-dark underline">Add phone</Link>}
                    </td>
                    <td className="capitalize">{e.access_level}</td>
                    <td className="max-w-[180px] truncate text-muted">{locationName(e.location_id)}</td>
                    <td>
                      {e.roles[0] ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.roles[0].color }} />
                          {e.roles[0].name}
                          {e.roles.length > 1 && <span className="text-xs text-muted">+{e.roles.length - 1}</span>}
                        </span>
                      ) : (
                        <Link href={`/base/team/${e.id}`} className="text-xs text-brass-dark underline">Add role</Link>
                      )}
                    </td>
                    <td>{wageLabel(e.wage) ?? <Link href={`/base/team/${e.id}#wage`} className="text-xs text-brass-dark underline">Add wage</Link>}</td>
                    <td><StatusCell e={e} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
