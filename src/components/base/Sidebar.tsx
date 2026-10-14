'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  CalendarX2,
  ChevronDown,
  Clock3,
  Globe,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Tags,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { LogoMark } from '@/components/Logo';
import { Avatar } from './ui';
import { signOut } from '@/app/base/login/actions';

type Item = { href: string; label: string; icon: LucideIcon; badge?: number };
/** A dropdown (with children) or a single link. */
type Entry = { label: string; icon: LucideIcon; items: Item[]; href?: undefined } | (Item & { items?: undefined });

export type SidebarViewer = { name: string; level: 'employee' | 'manager' | 'admin'; onRoster: boolean; newInquiries?: number };

function navFor({ level, onRoster, newInquiries = 0 }: SidebarViewer): Entry[] {
  const manager = level !== 'employee';
  const entries: Entry[] = [];
  const home: Item[] = [
    ...(manager ? [{ href: '/base/manager', label: 'Manager View', icon: LayoutDashboard }] : []),
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
      ...(manager ? [{ href: '/base/calendar', label: 'Calendar View', icon: CalendarRange }] : []),
      { href: '/base/time-off', label: 'Time Off', icon: CalendarX2 },
      ...(onRoster ? [{ href: '/base/availability', label: 'My Availability', icon: CalendarRange }] : []),
      ...(manager ? [{ href: '/base/team-availability', label: 'Team Availability', icon: CalendarRange }] : []),
    ],
  });
  entries.push({ href: '/base/timesheets', label: manager ? 'Timesheets' : 'My Timesheet', icon: Clock3 });
  if (manager) {
    entries.push({ href: '/base/reports', label: 'Reports', icon: BarChart3 });
    entries.push({ href: '/base/inquiries', label: 'Website', icon: Globe, badge: newInquiries });
  }
  if (level === 'admin') entries.push({ href: '/base/settings', label: 'Settings', icon: Settings });
  return entries;
}

function isActive(pathname: string, href: string) {
  if (href === '/base/team') return pathname === '/base/team' || /^\/base\/team\/(?!roles)/.test(pathname);
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Link_({ item, active, nested }: { item: Item; active: boolean; nested?: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`group flex items-center gap-3 rounded-xl px-3 ${nested ? 'py-2 text-[0.84rem]' : 'py-2.5 text-[0.9rem]'} transition-all duration-200 ${
        active ? 'bg-gradient-to-r from-brass via-[#7C3AED] to-[#DB2777] font-medium text-white shadow-[0_8px_22px_-10px_rgba(124,58,237,0.9)]' : 'text-ivory/75 hover:bg-white/[0.07] hover:text-ivory'
      }`}
    >
      {!nested && <item.icon size={18} strokeWidth={1.75} className={active ? 'text-white' : 'text-ivory/50 group-hover:text-brass-light'} />}
      {item.label}
      {item.badge ? (
        <span className="ml-auto rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-500 px-2 py-0.5 text-[0.68rem] font-semibold text-white shadow-sm" aria-label={`${item.badge} new`}>
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

function Group({ entry, pathname }: { entry: Extract<Entry, { items: Item[] }>; pathname: string }) {
  const containsActive = entry.items.some((i) => isActive(pathname, i.href));
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
        className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[0.9rem] transition-colors ${containsActive ? 'text-ivory' : 'text-ivory/75 hover:bg-white/[0.07] hover:text-ivory'}`}
      >
        <entry.icon size={18} strokeWidth={1.75} className={containsActive ? 'text-brass-light' : 'text-ivory/50 group-hover:text-brass-light'} />
        {entry.label}
        <ChevronDown size={15} className={`ml-auto text-ivory/45 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`grid transition-[grid-template-rows] duration-200 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <ul className="ml-[1.35rem] space-y-0.5 overflow-hidden border-l border-white/10 pl-3">
          {entry.items.map((item) => (
            <li key={item.href} className="first:mt-1 last:mb-1">
              <Link_ item={item} active={isActive(pathname, item.href)} nested />
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

function Nav({ viewer, pathname }: { viewer: SidebarViewer; pathname: string }) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Bay Design Base">
      <ul className="space-y-1">
        {navFor(viewer).map((entry) =>
          entry.items ? (
            <Group key={entry.label} entry={entry} pathname={pathname} />
          ) : (
            <li key={entry.href}>
              <Link_ item={entry} active={isActive(pathname, entry.href)} />
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/base" className="flex items-center gap-3 px-5 py-5">
      <LogoMark className="h-9 w-9 flex-none" />
      <span className="leading-none">
        <span className="block font-brand text-[1.02rem] tracking-[0.06em] text-ivory">BAY DESIGN BASE</span>
        <span className="mt-1 block text-[0.56rem] uppercase tracking-[0.28em] text-ivory/45">Bay Design Store</span>
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
          <p className="flex items-center gap-1 truncate text-sm font-medium text-ivory">{viewer.name} <UserRound size={11} className="text-ivory/40" /></p>
          <p className="flex items-center gap-1 text-[0.68rem] capitalize text-ivory/45">
            {viewer.level === 'admin' && <ShieldCheck size={11} />} {viewer.level}
          </p>
        </Link>
        <form action={signOut}>
          <button type="submit" className="rounded-lg p-2 text-ivory/50 transition-colors hover:bg-white/10 hover:text-ivory" aria-label="Sign out" title="Sign out">
            <LogOut size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}

export default function Sidebar({ viewer }: { viewer: SidebarViewer }) {
  const pathname = usePathname() ?? '/base';
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      {/* Desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-gradient-to-b from-ink via-[#1E1B4B] to-charcoal lg:flex">
        <Brand />
        <Nav viewer={viewer} pathname={pathname} />
        <ViewerCard viewer={viewer} />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-ink px-3 py-2 lg:hidden">
        <Link href="/base" className="flex items-center gap-2.5 px-1">
          <LogoMark className="h-8 w-8" />
          <span className="font-brand text-sm tracking-[0.06em] text-ivory">BAY DESIGN BASE</span>
        </Link>
        <button type="button" onClick={() => setOpen(true)} className="rounded-xl p-2.5 text-ivory" aria-label="Open menu" aria-expanded={open}>
          <Menu size={20} />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-label="Close menu" />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-gradient-to-b from-ink via-[#1E1B4B] to-charcoal shadow-2xl">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl p-2 text-ivory/70" aria-label="Close menu">
                <X size={20} />
              </button>
            </div>
            <Nav viewer={viewer} pathname={pathname} />
            <ViewerCard viewer={viewer} />
          </aside>
        </div>
      )}
    </>
  );
}
