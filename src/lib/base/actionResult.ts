/** What a form's server action reports back to the page. */
export type ActionResult = { ok: boolean; message?: string; data?: Record<string, string> } | null;

export const fail = (message: string): ActionResult => ({ ok: false, message });
export const done = (message?: string, data?: Record<string, string>): ActionResult => ({ ok: true, message, data });
