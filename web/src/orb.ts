// Claude-Orb: halten = sprechen, tippen = schreiben.
import { gehe, hinweis, type Zustand } from "./app.ts";
import { html } from "./html.ts";

export function orbLeiste() {
  return html`
<div class="orb-leiste">
  <button type="button" class="glas orb-knopf" id="orb" aria-label="Claude beauftragen: halten zum Sprechen, tippen zum Schreiben">
    <span class="orb" aria-hidden="true"></span>
    <span id="orb-text">Halten zum Sprechen</span>
  </button>
</div>`;
}

type Erkennung = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
};

function erkennung(): Erkennung | null {
  const W = window as unknown as { SpeechRecognition?: new () => Erkennung; webkitSpeechRecognition?: new () => Erkennung };
  const K = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  return K ? new K() : null;
}

/** Bindet den Orb der aktuellen Seite. */
export function orbBinden(wurzel: HTMLElement, z: Zustand): (() => void) | void {
  const knopf = wurzel.querySelector<HTMLButtonElement>("#orb");
  if (!knopf) return;
  const kugel = knopf.querySelector<HTMLElement>(".orb")!;
  const text = knopf.querySelector<HTMLElement>("#orb-text")!;
  let haltZeit: ReturnType<typeof setTimeout> | undefined;
  let hoert = false;
  let erkannt = "";
  let e: Erkennung | null = null;

  const beenden = () => {
    hoert = false;
    kugel.classList.remove("hoert");
    text.textContent = "Halten zum Sprechen";
  };

  const runter = (ev: PointerEvent) => {
    ev.preventDefault();
    knopf.setPointerCapture(ev.pointerId);
    haltZeit = setTimeout(() => {
      e = erkennung();
      if (!e) {
        // Kein Sprachdienst in dieser Umgebung: Diktat der iOS-Tastatur nutzen
        hinweis("Sprache geht hier über das Mikrofon der Tastatur.");
        gehe("#/claude");
        return;
      }
      hoert = true;
      erkannt = "";
      kugel.classList.add("hoert");
      text.textContent = "Ich höre zu …";
      e.lang = "de-DE";
      e.interimResults = true;
      e.continuous = true;
      e.onresult = (r) => {
        erkannt = Array.from(r.results).map((x) => x[0]!.transcript).join(" ").trim();
        text.textContent = erkannt || "Ich höre zu …";
      };
      e.onerror = (f) => { if (f.error !== "aborted") hinweis("Ich konnte nichts verstehen."); beenden(); };
      try { e.start(); } catch { beenden(); }
    }, 280);
  };

  const hoch = async () => {
    clearTimeout(haltZeit);
    if (!hoert) {
      // kurz getippt
      if (!e) gehe("#/claude");
      return;
    }
    const aktiv = e!;
    aktiv.onend = async () => {
      const satz = erkannt;
      beenden();
      if (!satz) return;
      try {
        const id = await z.quelle.auftragSenden(satz);
        gehe(`#/claude/${id}`);
      } catch (f) {
        hinweis(f instanceof Error ? f.message : "Auftrag ging nicht raus");
      }
    };
    aktiv.stop();
    e = null;
  };

  knopf.addEventListener("pointerdown", runter);
  knopf.addEventListener("pointerup", hoch);
  knopf.addEventListener("pointercancel", () => { clearTimeout(haltZeit); e?.stop(); beenden(); });
  knopf.addEventListener("contextmenu", (x) => x.preventDefault());
  knopf.addEventListener("keydown", (x) => { if (x.key === "Enter" || x.key === " ") { x.preventDefault(); gehe("#/claude"); } });
  return () => { clearTimeout(haltZeit); e?.stop(); };
}
