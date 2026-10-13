import type { Metadata } from 'next';
import AvailabilityEditor from '@/components/base/AvailabilityEditor';
import { Card, PageHeader, StatusBadge } from '@/components/base/ui';
import { requireEmployee } from '@/lib/base/auth';
import { availabilityOn, listAvailability } from '@/lib/base/availability';
import { getSettings } from '@/lib/base/settings';
import { fmtDate, todayYmd } from '@/lib/base/time';

export const metadata: Metadata = { title: 'My Availability' };

export default async function MyAvailabilityPage() {
  const viewer = await requireEmployee();
  const { timezone } = await getSettings();
  const today = todayYmd(timezone);
  const requests = await listAvailability(viewer.employeeId);
  const current = availabilityOn(requests, viewer.employeeId, today);
  const pending = requests.find((r) => r.status === 'pending');
  const shown = pending ?? current;

  return (
    <>
      <PageHeader
        eyebrow="Shifts"
        title="My Availability"
        description="Tell your managers when you prefer to work, or can’t. Changes are sent for approval before they show on the schedule."
      />
      <Card
        title={
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">
              {shown ? `${shown === pending ? 'Requested' : 'Current'} · effective ${fmtDate(shown.effective_from, timezone, 'MMM d, yyyy')}` : 'No availability set — you’re treated as available any time'}
            </span>
            {shown && <StatusBadge status={shown.status} />}
          </div>
        }
      >
        <AvailabilityEditor key={shown?.id ?? 'none'} initial={shown?.slots ?? []} defaultEffective={today} />
      </Card>
    </>
  );
}
