import Link from 'next/link';
import { CalendarClock, CheckCircle2, Circle, History, Mail, MessageSquareText, Phone, SquareCheckBig, Trash2, Users, Zap } from 'lucide-react';
import { deleteActivity, rescheduleActivity, toggleActivity } from '@/app/base/(app)/crm/activities/actions';
import { SubmitButton } from '@/components/base/forms';
import { EmptyState } from '@/components/base/ui';
import { fmtDate, fmtTime } from '@/lib/base/time';
import { activityTypeLabel, priorityTone, type Activity, type ActivityType } from '@/lib/crm/types';

const ICONS: Record<ActivityType, typeof Phone> = { task: SquareCheckBig, call: Phone, meeting: Users, email: Mail, note: MessageSquareText, log: History };
const TONES: Record<ActivityType, string> = {
  task: 'bg-indigo-500/15 text-brass-dark',
  call: 'bg-emerald-500/15 text-emerald-700',
  meeting: 'bg-violet-500/15 text-violet-700',
  email: 'bg-sky-500/15 text-sky-700',
  note: 'bg-amber-500/15 text-amber-700',
  log: 'bg-sand text-muted',
};

export function ActivityIcon({ type, size = 15 }: { type: ActivityType; size?: number }) {
  const Icon = ICONS[type];
  return (
    <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-full ${TONES[type]}`}>
      <Icon size={size} />
    </span>
  );
}

export function DoneToggle({ a }: { a: Pick<Activity, 'id' | 'done'> }) {
  return (
    <form action={toggleActivity}>
      <input type="hidden" name="id" value={a.id} />
      <input type="hidden" name="done" value={String(!a.done)} />
      <button type="submit" className={`rounded-full p-0.5 transition-colors ${a.done ? 'text-emerald-600' : 'text-muted hover:text-brass'}`} aria-label={a.done ? 'Mark as not done' : 'Mark as done'} title={a.done ? 'Re-open' : 'Mark done'}>
        {a.done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
      </button>
    </form>
  );
}

export function SnoozeButtons({ id }: { id: string }) {
  return (
    <span className="inline-flex gap-1">
      {[
        [1, '+1d'],
        [7, '+1w'],
      ].map(([days, label]) => (
        <form key={label} action={rescheduleActivity}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="days" value={days} />
          <SubmitButton className="rounded-full px-2 py-0.5 text-[0.68rem] font-semibold text-muted ring-1 ring-stone hover:text-ink">{label}</SubmitButton>
        </form>
      ))}
    </span>
  );
}

/**
 * Everything that happened on a record, newest first: open to-dos on top, then notes, calls,
 * emails, meetings and automatic history lines.
 */
export default function Timeline({
  items,
  zone,
  names,
  canDeleteAll,
  me,
  context,
}: {
  items: Activity[];
  zone: string;
  names: Map<string, string>;
  canDeleteAll: boolean;
  me: string | null;
  /** Links back to where an activity belongs (shown on contact/company timelines). */
  context?: Map<string, { href: string; label: string }>;
}) {
  const open = items.filter((a) => !a.done && a.type !== 'log' && a.type !== 'note').sort((a, b) => (a.due_at ?? '').localeCompare(b.due_at ?? ''));
  const past = items.filter((a) => !open.includes(a));
  const now = Date.now();
  if (items.length === 0) return <EmptyState icon={<History size={20} />} title="Nothing here yet.">Add a note or schedule the next step above.</EmptyState>;

  return (
    <div className="space-y-6">
      {open.length > 0 && (
        <div>
          <p className="b-eyebrow mb-2">Planned</p>
          <ul className="space-y-2">
            {open.map((a) => {
              const overdue = a.due_at && new Date(a.due_at).getTime() < now;
              return (
                <li key={a.id} className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${overdue ? 'border-red-200 bg-red-50' : 'border-stone/60 bg-surface'}`}>
                  <DoneToggle a={a} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {a.subject}
                      <span className="b-badge-gray">{activityTypeLabel[a.type]}</span>
                      {a.priority !== 'normal' && <span className={`${priorityTone[a.priority]} capitalize`}>{a.priority}</span>}
                    </p>
                    <p className={`mt-0.5 flex flex-wrap items-center gap-x-3 text-xs ${overdue ? 'text-red-700' : 'text-muted'}`}>
                      <span className="inline-flex items-center gap-1"><CalendarClock size={12} /> {a.due_at ? `${fmtDate(new Date(a.due_at), zone, 'EEE, MMM d')} · ${fmtTime(a.due_at, zone)}` : 'No due date'}{overdue ? ' · overdue' : ''}</span>
                      {a.assignee_id && <span>{names.get(a.assignee_id) ?? 'Someone'}</span>}
                      {context?.get(a.id) && <Link href={context.get(a.id)!.href} className="hover:text-brass-dark">{context.get(a.id)!.label}</Link>}
                    </p>
                    {a.body && <p className="mt-1 whitespace-pre-wrap text-sm text-ink/80">{a.body}</p>}
                  </div>
                  <SnoozeButtons id={a.id} />
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {past.length > 0 && (
        <div>
          <p className="b-eyebrow mb-2">History</p>
          <ol className="relative space-y-4 border-l border-stone/70 pl-5">
            {past.map((a) => (
              <li key={a.id} className="relative">
                <span className="absolute -left-[2.15rem] top-0"><ActivityIcon type={a.type} size={13} /></span>
                <div className={`rounded-xl ${a.type === 'log' ? 'py-1.5' : 'border border-stone/60 bg-surface px-3.5 py-2.5'}`}>
                  <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
                    <span className="font-semibold text-ink">{a.type === 'log' ? a.subject : a.type === 'note' ? 'Note' : `${activityTypeLabel[a.type]} · ${a.subject}`}</span>
                    {a.outcome && <span className="b-badge-gray">{a.outcome}</span>}
                    <span>{a.author_name?.startsWith('Automation') ? <span className="inline-flex items-center gap-1"><Zap size={11} /> {a.author_name}</span> : a.author_name ?? ''}</span>
                    <span>· {fmtDate(new Date(a.done_at ?? a.created_at), zone, 'MMM d, yyyy')} {fmtTime(a.done_at ?? a.created_at, zone)}</span>
                    {context?.get(a.id) && <Link href={context.get(a.id)!.href} className="hover:text-brass-dark">· {context.get(a.id)!.label}</Link>}
                    {a.type !== 'log' && (canDeleteAll || a.created_by === me) && (
                      <form action={deleteActivity} className="ml-auto">
                        <input type="hidden" name="id" value={a.id} />
                        <SubmitButton className="rounded p-1 text-muted hover:text-red-600" confirm="Delete this from the timeline?"><Trash2 size={12} /></SubmitButton>
                      </form>
                    )}
                  </div>
                  {a.type !== 'log' && a.body && <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink/90">{a.body}</p>}
                  {a.type !== 'log' && a.type !== 'note' && a.done && <p className="mt-1 inline-flex items-center gap-1 text-[0.7rem] text-emerald-700"><CheckCircle2 size={11} /> Done</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
