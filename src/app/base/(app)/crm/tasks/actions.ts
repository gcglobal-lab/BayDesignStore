'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { requireViewer, type Viewer } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { CacheKeys, invalidate } from '@/lib/base/memo';
import { canAssignOthers, canEditTask, canWorkTask, isTaskLead } from '@/lib/tasks/access';
import { statusMeta, type ChecklistItem, type Task, type TaskComment } from '@/lib/tasks/types';
import type { PortalFile } from '../files/actions';

const uuid = z.string().uuid();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const refresh = () => {
  invalidate(CacheKeys.crmBadges);
  revalidatePath('/base', 'layout');
};
const log = (viewer: Viewer, taskId: string, body: string) =>
  db().from('task_comments').insert({ task_id: taskId, kind: 'log', body: body.slice(0, 500), author_id: viewer.employeeId, author_name: viewer.name });

async function load(id: string) {
  if (!uuid.safeParse(id).success) return null;
  const { data } = await db().from('tasks').select('*').eq('id', id).maybeSingle<Task>();
  return data;
}

/** People who aren't leads / Workflow users can only give tasks to themselves. */
function allowedAssignees(viewer: Viewer, ids: string[]) {
  const clean = [...new Set(ids.filter((x) => uuid.safeParse(x).success))].slice(0, 30);
  if (canAssignOthers(viewer)) return clean;
  return viewer.employeeId ? [viewer.employeeId] : [];
}

const createSchema = z.object({
  title: z.string().trim().min(1, 'Give the task a title.').max(200),
  description: z.string().trim().max(10000),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).catch('medium'),
  status: z.enum(['todo', 'in_progress', 'review', 'blocked', 'done']).catch('todo'),
  start_date: ymd.nullable().catch(null),
  due_date: ymd.nullable().catch(null),
  list_id: uuid.nullable().catch(null),
});

export async function createTask(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  const parsed = createSchema.safeParse({
    title: fd.get('title'),
    description: fd.get('description') ?? '',
    priority: fd.get('priority'),
    status: fd.get('status'),
    start_date: fd.get('start_date') || null,
    due_date: fd.get('due_date') || null,
    list_id: fd.get('list_id') || null,
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check the task.');
  const v = parsed.data;
  if (v.start_date && v.due_date && v.due_date < v.start_date) return fail('The due date is before the start date.');
  const assignees = allowedAssignees(viewer, fd.getAll('assignee_ids').map(String));
  const checklist = String(fd.get('checklist') ?? '').split(/\r?\n/).map((s) => s.trim().slice(0, 300)).filter(Boolean).slice(0, 50);
  const { data, error } = await db()
    .from('tasks')
    .insert({ ...v, description: v.description || null, assignee_ids: assignees, progress: v.status === 'done' ? 100 : 0, completed_at: v.status === 'done' ? new Date().toISOString() : null, created_by: viewer.employeeId, creator_name: viewer.name, position: Date.now() / 1000 })
    .select('id, number')
    .single();
  if (error || !data) return fail('Couldn’t create the task.');
  if (checklist.length) await db().from('task_checklist').insert(checklist.map((text, i) => ({ task_id: data.id, text, position: i })));
  await log(viewer, data.id, `Created by ${viewer.name}`);
  await audit(viewer, 'task.create', 'tasks', data.id, { text: `created task #${data.number} “${v.title}”` });
  refresh();
  return done('Task created.', { id: data.id });
}

type Patch = Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'progress' | 'start_date' | 'due_date' | 'list_id' | 'assignee_ids' | 'position'>>;

/**
 * Change a task. Anyone who can see it may change status, progress and position (moving it on
 * the board); leads and the creator may also change the title, people, dates, list and priority.
 */
export async function updateTask(id: string, patch: Patch): Promise<ActionResult> {
  const viewer = await requireViewer();
  const t = await load(id);
  if (!t) return fail('Task not found.');
  if (!canWorkTask(viewer, t)) return fail('This task isn’t yours.');
  const full = canEditTask(viewer, t);
  const clean: Record<string, unknown> = {};
  const notes: string[] = [];
  if (patch.status !== undefined && patch.status !== t.status && statusMeta[patch.status]) {
    clean.status = patch.status;
    clean.completed_at = patch.status === 'done' ? new Date().toISOString() : null;
    if (patch.status === 'done') clean.progress = 100;
    notes.push(`Status: ${statusMeta[patch.status].label}`);
  }
  if (patch.progress !== undefined && Number.isFinite(patch.progress)) {
    clean.progress = Math.max(0, Math.min(100, Math.round(patch.progress)));
    if (clean.progress !== t.progress) notes.push(`Progress: ${clean.progress}%`);
  }
  if (patch.position !== undefined && Number.isFinite(patch.position)) clean.position = patch.position;
  const restricted = ['title', 'description', 'priority', 'start_date', 'due_date', 'list_id', 'assignee_ids'] as const;
  if (restricted.some((k) => patch[k] !== undefined)) {
    if (!full) return fail('Only the person who created this task (or a manager) can change its details.');
    if (patch.title !== undefined) {
      const tt = patch.title.trim().slice(0, 200);
      if (!tt) return fail('The title can’t be empty.');
      clean.title = tt;
    }
    if (patch.description !== undefined) clean.description = (patch.description ?? '').slice(0, 10000) || null;
    if (patch.priority !== undefined && ['low', 'medium', 'high', 'urgent'].includes(patch.priority)) {
      clean.priority = patch.priority;
      notes.push(`Priority: ${patch.priority}`);
    }
    for (const k of ['start_date', 'due_date'] as const) {
      if (patch[k] !== undefined) {
        if (patch[k] !== null && !ymd.safeParse(patch[k]).success) return fail('Pick a valid date.');
        clean[k] = patch[k];
        if (k === 'due_date') notes.push(patch[k] ? `Due ${patch[k]}` : 'No due date');
      }
    }
    if (patch.list_id !== undefined) clean.list_id = patch.list_id && uuid.safeParse(patch.list_id).success ? patch.list_id : null;
    if (patch.assignee_ids !== undefined) {
      clean.assignee_ids = allowedAssignees(viewer, patch.assignee_ids);
      notes.push('Assignees changed');
    }
    const s = (clean.start_date ?? t.start_date) as string | null;
    const d = (clean.due_date ?? t.due_date) as string | null;
    if (s && d && d < s) return fail('The due date is before the start date.');
  }
  if (!Object.keys(clean).length) return done();
  const { error } = await db().from('tasks').update(clean).eq('id', id);
  if (error) return fail('Couldn’t save the task.');
  if (notes.length) await log(viewer, id, notes.join(' · '));
  if (clean.status) await audit(viewer, 'task.status', 'tasks', id, { text: `marked task #${t.number} “${t.title}” as ${statusMeta[clean.status as Task['status']].label}` });
  refresh();
  return done();
}

export async function deleteTask(id: string): Promise<ActionResult> {
  const viewer = await requireViewer();
  const t = await load(id);
  if (!t) return fail('Task not found.');
  if (!canEditTask(viewer, t)) return fail('Only the person who created this task (or a manager) can delete it.');
  await db().from('tasks').delete().eq('id', id);
  await audit(viewer, 'task.delete', 'tasks', id, { text: `deleted task #${t.number} “${t.title}”` });
  refresh();
  return done();
}

/** Checklist, comments and files for the task drawer. */
export async function taskDetails(id: string): Promise<{ checklist: ChecklistItem[]; comments: TaskComment[]; files: PortalFile[] } | null> {
  const viewer = await requireViewer();
  const t = await load(id);
  if (!t || !canWorkTask(viewer, t)) return null;
  const [c, m, f] = await Promise.all([
    db().from('task_checklist').select('*').eq('task_id', id).order('position'),
    db().from('task_comments').select('id, task_id, kind, body, author_name, created_at').eq('task_id', id).order('created_at', { ascending: false }).limit(200),
    db().from('portal_files').select('id, item_id, column_id, task_id, name, mime, size, created_at, uploader_name').eq('task_id', id).order('created_at'),
  ]);
  return { checklist: (c.data ?? []) as ChecklistItem[], comments: (m.data ?? []) as TaskComment[], files: (f.data ?? []) as PortalFile[] };
}

/** Recalculate progress from the checklist (when there is one). */
async function syncProgress(taskId: string) {
  const { data } = await db().from('task_checklist').select('done').eq('task_id', taskId);
  if (!data?.length) return;
  const pct = Math.round((data.filter((d) => d.done).length / data.length) * 100);
  await db().from('tasks').update({ progress: pct }).eq('id', taskId).neq('status', 'done');
}

export async function checklistAdd(taskId: string, text: string): Promise<ActionResult> {
  const viewer = await requireViewer();
  const t = await load(taskId);
  if (!t || !canWorkTask(viewer, t)) return fail('Task not found.');
  const tx = text.trim().slice(0, 300);
  if (!tx) return fail('Write the step first.');
  const { count } = await db().from('task_checklist').select('id', { count: 'exact', head: true }).eq('task_id', taskId);
  const { data } = await db().from('task_checklist').insert({ task_id: taskId, text: tx, position: count ?? 0 }).select('id').single();
  await syncProgress(taskId);
  refresh();
  return done(undefined, { id: data?.id ?? '' });
}

export async function checklistToggle(itemId: string, isDone: boolean): Promise<ActionResult> {
  const viewer = await requireViewer();
  if (!uuid.safeParse(itemId).success) return fail('Not found.');
  const { data: item } = await db().from('task_checklist').select('task_id, text').eq('id', itemId).maybeSingle();
  const t = item ? await load(item.task_id) : null;
  if (!item || !t || !canWorkTask(viewer, t)) return fail('Not found.');
  await db().from('task_checklist').update({ done: isDone }).eq('id', itemId);
  if (isDone) await log(viewer, t.id, `Checked “${item.text}”`);
  await syncProgress(t.id);
  refresh();
  return done();
}

export async function checklistRemove(itemId: string): Promise<ActionResult> {
  const viewer = await requireViewer();
  if (!uuid.safeParse(itemId).success) return fail('Not found.');
  const { data: item } = await db().from('task_checklist').select('task_id').eq('id', itemId).maybeSingle();
  const t = item ? await load(item.task_id) : null;
  if (!item || !t || !canWorkTask(viewer, t)) return fail('Not found.');
  await db().from('task_checklist').delete().eq('id', itemId);
  await syncProgress(t.id);
  refresh();
  return done();
}

export async function addTaskComment(taskId: string, body: string): Promise<ActionResult> {
  const viewer = await requireViewer();
  const t = await load(taskId);
  if (!t || !canWorkTask(viewer, t)) return fail('Task not found.');
  const text = body.trim().slice(0, 5000);
  if (!text) return fail('Write something first.');
  await db().from('task_comments').insert({ task_id: taskId, kind: 'comment', body: text, author_id: viewer.employeeId, author_name: viewer.name });
  return done();
}

export async function saveTaskList(name: string, color: string, id?: string): Promise<ActionResult> {
  const viewer = await requireViewer();
  if (!isTaskLead(viewer) && viewer.crm === 'none') return fail('Only managers and Workflow users can manage lists.');
  const n = name.trim().slice(0, 80);
  if (!n) return fail('Name the list.');
  const c = /^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#1264A3';
  if (id && uuid.safeParse(id).success) await db().from('task_lists').update({ name: n, color: c }).eq('id', id);
  else {
    const { count } = await db().from('task_lists').select('id', { count: 'exact', head: true });
    await db().from('task_lists').insert({ name: n, color: c, position: count ?? 0, created_by: viewer.employeeId });
  }
  refresh();
  return done();
}

export async function deleteTaskList(id: string): Promise<ActionResult> {
  const viewer = await requireViewer();
  if (!isTaskLead(viewer)) return fail('Only managers can delete lists.');
  if (!uuid.safeParse(id).success) return fail('Not found.');
  await db().from('task_lists').delete().eq('id', id);
  refresh();
  return done();
}
