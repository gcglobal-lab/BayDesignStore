'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  CalendarRange,
  CalendarX2,
  Clock3,
  Home,
  Inbox,
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
type Group = { label?: string; items: Item[] };

export type SidebarViewer = { name: string; level: 'employee' | 'manager' | 'admin'; onRoster: boolean; newInquiries?: number };

function navFor({ level, onRoster, newInquiries = 0 }: SidebarViewer): Group[] {
  const manager = level !== 'employee';
  const groups: Group[] = [];
  groups.push({
    items: [
      ...(manager ? [{ href: '/base/manager', label: 'Manager View', icon: LayoutDashboard }] : []),
      ...(onRoster ? [{ href: '/base/my-week', label: manager ? 'My Week' : 'Home', icon: Home }] : []),
    ],
  });
  if (manager) {
    groups.push({
      label: 'Team',
      items: [
        { href: '/base/team', label: 'Roster', icon: Users },
        { href: '/base/team/roles', label: 'Departments & Roles', icon: Tags },
      ],
    });
  }
  groups.push({
    label: 'Shifts',
    items: [
      { href: '/base/schedule', label: 'Schedule', icon: CalendarDays },
      { href: '/base/time-off', label: 'Time Off', icon: CalendarX2 },
      ...(onRoster ? [{ href: '/base/availability', label: 'My Availability', icon: CalendarRange }] : []),
      ...(manager ? [{ href: '/base/team-availability', label: 'Team Availability', icon: CalendarRange }] : []),
    ],
  });
  groups.push({
    label: 'Time',
    items: [{ href: '/base/timesheets', label: manager ? 'Timesheets' : 'My Timesheet', icon: Clock3 }],
  });
  if (manager) {
    groups.push({ label: 'Website', items: [{ href: '/base/inquiries', label: 'Inquiries', icon: Inbox, badge: newInquiries }] });
  }
  const account: Item[] = [];
  if (level === 'admin') account.push({ href: '/base/settings', label: 'Settings', icon: Settings });
  if (onRoster) account.push({ href: '/base/account', label: 'Account & Password', icon: UserRound });
  if (account.length) groups.push({ label: 'Account', items: account });
  return groups;
}

function isActive(pathname: string, href: string) {
  if (href === '/base/team') return pathname === '/base/team' || /^\/base\/team\/(?!roles)/.test(pathname);
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Nav({ viewer, pathname }: { viewer: SidebarViewer; pathname: string }) {
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="Bay Design Base">
      {navFor(viewer).map((group, i) => (
        <div key={group.label ?? i}>
          {group.label && <p className="mb-1.5 px-3 text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-ivory/35">{group.label}</p>}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.86rem] transition-all duration-200 ${
                      active ? 'bg-gradient-to-r from-brass via-[#7C3AED] to-[#DB2777] font-medium text-white shadow-[0_8px_22px_-10px_rgba(124,58,237,0.9)]' : 'text-ivory/70 hover:bg-white/[0.06] hover:text-ivory'
                    }`}
                  >
                    <item.icon size={17} strokeWidth={1.75} className={active ? 'text-white' : 'text-ivory/45 group-hover:text-brass-light'} />
                    {item.label}
                    {item.badge ? (
                      <span className="ml-auto rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-500 px-2 py-0.5 text-[0.68rem] font-semibold text-white shadow-sm" aria-label={`${item.badge} new`}>
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
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
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ivory">{viewer.name}</p>
          <p className="flex items-center gap-1 text-[0.68rem] capitalize text-ivory/45">
            {viewer.level === 'admin' && <ShieldCheck size={11} />} {viewer.level}
          </p>
        </div>
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
