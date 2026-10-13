'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { ActionForm, SubmitButton } from './forms';
import { createDepartment, createRole } from '@/app/base/(app)/team/roles/actions';

const PALETTE = ['#C0354E', '#2F7FC1', '#A8834F', '#4E6B69', '#5B4A8B', '#6F675D', '#5F7F6E', '#94593A', '#1E1C19', '#B85C8A'];

export function NewRoleForm({ departmentId }: { departmentId: string | null }) {
  const [color, setColor] = useState(PALETTE[2]);
  return (
    <ActionForm action={createRole} resetOnSuccess className="space-y-2">
      <input type="hidden" name="department_id" value={departmentId ?? ''} />
      <input type="hidden" name="color" value={color} />
      <div className="flex flex-wrap items-center gap-2">
        <input name="name" className="b-input !w-56 !py-2" placeholder="Type to create a new role" maxLength={60} required aria-label="New role name" />
        <div className="flex gap-1" role="radiogroup" aria-label="Role colour">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={c}
              onClick={() => setColor(c)}
              className={`h-6 w-6 rounded-full transition-transform ${color === c ? 'scale-110 ring-2 ring-ink/70 ring-offset-2' : 'hover:scale-110'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <SubmitButton className="b-btn-ghost b-btn-sm"><Plus size={13} /> Add role</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function NewDepartmentForm() {
  return (
    <ActionForm action={createDepartment} resetOnSuccess className="flex flex-wrap items-start gap-2">
      <input name="name" className="b-input !w-64 !py-2" placeholder="New department name" maxLength={80} required aria-label="New department name" />
      <SubmitButton className="b-btn-brass b-btn-sm !py-2.5"><Plus size={13} /> Add department</SubmitButton>
    </ActionForm>
  );
}
