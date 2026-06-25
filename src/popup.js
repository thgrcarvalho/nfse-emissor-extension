// Cross-browser: `browser` (Firefox, promise-based) or `chrome` (Chromium MV3, also promises).
const ext = globalThis.browser || globalThis.chrome;
// Side panel: shows who's logged in, lets you load a client's data from a previously
// emitted nota (use-once or save-as-default), collects the per-run inputs (competência,
// USD, câmbio with PTAX auto-fetch), and asks the content script to fill the open page.
//
// Profiles are keyed by CNPJ: saved ones in ext.storage.local; a "use once" override
// in ext.storage.session. Per-run inputs also live in storage.session, surviving
// navigation while the panel stays open; all session data clears when the browser closes.
const $ = (id) => document.getElementById(id);
const STORE_KEY = 'nfseRunState';
const PORTAL_LOGIN = 'https://www.nfse.gov.br/EmissorNacional/Login';

let bundledConfig = null; // config.default.json (the seed profile)
let storedProfiles = {}; // ext.storage.local profiles, keyed by CNPJ digits
let sessionProfiles = {}; // "use once" profiles, keyed by CNPJ digits (storage.session)
let lastIdentity = null; // who is logged into the portal right now
let parsedNota = null; // last nota parsed by the content script ({ profile, emitente, chave, missing })
let notaGen = 0; // guards renderNotaView against overlapping refreshes
let viewGen = 0; // guards refreshView against overlapping refreshes (newest wins)
let runCnpj = null; // which client the per-run USD belongs to (persisted in run state)
let runSource = null; // which profile source set it: 'session' | 'saved' | 'bundled' | null
const prevPageByTab = new Map(); // tabId → { pageId, cnpj }, to detect leaving the review screen
const onlyDigits = (s) => String(s || '').replace(/\D/g, '');
const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

// The active profile + where it came from: use-once > saved > bundled, each only on an
// exact CNPJ match (no CNPJ → no profile). Mirrors content.js's resolveProfile.
function activeProfileAndSource(cnpj) {
  if (!cnpj) return { profile: null, source: null };
  if (sessionProfiles[cnpj]) return { profile: sessionProfiles[cnpj], source: 'session' };
  if (storedProfiles[cnpj]) return { profile: storedProfiles[cnpj], source: 'saved' };
  if (bundledConfig && onlyDigits(bundledConfig.cnpj) === cnpj) {
    return { profile: bundledConfig, source: 'bundled' };
  }
  return { profile: null, source: null };
}

async function loadProfiles() {
  try {
    const { profiles } = await ext.storage.local.get('profiles');
    storedProfiles = profiles || {};
  } catch {
    storedProfiles = {};
  }
  try {
    const r = await ext.storage.session.get('sessionProfiles');
    sessionProfiles = r.sessionProfiles || {};
  } catch {
    sessionProfiles = {};
  }
}
// All map writers re-read storage and merge one key (read-merge-write): with the panel
// open in two windows, each holds its own cache, and writing a whole stale map would
// silently drop the other window's saves. A ~ms get→set race window remains between two
// panels writing simultaneously — accepted for human-paced use. The caches are updated
// only after the write succeeds, so a failed save never *looks* saved.
async function saveProfileObj(cnpj, profile) {
  let current = storedProfiles;
  try {
    current = (await ext.storage.local.get('profiles')).profiles || {};
  } catch {}
  current[cnpj] = profile;
  await ext.storage.local.set({ profiles: current });
  storedProfiles = current;
}
async function deleteProfileObj(cnpj) {
  let current = storedProfiles;
  try {
    current = (await ext.storage.local.get('profiles')).profiles || {};
  } catch {}
  delete current[cnpj];
  await ext.storage.local.set({ profiles: current });
  storedProfiles = current;
}
// Session overrides keep working panel-locally even if storage.session is unavailable.
async function setSessionProfile(cnpj, profile) {
  let current = sessionProfiles;
  try {
    current = (await ext.storage.session.get('sessionProfiles')).sessionProfiles || {};
  } catch {}
  current[cnpj] = profile;
  sessionProfiles = current;
  try {
    await ext.storage.session.set({ sessionProfiles: current });
  } catch {}
}
async function clearSessionProfile(cnpj) {
  let current = sessionProfiles;
  try {
    current = (await ext.storage.session.get('sessionProfiles')).sessionProfiles || {};
  } catch {}
  sessionProfiles = current;
  if (!(cnpj in current)) return;
  delete current[cnpj];
  try {
    await ext.storage.session.set({ sessionProfiles: current });
  } catch {}
}

// Default competência for the monthly nota: the LAST DAY OF THE PRIOR MONTH — the
// service is invoiced the month after, so this is the usual competência. `new Date(y, m,
// 0)` is day 0 of the current month = the last day of the month before it (handles the
// January→December year rollover). The user can still override the field or the picker.
function defaultCompetenciaBR() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), 0);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// The <input type="date"> value is ISO (yyyy-mm-dd); everything else here (PTAX fetch,
// fill engine, portal field) uses dd/mm/aaaa. Convert at the boundary.
function brToISO(br) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(br || '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}
function isoToBR(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
const getCompetenciaBR = () => $('competencia').value.trim();
function setCompetencia(br) {
  $('competencia').value = br;
  $('competenciaPicker').value = brToISO(br); // keep the hidden calendar control in sync
}
// Light mask so typed digits render as dd/mm/aaaa regardless of browser locale.
function maskDate(v) {
  const d = String(v).replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('/');
}
// dd/mm/aaaa → Date, or null. Round-trips the parts so rolled-over dates (31/04,
// 99/99) are rejected instead of silently becoming another date.
function parseCompetencia(br) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(br || '').trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

// Parses a pt-BR (or plain) decimal: '1.234,56' / '1234,56' / '5.1687' / '7.000' → number.
// With a comma, dots are thousands separators; without one, dots in a 3-digit-group
// pattern are thousands ('7.000' → 7000), otherwise the dot is the decimal point.
// Tolerates a pasted currency prefix ('R$ 1.234,56').
function num(v) {
  let s = String(v == null ? '' : v)
    .trim()
    .replace(/\s+/g, '')
    .replace(/^(r\$|us\$|\$)/i, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
// Exchange rates never use thousands grouping — without a comma, a dot is always the
// decimal point ('5.168' is 5.168, NOT 5168). Use this for the câmbio field.
function numRate(v) {
  let s = String(v == null ? '' : v)
    .trim()
    .replace(/\s+/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function fmtRate(n) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}
const fmtUsd = (n) =>
  Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function recomputeValor() {
  const brl = num($('usd').value) * numRate($('cambio').value);
  $('valorBRL').textContent = brl
    ? brl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : 'R$ —';
  return brl;
}

function saveState() {
  // The per-run USD belongs to one client (cnpj/source) — competência and câmbio don't.
  ext.storage.session
    .set({
      [STORE_KEY]: {
        competencia: getCompetenciaBR(),
        usd: $('usd').value,
        cambio: $('cambio').value,
        moeda: activeCurrency.numeric,
        cnpj: runCnpj,
        source: runSource,
      },
    })
    .catch(() => {});
}
async function loadState() {
  try {
    const r = await ext.storage.session.get(STORE_KEY);
    return r?.[STORE_KEY] || null;
  } catch {
    return null;
  }
}

// ---- currency (moeda) ---------------------------------------------------------------
// PTAX serves these 10 currencies daily (auto-câmbio). Keyed by the NFS-e moeda field's
// ISO-4217 NUMERIC code; alpha = the PTAX/Olinda symbol; symbol = the display label. A
// moeda code outside this map has no PTAX → manual câmbio.
const PTAX_CURRENCIES = {
  840: { alpha: 'USD', symbol: 'US$' },
  978: { alpha: 'EUR', symbol: '€' },
  826: { alpha: 'GBP', symbol: '£' },
  392: { alpha: 'JPY', symbol: '¥' },
  756: { alpha: 'CHF', symbol: 'CHF' },
  124: { alpha: 'CAD', symbol: 'CA$' },
  36: { alpha: 'AUD', symbol: 'AU$' },
  208: { alpha: 'DKK', symbol: 'DKK' },
  578: { alpha: 'NOK', symbol: 'NOK' },
  752: { alpha: 'SEK', symbol: 'SEK' },
};
const DEFAULT_CURRENCY = { numeric: '840', alpha: 'USD', symbol: 'US$', ptax: true };

function currencyForCode(code) {
  // Normalize leading zeros so the ISO code '036' (AUD) matches the map key 36.
  const norm = String(code || '')
    .trim()
    .replace(/^0+(?=\d)/, '');
  if (!norm) return DEFAULT_CURRENCY;
  const c = Object.prototype.hasOwnProperty.call(PTAX_CURRENCIES, norm) ? PTAX_CURRENCIES[norm] : null;
  return c
    ? { numeric: norm, alpha: c.alpha, symbol: c.symbol, ptax: true }
    : { numeric: norm, alpha: '', symbol: `moeda ${norm}`, ptax: false };
}
const currencyFor = (profile) =>
  currencyForCode(
    profile &&
      profile.servico &&
      profile.servico.comercio_exterior &&
      profile.servico.comercio_exterior.moeda,
  );

let activeCurrency = DEFAULT_CURRENCY;
const setCurrencyLabel = () => {
  $('usdCur').textContent = activeCurrency.symbol;
};
// Adopt a currency for the form's value/câmbio fields. Returns true when it changed.
function applyCurrency(cur) {
  if (cur.numeric === activeCurrency.numeric) return false;
  activeCurrency = cur;
  setCurrencyLabel();
  return true;
}

// ---- PTAX (câmbio) by competência date --------------------------------------------
let rateGen = 0; // discards out-of-date PTAX responses (in-flight fetch vs a newer date)

// The câmbio belongs to the competência it was fetched (or typed) for — when the date
// changes, drop it and any in-flight fetch, so a stale rate can never price the nota.
function invalidateRate() {
  rateGen++;
  $('cambio').value = '';
  $('ptaxInfo').className = 'ptax';
  $('ptaxInfo').textContent = '';
  $('refreshRate').disabled = false;
}

async function refreshRate() {
  clearTimeout(rateTimer); // an explicit/early run cancels a pending debounced duplicate
  const gen = ++rateGen;
  const info = $('ptaxInfo');
  const comp = getCompetenciaBR();
  if (!parseCompetencia(comp)) {
    info.className = comp ? 'ptax bad' : 'ptax';
    info.textContent = comp ? 'Data de competência inválida — use dd/mm/aaaa.' : '';
    return;
  }
  if (!activeCurrency.ptax) {
    // No daily PTAX for this currency — the user types the câmbio (estrangeira→BRL).
    info.className = 'ptax';
    info.textContent = `Sem PTAX para a moeda ${activeCurrency.numeric} no Banco Central — informe o câmbio manualmente.`;
    $('refreshRate').disabled = true;
    return;
  }
  $('refreshRate').disabled = true;
  info.className = 'ptax';
  info.textContent = `Buscando câmbio (PTAX ${activeCurrency.alpha}) no Banco Central…`;
  try {
    const r = await window.fetchPtaxCompra(comp, activeCurrency.alpha);
    if (gen !== rateGen) return; // a newer date/fetch superseded this result
    $('cambio').value = fmtRate(r.rate); // pt-BR display ('5,1687'); num() parses it back
    recomputeValor();
    saveState();
    info.className = 'ptax ok';
    info.textContent = r.exact
      ? `PTAX ${activeCurrency.alpha} de fechamento ${r.cotacaoDateBR}: ${fmtRate(r.rate)}`
      : `Sem fechamento em ${comp}. Usando ${activeCurrency.alpha} ${r.cotacaoDateBR}: ${fmtRate(r.rate)}`;
  } catch (e) {
    if (gen !== rateGen) return;
    info.className = 'ptax bad';
    info.textContent = 'Não consegui buscar o câmbio. Informe manualmente. (' + e.message + ')';
  } finally {
    if (gen === rateGen) $('refreshRate').disabled = false;
  }
}

// ---- views ------------------------------------------------------------------------
function isPortalUrl(url) {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      /(^|\.)nfse\.gov\.br$/i.test(u.hostname) &&
      /^\/EmissorNacional(\/|$)/i.test(u.pathname)
    );
  } catch {
    return false;
  }
}

// Firefox MV3 treats host_permissions as optional and grants nothing on the
// about:debugging install path — without the grant the content scripts never inject
// and tab.url is unreadable. Detect that and offer an in-product request.
const HOST_ORIGINS = ['https://*.nfse.gov.br/*', 'https://olinda.bcb.gov.br/*'];
async function hasHostPermission() {
  try {
    return await ext.permissions.contains({ origins: [HOST_ORIGINS[0]] });
  } catch {
    return true; // API unavailable → assume install-time grant (Chrome/Edge)
  }
}

function showView(name) {
  for (const v of [
    'needPerms',
    'wrongSite',
    'needLogin',
    'noContact',
    'noIdentity',
    'idle',
    'review',
    'noProfile',
    'nota',
    'form',
  ]) {
    $(v).style.display = v === name ? '' : 'none';
  }
}

// The identity bar shows who is logged into the portal right now (whenever logged in).
function setIdentity(identity) {
  lastIdentity = identity || null;
  const el = $('identity');
  if (identity && identity.cnpj) {
    el.innerHTML = `Logado: ${escapeHtml(identity.nome || '')} <span class="cnpj">${escapeHtml(identity.cnpj)}</span>`;
    el.style.display = '';
  } else {
    el.textContent = '';
    el.style.display = 'none';
  }
}

// Shows which profile the fill will use on this page, and where it came from, so the
// user can verify before clicking Preencher. Highlights a "use once" override.
function setProfileInfo(profile, source, withValor = false) {
  const el = $('profileInfo');
  if (!profile) {
    el.className = 'profinfo none';
    el.innerHTML =
      `<div>Padrão: <span class="src">não definido</span></div>` +
      `<div class="k">Abra uma nota deste cliente e escolha “Salvar como padrão”.</div>`;
    el.style.display = '';
    return;
  }
  const srcText =
    {
      session: '⚠ carregado de uma nota — só nesta emissão',
      saved: 'perfil salvo',
      bundled: 'configuração padrão',
    }[source] || '';
  const mun = (profile.servico && profile.servico.municipio && profile.servico.municipio.text) || '';
  const aliq = (profile.tributacao && profile.tributacao.aliquota_sn) || '';
  const tomador =
    (profile.tomador && profile.tomador.nome) ||
    (profile.tomador && profile.tomador.local === 'nao_informado' ? 'não informado' : '');
  // Intermediário (opcional): aparece no resumo só quando o perfil traz um — a
  // conferência antes de emitir precisa enxergar a terceira pessoa da nota.
  const itm = profile.intermediario;
  const intermediario =
    itm && itm.local && itm.local !== 'nao_informado'
      ? itm.nome || (itm.local === 'brasil' ? 'no Brasil' : 'no exterior')
      : '';
  el.className = 'profinfo' + (source === 'session' ? ' temp' : '');
  // A use-once override can be dropped manually (auto-clears at the review screen too).
  const revert =
    source === 'session'
      ? `<button id="clearOverride" type="button" class="revertbtn">↩ Voltar ao perfil padrão</button>`
      : '';
  // On the dashboard show the reference value (USD). On the form it's omitted — the editable
  // Valor (US$) field is right there and the per-run amount can differ from the reference.
  const usd = profile.valor && profile.valor.usd;
  const valorStr = withValor && usd ? ` · Valor: ${currencyFor(profile).symbol} ${fmtUsd(usd)}` : '';
  el.innerHTML =
    `<div>Dados: <strong>${escapeHtml(profile.label || 'Perfil')}</strong> — <span class="src">${escapeHtml(srcText)}</span></div>` +
    `<div class="k">Tomador: ${escapeHtml(tomador)}${intermediario ? ` · Interm.: ${escapeHtml(intermediario)}` : ''} · ${escapeHtml(mun)}${aliq ? ` · Alíquota SN: ${escapeHtml(aliq)}%` : ''}${valorStr}</div>` +
    revert;
  el.style.display = '';
}

// Ask the content script for page + login state. It runs at document_idle, so right
// after a navigation it may not be listening yet — retry with growing delays.
async function askContentState(tabId, retries = [350, 1100]) {
  try {
    return await ext.tabs.sendMessage(tabId, { action: 'detect' });
  } catch {
    if (retries.length) {
      await new Promise((r) => setTimeout(r, retries[0]));
      return askContentState(tabId, retries.slice(1));
    }
    return null;
  }
}

// The portal version everything in this release was reverse-engineered and
// live-validated against (parser sections, wizard field ids, cascades). Shown in the
// panel footer; any live mismatch raises the banner below.
const SUPPORTED_PORTAL_VERSION = '1.6.0.0';

function cmpVersion(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

// state = the content script's detect response (null when the page is unreachable).
// The banner element stays in the DOM (CSS hides it when empty) so aria-live
// announcements work like the other status regions.
function renderPortalBanner(state) {
  const el = $('portalWarn');
  const v = state && state.portalVersion;
  if (!state) {
    el.textContent = '';
  } else if (!v) {
    el.textContent =
      '⚠ Não consegui identificar a versão do portal — o layout pode ter mudado. ' +
      'Se preencher, confira cada campo com atenção redobrada.';
  } else if (cmpVersion(v, SUPPORTED_PORTAL_VERSION) !== 0) {
    const rel = cmpVersion(v, SUPPORTED_PORTAL_VERSION) > 0 ? 'mais nova' : 'mais antiga';
    el.textContent =
      `⚠ O portal está na versão ${v}, ${rel} que a validada por esta extensão ` +
      `(${SUPPORTED_PORTAL_VERSION}). O assistente pode ter mudado — confira cada campo ` +
      'preenchido antes de avançar.';
  } else {
    el.textContent = '';
  }
}

async function refreshView() {
  const gen = ++viewGen; // a newer refresh supersedes this one after any await
  if (!(await hasHostPermission())) {
    if (gen !== viewGen) return;
    $('profileInfo').style.display = 'none';
    $('permsStatus').textContent = '';
    setIdentity(null);
    $('portalWarn').textContent = '';
    showView('needPerms');
    return;
  }
  let tab;
  try {
    [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  } catch {}
  if (gen !== viewGen) return;
  $('profileInfo').style.display = 'none'; // hidden by default; shown only when logged in below
  if (!tab || !isPortalUrl(tab.url)) {
    setIdentity(null);
    $('portalWarn').textContent = '';
    showView('wrongSite');
    return;
  }
  const state = await askContentState(tab.id);
  if (gen !== viewGen) return;
  renderPortalBanner(state); // version mismatch warns on every view, login included
  if (!state) {
    // Content script unreachable (page mid-load, or the extension was reloaded under an
    // open tab) — say so instead of pretending to know the login state.
    setIdentity(null);
    showView('noContact');
    return;
  }
  if (state.loggedIn === false) {
    setIdentity(null);
    prevPageByTab.delete(tab.id); // a login boundary invalidates any pending review-exit
    showView('needLogin');
    return;
  }
  const identity = state.identity;
  const loggedCnpj = onlyDigits(identity && identity.cnpj);
  if (!loggedCnpj) {
    // Logged in but the navbar CNPJ couldn't be read: block everything — no profile may
    // be matched (or filled) without knowing which client this is.
    setIdentity(null);
    showView('noIdentity');
    return;
  }
  setIdentity(identity);
  const pageId = state.pageId;

  // A "use once" override is consumed when the emission moves PAST the review screen
  // (Emitir, or abandoning from review) — not when review is merely shown, so Voltar
  // back into the wizard keeps the data the user explicitly chose for this emission.
  // Tracked per tab and per CNPJ so another tab's render or another client's login can
  // never trigger (or erase) someone else's consumption.
  const stillInWizard =
    pageId === 'pessoas' || pageId === 'servico' || pageId === 'valores' || pageId === 'review';
  const prev = prevPageByTab.get(tab.id);
  if (
    prev &&
    prev.pageId === 'review' &&
    prev.cnpj === loggedCnpj &&
    !stillInWizard &&
    sessionProfiles[loggedCnpj]
  ) {
    await clearSessionProfile(loggedCnpj);
    const after = activeProfileAndSource(loggedCnpj);
    adoptProfileUsd(loggedCnpj, after.profile, after.source); // USD back to the padrão's reference
    if (gen !== viewGen) return; // superseded while persisting — the newer run renders
  }
  prevPageByTab.set(tab.id, { pageId, cnpj: loggedCnpj });

  if (pageId === 'nota') {
    showView('nota');
    await renderNotaView(tab.id);
    return;
  }
  if (pageId === 'review') {
    showView('review');
    return;
  }
  if (pageId === 'pessoas' || pageId === 'servico' || pageId === 'valores') {
    // Fill only when there's a profile for the logged-in client (never another's data).
    const { profile, source } = activeProfileAndSource(loggedCnpj);
    if (!profile) {
      showView('noProfile');
      return;
    }
    setProfileInfo(profile, source);
    const curChanged = applyCurrency(currencyFor(profile));
    if (curChanged) invalidateRate(); // the old rate priced the old currency
    if (runCnpj !== loggedCnpj || runSource !== source) {
      // Different client or different profile than the per-run amount belongs to:
      // adopt this profile's reference value instead of carrying a stale amount.
      adoptProfileUsd(loggedCnpj, profile, source);
    } else if (!$('usd').value.trim() && profile.valor && profile.valor.usd) {
      // Backfill only a truly empty field — never overwrite visible text the parser
      // couldn't read (e.g. a paste with a currency prefix num() rejected).
      $('usd').value = fmtUsd(profile.valor.usd);
      saveState();
    }
    recomputeValor();
    // PTAX currencies auto-fetch; others get the manual-câmbio note. Fetch when the
    // currency just changed or the câmbio is empty; debounced so the several onUpdated
    // events of one navigation coalesce into a single PTAX request.
    if (curChanged || !numRate($('cambio').value)) {
      clearTimeout(rateTimer);
      rateTimer = setTimeout(refreshRate, 250);
    }
    showView('form');
    return;
  }
  // Dashboard / other logged-in page: show which reference (profile) would be used.
  const active = activeProfileAndSource(loggedCnpj);
  setProfileInfo(active.profile, active.source, true);
  renderProfileList(loggedCnpj);
  showView('idle');
}

// The saved-clients manager (dashboard only): every profile in storage.local, with a
// two-step delete so an accountant can drop ex-clients' data (retention/LGPD).
function renderProfileList(loggedCnpj) {
  const box = $('profilesBox');
  const keys = Object.keys(storedProfiles).sort((a, b) =>
    String(storedProfiles[a].label || '').localeCompare(String(storedProfiles[b].label || '')),
  );
  $('profilesList').innerHTML = keys.length
    ? keys
        .map((k) => {
          const p = storedProfiles[k];
          const logged = k === loggedCnpj ? ' <span class="logged">· logado</span>' : '';
          return (
            `<div class="profrow"><span>${escapeHtml(p.label || 'Cliente')} ` +
            `<span class="cnpj">${escapeHtml(p.cnpj || k)}</span>${logged}</span>` +
            `<button type="button" class="delprof" data-cnpj="${escapeHtml(k)}" title="Excluir os dados salvos deste cliente" aria-label="Excluir ${escapeHtml(p.label || 'cliente')}">🗑</button></div>`
          );
        })
        .join('')
    : '<p class="hint">Nenhum cliente salvo ainda.</p>';
  // Export only makes sense with profiles; import works even on an empty browser (restore
  // a backup), so the box stays visible on the dashboard regardless.
  $('exportProfiles').style.display = keys.length ? '' : 'none';
  box.style.display = '';
}

// Profile backup. Export writes all saved profiles to a JSON file — a deliberate user
// action; the file carries client data. Import merges such a file back into storage
// (read-merge-write, keyed by CNPJ digits). An imported profile is still identity-locked:
// it only ever fills a nota whose logged-in CNPJ matches it (resolveFill is unchanged).
function setProfilesMsg(text, bad = false) {
  const el = $('profilesMsg');
  el.textContent = text;
  el.classList.toggle('bad', bad);
}
function exportProfiles() {
  const keys = Object.keys(storedProfiles);
  if (!keys.length) {
    setProfilesMsg('Nenhum perfil para exportar.', true);
    return;
  }
  const payload = { kind: 'nfse-emissor-profiles', version: 1, profiles: storedProfiles };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nfse-perfis-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  setProfilesMsg(`${keys.length} perfil(is) exportado(s).`);
}
async function importProfiles(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    setProfilesMsg('Arquivo inválido — não é um JSON.', true);
    return;
  }
  // Accept the exported envelope { profiles: {...} } or a bare profiles map.
  const incoming =
    data && typeof data === 'object' && data.profiles && typeof data.profiles === 'object'
      ? data.profiles
      : data && typeof data === 'object'
        ? data
        : null;
  if (!incoming) {
    setProfilesMsg('O arquivo não contém perfis.', true);
    return;
  }
  let current = storedProfiles;
  try {
    current = (await ext.storage.local.get('profiles')).profiles || {};
  } catch {}
  let added = 0;
  let replaced = 0;
  for (const p of Object.values(incoming)) {
    if (!p || typeof p !== 'object') continue;
    // Identity-lock: key STRICTLY by the profile's own CNPJ, never the file's map key.
    // resolveProfile returns profiles[loggedCnpj], so a file that filed client B's data
    // under client A's key would otherwise fill the wrong client. Digit-only also drops
    // any __proto__-style key. Skip rows without a usable CNPJ.
    const key = onlyDigits(p.cnpj);
    if (!key) continue;
    if (current[key]) replaced++;
    else added++;
    current[key] = p;
  }
  if (!added && !replaced) {
    setProfilesMsg('Nenhum perfil válido no arquivo.', true);
    return;
  }
  await ext.storage.local.set({ profiles: current });
  storedProfiles = current;
  setProfilesMsg(
    replaced ? `${added} adicionado(s), ${replaced} substituído(s).` : `${added} perfil(is) importado(s).`,
  );
  await refreshView();
}
$('exportProfiles').addEventListener('click', exportProfiles);
$('importProfiles').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = ''; // let the same file be re-imported
  if (file) await importProfiles(file);
});

let delArmTimer = null;
$('profilesList').addEventListener('click', async (e) => {
  const btn = e.target.closest('.delprof');
  if (!btn) return;
  if (btn.dataset.armed !== '1') {
    // First click arms; the second (within 4s) deletes. No confirm() — it is
    // unreliable inside side panels.
    for (const b of document.querySelectorAll('.delprof')) {
      b.dataset.armed = '';
      b.textContent = '🗑';
    }
    btn.dataset.armed = '1';
    btn.textContent = 'excluir?';
    clearTimeout(delArmTimer);
    delArmTimer = setTimeout(() => {
      btn.dataset.armed = '';
      btn.textContent = '🗑';
    }, 4000);
    return;
  }
  clearTimeout(delArmTimer);
  const cnpj = btn.dataset.cnpj;
  await deleteProfileObj(cnpj);
  if (cnpj === runCnpj) {
    // The per-run USD belonged to the deleted profile — follow whatever remains.
    const after = activeProfileAndSource(cnpj);
    adoptProfileUsd(cnpj, after.profile, after.source);
  }
  refreshView(); // re-renders the list and the reference banner
});

// ---- load from a previous nota ----------------------------------------------------
async function renderNotaView(tabId) {
  const gen = ++notaGen;
  const sum = $('notaSummary');
  $('notaNum').textContent = '';
  $('notaStatus').textContent = '';
  $('notaMissing').textContent = '';
  $('useNota').disabled = true;
  $('saveNota').disabled = true;
  sum.textContent = 'Lendo a nota…';
  let res;
  try {
    // Extraction reads everything from the nota — no template needed.
    res = await ext.tabs.sendMessage(tabId, { action: 'parseNota' });
  } catch {
    res = null;
  }
  if (gen !== notaGen) return; // superseded by a newer refresh
  if (!res || !res.ok) {
    parsedNota = null;
    sum.textContent = (res && res.msg) || 'Não consegui ler esta nota.';
    return;
  }
  parsedNota = res;
  const p = res.profile;
  // Chave layout: digits [23,36) carry the nota number (keep in sync with content.js CHAVE).
  const notaNumero = res.chave ? parseInt(res.chave.slice(23, 36), 10) : NaN;
  $('notaNum').textContent = Number.isFinite(notaNumero) ? `(nº ${notaNumero})` : '';
  const cnpj = (res.emitente && res.emitente.cnpj) || p.cnpj || '';
  const descr = (p.servico && p.servico.descricao) || '';
  const row = (k, v) =>
    `<div><span class="k">${escapeHtml(k)}:</span> ${escapeHtml(v == null ? '' : String(v))}</div>`;
  sum.innerHTML =
    row('Cliente', `${p.label || ''}${cnpj ? ' — ' + cnpj : ''}`) +
    row('Município', p.servico && p.servico.municipio ? p.servico.municipio.text : '') +
    row('CTN', p.servico && p.servico.ctn ? p.servico.ctn.value : '') +
    row('Alíquota SN', p.tributacao ? p.tributacao.aliquota_sn : '') +
    row(`Valor padrão (${currencyFor(p).symbol})`, p.valor && p.valor.usd ? fmtUsd(p.valor.usd) : '') +
    row('Descrição', descr.length > 90 ? descr.slice(0, 90) + '…' : descr);
  // Fields the parser couldn't read stay EMPTY (never inherited from another profile) —
  // tell the user before they use or save this as the client's padrão.
  $('notaMissing').textContent =
    res.missing && res.missing.length
      ? `⚠ Não consegui ler da nota: ${res.missing.join(', ')}. Esses campos ficarão vazios — confira antes de usar ou salvar.`
      : '';
  $('useNota').disabled = false;
  $('saveNota').disabled = false;
}

function notaCnpj() {
  if (!parsedNota) return '';
  return onlyDigits((parsedNota.emitente && parsedNota.emitente.cnpj) || parsedNota.profile.cnpj);
}

// Adopting a profile (chosen from a nota, saved, reverted, consumed, or auto-switched on
// a client change) resets the per-run USD to that profile's reference value and records
// who it belongs to — an amount must never carry across profiles or clients. No profile
// (or no reference value) clears the field rather than keeping a stale number.
function adoptProfileUsd(cnpj, profile, source) {
  runCnpj = cnpj || null;
  runSource = source || null;
  const usd = profile && profile.valor && profile.valor.usd;
  $('usd').value = usd ? fmtUsd(usd) : '';
  recomputeValor();
  saveState();
}

$('useNota').addEventListener('click', async () => {
  if (!parsedNota || !parsedNota.profile) return;
  const cnpj = notaCnpj();
  if (!cnpj) {
    $('notaStatus').className = 'hint bad';
    $('notaStatus').textContent = 'CNPJ do emitente não encontrado na nota.';
    return;
  }
  await setSessionProfile(cnpj, parsedNota.profile);
  adoptProfileUsd(cnpj, parsedNota.profile, 'session');
  $('notaStatus').className = 'hint ok';
  $('notaStatus').textContent =
    'Pronto. Inicie a Emissão completa deste cliente e preencha — sem salvar como padrão.';
});

$('saveNota').addEventListener('click', async () => {
  if (!parsedNota || !parsedNota.profile) return;
  const cnpj = notaCnpj();
  if (!cnpj) {
    $('notaStatus').className = 'hint bad';
    $('notaStatus').textContent = 'CNPJ do emitente não encontrado na nota.';
    return;
  }
  try {
    await saveProfileObj(cnpj, parsedNota.profile);
    await clearSessionProfile(cnpj); // saved is now the source of truth, drop any use-once
    adoptProfileUsd(cnpj, parsedNota.profile, 'saved');
    $('notaStatus').className = 'hint ok';
    $('notaStatus').textContent = `Perfil de ${parsedNota.profile.label || cnpj} salvo como padrão.`;
  } catch (e) {
    $('notaStatus').className = 'hint bad';
    $('notaStatus').textContent = 'Erro ao salvar: ' + e.message;
  }
});

// ---- per-run inputs + fill --------------------------------------------------------
let rateTimer = null;

$('competencia').addEventListener('input', () => {
  const masked = maskDate($('competencia').value);
  if (masked !== $('competencia').value) $('competencia').value = masked;
  $('competenciaPicker').value = brToISO(masked);
  invalidateRate(); // the old rate belonged to the old date
  recomputeValor();
  saveState();
  clearTimeout(rateTimer);
  rateTimer = setTimeout(refreshRate, 600);
});
$('competenciaPicker').addEventListener('change', () => {
  const iso = $('competenciaPicker').value;
  if (!iso) return;
  setCompetencia(isoToBR(iso));
  invalidateRate(); // the old rate belonged to the old date
  recomputeValor();
  saveState();
  clearTimeout(rateTimer);
  rateTimer = setTimeout(refreshRate, 300);
});
$('usd').addEventListener('input', () => {
  recomputeValor();
  saveState();
});
$('cambio').addEventListener('input', () => {
  // Manual entry wins: cancel any in-flight/pending PTAX fetch so it can't overwrite
  // what the user typed, and drop the PTAX label — it no longer describes this value.
  rateGen++;
  clearTimeout(rateTimer);
  $('ptaxInfo').className = 'ptax';
  $('ptaxInfo').textContent = '';
  $('refreshRate').disabled = false;
  recomputeValor();
  saveState();
});
$('refreshRate').addEventListener('click', refreshRate);
$('openPortal').addEventListener('click', () => ext.tabs.create({ url: PORTAL_LOGIN }));
$('goLogin').addEventListener('click', () => ext.tabs.update({ url: PORTAL_LOGIN }));
for (const b of document.querySelectorAll('.reloadTab')) {
  b.addEventListener('click', async () => {
    try {
      const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
      if (tab) await ext.tabs.reload(tab.id);
    } catch {}
  });
}
$('grantPerms').addEventListener('click', async () => {
  // permissions.request must run directly on the user gesture — no awaits before it.
  let granted = false;
  try {
    granted = await ext.permissions.request({ origins: HOST_ORIGINS });
  } catch (e) {
    $('permsStatus').textContent = 'Não foi possível pedir a permissão: ' + e.message;
    return;
  }
  if (!granted) {
    $('permsStatus').textContent = 'Permissão não concedida — sem ela a extensão não funciona.';
    return;
  }
  $('permsStatus').textContent = '';
  try {
    // Content scripts only inject on (re)load — refresh every open portal tab.
    const tabs = await ext.tabs.query({ url: 'https://*.nfse.gov.br/EmissorNacional/*' });
    await Promise.all(tabs.map((t) => ext.tabs.reload(t.id).catch(() => {})));
  } catch {}
  refreshView();
});
$('pickDate').addEventListener('click', () => {
  try {
    $('competenciaPicker').showPicker();
  } catch {
    $('competencia').focus(); // never focus the aria-hidden picker input
  }
});
// "usar padrão": drop the use-once override for the logged client, revert to saved/default.
$('profileInfo').addEventListener('click', async (e) => {
  if (!e.target || e.target.id !== 'clearOverride') return;
  const cnpj = onlyDigits(lastIdentity && lastIdentity.cnpj);
  if (!cnpj) return; // fail closed: never touch run state without knowing the client
  await clearSessionProfile(cnpj);
  const after = activeProfileAndSource(cnpj);
  adoptProfileUsd(cnpj, after.profile, after.source); // USD back to the padrão's reference
  refreshView();
});

// Runs inside the page's MAIN world via scripting.executeScript — must be self-contained
// (no closure over panel code). The engine files are injected immediately before.
function runEngine(pageId, cfg, state) {
  try {
    if (!window.__nfseFillPlan || !window.__nfseApply || !window.__nfseShapeGuard) {
      return Promise.resolve({ ok: false, err: 'motor de preenchimento ausente — recarregue a página' });
    }
    // Shape guard: refuse the WHOLE page when it (or the profile) isn't the supported
    // export-of-service variant — never partially fill an unknown wizard shape.
    const problems = window.__nfseShapeGuard(pageId, cfg);
    if (problems.length) {
      return Promise.resolve({
        ok: false,
        err:
          'Página ou perfil fora do escopo suportado (exportação de serviço, Simples Nacional) — nada foi preenchido:\n' +
          problems.map((p) => '• ' + p).join('\n'),
      });
    }
    return window
      .__nfseApply(window.__nfseFillPlan(pageId, cfg, state))
      .then((results) => ({ ok: true, results }))
      .catch((e) => ({ ok: false, err: String((e && e.message) || e) }));
  } catch (e) {
    return Promise.resolve({ ok: false, err: String((e && e.message) || e) });
  }
}

$('fill').addEventListener('click', async () => {
  const valorBRL = recomputeValor();
  saveState();
  const status = $('status');
  if (!parseCompetencia(getCompetenciaBR())) {
    status.className = 'bad';
    status.textContent = 'Data de competência inválida — use dd/mm/aaaa.';
    return;
  }
  if (!num($('usd').value)) {
    status.className = 'bad';
    status.textContent = `Informe o valor (${activeCurrency.symbol}) do serviço.`;
    return;
  }
  const rate = numRate($('cambio').value);
  if (!rate) {
    status.className = 'bad';
    status.textContent = 'Informe o câmbio (PTAX) para calcular o valor.';
    return;
  }
  if (rate > 50) {
    // BRL per 1 unit above ~50 isn't any real currency — almost certainly a missing
    // decimal or format slip. No fixed lower bound: low-value currencies are legit (JPY
    // ~0,03), and a too-small câmbio shows up as a too-small valor in the human review.
    status.className = 'bad';
    status.textContent = `Câmbio fora do esperado (${fmtRate(rate)}) — confira o valor digitado.`;
    return;
  }
  const state = {
    competencia: getCompetenciaBR(),
    usd: num($('usd').value),
    cambio: rate,
    valorBRL: Math.round(valorBRL * 100) / 100,
  };
  $('fill').disabled = true;
  status.className = '';
  status.textContent = 'Preenchendo…';
  try {
    const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
    // Re-read the LIVE identity right before filling: the panel's USD belongs to
    // runCnpj, and the tab may have switched clients since the last render.
    const live = await askContentState(tab.id, []);
    renderPortalBanner(live); // a portal update since the last render must not warn stale
    const liveCnpj = onlyDigits(live && live.identity && live.identity.cnpj);
    if (!liveCnpj || liveCnpj !== runCnpj) {
      status.className = 'bad';
      status.textContent = 'O cliente logado mudou — painel atualizado. Confira o valor e tente de novo.';
      refreshView();
      return;
    }
    const override = sessionProfiles[liveCnpj] || null;
    // 1) content.js (isolated world) resolves WHICH profile may be filled — all the
    //    guards live there, next to the page it inspects.
    const resolved = await ext.tabs.sendMessage(tab.id, {
      action: 'resolveFill',
      profileOverride: override,
      bundled: bundledConfig, // content.js can't fetch it (not web-accessible)
    });
    if (!resolved) throw new Error('sem resposta da página (abra o formulário no portal)');
    if (!resolved.ok) {
      status.className = 'bad';
      status.textContent = resolved.msg || 'Falha ao preencher.';
      return;
    }
    // 2) Inject the engine + profile straight into the MAIN world. The profile never
    //    transits a page-observable channel; the engine exists only during the fill.
    const exec = (async () => {
      await ext.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        files: ['src/fill-plan.js', 'src/field-ops.js', 'src/shape-guard.js'],
      });
      const [r] = await ext.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: runEngine,
        args: [resolved.pageId, resolved.cfg, state],
      });
      return r && r.result;
    })();
    exec.catch(() => {}); // a rejection after the watchdog wins must not go unhandled
    const outcome = await Promise.race([exec, new Promise((r) => setTimeout(() => r('timeout'), 35000))]);
    if (outcome === 'timeout') {
      status.className = 'bad';
      status.textContent = 'O preenchimento não respondeu — recarregue a página e tente de novo.';
      return;
    }
    const res = Object.assign(
      { pageId: resolved.pageId },
      outcome || { ok: false, err: 'sem resultado da injeção' },
    );
    if (!res.ok) {
      status.className = 'bad';
      status.textContent = res.msg || res.err || 'Falha ao preencher.';
    } else {
      const fails = (res.results || []).filter((r) => !r.ok);
      const labels = { pessoas: 'Pessoas', servico: 'Serviço', valores: 'Valores' };
      status.className = fails.length ? 'bad' : 'ok';
      status.textContent = fails.length
        ? `${labels[res.pageId]}: ${fails.length} campo(s) com problema:\n` +
          fails.map((f) => `• ${f.label}: ${f.err || f.got}`).join('\n')
        : `✓ ${labels[res.pageId]} preenchida. Confira e clique em Avançar.`;
    }
  } catch (e) {
    status.className = 'bad';
    status.textContent = 'Erro: ' + e.message;
  } finally {
    $('fill').disabled = false;
  }
});

// React to tab switches / navigations (incl. logging in, opening a nota) so the view
// reflects the active tab live. Events wait for init() so an early refresh can't run
// against unrestored run state (runCnpj/runSource) and clobber the persisted USD.
const ready = init().catch(() => {});
ext.tabs.onActivated.addListener(() => ready.then(refreshView));
ext.tabs.onUpdated.addListener((_id, changeInfo, tab) => {
  // Only the active tab drives the panel — background tabs' loads are irrelevant churn.
  if ((changeInfo.status === 'complete' || changeInfo.url) && tab && tab.active) ready.then(refreshView);
});
ext.tabs.onRemoved.addListener((id) => prevPageByTab.delete(id));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) ready.then(refreshView);
});
// Another panel (other window) changed the profile maps — resync and re-render.
// onChanged also fires for THIS panel's own writes; those already match the local cache
// (writers update it first), so the deep-equal check skips them — otherwise the echo
// re-render would wipe just-set confirmation messages in the nota view.
ext.storage.onChanged.addListener((changes, area) => {
  let touched = false;
  if (area === 'local' && changes.profiles) {
    const nv = changes.profiles.newValue || {};
    if (JSON.stringify(nv) !== JSON.stringify(storedProfiles)) {
      storedProfiles = nv;
      touched = true;
    }
  }
  if (area === 'session' && changes.sessionProfiles) {
    const nv = changes.sessionProfiles.newValue || {};
    if (JSON.stringify(nv) !== JSON.stringify(sessionProfiles)) {
      sessionProfiles = nv;
      touched = true;
    }
  }
  if (touched) ready.then(refreshView);
});
// View state can also go stale when permissions change outside the panel (about:addons).
if (ext.permissions && ext.permissions.onAdded) {
  ext.permissions.onAdded.addListener(() => ready.then(refreshView));
  ext.permissions.onRemoved.addListener(() => ready.then(refreshView));
}

async function init() {
  $('versionLine').textContent = `Validada com o Emissor Nacional v${SUPPORTED_PORTAL_VERSION}`;
  setCompetencia(defaultCompetenciaBR());
  try {
    bundledConfig = await fetch(ext.runtime.getURL('src/config.default.json')).then((r) => r.json());
  } catch {
    bundledConfig = null;
  }
  await loadProfiles();
  const saved = await loadState();
  if (saved) {
    if (saved.competencia) setCompetencia(saved.competencia);
    if (saved.usd) $('usd').value = saved.usd;
    if (saved.cambio) $('cambio').value = saved.cambio;
    runCnpj = saved.cnpj || null;
    runSource = saved.source || null;
    // Restore the currency so the first form-view doesn't read a spurious change and
    // discard a saved câmbio (e.g. a manual rate for a non-PTAX currency).
    if (saved.moeda) {
      activeCurrency = currencyForCode(saved.moeda);
      setCurrencyLabel();
    }
  }
  recomputeValor();
  // The form-view branch fetches/notes the câmbio for the active currency; nothing to
  // fetch when the panel isn't on a wizard page.
  await refreshView();
}
