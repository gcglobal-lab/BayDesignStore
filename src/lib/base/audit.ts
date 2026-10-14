import 'server-only';
import { after } from 'next/server';
import { describeActivity, type ActivityDetails } from './activity';
import { db } from './db';
import { isDbConfigured } from './env';
import { clientIp } from './request';
import type { Viewer } from './auth';

/** Tables whose rows belong to one team member, so the activity can name them. */
const OWNED: Record<string, string> = {
  time_entries: 'employee_id',
  time_off_requests: 'employee_id',
  shifts: 'employee_id',
  availability_requests: 'employee_id',
  shift_requests: 'requester_id',
};

async function subjectName(entity: string | undefined, entityId: string | null | undefined, details: ActivityDetails): Promise<string | null> {
  let employeeId = typeof details.employee_id === 'string' ? details.employee_id : null;
  if (!employeeId && entity === 'employees' && entityId) employeeId = entityId;
  if (!employeeId && entity && entityId && OWNED[entity] && /^[0-9a-f-]{36}$/i.test(entityId)) {
    const { data } = await db().from(entity).select(OWNED[entity]).eq('id', entityId).maybeSingle();
    employeeId = (data as Record<string, string | null> | null)?.[OWNED[entity]] ?? null;
  }
  if (!employeeId) return null;
  const { data } = await db().from('employees').select('first_name, last_name').eq('id', employeeId).maybeSingle();
  return data ? `${data.first_name} ${data.last_name}`.trim() : null;
}

/**
 * Records who did what, with a readable sentence. Written after the response is sent so it
 * never slows the action down, and never blocks it if the write fails.
 */
export async function audit(
  viewer: Pick<Viewer, 'employeeId' | 'name'> | null,
  action: string,
  entity?: string,
  entityId?: string | null,
  details?: ActivityDetails,
) {
  if (!isDbConfigured()) return;
  const ip = await clientIp();
  const actor = viewer?.name ?? 'Someone';
  after(async () => {
    try {
      const d: ActivityDetails = { ...(details ?? {}) };
      if (!d.subject) {
        const subject = await subjectName(entity, entityId, d);
        // Don't name the subject when it's the person who did it ("Dee punched in", not "… for Dee").
        if (subject && subject !== actor) d.subject = subject;
      }
      const { error } = await db().from('audit_log').insert({
        actor_id: viewer?.employeeId ?? null,
        actor_label: actor,
        action,
        entity: entity ?? null,
        entity_id: entityId ?? null,
        details: Object.keys(d).length ? d : null,
        summary: describeActivity(action, actor, d).slice(0, 500),
        ip,
      });
      if (error) console.error('[audit] failed to record', action, error.message);
    } catch (err) {
      console.error('[audit] failed to record', action, err);
    }
  });
}
