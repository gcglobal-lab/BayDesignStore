'use client';

import ErrorScreen from '@/components/ui/ErrorScreen';

/** A portal page that fails shows this inside the portal (the menu stays usable). */
export default function Error(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorScreen {...props} />;
}
