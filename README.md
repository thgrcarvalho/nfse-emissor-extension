# NFS-e Nacional — Preenchimento

Browser extension (Manifest V3) that fills the monthly NFS-e **rascunho** on the
national Emissor Nacional (nfse.gov.br) for **service exporters (ME/EPP, Brasil→EUA,
exportação de serviço isenta de ISS)**. It fills; **you review and click Emitir.**

It runs inside your own logged-in browser, so it sidesteps the portal's bot defenses
(WAF blocks, captcha) that an external automation would hit.

## What it does

- **Side panel** (opens from the toolbar icon) that stays open the whole emission.
- Shows **who's logged in** (razão social + CNPJ) and only works on the Emissor Nacional.
- **Per-client profiles**, keyed by CNPJ — the panel auto-selects the profile matching the
  logged-in client and never fills another client's data.
- **Onboard a client from a previous nota**: open one of their emitted notas (via the
  portal), and the panel reads its data into a profile — **"Usar nesta emissão"**
  (one-off) or **"Salvar como padrão deste cliente"** (persist, keyed by CNPJ). Profiles are
  re-derivable from the portal, so a storage wipe is recoverable.
- **Automatic câmbio**: fetches the BCB PTAX (fechamento) for the chosen competência date.
- Fills the three wizard pages on demand; **stops at the review screen — never emits.**

## Load it (unpacked) — Chrome, Edge, Firefox

Same folder, all three browsers.

1. `node scripts/make-icon.mjs` (generates the icon, once).
2. `cp src/config.example.json src/config.default.json` and fill in your data — the real
   config is gitignored, so client data never enters git. (Optional: profiles can also be
   created entirely from an emitted nota, see step 5.)
3. Load the extension:
   - **Chrome / Edge:** `chrome://extensions` (or `edge://extensions`) → enable **Developer
     mode** → **Load unpacked** → select this folder. The toolbar icon opens the **side panel**.
   - **Firefox (128+):** `about:debugging#/runtime/this-from-firefox` → **Load Temporary
     Add-on** → pick `manifest.json`. Click the toolbar icon to toggle the **sidebar** (same
     UI). Note: Firefox uses `sidebar_action` instead of Chrome's `side_panel`, and the
     MAIN-world fill engine needs Firefox 128+. If the câmbio doesn't auto-fetch or the panel
     says "wrong site", grant the host permissions in `about:addons` → the extension →
     Permissions.
4. Log into the Emissor Nacional and open the panel.
5. **First time for a client:** open one of their emitted notas (via the portal) → the
   panel shows the parsed data → **Salvar como padrão**.
6. **Each emission:** start **Emissão completa**; on each page (Pessoas → Serviço → Valores)
   set/confirm competência + USD (câmbio auto-fills), click **Preencher página atual**, check
   it, **Avançar**. On the review screen, confirm and **Emitir** yourself.

## Architecture

- `src/content.js` — isolated world: detects the page + login identity, parses a nota into a
  profile, resolves the right profile by CNPJ, relays fill requests.
- `src/fill-plan.js` — builds the ordered field operations per page (field ids and cascade
  order reverse-engineered from the portal's wizard).
- `src/field-ops.js` — applies them via the page's jQuery (Chosen/select2 aware).
- `src/page-agent.js` — MAIN-world bridge between content script and the engine.
- `src/rate.js` — BCB PTAX lookup by competência date.
- `src/popup.*` — the side panel (identity, load-from-nota, per-run inputs, fill trigger).
- `src/sw.js` — opens the side panel on the toolbar-icon click.

Validated against the real portal by a private Playwright harness (kept outside this
repo, with the credentials): one script drives the fill engine end-to-end (35 fields),
another injects `content.js` on a real emitted nota and checks the parsed profile.
