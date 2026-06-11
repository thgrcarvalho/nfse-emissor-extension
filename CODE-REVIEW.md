# Code Review — 2026-06-11

Full review of the extension; every finding adversarially verified against the code.
55 findings confirmed, 5 refuted. Deduplicated and grouped below, with a phased fix
plan at the end. References are `file:line` at the time of review.

## High severity

### H1. Stale per-run USD survives profile switches and consecutive emissions — `src/popup.js:283`
The profile's reference USD is applied only when the field is empty, but the per-run USD
persists in `storage.session` across navigations **and clients**. After emitting client A,
opening client B's wizard keeps A's amount (`num($('usd').value)` is truthy, so B's reference
is never applied). Same flaw after the review screen consumes a use-once override: the
override's USD stays in the field while the profile reverts to the padrão.
**Fix:** store the CNPJ (and profile source) inside `nfseRunState`; when entering the form
view, if the logged CNPJ or active profile differs from the recorded one, overwrite the USD
field with the active profile's reference value (`applyProfileUsd`), then update the record.

### H2. Use-once override consumed by merely *viewing* the review screen — `src/popup.js:271`
`refreshView` destructively clears the override every time it renders `pageId === 'review'`.
If the user reaches review, spots a mistake, and clicks **Voltar** (the whole point of a
review screen), the override is gone: Preencher silently fills the saved/bundled profile's
data over the use-once data they explicitly chose.
**Fix:** consume the override on a terminal event instead — when the emitted nota
(review → Visualizar/dashboard transition) is detected — or stash it as "pending" at review
and restore it if the user navigates back into pessoas/servico/valores. Pair the consumption
with the H1 USD reset.

### H3. Fail-open profile resolution when the logged CNPJ can't be read — `src/content.js:186`, `src/content.js:199`, `src/popup.js:37`
All three live resolvers treat an empty CNPJ as a wildcard: `(!cnpj || onlyDigits(...) === cnpj)`.
If `readIdentity()` ever fails (portal navbar markup drift) while `isLoggedIn()` still passes,
the **bundled client's profile is filled into an unidentified client's wizard** — defeating
the core "never another client's data" guarantee. (`profileFor` in popup.js requires an exact
match, but it's dead code.)
**Fix:** drop every `!cnpj ||` wildcard; require an exact CNPJ match for the bundled config.
When identity can't be parsed on a wizard page, show an explicit "não consegui identificar o
CNPJ logado" view with filling disabled.

### H4. deepMerge backfills the template client's data into other clients' profiles — `src/content.js:127`, `:170`
`buildProfileFromNota` merges parsed values over a clone of `config.default.json`, and
`deepMerge` skips `''`/`undefined`. Any field the parser misses — renamed label, foreign
address without bairro, `usdToNum` returning undefined — silently inherits the template
client's values (tomador nome, bairro, reference USD, ctn/nbs). The
contaminated profile is then saved as that client's padrão with no parse-failure signal.
Related members of the same family:
- `profile.cnpj = emitente.cnpj || template.cnpj` (`content.js:173`) can key client B's data
  under the template CNPJ — a future wrong-client fill (medium).
- `pais_codigo` / `pais_resultado` are never parsed; template `'US'` is applied to every
  client (medium — acceptable while scope is Brasil→EUA only, but silent).
- `loadBundled().catch(() => ({}))` (`content.js:169`) silently builds an incomplete profile
  that later throws `TypeError` at `cfg.page1.regime_sn` during fill (low, latent).

**Fix:** merge only an explicit **allowlist of scenario constants** (`page1`,
`comercio_exterior` codes, `valor_tributos_tipo`, país fields while US-only). Client-specific
fields (nome, endereço, usd, descricao, ctn/nbs, municipio) come from the parse only; list
which fields came back empty in the nota summary so the user sees gaps before saving. Never
fall back to `template.cnpj` — fail `parseNota` loudly instead. Fail loudly when the template
itself can't load.

### H5. Real client PII shipped in `src/config.default.json` (staged, packaged, web-accessible)
Real CNPJ, the US client's name and full street address, and the default invoice amount are
in a git-staged file, and `manifest.json:36` exposes it via `web_accessible_resources` to any
script on `*.nfse.gov.br` (plus extension fingerprinting). Publishing the repo or
distributing the package leaks it.
**Fix:** commit a sanitized `config.example.json`; gitignore the real one (the code already
tolerates a missing bundled config). Remove the WAR entry by passing the template to
content.js inside the `parseNota` request (popup already loads it), instead of content.js
fetching `runtime.getURL`.

## Medium severity

- **M1. Fill validates only câmbio** — `popup.js:436`. Empty/half-typed competência is written
  into `#DataCompetencia` with a green "✓ preenchida"; USD is not validated either, so a blank
  USD fills R$ 0,00. Fix: validate `dd/mm/aaaa` (real-date round-trip: reject `31/04`) and
  `usd > 0` before filling, sharing one validator with `refreshRate`.
- **M2. Invalid dates roll over in rate.js** — `rate.js:28`. `new Date(2026, 3, 31)` → 01/05;
  PTAX fetched for a different date. Covered by the M1 validator.
- **M3. PTAX race: no in-flight guard** — `popup.js:144`. The walk-back loop can take seconds;
  an older fetch can resolve last and overwrite câmbio for the wrong competência. Fix:
  generation token checked at resolve time (+ AbortController).
- **M4. PTAX failure leaves the previous date's rate** — `popup.js:153`. Stale rate passes the
  fill gate. Fix: clear or stale-tag câmbio on competência change/fetch failure.
- **M5. `type=number` vs pt-BR comma** — `popup.html:97-101`. Placeholder teaches `5,1687`;
  in dot-locale Chrome that's badInput → `''` → blocked (or silently `51687`). `num()`'s comma
  replace is dead code for number inputs. Fix: `type="text" inputmode="decimal"` + explicit
  pt-BR parse, like the competência field.
- **M6. município from chave = município *gerador*, not local da prestação** — `content.js:149`.
  Also `first('Município')` reads a duplicated label. Wrong for clients whose prestação differs
  from the company seat. Fix: scope `notaLabelMap` per section/fieldset and parse the Local da
  Prestação section; use the chave prefix only as a cross-check.
- **M7. Fixed 900 ms sleeps for AJAX cascades** — `fill-plan.js:41`. On a slow portal the late
  cascade response rebuilds the select and silently wipes the injected value *after* "✓".
  Fix: bounded poll until the dependent select is populated/value survives, explicit failure.
- **M8. Whole-map storage writes clobber profiles (multi-window)** — `popup.js:57`. Two side
  panels = two stale caches; last save wins, silently deleting the other's profile. Fix:
  read-merge-write inside the setters + `storage.onChanged` to resync and re-render.
- **M9. Firefox: no host-permission grant flow** — `manifest.json:7`. Temporary add-ons get no
  host grant; the panel shows misleading wrongSite/idle views. Fix: on init,
  `permissions.contains(...)`; if missing, dedicated view with a `permissions.request()` button.
- **M10. `*://` match patterns include plaintext http** — `manifest.json:7`, `popup.js:162`.
  Fix: `https://`-only patterns + `u.protocol === 'https:'` in `isPortalUrl`.
- **M11. Unreachable content script renders "Você está logado" idle view** — `popup.js:255`.
  `state === null` skips the `loggedIn === false` branch and falls through to idle (with the
  H3 wildcard profile). Fix: distinct "não consegui ler a página — recarregue a aba" view.
- **M12. Identity anchor is page-controlled DOM** — `content.js:38` (+ forgeable postMessage
  bridge both directions, `page-agent.js:7`, `content.js:213`). A compromised portal page could
  steer profile selection and read the cfg posted to MAIN world. Defense-in-depth: consider
  `chrome.scripting.executeScript({world:'MAIN', func, args})` so the profile never transits a
  page-observable channel; send only the fields the page needs.

## Low severity (grouped)

- **Robustness:** fill round-trip has no timeout — panel can stick at "Preenchendo…" if the
  MAIN-world bridge is absent (`content.js:211`); `new Promise(async …)` executor; empty
  `catch {}` in `resolveProfile` downgrades to bundled silently (`content.js:184`);
  `refreshView` has no generation guard and `tabs.onUpdated` fires for every tab
  (`popup.js:479`); listeners active before `init()` finishes; `notaGen` not invalidated on
  navigation away; sw.js has no Chrome fallback if `setPanelBehavior` rejects (`sw.js:8`);
  PTAX `cotacaoCompra` used without finite/positive validation (`rate.js:37`).
- **Parsing:** `parseExterior` head unbounded without "Bairro" segment; commas in logradouro
  shift numero/complemento (`content.js:89`); injected select options carry truncated text
  (code prefix stripped, `field-ops.js:29`).
- **Privacy/UX:** multi-client PII accumulates in `storage.local` with no list/delete UI
  (LGPD retention); field failures shown as raw CSS selectors (`field-ops.js:86`); panel a11y
  (no `<title>`, no `aria-live` on status regions, focus() on an aria-hidden input); Firefox
  temporary add-on vanishes on restart (distribution: needs AMO signing eventually).
- **Hygiene:** `profileFor` is dead code with a false "mirrors content.js" comment
  (`popup.js:26`); resolution logic exists 3× and already diverged; `onlyDigits`/money/pad
  helpers duplicated across worlds; magic chave offsets `slice(0,7)` / `slice(23,36)` unnamed
  (and `num14` actually extracts 13 digits); detectPage selectors duplicated from fill-plan;
  no ESLint/Prettier/package.json; README list starts at "5." and references a `FLOW.md` that
  is not in the repo.
- **Git:** the index holds an **older popup-only snapshot** (staged manifest has no
  `background` key; staged popup.html has no rate.js). `rate.js`/`sw.js` are untracked.
  Run `git add -A` before the first commit or the commit won't match what's on disk.

## Refuted during verification (for the record)

- *usdToNum mis-parses pt-BR amounts*: premise wrong — Visualizar renders the raw decimal
  ("1234.56" form), validated against a real nota.
- *fillCurrentPage can hang forever / async-executor swallows errors* (as **medium**): every
  realistic trigger self-heals (port closes on navigation; page-agent always replies);
  retained only as the low-severity timeout hardening above.
- *splitCodeText poisons coded fields*: requires the portal to render labels without the
  "código - " prefix, contradicted by live validation.
- *First commit would ship a broken extension*: the stale index is self-consistent (an older
  working version); the real issue is just the `git add -A` note above.

## Fix plan

**Phase 1 — money/profile state correctness — ✅ DONE 2026-06-11:**
1. ✅ H1: `nfseRunState` carries cnpj+source; `adoptProfileUsd` resets the USD on any
   client/profile change (form entry, useNota, saveNota, revert, consumption).
2. ✅ H2: override consumed on the review → exit transition (per-tab, per-CNPJ
   `prevPageByTab`), so Voltar keeps it; consumption also resets the USD. Login boundary
   invalidates the marker. Known limit: the transition is only observed while the panel
   is open (in-memory map) — if the panel was closed during Emitir, the override survives
   (amber banner still shows it; revert button available).
3. ✅ H3: all `!cnpj ||` wildcards removed (popup + content, override check included);
   fill blocked with explicit message when the CNPJ is unreadable; new `noIdentity` and
   `noContact` panel views with a reload button (covers M11); dead `profileFor` deleted.
4. ✅ H4: explicit profile construction — client fields parsed-only, template contributes
   only scenario constants; `moeda` normalized via `leadCode`; throws on missing emitente
   CNPJ or template-load failure; `missing` report (incl. address parts) shown in the
   panel. `deepMerge`/`clone` deleted. Live-validated (real content.js injected on the
   portal: all coded fields + constants match, missing list empty).
   ⚠ Profiles saved BEFORE this fix may carry template-backfilled values — re-save each
   client's padrão from a nota once.
   Also pulled forward: USD > 0 fill gate (part of M1), live identity re-check before
   fill, `refreshView` generation guard + init/listener ordering (part of the Phase 4
   race items), askContentState retry ×2.

**Phase 2 — input validation & PTAX — ✅ DONE 2026-06-11:**
5. ✅ M1/M2: `parseCompetencia` (shape + Date round-trip, rejects 31/04) gates both
   `refreshRate` and the fill click; `usd > 0` gate landed with Phase 1. rate.js also
   rejects rolled-over dates. Live-tested against the BCB API (business day, weekend
   walk-back, invalid dates throw).
6. ✅ M3/M4: `rateGen` token discards superseded PTAX responses; `invalidateRate()`
   clears the câmbio on any competência change (typed or picker) so a stale rate can
   never price the nota; BCB payload sanity (finite, > 0). 22 unit assertions on
   `num`/`parseCompetencia` extracted from the real popup.js.
7. ✅ M5: usd/câmbio are `inputmode="decimal"` text inputs with explicit pt-BR parsing
   (comma decimal, dot-thousands heuristic); PTAX autofill and profile USD render
   pt-BR (`fmtRate`/`fmtUsd`), parse back losslessly.

**Phase 3 — before distributing to the accountant / publishing the repo:**
8. H5: `config.example.json` committed, real config gitignored; drop the WAR entry by passing
   the template through the `parseNota` message.
9. M10: https-only patterns; M9: Firefox permission-grant view; M8: read-merge-write storage
   + `onChanged`.
10. Profile management UI (list + delete saved clients — LGPD retention).
11. Fill round-trip timeout with a friendly error; human-readable labels on fill ops.

**Phase 4 — opportunistic hardening & hygiene:**
12. M6 (scoped label map / local da prestação), M7 (cascade polling), M12 (executeScript
    bridge), refreshView generation guard + onUpdated filter, sw.js Chrome fallback.
13. Delete `profileFor`; single resolution function; shared util helpers; named chave
    offsets; ESLint + Prettier; README fixes; a11y pass.
14. First commit: `git add -A` (stale index), then commit in logical chunks.
