/** Team Tasks: shapes and labels. Safe to import from client components. */

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'blocked' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type Task = {
  id: string;
  number: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  start_date: string | null;
  due_date: string | null;
  list_id: string | null;
  assignee_ids: string[];
  created_by: string | null;
  creator_name: string | null;
  position: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};
export type TaskList = { id: string; name: string; color: string; position: number };
export type ChecklistItem = { id: string; task_id: string; text: string; done: boolean; position: number };
export type TaskComment = { id: string; task_id: string; kind: 'comment' | 'log'; body: string; author_name: string | null; created_at: string };

export const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'review', 'blocked', 'done'];
export const statusMeta: Record<TaskStatus, { label: string; color: string }> = {
  todo: { label: 'To do', color: '#C4C4C4' },
  in_progress: { label: 'Working on it', color: '#FDAB3D' },
  review: { label: 'In review', color: '#579BFC' },
  blocked: { label: 'Stuck', color: '#DF2F4A' },
  done: { label: 'Done', color: '#00C875' },
};
export const PRIORITIES: TaskPriority[] = ['urgent', 'high', 'medium', 'low'];
export const priorityMeta: Record<TaskPriority, { label: string; color: string }> = {
  urgent: { label: 'Urgent', color: '#333333' },
  high: { label: 'High', color: '#401694' },
  medium: { label: 'Medium', color: '#5559DF' },
  low: { label: 'Low', color: '#579BFC' },
};
