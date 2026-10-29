import { roh } from "./html.ts";

// Linien-Symbole aus den Entwürfen (24er Raster, 1,5 px)
const svg = (inhalt: string, groesse = 20, farbe = "#FFFFFF", breite = 1.5) =>
  roh(`<svg width="${groesse}" height="${groesse}" viewBox="0 0 24 24" fill="none" stroke="${farbe}" stroke-width="${breite}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inhalt}</svg>`);

export const sym = {
  regler: () => svg('<path d="M4 7h10"/><path d="M18 7h2"/><circle cx="16" cy="7" r="2"/><path d="M4 17h2"/><path d="M10 17h10"/><circle cx="8" cy="17" r="2"/>'),
  weiter: () => svg('<path d="M9 6l6 6-6 6"/>', 18, "rgba(255,255,255,0.7)"),
  zurueck: () => svg('<path d="M15 6l-6 6 6 6"/>', 18, "#FFFFFF", 1.6),
  faceid: () => svg('<path d="M7 4H5a1 1 0 0 0-1 1v2"/><path d="M17 4h2a1 1 0 0 1 1 1v2"/><path d="M7 20H5a1 1 0 0 1-1-1v-2"/><path d="M17 20h2a1 1 0 0 0 1-1v-2"/><path d="M9 10v1"/><path d="M15 10v1"/><path d="M12 10v3h-1"/><path d="M9.5 16c1.5 1 3.5 1 5 0"/>', 18, "#14090F", 1.6),
  konten: () => svg('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/>'),
  haus: () => svg('<path d="M4 11l8-6 8 6"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>'),
  stern: () => svg('<path d="M12 4l2.3 4.8 5.2.7-3.8 3.6.9 5.2L12 15.8l-4.6 2.5.9-5.2L4.5 9.5l5.2-.7z"/>'),
  kalender: () => svg('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>'),
  senden: () => svg('<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>', 20, "#14090F", 1.8),
  glocke: () => svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  mac: () => svg('<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>'),
  quellen: () => svg('<path d="M4 6h16M4 12h16M4 18h10"/>'),
  aus: () => svg('<path d="M12 3v8"/><path d="M6.3 7.5a8 8 0 1 0 11.4 0"/>'),
};
