// Qonto (Geschäftskonto GbR): Kontostand und Umsätze über die offizielle API.
// API: https://api-doc.qonto.com – Header "Authorization: login:secret". Ungetestet ohne echten Schlüssel.
import { heute, plusTage, type RohBuchung } from "@zentrale/core";
import { config } from "../config.ts";
import { abrufStatus } from "../db.ts";
import { speichereBuchungen } from "../import.ts";

export interface QontoTransaktion {
  transaction_id: string;
  amount_cents: number;
  side: "debit" | "credit";
  label: string;
  reference?: string | null;
  note?: string | null;
  settled_at?: string | null;
  emitted_at: string;
  status: string;
  currency: string;
}

export function qontoZuBuchungen(liste: QontoTransaktion[]): RohBuchung[] {
  return liste
    .filter((t) => t.status === "completed")
    .map((t, i) => ({
      datum: (t.settled_at ?? t.emitted_at).slice(0, 10),
      betrag: t.side === "debit" ? -Math.abs(t.amount_cents) : Math.abs(t.amount_cents),
      gegenpartei: t.label ?? "",
      // Die Transaktions-ID macht den Fingerabdruck eindeutig
      zweck: [t.reference, t.note, `qonto:${t.transaction_id}`].filter(Boolean).join(" | "),
      waehrung: t.currency ?? "EUR",
      saldoNach: null,
      zeile: i + 1,
    }));
}

export async function rufeQontoAb(): Promise<string> {
  const q = config.qonto;
  if (!q) return "aus";
  const kopf = { Authorization: `${q.login}:${q.secret}` };
  try {
    const org = await fetch("https://thirdparty.qonto.com/v2/organization", { headers: kopf });
    if (!org.ok) throw new Error(`Qonto antwortet ${org.status}`);
    const konten = ((await org.json()) as { organization: { bank_accounts: { id: string; iban: string; balance_cents: number; currency: string }[] } }).organization.bank_accounts;
    const konto = konten[0];
    if (!konto) throw new Error("Kein Qonto-Konto gefunden");

    const trans: QontoTransaktion[] = [];
    for (let seite = 1; seite <= 20; seite++) {
      const url = new URL("https://thirdparty.qonto.com/v2/transactions");
      url.search = new URLSearchParams({ bank_account_id: konto.id, settled_at_from: `${plusTage(heute(), -60)}T00:00:00.000Z`, per_page: "100", current_page: String(seite), "status[]": "completed" }).toString();
      const r = await fetch(url, { headers: kopf });
      if (!r.ok) throw new Error(`Qonto-Umsätze: ${r.status}`);
      const j = (await r.json()) as { transactions: QontoTransaktion[]; meta?: { next_page?: number | null } };
      trans.push(...j.transactions);
      if (!j.meta?.next_page) break;
    }
    const e = await speichereBuchungen(q.kontoId, qontoZuBuchungen(trans), "api", { saldo: konto.balance_cents, datum: heute() });
    const text = `${e.neu} neue Umsätze`;
    await abrufStatus("qonto", true, text);
    return text;
  } catch (e) {
    await abrufStatus("qonto", false, e instanceof Error ? e.message : String(e));
    throw e;
  }
}
