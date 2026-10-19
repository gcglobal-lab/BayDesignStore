import { PageSkeleton } from '@/components/base/PageSkeleton';

/** Shown instantly on every click inside the portal while the next page's data loads. */
export default function Loading() {
  return <PageSkeleton />;
}
