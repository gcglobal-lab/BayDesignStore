import 'server-only';
import { companyInfo, faqs, services } from '@/data/siteData';

/** Everything the website assistant may say about the store. Kept in one place so answers stay accurate. */
export function storeKnowledge(): string {
  const c = companyInfo;
  return [
    `Business: ${c.name} — ${c.tagline}. Founded by ${c.founder} in Ann Arbor, Michigan in ${c.founded}; in Naples, Florida since ${c.naplesFounded}.`,
    `Downtown Naples showroom: ${c.address}. Phone ${c.phone}. Hours: ${c.hoursDowntown}.`,
    `Bay Design warehouse & North Naples showroom: ${c.warehouseAddress}. Phone ${c.warehousePhone}. Hours: ${c.hoursWarehouse}.`,
    `Email: ${c.email}. Instagram: ${c.instagram}. Facebook: ${c.facebook}.`,
    `Website pages: Home (/), Collections (/collections), Services (/services), Portfolio (/portfolio), About (/about), Journal (/blog), Contact (/contact).`,
    `Services:\n${services.map((s) => `- ${s.title}: ${s.description} (${s.features.join(', ')})`).join('\n')}`,
    `Frequently asked questions:\n${faqs.map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n')}`,
    `Philosophy: ${c.philosophy}`,
  ].join('\n\n');
}

export const STORE_SYSTEM_PROMPT = `You are the friendly online assistant for Bay Design Store, a fine-furniture store and interior design studio in Naples, Florida. You answer on behalf of the Bay Design Store contact team.

Rules:
- Use ONLY the store facts below for addresses, phone numbers, hours, services and policies. Never invent prices, stock, discounts, delivery dates or availability — say a designer will confirm.
- Keep answers short (2–5 sentences), warm and clear. Use plain text; short bullet lists are fine.
- If the visitor wants a consultation, quote, appointment, to check an item, or to be contacted — or you can't fully answer — offer to send their request to the team, and end your reply with the exact tag [[INQUIRY]] on its own line.
- Don't ask for payment details. Don't discuss topics unrelated to the store, furniture or interior design; politely steer back.

STORE FACTS
`;

/** How-to guide for Bay Design Base, the team's scheduling and time-clock app. */
export const BASE_GUIDE = `BAY DESIGN BASE — HOW IT WORKS (answer with these steps; menu names are exact)

Signing in
- Everyone signs in at /base/login with their Login ID and password. There is no sign-up and no self-service password reset: the admin creates and changes every password.
- Forgot your password? Ask the admin. Employees can ask this assistant to "send a password request to the admin".
- Admin: Team ▸ Roster shows every login ID and password in the "Login · Password" column (eye icon to reveal, copy button). Click a person's name to open their details and change anything, including the password (type one or press Generate, then Save). To remove a password, open the full profile ▸ Sign-in ▸ Remove password.
- Team members imported from Homebase start without a password: on Team ▸ Roster use "Passwords for N without one" to create them all at once, or set each one by clicking the name.

Menu
- Home ▸ Manager View (managers): who's working today live, paid hours, flagged time cards, approvals (time off, shift and availability requests), events, payroll reminder, manager log, team calendar.
- Home ▸ Calendar View (managers): the whole month at a glance — who worked each day and who is off; tap a day to see everyone.
- Home ▸ My Week: your time clock, shifts, open shifts, requests.
- My Tasks: your tasks from Team Tasks (see Workflow below), with a badge for tasks due.
- Team ▸ Roster: everyone; Add team member (choose Employee or Manager, pick roles from the dropdown, "+ Add role" creates a new role on the spot). Team ▸ Departments & Roles: role colours and which time clock each role gets (showroom, designer, warehouse, driver).
- Shifts ▸ Schedule: week grid; click an empty cell to add a shift, a shift to edit; dashed = draft; Publish (n) makes drafts visible; "Copy last week"; View by first/last name, role or hours; search; the eye hides someone from your view.
- Shifts ▸ Time Off: requests with ✓ approve / ✗ deny, "View history", hours approved per year and type, upcoming time off, paid-leave balances. Employees use "Request time off".
- Shifts ▸ My Availability / Team Availability: weekly preferred/available/unavailable times; managers approve changes.
- Timesheets: every punch with place and map. Filters: quick range, From → To calendar (click a start day, move across, click an end day), Month buttons Jan–Dec for a full month, team member. Open a punch to see its pin on the map. Download PDF, Excel or CSV. Managers can add or edit time cards (pencil icon).
- Reports: Hours summary, Payroll by pay period, Time cards, Attendance & punctuality, Time off, Team roster, Activity log, Website inquiries — preview, then PDF / Excel / CSV.
- Website: inquiries from the website contact form and chat.
- Settings (admin): Basic info, Stores & geofences, Schedule enforcement (early punch-in, late grace, week start), Time clock options (require location, only allow on site), Overtime, Payroll settings (pay period), Time off (paid leave days), Roles & passwords, Recent activity (every action in plain sentences; View shows details and what changed).

Time clock
- Home ▸ My Week ▸ Punch in. Allow location for the site the first time. It takes about 1–3 seconds. Off site is allowed (designers/drivers): the street address is recorded. Rest breaks are paid, meal breaks unpaid. Punch out the same way.
- If location is blocked: phone Settings ▸ Safari/Chrome ▸ Location ▸ Allow (iPhone: turn on Precise Location), then reload.

Troubleshooting
- "That login ID and password don't match": check the login ID (e.g. first.last) and ask the admin to confirm the password in Team ▸ Roster.
- "Too many sign-in attempts": wait 15 minutes.
- Signed out unexpectedly: the admin changed your password or access; sign in with the new password.

EMPLOYEE PORTAL — THREE APPS (Bay Design Base is now called the Employee Portal)
- The switch at the top of the menu bar moves between Time (everything above), Workflow (the CRM) and Deliveries. Time is for everyone; an admin turns on Workflow and Deliveries per person in Time ▸ Settings ▸ App access (or on a team member’s page). Admins can use everything.
- Workflow roles: User (works their own leads/deals, sees everyone’s) and Manager (also deletes, edits pipelines, automations and templates). Deliveries roles: Driver (sees only My Route) and Dispatcher (runs everything).
Workflow (CRM) — menu bar: Dashboard, Customers, Vendors, Workspace, Team Tasks
- Dashboard: pipeline value, weighted forecast, wins, win rate, today’s and overdue activities, new leads. Its row of tiles opens Leads, Deals, Contacts, Companies, Vendors, Activities, Quotes, Products, Reports, Automations and Settings.
- Customers: every customer and contact (the same list Deliveries uses). Search, filter by stage / owner / tag, New contact, Import CSV, Export. Click a name for their timeline, deals and details.
- Vendors: the suppliers the store buys from. New vendor asks for Name, Vendor number, Email, Address, and optionally CC, BCC (several addresses separated by commas) and the contact person’s email. Each row has ✏️ edit and 🗑 delete; search by name, number, email or address. Vendor numbers must be unique.
- Workspace: monday.com-style boards. Pick a workspace at the top (+ to create one, Manage workspace for members and roles); add boards and folders under Content.
  - A board has groups (coloured sections) of items (rows) and columns: Status, Dropdown, Text, Long text, Date, Timeline, People, Person, Numbers, Money, Formula, Files, Checkbox, Phone, Email, Link. "+" at the end of the header adds a column; click a column name to rename it; its ⋯ menu sorts, hides, moves, edits labels/formula or deletes it.
  - "+ Add new item" at the bottom of a group, or New item at the top. Click a name to rename it; the ⤢ icon opens the item’s details panel (all fields, sub-items, updates/comments, files, PDF/Excel export).
  - Sub-items: the + next to a row adds a sub-item; any sub-item can have its own sub-items (level 2, 3, …). Each level has its own columns: a column added to a table also appears in every level below it, but deleting it from a sub-item table removes it only there. A column added inside a sub-item table never changes the table above. 🗑 at the end of a sub-item row deletes it (and anything under it); "Delete all" in a sub-item table’s header deletes the whole sub-item table.
  - Toolbar: Search, Person, Filter, Sort, Hide, Group by; Main table or Cards view; tick rows to move, duplicate or delete several.
- Team Tasks: everyone’s tasks. Create task (title, assign to one or several people, due date, priority, list, checklist, files, comments). Views: My tasks, Assigned by me, Everyone (leads/managers); quick filters for Overdue, Due today, Done this week. Tick to mark done.
- Leads: website form and chat requests arrive here automatically. Open one → Convert to deal, Mark as contacted, Disqualify, or Take it.
- Deals: board (drag cards between stages; drop on Won or Lost) or list. Open a deal to change its stage, add notes, schedule calls/meetings/to-dos, email from a template, create a quote, or (dispatchers) schedule a delivery.
- Contacts & Companies: customer records with timelines. Contacts ▸ Import loads a CSV; Export downloads one.
- Activities: overdue / today / upcoming lists and a month calendar; tick to complete, +1d / +1w to postpone.
- Sales ▸ Quotes and Products: line items, discounts, tax, delivery fee; Print / PDF; Mark as sent / Accepted (updates the deal value).
- Reports, Automations (managers: “when … then …” rules) and Settings (Appearance light/dark for everyone; pipelines, stages, lists, lead routing, quote terms, email templates for managers).
Deliveries — menu bar: Dashboard, Orders, Customers, Dispatch Board, Post-delivery, Calendar, My Route, Trucks & Crews, Reports, Settings
- Orders: New order. In the customer box, type to search customers (it fills phone, email and address), or click "Add new customer" to open a quick popup (Name, Email, Phone number, Address); it saves the customer and selects them on the order. Then the service, date and time window, items, driver instructions and balance to collect. There is no deal field. Each order has a customer tracking link (Copy link / Email it).
- Customers: the shared customer list (also Workflow ▸ Customers). New customer (Name, Email, Phone number, Address); search; each row shows its order count and has a "New order" button that starts an order for that customer.
- Post-delivery: every completed stop with its proof of delivery, the customer’s rating and the office follow-up (to do / done / issue, with a note); filter and export.
- Dispatch Board: pick a day, Add route (truck + driver + helper), add orders to routes, Optimize, or Auto-plan day; then Dispatch so drivers see it. Print the route sheet.
- My Route (drivers, on the phone): Start route, Directions, Call, On my way, Arrived, Delivered (name, signature, photos) or Problem (reason).
- Calendar (capacity per day), Trucks & Crews, Reports (on-time %, failures, drivers) and Settings (warehouse address, start time, speed, failure reasons).
`;
