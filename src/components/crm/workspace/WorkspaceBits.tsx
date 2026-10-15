'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Star, Trash2, UserPlus } from 'lucide-react';
import { setWorkspaceMember, toggleFavorite } from '@/app/base/(app)/crm/workspace/actions';
import Select from '@/components/ui/Select';
import { Initials } from '@/components/crm/board/Cell';

export function FavoriteStar({ boardId, on: initial }: { boardId: string; on: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [, start] = useTransition();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOn(!on);
        start(async () => {
          await toggleFavorite(boardId);
          router.refresh();
        });
      }}
      className={`rounded p-1.5 transition-colors hover:bg-sand ${on ? 'text-amber-500' : 'text-muted'}`}
      aria-label={on ? 'Remove from favorites' : 'Add to favorites'}
      title={on ? 'Remove from favorites' : 'Add to favorites'}
    >
      <Star size={17} className={on ? 'fill-amber-400' : ''} />
    </button>
  );
}

type Role = 'owner' | 'member' | 'viewer';

export function WorkspaceMembers({ wsId, members: initial, people, canManage }: { wsId: string; members: { employee_id: string; role: Role }[]; people: { id: string; name: string }[]; canManage: boolean }) {
  const router = useRouter();
  const [members, setMembers] = useState(initial);
  const [pick, setPick] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'Former team member';
  const save = (id: string, role: Role | null) => {
    const before = members;
    setMembers(role ? [...members.filter((m) => m.employee_id !== id), { employee_id: id, role }] : members.filter((m) => m.employee_id !== id));
    start(async () => {
      const res = await setWorkspaceMember(wsId, id, role);
      if (!res?.ok) {
        setMembers(before);
        setMsg(res?.message ?? 'Couldn’t save.');
      } else router.refresh();
    });
  };
  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex max-w-lg gap-2">
          <Select people value={pick} onChange={(e) => setPick(e.target.value)} className="b-input" aria-label="Person">
            <option value="">Add a person…</option>
            {people.filter((p) => !members.some((m) => m.employee_id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <button type="button" disabled={!pick || pending} onClick={() => { save(pick, 'member'); setPick(''); }} className="b-btn-brass"><UserPlus size={15} /> Add</button>
        </div>
      )}
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      <ul className="divide-y divide-stone/60 rounded-xl border border-stone/70 bg-surface">
        {members.map((m) => (
          <li key={m.employee_id} className="flex items-center gap-3 px-4 py-2.5">
            <Initials name={nameOf(m.employee_id)} size={30} />
            <span className="flex-1 text-sm font-medium">{nameOf(m.employee_id)}</span>
            {canManage ? (
              <>
                <Select value={m.role} onChange={(e) => save(m.employee_id, e.target.value as Role)} className="b-input !w-40 !py-1 text-sm" aria-label="Role">
                  <option value="owner">Owner</option>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </Select>
                <button type="button" onClick={() => save(m.employee_id, null)} className="rounded p-1.5 text-muted hover:text-red-600" aria-label="Remove"><Trash2 size={15} /></button>
              </>
            ) : (
              <span className="text-xs capitalize text-muted">{m.role}</span>
            )}
          </li>
        ))}
        {members.length === 0 && <li className="px-4 py-4 text-sm text-muted">No members yet.</li>}
      </ul>
    </div>
  );
}
