'use client';

import { useState } from 'react';
import { Eye, EyeOff, LockKeyhole, User } from 'lucide-react';
import { ActionForm, SubmitButton } from '@/components/base/forms';
import { signIn } from './actions';

export default function LoginForm({ next }: { next?: string }) {
  const [show, setShow] = useState(false);
  return (
    <ActionForm action={signIn} className="space-y-5">
      <input type="hidden" name="next" value={next ?? ''} />
      <div>
        <label htmlFor="loginId" className="b-label">Login ID or email</label>
        <div className="relative">
          <User size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input id="loginId" name="loginId" className="b-input !py-3 pl-10" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={120} autoFocus />
        </div>
      </div>
      <div>
        <label htmlFor="password" className="b-label">Password</label>
        <div className="relative">
          <LockKeyhole size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input id="password" name="password" type={show ? 'text' : 'password'} className="b-input !py-3 pl-10 pr-11" autoComplete="current-password" required maxLength={200} />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted hover:text-ink" aria-label={show ? 'Hide password' : 'Show password'}>
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
      <SubmitButton className="b-btn-primary w-full !py-3 text-[0.95rem]" pendingLabel="Signing in…">Sign in</SubmitButton>
    </ActionForm>
  );
}
