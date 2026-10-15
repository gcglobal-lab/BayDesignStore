'use client';

import { useState } from 'react';
import { CheckCircle2, Eye, KeyRound, Loader2, RefreshCw, Send } from 'lucide-react';
import type { ActionResult } from '@/lib/base/actionResult';
import { assistantSetPassword, assistantShowPassword, requestPasswordHelp } from '@/app/base/assistant/actions';
import { CopyButton, makePassword } from '@/components/base/EmployeeForm';
import ChatWidget, { type ChatReply } from './ChatWidget';

type Action =
  | { type: 'set_password'; employeeId: string; name: string; login: string }
  | { type: 'show_password'; employeeId: string; name: string; login: string }
  | { type: 'password_help' };

function Result({ result }: { result: ActionResult }) {
  if (!result) return null;
  return (
    <div className={`rounded-xl px-3 py-2 text-sm ${result.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-700'}`}>
      <p className="flex items-start gap-1.5">{result.ok && <CheckCircle2 size={15} className="mt-0.5 flex-none" />} {result.message}</p>
      {result.data?.password && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-inset ring-emerald-200">
          <code className="flex-1 truncate font-mono text-xs">{result.data.login} · {result.data.password}</code>
          <CopyButton text={`Login ID: ${result.data.login}\nPassword: ${result.data.password}`} />
        </div>
      )}
    </div>
  );
}

function ActionCard({ action }: { action: Action }) {
  const [password, setPassword] = useState(() => makePassword());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult>(null);
  const run = async (fn: () => Promise<ActionResult>) => {
    setBusy(true);
    setResult(await fn());
    setBusy(false);
  };

  return (
    <div className="ml-9 space-y-2.5 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-3.5 shadow-sm">
      {action.type === 'set_password' && (
        <>
          <p className="flex items-center gap-2 text-sm font-semibold"><KeyRound size={15} className="text-violet-600" /> New password for {action.name}</p>
          <p className="text-xs text-muted">Login ID <span className="font-mono">{action.login}</span> · saving signs them out on other devices.</p>
          {!result?.ok && (
            <>
              <div className="flex gap-2">
                <input value={password} onChange={(e) => setPassword(e.target.value)} maxLength={200} className="b-input !py-2 font-mono text-sm" aria-label="New password" />
                <button type="button" onClick={() => setPassword(makePassword())} className="b-btn-ghost b-btn-sm" aria-label="Generate another"><RefreshCw size={13} /></button>
              </div>
              <button type="button" disabled={busy || password.length < 6} onClick={() => run(() => assistantSetPassword(action.employeeId, password))} className="b-btn-brass b-btn-sm w-full">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />} Confirm & save password
              </button>
            </>
          )}
        </>
      )}
      {action.type === 'show_password' && !result && (
        <button type="button" disabled={busy} onClick={() => run(() => assistantShowPassword(action.employeeId))} className="b-btn-brass b-btn-sm w-full">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />} Show {action.name}’s sign-in details
        </button>
      )}
      {action.type === 'password_help' && !result?.ok && (
        <>
          <p className="text-sm font-semibold">Ask the admin for a new password</p>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="Anything they should know (optional)" className="b-input !py-2 text-sm" />
          <button type="button" disabled={busy} onClick={() => run(() => requestPasswordHelp(note))} className="b-btn-brass b-btn-sm w-full">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send request to the admin
          </button>
        </>
      )}
      <Result result={result} />
    </div>
  );
}

export default function BaseChat({ firstName, level }: { firstName: string; level: 'employee' | 'manager' | 'admin' }) {
  const suggestions =
    level === 'admin'
      ? ['How do I set passwords for the team?', 'How do I download a payroll report?', 'How do I publish the schedule?', 'Where is the activity log?']
      : level === 'manager'
        ? ['How do I approve time off?', 'How do I add a shift?', 'How do I download timesheets?', 'How do I add an employee?']
        : ['How do I punch in?', 'How do I request time off?', 'I forgot my password', 'Location is blocked on my phone'];
  return (
    <ChatWidget
      endpoint="/base/api/assistant"
      title="Base assistant"
      subtitle="How-to help for Bay Design Base"
      greeting={`Hi ${firstName}! Ask me how to do anything in Bay Design Base — punching in, schedules, time off, reports${level === 'admin' ? ', passwords' : ''} and more.`}
      suggestions={suggestions}
      renderExtra={(reply: ChatReply) => (reply.action ? <ActionCard action={reply.action as Action} /> : null)}
      footer="AI assistant — it can make mistakes; it never changes anything without your confirmation"
    />
  );
}
