import type { Viewer } from '@/lib/base/auth';

/**
 * Team Tasks permissions.
 *  - Admins, Time managers and Workflow managers ("leads") see and manage every task.
 *  - Workflow users see everyone's tasks and can assign tasks to anyone.
 *  - Everyone else sees the tasks they created or were given, and can only create tasks for themselves.
 *  - Working on a task (status, progress, checklist, comments, files) is open to anyone who can see it;
 *    changing who / when / what, or deleting, is for leads and the task's creator.
 */
export type TaskLike = { created_by: string | null; assignee_ids: string[] };

export const isTaskLead = (v: Pick<Viewer, 'level' | 'crm'>) => v.level === 'admin' || v.level === 'manager' || v.crm === 'manager';
export const canAssignOthers = (v: Pick<Viewer, 'level' | 'crm'>) => isTaskLead(v) || v.crm !== 'none';
export const canSeeAllTasks = canAssignOthers;

export function canWorkTask(v: Pick<Viewer, 'level' | 'crm' | 'employeeId'>, t: TaskLike) {
  if (canSeeAllTasks(v)) return true;
  return Boolean(v.employeeId && (t.created_by === v.employeeId || t.assignee_ids.includes(v.employeeId)));
}

export function canEditTask(v: Pick<Viewer, 'level' | 'crm' | 'employeeId'>, t: TaskLike) {
  return isTaskLead(v) || Boolean(v.employeeId && t.created_by === v.employeeId);
}
