# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Red de Vida" — a vanilla JS PWA for tracking colaborador (staff/volunteer) attendance: check-in/check-out per event, late-arrival calculation, and justified/unjustified absences. No build step, no framework, no package.json — plain HTML/CSS/JS served as static files.

Live deployment: GitHub Pages at https://profeaxellpaz.github.io/red-de-vida/ (served from `main` branch root). Repo: https://github.com/profeaxellpaz/red-de-vida.

## Running locally

No build/install step. Serve the folder over HTTP (file:// will not work correctly for the Supabase client/PWA features):

```bash
npx serve .
# or
python -m http.server 8000
```

There is no test suite, linter, or build command in this repo.

## Architecture

**Data layer is cloud-only (Supabase), not offline.** The app used to store data locally in IndexedDB (`js/db.js`, now unused/superseded but still present in the repo) but was migrated to a shared Supabase Postgres backend so multiple devices can see the same data. `js/cloud.js` now defines the `DB` object with the *same method names* the old IndexedDB layer had (`all`, `get`, `put`, `del`, `byIndex`, `byRange`, `clear`, `getConfig`, `setConfig`, `exportAll`, `importAll`) so `js/app.js` did not need to change its calling conventions — if you touch the data layer, preserve that interface.

**Auth model: one shared password, not per-user accounts.** There's a single Supabase Auth user (email in `js/config.js` as `ACCESO_EMAIL`); everyone who knows the shared access password (`reddevida2026`) signs in as that same user. `Auth` in `js/cloud.js` wraps `signInWithPassword`/`signOut`/`getSession`. Access control to data is enforced by Postgres Row Level Security policies (`supabase/migrations/0001_init.sql`) that allow `all` operations to the `authenticated` role — i.e. security boundary is "logged in or not", not per-row ownership.

**Supabase client quirks that are intentional, not accidental:**
- `js/vendor/supabase.js` is a *locally vendored* copy of the supabase-js UMD bundle (not loaded from a CDN) because Edge's Tracking Prevention was blocking `cdn.jsdelivr.net` and silently breaking login.
- The client in `js/cloud.js` is configured with a no-op `lock` function — this bypasses the browser Web Locks API, which was causing indefinite hangs ("Entrando..." never resolving) under some browser privacy settings.
- `storageSeguro()` falls back to an in-memory storage shim if `localStorage` throws (also an Edge tracking-prevention issue).
- Field names are translated between the app's camelCase (`horaEntrada`, `eventoId`, etc.) and Postgres snake_case columns via the `MAP`/`toDB`/`fromDB` helpers in `js/cloud.js`. When adding a new field to `eventos` or `registros`, add it to `MAP` if the app-side name differs from the column name.

**No service worker / no offline caching, by design.** `service-worker.js` is a deliberate "kill switch": it deletes all caches, unregisters itself, and force-reloads any open clients. This replaced an earlier real caching service worker that was causing users to get stuck running stale JS after deploys. Since the app now requires internet (data lives in Supabase), there is no plan to bring back a caching SW — do not reintroduce one without addressing why it was removed.

**Scheduling is per-event, not per-colaborador.** Each row in `eventos` carries its own `hora_entrada`/`hora_salida`/`tolerancia` (e.g. "Escuela de Formación" 7–9pm vs "Celebración General" Sunday 9:50–11:45am). Attendance is recorded in `registros`, one row per `(evento_id, colaborador_id)` pair (unique constraint), with `entrada`, `salida`, `minutos_tarde`, `tarde`, and `ausente`/`justificada`/`motivo` for absences. Late-arrival math (`calcTardia` in `js/app.js`) compares the marked entrada time against the event's own `hora_entrada` + `tolerancia`.

**`js/app.js` structure** (single IIFE, no modules/bundler):
- `Cfg` — loads/saves app-wide config (company name, default tolerance) via `DB.getConfig`/`setConfig`.
- `Vistas` — one render function per tab (`inicio`, `eventos`, `colaboradores`, `reportes`, `ajustes`); `render(vista)` swaps `#vista`'s innerHTML.
- `renderPasarLista(eventoId)` — the per-event check-in screen (not a top-level tab); reached by drilling into an event. `marcarEntrada`/`marcarSalida`/`editarRegistro` mutate `registros` from here.
- `formEvento(id)` / `formColaborador(id)` — modal-based create/edit forms for the two main entities.
- Reports pipeline: `rangoSemana`/`rangoMes`/`rangoCuatri` (quick date ranges) → `reunirReporte()` (pulls rows from Supabase for the range) → one of `aggColaborador`/`aggTotales`/`aggEvento` (or full-detail) → `construirInforme(data, tipo)` builds `{titulo, html, texto, periodo, empresa}` → rendered via `pintarReporte()`, exported via `copiarWhatsapp()` (clipboard, with a textarea-modal fallback), `generarPDF()` (opens a new window with print-styled HTML and calls `print()`), or `exportarCSV()`.
- `mostrarLogin`/`arrancarApp`/`init` — startup flow: checks `Auth.session()` (wrapped in try/catch — a stale/invalid refresh token must not block the login screen from showing), then either boots straight into `arrancarApp()` or shows `#login`. Login itself wraps `Auth.login(pass)` in a 15-second `Promise.race` timeout so a hung Supabase call always surfaces a visible error instead of leaving the button stuck on "Entrando...".

## Editing checklist for common changes

- **New column on `eventos`/`registros`**: update `supabase/migrations/0001_init.sql` (and apply the SQL to the live Supabase project manually — migrations here are not auto-applied), add a `MAP` entry in `js/cloud.js` if the app-side field name differs, then wire it into the relevant form/render functions in `js/app.js`.
- **Anything touching login/session**: keep the 15s timeout and the no-op `lock` in `js/cloud.js` — both were direct fixes for real hangs, not speculative hardening.
- **Bumping a visible "versión N" string in `index.html`** has been used as a manual cache-busting signal during past debugging sessions (to confirm a deploy actually reached the browser) — not required for every change, but useful when diagnosing "stale code" reports from users.
