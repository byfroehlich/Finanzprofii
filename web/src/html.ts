// Winziges Template-Werkzeug: alles Eingesetzte wird escaped, außer es ist schon Roh.
export class Roh {
  constructor(readonly s: string) {}
  toString() { return this.s; }
}

export const roh = (s: string) => new Roh(s);

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]!);

function wert(v: unknown): string {
  if (v instanceof Roh) return v.s;
  if (Array.isArray(v)) return v.map(wert).join("");
  if (v === null || v === undefined || v === false) return "";
  return esc(String(v));
}

export function html(teile: TemplateStringsArray, ...werte: unknown[]): Roh {
  let s = teile[0]!;
  for (let i = 0; i < werte.length; i++) s += wert(werte[i]) + teile[i + 1]!;
  return new Roh(s);
}
