import { euro, kurzesDatum, type Punkt } from "@zentrale/core";
import { roh, type Roh } from "./html.ts";

let zaehler = 0;

/** Kontoverlauf als Linie mit Verlauf wie im Entwurf; Tiefpunkt als Korallen-Punkt. */
export function kurve(punkte: Punkt[], o: { hoehe?: number; puffer?: number; beschriftung?: boolean } = {}): Roh {
  if (punkte.length < 2) return roh("");
  const id = `k${++zaehler}`;
  const B = 320;
  const H = o.hoehe ?? 64;
  const oben = 6;
  const unten = o.beschriftung ? 18 : 6;
  const werte = punkte.map((p) => p.saldo);
  let min = Math.min(...werte, o.puffer ?? Infinity);
  let max = Math.max(...werte);
  if (max - min < 1000) { max += 500; min -= 500; }
  const x = (i: number) => (i / (punkte.length - 1)) * B;
  const y = (w: number) => oben + (1 - (w - min) / (max - min)) * (H - oben - unten);
  const linie = punkte.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.saldo).toFixed(1)}`).join(" ");
  const tiefIndex = werte.indexOf(Math.min(...werte));
  const tief = punkte[tiefIndex]!;
  const null0 = min < 0 && max > 0 ? `<line x1="0" x2="${B}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="rgba(255,122,122,0.5)" stroke-width="0.8"/>` : "";
  const puffer = o.puffer !== undefined && o.puffer > min && o.puffer < max
    ? `<line x1="0" x2="${B}" y1="${y(o.puffer).toFixed(1)}" y2="${y(o.puffer).toFixed(1)}" stroke="rgba(255,255,255,0.22)" stroke-width="0.8" stroke-dasharray="3 4"/>` : "";
  // Monatsanfänge als feine Marken
  const marken = o.beschriftung
    ? punkte.map((p, i) => (p.datum.endsWith("-01") ? `<text x="${x(i).toFixed(1)}" y="${H - 4}" font-size="9" fill="rgba(255,255,255,0.45)" text-anchor="middle">${["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"][Number(p.datum.slice(5, 7)) - 1]}</text>` : "")).join("")
    : "";
  const label = `Verlauf bis ${kurzesDatum(punkte[punkte.length - 1]!.datum)}: Tiefpunkt ${euro(tief.saldo)} am ${kurzesDatum(tief.datum)}`;
  return roh(`<svg class="kurve${H > 100 ? " hoch" : ""}" viewBox="0 0 ${B} ${H}" role="img" aria-label="${label}">
<defs><linearGradient id="${id}l" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#8EC5FF"/><stop offset="0.6" stop-color="#C8A2FF"/><stop offset="1" stop-color="#FF9A7A"/></linearGradient>
<linearGradient id="${id}f" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="rgba(200,162,255,0.35)"/><stop offset="1" stop-color="rgba(200,162,255,0)"/></linearGradient></defs>
${null0}${puffer}
<path d="${linie} L${B} ${H - unten} L0 ${H - unten} Z" fill="url(#${id}f)"/>
<path d="${linie}" fill="none" stroke="url(#${id}l)" stroke-width="1.8" stroke-linejoin="round"/>
<circle cx="${x(tiefIndex).toFixed(1)}" cy="${y(tief.saldo).toFixed(1)}" r="3.5" fill="#FF9A7A"/>
${marken}</svg>`);
}
