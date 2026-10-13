'use client';

import { Printer } from 'lucide-react';

export default function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="b-btn-ghost !p-2.5" aria-label="Print" title="Print">
      <Printer size={15} />
    </button>
  );
}
