import 'server-only';
import { db } from './db';
import { isDbConfigured } from './env';
import { clientIp } from './request';
import type { Viewer } from './auth';

/** Records who did what. Never blocks the action itself if the log write fails. */
export async function audit(
  viewer: Pick<Viewer, 'employeeId' | 'name'> | null,
  action: string,
  entity?: string,
  entityId?: string | null,
  details?: Record<string, unknown>,
) {
  if (!isDbConfigured()) return;
  const { error } = await db().from('audit_log').insert({
    actor_id: viewer?.employeeId ?? null,
    actor_label: viewer?.name ?? 'anonymous',
    action,
    entity: entity ?? null,
    entity_id: entityId ?? null,
    details: details ?? null,
    ip: await clientIp(),
  });
  if (error) console.error('[audit] failed to record', action, error.message);
}
