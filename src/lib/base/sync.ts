import 'server-only';

/**
 * Keeps the in-memory caches of several server processes in step when the app runs as a
 * cluster (npm run start:cluster): a process that saves a change tells the others to drop
 * their cached copy. Without a cluster (npm start, one Docker container) this does nothing.
 * Separate Docker containers can't talk this way; their caches expire within seconds instead.
 */
type Scope = 'memo' | 'reads';
type Message = { type: 'bdb-invalidate'; scope: Scope; keys: string[] };

const handlers = new Map<Scope, (keys: string[]) => void>();
let listening = false;

export function publish(scope: Scope, keys: string[]) {
  if (typeof process.send === 'function' && process.connected) {
    try {
      process.send({ type: 'bdb-invalidate', scope, keys } satisfies Message);
    } catch {
      // The cluster is shutting down; nothing to tell.
    }
  }
}

export function onRemoteInvalidate(scope: Scope, handler: (keys: string[]) => void) {
  handlers.set(scope, handler);
  if (listening || typeof process.send !== 'function') return;
  listening = true;
  process.on('message', (msg: unknown) => {
    const m = msg as Partial<Message> | null;
    if (m?.type === 'bdb-invalidate' && Array.isArray(m.keys) && m.scope) handlers.get(m.scope)?.(m.keys);
  });
}
