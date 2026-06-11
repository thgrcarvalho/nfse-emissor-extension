// MAIN world. Builds the ordered list of field operations for one wizard page
// from a client config + per-run state. Pure data → ops; no DOM, no extension API
// (so it is reusable by the Playwright validation harness). Exposes __nfseFillPlan.
//
// Field ids, widget types (chosen vs select2) and cascade order were reverse-engineered
// from the portal's wizard pages.
(function () {
  const brl = (n) =>
    Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  window.__nfseFillPlan = function (pageId, cfg, state) {
    if (pageId === 'pessoas') {
      const e = cfg.tomador.endereco_exterior;
      const ops = [
        { t: 'text', sel: '#DataCompetencia', value: state.competencia },
        { t: 'chosen', sel: '#SimplesNacional_RegimeApuracaoTributosSN', value: cfg.page1.regime_sn },
        { t: 'radio', name: 'Tomador.LocalDomicilio', value: '2' }, // Exterior
        { t: 'radio', name: 'Tomador.NIFInformado', value: '0' }, // Não
        { t: 'chosen', sel: '#Tomador_MotivoNaoInformacaoNIF', value: cfg.page1.tomador_motivo_nif },
        { t: 'text', sel: '#Tomador_Nome', value: cfg.tomador.nome },
        { t: 'text', sel: '#Tomador_EnderecoExterior_Logradouro', value: e.logradouro },
        { t: 'text', sel: '#Tomador_EnderecoExterior_Numero', value: e.numero },
        { t: 'text', sel: '#Tomador_EnderecoExterior_Bairro', value: e.bairro },
        { t: 'text', sel: '#Tomador_EnderecoExterior_Cidade', value: e.cidade },
        { t: 'text', sel: '#Tomador_EnderecoExterior_CodigoEnderecamentoPostal', value: e.cep },
        { t: 'text', sel: '#Tomador_EnderecoExterior_EstadoProvinciaRegiao', value: e.estado },
        { t: 'chosen', sel: '#Tomador_EnderecoExterior_CodigoPais', value: e.pais_codigo },
      ];
      if (e.complemento) {
        ops.push({ t: 'text', sel: '#Tomador_EnderecoExterior_Complemento', value: e.complemento });
      }
      return ops;
    }

    if (pageId === 'servico') {
      const s = cfg.servico;
      const ce = s.comercio_exterior;
      return [
        { t: 'chosen', sel: '#LocalPrestacao_CodigoPaisPrestacao', value: 'BR' },
        // município → enables CTN → populates Complementar: let each cascade settle.
        { t: 'select2', sel: '#LocalPrestacao_CodigoMunicipioPrestacao', value: s.municipio.value, text: s.municipio.text, waitAfter: 900 },
        { t: 'select2', sel: '#ServicoPrestado_CodigoTributacaoNacional', value: s.ctn.value, text: s.ctn.text, waitAfter: 900 },
        { t: 'chosen', sel: '#ServicoPrestado_CodigoComplementarMunicipal', value: s.complementar.value, text: s.complementar.text },
        { t: 'radio', name: 'ServicoPrestado.HaExportacaoImunidadeNaoIncidencia', value: '1', waitAfter: 400 },
        { t: 'chosen', sel: '#ServicoPrestado_MotivoNaoTributacao', value: s.motivo_nao_tributacao },
        { t: 'chosen', sel: '#ServicoPrestado_CodigoPaisResultado', value: s.pais_resultado },
        { t: 'text', sel: '#ServicoPrestado_Descricao', value: s.descricao },
        { t: 'chosen', sel: '#ServicoPrestado_CodigoNBS', value: s.nbs.value, text: s.nbs.text },
        { t: 'chosen', sel: '#ComercioExterior_ModoPrestacao', value: ce.modo },
        { t: 'chosen', sel: '#ComercioExterior_VinculoPrestacao', value: ce.vinculo },
        { t: 'text', sel: '#ComercioExterior_TipoMoeda', value: ce.moeda },
        { t: 'money', sel: '#ComercioExterior_ValorServicoMoedaEstrangeira', value: brl(state.usd) },
        { t: 'chosen', sel: '#ComercioExterior_MecanismoApoioPrestador', value: ce.mec_prest },
        { t: 'chosen', sel: '#ComercioExterior_MecanismoApoioTomador', value: ce.mec_tom },
        { t: 'chosen', sel: '#ComercioExterior_MovimentacaoTempBens', value: ce.mov_bens },
        { t: 'radio', name: 'ComercioExterior.CompartilharComMDIC', value: ce.mdic },
      ];
    }

    if (pageId === 'valores') {
      const t = cfg.tributacao;
      return [
        { t: 'money', sel: '#Valores_ValorServico', value: brl(state.valorBRL) },
        { t: 'chosen', sel: '#TributacaoFederal_PISCofins_SituacaoTributaria', value: t.pis_situacao },
        { t: 'chosen', sel: '#TributacaoFederal_PISCofins_TipoRetencao', value: t.pis_retencao },
        { t: 'radio', name: 'ValorTributos.TipoValorTributos', value: t.valor_tributos_tipo },
        { t: 'money', sel: '#ValorTributos_AliquotaSN', value: t.aliquota_sn },
      ];
    }

    return [];
  };
})();
