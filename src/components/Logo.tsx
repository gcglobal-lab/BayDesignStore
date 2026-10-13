'use client';

import { shellBody, shellCoil, shellCentre } from './logoMark';

const INK = '#111111';
const PAPER = '#FFFFFF';

/**
 * The Bay Design nautilus mark, drawn like the original logo in every context:
 * black square, white shell, thin black outer frame with a white gap between.
 * The white backing keeps the frame and gap visible on dark backgrounds too.
 */
export function LogoMark({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg viewBox="-10 -10 120 120" className={className} aria-hidden="true">
      <rect x="-10" y="-10" width="120" height="120" fill={PAPER} />
      <rect x="-8.4" y="-8.4" width="116.8" height="116.8" fill="none" stroke={INK} strokeWidth="2" />
      <rect x="-4" y="-4" width="108" height="108" fill={INK} />
      <path d={shellBody} fill={PAPER} />
      <path d={shellCoil} fill={INK} />
      <circle {...shellCentre} fill={INK} />
    </svg>
  );
}

type LogoProps = {
  tone?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  tagline?: boolean;
  className?: string;
};

const sizes = {
  sm: { mark: 'h-9 w-9', word: 'text-[1.05rem]', tag: 'text-[0.5rem]' },
  md: { mark: 'h-11 w-11', word: 'text-[1.3rem]', tag: 'text-[0.55rem]' },
  lg: { mark: 'h-16 w-16', word: 'text-[2rem]', tag: 'text-[0.7rem]' },
};

export default function Logo({ tone = 'dark', size = 'md', tagline = true, className = '' }: LogoProps) {
  const s = sizes[size];
  // Only the wordmark adapts to the background; the mark itself always matches the original logo.
  const ink = tone === 'dark' ? '#1E1C19' : '#FBF8F3';
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <LogoMark
        className={`${s.mark} flex-none transition-transform duration-700 ease-lux group-hover:rotate-[8deg] ${tone === 'light' ? 'shadow-[0_4px_18px_rgba(0,0,0,0.35)]' : ''}`}
      />
      <span className="flex flex-col leading-none" style={{ color: ink }}>
        <span className={`font-brand ${s.word} tracking-[0.06em] whitespace-nowrap`}>
          B<span className="text-[0.82em]">AY</span> D<span className="text-[0.82em]">ESIGN</span> S<span className="text-[0.82em]">TORE</span>
        </span>
        {tagline && (
          <span className={`mt-1.5 max-[420px]:hidden ${s.tag} font-sans font-medium uppercase tracking-[0.32em] opacity-75 whitespace-nowrap`}>
            Fine Furniture <span className="mx-1 opacity-60">|</span> Interior Design
          </span>
        )}
      </span>
    </span>
  );
}
