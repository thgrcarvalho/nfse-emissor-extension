// MAIN world. Pre-flight check that the wizard page AND the profile match the one
// nota shape this extension supports: exportação de serviço, ISS não incidente,
// emitente no Simples Nacional, tomador no exterior. Anything else must abort the
// page loudly BEFORE any field is touched — a partial fill of an unsupported
// variant is worse than no fill. Exposes window.__nfseShapeGuard.
(function () {
  // Per page: profile paths the plan dereferences, and signature controls of the
  // supported variant. Signatures only use controls the page renders up front
  // (never the AJAX-revealed sections), so a healthy page can't fail the guard.
  const SHAPE = {
    pessoas: {
      cfg: [
        ['page1', 'regime_sn'],
        ['page1', 'tomador_motivo_nif'],
        ['tomador', 'nome'],
        ['tomador', 'endereco_exterior'],
      ],
      controls: [
        ['#DataCompetencia', 'campo de competência'],
        ['#SimplesNacional_RegimeApuracaoTributosSN', 'regime do Simples Nacional'],
        ['input[name="Tomador.LocalDomicilio"][value="2"]', 'opção de tomador no exterior'],
        ['input[name="Tomador.NIFInformado"][value="0"]', 'opção de NIF não informado'],
      ],
    },
    servico: {
      cfg: [
        ['servico', 'municipio'],
        ['servico', 'ctn'],
        ['servico', 'complementar'],
        ['servico', 'nbs'],
        ['servico', 'comercio_exterior'],
      ],
      controls: [
        ['#LocalPrestacao_CodigoPaisPrestacao', 'país da prestação'],
        ['#LocalPrestacao_CodigoMunicipioPrestacao', 'município da prestação'],
        [
          'input[name="ServicoPrestado.HaExportacaoImunidadeNaoIncidencia"][value="1"]',
          'opção de exportação/não incidência',
        ],
      ],
    },
    valores: {
      cfg: [
        ['tributacao', 'pis_situacao'],
        ['tributacao', 'pis_retencao'],
        ['tributacao', 'valor_tributos_tipo'],
        ['tributacao', 'aliquota_sn'],
      ],
      controls: [
        ['#Valores_ValorServico', 'valor do serviço'],
        ['#TributacaoFederal_PISCofins_SituacaoTributaria', 'tributação federal (PIS/COFINS)'],
        [
          'input[name="ValorTributos.TipoValorTributos"][value="4"]',
          'opção de informar a alíquota do Simples Nacional',
        ],
      ],
    },
  };

  // Returns a list of problems; empty list = supported shape, go fill.
  window.__nfseShapeGuard = function (pageId, cfg) {
    const shape = SHAPE[pageId];
    if (!shape) return ['página desconhecida: ' + pageId];
    const problems = [];
    for (const path of shape.cfg) {
      let v = cfg;
      for (const k of path) v = v == null ? v : v[k];
      // Structure only: '' is a legitimate value (onboarding warns about unread fields
      // and fills them empty); a missing key means the profile isn't this shape.
      if (v == null) problems.push('perfil sem o campo ' + path.join('.'));
    }
    for (const [sel, label] of shape.controls) {
      if (!document.querySelector(sel)) problems.push('a página não tem ' + label);
    }
    // The plan writes the alíquota do SN; any other tipo would land the value in a
    // control the portal is not showing. Declared limit — see CODE-REVIEW.md, known limits.
    const tipo = cfg && cfg.tributacao && cfg.tributacao.valor_tributos_tipo;
    if (pageId === 'valores' && tipo != null && String(tipo) !== '4') {
      problems.push('perfil com tipo do valor dos tributos ≠ alíquota do SN (não suportado)');
    }
    return problems;
  };
})();
