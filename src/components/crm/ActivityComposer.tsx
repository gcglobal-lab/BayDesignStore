'use client';

import { useState } from 'react';
import { CalendarClock, Mail, MessageSquareText, Phone, SquareCheckBig, Users } from 'lucide-react';
import { createActivity } from '@/app/base/(app)/crm/activities/actions';
import { ActionForm, SubmitButton } from '@/components/base/forms';
import { fillTemplate, type Person } from '@/lib/crm/types';
import Select from '@/components/ui/Select';
import { DatePicker } from '@/components/base/calendar/Calendar';

type Tab = 'note' | 'task' | 'call' | 'meeting' | 'email';
const TABS: { key: Tab; label: string; icon: typeof Phone }[] = [
  { key: 'note', label: 'Note', icon: MessageSquareText },
  { key: 'task', label: 'To-do', icon: SquareCheckBig },
  { key: 'call', label: 'Call', icon: Phone },
  { key: 'meeting', label: 'Meeting', icon: Users },
  { key: 'email', label: 'Email', icon: Mail },
];

export type Links = { contact_id?: string | null; company_id?: string | null; deal_id?: string | null; lead_id?: string | null };
export type Template = { id: string; name: string; subject: string; body: string };

/**
 * The box at the top of every timeline: write a note, schedule a to-do / call / meeting, log
 * one that just happened, or write an email from a template (opens in the email app and is
 * logged here).
 */
export default function ActivityComposer({
  links,
  owners,
  me,
  today,
  templates = [],
  recipient,
  dealTitle,
}: {
  links: Links;
  owners: Person[];
  me: { id: string | null; name: string };
  today: string;
  templates?: Template[];
  recipient?: { email: string | null; first_name: string; name: string } | null;
  dealTitle?: string;
}) {
  const [tab, setTab] = useState<Tab>('note');
  const [logged, setLogged] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const isEmail = tab === 'email';
  const scheduled = tab !== 'note' && !logged && !isEmail;

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    const vars = { first_name: recipient?.first_name ?? '', name: recipient?.name ?? '', my_name: me.name, deal: dealTitle ?? '' };
    setSubject(fillTemplate(t.subject, vars));
    setBody(fillTemplate(t.body, vars));
  };

  return (
    <div className="rounded-2xl border border-stone/60 bg-surface p-4">
      <div className="mb-3 flex flex-wrap gap-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => {
              setTab(t.key);
              setLogged(t.key === 'email');
            }}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${tab === t.key ? 'bg-brass text-white' : 'text-muted hover:bg-sand/60 hover:text-ink'}`}
          >
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>
      <ActionForm
        action={createActivity}
        resetOnSuccess
        onSuccess={() => {
          if (isEmail && recipient?.email) {
            window.location.href = `mailto:${recipient.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
          }
          setSubject('');
          setBody('');
        }}
        className="space-y-3"
      >
        <input type="hidden" name="type" value={tab} />
        {logged && <input type="hidden" name="logged" value="on" />}
        {Object.entries(links).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}

        {isEmail && templates.length > 0 && (
          <Select className="b-input" defaultValue="" onChange={(e) => applyTemplate(e.target.value)} aria-label="Email template">
            <option value="">Start from a template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        )}
        {tab !== 'note' && (
          <input
            name="subject"
            className="b-input"
            maxLength={200}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={tab === 'call' ? 'e.g. Call about the sectional' : tab === 'meeting' ? 'e.g. Showroom visit' : tab === 'email' ? 'Subject' : 'e.g. Send fabric samples'}
            required
          />
        )}
        <textarea
          name="body"
          className="b-input min-h-[84px]"
          maxLength={5000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={tab === 'note' ? 'Write a note — what was discussed, preferences, measurements…' : isEmail ? 'Message' : 'Details (optional)'}
          required={tab === 'note'}
        />

        {tab !== 'note' && !isEmail && (
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" className="b-check" checked={logged} onChange={(e) => setLogged(e.target.checked)} />
            Already done — just log it
          </label>
        )}
        {tab === 'call' && logged && (
          <Select name="outcome" className="b-input" defaultValue="Talked">
            {['Talked', 'Left voicemail', 'No answer', 'Wrong number', 'Scheduled a visit'].map((o) => <option key={o}>{o}</option>)}
          </Select>
        )}
        {scheduled && (
          <div className="grid gap-2 sm:grid-cols-4">
            <label className="sm:col-span-1">
              <span className="b-label">Due</span>
              <DatePicker name="due_date" defaultValue={today} required aria-label="Due" />
            </label>
            <label>
              <span className="b-label">Time</span>
              <input type="time" name="due_time" className="b-input" defaultValue="10:00" />
            </label>
            <label>
              <span className="b-label">Assign to</span>
              <Select people name="assignee_id" className="b-input" defaultValue={me.id ?? ''}>
                {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </label>
            <label>
              <span className="b-label">Priority</span>
              <Select name="priority" className="b-input" defaultValue="normal">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </Select>
            </label>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          {isEmail ? (
            <p className="text-xs text-muted">{recipient?.email ? `Opens your email app to ${recipient.email} and logs the email here.` : 'No email address on file — the email is only logged here.'}</p>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-muted">{scheduled && <><CalendarClock size={12} /> Shows in Activities until it’s done</>}</span>
          )}
          <SubmitButton className="b-btn-brass b-btn-sm">{tab === 'note' ? 'Add note' : isEmail ? 'Send & log' : logged ? 'Log it' : 'Schedule'}</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
