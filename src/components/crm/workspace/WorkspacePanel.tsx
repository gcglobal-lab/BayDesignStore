'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Archive,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  ExternalLink,
  Folder,
  FolderPlus,
  LayoutDashboard,
  LayoutGrid,
  LayoutTemplate,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Star,
  StarOff,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import { archiveBoard, deleteBoard, duplicateBoard } from '@/app/base/(app)/crm/boards/actions';
import { createFolder, createWorkspace, deleteFolder, deleteWorkspace, moveBoard, renameBoard, renameFolder, toggleFavorite, updateWorkspace } from '@/app/base/(app)/crm/workspace/actions';
import { ActionForm, Field, SubmitButton } from '@/components/base/forms';
import Modal from '@/components/ui/Modal';
import { Popover } from '@/components/ui/Popover';
import Select from '@/components/ui/Select';
import { NewBoardForm } from '@/components/crm/board/BoardForms';
import { GROUP_COLORS, type Board } from '@/lib/crm/boardTypes';

type Workspace = { id: string; name: string; description: string | null; color: string; visibility: 'everyone' | 'members' };
type FolderT = { id: string; workspace_id: string; parent_id: string | null; name: string; color: string; position: number };

function WsAvatar({ ws, size = 22 }: { ws: Pick<Workspace, 'name' | 'color'>; size?: number }) {
  return (
    <span className="relative inline-flex flex-none items-center justify-center rounded-md font-bold text-white" style={{ width: size, height: size, background: ws.color, fontSize: size * 0.5 }}>
      {ws.name[0]?.toUpperCase()}
    </span>
  );
}

function Pop({ trigger, children, width = 240, className, label }: { trigger: ReactNode; children: (close: () => void) => ReactNode; width?: number; className?: string; label: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button ref={ref} type="button" aria-label={label} title={label} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }} className={className}>
        {trigger}
      </button>
      <Popover anchor={ref} open={open} onClose={close} width={width}>
        {children(close)}
      </Popover>
    </>
  );
}
const Item = ({ icon, children, onClick, danger, disabled }: { icon?: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) => (
  <button type="button" disabled={disabled} onClick={onClick} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-sand/70 disabled:opacity-40 ${danger ? 'text-red-600' : ''}`}>
    {icon}
    {children}
  </button>
);
const Section = ({ children }: { children: ReactNode }) => <p className="px-2.5 pb-1 pt-2 text-xs text-muted">{children}</p>;

function WorkspaceForm({ ws, onDone }: { ws?: Workspace; onDone?: () => void }) {
  const [color, setColor] = useState(ws?.color ?? '#E2445C');
  return (
    <ActionForm action={ws ? updateWorkspace : createWorkspace} onSuccess={onDone} className="space-y-4">
      {ws && <input type="hidden" name="id" value={ws.id} />}
      <input type="hidden" name="color" value={color} />
      <div className="flex items-center gap-3">
        <WsAvatar ws={{ name: ws?.name ?? 'W', color }} size={44} />
        <div className="flex flex-wrap gap-1.5">
          {['#E2445C', ...GROUP_COLORS].slice(0, 10).map((c) => <button key={c} type="button" onClick={() => setColor(c)} className={`h-6 w-6 rounded-md ${c === color ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''}`} style={{ background: c }} aria-label={`Colour ${c}`} />)}
        </div>
      </div>
      <Field label="Workspace name" htmlFor="ws-name"><input id="ws-name" name="name" className="b-input" required maxLength={80} defaultValue={ws?.name} placeholder="e.g. Designers Project" /></Field>
      <Field label="Description (optional)" htmlFor="ws-desc"><textarea id="ws-desc" name="description" className="b-input min-h-[70px]" maxLength={2000} defaultValue={ws?.description ?? ''} /></Field>
      <Field label="Who can see it" htmlFor="ws-vis">
        <Select id="ws-vis" name="visibility" className="b-input" defaultValue={ws?.visibility ?? 'everyone'}>
          <option value="everyone">Open — everyone with Workflow access</option>
          <option value="members">Closed — only members</option>
        </Select>
      </Field>
      <div className="flex justify-end"><SubmitButton className="b-btn-brass">{ws ? 'Save' : 'Create workspace'}</SubmitButton></div>
    </ActionForm>
  );
}

export default function WorkspacePanel({
  workspace,
  workspaces,
  folders,
  boards,
  favorites,
  favoriteIds,
  canManageWs,
  isManager,
}: {
  workspace: Workspace;
  workspaces: Workspace[];
  folders: FolderT[];
  boards: Board[];
  favorites: Board[];
  favoriteIds: string[];
  canManageWs: boolean;
  isManager: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const activeBoard = pathname.match(/\/board\/([0-9a-f-]{36})/)?.[1];
  const onHome = pathname === `/base/crm/workspace/${workspace.id}`;
  const [collapsedPanel, setCollapsedPanel] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState<string | null>(null);
  const [closedFolders, setClosedFolders] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<null | { kind: 'board'; folderId?: string | null } | { kind: 'workspace' } | { kind: 'edit' } | { kind: 'browse' }>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const live = boards.filter((b) => !b.archived);
  const favs = new Set(favoriteIds);

  useEffect(() => {
    try {
      setCollapsedPanel(window.localStorage.getItem('ws-panel-collapsed') === '1');
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => setMobileOpen(false), [pathname]);
  const setCollapsed = (v: boolean) => {
    setCollapsedPanel(v);
    try {
      window.localStorage.setItem('ws-panel-collapsed', v ? '1' : '0');
    } catch {
      // ignore
    }
  };

  const act = (p: Promise<{ ok: boolean; message?: string } | null | void | undefined>) =>
    start(async () => {
      const r = await p;
      if (r && 'ok' in r && !r.ok) setError(r.message ?? 'Something went wrong.');
      router.refresh();
    });
  const fdOf = (o: Record<string, string>) => {
    const fd = new FormData();
    Object.entries(o).forEach(([k, v]) => fd.set(k, v));
    return fd;
  };
  const addFolder = (parentId?: string | null) => {
    const name = window.prompt('Folder name:');
    if (name?.trim()) act(createFolder(workspace.id, name, parentId ?? null));
  };

  const q = search?.trim().toLowerCase() ?? '';
  const match = (b: Board) => !q || b.name.toLowerCase().includes(q);
  const boardsIn = (folderId: string | null) => live.filter((b) => (b.folder_id ?? null) === folderId && match(b)).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  const subFolders = (parentId: string | null) => folders.filter((f) => (f.parent_id ?? null) === parentId).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  const folderHasMatch = (f: FolderT): boolean => !q || f.name.toLowerCase().includes(q) || boardsIn(f.id).length > 0 || subFolders(f.id).some(folderHasMatch);

  const addMenu = (close: () => void) => (
    <div className="p-1">
      <Section>Add to workspace</Section>
      <Item icon={<Table2 size={15} />} disabled={!canManageWs} onClick={() => { close(); setModal({ kind: 'board' }); }}>Board</Item>
      <Item icon={<FolderPlus size={15} />} disabled={!canManageWs} onClick={() => { close(); addFolder(); }}>Folder</Item>
      <Item icon={<LayoutTemplate size={15} />} disabled={!canManageWs} onClick={() => { close(); setModal({ kind: 'board' }); }}>Template center</Item>
      {isManager && (
        <>
          <div className="my-1 border-t border-stone/60" />
          <Section>Add to account</Section>
          <Item icon={<LayoutGrid size={15} />} onClick={() => { close(); setModal({ kind: 'workspace' }); }}>New workspace</Item>
        </>
      )}
      {!canManageWs && <p className="px-2.5 py-2 text-xs text-muted">Only workspace owners and Workflow managers can add boards and folders.</p>}
    </div>
  );

  const BoardRow = ({ b, depth }: { b: Board; depth: number }) => {
    const on = b.id === activeBoard;
    const href = `/base/crm/workspace/${b.workspace_id}/board/${b.id}`;
    if (renaming === b.id) {
      return (
        <input
          autoFocus
          defaultValue={b.name}
          maxLength={120}
          className="b-input !py-1 text-sm"
          style={{ marginLeft: depth * 14 }}
          onBlur={(e) => {
            setRenaming(null);
            if (e.target.value.trim() && e.target.value !== b.name) act(renameBoard(b.id, e.target.value));
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      );
    }
    return (
      <div className={`group/b flex items-center rounded-md ${on ? 'bg-brass/15 text-brass' : 'hover:bg-sand/70'}`} style={{ paddingLeft: 8 + depth * 14 }}>
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-[0.86rem]">
          <Table2 size={14} className="flex-none opacity-70" />
          <span className="truncate">{b.name}</span>
        </Link>
        <Pop label="Board options" trigger={<MoreHorizontal size={15} />} className={`mr-1 rounded p-1 text-muted hover:bg-sand ${on ? 'opacity-100' : 'opacity-0 group-hover/b:opacity-100'}`} width={230}>
          {(close) => (
            <div className="p-1">
              <Item icon={<ExternalLink size={15} />} onClick={() => { close(); window.open(href, '_blank'); }}>Open in new tab</Item>
              <Item icon={<Pencil size={15} />} disabled={!canManageWs} onClick={() => { close(); setRenaming(b.id); }}>Rename</Item>
              <MoveTo b={b} close={close} />
              <Item icon={favs.has(b.id) ? <StarOff size={15} /> : <Star size={15} />} onClick={() => { close(); act(toggleFavorite(b.id)); }}>{favs.has(b.id) ? 'Remove from favorites' : 'Add to favorites'}</Item>
              <Item icon={<Copy size={15} />} disabled={!canManageWs} onClick={() => { close(); act(duplicateBoard(fdOf({ id: b.id }))); }}>Duplicate</Item>
              <div className="my-1 border-t border-stone/60" />
              <Item icon={<Archive size={15} />} disabled={!canManageWs} onClick={() => { close(); act(archiveBoard(fdOf({ id: b.id, archived: 'true' }))); }}>Archive</Item>
              <Item icon={<Trash2 size={15} />} danger disabled={!isManager} onClick={() => { close(); if (window.confirm(`Delete “${b.name}” and everything on it? This can’t be undone.`)) act(deleteBoard(fdOf({ id: b.id }))); }}>Delete</Item>
            </div>
          )}
        </Pop>
      </div>
    );
  };

  const MoveTo = ({ b, close }: { b: Board; close: () => void }) => {
    const [open, setOpen] = useState(false);
    if (!canManageWs) return null;
    return (
      <div>
        <Item icon={<ArrowRight size={15} />} onClick={() => setOpen(!open)}>Move to <ChevronRight size={13} className={`ml-auto transition-transform ${open ? 'rotate-90' : ''}`} /></Item>
        {open && (
          <div className="ml-6 border-l border-stone/60 pl-1">
            <Item onClick={() => { close(); act(moveBoard(b.id, { folder_id: null })); }}>Top of workspace {!b.folder_id && <Check size={13} className="ml-auto" />}</Item>
            {folders.map((f) => <Item key={f.id} icon={<Folder size={13} />} onClick={() => { close(); act(moveBoard(b.id, { folder_id: f.id })); }}>{f.name} {b.folder_id === f.id && <Check size={13} className="ml-auto" />}</Item>)}
            {workspaces.filter((w) => w.id !== workspace.id).map((w) => <Item key={w.id} icon={<WsAvatar ws={w} size={14} />} onClick={() => { close(); act(moveBoard(b.id, { workspace_id: w.id, folder_id: null })); }}>{w.name}</Item>)}
          </div>
        )}
      </div>
    );
  };

  const FolderNode = ({ f, depth }: { f: FolderT; depth: number }) => {
    if (!folderHasMatch(f)) return null;
    const open = q ? true : !closedFolders.has(f.id);
    return (
      <div>
        {renaming === f.id ? (
          <input autoFocus defaultValue={f.name} maxLength={80} className="b-input !py-1 text-sm" style={{ marginLeft: depth * 14 }} onBlur={(e) => { setRenaming(null); if (e.target.value.trim() && e.target.value !== f.name) act(renameFolder(f.id, e.target.value)); }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        ) : (
          <div className="group/f flex items-center rounded-md hover:bg-sand/70" style={{ paddingLeft: 4 + depth * 14 }}>
            <button type="button" onClick={() => setClosedFolders((s) => { const n = new Set(s); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; })} className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-[0.86rem]">
              {open ? <ChevronDown size={14} className="flex-none text-muted" /> : <ChevronRight size={14} className="flex-none text-muted" />}
              <span className="truncate">{f.name}</span>
            </button>
            {canManageWs && (
              <Pop label="Folder options" trigger={<MoreHorizontal size={15} />} className="mr-1 rounded p-1 text-muted opacity-0 hover:bg-sand group-hover/f:opacity-100" width={220}>
                {(close) => (
                  <div className="p-1">
                    <Item icon={<Table2 size={15} />} onClick={() => { close(); setModal({ kind: 'board', folderId: f.id }); }}>Add board here</Item>
                    <Item icon={<FolderPlus size={15} />} onClick={() => { close(); addFolder(f.id); }}>Add sub-folder</Item>
                    <Item icon={<Pencil size={15} />} onClick={() => { close(); setRenaming(f.id); }}>Rename</Item>
                    <Item icon={<Trash2 size={15} />} danger onClick={() => { close(); if (window.confirm(`Delete the folder “${f.name}”? Its boards are kept.`)) act(deleteFolder(f.id)); }}>Delete folder</Item>
                  </div>
                )}
              </Pop>
            )}
          </div>
        )}
        {open && (
          <div>
            {subFolders(f.id).map((sf) => <FolderNode key={sf.id} f={sf} depth={depth + 1} />)}
            {boardsIn(f.id).map((b) => <BoardRow key={b.id} b={b} depth={depth + 1} />)}
          </div>
        )}
      </div>
    );
  };

  const [wsQ, setWsQ] = useState('');
  const wsList = useMemo(() => workspaces.filter((w) => w.name.toLowerCase().includes(wsQ.trim().toLowerCase())), [workspaces, wsQ]);

  if (collapsedPanel) {
    return (
      <div className="hidden w-11 flex-none border-r border-stone/70 bg-surface lg:block">
        <button type="button" onClick={() => setCollapsed(false)} className="m-2 rounded-md p-1.5 text-muted hover:bg-sand" aria-label="Show workspace panel" title="Show workspace"><ChevronsRight size={17} /></button>
      </div>
    );
  }

  const body = (
    <div className="flex h-full flex-col text-ink">
      <div className="flex items-center gap-1 px-3 pb-2 pt-3">
        <span className="flex-1 text-[0.82rem] text-muted">Workspace</span>
        <Pop label="Workspace options" trigger={<MoreHorizontal size={16} />} className="rounded p-1.5 text-muted hover:bg-sand" width={250}>
          {(close) => (
            <div className="p-1">
              <Item icon={<LayoutDashboard size={15} />} onClick={() => { close(); router.push(`/base/crm/workspace/${workspace.id}`); }}>Manage workspace</Item>
              <Item icon={<Pencil size={15} />} disabled={!canManageWs} onClick={() => { close(); setModal({ kind: 'edit' }); }}>Edit workspace</Item>
              <Item icon={<Trash2 size={15} />} danger disabled={!isManager || workspaces.length <= 1} onClick={() => { close(); if (window.confirm(`Delete the workspace “${workspace.name}” with all its boards? This can’t be undone.`)) act(deleteWorkspace(fdOf({ id: workspace.id }))); }}>Delete workspace</Item>
              <div className="my-1 border-t border-stone/60" />
              {isManager && <Item icon={<Plus size={15} />} onClick={() => { close(); setModal({ kind: 'workspace' }); }}>Add new workspace</Item>}
              <Item icon={<LayoutGrid size={15} />} onClick={() => { close(); setModal({ kind: 'browse' }); }}>Browse all workspaces</Item>
              <Item icon={<Archive size={15} />} onClick={() => { close(); router.push(`/base/crm/workspace/${workspace.id}?tab=archive`); }}>View archive</Item>
            </div>
          )}
        </Pop>
        <button type="button" onClick={() => setSearch(search === null ? '' : null)} className={`rounded p-1.5 hover:bg-sand ${search !== null ? 'text-brass' : 'text-muted'}`} aria-label="Search boards" title="Search"><Search size={16} /></button>
        <button type="button" onClick={() => setCollapsed(true)} className="hidden rounded p-1.5 text-muted hover:bg-sand lg:block" aria-label="Hide workspace panel" title="Collapse"><ChevronsLeft size={17} /></button>
        <button type="button" onClick={() => setMobileOpen(false)} className="rounded p-1.5 text-muted hover:bg-sand lg:hidden" aria-label="Close"><X size={17} /></button>
      </div>

      <div className="flex gap-1.5 px-3 pb-3">
        <Pop
          label="Switch workspace"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-stone/80 px-2 py-1.5 text-left text-sm hover:bg-sand/50"
          width={280}
          trigger={
            <>
              <WsAvatar ws={workspace} />
              <span className="min-w-0 flex-1 truncate font-medium">{workspace.name}</span>
              <ChevronDown size={15} className="text-muted" />
            </>
          }
        >
          {(close) => (
            <div className="p-1">
              <label className="mb-1 flex items-center gap-2 rounded-lg border border-stone/70 px-2.5 py-1.5">
                <Search size={13} className="text-muted" />
                <input autoFocus value={wsQ} onChange={(e) => setWsQ(e.target.value)} placeholder="Search for a workspace" className="w-full bg-transparent text-sm outline-none" />
              </label>
              <Section>My workspaces</Section>
              <div className="max-h-64 overflow-y-auto">
                {wsList.map((w) => (
                  <Item key={w.id} icon={<WsAvatar ws={w} />} onClick={() => { close(); router.push(`/base/crm/workspace/${w.id}`); }}>
                    <span className="min-w-0 flex-1 truncate">{w.name}</span> {w.id === workspace.id && <Check size={14} className="text-brass" />}
                  </Item>
                ))}
              </div>
              <div className="my-1 border-t border-stone/60" />
              <Item icon={<LayoutGrid size={15} />} onClick={() => { close(); setModal({ kind: 'browse' }); }}>Browse all</Item>
              {isManager && <Item icon={<Plus size={15} />} onClick={() => { close(); setModal({ kind: 'workspace' }); }}>Add workspace</Item>}
            </div>
          )}
        </Pop>
        <Pop label="Add" trigger={<Plus size={17} />} className="flex w-9 flex-none items-center justify-center rounded-md border border-stone/80 text-ink hover:bg-sand/60" width={250}>
          {addMenu}
        </Pop>
      </div>

      {search !== null && (
        <label className="mx-3 mb-2 flex items-center gap-2 rounded-md border border-brass/60 px-2.5 py-1.5">
          <Search size={13} className="text-muted" />
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search boards and folders" className="w-full bg-transparent text-sm outline-none" />
        </label>
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-6">
        {favorites.length > 0 && !q && (
          <div className="mb-3">
            <p className="flex items-center gap-1.5 px-2 pb-1 text-xs font-semibold text-muted"><Star size={12} /> Favorites</p>
            {favorites.map((b) => (
              <Link key={b.id} href={`/base/crm/workspace/${b.workspace_id}/board/${b.id}`} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[0.86rem] ${b.id === activeBoard ? 'bg-brass/15 text-brass' : 'hover:bg-sand/70'}`}>
                <Table2 size={14} className="opacity-70" /> <span className="truncate">{b.name}</span>
              </Link>
            ))}
          </div>
        )}
        <div className="flex items-center px-2 pb-1">
          <span className="flex-1 text-xs font-semibold text-muted">Content</span>
          <Pop label="Content options" trigger={<MoreHorizontal size={15} />} className="rounded p-1 text-muted hover:bg-sand" width={200}>
            {(close) => (
              <div className="p-1">
                <Item onClick={() => { close(); setClosedFolders(new Set()); }}>Expand all folders</Item>
                <Item onClick={() => { close(); setClosedFolders(new Set(folders.map((f) => f.id))); }}>Collapse all folders</Item>
              </div>
            )}
          </Pop>
          <Pop label="Add content" trigger={<Plus size={15} />} className="rounded p-1 text-muted hover:bg-sand" width={250}>
            {addMenu}
          </Pop>
        </div>
        <Link href={`/base/crm/workspace/${workspace.id}`} className={`mb-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-[0.86rem] ${onHome ? 'bg-brass/15 font-medium text-brass' : 'hover:bg-sand/70'}`}>
          <LayoutDashboard size={14} /> Manage workspace
        </Link>
        {subFolders(null).map((f) => <FolderNode key={f.id} f={f} depth={0} />)}
        {boardsIn(null).map((b) => <BoardRow key={b.id} b={b} depth={0} />)}
        {live.length === 0 && folders.length === 0 && <p className="px-2 py-3 text-xs text-muted">This workspace is empty. Use + to add a board or a folder.</p>}
        {q && !live.some(match) && <p className="px-2 py-3 text-xs text-muted">No boards match “{search}”.</p>}
      </div>
      {error && <p className="mx-3 mb-3 rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700">{error} <button type="button" onClick={() => setError(null)} className="float-right">×</button></p>}
    </div>
  );

  return (
    <>
      {/* desktop: the middle column */}
      <aside className="sticky top-0 hidden h-screen w-[272px] flex-none border-r border-stone/70 bg-surface lg:block">{body}</aside>
      {/* phones / tablets */}
      <button type="button" onClick={() => setMobileOpen(true)} className="fixed bottom-24 left-4 z-40 inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2.5 text-sm font-medium shadow-lg ring-1 ring-stone lg:hidden">
        <WsAvatar ws={workspace} size={20} /> {workspace.name}
      </button>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} aria-label="Close" />
          <aside className="absolute inset-y-0 left-0 w-[290px] max-w-[88vw] bg-surface shadow-2xl">{body}</aside>
        </div>
      )}

      <Modal open={modal?.kind === 'board'} onClose={() => setModal(null)} title="New board" description="Start from a template — add, rename and remove columns and groups any time." wide>
        <NewBoardForm workspaceId={workspace.id} folders={folders.map((f) => ({ id: f.id, name: f.name }))} folderId={modal?.kind === 'board' ? modal.folderId ?? null : null} />
      </Modal>
      <Modal open={modal?.kind === 'workspace'} onClose={() => setModal(null)} title="New workspace">
        <WorkspaceForm />
      </Modal>
      <Modal open={modal?.kind === 'edit'} onClose={() => setModal(null)} title="Edit workspace">
        <WorkspaceForm ws={workspace} onDone={() => { setModal(null); router.refresh(); }} />
      </Modal>
      <Modal open={modal?.kind === 'browse'} onClose={() => setModal(null)} title="All workspaces" wide>
        <div className="grid gap-3 sm:grid-cols-2">
          {workspaces.map((w) => (
            <Link key={w.id} href={`/base/crm/workspace/${w.id}`} onClick={() => setModal(null)} className="flex items-center gap-3 rounded-xl border border-stone/70 p-3 hover:border-brass hover:bg-brass/5">
              <WsAvatar ws={w} size={40} />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{w.name}</span>
                <span className="block truncate text-xs text-muted">{w.description ?? (w.visibility === 'members' ? 'Closed workspace' : 'Open workspace')}</span>
              </span>
            </Link>
          ))}
        </div>
      </Modal>
    </>
  );
}
