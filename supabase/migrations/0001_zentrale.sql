-- Zentrale: Datenmodell
-- Beträge in Cent (bigint), Datumsangaben als date.
-- Ein Nutzer: Jede Zeile gehört über `owner` genau einem Konto in Supabase Auth.
-- Die Engine schreibt mit dem service_role-Schlüssel (umgeht RLS) und setzt `owner` selbst.

create extension if not exists pgcrypto;

create type bereich as enum ('privat', 'byfroehlich', 'gbr', 'vermietung', 'familie', 'trading', 'sonstiges');

-- Konten ---------------------------------------------------------------------
create table konten (
  id text primary key,
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  bank text not null,
  art text not null check (art in ('giro', 'geschaeft', 'karte', 'paypal', 'depot', 'kredit')),
  bereich bereich not null default 'privat',
  waehrung text not null default 'EUR',
  saldo bigint not null default 0,
  saldo_datum date not null default current_date,
  puffer bigint not null default 0,
  liquide boolean not null default true,
  quelle text not null default 'manuell' check (quelle in ('fints', 'api', 'aggregator', 'csv', 'browser', 'manuell')),
  sortierung int not null default 0,
  aktualisiert timestamptz not null default now()
);

-- Buchungen ------------------------------------------------------------------
create table buchungen (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  konto_id text not null references konten on delete cascade,
  datum date not null,
  betrag bigint not null,
  gegenpartei text not null default '',
  zweck text not null default '',
  bereich bereich,
  kategorie text,
  erklaerung text,
  vertrag_id text,
  fingerabdruck text not null,
  quelle text not null default 'csv',
  -- wer eingeordnet hat: vertrag, regel, claude, mathias
  eingeordnet_von text,
  erstellt timestamptz not null default now(),
  unique (konto_id, fingerabdruck)
);
create index buchungen_datum on buchungen (owner, datum desc);
create index buchungen_offen on buchungen (owner) where erklaerung is null;

-- Wiederkehrende Zahlungen (Verträge, Raten, feste Einnahmen) ---------------
create table vertraege (
  id text primary key,
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  gegenpartei text not null default '',
  konto_id text not null references konten on delete cascade,
  betrag bigint not null,
  rhythmus text not null check (rhythmus in ('woche', '14tage', 'monat', 'quartal', 'halbjahr', 'jahr')),
  naechste_faelligkeit date not null,
  ende date,
  art text not null default 'sonstiges',
  bereich bereich not null default 'privat',
  werktag boolean not null default true,
  muster text[] not null default '{}',
  aktiv boolean not null default true,
  notiz text not null default ''
);

alter table buchungen add constraint buchungen_vertrag foreign key (vertrag_id) references vertraege on delete set null;

-- Einmalige erwartete Ein- und Ausgänge --------------------------------------
create table planposten (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  konto_id text not null references konten on delete cascade,
  datum date not null,
  betrag bigint not null,
  titel text not null,
  sicherheit text not null default 'sicher' check (sicherheit in ('sicher', 'wahrscheinlich', 'offen')),
  status text not null default 'geplant' check (status in ('geplant', 'erledigt', 'verworfen')),
  bereich bereich not null default 'privat',
  buchung_id uuid references buchungen on delete set null,
  -- Abrufer (z. B. Smoobu) pflegen ihre Posten über einen festen Schlüssel
  schluessel text,
  erstellt timestamptz not null default now(),
  unique (owner, schluessel)
);

-- Rückstände, Stundungen, Ratenzahlungen ---------------------------------------
create table verbindlichkeiten (
  id text primary key,
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  glaeubiger text not null,
  betrag_offen bigint not null,
  status text not null check (status in ('rueckstand', 'gestundet', 'ratenzahlung', 'geklaert')),
  faellig date,
  notiz text not null default '',
  planposten_id uuid references planposten on delete set null
);

-- Fristen, Termine, Wiedervorlagen, An-/Abreisen -------------------------------
create table fristen (
  id text primary key,
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  titel text not null,
  datum date not null,
  art text not null default 'frist' check (art in ('frist', 'termin', 'wiedervorlage', 'anreise', 'abreise')),
  bereich bereich not null default 'privat',
  erledigt boolean not null default false,
  quelle text not null default 'manuell'
);
create index fristen_datum on fristen (owner, datum) where not erledigt;

-- Freigaben: Claude schlägt vor, Mathias entscheidet ---------------------------
create table freigaben (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  titel text not null,
  text text not null default '',
  -- Genau das wird ausgeführt. Die App zeigt es vollständig an.
  aktion jsonb not null,
  status text not null default 'offen' check (status in ('offen', 'freigegeben', 'abgelehnt', 'spaeter', 'ausgefuehrt', 'fehler')),
  auftrag_id uuid,
  erstellt timestamptz not null default now(),
  entschieden timestamptz,
  ergebnis text
);
create index freigaben_offen on freigaben (owner, erstellt) where status in ('offen', 'spaeter', 'freigegeben');

-- Aufträge an Claude ------------------------------------------------------------
create table auftraege (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  prompt text not null check (length(prompt) between 1 and 4000),
  status text not null default 'neu' check (status in ('neu', 'laeuft', 'fertig', 'fehler')),
  schritte jsonb not null default '[]',
  antwort text,
  -- Claude-Sitzung, damit „Ändern“ im selben Gespräch weitermacht
  sitzung text,
  bezug uuid references auftraege on delete set null,
  -- von der Engine selbst angestoßen (z. B. Morgenrunde)
  intern boolean not null default false,
  erstellt timestamptz not null default now(),
  fertig timestamptz
);
alter table freigaben add constraint freigaben_auftrag foreign key (auftrag_id) references auftraege on delete set null;

-- Rücklagen und Wünsche --------------------------------------------------------
create table toepfe (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  ziel bigint not null,
  stand bigint not null default 0,
  zieldatum date,
  prioritaet int not null default 0,
  notiz text not null default ''
);

-- Feste Einordnungsregeln --------------------------------------------------------
create table regeln (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  muster text[] not null,
  richtung text not null default 'beide' check (richtung in ('ein', 'aus', 'beide')),
  bereich bereich not null,
  kategorie text not null,
  erklaerung text not null,
  prioritaet int not null default 0
);

-- Web Push --------------------------------------------------------------------------
create table push_abos (
  endpoint text primary key,
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  p256dh text not null,
  auth text not null,
  geraet text not null default '',
  erstellt timestamptz not null default now()
);

create table meldungen (
  schluessel text not null,
  owner uuid not null references auth.users on delete cascade,
  gesendet timestamptz not null default now(),
  primary key (owner, schluessel)
);

-- Status der Abrufer (Bank, Smoobu, Mail …), sichtbar in der App -----------------------
create table abrufe (
  quelle text not null,
  owner uuid not null references auth.users on delete cascade,
  letzter_versuch timestamptz,
  letzter_erfolg timestamptz,
  meldung text not null default '',
  primary key (owner, quelle)
);

-- Zugriffsschutz ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['konten','buchungen','vertraege','planposten','verbindlichkeiten','fristen','freigaben','auftraege','toepfe','regeln','push_abos','meldungen','abrufe'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy lesen on %I for select to authenticated using (owner = auth.uid())', t);
  end loop;
end $$;

-- Was die App selbst schreiben darf. Alles andere schreibt nur die Engine.
create policy anlegen on auftraege for insert to authenticated with check (owner = auth.uid() and status = 'neu' and not intern);
create policy anlegen on planposten for insert to authenticated with check (owner = auth.uid());
create policy aendern on planposten for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy alles on toepfe for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy alles on push_abos for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

-- Freigaben entscheidet die App nur über diese Funktion: nur Status, nie die Aktion.
create function entscheide_freigabe(freigabe_id uuid, entscheidung text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if entscheidung not in ('freigegeben', 'abgelehnt', 'spaeter') then
    raise exception 'Unbekannte Entscheidung %', entscheidung;
  end if;
  update freigaben set status = entscheidung, entschieden = now()
   where id = freigabe_id and owner = auth.uid() and status in ('offen', 'spaeter');
  if not found then raise exception 'Freigabe nicht offen'; end if;
end $$;
revoke all on function entscheide_freigabe(uuid, text) from public;
grant execute on function entscheide_freigabe(uuid, text) to authenticated;

create function frist_erledigt(frist_id text, erledigt boolean)
returns void language sql security definer set search_path = public as $$
  update fristen set erledigt = frist_erledigt.erledigt where id = frist_id and owner = auth.uid();
$$;
revoke all on function frist_erledigt(text, boolean) from public;
grant execute on function frist_erledigt(text, boolean) to authenticated;

-- Live-Updates in der App
alter publication supabase_realtime add table konten, buchungen, freigaben, auftraege, planposten, fristen;
