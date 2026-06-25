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

// Builds a profile purely from the open nota — no template, no defaults. Every value
// comes from the parsed Visualizar page; a field that isn't on the nota stays empty and
// its fill op is skipped, so the extension never invents data. Country / comércio-exterior
// fields are stored as the nota's display text and resolved to the portal's own option
// codes at fill time. Fields the issued nota never shows (regime de apuração do SN, motivo
// de não informação do NIF) stay empty — the user sets those on the portal. Throws only
// when the emitente CNPJ can't be read. Returns { profile, emitente, chave, missing } —
// `missing` lists required fields the parse couldn't read, so the panel warns first.
async function buildProfileFromNota() {
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
    // País: guardamos só o NOME lido do endereço ('Estados Unidos da América'); o
    // resolvedor o mapeia para o código contra a lista de países do próprio portal no
    // preenchimento — nada de 'US' fixo do template.
    tomador.endereco_exterior = parseExterior(extStr);
  }

  // Intermediário (opcional): inferido da seção do Visualizar cujo título casa /intermedi/i.
  // Ausente → nao_informado (o caso comum). Mesma lógica do tomador: linha CPF/CNPJ →
  // Brasil, senão exterior; NIF e contato lidos quando presentes, '' quando não. Só os
  // campos da variante inferida entram (um intermediário Brasil nunca carrega endereço
  // exterior meio-lido). O país do exterior vem do template ('US'), como no tomador.
  const interSecKey = Object.keys(map).find((k) => /intermedi/i.test(k)) || '';
  const interMap = interSecKey ? map[interSecKey] : null;
  const interFirst = (k) => (interMap && interMap[k] && interMap[k][0]) || '';
  const interInscricao = interFirst('CPF/CNPJ') || interFirst('CNPJ') || interFirst('CPF');
  const interNif = interFirst('NIF');
  // Mesma proteção do tomador: um rótulo de NIF que mudou (fora a linha do motivo)
  // avisa em vez de classificar silenciosamente como 'NIF não informado'.
  const interNifishKey =
    interNif || !interMap
      ? ''
      : Object.keys(interMap).find((k) => k !== 'NIF' && /NIF/i.test(k) && !/motivo/i.test(k)) || '';
  const interLocal = !interMap ? 'nao_informado' : interInscricao ? 'brasil' : 'exterior';
  const intermediario = {
    local: interLocal,
    nif: interNif ? { informado: '1', valor: interNif } : { informado: '0' },
  };
  if (interLocal !== 'nao_informado') {
    intermediario.nome = interFirst('Nome/Razão Social');
    intermediario.telefone = interFirst('Telefone');
    intermediario.email = interFirst('Email') || interFirst('E-mail');
  }
  if (interLocal === 'brasil') {
    intermediario.inscricao = interInscricao;
    intermediario.inscricao_municipal = interFirst('Inscrição Municipal');
  }
  if (interLocal === 'exterior') {
    // Como no tomador: só o nome do país, resolvido contra o portal no preenchimento.
    intermediario.endereco_exterior = parseExterior(interFirst('Endereço do Estabelecimento/Domicílio'));
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
      // Não aparecem na nota emitida — ficam vazios e o preenchimento NÃO os toca (o
      // usuário escolhe no portal). Só vêm preenchidos pela config do próprio emitente.
      regime_sn: '',
      tomador_motivo_nif: '',
      intermediario_motivo_nif: '',
    },
    tomador,
    intermediario,
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
      // Não aparece no Visualizar (renderiza "-"). Para exportação (modo Consumo no
      // Exterior) o resultado se verifica no país do tomador — usamos o nome dele, que
      // o resolvedor mapeia no preenchimento. Fallback ao template fora do exterior.
      pais_resultado: tomLocal === 'exterior' ? tomador.endereco_exterior.pais_nome : '',
      comercio_exterior: {
        moeda: leadCode(first(SEC.comercioExterior, 'Moeda')), // bare code ('840')
        // Lidos como o TEXTO exibido na nota; o resolvedor os mapeia para os códigos do
        // portal no preenchimento. Rótulos exatos do Visualizar (probed 2026-06).
        modo: first(SEC.comercioExterior, 'Modo de Prestação'),
        vinculo: first(SEC.comercioExterior, 'Vínculo entre as partes no Negócio'),
        mec_prest: first(
          SEC.comercioExterior,
          'Mecanismo de apoio/fomento ao Comércio Exterior utilizado pelo prestador do serviço',
        ),
        mec_tom: first(
          SEC.comercioExterior,
          'Mecanismo de apoio/fomento ao Comércio Exterior utilizado pelo tomador do serviço',
        ),
        mov_bens: first(SEC.comercioExterior, 'Operação está vinculada à Movimentação Temporária de Bens'),
        mdic: first(
          SEC.comercioExterior,
          'Deseja compartilhar a NFS-e que será gerada a partir desta DPS com o MDIC ?',
        ),
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
    // Intermediário (opcional): requisitos seguem a variante inferida — nao_informado
    // não exige nada (o caso comum).
    ...(interLocal !== 'nao_informado' ? [['Nome do intermediário', intermediario.nome]] : []),
    ...(interLocal === 'brasil' ? [['CPF/CNPJ do intermediário', intermediario.inscricao]] : []),
    ...(interLocal === 'exterior'
      ? [
          ['Endereço do intermediário', intermediario.endereco_exterior.logradouro],
          ['Número do endereço (intermediário)', intermediario.endereco_exterior.numero],
          ['Bairro do intermediário', intermediario.endereco_exterior.bairro],
          ['Cidade do intermediário', intermediario.endereco_exterior.cidade],
          ['CEP/postal do intermediário', intermediario.endereco_exterior.cep],
          ['Estado do intermediário', intermediario.endereco_exterior.estado],
        ]
      : []),
    ['Município da prestação', profile.servico.municipio.value && profile.servico.municipio.text],
    // CTN/NBS need value AND text: an AJAX select only accepts an injected option with both.
    ['CTN', profile.servico.ctn.value && profile.servico.ctn.text],
    // Código complementar municipal é opcional: só os municípios que desdobram o item
    // da LC 116 o exigem. Vazio é válido (não entra no relatório de "não consegui ler").
    ['Tributação do ISSQN', profile.servico.motivo_nao_tributacao],
    ['Descrição', profile.servico.descricao],
    ['NBS', profile.servico.nbs.value && profile.servico.nbs.text],
    ['País do resultado', profile.servico.pais_resultado],
    ['Moeda', profile.servico.comercio_exterior.moeda],
    // Comércio exterior lido como texto da nota — avisa no onboarding se algum não veio.
    ['Modo de prestação', profile.servico.comercio_exterior.modo],
    ['Vínculo entre as partes', profile.servico.comercio_exterior.vinculo],
    ['Mecanismo de apoio (prestador)', profile.servico.comercio_exterior.mec_prest],
    ['Mecanismo de apoio (tomador)', profile.servico.comercio_exterior.mec_tom],
    ['Movimentação temporária de bens', profile.servico.comercio_exterior.mov_bens],
    ['Compartilhar com MDIC', profile.servico.comercio_exterior.mdic],
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
    ...(interNifishKey
      ? [[`NIF do intermediário (rótulo "${interNifishKey}" não reconhecido — confira)`, '']]
      : []),
    ['Valor (US$)', profile.valor.usd],
  ];
  const missing = required.filter(([, v]) => !v).map(([k]) => k);
  // (O país do tomador/intermediário e o do resultado agora vêm da própria nota e são
  // resolvidos contra a lista do portal — não há mais 'US' fixo do template para avisar.)

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
  // Intermediário is optional: a profile without it predates the field → no
  // intermediário (the radio's value 0). Saved profiles never need rewriting.
  const itm = cfg.intermediario;
  if (!itm) {
    cfg.intermediario = { local: 'nao_informado', nif: { informado: '0' } };
  } else {
    if (itm.local == null) itm.local = 'nao_informado';
    if (!itm.nif || itm.nif.informado == null) {
      itm.nif = Object.assign({ informado: itm.nif && itm.nif.valor ? '1' : '0' }, itm.nif);
    }
  }
  return cfg;
}

async function resolveProfile(bundled) {
  const cnpj = onlyDigits(readIdentity()?.cnpj);
  if (!cnpj) return null; // unknown client → no profile, ever (no wildcard fallback)
  try {
    const { profiles } = await ext.storage.local.get('profiles');
    // Defense in depth: the stored profile's own CNPJ must match the key it sits under.
    // An imported/corrupt file could file client B's data under client A's key — if the
    // two disagree, treat it as no match and never fill another client's data.
    const found = profiles && profiles[cnpj];
    if (found && onlyDigits(found.cnpj) === cnpj) return found;
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
    buildProfileFromNota()
      .then((r) => sendResponse({ ok: true, ...r }))
      .catch((e) => sendResponse({ ok: false, msg: String((e && e.message) || e) }));
    return true;
  }
  return false;
});
