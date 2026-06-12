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
      const tom = cfg.tomador;
      const ops = [
        { t: 'text', sel: '#DataCompetencia', value: state.competencia, label: 'Data de competência' },
        {
          t: 'chosen',
          sel: '#SimplesNacional_RegimeApuracaoTributosSN',
          value: cfg.page1.regime_sn,
          label: 'Regime do Simples Nacional',
        },
      ];

      if (tom.local === 'nao_informado') {
        ops.push({
          t: 'radio',
          name: 'Tomador.LocalDomicilio',
          value: '0',
          label: 'Domicílio do tomador (Não informado)',
        });
        return ops; // no tomador section at all — the radio is the whole branch
      }

      if (tom.local === 'brasil') {
        ops.push(
          {
            t: 'radio',
            name: 'Tomador.LocalDomicilio',
            value: '1',
            waitAfter: 400,
            label: 'Domicílio do tomador (Brasil)',
          },
          // Inscrição settles first: the portal consults o cadastro (RFB) and can
          // auto-preencher o nome. O endereço vem desse cadastro — nunca tocamos em
          // #Tomador_InformarEndereco.
          {
            t: 'text',
            sel: '#Tomador_Inscricao',
            value: tom.inscricao,
            waitAfter: 600,
            label: 'CPF/CNPJ do tomador',
          },
        );
        if (tom.inscricao_municipal) {
          ops.push({
            t: 'text',
            sel: '#Tomador_InscricaoMunicipal',
            value: tom.inscricao_municipal,
            label: 'Inscrição municipal do tomador',
          });
        }
        ops.push({ t: 'text', sel: '#Tomador_Nome', value: tom.nome, label: 'Nome do tomador' });
      }

      if (tom.local === 'exterior') {
        const e = tom.endereco_exterior;
        const nifInformado = String((tom.nif && tom.nif.informado) || '0') === '1';
        ops.push(
          {
            t: 'radio',
            name: 'Tomador.LocalDomicilio',
            value: '2',
            label: 'Domicílio do tomador (Exterior)',
          },
          // O portal limpa a escolha de NIF quando o domicílio muda (probed) — o
          // grupo NIF é definido logo após o domicílio, antes do campo dependente.
          ...(nifInformado
            ? [
                {
                  t: 'radio',
                  name: 'Tomador.NIFInformado',
                  value: '1',
                  waitAfter: 300,
                  label: 'NIF informado (Sim)',
                },
                { t: 'text', sel: '#Tomador_NIF', value: tom.nif.valor, label: 'NIF do tomador' },
              ]
            : [
                {
                  t: 'radio',
                  name: 'Tomador.NIFInformado',
                  value: '0',
                  waitAfter: 300,
                  label: 'NIF informado (Não)',
                },
                {
                  t: 'chosen',
                  sel: '#Tomador_MotivoNaoInformacaoNIF',
                  value: cfg.page1.tomador_motivo_nif,
                  label: 'Motivo de não informar o NIF',
                },
              ]),
          { t: 'text', sel: '#Tomador_Nome', value: tom.nome, label: 'Nome do tomador' },
          {
            t: 'text',
            sel: '#Tomador_EnderecoExterior_Logradouro',
            value: e.logradouro,
            label: 'Logradouro (tomador)',
          },
          { t: 'text', sel: '#Tomador_EnderecoExterior_Numero', value: e.numero, label: 'Número (tomador)' },
          { t: 'text', sel: '#Tomador_EnderecoExterior_Bairro', value: e.bairro, label: 'Bairro (tomador)' },
          { t: 'text', sel: '#Tomador_EnderecoExterior_Cidade', value: e.cidade, label: 'Cidade (tomador)' },
          {
            t: 'text',
            sel: '#Tomador_EnderecoExterior_CodigoEnderecamentoPostal',
            value: e.cep,
            label: 'Endereço postal (tomador)',
          },
          {
            t: 'text',
            sel: '#Tomador_EnderecoExterior_EstadoProvinciaRegiao',
            value: e.estado,
            label: 'Estado/região (tomador)',
          },
          {
            t: 'chosen',
            sel: '#Tomador_EnderecoExterior_CodigoPais',
            value: e.pais_codigo,
            label: 'País (tomador)',
          },
        );
        if (e.complemento) {
          ops.push({
            t: 'text',
            sel: '#Tomador_EnderecoExterior_Complemento',
            value: e.complemento,
            label: 'Complemento (tomador)',
          });
        }
      }

      // Contato (Brasil e exterior): campos opcionais do portal — só entram com valor.
      if (tom.telefone) {
        ops.push({ t: 'text', sel: '#Tomador_Telefone', value: tom.telefone, label: 'Telefone do tomador' });
      }
      if (tom.email) {
        ops.push({ t: 'text', sel: '#Tomador_Email', value: tom.email, label: 'E-mail do tomador' });
      }
      return ops;
    }

    if (pageId === 'servico') {
      const s = cfg.servico;
      const ce = s.comercio_exterior;
      return [
        { t: 'chosen', sel: '#LocalPrestacao_CodigoPaisPrestacao', value: 'BR', label: 'País da prestação' },
        // município → enables CTN → populates Complementar: let each cascade settle.
        {
          t: 'select2',
          sel: '#LocalPrestacao_CodigoMunicipioPrestacao',
          value: s.municipio.value,
          text: s.municipio.text,
          waitAfter: 900,
          label: 'Município da prestação',
        },
        {
          t: 'select2',
          sel: '#ServicoPrestado_CodigoTributacaoNacional',
          value: s.ctn.value,
          text: s.ctn.text,
          waitAfter: 900,
          label: 'Código de Tributação Nacional',
        },
        {
          t: 'chosen',
          sel: '#ServicoPrestado_CodigoComplementarMunicipal',
          value: s.complementar.value,
          text: s.complementar.text,
          label: 'Código complementar municipal',
        },
        {
          t: 'radio',
          name: 'ServicoPrestado.HaExportacaoImunidadeNaoIncidencia',
          value: '1',
          waitAfter: 400,
          label: 'Exportação/imunidade (Sim)',
        },
        {
          t: 'chosen',
          sel: '#ServicoPrestado_MotivoNaoTributacao',
          value: s.motivo_nao_tributacao,
          label: 'Motivo da não tributação',
        },
        {
          t: 'chosen',
          sel: '#ServicoPrestado_CodigoPaisResultado',
          value: s.pais_resultado,
          label: 'País do resultado',
        },
        { t: 'text', sel: '#ServicoPrestado_Descricao', value: s.descricao, label: 'Descrição do serviço' },
        {
          t: 'chosen',
          sel: '#ServicoPrestado_CodigoNBS',
          value: s.nbs.value,
          text: s.nbs.text,
          label: 'Item da NBS',
        },
        { t: 'chosen', sel: '#ComercioExterior_ModoPrestacao', value: ce.modo, label: 'Modo de prestação' },
        {
          t: 'chosen',
          sel: '#ComercioExterior_VinculoPrestacao',
          value: ce.vinculo,
          label: 'Vínculo entre as partes',
        },
        { t: 'text', sel: '#ComercioExterior_TipoMoeda', value: ce.moeda, label: 'Moeda' },
        {
          t: 'money',
          sel: '#ComercioExterior_ValorServicoMoedaEstrangeira',
          value: brl(state.usd),
          label: 'Valor em moeda estrangeira',
        },
        {
          t: 'chosen',
          sel: '#ComercioExterior_MecanismoApoioPrestador',
          value: ce.mec_prest,
          label: 'Mecanismo de apoio (prestador)',
        },
        {
          t: 'chosen',
          sel: '#ComercioExterior_MecanismoApoioTomador',
          value: ce.mec_tom,
          label: 'Mecanismo de apoio (tomador)',
        },
        {
          t: 'chosen',
          sel: '#ComercioExterior_MovimentacaoTempBens',
          value: ce.mov_bens,
          label: 'Movimentação temporária de bens',
        },
        {
          t: 'radio',
          name: 'ComercioExterior.CompartilharComMDIC',
          value: ce.mdic,
          label: 'Compartilhar com MDIC',
        },
      ];
    }

    if (pageId === 'valores') {
      const t = cfg.tributacao;
      return [
        {
          t: 'money',
          sel: '#Valores_ValorServico',
          value: brl(state.valorBRL),
          label: 'Valor do serviço (R$)',
        },
        {
          t: 'chosen',
          sel: '#TributacaoFederal_PISCofins_SituacaoTributaria',
          value: t.pis_situacao,
          label: 'Situação tributária PIS/COFINS',
        },
        {
          t: 'chosen',
          sel: '#TributacaoFederal_PISCofins_TipoRetencao',
          value: t.pis_retencao,
          label: 'Retenção PIS/COFINS',
        },
        {
          t: 'radio',
          name: 'ValorTributos.TipoValorTributos',
          value: t.valor_tributos_tipo,
          label: 'Tipo do valor dos tributos',
        },
        {
          t: 'money',
          sel: '#ValorTributos_AliquotaSN',
          value: t.aliquota_sn,
          label: 'Alíquota do Simples Nacional',
        },
      ];
    }

    return [];
  };
})();
