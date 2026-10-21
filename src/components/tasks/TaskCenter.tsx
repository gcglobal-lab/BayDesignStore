'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Download,
  FileUp,
  Flag,
  KanbanSquare,
  List,
  ListChecks,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { addTaskComment, checklistAdd, checklistRemove, checklistToggle, createTask, deleteTask, deleteTaskList, saveTaskList, taskDetails, updateTask } from '@/app/base/(app)/crm/tasks/actions';
import { deleteFile, type PortalFile } from '@/app/base/(app)/crm/files/actions';
import { ActionForm, Field, SubmitButton } from '@/components/base/forms';
import { Initials } from '@/components/crm/board/Cell';
import Modal from '@/components/ui/Modal';
import { Popover } from '@/components/ui/Popover';
import Select from '@/components/ui/Select';
import { fileKind, fileUrl, fmtBytes, uploadFile } from '@/components/ui/upload';
import { PRIORITIES, priorityMeta, STATUSES, statusMeta, type ChecklistItem, type Task, type TaskComment, type TaskList, type TaskStatus } from '@/lib/tasks/types';
import { confirmDialog, friendlyError, reportResult, toast } from '@/components/ui/toast';
import { oneOf, usePersistentState } from '@/lib/usePersistentState';
import { DatePicker } from '@/components/base/calendar/Calendar';

type Person = { id: string; name: string };
type Me = { id: string | null; name: string; canAssign: boolean; canSeeAll: boolean; isLead: boolean };
const SCOPES = oneOf('mine', 'created', 'all');
const VIEWS = oneOf('list', 'board', 'team');

const shortDate = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function Avatars({ ids, names, size = 24 }: { ids: string[]; names: Record<string, string>; size?: number }) {
  if (!ids.length) return <span className="text-xs text-muted">Unassigned</span>;
  return (
    <span className="flex -space-x-1.5">
      {ids.slice(0, 3).map((id) => <Initials key={id} name={names[id] ?? '?'} size={size} ring />)}
      {ids.length > 3 && <span className="inline-flex items-center justify-center rounded-full bg-sand text-[0.6rem] font-semibold ring-2 ring-surface" style={{ width: size, height: size }}>+{ids.length - 3}</span>}
    </span>
  );
}

function StatusPill({ status, onChange, disabled }: { status: TaskStatus; onChange?: (s: TaskStatus) => void; disabled?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button ref={ref} type="button" disabled={disabled || !onChange} onClick={(e) => { e.stopPropagation(); setOpen(true); }} className="inline-flex min-w-[112px] items-center justify-center rounded-md px-2.5 py-1 text-xs font-medium text-white transition-[filter] hover:brightness-105 disabled:cursor-default" style={{ background: statusMeta[status].color }}>
        {statusMeta[status].label}
      </button>
      <Popover anchor={ref} open={open} onClose={close} width={180}>
        <div className="space-y-1 p-1">
          {STATUSES.map((s) => (
            <button key={s} type="button" onClick={(e) => { e.stopPropagation(); close(); onChange?.(s); }} className="block w-full rounded px-2 py-1.5 text-center text-xs font-medium text-white hover:brightness-110" style={{ background: statusMeta[s].color }}>
              {statusMeta[s].label}
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}

function PriorityTag({ p }: { p: Task['priority'] }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[0.7rem] font-semibold" style={{ color: priorityMeta[p].color, background: `${priorityMeta[p].color}14` }}>
      <Flag size={11} /> {priorityMeta[p].label}
    </span>
  );
}

/** Multi-select of people with search. */
function AssigneePicker({ people, value, onChange, disabled, me }: { people: Person[]; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean; me?: string | null }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const close = useCallback(() => setOpen(false), []);
  const names = Object.fromEntries(people.map((p) => [p.id, p.name]));
  const shown = people.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <button ref={ref} type="button" disabled={disabled} onClick={() => setOpen(true)} className="b-input flex min-h-[42px] items-center gap-2 text-left disabled:cursor-not-allowed">
        {value.length ? (
          <span className="flex flex-wrap items-center gap-1.5">
            {value.map((id) => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-sand py-0.5 pl-0.5 pr-2 text-xs"><Initials name={names[id] ?? '?'} size={18} /> {names[id] ?? 'Former team member'}</span>)}
          </span>
        ) : (
          <span className="text-muted/70">Choose people…</span>
        )}
        <ChevronDown size={15} className="ml-auto flex-none text-muted" />
      </button>
      <Popover anchor={ref} open={open} onClose={close} matchWidth width={260}>
        <label className="mb-1 flex items-center gap-2 rounded-lg bg-linen px-2.5 py-1.5">
          <Search size={13} className="text-muted" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" className="w-full bg-transparent text-sm outline-none" />
        </label>
        {me && !value.includes(me) && <button type="button" onClick={() => onChange([...value, me])} className="mb-1 w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-brass hover:bg-sand/70">+ Assign to me</button>}
        <div className="max-h-64 overflow-y-auto">
          {shown.map((p) => {
            const on = value.includes(p.id);
            return (
              <button key={p.id} type="button" onClick={() => onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-sand/70">
                <Initials name={p.name} size={24} /> <span className="flex-1 truncate">{p.name}</span> {on && <Check size={14} className="text-brass" />}
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
}

function NewTaskForm({ people, lists, me, onDone, defaults }: { people: Person[]; lists: TaskList[]; me: Me; onDone: () => void; defaults?: { status?: TaskStatus } }) {
  const [assignees, setAssignees] = useState<string[]>(me.id ? [me.id] : []);
  return (
    <ActionForm action={createTask} onSuccess={onDone} className="space-y-4">
      {assignees.map((id) => <input key={id} type="hidden" name="assignee_ids" value={id} />)}
      <Field label="Task" htmlFor="t-title"><input id="t-title" name="title" className="b-input" required maxLength={200} placeholder="e.g. Call the Rubenfelds about the deposit" autoFocus /></Field>
      <Field label="Assign to" hint={me.canAssign ? 'You can pick several people.' : 'You can create tasks for yourself.'}>
        <AssigneePicker people={people} value={assignees} onChange={setAssignees} disabled={!me.canAssign} me={me.id} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Priority" htmlFor="t-pri">
          <Select id="t-pri" name="priority" className="b-input" defaultValue="medium">
            {PRIORITIES.map((p) => <option key={p} value={p} data-color={priorityMeta[p].color}>{priorityMeta[p].label}</option>)}
          </Select>
        </Field>
        <Field label="Status" htmlFor="t-status">
          <Select id="t-status" name="status" className="b-input" defaultValue={defaults?.status ?? 'todo'}>
            {STATUSES.map((s) => <option key={s} value={s} data-color={statusMeta[s].color}>{statusMeta[s].label}</option>)}
          </Select>
        </Field>
        <Field label="Start" htmlFor="t-start"><DatePicker id="t-start" name="start_date" /></Field>
        <Field label="Due" htmlFor="t-due"><DatePicker id="t-due" name="due_date" /></Field>
      </div>
      {lists.length > 0 && (
        <Field label="List / project" htmlFor="t-list">
          <Select id="t-list" name="list_id" className="b-input" defaultValue="">
            <option value="">No list</option>
            {lists.map((l) => <option key={l.id} value={l.id} data-color={l.color}>{l.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Details" htmlFor="t-desc"><textarea id="t-desc" name="description" className="b-input min-h-[80px]" maxLength={10000} placeholder="What needs doing, links, notes…" /></Field>
      <Field label="Checklist (optional — one step per line)" htmlFor="t-check"><textarea id="t-check" name="checklist" className="b-input min-h-[70px]" placeholder={'Confirm amount\nSend receipt'} /></Field>
      <div className="flex justify-end"><SubmitButton className="b-btn-brass">Create task</SubmitButton></div>
    </ActionForm>
  );
}

function TaskDrawer({ task, people, names, lists, me, onClose, onPatch, onDeleted, today }: { task: Task; people: Person[]; names: Record<string, string>; lists: TaskList[]; me: Me; onClose: () => void; onPatch: (patch: Partial<Task>) => void; onDeleted: () => void; today: string }) {
  const full = me.isLead || (me.id !== null && task.created_by === me.id);
  const [details, setDetails] = useState<{ checklist: ChecklistItem[]; comments: TaskComment[]; files: PortalFile[] } | null>(null);
  const [title, setTitle] = useState(task.title);
  const [desc, setDesc] = useState(task.description ?? '');
  const [step, setStep] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const reload = useCallback(() => taskDetails(task.id).then(setDetails), [task.id]);
  useEffect(() => {
    reload();
  }, [reload]);
  useEffect(() => {
    setTitle(task.title);
    setDesc(task.description ?? '');
  }, [task.title, task.description]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  const checklist = details?.checklist ?? [];
  const overdue = task.due_date && task.due_date < today && task.status !== 'done';

  return (
    <div className="fixed inset-0 z-[75]" role="dialog" aria-modal="true" aria-label={task.title}>
      <button type="button" className="absolute inset-0 bg-black/30" onClick={onClose} aria-label="Close" />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-[620px] flex-col border-l border-stone/60 bg-surface text-ink shadow-2xl">
        <header className="border-b border-stone/60 px-5 py-4">
          <div className="flex items-start gap-2">
            <button type="button" onClick={() => onPatch({ status: task.status === 'done' ? 'todo' : 'done' })} className={`mt-1 ${task.status === 'done' ? 'text-emerald-600' : 'text-muted hover:text-emerald-600'}`} aria-label="Toggle done">
              {task.status === 'done' ? <CheckCircle2 size={22} /> : <Circle size={22} />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">Task #{task.number}{task.creator_name ? ` · by ${task.creator_name}` : ''} · {when(task.created_at)}</p>
              <input value={title} disabled={!full} maxLength={200} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== task.title && onPatch({ title: title.trim() })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={`w-full rounded-md bg-transparent px-1 text-xl font-semibold outline-none focus:bg-linen ${task.status === 'done' ? 'text-muted line-through' : ''}`} aria-label="Title" />
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-sand/70" aria-label="Close"><X size={18} /></button>
          </div>
        </header>
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-[110px_minmax(0,1fr)] sm:items-center">
            <dt className="text-muted">Status</dt>
            <dd><StatusPill status={task.status} onChange={(s) => onPatch({ status: s })} /></dd>
            <dt className="text-muted">Assigned to</dt>
            <dd>{full && me.canAssign ? <AssigneePicker people={people} value={task.assignee_ids} onChange={(ids) => onPatch({ assignee_ids: ids })} me={me.id} /> : <Avatars ids={task.assignee_ids} names={names} />}</dd>
            <dt className="text-muted">Priority</dt>
            <dd>
              {full ? (
                <Select value={task.priority} onChange={(e) => onPatch({ priority: e.target.value as Task['priority'] })} className="b-input !w-44 !py-1.5" aria-label="Priority">
                  {PRIORITIES.map((p) => <option key={p} value={p} data-color={priorityMeta[p].color}>{priorityMeta[p].label}</option>)}
                </Select>
              ) : <PriorityTag p={task.priority} />}
            </dd>
            <dt className="text-muted">Dates</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <DatePicker disabled={!full} value={task.start_date ?? ''} onChange={(v) => onPatch({ start_date: v || null })} compact className="w-48" aria-label="Start date" />
              <span className="text-muted">→</span>
              <DatePicker disabled={!full} value={task.due_date ?? ''} onChange={(v) => onPatch({ due_date: v || null })} compact className="w-48" fieldClassName={overdue ? '!border-red-400 text-red-700' : ''} aria-label="Due date" />
              {overdue && <span className="text-xs font-medium text-red-600">Overdue</span>}
            </dd>
            {lists.length > 0 && (
              <>
                <dt className="text-muted">List</dt>
                <dd>
                  <Select value={task.list_id ?? ''} disabled={!full} onChange={(e) => onPatch({ list_id: e.target.value || null })} className="b-input !w-56 !py-1.5" aria-label="List">
                    <option value="">No list</option>
                    {lists.map((l) => <option key={l.id} value={l.id} data-color={l.color}>{l.name}</option>)}
                  </Select>
                </dd>
              </>
            )}
            <dt className="text-muted">Progress</dt>
            <dd className="flex items-center gap-3">
              <input type="range" min={0} max={100} step={5} value={task.progress} disabled={checklist.length > 0} onChange={(e) => onPatch({ progress: Number(e.target.value) })} className="w-48 accent-[#007A5A]" aria-label="Progress" />
              <span className="w-10 text-sm font-semibold tabular-nums">{task.progress}%</span>
              {checklist.length > 0 && <span className="text-xs text-muted">from the checklist</span>}
            </dd>
          </dl>

          <div>
            <p className="b-label">Details</p>
            <textarea value={desc} disabled={!full} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== (task.description ?? '') && onPatch({ description: desc })} maxLength={10000} placeholder="Add more detail…" className="b-input min-h-[100px]" />
          </div>

          <div>
            <p className="b-label flex items-center gap-1.5"><ListChecks size={14} /> Checklist {checklist.length > 0 && `· ${checklist.filter((c) => c.done).length}/${checklist.length}`}</p>
            <ul className="space-y-1">
              {checklist.map((c) => (
                <li key={c.id} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-linen">
                  <input type="checkbox" className="b-check" checked={c.done} onChange={(e) => start(async () => { await checklistToggle(c.id, e.target.checked); await reload(); })} aria-label={c.text} />
                  <span className={`flex-1 text-sm ${c.done ? 'text-muted line-through' : ''}`}>{c.text}</span>
                  <button type="button" onClick={() => start(async () => { await checklistRemove(c.id); await reload(); })} className="rounded p-1 text-muted opacity-0 hover:text-red-600 group-hover:opacity-100" aria-label="Remove step"><Trash2 size={13} /></button>
                </li>
              ))}
            </ul>
            <form
              className="mt-1 flex items-center gap-2 px-2"
              onSubmit={(e) => {
                e.preventDefault();
                const t = step.trim();
                if (!t) return;
                setStep('');
                start(async () => { await checklistAdd(task.id, t); await reload(); });
              }}
            >
              <Plus size={14} className="text-muted" />
              <input value={step} onChange={(e) => setStep(e.target.value)} placeholder="Add a step and press Enter" maxLength={300} className="flex-1 bg-transparent py-1.5 text-sm outline-none" />
            </form>
          </div>

          <div>
            <p className="b-label">Files</p>
            <ul className="space-y-1">
              {(details?.files ?? []).map((f) => {
                const k = fileKind(f.name, f.mime);
                return (
                  <li key={f.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-linen">
                    <span className="flex h-8 w-7 flex-none items-center justify-center rounded text-[0.55rem] font-bold text-white" style={{ background: k.color }}>{k.label}</span>
                    <a href={fileUrl(f.id)} target="_blank" rel="noreferrer" className="min-w-0 flex-1"><span className="block truncate text-sm hover:text-brass">{f.name}</span><span className="block text-[0.68rem] text-muted">{fmtBytes(f.size)}</span></a>
                    <a href={fileUrl(f.id, true)} className="rounded p-1 text-muted hover:text-ink" aria-label="Download"><Download size={14} /></a>
                    <button type="button" onClick={() => start(async () => { await deleteFile(f.id); await reload(); })} className="rounded p-1 text-muted hover:text-red-600" aria-label="Delete file"><Trash2 size={14} /></button>
                  </li>
                );
              })}
            </ul>
            <input ref={input} type="file" multiple className="sr-only" onChange={async (e) => {
              const list = e.target.files;
              e.target.value = '';
              if (!list?.length) return;
              setBusy(true);
              setError(null);
              for (const f of Array.from(list)) {
                try {
                  await uploadFile({ task_id: task.id }, f);
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Upload failed.');
                }
              }
              setBusy(false);
              reload();
            }} />
            <button type="button" disabled={busy} onClick={() => input.current?.click()} className="b-btn-ghost b-btn-sm mt-1">{busy ? <Loader2 size={13} className="animate-spin" /> : <FileUp size={13} />} {busy ? 'Uploading…' : 'Attach files'}</button>
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          </div>

          <div>
            <p className="b-label flex items-center gap-1.5"><MessageSquare size={14} /> Updates</p>
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                const body = comment.trim();
                if (!body) return;
                setComment('');
                start(async () => { await addTaskComment(task.id, body); await reload(); });
              }}
            >
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={5000} placeholder="Write an update…" className="b-input min-h-[70px]" />
              <div className="flex justify-end"><button type="submit" disabled={!comment.trim()} className="b-btn-brass b-btn-sm">Post</button></div>
            </form>
            <ul className="mt-3 space-y-2.5">
              {(details?.comments ?? []).map((c) =>
                c.kind === 'log' ? (
                  <li key={c.id} className="text-xs text-muted">• {c.body} · {c.author_name} · {when(c.created_at)}</li>
                ) : (
                  <li key={c.id} className="rounded-xl border border-stone/60 px-3.5 py-2.5">
                    <p className="text-xs text-muted"><b className="text-ink">{c.author_name ?? 'Someone'}</b> · {when(c.created_at)}</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm">{c.body}</p>
                  </li>
                ),
              )}
              {details === null && <li className="flex items-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" /> Loading…</li>}
            </ul>
          </div>
        </div>
        {full && (
          <footer className="border-t border-stone/60 px-5 py-3">
            <button type="button" onClick={async () => { if (await confirmDialog({ title: 'Delete this task?', message: 'Its checklist, comments and files are removed too.', danger: true })) start(async () => { const r = await deleteTask(task.id).catch((e) => ({ ok: false, message: friendlyError(e) })); if (reportResult(r)) { toast.success('Task deleted.'); onDeleted(); } }); }} className="b-btn-quiet b-btn-sm text-red-600"><Trash2 size={13} /> Delete task</button>
          </footer>
        )}
      </aside>
    </div>
  );
}

function Bucket({ title, tone, tasks, children, defaultOpen = true }: { title: string; tone?: string; tasks: Task[]; children: (t: Task) => ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!tasks.length) return null;
  return (
    <section>
      <button type="button" onClick={() => setOpen(!open)} className="mb-2 flex items-center gap-1.5 text-sm font-semibold" style={{ color: tone }}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />} {title} <span className="font-normal text-muted">· {tasks.length}</span>
      </button>
      {open && <div className="overflow-hidden rounded-xl border border-stone/70 bg-surface">{tasks.map(children)}</div>}
    </section>
  );
}

export default function TaskCenter({ tasks: initial, lists, people, me, today, initialOpen }: { tasks: Task[]; lists: TaskList[]; people: Person[]; me: Me; today: string; initialOpen?: string | null }) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initial);
  useEffect(() => setTasks(initial), [initial]);
  // Which tasks and which layout you were looking at are remembered in this browser (and fall
  // back to what this person is allowed to see).
  const [savedScope, setScope] = usePersistentState<'mine' | 'created' | 'all'>('tasks-scope', me.id ? 'mine' : 'all', SCOPES);
  const [savedView, setView] = usePersistentState<'list' | 'board' | 'team'>('tasks-view', 'list', VIEWS);
  const scope = !me.id ? 'all' : savedScope === 'all' && !me.canSeeAll ? 'mine' : savedScope;
  const view = savedView === 'team' && !me.canSeeAll ? 'list' : savedView;
  const [q, setQ] = useState('');
  const [person, setPerson] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [list, setList] = useState('');
  const [due, setDue] = useState('');
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null);
  const [creating, setCreating] = useState<null | { status?: TaskStatus }>(null);
  const [listsOpen, setListsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const names = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p.name])), [people]);
  const listOf = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists]);
  const weekEnd = addDays(today, 7);

  const patch = (id: string, p: Partial<Task>) => {
    const before = tasks;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...p, ...(p.status === 'done' ? { progress: 100, completed_at: new Date().toISOString() } : p.status ? { completed_at: null } : {}) } : t)));
    updateTask(id, p as Parameters<typeof updateTask>[1]).then((r) => {
      if (!r?.ok) {
        setTasks(before);
        setError(r?.message ?? 'Couldn’t save.');
      }
    });
  };

  const scoped = tasks.filter((t) => (scope === 'mine' ? me.id && t.assignee_ids.includes(me.id) : scope === 'created' ? me.id && t.created_by === me.id : true));
  const filtered = scoped.filter((t) => {
    if (person && !t.assignee_ids.includes(person)) return false;
    if (status && t.status !== status) return false;
    if (priority && t.priority !== priority) return false;
    if (list && (t.list_id ?? '') !== list) return false;
    if (due === 'overdue' && !(t.due_date && t.due_date < today && t.status !== 'done')) return false;
    if (due === 'today' && t.due_date !== today) return false;
    if (due === 'week' && !(t.due_date && t.due_date >= today && t.due_date <= weekEnd)) return false;
    if (due === 'none' && t.due_date) return false;
    if (q.trim() && !`${t.title} ${t.description ?? ''} #${t.number}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });
  const prioRank = { urgent: 0, high: 1, medium: 2, low: 3 } as const;
  const sorted = [...filtered].sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || prioRank[a.priority] - prioRank[b.priority] || a.position - b.position);
  const open = sorted.filter((t) => t.status !== 'done');
  const mine = tasks.filter((t) => me.id && t.assignee_ids.includes(me.id) && t.status !== 'done');
  const weekAgo = addDays(today, -7);
  const kpis = [
    { label: 'My open tasks', value: mine.length, tone: '#1264A3' },
    { label: 'Overdue', value: scoped.filter((t) => t.due_date && t.due_date < today && t.status !== 'done').length, tone: '#DF2F4A' },
    { label: 'Due today', value: scoped.filter((t) => t.due_date === today && t.status !== 'done').length, tone: '#FDAB3D' },
    { label: 'Done this week', value: scoped.filter((t) => t.status === 'done' && t.completed_at && t.completed_at.slice(0, 10) >= weekAgo).length, tone: '#00C875' },
  ];
  const openTask = tasks.find((t) => t.id === openId);

  const Row = (t: Task) => {
    const overdue = t.due_date && t.due_date < today && t.status !== 'done';
    const l = t.list_id ? listOf.get(t.list_id) : null;
    return (
      <div key={t.id} className="group flex flex-wrap items-center gap-3 border-b border-stone/60 px-3 py-2.5 last:border-0 hover:bg-linen sm:flex-nowrap">
        <button type="button" onClick={() => patch(t.id, { status: t.status === 'done' ? 'todo' : 'done' })} className={t.status === 'done' ? 'text-emerald-600' : 'text-muted hover:text-emerald-600'} aria-label={t.status === 'done' ? 'Mark not done' : 'Mark done'}>
          {t.status === 'done' ? <CheckCircle2 size={19} /> : <Circle size={19} />}
        </button>
        <button type="button" onClick={() => setOpenId(t.id)} className="min-w-0 flex-1 text-left">
          <span className={`block truncate text-sm font-medium ${t.status === 'done' ? 'text-muted line-through' : ''}`}>{t.title}</span>
          <span className="flex items-center gap-2 text-[0.7rem] text-muted">
            #{t.number}
            {l && <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: l.color }} /> {l.name}</span>}
            {t.progress > 0 && t.status !== 'done' && (
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-14 overflow-hidden rounded-full bg-sand"><span className="block h-full rounded-full bg-[#007A5A]" style={{ width: `${t.progress}%` }} /></span>
                {t.progress}%
              </span>
            )}
          </span>
        </button>
        <PriorityTag p={t.priority} />
        <span className={`w-16 text-right text-xs ${overdue ? 'font-semibold text-red-600' : 'text-muted'}`}>{t.due_date ? shortDate(t.due_date) : '—'}</span>
        <span className="w-20"><Avatars ids={t.assignee_ids} names={names} size={22} /></span>
        <StatusPill status={t.status} onChange={(s) => patch(t.id, { status: s })} />
      </div>
    );
  };

  const teamRows = people
    .map((p) => {
      const ts = tasks.filter((t) => t.assignee_ids.includes(p.id));
      const openN = ts.filter((t) => t.status !== 'done').length;
      const doneN = ts.filter((t) => t.status === 'done').length;
      return { p, ts, openN, doneN, overdue: ts.filter((t) => t.due_date && t.due_date < today && t.status !== 'done').length, pct: ts.length ? Math.round((doneN / ts.length) * 100) : 0 };
    })
    .filter((r) => r.ts.length)
    .sort((a, b) => b.openN - a.openN);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.9rem] font-semibold tracking-tight">Team Tasks</h1>
          <p className="text-sm text-muted">Give anyone a task, follow its progress and get it done together.</p>
        </div>
        <div className="flex gap-2">
          {(me.isLead || me.canAssign) && <button type="button" onClick={() => setListsOpen(true)} className="b-btn-ghost"><List size={15} /> Lists</button>}
          <button type="button" onClick={() => setCreating({})} className="b-btn-brass"><Plus size={15} /> New task</button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="b-card flex items-center gap-3 px-4 py-3">
            <span className="h-10 w-1.5 rounded-full" style={{ background: k.tone }} />
            <div>
              <p className="text-xs text-muted">{k.label}</p>
              <p className="text-2xl font-semibold tabular-nums">{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="b-segment">
          {me.id && <button type="button" aria-pressed={scope === 'mine'} onClick={() => setScope('mine')}>My tasks</button>}
          {me.id && <button type="button" aria-pressed={scope === 'created'} onClick={() => setScope('created')}>Assigned by me</button>}
          {me.canSeeAll && <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>Everyone</button>}
        </div>
        <div className="b-segment">
          <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')} className="inline-flex items-center gap-1.5"><List size={14} /> List</button>
          <button type="button" aria-pressed={view === 'board'} onClick={() => setView('board')} className="inline-flex items-center gap-1.5"><KanbanSquare size={14} /> Board</button>
          {me.canSeeAll && <button type="button" aria-pressed={view === 'team'} onClick={() => setView('team')} className="inline-flex items-center gap-1.5"><Users size={14} /> Team</button>}
        </div>
      </div>
      {view !== 'team' && (
        <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <label className="relative lg:col-span-2">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks…" className="b-input !py-2 pl-9" />
          </label>
          <Select people value={person} onChange={(e) => setPerson(e.target.value)} className="b-input !py-2" aria-label="Person">
            <option value="">Anyone</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="b-input !py-2" aria-label="Status">
            <option value="">Any status</option>
            {STATUSES.map((s) => <option key={s} value={s} data-color={statusMeta[s].color}>{statusMeta[s].label}</option>)}
          </Select>
          <Select value={due} onChange={(e) => setDue(e.target.value)} className="b-input !py-2" aria-label="Due">
            <option value="">Any due date</option>
            <option value="overdue">Overdue</option>
            <option value="today">Due today</option>
            <option value="week">Next 7 days</option>
            <option value="none">No due date</option>
          </Select>
          <Select value={priority || list} onChange={(e) => { const v = e.target.value; if (!v) { setPriority(''); setList(''); } else if (v.startsWith('p:')) { setPriority(v.slice(2)); setList(''); } else { setList(v.slice(2)); setPriority(''); } }} className="b-input !py-2" aria-label="Priority or list">
            <option value="">Any priority / list</option>
            <optgroup label="Priority">{PRIORITIES.map((p) => <option key={p} value={`p:${p}`} data-color={priorityMeta[p].color}>{priorityMeta[p].label}</option>)}</optgroup>
            {lists.length > 0 && <optgroup label="List">{lists.map((l) => <option key={l.id} value={`l:${l.id}`} data-color={l.color}>{l.name}</option>)}</optgroup>}
          </Select>
        </div>
      )}
      {error && <p role="alert" className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><AlertTriangle size={15} /> {error} <button type="button" className="ml-auto" onClick={() => setError(null)}><X size={14} /></button></p>}

      {view === 'list' && (
        <div className="space-y-6">
          <Bucket title="Overdue" tone="#DF2F4A" tasks={open.filter((t) => t.due_date && t.due_date < today)}>{Row}</Bucket>
          <Bucket title="Today" tone="#FDAB3D" tasks={open.filter((t) => t.due_date === today)}>{Row}</Bucket>
          <Bucket title="Next 7 days" tone="#1264A3" tasks={open.filter((t) => t.due_date && t.due_date > today && t.due_date <= weekEnd)}>{Row}</Bucket>
          <Bucket title="Later" tasks={open.filter((t) => t.due_date && t.due_date > weekEnd)}>{Row}</Bucket>
          <Bucket title="No due date" tasks={open.filter((t) => !t.due_date)}>{Row}</Bucket>
          <Bucket title="Done" tone="#00A359" tasks={sorted.filter((t) => t.status === 'done').sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))} defaultOpen={false}>{Row}</Bucket>
          {filtered.length === 0 && (
            <div className="b-card flex flex-col items-center gap-2 px-6 py-14 text-center">
              <CheckCircle2 size={28} className="text-emerald-500" />
              <p className="font-medium">{scope === 'mine' ? 'You’re all clear — no tasks here.' : 'No tasks match.'}</p>
              <button type="button" onClick={() => setCreating({})} className="b-btn-brass b-btn-sm mt-2"><Plus size={13} /> New task</button>
            </div>
          )}
        </div>
      )}

      {view === 'board' && (
        <div className="-mx-1 overflow-x-auto pb-4">
          <div className="flex min-w-max gap-3 px-1">
            {STATUSES.map((s) => {
              const col = sorted.filter((t) => t.status === s);
              return (
                <section
                  key={s}
                  onDragOver={(e) => drag && e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (drag) patch(drag, { status: s });
                    setDrag(null);
                  }}
                  className="flex w-[290px] flex-none flex-col rounded-xl bg-sand/50"
                >
                  <header className="flex items-center gap-2 rounded-t-xl px-3 py-2.5 text-sm font-semibold text-white" style={{ background: statusMeta[s].color }}>
                    {statusMeta[s].label} <span className="rounded-full bg-white/25 px-1.5 text-xs">{col.length}</span>
                    <button type="button" onClick={() => setCreating({ status: s })} className="ml-auto rounded p-0.5 hover:bg-white/20" aria-label={`New ${statusMeta[s].label} task`}><Plus size={15} /></button>
                  </header>
                  <div className="flex min-h-[120px] flex-col gap-2 p-2">
                    {col.map((t) => {
                      const overdue = t.due_date && t.due_date < today && t.status !== 'done';
                      const l = t.list_id ? listOf.get(t.list_id) : null;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          draggable
                          onDragStart={() => setDrag(t.id)}
                          onDragEnd={() => setDrag(null)}
                          onClick={() => setOpenId(t.id)}
                          className={`rounded-lg border border-stone/70 bg-surface p-3 text-left shadow-sm transition-shadow hover:shadow-md ${drag === t.id ? 'opacity-40' : ''}`}
                        >
                          {l && <span className="mb-1.5 inline-flex items-center gap-1 text-[0.68rem] text-muted"><span className="h-2 w-2 rounded-sm" style={{ background: l.color }} /> {l.name}</span>}
                          <p className={`text-sm font-medium ${t.status === 'done' ? 'text-muted line-through' : ''}`}>{t.title}</p>
                          {t.progress > 0 && t.status !== 'done' && <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-sand"><span className="block h-full rounded-full bg-[#007A5A]" style={{ width: `${t.progress}%` }} /></span>}
                          <span className="mt-2.5 flex items-center justify-between gap-2">
                            <Avatars ids={t.assignee_ids} names={names} size={22} />
                            <span className="flex items-center gap-2">
                              {t.priority !== 'medium' && <Flag size={12} style={{ color: priorityMeta[t.priority].color }} aria-label={priorityMeta[t.priority].label} />}
                              {t.due_date && <span className={`inline-flex items-center gap-1 text-[0.7rem] ${overdue ? 'font-semibold text-red-600' : 'text-muted'}`}><CalendarDays size={11} /> {shortDate(t.due_date)}</span>}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {view === 'team' && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teamRows.map((r) => (
            <div key={r.p.id} className="b-card p-4">
              <div className="flex items-center gap-3">
                <Initials name={r.p.name} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{r.p.name}</p>
                  <p className="text-xs text-muted">{r.openN} open · {r.doneN} done{r.overdue ? <span className="font-semibold text-red-600"> · {r.overdue} overdue</span> : ''}</p>
                </div>
                <span className="text-lg font-semibold tabular-nums">{r.pct}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-sand"><div className="h-full rounded-full bg-[#007A5A]" style={{ width: `${r.pct}%` }} /></div>
              <ul className="mt-3 space-y-1">
                {r.ts.filter((t) => t.status !== 'done').slice(0, 4).map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => setOpenId(t.id)} className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-linen">
                      <span className="h-2 w-2 flex-none rounded-full" style={{ background: statusMeta[t.status].color }} />
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      {t.due_date && <span className={`text-[0.7rem] ${t.due_date < today ? 'text-red-600' : 'text-muted'}`}>{shortDate(t.due_date)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => { setView('list'); setScope('all'); setPerson(r.p.id); }} className="mt-2 text-xs font-medium text-brass">See all of {r.p.name.split(' ')[0]}’s tasks →</button>
            </div>
          ))}
          {teamRows.length === 0 && <p className="text-sm text-muted">No tasks assigned yet.</p>}
        </div>
      )}

      <Modal open={creating !== null} onClose={() => setCreating(null)} title="New task" wide>
        {creating && <NewTaskForm people={people} lists={lists} me={me} defaults={creating} onDone={() => { setCreating(null); router.refresh(); }} />}
      </Modal>
      <Modal open={listsOpen} onClose={() => setListsOpen(false)} title="Lists (projects)" description="Group tasks — e.g. Showroom, Warehouse, Marketing, a big client project.">
        <ListsManager lists={lists} canDelete={me.isLead} onChanged={() => router.refresh()} />
      </Modal>
      {openTask && (
        <TaskDrawer
          key={openTask.id}
          task={openTask}
          people={people}
          names={names}
          lists={lists}
          me={me}
          today={today}
          onClose={() => setOpenId(null)}
          onPatch={(p) => patch(openTask.id, p)}
          onDeleted={() => {
            setTasks((ts) => ts.filter((t) => t.id !== openTask.id));
            setOpenId(null);
          }}
        />
      )}
    </div>
  );
}

function ListsManager({ lists, canDelete, onChanged }: { lists: TaskList[]; canDelete: boolean; onChanged: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#1264A3');
  const [pending, start] = useTransition();
  const palette = ['#1264A3', '#007A5A', '#E01E5A', '#ECB22E', '#36C5F0', '#4A154B', '#A25DDC', '#FF642E'];
  return (
    <div className="space-y-4">
      <ul className="space-y-1.5">
        {lists.map((l) => (
          <li key={l.id} className="flex items-center gap-2.5 rounded-lg border border-stone/60 px-3 py-2">
            <span className="h-3 w-3 rounded" style={{ background: l.color }} />
            <span className="flex-1 text-sm">{l.name}</span>
            {canDelete && <button type="button" onClick={() => start(async () => { await deleteTaskList(l.id); onChanged(); })} className="rounded p-1 text-muted hover:text-red-600" aria-label={`Delete ${l.name}`}><Trash2 size={14} /></button>}
          </li>
        ))}
        {lists.length === 0 && <li className="text-sm text-muted">No lists yet.</li>}
      </ul>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          start(async () => {
            await saveTaskList(name, color);
            setName('');
            onChanged();
          });
        }}
      >
        <div className="flex gap-1">{palette.map((c) => <button key={c} type="button" onClick={() => setColor(c)} className={`h-6 w-6 rounded ${c === color ? 'ring-2 ring-ink ring-offset-1 ring-offset-surface' : ''}`} style={{ background: c }} aria-label={`Colour ${c}`} />)}</div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New list name" maxLength={80} className="b-input min-w-[10rem] flex-1 !py-2" />
        <button type="submit" disabled={pending || !name.trim()} className="b-btn-brass">Add</button>
      </form>
    </div>
  );
}
