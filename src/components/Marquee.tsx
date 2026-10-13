'use client';

import { Fragment } from 'react';

type MarqueeProps = {
  items: string[];
  className?: string;
  reverse?: boolean;
};

/** Infinite horizontal ticker. The list is rendered twice so the -50% loop is seamless. */
export default function Marquee({ items, className = '', reverse = false }: MarqueeProps) {
  const row = (
    <div className="flex flex-none items-center" aria-hidden="true">
      {items.map((item) => (
        <Fragment key={item}>
          <span className="whitespace-nowrap px-8">{item}</span>
          <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none fill-brass">
            <path d="M12 0c.6 6.4 5.6 11.4 12 12-6.4.6-11.4 5.6-12 12-.6-6.4-5.6-11.4-12-12C6.4 11.4 11.4 6.4 12 0z" />
          </svg>
        </Fragment>
      ))}
    </div>
  );
  return (
    <div className={`group flex overflow-hidden ${className}`}>
      <div
        className="flex animate-marquee group-hover:[animation-play-state:paused]"
        style={reverse ? { animationDirection: 'reverse' } : undefined}
      >
        {row}
        {row}
      </div>
      <span className="sr-only">{items.join(', ')}</span>
    </div>
  );
}
