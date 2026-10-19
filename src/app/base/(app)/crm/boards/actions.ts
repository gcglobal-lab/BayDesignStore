'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/base/actionResult';
import { audit } from '@/lib/base/audit';
import { requireCrm, type Viewer } from '@/lib/base/auth';
import { db } from '@/lib/base/db';
import { listEmployees } from '@/lib/base/queries';
import { fullName, workTypeOf } from '@/lib/base/types';
import { BOARD_TEMPLATES, GROUP_COLORS, type BoardColumn, type BoardItem, type BoardUpdate, type ColumnType } from '@/lib/crm/boardTypes';
import { boardAccess } from '@/lib/crm/boards';
import { workspaceAccess } from '@/lib/crm/workspaces';

const uuid = z.string().uuid();
const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
type Need = 'see' | 'edit' | 'manage';

/** Checks the person may do this on the board; returns the viewer or an error result. */
async function guard(boardId: string, need: Need): Promise<{ viewer: Viewer } | { error: ActionResult }> {
  const viewer = await requireCrm();
  if (!uuid.safeParse(boardId).success) return { error: fail('Board not found.') };
  const { data: board } = await db().from('crm_boards').select('id, visibility, created_by').eq('id', boardId).maybeSingle();
  if (!board) return { error: fail('Board not found.') };
  const access = await boardAccess(viewer, board);
  if (!access[need]) return { error: fail(need === 'manage' ? 'Only a Workflow manager or the board’s owner can change the board’s setup.' : 'You can view this board but not change it.') };
  return { viewer };
}
async function boardOf(table: 'crm_board_items' | 'crm_board_groups' | 'crm_board_columns', id: string): Promise<string | null> {
  if (!uuid.safeParse(id).success) return null;
  const { data } = await db().from(table).select('board_id').eq('id', id).maybeSingle();
  return (data?.board_id as string | undefined) ?? null;
}
const touch = (boardId: string) => db().from('crm_boards').update({ updated_at: new Date().toISOString() }).eq('id', boardId);

/** Every row below these rows on the board, at any depth (sub-items, their sub-items, …). */
async function descendantIds(boardId: string, ids: string[]): Promise<string[]> {
  const { data } = await db().from('crm_board_items').select('id, parent_id').eq('board_id', boardId).not('parent_id', 'is', null).limit(20000);
  const kids = new Map<string, string[]>();
  for (const r of (data ?? []) as { id: string; parent_id: string }[]) kids.set(r.parent_id, [...(kids.get(r.parent_id) ?? []), r.id]);
  const out: string[] = [];
  const queue = [...ids];
  while (queue.length) {
    for (const k of kids.get(queue.shift()!) ?? []) {
      out.push(k);
      queue.push(k);
    }
  }
  return out;
}

// ------------------------------------------------------------------ boards --

export async function createBoard(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const viewer = await requireCrm();
  const wsId = String(fd.get('workspace_id') ?? '');
  const { data: ws } = uuid.safeParse(wsId).success ? await db().from('crm_workspaces').select('id, visibility, created_by').eq('id', wsId).maybeSingle() : { data: null };
  if (!ws || !(await workspaceAccess(viewer, ws)).manage) return fail('Only a workspace owner or Workflow manager can add boards here.');
  const folderParse = uuid.safeParse(fd.get('folder_id'));
  const { data: folderRow } = folderParse.success ? await db().from('crm_folders').select('id, workspace_id').eq('id', folderParse.data).maybeSingle() : { data: null };
  const folderId = folderRow && folderRow.workspace_id === ws.id ? folderRow.id : null;
  const parsed = z
    .object({
      name: z.string().trim().min(1, 'Name the board.').max(120),
      description: z.string().trim().max(5000),
      folder: z.string().trim().max(80),
      template: z.string(),
      visibility: z.enum(['everyone', 'members']).catch('everyone'),
      designer_groups: z.boolean(),
    })
    .safeParse({ name: fd.get('name'), description: fd.get('description') ?? '', folder: fd.get('folder') ?? '', template: fd.get('template') ?? 'blank', visibility: fd.get('visibility'), designer_groups: fd.get('designer_groups') === 'on' });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check the board.');
  const v = parsed.data;
  const tpl = BOARD_TEMPLATES.find((t) => t.key === v.template) ?? BOARD_TEMPLATES[BOARD_TEMPLATES.length - 1];
  const { count } = await db().from('crm_boards').select('id', { count: 'exact', head: true });
  const { data: board, error } = await db()
    .from('crm_boards')
    .insert({ name: v.name, description: v.description || null, workspace_id: ws.id, folder_id: folderId, visibility: v.visibility, item_label: tpl.item_label, group_label: tpl.group_label, position: count ?? 0, created_by: viewer.employeeId })
    .select('id')
    .single();
  if (error || !board) return fail('Couldn’t create the board.');

  // Columns (formulas point at other columns by template key → real id). Both scopes, the
  // groups, membership and the audit entry are written at the same time.
  const keyToId = new Map<string, string>();
  const scopes = ['item', 'subitem'] as const;
  const made = await Promise.all(
    scopes.map(async (scope) => {
      const cols = tpl.columns.filter((c) => (c.scope ?? 'item') === scope);
      if (!cols.length) return { scope, cols, rows: [] as { id: string; position: number }[] };
      const { data } = await db()
        .from('crm_board_columns')
        .insert(cols.map((c, i) => ({ board_id: board.id, scope, name: c.name, type: c.type, settings: c.type === 'formula' ? {} : (c.settings ?? {}), width: c.width ?? 160, position: i })))
        .select('id, position');
      return { scope, cols, rows: (data ?? []) as { id: string; position: number }[] };
    }),
  );
  for (const { scope, cols, rows } of made)
    rows.forEach((m) => {
      const c = cols[m.position];
      if (c.key) keyToId.set(c.key, m.id);
      if (c.type === 'formula') keyToId.set(`formula:${scope}:${m.position}`, m.id);
    });
  const formulaUpdates = made.flatMap(({ scope, cols }) =>
    cols.flatMap((c, i) =>
      c.type === 'formula' && c.settings
        ? [db().from('crm_board_columns').update({ settings: { op: c.settings.op, a: c.settings.a ? keyToId.get(c.settings.a) : undefined, b: c.settings.b ? keyToId.get(c.settings.b) : undefined } }).eq('id', keyToId.get(`formula:${scope}:${i}`)!)]
        : [],
    ),
  );

  // Groups: the template's, or one per designer on the team.
  let groups = tpl.groups.map((name) => ({ name, employee_id: null as string | null }));
  if (v.designer_groups) {
    const designers = (await listEmployees()).filter((e) => workTypeOf(e) === 'designer');
    if (designers.length) groups = designers.map((e) => ({ name: fullName(e), employee_id: e.id }));
  }
  await Promise.all([
    ...formulaUpdates,
    db().from('crm_board_groups').insert(groups.map((g, i) => ({ board_id: board.id, name: g.name, employee_id: g.employee_id, color: GROUP_COLORS[i % GROUP_COLORS.length], position: i }))),
    v.visibility === 'members' && viewer.employeeId ? db().from('crm_board_members').insert({ board_id: board.id, employee_id: viewer.employeeId, role: 'editor' }) : null,
    audit(viewer, 'crm.board', 'crm_boards', board.id, { text: `created the board “${v.name}”` }),
  ]);
  revalidatePath('/base/crm/workspace', 'layout');
  redirect(`/base/crm/workspace/${ws.id}/board/${board.id}`);
}

export async function updateBoard(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = String(fd.get('id') ?? '');
  const g = await guard(id, 'manage');
  if ('error' in g) return g.error;
  const parsed = z
    .object({
      name: z.string().trim().min(1, 'Name the board.').max(120),
      description: z.string().trim().max(5000),
      folder: z.string().trim().max(80),
      color: hex.catch('#6366F1'),
      visibility: z.enum(['everyone', 'members']).catch('everyone'),
      item_label: z.string().trim().min(1).max(40).catch('Item'),
      group_label: z.string().trim().min(1).max(40).catch('Group'),
    })
    .safeParse(Object.fromEntries(['name', 'description', 'folder', 'color', 'visibility', 'item_label', 'group_label'].map((k) => [k, fd.get(k) ?? ''])));
  // (folders are managed from the workspace panel now; the old text folder is left as it was)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Please check the board.');
  const v = parsed.data;
  const { folder: _folder, ...rest } = v;
  void _folder;
  await db().from('crm_boards').update({ ...rest, description: v.description || null }).eq('id', id);
  await audit(g.viewer, 'crm.board', 'crm_boards', id, { text: `updated the board “${v.name}”` });
  revalidatePath('/base/crm/workspace', 'layout');
  return done('Board saved.');
}

/** Renames what a row is called on this board (the first column's title, e.g. "Item" → "Client"). */
export async function setItemLabel(boardId: string, label: string): Promise<ActionResult> {
  const g = await guard(boardId, 'manage');
  if ('error' in g) return g.error;
  const name = label.trim().slice(0, 40);
  if (!name) return fail('The column needs a name.');
  await db().from('crm_boards').update({ item_label: name }).eq('id', boardId);
  revalidatePath('/base/crm/workspace', 'layout');
  return done();
}

export async function archiveBoard(fd: FormData) {
  const id = String(fd.get('id') ?? '');
  const g = await guard(id, 'manage');
  if ('error' in g) return;
  const archived = fd.get('archived') === 'true';
  const { data } = await db().from('crm_boards').update({ archived }).eq('id', id).select('name').maybeSingle();
  await audit(g.viewer, 'crm.board', 'crm_boards', id, { text: `${archived ? 'archived' : 'restored'} the board “${data?.name ?? ''}”` });
  revalidatePath('/base/crm/workspace', 'layout');
  if (archived) redirect('/base/crm/workspace');
}

export async function deleteBoard(fd: FormData) {
  const viewer = await requireCrm({ manager: true });
  const id = uuid.safeParse(fd.get('id'));
  if (!id.success) return;
  const { data } = await db().from('crm_boards').delete().eq('id', id.data).select('name, workspace_id').maybeSingle();
  await audit(viewer, 'crm.board', 'crm_boards', id.data, { text: `deleted the board “${data?.name ?? ''}”` });
  revalidatePath('/base/crm/workspace', 'layout');
  redirect(data ? `/base/crm/workspace/${data.workspace_id}` : '/base/crm/workspace');
}

/** Copy a board's setup (columns, groups) and, if asked, its items and sub-items. */
export async function duplicateBoard(fd: FormData) {
  const viewer = await requireCrm();
  const id = uuid.safeParse(fd.get('id'));
  if (!id.success) return;
  const withItems = fd.get('with_items') === 'on';
  const [{ data: b }, { data: cols }, { data: groups }, { data: items }] = await Promise.all([
    db().from('crm_boards').select('*').eq('id', id.data).single(),
    db().from('crm_board_columns').select('*').eq('board_id', id.data),
    db().from('crm_board_groups').select('*').eq('board_id', id.data),
    withItems ? db().from('crm_board_items').select('*').eq('board_id', id.data) : Promise.resolve({ data: [] as BoardItem[] }),
  ]);
  if (!b || !(await boardAccess(viewer, b)).manage) return;
  const { data: copy } = await db()
    .from('crm_boards')
    .insert({ name: `${b.name} (copy)`.slice(0, 120), description: b.description, workspace_id: b.workspace_id, folder_id: b.folder_id, color: b.color, visibility: b.visibility, item_label: b.item_label, group_label: b.group_label, position: b.position + 1, created_by: viewer.employeeId })
    .select('id')
    .single();
  if (!copy) return;
  const colMap = new Map<string, string>();
  for (const c of (cols ?? []) as BoardColumn[]) {
    const { data } = await db().from('crm_board_columns').insert({ board_id: copy.id, scope: c.scope, name: c.name, type: c.type, settings: c.settings, width: c.width, position: c.position }).select('id').single();
    if (data) colMap.set(c.id, data.id);
  }
  for (const c of (cols ?? []) as BoardColumn[]) {
    if (c.type !== 'formula') continue;
    await db().from('crm_board_columns').update({ settings: { ...c.settings, a: c.settings.a ? colMap.get(c.settings.a) : undefined, b: c.settings.b ? colMap.get(c.settings.b) : undefined } }).eq('id', colMap.get(c.id)!);
  }
  const groupMap = new Map<string, string>();
  for (const gr of groups ?? []) {
    const { data } = await db().from('crm_board_groups').insert({ board_id: copy.id, name: gr.name, color: gr.color, employee_id: gr.employee_id, position: gr.position }).select('id').single();
    if (data) groupMap.set(gr.id, data.id);
  }
  const remap = (values: Record<string, unknown>) => Object.fromEntries(Object.entries(values).flatMap(([k, val]) => (colMap.has(k) ? [[colMap.get(k)!, val]] : [])));
  const itemMap = new Map<string, string>();
  const all = (items ?? []) as BoardItem[];
  for (const it of [...all.filter((x) => !x.parent_id), ...all.filter((x) => x.parent_id)]) {
    const { data } = await db()
      .from('crm_board_items')
      .insert({ board_id: copy.id, group_id: groupMap.get(it.group_id), parent_id: it.parent_id ? itemMap.get(it.parent_id) : null, name: it.name, description: it.description, values: remap(it.values), contact_id: it.contact_id, position: it.position, created_by: viewer.employeeId })
      .select('id')
      .single();
    if (data) itemMap.set(it.id, data.id);
  }
  await audit(viewer, 'crm.board', 'crm_boards', copy.id, { text: `duplicated the board “${b.name}”` });
  revalidatePath('/base/crm/workspace', 'layout');
  redirect(`/base/crm/workspace/${b.workspace_id}/board/${copy.id}`);
}

/** Add / change / remove a board member (role null = remove). */
export async function setBoardMember(boardId: string, employeeId: string, role: 'editor' | 'viewer' | null): Promise<ActionResult> {
  const g = await guard(boardId, 'manage');
  if ('error' in g) return g.error;
  if (!uuid.safeParse(employeeId).success) return fail('Choose a person.');
  if (role) await db().from('crm_board_members').upsert({ board_id: boardId, employee_id: employeeId, role });
  else await db().from('crm_board_members').delete().eq('board_id', boardId).eq('employee_id', employeeId);
  revalidatePath('/base/crm/workspace', 'layout');
  return done(role ? 'Member saved.' : 'Removed.');
}

// ------------------------------------------------------------------ groups --

export async function addGroup(boardId: string, name: string, employeeId?: string | null): Promise<ActionResult> {
  const g = await guard(boardId, 'edit');
  if ('error' in g) return g.error;
  const n = name.trim().slice(0, 120);
  if (!n) return fail('Give it a name.');
  const { count } = await db().from('crm_board_groups').select('id', { count: 'exact', head: true }).eq('board_id', boardId);
  const { data, error } = await db()
    .from('crm_board_groups')
    .insert({ board_id: boardId, name: n, employee_id: employeeId && uuid.safeParse(employeeId).success ? employeeId : null, color: GROUP_COLORS[(count ?? 0) % GROUP_COLORS.length], position: count ?? 0 })
    .select('id, color, position')
    .single();
  if (error || !data) return fail('Couldn’t add it.');
  await touch(boardId);
  return done(undefined, { id: data.id, color: data.color, position: String(data.position) });
}

export async function updateGroup(id: string, patch: { name?: string; color?: string; employee_id?: string | null; position?: number }): Promise<ActionResult> {
  const boardId = await boardOf('crm_board_groups', id);
  if (!boardId) return fail('Not found.');
  const g = await guard(boardId, 'edit');
  if ('error' in g) return g.error;
  const clean: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim().slice(0, 120);
    if (!n) return fail('Give it a name.');
    clean.name = n;
  }
  if (patch.color !== undefined && hex.safeParse(patch.color).success) clean.color = patch.color;
  if (patch.employee_id !== undefined) clean.employee_id = patch.employee_id && uuid.safeParse(patch.employee_id).success ? patch.employee_id : null;
  if (patch.position !== undefined && Number.isFinite(patch.position)) clean.position = Math.round(patch.position);
  await db().from('crm_board_groups').update(clean).eq('id', id);
  return done();
}

export async function deleteGroup(id: string): Promise<ActionResult> {
  const boardId = await boardOf('crm_board_groups', id);
  if (!boardId) return fail('Not found.');
  const g = await guard(boardId, 'manage');
  if ('error' in g) return g.error;
  const { count } = await db().from('crm_board_groups').select('id', { count: 'exact', head: true }).eq('board_id', boardId);
  if ((count ?? 0) <= 1) return fail('A board needs at least one group.');
  const { data } = await db().from('crm_board_groups').delete().eq('id', id).select('name').maybeSingle();
  await audit(g.viewer, 'crm.board', 'crm_board_groups', id, { text: `deleted the group “${data?.name ?? ''}” and its rows` });
  return done();
}

// ----------------------------------------------------------------- columns --

const TYPES: ColumnType[] = ['text', 'long_text', 'number', 'currency', 'date', 'status', 'person', 'email', 'phone', 'link', 'checkbox', 'formula', 'dropdown', 'people', 'files', 'timeline'];
const settingsSchema = z
  .object({
    labels: z.array(z.object({ id: z.string().max(20), label: z.string().trim().max(40), color: hex })).max(30).optional(),
    op: z.enum(['subtract', 'add', 'multiply', 'divide', 'subitems_sum']).optional(),
    a: z.string().uuid().optional(),
    b: z.string().uuid().optional(),
  })
  .catch({});

export async function addColumn(boardId: string, scope: 'item' | 'subitem', name: string, type: ColumnType, settings: unknown): Promise<ActionResult> {
  const g = await guard(boardId, 'manage');
  if ('error' in g) return g.error;
  const n = name.trim().slice(0, 60);
  if (!n || !TYPES.includes(type) || (scope !== 'item' && scope !== 'subitem')) return fail('Choose a name and a type.');
  const s = settingsSchema.parse(settings ?? {});
  if (type === 'status' && !s.labels?.length) s.labels = [{ id: 's0', label: 'Working on it', color: '#FDAB3D' }, { id: 's1', label: 'Stuck', color: '#DF2F4A' }, { id: 's2', label: 'Done', color: '#00C875' }];
  if (type === 'dropdown' && !s.labels?.length) s.labels = [{ id: 'd0', label: 'Option 1', color: '#579BFC' }, { id: 'd1', label: 'Option 2', color: '#A25DDC' }];
  const { count } = await db().from('crm_board_columns').select('id', { count: 'exact', head: true }).eq('board_id', boardId).eq('scope', scope);
  const { data, error } = await db()
    .from('crm_board_columns')
    .insert({ board_id: boardId, scope, name: n, type, settings: s, width: type === 'long_text' ? 240 : type === 'checkbox' ? 90 : 150, position: count ?? 0 })
    .select('*')
    .single();
  if (error || !data) return fail('Couldn’t add the column.');
  await touch(boardId);
  return done(undefined, { column: JSON.stringify(data) });
}

export async function updateColumn(id: string, patch: { name?: string; settings?: unknown; width?: number; position?: number }): Promise<ActionResult> {
  const boardId = await boardOf('crm_board_columns', id);
  if (!boardId) return fail('Not found.');
  const g = await guard(boardId, 'manage');
  if ('error' in g) return g.error;
  const clean: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim().slice(0, 60);
    if (!n) return fail('Give the column a name.');
    clean.name = n;
  }
  if (patch.settings !== undefined) clean.settings = settingsSchema.parse(patch.settings);
  if (patch.width !== undefined) clean.width = Math.max(60, Math.min(600, Math.round(patch.width)));
  if (patch.position !== undefined && Number.isFinite(patch.position)) clean.position = Math.round(patch.position);
  await db().from('crm_board_columns').update(clean).eq('id', id);
  return done();
}

export async function deleteColumn(id: string): Promise<ActionResult> {
  const boardId = await boardOf('crm_board_columns', id);
  if (!boardId) return fail('Not found.');
  const g = await guard(boardId, 'manage');
  if ('error' in g) return g.error;
  const { data } = await db().from('crm_board_columns').delete().eq('id', id).select('name').maybeSingle();
  await audit(g.viewer, 'crm.board', 'crm_board_columns', id, { text: `deleted the column “${data?.name ?? ''}”` });
  return done();
}

// ------------------------------------------------------------------- items --

export async function addItem(boardId: string, groupId: string, name: string, parentId?: string | null): Promise<ActionResult> {
  const g = await guard(boardId, 'edit');
  if ('error' in g) return g.error;
  const n = name.trim().slice(0, 200);
  if (!n) return fail('Type a name first.');
  if (!uuid.safeParse(groupId).success || (parentId && !uuid.safeParse(parentId).success)) return fail('Not found.');
  let group = groupId;
  if (parentId) {
    const { data: parent } = await db().from('crm_board_items').select('board_id, group_id').eq('id', parentId).maybeSingle();
    if (!parent || parent.board_id !== boardId) return fail('Not found.');
    group = parent.group_id;
  }
  const { data: last } = await db().from('crm_board_items').select('position').eq('board_id', boardId).order('position', { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await db()
    .from('crm_board_items')
    .insert({ board_id: boardId, group_id: group, parent_id: parentId ?? null, name: n, position: (last?.position ?? 0) + 1, created_by: g.viewer.employeeId })
    .select('*')
    .single();
  if (error || !data) return fail('Couldn’t add it.');
  await db().from('crm_board_updates').insert({ item_id: data.id, kind: 'log', body: `Created by ${g.viewer.name}`, author_id: g.viewer.employeeId, author_name: g.viewer.name });
  await touch(boardId);
  return done(undefined, { item: JSON.stringify(data) });
}

export async function updateItem(id: string, patch: { name?: string; description?: string; group_id?: string; position?: number; contact_id?: string | null }): Promise<ActionResult> {
  const boardId = await boardOf('crm_board_items', id);
  if (!boardId) return fail('Not found.');
  const g = await guard(boardId, 'edit');
  if ('error' in g) return g.error;
  const clean: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim().slice(0, 200);
    if (!n) return fail('The name can’t be empty.');
    clean.name = n;
  }
  if (patch.description !== undefined) clean.description = patch.description.slice(0, 10000) || null;
  if (patch.group_id !== undefined && uuid.safeParse(patch.group_id).success) {
    clean.group_id = patch.group_id;
    // sub-items (at every level) follow their parent
    const below = await descendantIds(boardId, [id]);
    if (below.length) await db().from('crm_board_items').update({ group_id: patch.group_id }).in('id', below);
  }
  if (patch.position !== undefined && Number.isFinite(patch.position)) clean.position = patch.position;
  if (patch.contact_id !== undefined) clean.contact_id = patch.contact_id && uuid.safeParse(patch.contact_id).success ? patch.contact_id : null;
  const { error } = await db().from('crm_board_items').update(clean).eq('id', id);
  if (error) return fail('Couldn’t save.');
  return done();
}

/** Save one cell. Status changes are noted in the item's updates. */
export async function setCell(itemId: string, columnId: string, value: unknown): Promise<ActionResult> {
  const boardId = await boardOf('crm_board_items', itemId);
  if (!boardId) return fail('Not found.');
  const g = await guard(boardId, 'edit');
  if ('error' in g) return g.error;
  const { data: col } = await db().from('crm_board_columns').select('name, type, settings, board_id').eq('id', columnId).maybeSingle();
  if (!col || col.board_id !== boardId || col.type === 'formula') return fail('That column can’t be edited.');
  let v: unknown = value;
  if (v === '' || v === undefined) v = null;
  switch (col.type as ColumnType) {
    case 'number':
    case 'currency':
      if (v !== null) {
        v = Number(String(v).replace(/[$,\s]/g, ''));
        if (!Number.isFinite(v as number)) return fail('Enter a number.');
      }
      break;
    case 'date':
      if (v !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return fail('Pick a date.');
      break;
    case 'checkbox':
      v = Boolean(v) || null;
      break;
    case 'person':
      if (v !== null && !uuid.safeParse(v).success) return fail('Choose a person.');
      break;
    case 'status':
    case 'dropdown':
      if (v !== null && !(col.settings?.labels ?? []).some((l: { id: string }) => l.id === v)) return fail('Choose a label.');
      break;
    case 'people': {
      const ids = Array.isArray(v) ? v : v === null ? [] : [v];
      if (!ids.every((x) => uuid.safeParse(x).success) || ids.length > 30) return fail('Choose people from the team.');
      v = ids.length ? [...new Set(ids as string[])] : null;
      break;
    }
    case 'timeline': {
      if (v === null) break;
      const t = v as { from?: unknown; to?: unknown };
      const ok = typeof t === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(String(t.from)) && /^\d{4}-\d{2}-\d{2}$/.test(String(t.to));
      if (!ok) return fail('Pick a start and end date.');
      v = String(t.from) <= String(t.to) ? { from: t.from, to: t.to } : { from: t.to, to: t.from };
      break;
    }
    case 'files':
      return fail('Use the upload button for files.');
    default:
      if (v !== null) v = String(v).slice(0, col.type === 'long_text' ? 5000 : 500);
  }
  const { error } = await db().rpc('crm_board_set_value', { p_item: itemId, p_column: columnId, p_value: v });
  if (error) return fail('Couldn’t save.');
  if (col.type === 'status') {
    const label = (col.settings?.labels ?? []).find((l: { id: string }) => l.id === v)?.label ?? 'cleared';
    await db().from('crm_board_updates').insert({ item_id: itemId, kind: 'log', body: `${col.name}: ${label}`, author_id: g.viewer.employeeId, author_name: g.viewer.name });
  }
  await db().from('crm_board_items').update({ updated_at: new Date().toISOString() }).eq('id', itemId);
  return done();
}

export async function deleteItem(id: string): Promise<ActionResult> {
  const boardId = await boardOf('crm_board_items', id);
  if (!boardId) return fail('Not found.');
  const g = await guard(boardId, 'edit');
  if ('error' in g) return g.error;
  const { data } = await db().from('crm_board_items').delete().eq('id', id).select('name').maybeSingle();
  await audit(g.viewer, 'crm.board', 'crm_board_items', id, { text: `deleted “${data?.name ?? ''}” from a board` });
  return done();
}

export async function duplicateItem(id: string): Promise<ActionResult> {
  const boardId = await boardOf('crm_board_items', id);
  if (!boardId) return fail('Not found.');
  const g = await guard(boardId, 'edit');
  if ('error' in g) return g.error;
  const { data: it } = await db().from('crm_board_items').select('*').eq('id', id).single();
  const { data: copy } = await db()
    .from('crm_board_items')
    .insert({ board_id: it.board_id, group_id: it.group_id, parent_id: it.parent_id, name: `${it.name} (copy)`.slice(0, 200), description: it.description, values: it.values, contact_id: it.contact_id, position: it.position + 0.5, created_by: g.viewer.employeeId })
    .select('*')
    .single();
  if (!copy) return fail('Couldn’t duplicate.');
  // Copy every level below it, one level at a time, pointing each copy at its new parent.
  const { data: all } = await db().from('crm_board_items').select('*').eq('board_id', it.board_id).not('parent_id', 'is', null).limit(20000);
  const rows = (all ?? []) as BoardItem[];
  const made: BoardItem[] = [];
  let level: [string, string][] = [[id, copy.id]];
  while (level.length && made.length < 2000) {
    const next: [string, string][] = [];
    const batch = level.flatMap(([oldParent, newParent]) => rows.filter((r) => r.parent_id === oldParent).map((r) => ({ r, newParent })));
    if (!batch.length) break;
    const { data: inserted } = await db()
      .from('crm_board_items')
      .insert(batch.map(({ r, newParent }) => ({ board_id: r.board_id, group_id: copy.group_id, parent_id: newParent, name: r.name, description: r.description, values: r.values, position: r.position, created_by: g.viewer.employeeId })))
      .select('*');
    (inserted ?? []).forEach((n: BoardItem, i: number) => {
      made.push(n);
      next.push([batch[i].r.id, n.id]);
    });
    level = next;
  }
  return done(undefined, { items: JSON.stringify([copy, ...made]) });
}

// ----------------------------------------------------------------- updates --

export async function itemUpdates(itemId: string): Promise<BoardUpdate[]> {
  const boardId = await boardOf('crm_board_items', itemId);
  if (!boardId) return [];
  const g = await guard(boardId, 'see');
  if ('error' in g) return [];
  const { data } = await db().from('crm_board_updates').select('id, item_id, kind, body, author_name, created_at').eq('item_id', itemId).order('created_at', { ascending: false }).limit(200);
  return (data ?? []) as BoardUpdate[];
}

export async function addItemUpdate(itemId: string, body: string): Promise<ActionResult> {
  const boardId = await boardOf('crm_board_items', itemId);
  if (!boardId) return fail('Not found.');
  const g = await guard(boardId, 'edit');
  if ('error' in g) return g.error;
  const text = body.trim().slice(0, 5000);
  if (!text) return fail('Write something first.');
  await db().from('crm_board_updates').insert({ item_id: itemId, kind: 'comment', body: text, author_id: g.viewer.employeeId, author_name: g.viewer.name });
  return done();
}

/** Several selected rows at once: move them to a group, or delete them. */
export async function bulkItems(boardId: string, ids: string[], op: 'move' | 'delete', groupId?: string): Promise<ActionResult> {
  const g = await guard(boardId, 'edit');
  if ('error' in g) return g.error;
  const list = ids.filter((x) => uuid.safeParse(x).success).slice(0, 500);
  if (!list.length) return fail('Select some rows first.');
  if (op === 'delete') {
    await db().from('crm_board_items').delete().eq('board_id', boardId).in('id', list);
    await audit(g.viewer, 'crm.board', 'crm_board_items', null, { text: `deleted ${list.length} row${list.length === 1 ? '' : 's'} from a board` });
    return done();
  }
  if (!groupId || !uuid.safeParse(groupId).success) return fail('Choose a group.');
  const { data: grp } = await db().from('crm_board_groups').select('board_id').eq('id', groupId).maybeSingle();
  if (grp?.board_id !== boardId) return fail('Choose a group on this board.');
  const below = await descendantIds(boardId, list);
  await db().from('crm_board_items').update({ group_id: groupId }).eq('board_id', boardId).in('id', [...list, ...below]);
  return done();
}
