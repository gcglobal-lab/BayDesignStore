#!/usr/bin/env node
/**
 * End-to-end test of the V3 apps (Workflow CRM + Deliveries) through the real server actions,
 * against a running production server (npm run build && npm start):
 *   admin grants app access → website inquiry becomes a lead (+ automation task) → convert to a
 *   deal → move stages (+ automation) → quote accepted (deal value) → deal won (contact becomes a
 *   customer) → CSV import → truck, route, order (geocoded) → optimise & dispatch → driver
 *   delivers with a signature → route completes → customer tracking page → permissions.
 * Everything it creates is deleted at the end.
 *
 *   node scripts/e2e-v3.mjs [--base http://localhost:3000]
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { SignJWT } from 'jose';

process.env.NODE_ENV = 'production';
process.loadEnvFile?.('.env.local');
const { encodeReply } = await import('next/dist/compiled/react-server-dom-turbopack/client.node.js').then((m) => m.default ?? m);
const i = process.argv.indexOf('--base');
const BASE = (i > -1 ? process.argv[i + 1] : 'http://localhost:3000').replace(/\/$/, '');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const manifest = JSON.parse(readFileSync('.next/server/server-reference-manifest.json', 'utf8'));
const id = (file, name) => {
  const found = Object.entries(manifest.node).find(([, v]) => v.filename.replace(/\\/g, '/').endsWith(file) && v.exportedName === name)?.[0];
  if (!found) throw new Error(`Action ${name} in ${file} not found — build first.`);
  return found;
};
const sign = (sub, lvl, sv) =>
  new SignJWT({ lvl, sv }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setSubject(sub).setIssuer('bay-design-base').setAudience('bay-design-base:session').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(process.env.SESSION_SECRET));
const admin = `__Host-bdb_session=${await sign('env-admin', 'admin', 1)}`;

let failures = 0;
const check = (label, pass, detail = '') => {
  if (!pass) failures++;
  console.log(`  ${pass ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};
const form = (fields) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const one of [v].flat()) if (one !== undefined && one !== null) fd.append(k, String(one));
  return fd;
};
async function call(actionId, args, cookie, page = '/base') {
  const body = await encodeReply(args);
  const res = await fetch(`${BASE}${page}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Next-Action': actionId, Accept: 'text/x-component', Origin: BASE, Cookie: cookie, ...(typeof body === 'string' ? { 'Content-Type': 'text/plain;charset=UTF-8' } : {}) },
    body,
  });
  const text = await res.text();
  return { status: res.status, text, ok: /"ok":true/.test(text), redirect: res.headers.get('x-action-redirect') ?? '' };
}
const get = (path, cookie) => fetch(`${BASE}${path}`, { headers: { Cookie: cookie }, redirect: 'manual' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const TAG = `e2e-v3-${Date.now()}`;
const created = { employee: null, inquiry: null, lead: null, contact: null, deal: null, product: null, quote: null, truck: null, route: null, order: null, imported: [] };

try {
  console.log(`\nV3 end-to-end test → ${BASE}\n`);

  console.log('App access');
  const { data: emp } = await db.from('employees').insert({ first_name: 'E2E', last_name: 'Driver', login_id: `${TAG}.driver`.slice(0, 60), status: 'active', access_level: 'employee' }).select('id, session_version').single();
  created.employee = emp.id;
  const driver = `__Host-bdb_session=${await sign(emp.id, 'employee', emp.session_version)}`;
  // employees without a password can't be signed in — give a dummy hash so the session is valid
  await db.from('employees').update({ password_hash: 'scrypt:dummy' }).eq('id', emp.id);
  check('employee without access is sent away from Workflow', (await get('/base/crm', driver)).status === 307);
  const access = await call(id('team/access-actions.ts', 'setAppAccess'), [null, form({ id: emp.id, crm_role: 'user', deliveries_role: 'driver' })], admin, '/base/settings');
  const { data: empAfter } = await db.from('employees').select('crm_role, deliveries_role').eq('id', emp.id).single();
  check('admin gives Workflow (user) + Deliveries (driver)', access.ok && empAfter.crm_role === 'user' && empAfter.deliveries_role === 'driver');
  await sleep(11_000); // viewer cache
  check('…now Workflow opens for them', (await get('/base/crm', driver)).status === 200);
  check('drivers can’t open the dispatch board', (await get('/base/deliveries/dispatch', driver)).status === 307);
  check('drivers can open My Route', (await get('/base/deliveries/my-route', driver)).status === 200);

  console.log('\nLeads');
  const email = `${TAG}@example.com`;
  const inq = await call(id('src/app/inquiry-actions.ts', 'submitInquiry'), [{ name: 'Jane E2E Buyer', email, phone: '239-555-0142', interest: 'Furniture Purchase', message: 'Looking for a sectional and dining set for our new condo.', page: '/contact' }], '', '/contact');
  check('website inquiry is accepted', inq.ok, inq.ok ? '' : inq.text.slice(-200));
  await sleep(4000);
  const { data: lead } = await db.from('crm_leads').select('id, status, source, inquiry_id').eq('email', email).maybeSingle();
  created.lead = lead?.id;
  created.inquiry = lead?.inquiry_id;
  check('it lands in Workflow ▸ Leads automatically', lead?.status === 'new' && lead.source === 'Website form');
  const { count: leadTasks } = await db.from('crm_activities').select('id', { count: 'exact', head: true }).eq('lead_id', lead?.id).eq('type', 'call');
  check('automation adds a “call the new lead” task', (leadTasks ?? 0) >= 1);
  check('lead page opens', (await get(`/base/crm/leads/${lead?.id}`, admin)).status === 200);

  const { data: pipe } = await db.from('crm_pipelines').select('id, stages:crm_stages(id, name, position)').eq('is_default', true).single();
  const stages = pipe.stages.sort((a, b) => a.position - b.position);
  const conv = await call(id('crm/leads/actions.ts', 'convertLead'), [null, form({ id: lead.id, deal_title: 'Jane — condo furniture', value: 9000, pipeline_id: pipe.id, stage_id: stages[1].id })], admin, `/base/crm/leads/${lead.id}`);
  const { data: leadAfter } = await db.from('crm_leads').select('status, deal_id, contact_id').eq('id', lead.id).single();
  created.deal = leadAfter.deal_id;
  created.contact = leadAfter.contact_id;
  check('convert lead → deal + contact', leadAfter.status === 'converted' && !!leadAfter.deal_id && !!leadAfter.contact_id, conv.redirect);
  const { count: moved } = await db.from('crm_activities').select('id', { count: 'exact', head: true }).eq('deal_id', leadAfter.deal_id).eq('type', 'call');
  check('the lead’s tasks moved to the deal', (moved ?? 0) >= 1);

  console.log('\nDeals');
  const mv = await call(id('crm/deals/actions.ts', 'moveDeal'), [leadAfter.deal_id, stages[3].id, 1], admin, '/base/crm/deals');
  const { data: dealMoved } = await db.from('crm_deals').select('stage_id').eq('id', leadAfter.deal_id).single();
  check('drag to “Proposal / quote sent”', mv.ok && dealMoved.stage_id === stages[3].id);
  const { count: followups } = await db.from('crm_activities').select('id', { count: 'exact', head: true }).eq('deal_id', leadAfter.deal_id).eq('subject', 'Follow up on the quote');
  check('automation adds the quote follow-up', (followups ?? 0) === 1);
  const otherPipe = await db.from('crm_stages').select('id').neq('pipeline_id', pipe.id).limit(1).single();
  check('moving to another pipeline’s stage is refused', !(await call(id('crm/deals/actions.ts', 'moveDeal'), [leadAfter.deal_id, otherPipe.data.id, 1], admin, '/base/crm/deals')).ok);
  check('deal page opens', (await get(`/base/crm/deals/${leadAfter.deal_id}`, admin)).status === 200);
  const note = await call(id('crm/activities/actions.ts', 'createActivity'), [null, form({ type: 'note', body: 'Prefers linen, light oak.', deal_id: leadAfter.deal_id, contact_id: leadAfter.contact_id })], admin, `/base/crm/deals/${leadAfter.deal_id}`);
  check('add a note to the deal', note.ok);

  console.log('\nQuotes');
  await call(id('crm/products/actions.ts', 'saveProduct'), [null, form({ name: `${TAG} sofa`, sku: 'E2E-1', unit_price: 4200, cost: 2100 })], admin, '/base/crm/products');
  const { data: product } = await db.from('crm_products').select('id').eq('name', `${TAG} sofa`).single();
  created.product = product.id;
  check('product added', !!product);
  const items = [{ product_id: product.id, description: 'Linen sofa', quantity: 2, unit_price: 4200, discount_pct: 10 }, { product_id: null, description: 'Delivery prep', quantity: 1, unit_price: 100, discount_pct: 0 }];
  const q = await call(id('crm/quotes/actions.ts', 'saveQuote'), [null, form({ title: 'Condo quote', deal_id: leadAfter.deal_id, discount_pct: 0, tax_pct: 6, delivery_fee: 150, items: JSON.stringify(items), notes: '', terms: '' })], admin, '/base/crm/quotes/new');
  const { data: quote } = await db.from('crm_quotes').select('id, contact_id').eq('deal_id', leadAfter.deal_id).single();
  created.quote = quote?.id;
  check('quote created, contact taken from the deal', !!quote && quote.contact_id === leadAfter.contact_id, q.redirect);
  check('print view opens', (await get(`/base/crm/quotes/${quote.id}/print`, admin)).status === 200);
  await call(id('crm/quotes/actions.ts', 'setQuoteStatus'), [form({ id: quote.id, status: 'accepted' })], admin, `/base/crm/quotes/${quote.id}`);
  const { data: dealVal } = await db.from('crm_deals').select('value').eq('id', leadAfter.deal_id).single();
  const expected = Math.round(((2 * 4200 * 0.9 + 100) * 1.06 + 150) * 100) / 100;
  check('accepted quote sets the deal value', Number(dealVal.value) === expected, `${dealVal.value} vs ${expected}`);
  const won = await call(id('crm/deals/actions.ts', 'setDealStatus'), [null, form({ id: leadAfter.deal_id, status: 'won' })], admin, `/base/crm/deals/${leadAfter.deal_id}`);
  const { data: contactAfter } = await db.from('crm_contacts').select('lifecycle').eq('id', leadAfter.contact_id).single();
  check('deal won → contact becomes a customer', won.ok && contactAfter.lifecycle === 'customer');

  console.log('\nContacts import');
  const csv = `First name,Last name,Email,Phone,Company,City\n${TAG}A,One,${TAG}-a@example.com,239-555-0001,${TAG} Interiors,Naples\n${TAG}B,Two,${TAG}-b@example.com,,,Marco Island\n${TAG}C,NoEmail,,,,\n${TAG}A,Dupe,${TAG}-a@example.com,,,`;
  const imp = await call(id('crm/contacts/actions.ts', 'importContacts'), [null, form({ csv, lifecycle: 'lead' })], admin, '/base/crm/contacts');
  const { data: imported } = await db.from('crm_contacts').select('id, company_id, email').ilike('first_name', `${TAG}%`);
  created.imported = imported?.map((c) => c.id) ?? [];
  check('CSV import adds new people (with or without email), skips the duplicate email, makes the company', imp.ok && imported?.length === 3 && imported.some((c) => c.company_id), imp.text.match(/"message":"([^"]+)/)?.[1]);

  console.log('\nDeliveries');
  await call(id('deliveries/trucks/actions.ts', 'saveTruck'), [null, form({ name: `${TAG} truck`, capacity_stops: 8, color: '#10B981' })], admin, '/base/deliveries/trucks');
  const { data: truck } = await db.from('dl_trucks').select('id').eq('name', `${TAG} truck`).single();
  created.truck = truck.id;
  await call(id('deliveries/dispatch/actions.ts', 'saveRoute'), [null, form({ route_date: today, name: `${TAG} route`, truck_id: truck.id, driver_id: emp.id, start_time: '08:00' })], admin, '/base/deliveries/dispatch');
  const { data: route } = await db.from('dl_routes').select('id').eq('name', `${TAG} route`).single();
  created.route = route.id;
  check('truck and route created', !!truck && !!route);
  const order = await call(
    id('deliveries/orders/actions.ts', 'createOrder'),
    [null, form({ customer_name: 'Jane E2E Buyer', phone: '239-555-0142', email, address1: '850 5th Ave S', city: 'Naples', state: 'FL', postal_code: '34102', service_type: 'white_glove', scheduled_date: today, window_start: '09:00', window_end: '12:00', duration_min: 45, deal_id: leadAfter.deal_id, contact_id: leadAfter.contact_id, items: JSON.stringify([{ description: 'Linen sofa', quantity: 2, assembly: false }]) })],
    admin,
    '/base/deliveries/orders/new',
  );
  const { data: ord } = await db.from('dl_orders').select('id, number, status, lat, tracking_token').eq('deal_id', leadAfter.deal_id).single();
  created.order = ord?.id;
  check('order created and scheduled', ord?.status === 'scheduled', order.redirect);
  check('address found on the map', ord?.lat != null);
  await call(id('deliveries/dispatch/actions.ts', 'assignToRoute'), [form({ order_id: ord.id, route_id: route.id })], admin, '/base/deliveries/dispatch');
  await call(id('deliveries/dispatch/actions.ts', 'optimizeRoute'), [form({ id: route.id })], admin, '/base/deliveries/dispatch');
  const { data: onRoute } = await db.from('dl_orders').select('route_id, stop_order, eta').eq('id', ord.id).single();
  check('added to the route with a stop number and ETA', onRoute.route_id === route.id && onRoute.stop_order === 1 && !!onRoute.eta);
  check('driver can’t see a planned (not dispatched) route', !(await (await get('/base/deliveries/my-route', driver)).text()).includes('Jane E2E Buyer'));
  await call(id('deliveries/dispatch/actions.ts', 'dispatchRoute'), [form({ id: route.id })], admin, '/base/deliveries/dispatch');
  check('after dispatch the driver sees the stop', (await (await get('/base/deliveries/my-route', driver)).text()).includes('Jane E2E Buyer'));
  check('dispatch board, route sheet and order page open', (await get(`/base/deliveries/dispatch?date=${today}`, admin)).status === 200 && (await get(`/base/deliveries/routes/${route.id}/print`, admin)).status === 200 && (await get(`/base/deliveries/orders/${ord.id}`, admin)).status === 200);

  console.log('\nDriver');
  await call(id('deliveries/my-route/actions.ts', 'stopProgress'), [form({ id: ord.id, status: 'en_route', lat: 26.13, lng: -81.79 })], driver, '/base/deliveries/my-route');
  const track1 = await (await get(`/track/${ord.tracking_token}`, '')).text();
  check('customer tracking page shows “on the way”', track1.includes('on the way'));
  const sig = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const del = await call(id('deliveries/my-route/actions.ts', 'completeStop'), [null, form({ id: ord.id, recipient_name: 'Jane', signature: sig, driver_notes: 'Placed in living room' })], driver, '/base/deliveries/my-route');
  const [{ data: ordDone }, { count: proofs }, { data: routeDone }] = await Promise.all([
    db.from('dl_orders').select('status, recipient_name').eq('id', ord.id).single(),
    db.from('dl_proofs').select('id', { count: 'exact', head: true }).eq('order_id', ord.id),
    db.from('dl_routes').select('status').eq('id', route.id).single(),
  ]);
  check('driver delivers with a signature', del.ok && ordDone.status === 'delivered' && ordDone.recipient_name === 'Jane' && proofs === 1);
  check('route completes after its last stop', routeDone.status === 'completed');
  check('tracking page shows Delivered', (await (await get(`/track/${ord.tracking_token}`, '')).text()).includes('Delivered'));
  check('bad tracking token → 404', (await get('/track/00000000000000000000000000000000', '')).status === 404);
  const { count: logged } = await db.from('crm_activities').select('id', { count: 'exact', head: true }).eq('deal_id', leadAfter.deal_id).ilike('subject', 'delivered order%');
  check('the delivery shows on the deal’s timeline', (logged ?? 0) === 1);
} catch (err) {
  failures++;
  console.error('\n✗ Test crashed:', err);
} finally {
  console.log('\nCleaning up');
  if (created.order) await db.from('dl_orders').delete().eq('id', created.order);
  if (created.route) await db.from('dl_routes').delete().eq('id', created.route);
  if (created.truck) await db.from('dl_trucks').delete().eq('id', created.truck);
  if (created.quote) await db.from('crm_quotes').delete().eq('id', created.quote);
  if (created.product) await db.from('crm_products').delete().eq('id', created.product);
  if (created.deal) await db.from('crm_deals').delete().eq('id', created.deal);
  if (created.lead) await db.from('crm_leads').delete().eq('id', created.lead);
  if (created.contact) await db.from('crm_contacts').delete().eq('id', created.contact);
  if (created.imported.length) await db.from('crm_contacts').delete().in('id', created.imported);
  await db.from('crm_companies').delete().eq('name', `${TAG} Interiors`);
  if (created.inquiry) await db.from('inquiries').delete().eq('id', created.inquiry);
  if (created.employee) await db.from('employees').delete().eq('id', created.employee);
  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
  process.exitCode = failures ? 1 : 0;
}
