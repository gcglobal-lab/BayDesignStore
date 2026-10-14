'use client';

import { useRouter } from 'next/navigation';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { DatePicker } from './calendar/Calendar';

/** The "Oct 12, 2026 – Oct 18, 2026" pill: opens a calendar to jump to any week (or day). */
export default function WeekJump({ label, value, href, param = 'week', extra = {}, zone, weekStart }: { label: string; value: string; href: string; param?: string; extra?: Record<string, string>; zone: string; weekStart: number }) {
  const router = useRouter();
  return (
    <DatePicker
      value={value}
      zone={zone}
      weekStart={weekStart}
      onChange={(d) => d && router.push(`${href}?${new URLSearchParams({ ...extra, [param]: d }).toString()}`)}
      trigger={() => (
        <span className="inline-flex items-center gap-2.5 rounded-xl border border-stone bg-white px-4 py-2.5 text-[0.95rem] font-medium text-ink shadow-sm transition-colors hover:border-violet-300">
          <CalendarDays size={17} className="text-muted" /> {label} <ChevronDown size={14} className="text-muted" />
        </span>
      )}
    />
  );
}
