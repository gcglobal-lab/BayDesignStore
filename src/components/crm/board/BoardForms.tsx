'use client';

import { useState, useTransition } from 'react';
import { Trash2, UserPlus } from 'lucide-react';
import { createBoard, setBoardMember, updateBoard } from '@/app/base/(app)/crm/boards/actions';
import { ActionForm, Field, SubmitButton } from '@/components/base/forms';
import { Avatar } from '@/components/base/ui';
import { GROUP_COLORS, type Board } from '@/lib/crm/boardTypes';
import Select from '@/components/ui/Select';

export function NewBoardForm({ workspaceId, folders, folderId }: { workspaceId: string; folders: { id: string; name: string }[]; folderId?: string | null }) {
  return (
    <ActionForm action={createBoard} className="space-y-4">
      <input type="hidden" name="workspace_id" value={workspaceId} />
      <input type="hidden" name="template" value="blank" />
      <Field label="Board name" htmlFor="nb-name"><input id="nb-name" name="name" className="b-input" required maxLength={120} autoFocus placeholder="e.g. Victoria Bird" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Folder" htmlFor="nb-folder">
          <Select id="nb-folder" name="folder_id" className="b-input" defaultValue={folderId ?? ''}>
            <option value="">No folder</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </Field>
        <Field label="Who can open it" htmlFor="nb-vis">
          <Select id="nb-vis" name="visibility" className="b-input" defaultValue="everyone">
            <option value="everyone">Everyone with Workflow access</option>
            <option value="members">Only people I add</option>
          </Select>
        </Field>
      </div>
      <Field label="Description (optional)" htmlFor="nb-desc"><textarea id="nb-desc" name="description" className="b-input min-h-[70px]" maxLength={5000} /></Field>
      <div className="flex justify-end"><SubmitButton className="b-btn-brass" pendingLabel="Creating…">Create board</SubmitButton></div>
    </ActionForm>
  );
}

export function BoardSettingsForm({ board }: { board: Board }) {
  return (
    <ActionForm action={updateBoard} className="space-y-4">
      <input type="hidden" name="id" value={board.id} />
      <Field label="Board name" htmlFor="bs-name"><input id="bs-name" name="name" className="b-input" required maxLength={120} defaultValue={board.name} /></Field>
      <Field label="Description" htmlFor="bs-desc"><textarea id="bs-desc" name="description" className="b-input min-h-[80px]" maxLength={5000} defaultValue={board.description ?? ''} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Who can open it" htmlFor="bs-vis">
          <Select id="bs-vis" name="visibility" className="b-input" defaultValue={board.visibility}>
            <option value="everyone">Everyone with Workflow access</option>
            <option value="members">Only members</option>
          </Select>
        </Field>
        <Field label="A row is called" htmlFor="bs-item" hint="e.g. Client, Sales order, Vendor"><input id="bs-item" name="item_label" className="b-input" maxLength={40} defaultValue={board.item_label} /></Field>
        <Field label="A group is called" htmlFor="bs-group" hint="e.g. Designer, Stage, Category"><input id="bs-group" name="group_label" className="b-input" maxLength={40} defaultValue={board.group_label} /></Field>
      </div>
      <Field label="Colour" htmlFor="bs-color">
        <Select id="bs-color" name="color" className="b-input" defaultValue={board.color}>
          {GROUP_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </Field>
      <div className="flex justify-end"><SubmitButton className="b-btn-brass">Save</SubmitButton></div>
    </ActionForm>
  );
}

/** Board members: editors can change data, viewers can only look. */
export function BoardMembers({ boardId, members: initial, people, visibility }: { boardId: string; members: { employee_id: string; role: 'editor' | 'viewer' }[]; people: { id: string; name: string }[]; visibility: 'everyone' | 'members' }) {
  const [members, setMembers] = useState(initial);
  const [pick, setPick] = useState('');
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'Former team member';
  const save = (employeeId: string, role: 'editor' | 'viewer' | null) => {
    const before = members;
    setMembers(role ? [...members.filter((m) => m.employee_id !== employeeId), { employee_id: employeeId, role }] : members.filter((m) => m.employee_id !== employeeId));
    start(async () => {
      const res = await setBoardMember(boardId, employeeId, role);
      if (!res?.ok) {
        setMembers(before);
        setMsg(res?.message ?? 'Couldn’t save.');
      }
    });
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {visibility === 'everyone'
          ? 'This board is open to everyone with Workflow access. Add people here to make someone view-only.'
          : 'Only these people (plus Workflow managers and admins) can open this board.'}
      </p>
      <div className="flex gap-2">
        <Select value={pick} onChange={(e) => setPick(e.target.value)} className="b-input" aria-label="Person">
          <option value="">Add a person…</option>
          {people.filter((p) => !members.some((m) => m.employee_id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <button type="button" disabled={!pick || pending} onClick={() => { save(pick, 'editor'); setPick(''); }} className="b-btn-brass"><UserPlus size={14} /> Add</button>
      </div>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      <ul className="divide-y divide-stone/50 rounded-2xl border border-stone/60">
        {members.map((m) => (
          <li key={m.employee_id} className="flex items-center gap-3 px-3 py-2">
            <Avatar name={nameOf(m.employee_id)} size="sm" />
            <span className="flex-1 text-sm font-medium">{nameOf(m.employee_id)}</span>
            <Select value={m.role} onChange={(e) => save(m.employee_id, e.target.value as 'editor' | 'viewer')} className="b-input !w-auto !py-1 text-xs" aria-label="Role">
              <option value="editor">Can edit</option>
              <option value="viewer">View only</option>
            </Select>
            <button type="button" onClick={() => save(m.employee_id, null)} className="rounded p-1.5 text-muted hover:text-red-600" aria-label="Remove"><Trash2 size={14} /></button>
          </li>
        ))}
        {members.length === 0 && <li className="px-3 py-3 text-sm text-muted">No members added.</li>}
      </ul>
    </div>
  );
}
