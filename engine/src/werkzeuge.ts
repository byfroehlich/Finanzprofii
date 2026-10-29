// Die Werkzeuge, die Claude in der Zentrale hat. Lesen ist frei.
// Schreiben geht nur als Vorschlag (Freigabe) oder als Erklärung zu einer Buchung.
import {
  BEREICHE, beschreibeAktion, euro, satz, findeWiederkehrende, heute, kannIchMirLeisten, kurzesDatum,
  monatsname, parseBetrag, prognose, pruefeAktion, RHYTHMEN, warnungen, type Bereich, type Prognose,
} from "@zentrale/core";
import { config } from "./config.ts";
import { db, ladeBestand, pruefe } from "./db.ts";

export interface Ergebnis {
  text: string;
  daten: unknown;
}

type Args = Record<string, unknown>;

interface Werkzeug {
  beschreibung: string;
  /** JSON Schema der Eingabe */
  schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  /** true = verändert Daten (nur erklaere/vorschlag) */
  schreibt?: boolean;
  aus: (a: Args) => Promise<Ergebnis>;
}

const s = (a: Args, k: string): string | undefined => (typeof a[k] === "string" && a[k] !== "" ? (a[k] as string) : undefined);
const nummer = (a: Args, k: string): number | undefined => (typeof a[k] === "number" ? (a[k] as number) : s(a, k) ? Number(s(a, k)) : undefined);
const OHNE_BUCHUNGEN = "2999-01-01";

function zusammenfassung(p: Prognose): string {
  return p.konten.map((v) => {
    const warn = v.minus ? `  ⚠ Minus ab ${kurzesDatum(v.minus.datum)}` : v.knapp ? `  ⚠ unter Puffer ab ${kurzesDatum(v.knapp.datum)}` : "";
    return `${v.name}: heute ${euro(v.start.saldo)} · Tiefpunkt ${euro(v.tiefpunkt.saldo)} am ${kurzesDatum(v.tiefpunkt.datum)} · in 6 Monaten ${euro(v.ende.saldo)}${warn}`;
  }).join("\n");
}

export const WERKZEUGE: Record<string, Werkzeug> = {
  stand: {
    beschreibung: "Kontostände aller Konten, Tiefpunkte der nächsten 6 Monate und aktuelle Warnungen.",
    schema: { type: "object", properties: {} },
    aus: async () => {
      const h = heute();
      const b = await ladeBestand(OHNE_BUCHUNGEN);
      const p = prognose(b, { von: h });
      const w = warnungen(b, p, h);
      const konten = b.konten.map((k) => `${k.name} (id ${k.id}, ${k.bank}): ${euro(k.saldo)} Stand ${kurzesDatum(k.saldoDatum)}${k.liquide ? "" : " – nicht liquide"}`);
      return {
        daten: { konten: b.konten, prognose: p.konten.map(({ punkte, ...r }) => r), warnungen: w },
        text: [
          `Heute ${kurzesDatum(h)}`, ...konten, "", zusammenfassung(p), "",
          `Alle liquiden Konten: ${euro(p.gesamt.start.saldo)}, Tiefpunkt ${euro(p.gesamt.tiefpunkt.saldo)} am ${kurzesDatum(p.gesamt.tiefpunkt.datum)}`, "",
          w.length ? "Warnungen:\n" + w.map((x) => `- [${x.stufe}] ${x.titel}: ${x.text}`).join("\n") : "Keine Warnungen.",
        ].join("\n"),
      };
    },
  },

  prognose: {
    beschreibung: "Erwartete Ein- und Ausgänge je Konto mit Monatsendständen und Tiefpunkt.",
    schema: {
      type: "object",
      properties: {
        tage: { type: "number", description: "Zeitraum in Tagen, Standard 183" },
        konto: { type: "string", description: "Nur dieses Konto (id)" },
        mit_offenen: { type: "boolean", description: "Auch unsichere Posten mitrechnen" },
      },
    },
    aus: async (a) => {
      const b = await ladeBestand(OHNE_BUCHUNGEN);
      const p = prognose(b, { von: heute(), tage: Math.min(nummer(a, "tage") ?? 183, 730), mitOffenen: a.mit_offenen === true });
      const konten = s(a, "konto") ? p.konten.filter((v) => v.kontoId === s(a, "konto")) : p.konten;
      const text = konten.map((v) => {
        const monate = new Map<string, number>();
        for (const pt of v.punkte) monate.set(pt.datum.slice(0, 7), pt.saldo);
        return [
          `== ${v.name} (${v.kontoId}) ==`,
          ...v.ereignisse.map((e) => `${kurzesDatum(e.datum)}  ${euro(e.betrag, true).padStart(13)}  ${e.titel}${e.sicherheit !== "sicher" ? ` (${e.sicherheit})` : ""}`),
          `Monatsende: ${[...monate].map(([m, x]) => `${monatsname(m + "-01", true)} ${euro(x)}`).join(" · ")}`,
          `Tiefpunkt ${euro(v.tiefpunkt.saldo)} am ${kurzesDatum(v.tiefpunkt.datum)}`,
        ].join("\n");
      }).join("\n\n");
      return { daten: konten.map(({ punkte, ...r }) => r), text: text || "Kein Konto gefunden." };
    },
  },

  buchungen: {
    beschreibung: "Kontobewegungen suchen. Jede Zeile beginnt mit der Buchungs-ID.",
    schema: {
      type: "object",
      properties: {
        seit: { type: "string", description: "JJJJ-MM-TT" },
        bis: { type: "string", description: "JJJJ-MM-TT" },
        konto: { type: "string" },
        suche: { type: "string", description: "Text in Gegenpartei oder Verwendungszweck" },
        unklar: { type: "boolean", description: "Nur Buchungen ohne Erklärung" },
        max: { type: "number", description: "Höchstens so viele, Standard 50, maximal 300" },
      },
    },
    aus: async (a) => {
      let q = db().from("buchungen").select("id, konto_id, datum, betrag, gegenpartei, zweck, bereich, kategorie, erklaerung")
        .eq("owner", config.owner()).order("datum", { ascending: false }).limit(Math.min(nummer(a, "max") ?? 50, 300));
      if (s(a, "seit")) q = q.gte("datum", s(a, "seit")!);
      if (s(a, "bis")) q = q.lte("datum", s(a, "bis")!);
      if (s(a, "konto")) q = q.eq("konto_id", s(a, "konto")!);
      if (a.unklar === true) q = q.is("erklaerung", null);
      const suche = s(a, "suche")?.replace(/[%,()*\\]/g, "");
      if (suche) q = q.or(`gegenpartei.ilike.%${suche}%,zweck.ilike.%${suche}%`);
      const z = pruefe(await q, "Buchungen");
      return {
        daten: z,
        text: z.map((x) => `${x.id}  ${kurzesDatum(x.datum)}  ${euro(x.betrag, true).padStart(13)}  [${x.konto_id}] ${x.gegenpartei} | ${String(x.zweck).slice(0, 80)}\n    → ${x.erklaerung ?? "(noch nicht erklärt)"}`).join("\n") || "Keine Buchungen.",
      };
    },
  },

  vertraege: {
    beschreibung: "Wiederkehrende Zahlungen (Raten, Leasing, Versicherungen, feste Einnahmen).",
    schema: { type: "object", properties: {} },
    aus: async () => {
      const b = await ladeBestand(OHNE_BUCHUNGEN);
      return {
        daten: b.vertraege,
        text: b.vertraege.map((v) => `${v.id}: ${v.name} ${euro(v.betrag, true)} ${RHYTHMEN[v.rhythmus]}, nächste ${kurzesDatum(v.naechsteFaelligkeit)}${v.ende ? `, bis ${kurzesDatum(v.ende)}` : ""} (${v.kontoId}, ${BEREICHE[v.bereich]})${v.aktiv ? "" : " – inaktiv"}`).join("\n") || "Keine Verträge.",
      };
    },
  },

  offen: {
    beschreibung: "Rückstände, gestundete Posten und Ratenzahlungen.",
    schema: { type: "object", properties: {} },
    aus: async () => {
      const b = await ladeBestand(OHNE_BUCHUNGEN);
      return {
        daten: b.verbindlichkeiten,
        text: b.verbindlichkeiten.map((v) => `${v.id}: ${v.glaeubiger} ${euro(v.betragOffen)} – ${v.status}${v.faellig ? `, fällig ${kurzesDatum(v.faellig)}` : ""}${v.planpostenId ? ", eingeplant" : ""}${v.notiz ? ` (${v.notiz})` : ""}`).join("\n") || "Nichts offen.",
      };
    },
  },

  fristen: {
    beschreibung: "Offene Termine, Fristen, Wiedervorlagen, An- und Abreisen.",
    schema: { type: "object", properties: {} },
    aus: async () => {
      const b = await ladeBestand(OHNE_BUCHUNGEN);
      const f = [...b.fristen].sort((x, y) => (x.datum < y.datum ? -1 : 1));
      return { daten: f, text: f.map((x) => `${kurzesDatum(x.datum)} ${x.titel} (${x.art}, ${BEREICHE[x.bereich]})`).join("\n") || "Keine offenen Fristen." };
    },
  },

  toepfe: {
    beschreibung: "Rücklagen und Wünsche mit Ziel und Stand.",
    schema: { type: "object", properties: {} },
    aus: async () => {
      const b = await ladeBestand(OHNE_BUCHUNGEN);
      return { daten: b.toepfe, text: b.toepfe.map((t) => `${t.name}: ${euro(t.stand)} von ${euro(t.ziel)}${t.zieldatum ? ` bis ${kurzesDatum(t.zieldatum)}` : ""}`).join("\n") || "Keine Töpfe." };
    },
  },

  leisten: {
    beschreibung: "Kann Mathias sich eine Ausgabe leisten? Spielt sie durch und nennt notfalls den frühesten Termin.",
    schema: {
      type: "object",
      properties: {
        betrag_euro: { type: "number", description: "Betrag in Euro, z. B. 1800" },
        konto: { type: "string", description: "Konto-id, sonst das erste liquide Konto" },
        datum: { type: "string", description: "JJJJ-MM-TT, Standard heute" },
      },
      required: ["betrag_euro"],
    },
    aus: async (a) => {
      const roh = a.betrag_euro;
      const betrag = typeof roh === "number" ? Math.round(roh * 100) : parseBetrag(String(roh ?? ""));
      if (!betrag) throw new Error("betrag_euro fehlt");
      const h = heute();
      const b = await ladeBestand(OHNE_BUCHUNGEN);
      const kontoId = s(a, "konto") ?? b.konten.find((k) => k.liquide)?.id;
      if (!kontoId) throw new Error("Kein liquides Konto vorhanden");
      const r = kannIchMirLeisten(b, Math.abs(betrag), kontoId, s(a, "datum") ?? h, { von: h });
      const antwort = r.passt
        ? `Ja. Nach ${euro(r.betrag)} am ${kurzesDatum(r.datum)} bleibt der Tiefpunkt bei ${euro(r.tiefpunktNachher.saldo)} (${kurzesDatum(r.tiefpunktNachher.datum)}), Puffer ${euro(r.puffer)}.`
        : `Am ${kurzesDatum(r.datum)} nicht: Tiefpunkt fiele auf ${euro(r.tiefpunktNachher.saldo)} am ${kurzesDatum(r.tiefpunktNachher.datum)} (Puffer ${euro(r.puffer)}). ${r.fruehestens ? `Frühestens am ${kurzesDatum(r.fruehestens)}.` : "Im Prognosezeitraum nicht ohne Unterschreiten des Puffers."}`;
      return { daten: r, text: satz(antwort) };
    },
  },

  erkennen: {
    beschreibung: "Sucht in den Buchungen der letzten 13 Monate regelmäßige Zahlungen, die noch kein Vertrag sind.",
    schema: { type: "object", properties: {} },
    aus: async () => {
      const b = await ladeBestand(new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10));
      const v = findeWiederkehrende(b.buchungen);
      return {
        daten: v,
        text: v.map((x) => `${x.name} (${x.kontoId}): ${euro(x.betrag, true)} ${RHYTHMEN[x.rhythmus]}, ${x.anzahl}× bis ${kurzesDatum(x.letzte)}, nächste etwa ${kurzesDatum(x.naechste)}, Muster ${JSON.stringify(x.muster)}`).join("\n") || "Nichts Neues erkannt.",
      };
    },
  },

  erklaere: {
    beschreibung: `Eine Buchung einordnen: Bereich (${Object.keys(BEREICHE).join(", ")}), Kategorie und ein Satz, was passiert ist.`,
    schreibt: true,
    schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Buchungs-ID" },
        bereich: { type: "string", enum: Object.keys(BEREICHE) },
        kategorie: { type: "string" },
        text: { type: "string", description: "Ein Satz, höchstens 300 Zeichen" },
      },
      required: ["id", "bereich", "text"],
    },
    aus: async (a) => {
      const bereich = s(a, "bereich") as Bereich | undefined;
      if (!s(a, "id") || !bereich || !(bereich in BEREICHE) || !s(a, "text")) throw new Error("id, bereich und text nötig");
      const r = await db().from("buchungen")
        .update({ bereich, kategorie: s(a, "kategorie") ?? null, erklaerung: s(a, "text")!.slice(0, 300), eingeordnet_von: "claude" })
        .eq("id", s(a, "id")!).eq("owner", config.owner()).select("id");
      if (!pruefe(r, "Erklären").length) throw new Error(`Buchung ${s(a, "id")} nicht gefunden`);
      return { daten: { ok: true }, text: "Gespeichert." };
    },
  },

  vorschlag: {
    beschreibung: [
      "Vorschlag zur Freigabe in der App anlegen. Erst nach Mathias' Freigabe wird ausgeführt.",
      "Beträge in Cent (ganze Zahl), Ausgänge negativ bei planposten/vertrag, positiv bei zahlung_vorbereiten. Datum JJJJ-MM-TT.",
      "aktion.typ: planposten {posten:{kontoId,datum,betrag,titel,sicherheit:sicher|wahrscheinlich|offen,bereich}}",
      "| zahlung_vorbereiten {kontoId,empfaenger,iban?,betrag,zweck,datum}",
      "| mail {an,betreff,text}",
      "| frist {frist:{titel,datum,art:frist|termin|wiedervorlage|anreise|abreise,bereich}}",
      "| vertrag {vertrag:{id,name,gegenpartei,kontoId,betrag,rhythmus:woche|14tage|monat|quartal|halbjahr|jahr,naechsteFaelligkeit,ende|null,art,bereich,werktag,muster:[…],aktiv}}",
      "| verbindlichkeit {verbindlichkeit:{id,glaeubiger,betragOffen,status:rueckstand|gestundet|ratenzahlung|geklaert,faellig|null,notiz,planpostenId|null}}",
      "| notiz {text}",
    ].join(" "),
    schreibt: true,
    schema: {
      type: "object",
      properties: {
        titel: { type: "string", description: "Kurz, z. B. „Rückstand X ausgleichen“" },
        text: { type: "string", description: "Begründung aus dem Gesamtbild, 1–2 Sätze" },
        aktion: { type: "object", description: "Was nach Freigabe ausgeführt wird" },
      },
      required: ["titel", "text", "aktion"],
    },
    aus: async (a) => {
      const roh = typeof a.aktion === "string" ? JSON.parse(a.aktion) : a.aktion;
      const p = pruefeAktion(roh);
      if (!p.ok) throw new Error(p.fehler);
      if (!s(a, "titel")) throw new Error("titel fehlt");
      const b = await ladeBestand(OHNE_BUCHUNGEN);
      const kontoName = (id: string) => b.konten.find((k) => k.id === id)?.name ?? id;
      const genutzt = [
        "kontoId" in p.aktion ? p.aktion.kontoId : undefined,
        p.aktion.typ === "planposten" ? p.aktion.posten.kontoId : undefined,
        p.aktion.typ === "vertrag" ? p.aktion.vertrag.kontoId : undefined,
      ];
      for (const id of genutzt) {
        if (id && !b.konten.some((k) => k.id === id)) throw new Error(`Konto „${id}“ gibt es nicht. Vorhanden: ${b.konten.map((k) => k.id).join(", ")}`);
      }
      const r = await db().from("freigaben").insert({
        owner: config.owner(), titel: s(a, "titel")!.slice(0, 200), text: (s(a, "text") ?? "").slice(0, 2000),
        aktion: p.aktion, auftrag_id: process.env.ZENTRALE_AUFTRAG || null,
      }).select("id").single();
      const z = pruefe(r, "Vorschlag");
      return { daten: { id: z.id }, text: `Vorschlag liegt in der App: ${beschreibeAktion(p.aktion, kontoName)}` };
    },
  },
};
