import type { Metadata } from 'next';
import Link from 'next/link';
import { Archive, ArchiveRestore, Check, CheckCheck, Download, Inbox, Mail, MailWarning, Newspaper, Phone, Reply } from 'lucide-react';
import AutoRefresh from '@/components/base/AutoRefresh';
import { SubmitButton } from '@/components/base/forms';
import { Avatar, Card, EmptyState, PageHeader } from '@/components/base/ui';
import { requireManager } from '@/lib/base/auth';
import { db, must } from '@/lib/base/db';
import { getSettings } from '@/lib/base/settings';
import { fmtDate, fmtTime } from '@/lib/base/time';
import { isEmailConfigured } from '@/lib/email';
import { setInquiryStatus } from './actions';

export const metadata: Metadata = { title: 'Inquiries' };

type Inquiry = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  interest: string | null;
  message: string;
  status: 'new' | 'read' | 'replied' | 'archived';
  page: string | null;
  email_sent: boolean;
  email_error: string | null;
  created_at: string;
};

const TABS = [
  { key: 'new', label: 'New' },
  { key: 'open', label: 'All open' },
  { key: 'replied', label: 'Replied' },
  { key: 'archived', label: 'Archived' },
  { key: 'newsletter', label: 'Newsletter' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const statusBadge: Record<Inquiry['status'], string> = { new: 'b-badge-blue', read: 'b-badge-gray', replied: 'b-badge-green', archived: 'b-badge-gray' };

function StatusButton({ id, status, children, className = 'b-btn-ghost b-btn-sm' }: { id: string; status: Inquiry['status']; children: React.ReactNode; className?: string }) {
  return (
    <form action={setInquiryStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton className={className}>{children}</SubmitButton>
    </form>
  );
}

/** Messages from the website's contact form, plus newsletter sign-ups. */
export default async function InquiriesPage({ searchParams }: PageProps<'/base/inquiries'>) {
  await requireManager();
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : 'new';
  const { timezone: zone } = await getSettings();

  const counts = await Promise.all(
    (['new', 'read', 'replied', 'archived'] as const).map(async (s) => {
      const { count } = await db().from('inquiries').select('id', { count: 'exact', head: true }).eq('status', s);
      return [s, count ?? 0] as const;
    }),
  );
  const count = Object.fromEntries(counts) as Record<Inquiry['status'], number>;
  const { count: subscriberCount } = await db().from('newsletter_subscribers').select('id', { count: 'exact', head: true });
  const tabCount: Record<Tab, number> = { new: count.new, open: count.new + count.read, replied: count.replied, archived: count.archived, newsletter: subscriberCount ?? 0 };

  const header = (
    <PageHeader
      eyebrow="Website"
      title="Inquiries"
      description="Messages sent from the contact form on baydesignstore.com — newest first. New messages appear here within 30 seconds."
      actions={
        <a href={`/base/inquiries/export?type=${tab === 'newsletter' ? 'newsletter' : 'inquiries'}`} className="b-btn-ghost">
          <Download size={15} /> Export {tab === 'newsletter' ? 'subscribers' : 'inquiries'} (CSV)
        </a>
      }
    />
  );
  const tabs = (
    <div className="b-segment mb-6 flex-wrap">
      {TABS.map((t) => (
        <Link key={t.key} href={`/base/inquiries?tab=${t.key}`} aria-current={tab === t.key ? 'page' : undefined}>
          {t.label}
          <span className={`ml-1.5 rounded-full px-1.5 py-px text-[0.68rem] ${t.key === 'new' && tabCount.new ? 'bg-brass text-white' : 'bg-sand text-muted'}`}>{tabCount[t.key]}</span>
        </Link>
      ))}
    </div>
  );
  const emailNote = !isEmailConfigured() && (
    <p className="mb-6 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <MailWarning size={16} /> Email alerts are off — add RESEND_API_KEY to .env.local. Messages are still saved here.
    </p>
  );

  if (tab === 'newsletter') {
    const subscribers = must<{ id: string; email: string; created_at: string }[]>(
      await db().from('newsletter_subscribers').select('id, email, created_at').order('created_at', { ascending: false }).limit(500),
      'load newsletter subscribers',
    );
    return (
      <>
        <AutoRefresh seconds={30} />
        {header}
        {tabs}
        <Card title={`Newsletter subscribers (${subscriberCount ?? 0})`} pad={false}>
          {subscribers.length === 0 ? (
            <EmptyState icon={<Newspaper size={20} />} title="No sign-ups yet." />
          ) : (
            <table className="b-table">
              <thead><tr><th>Email</th><th>Signed up</th></tr></thead>
              <tbody>
                {subscribers.map((s) => (
                  <tr key={s.id}>
                    <td><a href={`mailto:${s.email}`} className="font-medium hover:text-brass-dark">{s.email}</a></td>
                    <td className="text-muted">{fmtDate(new Date(s.created_at), zone, 'MMM d, yyyy')} · {fmtTime(s.created_at, zone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </>
    );
  }

  const statuses: Inquiry['status'][] = tab === 'new' ? ['new'] : tab === 'open' ? ['new', 'read'] : [tab];
  const inquiries = must<Inquiry[]>(
    await db().from('inquiries').select('*').in('status', statuses).order('created_at', { ascending: false }).limit(200),
    'load inquiries',
  );

  return (
    <>
      <AutoRefresh seconds={30} />
      {header}
      {tabs}
      {emailNote}
      {inquiries.length === 0 ? (
        <Card>
          <EmptyState icon={<Inbox size={20} />} title={tab === 'new' ? 'You’re all caught up — no new inquiries.' : 'Nothing here.'} />
        </Card>
      ) : (
        <div className="space-y-4">
          {inquiries.map((q) => {
            const replyHref = `mailto:${q.email}?subject=${encodeURIComponent('Re: your inquiry to Bay Design Store')}&body=${encodeURIComponent(`Hi ${q.name.split(' ')[0]},\n\nThank you for reaching out to Bay Design Store.\n\n\n\n— On ${fmtDate(new Date(q.created_at), zone, 'MMM d, yyyy')} you wrote:\n${q.message}`)}`;
            return (
              <article key={q.id} className={`b-card overflow-hidden ${q.status === 'new' ? 'ring-2 ring-brass/40' : ''}`}>
                <header className="flex flex-wrap items-center gap-3 border-b border-stone/50 bg-gradient-to-r from-linen via-ivory to-white px-5 py-4">
                  <Avatar name={q.name} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {q.name}
                      <span className={`${statusBadge[q.status]} capitalize`}>{q.status}</span>
                      {q.interest && <span className="rounded-full bg-brass/10 px-2.5 py-0.5 text-xs font-medium text-brass-dark">{q.interest}</span>}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                      <a href={`mailto:${q.email}`} className="inline-flex items-center gap-1 hover:text-brass-dark"><Mail size={13} /> {q.email}</a>
                      {q.phone && <a href={`tel:${q.phone}`} className="inline-flex items-center gap-1 hover:text-brass-dark"><Phone size={13} /> {q.phone}</a>}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted">
                    <p className="font-medium text-ink">{fmtDate(new Date(q.created_at), zone, 'EEE, MMM d, yyyy')}</p>
                    <p>{fmtTime(q.created_at, zone)}</p>
                    <p className={`mt-1 inline-flex items-center gap-1 ${q.email_sent ? 'text-emerald-700' : 'text-amber-700'}`} title={q.email_error ?? undefined}>
                      {q.email_sent ? <><CheckCheck size={12} /> Email alert sent</> : <><MailWarning size={12} /> Email alert not sent</>}
                    </p>
                  </div>
                </header>
                <div className="whitespace-pre-wrap px-5 py-4 text-[0.95rem] leading-relaxed text-ink">{q.message}</div>
                <footer className="flex flex-wrap items-center gap-2 border-t border-stone/50 bg-ivory/60 px-5 py-3">
                  <a href={replyHref} className="b-btn-brass b-btn-sm"><Reply size={13} /> Reply by email</a>
                  {q.status === 'new' && <StatusButton id={q.id} status="read"><Check size={13} /> Mark as read</StatusButton>}
                  {q.status !== 'replied' && q.status !== 'archived' && <StatusButton id={q.id} status="replied"><CheckCheck size={13} /> Mark as replied</StatusButton>}
                  {q.status !== 'archived' ? (
                    <StatusButton id={q.id} status="archived" className="b-btn-quiet b-btn-sm ml-auto"><Archive size={13} /> Archive</StatusButton>
                  ) : (
                    <StatusButton id={q.id} status="read" className="b-btn-quiet b-btn-sm ml-auto"><ArchiveRestore size={13} /> Restore</StatusButton>
                  )}
                  {q.page && <span className="w-full text-[0.7rem] text-muted sm:w-auto">Sent from {q.page}</span>}
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
