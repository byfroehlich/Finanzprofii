import { readFileSync, existsSync } from "node:fs";

// .env laden ohne zusätzliche Abhängigkeit
const datei = new URL("../.env", import.meta.url);
if (existsSync(datei)) {
  for (const zeile of readFileSync(datei, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(zeile);
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
}

const opt = (k: string): string | undefined => process.env[k] || undefined;
const pflicht = (k: string): string => {
  const v = opt(k);
  if (!v) throw new Error(`${k} fehlt in engine/.env`);
  return v;
};

export const config = {
  supabaseUrl: () => pflicht("SUPABASE_URL"),
  serviceKey: () => pflicht("SUPABASE_SERVICE_ROLE_KEY"),
  owner: () => pflicht("OWNER_ID"),
  wissenDir: opt("WISSEN_DIR"),
  claudeBin: opt("CLAUDE_BIN") ?? "claude",
  vapid: opt("VAPID_PUBLIC_KEY") && opt("VAPID_PRIVATE_KEY")
    ? { publicKey: opt("VAPID_PUBLIC_KEY")!, privateKey: opt("VAPID_PRIVATE_KEY")!, subject: opt("VAPID_SUBJECT") ?? "mailto:admin@localhost" }
    : null,
  smoobu: opt("SMOOBU_API_KEY") ? { apiKey: opt("SMOOBU_API_KEY")!, kontoId: opt("SMOOBU_KONTO_ID") } : null,
  qonto: opt("QONTO_LOGIN") && opt("QONTO_SECRET_KEY")
    ? { login: opt("QONTO_LOGIN")!, secret: opt("QONTO_SECRET_KEY")!, kontoId: opt("QONTO_KONTO_ID") ?? "qonto" }
    : null,
  fintsConfig: opt("FINTS_CONFIG"),
  smtp: opt("SMTP_USER") && opt("SMTP_PASS")
    ? { host: opt("SMTP_HOST") ?? "mail.gmx.net", port: Number(opt("SMTP_PORT") ?? 587), user: opt("SMTP_USER")!, pass: opt("SMTP_PASS")!, from: opt("SMTP_FROM") ?? opt("SMTP_USER")! }
    : null,
  sicherungDir: opt("SICHERUNG_DIR"),
};
