import type { Metadata } from 'next';
import TaskCenter from '@/components/tasks/TaskCenter';
import { requireViewer } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { listEmployees } from '@/lib/base/queries';
import { getSettings } from '@/lib/base/settings';
import { addDaysYmd, todayYmd, zonedMidnight } from '@/lib/base/time';
import { fullName } from '@/lib/base/types';
import { canAssignOthers, canSeeAllTasks, isTaskLead } from '@/lib/tasks/access';
import type { Task, TaskList } from '@/lib/tasks/types';

export const metadata: Metadata = { title: 'Team Tasks' };

/** Team Tasks — everyone can open it; what you see depends on your role (see lib/tasks/access). */
export default async function TasksPage({ searchParams }: PageProps<'/base/crm/tasks'>) {
  const viewer = await requireViewer();
  const { task: openTask } = await searchParams;
  const { timezone: zone } = await getSettings();
  const today = todayYmd(zone);
  const doneSince = zonedMidnight(addDaysYmd(today, -60, zone), zone).toISOString();
  const seeAll = canSeeAllTasks(viewer);

  let query = db().from('tasks').select('*').or(`status.neq.done,completed_at.gte."${doneSince}"`).order('position').limit(3000);
  if (!seeAll) query = viewer.employeeId ? query.or(`created_by.eq.${viewer.employeeId},assignee_ids.cs.{${viewer.employeeId}}`) : query.eq('id', '00000000-0000-0000-0000-000000000000');
  const [tasks, lists, employees] = await Promise.all([
    query.then((r) => must<Task[]>(r, 'load tasks')),
    db().from('task_lists').select('id, name, color, position').eq('archived', false).order('position').then((r) => must<TaskList[]>(r, 'load lists')),
    listEmployees(),
  ]);
  const people = employees.map((e) => ({ id: e.id, name: fullName(e) }));

  return (
    <TaskCenter
      tasks={tasks}
      lists={lists}
      people={people}
      today={today}
      initialOpen={typeof openTask === 'string' && tasks.some((t) => t.id === openTask) ? openTask : null}
      me={{ id: viewer.employeeId, name: viewer.name, canAssign: canAssignOthers(viewer), canSeeAll: seeAll, isLead: isTaskLead(viewer) }}
    />
  );
}
