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

**Phase 3 — before distributing to the accountant / publishing the repo — ✅ DONE 2026-06-11:**
8. ✅ H5: `config.example.json` committed + real config gitignored (done at publication);
   `web_accessible_resources` REMOVED — the template now travels inside the
   `parseNota`/`fillPage` messages (content.js no longer fetches anything).
9. ✅ M10: https-only host_permissions/content_scripts + protocol check in `isPortalUrl`.
   ✅ M9: `needPerms` view + `permissions.request` grant button (Firefox MV3 treats
   manifest host_permissions as requestable — web-verified); reloads all portal tabs
   after the grant; `permissions.onAdded/onRemoved` resync the view.
   ✅ M8: read-merge-write on all four map writers (cache updated only after a
   successful write), `storage.onChanged` resync with a deep-equal guard against
   self-echo (which would wipe just-set confirmation messages). Residual ms-window
   between two panels' get→set accepted for human-paced use.
10. ✅ Saved-clients manager in the dashboard view: sorted list, "logado" marker,
    two-step delete (no `confirm()` — unreliable in panels); deleting the logged
    client's profile re-adopts the surviving profile's USD.
11. ✅ 30s fill round-trip timeout + async body wrapped so any throw resolves an error
    (panel can never hang on "Preenchendo…"); every fill op carries a pt-BR `label`
    shown in failure reports. v0.2.0.
    Deferred (low): per-origin diagnostic when only the BCB grant is revoked (CORS makes
    it moot today); armed delete button disarms on background tab events.

**Phase 4 — opportunistic hardening & hygiene — ✅ DONE 2026-06-12:**
12. ✅ M6: section-scoped nota parser (panels probed live: Emitente/Tomador/Serviço
    Prestado/Importação-Exportação/Tributação Municipal/Federal/Total dos tributos);
    no cross-section fallback — a moved label lands in the missing report. The
    município code still comes from the chave (gerador); accepted while prestação ==
    seat (the tool's scenario). País: template 'US' + a warning when the nota's
    displayed country isn't the US.
    ✅ M7: cascade polling (early-exit on dependent-ready + value-held), single
    re-apply on wipe, and a final coherence pass that downgrades any op whose value a
    late rebuild erased. Live-validated: 35/35 fields on the real wizard.
    ✅ M12: fill now goes popup → content (resolveFill guards, extension channel) →
    `scripting.executeScript` world:MAIN (engine files + profile injected on demand).
    `web_accessible_resources`-free, page-agent.js deleted, no page-observable bridge.
    ✅ refreshView gen guard (Phase 1), onUpdated active-tab filter, sw.js
    `sidePanel.open` click fallback.
13. ✅ `profileFor` deleted (Phase 1); named CHAVE offsets; ESLint (flat) + Prettier
    with full one-time format; README fixes (Phases 2-3); a11y pass (title, aria-live
    status regions, aria-labels on icon buttons, focus fix).
14. ✅ First push done 2026-06-11 (six commits by functionality; PII scrubbed +
    history rebuilt before going public).

**Post-review hardening — 2026-06-11:**
15. ✅ Per-browser store packaging (`npm run build` → clean Chrome/Edge + Firefox
    manifests and zips; sanitized config staged, real one barred; injected-engine-file
    existence guard), PRIVACY.md, AMO `data_collection_permissions`, `homepage_url`.
16. ✅ Fill-time shape guard (`src/shape-guard.js`, injected with the engine): refuses
    the whole page when its signature controls or the profile aren't the supported
    export-of-service/Simples shape — no partial fill of unknown wizard variants.
    Engine now also fails any op whose profile value is null/undefined instead of
    writing the literal "undefined". Live-validated: 35/35 fields with guard active.
17. ✅ CI (lint, format check, build, AMO lint, artifact upload) + README badge; real
    icon (SVG source + rendered 128/300 PNGs), placeholder generator removed.

**Phase A — wizard-variant coverage — 2026-06-12:**
18. ✅ Variant architecture: profile discriminants (`tomador.local`,
    `tomador.nif.informado`, `tributacao.valor_tributos_tipo`) with a
    `normalizeProfile` migration in content.js `resolveFill` (old profiles gain
    `local:'exterior'` + `nif:{informado:'0'}` — no storage rewrite, no user action);
    shape guard restructured into common + per-discriminant variants, refusing
    unknown discriminant values loudly. New supported variants, each mapped from
    Produção Restrita probe dumps and validated there end-to-end (0 failed ops AND
    server acceptance of every Avançar): tomador não informado; tomador Brasil
    (CPF/CNPJ with cadastro-lookup settle — the portal auto-fills nome/endereço;
    `#Tomador_InformarEndereco` is never touched); NIF informado (exterior only —
    the portal clears the NIF group when the tomador moves to Brasil,
    probe-verified); telefone/e-mail; tributos tipos 1/2/3. Parser infers the
    tomador variant and the tributos tipo from the Visualizar sections (required[]
    follows the variant; an unrecognizable "Total dos tributos" parses as tipo ''
    and is refused at fill time). Engine: masked fields (telefone, CPF/CNPJ do
    tomador) compare digits-only — the portal's input mask reformats what is set
    (caught on staging). Validation: `validate-variants.mjs` (7 variants + 3
    guard-refusal DOM tests) on Produção Restrita; 35/35 production-shape regression
    with guard active; load-from-nota regression on a real emitted nota — all green.
    Portal rule learned: the tomador CPF/CNPJ may not equal the emitente's on the
    same NFS-e.
19. ✅ Hardening from the Phase A adversarial review (multi-agent, every finding
    independently re-verified): ISS-devido profiles are now refused at GUARD level
    on the Serviço and Valores pages (new `motivo_nao_tributacao` dimension —
    only imunidade/exportação/não-incidência pass; previously the chosen op failed
    only after the exportação radio had flipped: a partial fill);
    `#ComercioExterior_TipoMoeda` added to the Serviço signature (present up-front
    in every probed/staged render); guard variant lookup is
    Object.prototype-safe (a corrupted discriminant like "constructor" refuses
    cleanly instead of throwing); engine gained `settleMin` (unconditional settle
    for cascades with no DOM-observable signal — the Brasil cadastro lookup's 600 ms
    was being skipped by the waitAfter early-exit poll); parser fail-loud
    restorations: a Tomador-ish section under an unrecognized heading parses as
    variant '' (refused + warned) instead of silently 'não informado'; an
    unrecognized NIF-ish row warns; tipo 1-vs-2 inference requires explicit
    valor/percentual wording (ambiguous → '', refused); a nota with no "Total dos
    tributos" section warns before re-onboarding as tipo 3; ISS-devido notas warn at
    parse time (motivo outside 2/3/4); `normalizeProfile` defaults a NIF that
    carries a valor to informado='1'. Re-validated after the changes: full 7-variant
    staging suite + 35/35 regression + load-from-nota — all green.

**Phase A verification round — staging emission round-trip — 2026-06-12:**
20. ✅ Closed the parse-side loop the adversarial review flagged: every supported
    variant was EMITTED for real on Produção Restrita (Emitir = `#btnProsseguir`;
    no captcha on staging) and the emitted nota parsed back by the real content.js
    (`roundtrip-variants.mjs`, skill dir). Round-trips green: exterior+contato,
    NIF informado (label "NIF" confirmed), não informado (section truly absent),
    Brasil ("CPF/CNPJ" + "Nome/Razão Social" + contato confirmed; masked values
    digits-compared). Label fix: the nota says "Email", not "E-mail" (parser accepts
    both). Portal rules learned and encoded as guard refusals: motivo 2 (imunidade)
    needs `TipoImunidade` (never filled) and motivo 4 (não incidência) is
    CTN-dependent — the wizard pops a blocking modal and reverts the select — so
    only motivo 3 (exportação) passes the guard; tipo 3 ("não informar" o total dos
    tributos) is accepted as draft but REFUSED at emission for ME/EPP — removed from
    the supported variants. By-design parser refusal: the emitted nota renders tipos
    1 e 2 as identical bare "Federal/Estadual/Municipal" rows (unmarked values) —
    indistinguishable, so onboarding-from-nota parses tipo '' (refused + warned);
    tipo 1/2 profiles are config-built only (fill side remains staging-validated).
    Transient staging note: the RFB tomador lookup intermittently fails ("Não foi
    possível recuperar informações do contribuinte") — the portal rejects page 1
    then; retry works. A second adversarial review over this round (17 confirmed
    findings, all fixed) added: fill-plan now fails closed itself for unsupported
    motivo/tipo (defense-in-depth under the guard); the tipo-'' onboarding warning
    distinguishes "indistinguishable per-ente rows" from "unrecognized section";
    guard-refusal unit tests cover every empirically-refused discriminant (motivo
    1/2/4, tipo 3/''); harness hardening (PII-masked output, --parse-latest
    validation + honest skip reporting, dirty-wizard isolation, post-failure draft
    cleanup, WAF-status checks on Avançar).

**Phase B — intermediário variant — 2026-06-14:**
21. ✅ Intermediário (terceira pessoa opcional da página 1) — espelha a arquitetura de
    variantes do tomador. Discriminantes `intermediario.local`
    (nao_informado/brasil/exterior) e `intermediario.nif.informado`; `normalizeProfile`
    default-a `nao_informado` (migração sem reescrever perfis — todo perfil anterior
    reproduz o comportamento de hoje, sem intermediário). Guarda: duas dimensões novas em
    `pessoas` (domicílio + NIF só-exterior), recusando discriminante desconhecido e campo
    faltando, Object.prototype-safe como as do tomador. Fill-plan: ops após o
    tomador/contato — Brasil consulta o cadastro (settleMin 600, sem tocar
    `InformarEndereco`) e exterior preenche o grupo NIF + o endereço estrangeiro; o
    early-return do tomador "não informado" foi removido para o intermediário ainda
    entrar. Parser: infere a variante da seção `/intermedi/i` do Visualizar (ausente →
    nao_informado), com requisitos e avisos por variante (país fora dos EUA e rótulo de
    NIF não reconhecido entram no relatório de campos faltando, como no tomador).
    Validação em Produção Restrita: `validate-variants` 9/9 (3 novas + regressão das 6 da
    Fase A, com aceite do servidor em cada Avançar — o portal ACEITA tomador exterior +
    intermediário exterior/Brasil/NIF na mesma nota); round-trip (emissão + releitura
    pelo parser) verde nas 3 variantes do intermediário — exterior, NIF e Brasil. O
    Brasil passou na 3ª tentativa, após o cadastro RFB voltar (as 2 primeiras falharam
    com o mesmo erro transitório do item 20, "Não foi possível recuperar informações do
    contribuinte"); a nota releu local=brasil, CPF/CNPJ, o nome auto-preenchido pelo
    cadastro ("BANCO DO BRASIL SA"), telefone e e-mail — todos conferem. Limite portal a
    confirmar: o CPF/CNPJ do intermediário provavelmente não pode ser igual ao do
    emitente (como já vale para o tomador).
22. ✅ Revisão adversarial (workflow multiagente, cada achado verificado de forma
    independente — 6 achados, 1 refutado, 5 corrigidos): (a) [regressão] o early-return
    removido deixava um tomador "não informado" com telefone/e-mail avulsos escrever em
    `#Tomador_Telefone/Email` ocultos — o contato do tomador passou a ser barrado para
    "não informado"; (b) o intermediário no exterior herdava o país 'US' do template sem
    o aviso de divergência que o tomador tem — espelhado; (c) o NIF do intermediário não
    tinha o aviso de rótulo-fora-do-padrão do tomador — espelhado. Núcleo fail-closed
    re-verificado (poluição de prototype barrada nas dimensões novas, cfg faltando recusa
    a página inteira antes de preencher, espelhos `normalizeProfile` content.js/lib.mjs
    idênticos, ops com valor ausente falham fechado em vez de escrever "undefined"). 1
    refutado: suposta lacuna de cabeçalho de seção — o tomador tem o mesmo comportamento,
    e o match `/intermedi/i` é mais robusto que um rótulo exato ainda não confirmado.

**v0.3 extras — 2026-06-14:**
23. ✅ Competência padrão = **último dia do mês anterior** (a competência usual da nota
    mensal — `defaultCompetenciaBR`, só no init, sobrescrevível pelo campo/seletor).
    Exportar/importar perfis (backup JSON): exportar baixa todos os perfis salvos (ação
    deliberada — o arquivo carrega dados de cliente, avisado na UI); importar faz
    read-merge-write em `storage.local`. A caixa de clientes salvos passou a ficar sempre
    visível no painel, para o import funcionar num navegador novo. Revisão adversarial
    (1 achado HIGH corrigido): o import agora chaveia ESTRITAMENTE pelo `cnpj` do próprio
    perfil, nunca pela chave do arquivo — um arquivo adulterado poderia arquivar os dados
    do cliente B sob a chave do cliente A e, como `resolveProfile` retorna
    `profiles[cnpjLogado]`, preencher o cliente errado (violação da trava de identidade);
    defesa em profundidade: `resolveProfile` passou a exigir `onlyDigits(profile.cnpj) ===
    chave` antes de retornar. Lint/format/build verdes + sanidade offline; **verificado
    em NAVEGADOR REAL** via Playwright carregando a extensão MV3 (harness do skill
    `test-extension-ui.mjs`): competência padrão (31/05 em 14/06), exportar (baixa o JSON
    com os perfis), importar válido (adiciona pelo CNPJ) e importar adulterado — a trava
    de identidade arquiva sob o `cnpj` do perfil (99…), nunca a chave do arquivo (111…) —
    9/9 verdes.

**v0.3 multi-moeda — 2026-06-14:**
24. ✅ Multi-moeda no câmbio: `rate.js` parametriza a moeda (era USD fixo; valida o símbolo
    `/^[A-Z]{3}$/` antes da URL OData). O painel descobre a moeda do perfil
    (`comercio_exterior.moeda`, código ISO numérico) e busca a PTAX da moeda certa. A PTAX
    serve 10 moedas (USD/EUR/GBP/JPY/CHF/CAD/AUD/DKK/NOK/SEK — confirmado na API `Moedas` do
    BCB); as demais caem em câmbio manual (nota "Sem PTAX"). Os rótulos do valor/banner/lista
    seguem a moeda; a moeda fica no run state para o câmbio salvo sobreviver ao reload. O
    preenchimento já era agnóstico (usa o código `moeda` do perfil + o valor estrangeiro).
    Revisão adversarial (3 dims, cada achado verificado): **1 HIGH corrigido** — a faixa de
    sanidade do câmbio era `[0.5, 50]` (formato USD) e BLOQUEAVA o JPY (~0,034 BRL/iene, uma
    das 10 moedas PTAX); virou só `> 50` (sem piso fixo: moedas de baixo valor são legítimas,
    e um câmbio pequeno demais aparece como valor pequeno na revisão humana obrigatória).
    2 LOW: o refetch da PTAX na navegação rápida foi debounced (coalesce os onUpdated); um
    perfil sem `moeda` mantém o seed USD mas é malformado e já falha no fill (TipoMoeda vazio).
    Validado: `rate.js` busca EUR ao vivo + rejeita símbolo inválido; teste no **NAVEGADOR
    REAL** (extensão MV3 carregada, `test-extension-ui.mjs`) 18/18 — rótulos, EUR auto, MXN
    manual, JPY passa a faixa e câmbio 60 é barrado.

**Teste final pré-lançamento — 2026-06-14:**
25. Revisão adversarial de TODO o caminho de preenchimento (5 dimensões — parser, fill-plan,
    engine, painel, consistência entre arquivos; 15 agentes, cada achado verificado contra o
    código-fonte) + teste AO VIVO completo na Produção Restrita. **Preenchimento: 9/9 variantes
    OK** (cada página com 0 ops falhas e ACEITA pelo servidor — exterior-contato/nif-sim
    16·17·5, nao-informado 4·17·5, brasil 8·17·5, tipo-1/2 16·17·7, intermediário 26/24/18·17·5)
    + **10/10 recusas da guarda** (imunidade, não-incidência, ISS devido, tipo 3, discriminantes
    desconhecidos, NIF sem valor). **Round-trip emitir+reparse: 8/9** — todos os discriminantes
    e valores voltam da nota emitida, lidos pelo content.js real. A 9ª (intermediario-brasil)
    falhou no Avançar com "Não foi possível recuperar informações do contribuinte" — confirmado
    como **indisponibilidade do RFB no portal**, não bug: a MESMA variante preencheu 18/18 no
    validate minutos antes, e o controle tomador-brasil (mesmo CNPJ do BB) resolveu "BANCO DO
    BRASIL SA" às 22:43 e passou a falhar idêntico às 22:49 — o portal voltou a recusar a
    consulta ao cadastro; a extensão preenche o CNPJ certo e SUPERFICIA a recusa do portal
    (fail-closed correto). **2 bugs reais corrigidos (ambos fail-open de baixa severidade):**
    (a) `field-ops.applyOp` só falhava fechado em null/undefined — um STRING vazio em op
    `money`/`chosen`/`select2` (campo monetário/de seleção nunca é legitimamente vazio, ao
    contrário de texto opcional como telefone/complemento) era escrito em branco e reportado
    `ok` ('' === ''): preenchimento parcial silencioso (atingia tributos por ente dos tipos 1/2
    montados à mão e o `pais_resultado`); agora `money`/`chosen`/`select2` recusam vazio (e
    `money` exige dígito). (b) `servico.pais_resultado` (op `chosen` sempre aplicada, vinda do
    template) não constava do aviso de onboarding — entrou no `required[]`. Regressão: 3
    variantes independentes do RFB revalidadas AO VIVO com o engine corrigido (mesmas contagens
    de ops) + tabela-verdade da guarda (money ''/'  '/'abc' → recusa, '50,00'/'0,00' → passa;
    chosen/select2 '' → recusa, 'US'/'840'/'0' → passa; text '' → passa). Lint/format/build
    verdes.

**Accepted/known limits (documented, not planned):** ~ms read-merge-write race between
two panels; override consumption needs the panel open at the review-exit; engine
globals are page-tamperable (inherent to MAIN-world filling); abandoned post-timeout
injection could overlap a re-fill on a stuck page; chave-gerador município code when
prestação ≠ company seat; the shape guard asserts the *presence* of supported-shape
controls and profile fields, not the *absence* of extra ones (a richer-but-compatible
page variant still fills — portal validation and the human review cover it); tipo 1/2
profiles cannot be onboarded from an emitted nota (the Visualizar renders both
identically — by portal design, refused with an explicit warning); ISS devido,
imunidade, não incidência, retenções, obra e evento remain out of scope (page 3 of the
ISS-devido variant is server-rendered and unmapped — see the wizard map for Phase B).
