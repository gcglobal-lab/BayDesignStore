'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/** Next scrolls to the top on navigation; this handles links to an anchor on another page (e.g. /services#design). */
export default function ScrollToTop() {
  const pathname = usePathname();

  useEffect(() => {
    const { hash } = window.location;
    if (!hash) return;
    // Wait for the new page to render before looking for the anchor.
    const id = window.setTimeout(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 350);
    return () => window.clearTimeout(id);
  }, [pathname]);

  return null;
}
