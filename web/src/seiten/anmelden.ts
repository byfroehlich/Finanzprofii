import { gehe, hinweis, type Seite } from "../app.ts";
import { html } from "../html.ts";

let email = "";
let codeGesendet = false;

export const anmelden: Seite = {
  rendern() {
    return html`
<div class="seite" style="min-height:100dvh;justify-content:center">
  <div style="display:flex;flex-direction:column;align-items:center;gap:18px;margin-bottom:12px">
    <span class="orb" style="width:84px;height:84px;border-radius:42px" aria-hidden="true"></span>
    <h1 style="font-size:34px;font-weight:300;letter-spacing:-.02em">Zentrale</h1>
  </div>
  <form class="glas karte" data-form="anmelden">
    ${codeGesendet
      ? html`
    <span class="karten-text">Der Code ist unterwegs an ${email}.</span>
    <label class="etikett" for="code">Code aus der Mail</label>
    <input id="code" name="code" class="feld" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" maxlength="10" required autofocus />
    <button type="submit" class="knopf-haupt">Anmelden</button>
    <button type="button" class="hinweis" data-tun="zurueck">Andere Adresse</button>`
      : html`
    <label class="etikett" for="email">E-Mail</label>
    <input id="email" name="email" class="feld" type="email" autocomplete="email" value="${email}" required />
    <button type="submit" class="knopf-haupt">Code senden</button>`}
  </form>
  <p class="hinweis">Nur für Mathias. Neue Konten lassen sich hier nicht anlegen.</p>
</div>`;
  },
  tun: {
    zurueck: (_el, z) => { codeGesendet = false; z.neuZeichnen(); },
  },
  danach(w, z) {
    w.querySelector<HTMLFormElement>("form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target as HTMLFormElement);
      const knopf = (e.target as HTMLFormElement).querySelector<HTMLButtonElement>("button[type=submit]")!;
      knopf.disabled = true;
      try {
        if (!codeGesendet) {
          email = String(f.get("email")).trim();
          await z.quelle.codeSenden(email);
          codeGesendet = true;
          z.neuZeichnen();
        } else {
          await z.quelle.codePruefen(email, String(f.get("code")).trim());
          codeGesendet = false;
          await z.neuLaden();
          gehe("#/");
        }
      } catch (err) {
        knopf.disabled = false;
        hinweis(err instanceof Error ? err.message : "Hat nicht geklappt");
      }
    });
  },
};
