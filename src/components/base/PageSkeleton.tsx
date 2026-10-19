/**
 * Placeholder shown the instant someone clicks a link, while the page's data loads
 * (used by the loading.tsx files). Shapes only — no data, no client JavaScript.
 */
const Bar = ({ className = '' }: { className?: string }) => <div className={`animate-pulse rounded-lg bg-stone/45 ${className}`} />;

export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-6">
      <div className="space-y-2.5">
        <Bar className="h-8 w-64" />
        <Bar className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Bar key={i} className="h-24" />)}
      </div>
      <div className="space-y-2 rounded-2xl border border-stone/50 p-4">
        {[0, 1, 2, 3, 4, 5].map((i) => <Bar key={i} className="h-10" />)}
      </div>
    </div>
  );
}

/** Board-shaped placeholder: title, toolbar, then a table per group. */
export function BoardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-5">
      <Bar className="h-8 w-56" />
      <div className="flex gap-2">
        <Bar className="h-8 w-28" />
        {[0, 1, 2, 3, 4].map((i) => <Bar key={i} className="h-8 w-20" />)}
      </div>
      {[0, 1].map((g) => (
        <div key={g} className="space-y-2">
          <Bar className="h-5 w-44" />
          <div className="space-y-1.5 rounded-md border border-stone/50 p-2">
            {[0, 1, 2].map((i) => <Bar key={i} className="h-9" />)}
          </div>
        </div>
      ))}
    </div>
  );
}
