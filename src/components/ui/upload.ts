'use client';

import { finishUpload, startUpload, type PortalFile } from '@/app/base/(app)/crm/files/actions';

type Target = { item_id?: string | null; column_id?: string | null; task_id?: string | null };

/**
 * Uploads one file: the server checks permission and hands out a one-time link, the browser
 * sends the bytes straight to storage, then the server records the file.
 */
export async function uploadFile(target: Target, file: File): Promise<PortalFile> {
  const meta = { name: file.name, size: file.size, type: file.type };
  const start = await startUpload(target, meta);
  if (!start.ok) throw new Error(start.message);
  const res = await fetch(start.url, {
    method: 'PUT',
    headers: { 'content-type': file.type || 'application/octet-stream', 'x-upsert': 'false', 'cache-control': 'max-age=3600' },
    body: await file.arrayBuffer(),
  });
  if (!res.ok) throw new Error('The upload failed — check your connection and try again.');
  const done = await finishUpload(target, start.path, meta);
  if (!done.ok) throw new Error(done.message);
  return done.file;
}

export const fileUrl = (id: string, download = false) => `/base/crm/files/${id}${download ? '?download=1' : ''}`;

/** "PDF", "XLS"… and a colour, for little file badges. */
export function fileKind(name: string, mime: string): { label: string; color: string; image: boolean } {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (mime.startsWith('image/')) return { label: 'IMG', color: '#A25DDC', image: true };
  if (ext === 'pdf') return { label: 'PDF', color: '#E2445C', image: false };
  if (['xls', 'xlsx', 'csv'].includes(ext)) return { label: 'XLS', color: '#00A359', image: false };
  if (['doc', 'docx'].includes(ext)) return { label: 'DOC', color: '#2B6CD4', image: false };
  return { label: (ext || 'FILE').slice(0, 4).toUpperCase(), color: '#579BFC', image: false };
}

export const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
