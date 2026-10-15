/**
 * The three apps of the Employee Portal. Time is for everyone; Workflow (the CRM) and
 * Deliveries are switched on per person by an admin. Admins have full access to all three.
 * Safe to import from client components.
 */
export type CrmRole = 'none' | 'user' | 'manager';
export type DeliveriesRole = 'none' | 'driver' | 'dispatcher';
export type AppKey = 'time' | 'crm' | 'deliveries';

export const PORTAL_NAME = 'Employee Portal';

export const APPS: Record<AppKey, { label: string; home: string; prefix: string }> = {
  time: { label: 'Time', home: '/base', prefix: '/base' },
  crm: { label: 'Workflow', home: '/base/crm', prefix: '/base/crm' },
  deliveries: { label: 'Deliveries', home: '/base/deliveries', prefix: '/base/deliveries' },
};

export const crmRoleLabel: Record<CrmRole, string> = { none: 'No access', user: 'User', manager: 'Manager' };
export const deliveriesRoleLabel: Record<DeliveriesRole, string> = { none: 'No access', driver: 'Driver', dispatcher: 'Dispatcher' };

export const appOf = (pathname: string): AppKey =>
  pathname.startsWith(APPS.crm.prefix) ? 'crm' : pathname.startsWith(APPS.deliveries.prefix) ? 'deliveries' : 'time';

/** Which apps someone can open, in menu order. */
export function appsFor(v: { level: string; crm: CrmRole; deliveries: DeliveriesRole }): AppKey[] {
  const admin = v.level === 'admin';
  return ['time', ...(admin || v.crm !== 'none' ? (['crm'] as const) : []), ...(admin || v.deliveries !== 'none' ? (['deliveries'] as const) : [])];
}
