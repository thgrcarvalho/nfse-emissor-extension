// Painel. Constrói um perfil a partir do XML da NFS-e baixado do portal — o mesmo
// contrato do buildProfileFromNota do content script: { profile, emitente, chave,
// missing }. O XML é a ÚNICA fonte que carrega os campos que o Visualizar não
// renderiza (regApTribSN → regime do SN, cNaoNIF → motivo do NIF) e ainda traz os
// textos de exibição (xTribNac, xNBS, xLocPrestacao) que os selects AJAX precisam.
// Nada é inventado: cada campo vem de um elemento do XML ou fica vazio e entra no
// relatório `missing`. Layout de referência: NFSe versão 1.01 (nota real, 2026-07).
// Exposes window.buildProfileFromXml.
(function () {
  // Navegação por FILHOS diretos com localName (o documento usa namespace default):
  // fone/email/CNPJ existem em emit E prest E toma — o escopo importa.
  const child = (parent, name) =>
    parent ? Array.from(parent.children).find((c) => c.localName === name) || null : null;
  const txt = (parent, name) => {
    const e = child(parent, name);
    return e ? e.textContent.trim() : '';
  };
  // '01' → '1', '08' → '8': o XML zero-preenche códigos que os selects do portal
  // servem sem zeros. Só dígitos são normalizados; qualquer outra coisa passa como é.
  const dropZeros = (s) => (/^\d+$/.test(s) ? String(Number(s)) : s);
  // Valores monetários/percentuais do XML usam ponto ('4.00'); os campos do portal
  // (e os perfis extraídos da nota) usam vírgula ('4,00').
  const brNum = (s) => String(s || '').replace('.', ',');
  // "140201" → "14.02.01" (mesma regra do content.js).
  const formatCTN = (v) => (/^\d+$/.test(v) && v.length % 2 === 0 ? v.match(/\d{2}/g).join('.') : v);
  const usdToNum = (s) => {
    const n = Number(String(s || '').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  // Tomador OU intermediário (mesma estrutura no XML: toma / interm).
  // → { pessoa, motivoNif, variantIssue }
  function parsePessoa(node) {
    if (!node) return { pessoa: { local: 'nao_informado', nif: { informado: '0' } }, motivoNif: '' };
    const end = child(node, 'end');
    const endExt = child(end, 'endExt');
    const inscricao = txt(node, 'CNPJ') || txt(node, 'CPF');
    const nif = txt(node, 'NIF');
    const motivoNif = dropZeros(txt(node, 'cNaoNIF'));
    const local = endExt ? 'exterior' : inscricao ? 'brasil' : '';
    const pessoa = {
      local,
      nif: nif ? { informado: '1', valor: nif } : { informado: '0' },
      nome: txt(node, 'xNome'),
      telefone: txt(node, 'fone'),
      email: txt(node, 'email'),
    };
    if (local === 'brasil') {
      pessoa.inscricao = inscricao;
      pessoa.inscricao_municipal = txt(node, 'IM');
    }
    if (local === 'exterior') {
      pessoa.endereco_exterior = {
        logradouro: txt(end, 'xLgr'),
        numero: txt(end, 'nro'),
        complemento: txt(end, 'xCpl'),
        bairro: txt(end, 'xBairro'),
        cidade: txt(endExt, 'xCidade'),
        cep: txt(endExt, 'cEndPost'),
        estado: txt(endExt, 'xEstProvReg'),
        pais_codigo: txt(endExt, 'cPais'), // código ISO ('US') — o resolvedor aceita código ou nome
      };
    }
    return { pessoa, motivoNif, variantIssue: local === '' };
  }

  window.buildProfileFromXml = function (xmlText) {
    const doc = new DOMParser().parseFromString(String(xmlText || ''), 'application/xml');
    if (doc.querySelector('parsererror')) {
      throw new Error('não é um XML válido — baixe o XML da nota no portal e tente de novo.');
    }
    const root = doc.documentElement;
    // Aceita o XML da NFS-e (NFSe > infNFSe > … > DPS) e também um DPS avulso — este
    // sem os textos de exibição do infNFSe (o relatório `missing` avisa o que faltou).
    const infNFSe = root.localName === 'NFSe' ? child(root, 'infNFSe') : null;
    const dps = infNFSe ? child(infNFSe, 'DPS') : root.localName === 'DPS' ? root : null;
    const infDPS = child(dps, 'infDPS');
    if (!infDPS) throw new Error('estrutura desconhecida — o arquivo não parece o XML de uma NFS-e.');

    const emit = child(infNFSe, 'emit');
    const enderNac = child(emit, 'enderNac');
    const prest = child(infDPS, 'prest');
    const regTrib = child(prest, 'regTrib');
    const serv = child(infDPS, 'serv');
    const cServ = child(serv, 'cServ');
    const comExt = child(serv, 'comExt');
    const locPrest = child(serv, 'locPrest');
    const valores = child(infDPS, 'valores');
    const trib = child(valores, 'trib');
    const tribMun = child(trib, 'tribMun');
    const piscofins = child(child(trib, 'tribFed'), 'piscofins');
    const totTrib = child(trib, 'totTrib');

    const cnpj = txt(emit, 'CNPJ') || txt(prest, 'CNPJ');
    if (!cnpj) throw new Error('CNPJ do emitente não encontrado no XML — perfil não criado.');
    const chaveRaw = ((infNFSe && infNFSe.getAttribute('Id')) || '').replace(/^NFS/, '');
    const chave = /^\d{50}$/.test(chaveRaw) ? chaveRaw : '';

    const tomadorParsed = parsePessoa(child(infDPS, 'toma'));
    const intermParsed = parsePessoa(child(infDPS, 'interm'));
    const tomador = tomadorParsed.pessoa;
    const intermediario = intermParsed.pessoa;

    // Textos de exibição (infNFSe): os selects AJAX do assistente (município, CTN,
    // NBS) só aceitam uma opção injetada com value E texto — o XML da NFS-e traz as
    // descrições que o DPS avulso não tem.
    const xTribNac = txt(infNFSe, 'xTribNac');
    const xNBS = txt(infNFSe, 'xNBS');
    const xLocPrestacao = txt(infNFSe, 'xLocPrestacao');
    const emitUF = txt(enderNac, 'UF');
    const emitCMun = txt(enderNac, 'cMun');

    const municipioValue = txt(locPrest, 'cLocPrestacao') || (chave ? chave.slice(0, 7) : '');
    // "Rio de Janeiro" + UF do emitente — só quando a prestação é no município-sede
    // (o cenário desta extensão); prestação em outro município ficaria sem UF confiável.
    const municipioText =
      xLocPrestacao && emitUF && municipioValue === emitCMun ? `${xLocPrestacao}/${emitUF}` : '';

    const ctnRaw = txt(cServ, 'cTribNac');
    const ctnDotted = formatCTN(ctnRaw);
    const complementarValue = txt(cServ, 'cTribMun');
    const nbsValue = txt(cServ, 'cNBS');

    // Total dos tributos: exatamente uma das variantes existe no XML.
    const pTotTribSN = txt(totTrib, 'pTotTribSN');
    const vTot = child(totTrib, 'vTotTrib');
    const pTot = child(totTrib, 'pTotTrib');
    const indTotTrib = txt(totTrib, 'indTotTrib');
    let tributosTipo = '';
    let tributos;
    if (pTotTribSN) tributosTipo = '4';
    else if (vTot) {
      tributosTipo = '1';
      tributos = {
        federal: brNum(txt(vTot, 'vTotTribFed')),
        estadual: brNum(txt(vTot, 'vTotTribEst')),
        municipal: brNum(txt(vTot, 'vTotTribMun')),
      };
    } else if (pTot) {
      tributosTipo = '2';
      tributos = {
        federal: brNum(txt(pTot, 'pTotTribFed')),
        estadual: brNum(txt(pTot, 'pTotTribEst')),
        municipal: brNum(txt(pTot, 'pTotTribMun')),
      };
    } else if (indTotTrib !== '') tributosTipo = '3';

    // Reforma IBS/CBS: uma nota emitida com "Sim" carrega o grupo IBSCBS no XML; a
    // ausência é o "Não" (ou uma nota anterior ao campo) — '0' reproduz a nota.
    // Token completo, não substring: 'regApTribSN'/'pTotTribSN' contêm "ibS" (Tr·ibS·N)
    // e um /ibs/i solto classificaria TODA nota do Simples como IBS/CBS.
    const hasIbsCbs = Array.from(doc.getElementsByTagName('*')).some((e) => /ibscbs/i.test(e.localName));

    const motivoNaoTributacao = txt(tribMun, 'tribISSQN');
    const label = txt(emit, 'xNome');
    const profile = {
      label: label || 'Cliente',
      cnpj,
      sourceChave: chave,
      page1: {
        regime_sn: txt(regTrib, 'regApTribSN'),
        tomador_motivo_nif: tomadorParsed.motivoNif,
        intermediario_motivo_nif: intermParsed.motivoNif,
        ibscbs: hasIbsCbs ? '1' : '0',
      },
      tomador,
      intermediario,
      servico: {
        municipio: { value: municipioValue, text: municipioText },
        ctn: { value: ctnDotted, text: xTribNac ? `${ctnDotted} - ${xTribNac}` : '' },
        complementar: {
          value: complementarValue,
          text:
            complementarValue && ctnDotted && xTribNac
              ? `${ctnDotted}.${complementarValue} - ${xTribNac}`
              : '',
        },
        motivo_nao_tributacao: motivoNaoTributacao,
        pais_resultado:
          txt(tribMun, 'cPaisResult') ||
          (tomador.endereco_exterior ? tomador.endereco_exterior.pais_codigo : ''),
        descricao: txt(cServ, 'xDescServ'),
        nbs: { value: nbsValue, text: xNBS ? `${nbsValue} - ${xNBS}` : '' },
        comercio_exterior: {
          moeda: txt(comExt, 'tpMoeda'),
          modo: dropZeros(txt(comExt, 'mdPrestacao')),
          vinculo: dropZeros(txt(comExt, 'vincPrest')),
          mec_prest: dropZeros(txt(comExt, 'mecAFComexP')),
          mec_tom: dropZeros(txt(comExt, 'mecAFComexT')),
          mov_bens: dropZeros(txt(comExt, 'movTempBens')),
          mdic: dropZeros(txt(comExt, 'mdic')),
        },
      },
      tributacao: Object.assign(
        {
          pis_situacao: dropZeros(txt(piscofins, 'CST')),
          pis_retencao: dropZeros(txt(piscofins, 'tpRetPisCofins')),
          aliquota_sn: brNum(pTotTribSN),
          valor_tributos_tipo: tributosTipo,
        },
        tributos ? { tributos } : null,
      ),
      valor: { usd: usdToNum(txt(comExt, 'vServMoeda')) },
    };

    const tomE = tomador.endereco_exterior;
    const itmE = intermediario.endereco_exterior;
    const required = [
      ['Razão Social do emitente', label],
      ['Regime de Apuração do SN', profile.page1.regime_sn],
      ...(tomador.local !== 'nao_informado' ? [['Tomador', tomador.nome]] : []),
      ...(tomador.local === 'brasil' ? [['CPF/CNPJ do tomador', tomador.inscricao]] : []),
      ...(tomador.local === 'exterior'
        ? [
            ['Endereço do tomador', tomE.logradouro],
            ['Número do endereço', tomE.numero],
            ['Bairro do tomador', tomE.bairro],
            ['Cidade do tomador', tomE.cidade],
            ['CEP/postal do tomador', tomE.cep],
            ['Estado do tomador', tomE.estado],
            ['País do tomador', tomE.pais_codigo],
          ]
        : []),
      ...(tomador.local === 'exterior' && tomador.nif.informado === '0'
        ? [['Motivo da não informação do NIF', profile.page1.tomador_motivo_nif]]
        : []),
      ...(intermediario.local !== 'nao_informado' ? [['Nome do intermediário', intermediario.nome]] : []),
      ...(intermediario.local === 'brasil' ? [['CPF/CNPJ do intermediário', intermediario.inscricao]] : []),
      ...(intermediario.local === 'exterior'
        ? [
            ['Endereço do intermediário', itmE.logradouro],
            ['Cidade do intermediário', itmE.cidade],
            ['País do intermediário', itmE.pais_codigo],
          ]
        : []),
      ['Município da prestação', profile.servico.municipio.value && profile.servico.municipio.text],
      ['CTN', profile.servico.ctn.value && profile.servico.ctn.text],
      ['Tributação do ISSQN', motivoNaoTributacao],
      ['Descrição', profile.servico.descricao],
      ['NBS', profile.servico.nbs.value && profile.servico.nbs.text],
      ['País do resultado', profile.servico.pais_resultado],
      ['Moeda', profile.servico.comercio_exterior.moeda],
      ['Modo de prestação', profile.servico.comercio_exterior.modo],
      ['Vínculo entre as partes', profile.servico.comercio_exterior.vinculo],
      ['Mecanismo de apoio (prestador)', profile.servico.comercio_exterior.mec_prest],
      ['Mecanismo de apoio (tomador)', profile.servico.comercio_exterior.mec_tom],
      ['Movimentação temporária de bens', profile.servico.comercio_exterior.mov_bens],
      ['Compartilhar com MDIC', profile.servico.comercio_exterior.mdic],
      ['Situação PIS/COFINS', profile.tributacao.pis_situacao],
      ['Retenção PIS/COFINS', profile.tributacao.pis_retencao],
      ...(tributosTipo === '4' ? [['Alíquota SN', profile.tributacao.aliquota_sn]] : []),
      ...(tributosTipo === '1' || tributosTipo === '2'
        ? [
            ['Tributos federais', tributos.federal],
            ['Tributos estaduais', tributos.estadual],
            ['Tributos municipais', tributos.municipal],
          ]
        : []),
      ...(tributosTipo === '3'
        ? [
            [
              'Total dos tributos ("não informar" não vale para ME/EPP — a página Valores não será preenchida)',
              '',
            ],
          ]
        : []),
      ...(tributosTipo === '' ? [['Total dos tributos (grupo totTrib não reconhecido no XML)', '']] : []),
      ...(motivoNaoTributacao && motivoNaoTributacao !== '3'
        ? [
            [
              `Tributação do ISSQN (código ${motivoNaoTributacao} — apenas exportação de serviço é suportada)`,
              '',
            ],
          ]
        : []),
      ...(tomadorParsed.variantIssue ? [['Tomador (variante não reconhecida no XML — confira)', '']] : []),
      ...(intermParsed.variantIssue
        ? [['Intermediário (variante não reconhecida no XML — confira)', '']]
        : []),
      ...(profile.page1.ibscbs === '1'
        ? [['IBS/CBS (a nota usa "Sim" — o bloco IBS/CBS seguirá manual)', '']]
        : []),
      ['Valor em moeda estrangeira', profile.valor.usd],
    ];
    const missing = required.filter(([, v]) => !v).map(([k]) => k);

    return { profile, emitente: { cnpj, nome: label }, chave, missing };
  };
})();
