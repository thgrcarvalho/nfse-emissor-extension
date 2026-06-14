// Cross-browser: `browser` (Firefox, promise-based) or `chrome` (Chromium MV3, also promises).
const ext = globalThis.browser || globalThis.chrome;
// Isolated world. Detects the current portal page, reads the logged-in identity, parses
// a previously emitted nota (Visualizar page) into a client profile, and resolves which
// profile a fill may use (the panel injects the engine itself via scripting.executeScript).
//
// Profiles are keyed by the prestador CNPJ. The fill uses, in order: a session "use once"
// override passed by the panel, a saved profile (storage.local), or the bundled config —
// each only on an exact match with the logged-in CNPJ. If the logged-in CNPJ can't be
// read, filling is blocked entirely: never another client's data, never a guess.

function detectPage() {
  if (document.querySelector('#DataCompetencia') && document.querySelector('#Tomador_Nome')) return 'pessoas';
  if (document.querySelector('#ServicoPrestado_Descricao')) return 'servico';
  if (document.querySelector('#Valores_ValorServico')) return 'valores';
  if (/\/Notas\/Visualizar\//i.test(location.pathname)) return 'nota';
  if (location.href.includes('/EmitirNFSe')) return 'review';
  return null;
}

// Logged-out signals: the login form (CPF/CNPJ + senha) or the /Login page. Logged-in
// signal: the portal shows "Meus dados" or a logout link. Default to not-logged-in so
// the panel prompts login rather than showing a form that can't work.
function isLoggedIn() {
  if (/\/EmissorNacional\/Login/i.test(location.pathname)) return false;
  if (document.querySelector('#Login, #Senha, input[name="Login"], input[name="Senha"]')) return false;
  const txt = document.body ? document.body.innerText : '';
  if (/meus dados/i.test(txt)) return true;
  if (document.querySelector('a[href*="Logout" i], a[href*="Sair" i]')) return true;
  return false;
}

// The portal prints its own release ("Versão 1.6.0.0") on every page, login included.
// The panel compares it with the version this extension was validated against and
// warns on any difference. → "1.6.0.0" | null when the indicator can't be found.
function readPortalVersion() {
  const txt = document.body ? document.body.innerText : '';
  // Last match wins: the release indicator is the page footer, and user-typed text
  // higher up (a nota's own description can say "versão 2.3") must not shadow it.
  // 3+ segments required so a bare "versão 2" never qualifies.
  let v = null;
  for (const m of txt.matchAll(/Vers[ãa]o\s+(\d+(?:\.\d+){2,})/gi)) v = m[1];
  return v;
}

// Reads the logged-in identity from the navbar profile dropdown (present on every
// logged-in page): razão social + CNPJ. → { nome, cnpj } | null.
function readIdentity() {
  const header = document.querySelector('li.dropdown.perfil .dropdown-header');
  if (!header) return null;
  const cnpjEl = header.querySelector('span.cnpj');
  const cnpj = cnpjEl ? cnpjEl.textContent.trim() : null;
  const nome = (header.textContent || '').replace(/\s+/g, ' ').split(/CNPJ:/i)[0].trim();
  return cnpj ? { nome, cnpj } : null;
}

const onlyDigits = (s) => String(s || '').replace(/\D/g, '');
// The bundled config template is NOT fetched here: the panel sends it along with each
// parseNota/resolveFill message, so the file never needs to be web-accessible to the page.

// ---- previous-nota parsing --------------------------------------------------------
// The Visualizar page renders every field as a .form-group (label + .form-control-static,
// coded fields show "código - descrição") inside Bootstrap panels titled "Emitente",
// "Tomador", "Serviço Prestado", etc. Build a section → label → [values] map so
// duplicate labels across sections (Endereço, Razão Social, Versão…) stay unambiguous.
function notaSectionMap() {
  const map = {};
  document.querySelectorAll('.form-group').forEach((g) => {
    const l = g.querySelector('label.control-label span');
    const v = g.querySelector('.form-control-static');
    if (!l || !v) return;
    const k = (l.textContent || '').replace(/\s+/g, ' ').trim();
    if (!k) return;
    const val = (v.textContent || '').replace(/\s+/g, ' ').trim();
    // Container/heading selectors probed against the live page (2026-06).
    const panel = g.closest('.panel, .card, .box, .conteudo');
    const heading = panel && panel.querySelector('.panel-heading, .card-header, h1, h2, h3, h4');
    const sec = heading ? (heading.textContent || '').replace(/\s+/g, ' ').trim() : '';
    const bySec = (map[sec] = map[sec] || {});
    (bySec[k] = bySec[k] || []).push(val);
  });
  return map;
}
// Section titles as the portal renders them (probed live, 2026-06). A missing section
// or label parses as '' and lands in the missing-fields report — fail loud, never grab
// a same-named field from another section.
const SEC = {
  emitente: 'Emitente',
  tomador: 'Tomador',
  tribMunicipal: 'Tributação Municipal',
  servico: 'Serviço Prestado',
  comercioExterior: 'Importação/Exportação de Serviço Prestado',
  tribFederal: 'Tributação Federal',
  totalTributos: 'Total dos tributos',
};

// "140201 - Assistência técnica." → { value: "140201", text: "Assistência técnica." }
function splitCodeText(v) {
  const m = String(v || '').match(/^\s*(\S+)\s*-\s*(.*)$/);
  if (m) return { value: m[1].trim(), text: m[2].trim() };
  const lead = String(v || '').match(/^\s*(\S+)/);
  return { value: lead ? lead[1] : '', text: '' };
}
const leadCode = (v) => splitCodeText(v).value;
// The nota displays the CTN dot-stripped ("140201"); the fill/select2 value is dotted
// ("14.02.01"). Re-group pure-digit codes into 2-char groups joined by ".".
const formatCTN = (v) => (/^\d+$/.test(v) && v.length % 2 === 0 ? v.match(/\d{2}/g).join('.') : v);

// Flattened exterior address → discrete fields. Format the portal renders:
// "{logradouro} , {numero}[ , {compl}] , Bairro {bairro} , Endereço Postal {cep} , {cidade} , {estado}, País {pais}"
function parseExterior(s) {
  s = String(s || '').trim();
  const out = {
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    cep: '',
    estado: '',
    pais_nome: '', // display name only ('Estados Unidos da América') — NOT the ISO code
  };
  const iBairro = s.indexOf('Bairro ');
  const iCep = s.search(/Endereço Postal\s/);
  const iPais = s.search(/País\s/);
  if (iPais >= 0) out.pais_nome = s.slice(iPais + 'País '.length).trim();
  const head = (iBairro >= 0 ? s.slice(0, iBairro) : s).replace(/,\s*$/, '').trim();
  const hp = head.split(/\s*,\s*/).filter(Boolean);
  out.logradouro = hp[0] || '';
  out.numero = hp[1] || '';
  out.complemento = hp.slice(2).join(', ');
  if (iBairro >= 0) {
    const end = iCep >= 0 ? iCep : iPais >= 0 ? iPais : s.length;
    out.bairro = s
      .slice(iBairro + 'Bairro '.length, end)
      .replace(/,\s*$/, '')
      .trim();
  }
  if (iCep >= 0) {
    const tail = s
      .slice(iCep, iPais >= 0 ? iPais : s.length)
      .replace(/^Endereço Postal\s*/, '')
      .replace(/,\s*$/, '')
      .trim();
    const tp = tail.split(/\s*,\s*/).filter(Boolean);
    out.cep = tp[0] || '';
    out.cidade = tp[1] || '';
    out.estado = tp[2] || '';
  }
  return out;
}

const usdToNum = (s) => {
  const n = Number(String(s || '').replace(/[^\d.]/g, '')); // portal shows a raw decimal ("1234.56")
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const chaveFromUrl = () => (location.pathname.match(/\/(\d{50})(?:\/|$)/) || [])[1] || '';
// Chave de acesso (50 digits) layout offsets. Keep in sync with popup.js (nota number).
const CHAVE = { municipio: [0, 7], numero: [23, 36] };

// Builds a profile from the open nota. Client-specific fields come ONLY from the parsed
// page — an unread field stays empty, never backfilled from the template, so one client's
// data can never leak into another's profile. The bundled template contributes ONLY
// scenario constants (regime, comércio-exterior codes) plus the país ISO codes: the nota
// shows the tomador country only as a display name, and mapping name → ISO would need a
// country table — so the template's 'US' is used and a warning is raised when the nota's
// display name doesn't look like the US (the tool is Brasil→EUA-scoped for now).
// Throws when the emitente CNPJ or the template can't be read (fail loudly rather
// than build a profile that could be keyed or filled wrong). Returns
// { profile, emitente, chave, missing } — `missing` lists required fields the parse
// couldn't read, so the panel warns before the profile is used or saved.
async function buildProfileFromNota(template) {
  const chave = chaveFromUrl();
  const map = notaSectionMap();
  // Scoped lookup: section title + label. No cross-section fallback by design.
  const first = (sec, k) => {
    const s = map[sec];
    return (s && s[k] && s[k][0]) || '';
  };
  const extStr = first(SEC.tomador, 'Endereço do Estabelecimento/Domicílio');

  // Tomador variant, inferred from how the Visualizar page renders it: no Tomador
  // section → não informado; a CPF/CNPJ row → Brasil; otherwise exterior (the
  // address line carries "País …"). NIF and contato are read when shown, '' when not.
  // Heading drift fails loud: a Tomador-ish section under another title must not
  // silently classify as 'não informado' — local '' is refused at fill time and
  // named in the missing report.
  const hasTomador = !!map[SEC.tomador];
  const tomadorishKey = hasTomador ? '' : Object.keys(map).find((k) => /tomador/i.test(k)) || '';
  const tomInscricao =
    first(SEC.tomador, 'CPF/CNPJ') || first(SEC.tomador, 'CNPJ') || first(SEC.tomador, 'CPF');
  const tomLocal = tomadorishKey ? '' : !hasTomador ? 'nao_informado' : tomInscricao ? 'brasil' : 'exterior';
  const nifValor = first(SEC.tomador, 'NIF');
  // Same fail-loud for the NIF: an unrecognized NIF-ish row (other than the motivo
  // row) must warn instead of silently parsing as 'NIF não informado'.
  const nifishKey = nifValor
    ? ''
    : Object.keys(map[SEC.tomador] || {}).find((k) => k !== 'NIF' && /NIF/i.test(k) && !/motivo/i.test(k)) ||
      '';

  if (!template) {
    throw new Error(
      'modelo de configuração indisponível — crie src/config.default.json a partir do config.example.json.',
    );
  }
  // Scenario-constant lookup ("page1.regime_sn" → template value, '' when absent).
  const t = (path) =>
    path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), template) ?? '';

  const cnpj = first(SEC.emitente, 'CNPJ');
  if (!cnpj) throw new Error('CNPJ do emitente não encontrado na nota — perfil não criado.');

  const ctn = splitCodeText(first(SEC.servico, 'Código de Tributação Nacional'));
  ctn.value = formatCTN(ctn.value);

  // Only the fields of the inferred variant enter the profile — a Brasil tomador
  // never carries a half-parsed "endereço exterior", and vice versa.
  const tomador = {
    local: tomLocal,
    nif: nifValor ? { informado: '1', valor: nifValor } : { informado: '0' },
  };
  if (tomLocal !== 'nao_informado') {
    tomador.nome = first(SEC.tomador, 'Nome/Razão Social');
    tomador.telefone = first(SEC.tomador, 'Telefone');
    // The emitted nota labels it "Email" (no hyphen — staging-verified); accept both.
    tomador.email = first(SEC.tomador, 'Email') || first(SEC.tomador, 'E-mail');
  }
  if (tomLocal === 'brasil') {
    tomador.inscricao = tomInscricao;
    tomador.inscricao_municipal = first(SEC.tomador, 'Inscrição Municipal');
  }
  if (tomLocal === 'exterior') {
    tomador.endereco_exterior = Object.assign(parseExterior(extStr), {
      pais_codigo: t('tomador.endereco_exterior.pais_codigo'),
    });
  }

  // Tipo do total dos tributos, inferred from how the Visualizar section presents
  // it: alíquota do SN → '4'; seção ausente → '3'. Per-ente rows are staging-
  // verified to render identically (bare Federal/Estadual/Municipal, unmarked
  // values) for tipos 1 AND 2 — indistinguishable, so they parse as '' (refused at
  // fill time) unless a future portal version words the labels (the pct/val checks
  // below would then start classifying again).
  const ttSec = map[SEC.totalTributos];
  const ttKeys = ttSec ? Object.keys(ttSec) : [];
  const ttFind = (re) => {
    const k = ttKeys.find((key) => re.test(key));
    return k ? ttSec[k][0] : '';
  };
  const aliquotaSn = first(
    SEC.totalTributos,
    'Valor percentual aproximado do total dos tributos da alíquota do Simples Nacional',
  );
  let tributosTipo = '3';
  let tributos;
  let tributosPorEnte = false; // '' came from indistinguishable per-ente rows (vs a section we couldn't read)
  if (aliquotaSn) {
    tributosTipo = '4';
  } else if (ttSec) {
    tributos = { federal: ttFind(/federa/i), estadual: ttFind(/estadua/i), municipal: ttFind(/municipa/i) };
    const enteKeys = ttKeys.filter((k) => /federa|estadua|municipa/i.test(k));
    if (enteKeys.length) {
      tributosPorEnte = true;
      const pct = enteKeys.some((k) => /percentual|%/i.test(k));
      const val = enteKeys.some((k) => /valor|r\$/i.test(k));
      tributosTipo = pct ? '2' : val ? '1' : '';
    } else {
      tributosTipo = '';
    }
    if (!tributosTipo) tributos = undefined;
  }

  const razaoSocial = first(SEC.emitente, 'Razão Social');
  const profile = {
    label: razaoSocial || 'Cliente',
    cnpj,
    sourceChave: chave, // which nota this profile was built from (marks the default)
    page1: {
      regime_sn: t('page1.regime_sn'),
      tomador_motivo_nif: t('page1.tomador_motivo_nif'),
    },
    tomador,
    servico: {
      // text = local da prestação (Serviço Prestado panel); value = the chave's
      // município gerador code — same municipality whenever the service is rendered
      // from the company seat (this tool's scenario).
      municipio: {
        value: chave.slice(CHAVE.municipio[0], CHAVE.municipio[1]),
        text: first(SEC.servico, 'Município'),
      },
      ctn,
      complementar: splitCodeText(first(SEC.servico, 'Código de Tributação Municipal')),
      motivo_nao_tributacao: leadCode(first(SEC.tribMunicipal, 'Tributação do ISSQN')),
      descricao: first(SEC.servico, 'Descrição do serviço'),
      nbs: splitCodeText(first(SEC.servico, 'Item da NBS correspondente ao serviço prestado')),
      pais_resultado: t('servico.pais_resultado'),
      comercio_exterior: {
        moeda: leadCode(first(SEC.comercioExterior, 'Moeda')), // bare code ('840')
        modo: t('servico.comercio_exterior.modo'),
        vinculo: t('servico.comercio_exterior.vinculo'),
        mec_prest: t('servico.comercio_exterior.mec_prest'),
        mec_tom: t('servico.comercio_exterior.mec_tom'),
        mov_bens: t('servico.comercio_exterior.mov_bens'),
        mdic: t('servico.comercio_exterior.mdic'),
      },
    },
    tributacao: Object.assign(
      {
        pis_situacao: leadCode(first(SEC.tribFederal, 'Situação tributária do PIS/COFINS')),
        pis_retencao: leadCode(first(SEC.tribFederal, 'Descrição Contribuições Sociais - Retidas')),
        aliquota_sn: aliquotaSn,
        valor_tributos_tipo: tributosTipo,
      },
      tributos ? { tributos } : null,
    ),
    valor: { usd: usdToNum(first(SEC.comercioExterior, 'Valor do serviço em moeda estrangeira')) },
  };

  const required = [
    ['Razão Social do emitente', razaoSocial],
    // Tomador requirements follow the inferred variant — não informado requires nothing.
    ...(tomLocal !== 'nao_informado' ? [['Tomador', tomador.nome]] : []),
    ...(tomLocal === 'brasil' ? [['CPF/CNPJ do tomador', tomador.inscricao]] : []),
    ...(tomLocal === 'exterior'
      ? [
          ['Endereço do tomador', tomador.endereco_exterior.logradouro],
          ['Número do endereço', tomador.endereco_exterior.numero],
          ['Bairro do tomador', tomador.endereco_exterior.bairro],
          ['Cidade do tomador', tomador.endereco_exterior.cidade],
          ['CEP/postal do tomador', tomador.endereco_exterior.cep],
          ['Estado do tomador', tomador.endereco_exterior.estado],
        ]
      : []),
    ['Município da prestação', profile.servico.municipio.value && profile.servico.municipio.text],
    // CTN/NBS need value AND text: an AJAX select only accepts an injected option with both.
    ['CTN', profile.servico.ctn.value && profile.servico.ctn.text],
    ['Código municipal', profile.servico.complementar.value],
    ['Tributação do ISSQN', profile.servico.motivo_nao_tributacao],
    ['Descrição', profile.servico.descricao],
    ['NBS', profile.servico.nbs.value && profile.servico.nbs.text],
    ['Moeda', profile.servico.comercio_exterior.moeda],
    ['Situação PIS/COFINS', profile.tributacao.pis_situacao],
    ['Retenção PIS/COFINS', profile.tributacao.pis_retencao],
    // Total dos tributos requirements follow the inferred tipo ('3' requires nothing,
    // but announces itself: an unrecognized/renamed section must not silently flip a
    // tipo-4 nota to 'não informar').
    ...(tributosTipo === '4' ? [['Alíquota SN', aliquotaSn]] : []),
    ...(tributosTipo === '1' || tributosTipo === '2'
      ? [
          ['Tributos federais', tributos.federal],
          ['Tributos estaduais', tributos.estadual],
          ['Tributos municipais', tributos.municipal],
        ]
      : []),
    ...(tributosTipo === '3' && !ttSec
      ? [
          [
            'Total dos tributos (sem seção na nota — "não informar" não vale para ME/EPP, a página Valores não será preenchida)',
            '',
          ],
        ]
      : []),
    ...(tributosTipo === ''
      ? [
          [
            tributosPorEnte
              ? 'Total dos tributos (a nota não distingue valores de percentuais por ente — perfis dos tipos 1/2 só por configuração manual)'
              : 'Total dos tributos (formato não reconhecido — a seção mudou?)',
            '',
          ],
        ]
      : []),
    // Only exportação (3) is fillable — ISS devido, imunidade (needs TipoImunidade)
    // and não-incidência (CTN-dependent, portal modal) are refused by the fill guard;
    // warn here at onboarding time, where the user can still pick another nota.
    ...(profile.servico.motivo_nao_tributacao && profile.servico.motivo_nao_tributacao !== '3'
      ? [
          [
            `Tributação do ISSQN (código ${profile.servico.motivo_nao_tributacao} — apenas exportação de serviço é suportada)`,
            '',
          ],
        ]
      : []),
    ...(tomadorishKey
      ? [[`Tomador (seção "${tomadorishKey}" não reconhecida — variante indeterminada)`, '']]
      : []),
    ...(nifishKey ? [[`NIF do tomador (rótulo "${nifishKey}" não reconhecido — confira)`, '']] : []),
    ['Valor (US$)', profile.valor.usd],
  ];
  const missing = required.filter(([, v]) => !v).map(([k]) => k);
  // The profile fills 'US' (template) as the tomador country — warn when the nota's
  // displayed country doesn't look like the US, instead of silently mislabeling it.
  const paisNome = tomLocal === 'exterior' ? tomador.endereco_exterior.pais_nome : '';
  if (paisNome && !/estados unidos/i.test(paisNome)) {
    missing.push(`País do tomador (a nota indica "${paisNome}", mas o perfil usará EUA — confira)`);
  }

  return { profile, emitente: { cnpj, nome: razaoSocial }, chave, missing };
}

// ---- fill -------------------------------------------------------------------------
// Single migration point: profiles saved before the variant fields existed get the
// discriminants that reproduce their original behavior — tomador no exterior, NIF
// não informado. Runs on every profile right before it leaves content.js for the
// shape guard + fill plan, so stored profiles never need rewriting. A profile
// without `tomador` at all is left as-is for the guard to refuse.
function normalizeProfile(cfg) {
  if (!cfg || !cfg.tomador) return cfg;
  const tom = cfg.tomador;
  if (tom.local == null) tom.local = 'exterior';
  if (!tom.nif || tom.nif.informado == null) {
    // The flag follows the data: a nif carrying a valor without the flag means
    // informado — defaulting it to 'não' would declare the opposite of the profile.
    tom.nif = Object.assign({ informado: tom.nif && tom.nif.valor ? '1' : '0' }, tom.nif);
  }
  return cfg;
}

async function resolveProfile(bundled) {
  const cnpj = onlyDigits(readIdentity()?.cnpj);
  if (!cnpj) return null; // unknown client → no profile, ever (no wildcard fallback)
  try {
    const { profiles } = await ext.storage.local.get('profiles');
    if (profiles && profiles[cnpj]) return profiles[cnpj];
  } catch {}
  if (bundled && onlyDigits(bundled.cnpj) === cnpj) return bundled;
  return null;
}

// Resolves which profile a fill must use — page guard, identity guard, override CNPJ
// check — and returns it to the panel. The panel then injects the engine and the profile
// straight into the MAIN world via scripting.executeScript, so the profile never transits
// a page-observable channel (the old window.postMessage bridge was forgeable/readable by
// portal page scripts).
async function resolveFill(override, bundled) {
  const pageId = detectPage();
  if (pageId !== 'pessoas' && pageId !== 'servico' && pageId !== 'valores') {
    return { ok: false, pageId, msg: 'Abra uma página do formulário (Pessoas / Serviço / Valores).' };
  }
  const loggedCnpj = onlyDigits(readIdentity()?.cnpj);
  if (!loggedCnpj) {
    return {
      ok: false,
      pageId,
      msg: 'Não consegui identificar o CNPJ logado — preenchimento bloqueado por segurança. Recarregue a página.',
    };
  }
  let cfg = null;
  // "Use once" override only applies if it belongs to the logged-in client.
  if (override && override.cnpj && onlyDigits(override.cnpj) === loggedCnpj) cfg = override;
  if (!cfg) {
    try {
      cfg = await resolveProfile(bundled);
    } catch (e) {
      return { ok: false, pageId, msg: 'Falha ao carregar perfil: ' + e.message };
    }
  }
  if (!cfg) {
    const id = readIdentity();
    return {
      ok: false,
      pageId,
      msg: `Nenhum perfil cadastrado para o CNPJ logado${id ? ` (${id.cnpj})` : ''}.`,
    };
  }
  return { ok: true, pageId, cfg: normalizeProfile(cfg) };
}

ext.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'detect') {
    sendResponse({
      pageId: detectPage(),
      loggedIn: isLoggedIn(),
      identity: readIdentity(),
      portalVersion: readPortalVersion(),
    });
    return false;
  }
  if (msg.action === 'resolveFill') {
    resolveFill(msg.profileOverride, msg.bundled)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, pageId: detectPage(), msg: String((e && e.message) || e) }));
    return true; // keep the message channel open for the async reply
  }
  if (msg.action === 'parseNota') {
    if (detectPage() !== 'nota') {
      sendResponse({ ok: false, msg: 'Abra uma nota emitida (Visualizar) para carregar.' });
      return false;
    }
    buildProfileFromNota(msg.template)
      .then((r) => sendResponse({ ok: true, ...r }))
      .catch((e) => sendResponse({ ok: false, msg: String((e && e.message) || e) }));
    return true;
  }
  return false;
});
