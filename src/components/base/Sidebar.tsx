'use client';

import { useEffect, useState, useSyncExternalStore, useTransition } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  CalendarX2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Contact,
  Globe,
  Home,
  LayoutDashboard,
  LayoutGrid,
  ListTodo,
  LogOut,
  Map,
  Menu,
  Moon,
  Navigation,
  PackageCheck,
  Settings,
  ShieldCheck,
  Sun,
  Tags,
  Truck,
  UserRound,
  Users,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react';
import { LogoMark } from '@/components/Logo';
import { Avatar } from './ui';
import { signOut } from '@/app/base/login/actions';
import { setTheme } from '@/app/base/theme-actions';
import WorkflowSearch, { SearchButton } from '@/components/portal/WorkflowSearch';
import { APPS, appOf, appsFor, PORTAL_NAME, type AppKey, type CrmRole, type DeliveriesRole } from '@/lib/portal/apps';

type Item = { href: string; label: string; icon: LucideIcon; badge?: number; exact?: boolean; match?: (pathname: string) => boolean };
/** A dropdown (with children) or a single link. */
type Entry = { label: string; icon: LucideIcon; items: Item[]; href?: undefined } | (Item & { items?: undefined });

export type SidebarViewer = {
  name: string;
  level: 'employee' | 'manager' | 'admin';
  onRoster: boolean;
  crm: CrmRole;
  deliveries: DeliveriesRole;
  newInquiries?: number;
  newLeads?: number;
  tasksDue?: number;
};

function timeNav({ level, onRoster, newInquiries = 0, tasksDue = 0 }: SidebarViewer): Entry[] {
  const manager = level !== 'employee';
  const entries: Entry[] = [];
  const home: Item[] = [
    ...(manager ? [{ href: '/base/manager', label: 'Manager View', icon: LayoutDashboard }] : []),
    ...(manager ? [{ href: '/base/calendar', label: 'Calendar View', icon: CalendarRange }] : []),
    // Managers' home is Manager View; My Week (the personal time clock) is for employees.
    ...(onRoster && !manager ? [{ href: '/base/my-week', label: 'My Week', icon: Home }] : []),
  ];
  if (home.length > 1 || manager) entries.push({ label: 'Home', icon: Home, items: home });
  else if (home.length === 1) entries.push({ ...home[0], label: 'Home', icon: Home });
  if (manager) {
    entries.push({
      label: 'Team',
      icon: Users,
      items: [
        { href: '/base/team', label: 'Roster', icon: Users },
        { href: '/base/team/roles', label: 'Departments & Roles', icon: Tags },
      ],
    });
  }
  entries.push({
    label: 'Shifts',
    icon: CalendarDays,
    items: [
      { href: '/base/schedule', label: 'Schedule', icon: CalendarDays },
      { href: '/base/time-off', label: 'Time Off', icon: CalendarX2 },
      ...(onRoster ? [{ href: '/base/availability', label: 'My Availability', icon: CalendarRange }] : []),
      ...(manager ? [{ href: '/base/team-availability', label: 'Team Availability', icon: CalendarRange }] : []),
    ],
  });
  entries.push({ href: '/base/timesheets', label: manager ? 'Timesheets' : 'My Timesheet', icon: Clock3 });
  entries.push({ href: '/base/crm/tasks', label: 'My Tasks', icon: ListTodo, badge: tasksDue });
  if (manager) {
    entries.push({ href: '/base/reports', label: 'Reports', icon: BarChart3 });
    entries.push({ href: '/base/inquiries', label: 'Website', icon: Globe, badge: newInquiries });
  }
  if (level === 'admin') entries.push({ href: '/base/settings', label: 'Settings', icon: Settings });
  return entries;
}

/** Workflow: the dashboard (with the sales tools), customers, the workspace, and tasks. */
function crmNav({ crm, newLeads = 0, tasksDue = 0 }: SidebarViewer): Entry[] {
  const tasks: Item = { href: '/base/crm/tasks', label: 'Team Tasks', icon: ListTodo, badge: tasksDue };
  if (crm === 'none') return [tasks];
  return [
    { href: '/base/crm', label: 'Dashboard', icon: LayoutDashboard, badge: newLeads, match: (p) => p === '/base/crm' || (p.startsWith('/base/crm/') && !/^\/base\/crm\/(workspace|tasks|boards|contacts)/.test(p)) },
    { href: '/base/crm/contacts', label: 'Customers', icon: Contact },
    { href: '/base/crm/workspace', label: 'Workspace', icon: LayoutGrid, match: (p) => p.startsWith('/base/crm/workspace') || p.startsWith('/base/crm/boards') },
    tasks,
  ];
}

function deliveriesNav({ deliveries, onRoster }: SidebarViewer): Entry[] {
  if (deliveries !== 'dispatcher') return [{ href: '/base/deliveries/my-route', label: 'My Route', icon: Navigation }];
  return [
    { href: '/base/deliveries', label: 'Dashboard', icon: LayoutDashboard, exact: true },
    { href: '/base/deliveries/orders', label: 'Orders', icon: PackageCheck },
    { href: '/base/deliveries/customers', label: 'Customers', icon: Contact },
    { href: '/base/deliveries/dispatch', label: 'Dispatch Board', icon: Map },
    { href: '/base/deliveries/post-delivery', label: 'Post-delivery', icon: ClipboardCheck },
    { href: '/base/deliveries/calendar', label: 'Calendar', icon: CalendarDays },
    ...(onRoster ? [{ href: '/base/deliveries/my-route', label: 'My Route', icon: Navigation }] : []),
    { href: '/base/deliveries/trucks', label: 'Trucks & Crews', icon: Truck },
    { href: '/base/deliveries/reports', label: 'Reports', icon: BarChart3 },
    { href: '/base/deliveries/settings', label: 'Settings', icon: Settings },
  ];
}

const navFor = (viewer: SidebarViewer, app: AppKey) => (app === 'crm' ? crmNav(viewer) : app === 'deliveries' ? deliveriesNav(viewer) : timeNav(viewer));

function isActive(pathname: string, item: Item) {
  if (item.match) return item.match(pathname);
  if (item.exact) return pathname === item.href;
  if (item.href === '/base/team') return pathname === '/base/team' || /^\/base\/team\/(?!roles)/.test(pathname);
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function Link_({ item, active, nested, app }: { item: Item; active: boolean; nested?: boolean; app: AppKey }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`group flex items-center gap-3 rounded-xl px-3 ${nested ? 'py-2 text-[0.84rem]' : 'py-2.5 text-[0.9rem]'} transition-all duration-200 ${
        active ? (app === 'crm' ? 'bg-[#1164A3] font-medium text-white' : 'bg-gradient-to-r from-[#6366F1] via-[#7C3AED] to-[#DB2777] font-medium text-white shadow-[0_8px_22px_-10px_rgba(124,58,237,0.9)]') : 'text-white/75 hover:bg-white/[0.07] hover:text-white'
      }`}
    >
      {!nested && <item.icon size={18} strokeWidth={1.75} className={active ? 'text-white' : 'text-white/50 group-hover:text-violet-400'} />}
      {item.label}
      {item.badge ? (
        <span className="ml-auto rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-500 px-2 py-0.5 text-[0.68rem] font-semibold text-white shadow-sm" aria-label={`${item.badge} new`}>
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

function Group({ entry, pathname, app }: { entry: Extract<Entry, { items: Item[] }>; pathname: string; app: AppKey }) {
  const containsActive = entry.items.some((i) => isActive(pathname, i));
  const [open, setOpen] = useState(containsActive);
  useEffect(() => {
    if (containsActive) setOpen(true);
  }, [containsActive]);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[0.9rem] transition-colors ${containsActive ? 'text-white' : 'text-white/75 hover:bg-white/[0.07] hover:text-white'}`}
      >
        <entry.icon size={18} strokeWidth={1.75} className={containsActive ? 'text-violet-400' : 'text-white/50 group-hover:text-violet-400'} />
        {entry.label}
        <ChevronDown size={15} className={`ml-auto text-white/45 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`grid transition-[grid-template-rows] duration-200 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <ul className="ml-[1.35rem] space-y-0.5 overflow-hidden border-l border-white/10 pl-3">
          {entry.items.map((item) => (
            <li key={item.href} className="first:mt-1 last:mb-1">
              <Link_ item={item} active={isActive(pathname, item)} nested app={app} />
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

const APP_ICONS: Record<AppKey, LucideIcon> = { time: Clock3, crm: Workflow, deliveries: Truck };

/** The toggle between the three apps (only the ones this person can open). */
function AppSwitcher({ viewer, app }: { viewer: SidebarViewer; app: AppKey }) {
  const apps = appsFor(viewer);
  if (apps.length < 2) return null;
  return (
    <div className="px-3 pb-1">
      <div className="grid gap-1 rounded-2xl bg-white/[0.06] p-1 ring-1 ring-white/10" style={{ gridTemplateColumns: `repeat(${apps.length}, minmax(0, 1fr))` }} role="tablist" aria-label="Switch app">
        {apps.map((key) => {
          const Icon = APP_ICONS[key];
          const on = key === app;
          return (
            <Link
              key={key}
              href={APPS[key].home}
              role="tab"
              aria-selected={on}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[0.68rem] font-semibold tracking-wide transition-all ${
                on ? (key === 'crm' ? 'bg-[#1164A3] text-white' : 'bg-gradient-to-br from-[#6366F1] to-[#7C3AED] text-white shadow-[0_6px_16px_-8px_rgba(124,58,237,0.9)]') : 'text-white/60 hover:bg-white/[0.07] hover:text-white'
              }`}
            >
              <Icon size={16} strokeWidth={2} />
              {APPS[key].label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** Light / dark switch for Workflow (and Deliveries), right in the menu. */
function ThemeToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      role="switch"
      aria-checked={dark}
      className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[0.9rem] text-white/75 transition-colors hover:bg-white/[0.07] hover:text-white"
    >
      {dark ? <Moon size={18} strokeWidth={1.75} className="text-white/50 group-hover:text-violet-400" /> : <Sun size={18} strokeWidth={1.75} className="text-white/50 group-hover:text-violet-400" />}
      Theme
      <span className="ml-auto flex items-center gap-2 text-[0.72rem] text-white/50">
        {dark ? 'Dark' : 'Light'}
        <span className={`relative h-5 w-9 rounded-full transition-colors ${dark ? 'bg-[#1164A3]' : 'bg-white/20'}`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${dark ? 'left-[1.15rem]' : 'left-0.5'}`} />
        </span>
      </span>
    </button>
  );
}

function Nav({ viewer, pathname, app, theme }: { viewer: SidebarViewer; pathname: string; app: AppKey; theme: { dark: boolean; toggle: () => void } }) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label={`${APPS[app].label} menu`}>
      <ul className="space-y-1">
        {navFor(viewer, app).map((entry) =>
          entry.items ? (
            <Group key={entry.label} entry={entry} pathname={pathname} app={app} />
          ) : (
            <li key={entry.href}>
              <Link_ item={entry} active={isActive(pathname, entry)} app={app} />
            </li>
          ),
        )}
        {app === 'crm' && (
          <li>
            <ThemeToggle dark={theme.dark} onToggle={theme.toggle} />
          </li>
        )}
      </ul>
    </nav>
  );
}

function Brand({ app }: { app: AppKey }) {
  return (
    <Link href={APPS[app].home} className="flex items-center gap-3 px-5 py-5">
      <LogoMark className="h-9 w-9 flex-none" />
      <span className="leading-none">
        <span className="block font-brand text-[1.02rem] uppercase tracking-[0.06em] text-white">{PORTAL_NAME}</span>
        <span className="mt-1 block text-[0.56rem] uppercase tracking-[0.28em] text-white/45">Bay Design Store · {APPS[app].label}</span>
      </span>
    </Link>
  );
}

function ViewerCard({ viewer }: { viewer: SidebarViewer }) {
  return (
    <div className="border-t border-white/10 p-3">
      <div className="flex items-center gap-3 rounded-xl px-2 py-2">
        <Avatar name={viewer.name} size="sm" />
        <Link href="/base/account" className="min-w-0 flex-1 rounded-lg hover:bg-white/[0.06]" title="My profile">
          <p className="flex items-center gap-1 truncate text-sm font-medium text-white">{viewer.name} <UserRound size={11} className="text-white/40" /></p>
          <p className="flex items-center gap-1 text-[0.68rem] capitalize text-white/45">
            {viewer.level === 'admin' && <ShieldCheck size={11} />} {viewer.level}
          </p>
        </Link>
        <button
          type="button"
          onClick={async () => {
            await signOut();
            // Full page load (replacing this history entry) drops every cached signed-in page.
            window.location.replace('/base/login');
          }}
          className="rounded-lg p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </div>
  );
}

const PANELS: Record<AppKey, string> = {
  time: 'bg-gradient-to-b from-[#17173A] via-[#1E1B4B] to-[#312E81]',
  // All three apps share the same menu bar colour.
  crm: 'bg-gradient-to-b from-[#17173A] via-[#1E1B4B] to-[#312E81]',
  deliveries: 'bg-gradient-to-b from-[#17173A] via-[#1E1B4B] to-[#312E81]',
};
/** Menu bar in dark mode (Workflow and Deliveries): deep navy blue to match the page. */
const DARK_PANEL = 'bg-gradient-to-b from-[#06101F] via-[#0A1A35] to-[#0F2550]';

const darkQuery = '(prefers-color-scheme: dark)';
const subscribeDark = (cb: () => void) => {
  const m = window.matchMedia(darkQuery);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};

export default function Sidebar({ viewer, theme }: { viewer: SidebarViewer; theme: 'light' | 'dark' | 'system' }) {
  const pathname = usePathname() ?? '/base';
  const app = appOf(pathname);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const canSearch = app === 'crm';

  // The switch flips straight away; the saved choice then re-renders the page in that theme.
  const systemDark = useSyncExternalStore(subscribeDark, () => window.matchMedia(darkQuery).matches, () => false);
  const [picked, setPicked] = useState<'light' | 'dark' | null>(null);
  useEffect(() => setPicked(null), [theme]);
  const dark = picked ? picked === 'dark' : theme === 'dark' || (theme === 'system' && systemDark);
  const [, startTheme] = useTransition();
  const toggleTheme = () => {
    const next = dark ? 'light' : 'dark';
    setPicked(next);
    document.querySelector('main[data-theme]')?.setAttribute('data-theme', next);
    const fd = new FormData();
    fd.set('theme', next);
    startTheme(() => setTheme(fd));
  };
  const themeCtl = { dark, toggle: toggleTheme };
  // Time always keeps its usual look; Workflow and Deliveries follow the light / dark choice.
  const panel = dark && app !== 'time' ? DARK_PANEL : PANELS[app];

  useEffect(() => setOpen(false), [pathname]);

  // Ctrl / ⌘ + K opens Workflow search.
  useEffect(() => {
    if (!canSearch) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(false);
        setSearching(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canSearch]);
  const openSearch = () => {
    setOpen(false);
    setSearching(true);
  };

  // A page restored from the browser's back/forward cache skips the server, so it could show a
  // signed-in screen after sign-out. Reload it instead — the proxy then sends signed-out people to sign in.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  return (
    <>
      {/* Desktop */}
      <aside className={`fixed inset-y-0 left-0 z-30 hidden w-64 flex-col print:!hidden lg:flex ${panel}`}>
        <Brand app={app} />
        <AppSwitcher viewer={viewer} app={app} />
        {canSearch && <SearchButton onOpen={openSearch} />}
        <Nav viewer={viewer} pathname={pathname} app={app} theme={themeCtl} />
        <ViewerCard viewer={viewer} />
      </aside>
      {canSearch && <WorkflowSearch open={searching} onClose={() => setSearching(false)} dark={dark} />}

      {/* Mobile top bar */}
      <header className={`sticky top-0 z-30 flex items-center justify-between border-b border-white/10 px-3 py-2 print:hidden lg:hidden ${dark && app !== 'time' ? 'bg-[#06101F]' : 'bg-[#17173A]'}`}>
        <Link href={APPS[app].home} className="flex items-center gap-2.5 px-1">
          <LogoMark className="h-8 w-8" />
          <span className="font-brand text-sm uppercase tracking-[0.06em] text-white">
            {PORTAL_NAME} <span className="text-white/50">· {APPS[app].label}</span>
          </span>
        </Link>
        <button type="button" onClick={() => setOpen(true)} className="rounded-xl p-2.5 text-white" aria-label="Open menu" aria-expanded={open}>
          <Menu size={20} />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-label="Close menu" />
          <aside className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col shadow-2xl ${panel}`}>
            <div className="flex items-center justify-between pr-3">
              <Brand app={app} />
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl p-2 text-white/70" aria-label="Close menu">
                <X size={20} />
              </button>
            </div>
            <AppSwitcher viewer={viewer} app={app} />
            {canSearch && <SearchButton onOpen={openSearch} />}
            <Nav viewer={viewer} pathname={pathname} app={app} theme={themeCtl} />
            <ViewerCard viewer={viewer} />
          </aside>
        </div>
      )}
    </>
  );
}
