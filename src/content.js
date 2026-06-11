// Cross-browser: `browser` (Firefox, promise-based) or `chrome` (Chromium MV3, also promises).
const ext = globalThis.browser || globalThis.chrome;
// Isolated world. Detects the current portal page, reads the logged-in identity, parses
// a previously emitted nota (Visualizar page) into a client profile, and relays fill /
// parse requests to the MAIN-world engine.
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
// parseNota/fillPage message, so the file never needs to be web-accessible to the page.

// ---- previous-nota parsing --------------------------------------------------------
// The Visualizar page renders every field as a .form-group with a label + a
// .form-control-static value (coded fields show "código - descrição"). Build a
// label → [values] map (duplicate labels exist: emitente vs tomador).
function notaLabelMap() {
  const map = {};
  document.querySelectorAll('.form-group').forEach((g) => {
    const l = g.querySelector('label.control-label span');
    const v = g.querySelector('.form-control-static');
    if (!l || !v) return;
    const k = (l.textContent || '').replace(/\s+/g, ' ').trim();
    const val = (v.textContent || '').replace(/\s+/g, ' ').trim();
    if (!k) return;
    (map[k] = map[k] || []).push(val);
  });
  return map;
}

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
  const out = { logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', cep: '', estado: '' };
  const iBairro = s.indexOf('Bairro ');
  const iCep = s.search(/Endereço Postal\s/);
  const iPais = s.search(/País\s/);
  const head = (iBairro >= 0 ? s.slice(0, iBairro) : s).replace(/,\s*$/, '').trim();
  const hp = head.split(/\s*,\s*/).filter(Boolean);
  out.logradouro = hp[0] || '';
  out.numero = hp[1] || '';
  out.complemento = hp.slice(2).join(', ');
  if (iBairro >= 0) {
    const end = iCep >= 0 ? iCep : iPais >= 0 ? iPais : s.length;
    out.bairro = s.slice(iBairro + 'Bairro '.length, end).replace(/,\s*$/, '').trim();
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

// Builds a profile from the open nota. Client-specific fields come ONLY from the parsed
// page — an unread field stays empty, never backfilled from the template, so one client's
// data can never leak into another's profile. The bundled template contributes ONLY the
// scenario constants the Visualizar page doesn't show (regime, comércio-exterior codes,
// país). Throws when the emitente CNPJ or the template can't be read (fail loudly rather
// than build a profile that could be keyed or filled wrong). Returns
// { profile, emitente, chave, missing } — `missing` lists required fields the parse
// couldn't read, so the panel warns before the profile is used or saved.
async function buildProfileFromNota(template) {
  const chave = chaveFromUrl();
  const map = notaLabelMap();
  const first = (k) => (map[k] && map[k][0]) || '';
  const enderecos = map['Endereço do Estabelecimento/Domicílio'] || [];
  const extStr = enderecos.find((s) => /País\s/i.test(s)) || enderecos[enderecos.length - 1] || '';

  if (!template) {
    throw new Error('modelo de configuração indisponível — crie src/config.default.json a partir do config.example.json.');
  }
  // Scenario-constant lookup ("page1.regime_sn" → template value, '' when absent).
  const t = (path) =>
    path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), template) ?? '';

  const cnpj = first('CNPJ'); // the emitente block's (the tomador no exterior has no CNPJ field)
  if (!cnpj) throw new Error('CNPJ do emitente não encontrado na nota — perfil não criado.');

  const ctn = splitCodeText(first('Código de Tributação Nacional'));
  ctn.value = formatCTN(ctn.value);

  const profile = {
    label: first('Razão Social') || 'Cliente',
    cnpj,
    sourceChave: chave, // which nota this profile was built from (marks the default)
    page1: {
      regime_sn: t('page1.regime_sn'),
      tomador_motivo_nif: t('page1.tomador_motivo_nif'),
    },
    tomador: {
      nome: first('Nome/Razão Social'),
      endereco_exterior: Object.assign(parseExterior(extStr), {
        pais_codigo: t('tomador.endereco_exterior.pais_codigo'),
      }),
    },
    servico: {
      municipio: { value: chave.slice(0, 7), text: first('Município') },
      ctn,
      complementar: splitCodeText(first('Código de Tributação Municipal')),
      motivo_nao_tributacao: leadCode(first('Tributação do ISSQN')),
      descricao: first('Descrição do serviço'),
      nbs: splitCodeText(first('Item da NBS correspondente ao serviço prestado')),
      pais_resultado: t('servico.pais_resultado'),
      comercio_exterior: {
        moeda: leadCode(first('Moeda')), // bare code ('840'), like every other coded field
        modo: t('servico.comercio_exterior.modo'),
        vinculo: t('servico.comercio_exterior.vinculo'),
        mec_prest: t('servico.comercio_exterior.mec_prest'),
        mec_tom: t('servico.comercio_exterior.mec_tom'),
        mov_bens: t('servico.comercio_exterior.mov_bens'),
        mdic: t('servico.comercio_exterior.mdic'),
      },
    },
    tributacao: {
      pis_situacao: leadCode(first('Situação tributária do PIS/COFINS')),
      pis_retencao: leadCode(first('Descrição Contribuições Sociais - Retidas')),
      aliquota_sn: first('Valor percentual aproximado do total dos tributos da alíquota do Simples Nacional'),
      valor_tributos_tipo: t('tributacao.valor_tributos_tipo'),
    },
    valor: { usd: usdToNum(first('Valor do serviço em moeda estrangeira')) },
  };

  const required = [
    ['Tomador', profile.tomador.nome],
    ['Endereço do tomador', profile.tomador.endereco_exterior.logradouro],
    ['Número do endereço', profile.tomador.endereco_exterior.numero],
    ['Cidade do tomador', profile.tomador.endereco_exterior.cidade],
    ['CEP/postal do tomador', profile.tomador.endereco_exterior.cep],
    ['Estado do tomador', profile.tomador.endereco_exterior.estado],
    ['Município da prestação', profile.servico.municipio.value && profile.servico.municipio.text],
    ['CTN', profile.servico.ctn.value],
    ['Código municipal', profile.servico.complementar.value],
    ['Tributação do ISSQN', profile.servico.motivo_nao_tributacao],
    ['Descrição', profile.servico.descricao],
    ['NBS', profile.servico.nbs.value],
    ['Moeda', profile.servico.comercio_exterior.moeda],
    ['Situação PIS/COFINS', profile.tributacao.pis_situacao],
    ['Retenção PIS/COFINS', profile.tributacao.pis_retencao],
    ['Alíquota SN', profile.tributacao.aliquota_sn],
    ['Valor (US$)', profile.valor.usd],
  ];
  const missing = required.filter(([, v]) => !v).map(([k]) => k);

  return { profile, emitente: { cnpj, nome: first('Razão Social') }, chave, missing };
}

// ---- fill -------------------------------------------------------------------------
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

function fillCurrentPage(state, override, bundled) {
  return new Promise(async (resolve) => {
    const pageId = detectPage();
    if (pageId !== 'pessoas' && pageId !== 'servico' && pageId !== 'valores') {
      return resolve({ ok: false, pageId, msg: 'Abra uma página do formulário (Pessoas / Serviço / Valores).' });
    }
    const loggedCnpj = onlyDigits(readIdentity()?.cnpj);
    if (!loggedCnpj) {
      return resolve({
        ok: false,
        pageId,
        msg: 'Não consegui identificar o CNPJ logado — preenchimento bloqueado por segurança. Recarregue a página.',
      });
    }
    let cfg = null;
    // "Use once" override only applies if it belongs to the logged-in client.
    if (override && override.cnpj && onlyDigits(override.cnpj) === loggedCnpj) cfg = override;
    if (!cfg) {
      try {
        cfg = await resolveProfile(bundled);
      } catch (e) {
        return resolve({ ok: false, pageId, msg: 'Falha ao carregar perfil: ' + e.message });
      }
    }
    if (!cfg) {
      const id = readIdentity();
      return resolve({ ok: false, pageId, msg: `Nenhum perfil cadastrado para o CNPJ logado${id ? ` (${id.cnpj})` : ''}.` });
    }
    const reqId = Math.random().toString(36).slice(2);
    // If the MAIN-world engine never answers (failed injection, page in a bad state),
    // fail with a friendly message instead of leaving the panel stuck "Preenchendo…".
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMsg);
      resolve({ ok: false, pageId, msg: 'O preenchimento não respondeu — recarregue a página e tente de novo.' });
    }, 30000);
    const onMsg = (ev) => {
      const d = ev.data;
      if (!d || d.__nfse_res !== true || d.id !== reqId) return;
      clearTimeout(timer);
      window.removeEventListener('message', onMsg);
      resolve({ ok: d.ok, pageId, results: d.results, err: d.err });
    };
    window.addEventListener('message', onMsg);
    window.postMessage({ __nfse_req: true, id: reqId, pageId, cfg, state }, '*');
  });
}

ext.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'detect') {
    sendResponse({ pageId: detectPage(), loggedIn: isLoggedIn(), identity: readIdentity() });
    return false;
  }
  if (msg.action === 'fillPage') {
    fillCurrentPage(msg.state, msg.profileOverride, msg.bundled).then(sendResponse);
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
