// MAIN world. Builds the ordered list of field operations for one wizard page
// from a client config + per-run state. Pure data → ops; no DOM, no extension API
// (so it is reusable by the Playwright validation harness). Exposes __nfseFillPlan.
//
// Field ids, widget types (chosen vs select2) and cascade order were reverse-engineered
// from the portal's wizard pages.
(function () {
  const brl = (n) =>
    Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Intermediário (opcional): espelha o tomador com os ids Intermediario_*. Sempre
  // entra DEPOIS do tomador/contato — a seção do intermediário fica abaixo na página.
  // 'nao_informado' é só o rádio value=0 (estado padrão da página); Brasil consulta o
  // cadastro e auto-preenche nome/endereço (nunca tocamos InformarEndereco, como no
  // tomador); exterior tem o grupo NIF e o endereço estrangeiro.
  function pushIntermediario(ops, cfg) {
    const itm = cfg.intermediario;
    if (!itm || itm.local === 'nao_informado') {
      ops.push({
        t: 'radio',
        name: 'Intermediario.LocalDomicilio',
        value: '0',
        label: 'Domicílio do intermediário (Não informado)',
      });
      return;
    }

    if (itm.local === 'brasil') {
      ops.push(
        {
          t: 'radio',
          name: 'Intermediario.LocalDomicilio',
          value: '1',
          waitAfter: 400,
          label: 'Domicílio do intermediário (Brasil)',
        },
        {
          t: 'text',
          sel: '#Intermediario_Inscricao',
          value: itm.inscricao,
          digits: true,
          settleMin: 600, // consulta ao cadastro, sem sinal observável no DOM (igual ao tomador)
          label: 'CPF/CNPJ do intermediário',
        },
      );
      if (itm.inscricao_municipal) {
        ops.push({
          t: 'text',
          sel: '#Intermediario_InscricaoMunicipal',
          value: itm.inscricao_municipal,
          label: 'Inscrição municipal do intermediário',
        });
      }
      ops.push({ t: 'text', sel: '#Intermediario_Nome', value: itm.nome, label: 'Nome do intermediário' });
    }

    if (itm.local === 'exterior') {
      const e = itm.endereco_exterior;
      const nifInformado = String((itm.nif && itm.nif.informado) || '0') === '1';
      ops.push(
        {
          t: 'radio',
          name: 'Intermediario.LocalDomicilio',
          value: '2',
          label: 'Domicílio do intermediário (Exterior)',
        },
        ...(nifInformado
          ? [
              {
                t: 'radio',
                name: 'Intermediario.NIFInformado',
                value: '1',
                waitAfter: 300,
                label: 'NIF do intermediário informado (Sim)',
              },
              { t: 'text', sel: '#Intermediario_NIF', value: itm.nif.valor, label: 'NIF do intermediário' },
            ]
          : [
              {
                t: 'radio',
                name: 'Intermediario.NIFInformado',
                value: '0',
                waitAfter: 300,
                label: 'NIF do intermediário informado (Não)',
              },
              {
                t: 'chosen',
                sel: '#Intermediario_MotivoNaoInformacaoNIF',
                value: cfg.page1.intermediario_motivo_nif,
                label: 'Motivo de não informar o NIF do intermediário',
              },
            ]),
        { t: 'text', sel: '#Intermediario_Nome', value: itm.nome, label: 'Nome do intermediário' },
        {
          t: 'text',
          sel: '#Intermediario_EnderecoExterior_Logradouro',
          value: e.logradouro,
          label: 'Logradouro (intermediário)',
        },
        {
          t: 'text',
          sel: '#Intermediario_EnderecoExterior_Numero',
          value: e.numero,
          label: 'Número (intermediário)',
        },
        {
          t: 'text',
          sel: '#Intermediario_EnderecoExterior_Bairro',
          value: e.bairro,
          label: 'Bairro (intermediário)',
        },
        {
          t: 'text',
          sel: '#Intermediario_EnderecoExterior_Cidade',
          value: e.cidade,
          label: 'Cidade (intermediário)',
        },
        {
          t: 'text',
          sel: '#Intermediario_EnderecoExterior_CodigoEnderecamentoPostal',
          value: e.cep,
          label: 'Endereço postal (intermediário)',
        },
        {
          t: 'text',
          sel: '#Intermediario_EnderecoExterior_EstadoProvinciaRegiao',
          value: e.estado,
          label: 'Estado/região (intermediário)',
        },
        {
          // value: bundled config carries the ISO code ('US'); a nota-extracted profile
          // carries the país name read from the address ('Estados Unidos da América').
          // O resolvedor mapeia qualquer um contra a lista de países do próprio portal.
          t: 'resolve',
          sel: '#Intermediario_EnderecoExterior_CodigoPais',
          value: e.pais_codigo || e.pais_nome,
          label: 'País (intermediário)',
        },
      );
      if (e.complemento) {
        ops.push({
          t: 'text',
          sel: '#Intermediario_EnderecoExterior_Complemento',
          value: e.complemento,
          label: 'Complemento (intermediário)',
        });
      }
    }

    // Contato do intermediário (Brasil e exterior): opcionais — só entram com valor.
    if (itm.telefone) {
      ops.push({
        t: 'text',
        sel: '#Intermediario_Telefone',
        value: itm.telefone,
        digits: true, // o portal aplica máscara de telefone
        label: 'Telefone do intermediário',
      });
    }
    if (itm.email) {
      ops.push({
        t: 'text',
        sel: '#Intermediario_Email',
        value: itm.email,
        label: 'E-mail do intermediário',
      });
    }
  }

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
        // só o rádio — não há seção do tomador; o fluxo segue para o intermediário.
        ops.push({
          t: 'radio',
          name: 'Tomador.LocalDomicilio',
          value: '0',
          label: 'Domicílio do tomador (Não informado)',
        });
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
            digits: true, // campo mascarado: vale o dígito, não a pontuação
            // settleMin (não waitAfter): a consulta ao cadastro não tem sinal
            // observável no DOM — o poll do waitAfter sairia na hora.
            settleMin: 600,
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
            // value: ISO code (bundled) ou nome do país lido do endereço (perfil da nota).
            t: 'resolve',
            sel: '#Tomador_EnderecoExterior_CodigoPais',
            value: e.pais_codigo || e.pais_nome,
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

      // Contato do tomador (Brasil e exterior): campos opcionais — NUNCA para 'não
      // informado', que não tem seção de tomador (a guarda não declara esses controles;
      // escrevê-los acertaria um campo oculto/ausente da nota sem tomador).
      if (tom.local !== 'nao_informado') {
        if (tom.telefone) {
          ops.push({
            t: 'text',
            sel: '#Tomador_Telefone',
            value: tom.telefone,
            digits: true, // o portal aplica máscara de telefone ao que for digitado
            label: 'Telefone do tomador',
          });
        }
        if (tom.email) {
          ops.push({ t: 'text', sel: '#Tomador_Email', value: tom.email, label: 'E-mail do tomador' });
        }
      }

      pushIntermediario(ops, cfg);
      return ops;
    }

    if (pageId === 'servico') {
      const s = cfg.servico;
      const ce = s.comercio_exterior;
      if (String(s.motivo_nao_tributacao) !== '3') {
        // Defesa em profundidade (a guarda já recusa): imunidade exige o TipoImunidade
        // (não preenchido) e não-incidência depende do CTN (modal bloqueante do
        // portal) — só a exportação é construível.
        throw new Error('motivo da não tributação não suportado: ' + s.motivo_nao_tributacao);
      }
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
        // Código complementar municipal só existe nos municípios que desdobram o item
        // da LC 116 em subitens. Quando o município não usa, o perfil vem sem valor —
        // omitir a op: preenchê-la vazia dispararia um falso "campo com problema" e o
        // próprio portal valida (ou dispensa) o campo no Avançar.
        ...(String(s.complementar.value || '').trim()
          ? [
              {
                t: 'chosen',
                sel: '#ServicoPrestado_CodigoComplementarMunicipal',
                value: s.complementar.value,
                text: s.complementar.text,
                label: 'Código complementar municipal',
              },
            ]
          : []),
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
          t: 'resolve',
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
        { t: 'resolve', sel: '#ComercioExterior_ModoPrestacao', value: ce.modo, label: 'Modo de prestação' },
        {
          t: 'resolve',
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
          t: 'resolve',
          sel: '#ComercioExterior_MecanismoApoioPrestador',
          value: ce.mec_prest,
          label: 'Mecanismo de apoio (prestador)',
        },
        {
          t: 'resolve',
          sel: '#ComercioExterior_MecanismoApoioTomador',
          value: ce.mec_tom,
          label: 'Mecanismo de apoio (tomador)',
        },
        {
          t: 'resolve',
          sel: '#ComercioExterior_MovimentacaoTempBens',
          value: ce.mov_bens,
          label: 'Movimentação temporária de bens',
        },
        {
          t: 'resolveRadio',
          name: 'ComercioExterior.CompartilharComMDIC',
          value: ce.mdic,
          label: 'Compartilhar com MDIC',
        },
      ];
    }

    if (pageId === 'valores') {
      const t = cfg.tributacao;
      const tipo = String(t.valor_tributos_tipo);
      if (tipo !== '1' && tipo !== '2' && tipo !== '4') {
        // Defesa em profundidade (a guarda já recusa): nunca construir o rascunho que
        // o portal rejeita na emissão de ME/EPP (tipo 3) nem um tipo desconhecido.
        throw new Error('tipo do valor dos tributos não suportado: ' + tipo);
      }
      const ops = [
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
          value: tipo,
          waitAfter: 400,
          label: 'Tipo do valor dos tributos',
        },
      ];
      if (tipo === '1' || tipo === '2') {
        // Total dos tributos por ente: tipo 1 informa valores (R$), tipo 2 percentuais.
        const tr = t.tributos || {};
        const base = tipo === '1' ? '#ValorTributos_ValorTotal' : '#ValorTributos_PercentualTotal';
        const word = tipo === '1' ? 'Valor' : 'Percentual';
        ops.push(
          {
            t: 'money',
            sel: base + 'Federal',
            value: tr.federal,
            label: word + ' total dos tributos federais',
          },
          {
            t: 'money',
            sel: base + 'Estadual',
            value: tr.estadual,
            label: word + ' total dos tributos estaduais',
          },
          {
            t: 'money',
            sel: base + 'Municipal',
            value: tr.municipal,
            label: word + ' total dos tributos municipais',
          },
        );
      } else if (tipo === '4') {
        ops.push({
          t: 'money',
          sel: '#ValorTributos_AliquotaSN',
          value: t.aliquota_sn,
          label: 'Alíquota do Simples Nacional',
        });
      }
      return ops;
    }

    return [];
  };
})();
