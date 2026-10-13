import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

/** "‹ Oct 5 – Oct 11, 2026 ›" week switcher driven by a ?week= search param (or another param name). */
export default function WeekNav({
  basePath,
  label,
  prev,
  next,
  today,
  param = 'week',
  extra = {},
}: {
  basePath: string;
  label: string;
  prev: string;
  next: string;
  today?: string;
  param?: string;
  extra?: Record<string, string>;
}) {
  const href = (value: string) => `${basePath}?${new URLSearchParams({ ...extra, [param]: value }).toString()}`;
  return (
    <div className="flex items-center gap-1.5">
      {today && (
        <Link href={href(today)} className="b-btn-ghost !py-2">
          Today
        </Link>
      )}
      <Link href={href(prev)} className="b-btn-ghost !p-2.5" aria-label="Previous">
        <ChevronLeft size={16} />
      </Link>
      <span className="inline-flex items-center gap-2 rounded-full border border-stone bg-white/80 px-4 py-2 text-sm font-medium">
        <CalendarDays size={15} className="text-brass" /> {label}
      </span>
      <Link href={href(next)} className="b-btn-ghost !p-2.5" aria-label="Next">
        <ChevronRight size={16} />
      </Link>
    </div>
  );
}
