/**
 * Server action ids for the test scripts.
 *
 * Against a local `npm start` they come from .next/server/server-reference-manifest.json. A deployed
 * build (Vercel) hashes them differently, so for any other --base the ids are read from the site's
 * own JavaScript instead: client components reference each action as
 * createServerReference("<id>", …, "<exportName>"). Action names are unique in this codebase, so the
 * name is enough. Actions only used by server-rendered forms aren't in that JavaScript — those
 * resolve to undefined against a deployed site.
 *
 *   const ids = await actionIds(BASE, adminCookie);
 *   const id = ids('my-week/clock-actions.ts', 'clockIn');
 */
import { existsSync, readFileSync } from 'node:fs';

/** Pages whose JavaScript between them loads every client-side action. */
const PAGES = [
  '/base/my-week', '/base/manager', '/base/schedule', '/base/team', '/base/team/new', '/base/team/roles', '/base/time-off',
  '/base/availability', '/base/team-availability', '/base/timesheets', '/base/reports', '/base/settings', '/base/account',
  '/base/inquiries', '/base/tasks', '/base/crm', '/base/crm/leads', '/base/crm/deals', '/base/crm/contacts', '/base/crm/companies',
  '/base/crm/vendors', '/base/crm/quotes', '/base/crm/products', '/base/crm/activities', '/base/crm/automations', '/base/crm/settings',
  '/base/crm/workspace', '/base/crm/boards', '/base/deliveries', '/base/deliveries/orders', '/base/deliveries/dispatch',
  '/base/deliveries/trucks', '/base/deliveries/customers', '/base/deliveries/my-route',
];

/** A page's text, retried a few times over a flaky connection; '' if it never arrives. */
async function text(url, init) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await (await fetch(url, init)).text();
    } catch {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return '';
}

export async function actionIds(base, cookie) {
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base);
  if (local) {
    const m = JSON.parse(readFileSync('.next/server/server-reference-manifest.json', 'utf8'));
    return (file, name) => Object.entries(m.node).find(([, v]) => v.filename.endsWith(file) && v.exportedName === name)?.[0];
  }
  const chunks = new Set();
  for (const p of PAGES) {
    const html = await text(`${base}${p}`, { headers: { Cookie: cookie } });
    // Vercel serves them from /_next/static/immutable/chunks/.
    for (const m of html.matchAll(/\/_next\/static\/(?:immutable\/)?chunks\/[^"'\s)]+\.js/g)) chunks.add(m[0]);
  }
  const byName = new Map();
  const re = /createServerReference\)\("([0-9a-f]{40,44})",[^,]+,void 0,[^,]+,"(\w+)"\)/g;
  const list = [...chunks];
  for (let i = 0; i < list.length; i += 8) {
    await Promise.all(
      list.slice(i, i + 8).map(async (c) => {
        for (const m of (await text(`${base}${c}`)).matchAll(re)) byName.set(m[2], m[1]);
      }),
    );
  }
  return (_file, name) => byName.get(name);
}

/** True when the local build exists (needed for localhost). */
export const hasLocalBuild = () => existsSync('.next/server/server-reference-manifest.json');
