import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, CalendarClock, MapPin, ShieldCheck } from 'lucide-react';
import { LogoMark } from '@/components/Logo';
import LoginForm from './LoginForm';

export const metadata: Metadata = {
  title: { absolute: 'Sign in | Bay Design Base' },
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }: PageProps<'/base/login'>) {
  const { next, reason } = await searchParams;
  return (
    <main className="base-theme grid min-h-screen bg-ivory lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-brass-dark via-[#7C3AED] to-[#DB2777] text-white lg:flex lg:flex-col lg:justify-between lg:p-14">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.22),transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(56,189,248,0.35),transparent_55%)]" />
        <div className="relative flex items-center gap-3">
          <LogoMark className="h-11 w-11" />
          <div>
            <p className="font-brand text-xl tracking-[0.06em]">BAY DESIGN BASE</p>
            <p className="text-[0.6rem] uppercase tracking-[0.3em] text-white/70">Team · Schedule · Time clock</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <p className="font-display text-5xl leading-[1.05]">Everything the team needs, in one quiet place.</p>
          <ul className="mt-10 space-y-4 text-sm text-white/85">
            <li className="flex items-center gap-3"><CalendarClock size={18} className="text-white" /> Weekly schedules, time off and availability</li>
            <li className="flex items-center gap-3"><MapPin size={18} className="text-white" /> GPS-verified punch in and punch out</li>
            <li className="flex items-center gap-3"><ShieldCheck size={18} className="text-white" /> Private to the Bay Design Store team</li>
          </ul>
        </div>
        <p className="relative text-xs text-white/60">© {new Date().getFullYear()} Bay Design Store · Naples, Florida</p>
      </section>

      {/* Form */}
      <section className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" className="inline-flex items-center gap-2 self-start text-sm text-muted transition-colors hover:text-ink">
          <ArrowLeft size={15} /> baydesignstore.com
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <LogoMark className="h-10 w-10" />
            <p className="font-brand text-lg tracking-[0.06em]">BAY DESIGN BASE</p>
          </div>
          <p className="b-eyebrow">Team sign in</p>
          <h1 className="mt-2 font-display text-4xl font-medium">Welcome back</h1>
          <p className="mt-2 text-sm text-muted">Use the login ID and password from your manager. There is no public sign-up.</p>
          {reason === 'expired' && (
            <p className="mt-6 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">Your session ended. Please sign in again.</p>
          )}
          <div className="mt-8">
            <LoginForm next={typeof next === 'string' ? next : undefined} />
          </div>
          <p className="mt-8 text-xs leading-relaxed text-muted">Forgot your password? Ask a manager to reset it from the team roster.</p>
        </div>
      </section>
    </main>
  );
}
