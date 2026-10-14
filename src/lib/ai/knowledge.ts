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
- Home ▸ My Week: your time clock, shifts, open shifts, requests.
- Team ▸ Roster: everyone; Add team member (choose Employee or Manager, pick roles from the dropdown, "+ Add role" creates a new role on the spot). Team ▸ Departments & Roles: role colours and which time clock each role gets (showroom, designer, warehouse, driver).
- Shifts ▸ Schedule: week grid; click an empty cell to add a shift, a shift to edit; dashed = draft; Publish (n) makes drafts visible; "Copy last week"; View by first/last name, role or hours; search; the eye hides someone from your view.
- Shifts ▸ Time Off: requests with ✓ approve / ✗ deny, "View history", hours approved per year and type, upcoming time off, paid-leave balances. Employees use "Request time off".
- Shifts ▸ My Availability / Team Availability: weekly preferred/available/unavailable times; managers approve changes.
- Timesheets: every punch with place and map. Filters: quick range, From → To calendar (click a start day, move across, click an end day), Month buttons Jan–Dec for a full month, team member. "Punch map" shows everyone's punch-in/out pins. Download PDF, Excel or CSV. Managers can add or edit time cards (pencil icon).
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
`;
