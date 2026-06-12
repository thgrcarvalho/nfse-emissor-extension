// MAIN world. Pre-flight check that the wizard page AND the profile match a nota
// shape this extension supports. Anything else must abort the page loudly BEFORE
// any field is touched — a partial fill of an unsupported variant is worse than no
// fill. Exposes window.__nfseShapeGuard.
(function () {
  const get = (cfg, path) => path.reduce((o, k) => (o == null ? o : o[k]), cfg);

  // Per page: `common` always applies; each dimension reads one profile discriminant
  // and selects a variant (profile paths the plan dereferences + signature controls
  // of that variant). A discriminant value with no variant entry is refused — fail
  // closed, never guess.
  // Signature controls only use elements the page renders up front: radios with a
  // specific value= attribute exist even while hidden/disabled (probed against the
  // portal), AJAX-revealed inputs don't qualify — so a healthy page can't fail the
  // guard, and a page missing the variant's radio can't be half-filled.
  const SHAPE = {
    pessoas: {
      common: {
        cfg: [['page1', 'regime_sn']],
        controls: [
          ['#DataCompetencia', 'campo de competência'],
          ['#SimplesNacional_RegimeApuracaoTributosSN', 'regime do Simples Nacional'],
        ],
      },
      dimensions: [
        {
          label: 'domicílio do tomador',
          path: ['tomador', 'local'],
          variants: {
            nao_informado: {
              cfg: [],
              controls: [
                ['input[name="Tomador.LocalDomicilio"][value="0"]', 'opção de tomador não informado'],
              ],
            },
            brasil: {
              cfg: [
                ['tomador', 'inscricao'],
                ['tomador', 'nome'],
              ],
              controls: [['input[name="Tomador.LocalDomicilio"][value="1"]', 'opção de tomador no Brasil']],
            },
            exterior: {
              cfg: [
                ['tomador', 'nome'],
                ['tomador', 'endereco_exterior'],
              ],
              controls: [['input[name="Tomador.LocalDomicilio"][value="2"]', 'opção de tomador no exterior']],
            },
          },
        },
        {
          label: 'NIF do tomador',
          // The portal clears the NIF choice when the tomador moves to Brasil
          // (probed) — the NIF group belongs to the exterior branch only.
          applies: (cfg) => get(cfg, ['tomador', 'local']) === 'exterior',
          path: ['tomador', 'nif', 'informado'],
          variants: {
            0: {
              cfg: [['page1', 'tomador_motivo_nif']],
              controls: [['input[name="Tomador.NIFInformado"][value="0"]', 'opção de NIF não informado']],
            },
            1: {
              cfg: [['tomador', 'nif', 'valor']],
              controls: [['input[name="Tomador.NIFInformado"][value="1"]', 'opção de NIF informado']],
            },
          },
        },
      ],
    },
    servico: {
      common: {
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
          ['#ComercioExterior_TipoMoeda', 'campos do comércio exterior (moeda)'],
        ],
      },
      dimensions: [
        // O plano sempre marca exportação=Sim e escolhe o motivo no select — um perfil
        // de ISS devido (motivo fora de 2/3/4, ex.: nota tributável) precisa ser
        // recusado ANTES de qualquer campo, não falhar no meio da página.
        {
          label: 'tributação do ISSQN (motivo)',
          path: ['servico', 'motivo_nao_tributacao'],
          variants: {
            2: { cfg: [], controls: [] }, // Imunidade
            3: { cfg: [], controls: [] }, // Exportação de serviço
            4: { cfg: [], controls: [] }, // Não incidência
          },
        },
      ],
    },
    valores: {
      common: {
        cfg: [
          ['tributacao', 'pis_situacao'],
          ['tributacao', 'pis_retencao'],
          ['tributacao', 'valor_tributos_tipo'],
        ],
        controls: [
          ['#Valores_ValorServico', 'valor do serviço'],
          ['#TributacaoFederal_PISCofins_SituacaoTributaria', 'tributação federal (PIS/COFINS)'],
        ],
      },
      dimensions: [
        // A página 3 do ISS devido é renderizada pelo servidor num formato nunca
        // mapeado — recusar o perfil aqui também, não só na página 2.
        {
          label: 'tributação do ISSQN (motivo)',
          path: ['servico', 'motivo_nao_tributacao'],
          variants: {
            2: { cfg: [], controls: [] },
            3: { cfg: [], controls: [] },
            4: { cfg: [], controls: [] },
          },
        },
        {
          label: 'tipo do valor dos tributos',
          path: ['tributacao', 'valor_tributos_tipo'],
          variants: {
            1: {
              cfg: [
                ['tributacao', 'tributos', 'federal'],
                ['tributacao', 'tributos', 'estadual'],
                ['tributacao', 'tributos', 'municipal'],
              ],
              controls: [
                [
                  'input[name="ValorTributos.TipoValorTributos"][value="1"]',
                  'opção de informar o valor dos tributos',
                ],
              ],
            },
            2: {
              cfg: [
                ['tributacao', 'tributos', 'federal'],
                ['tributacao', 'tributos', 'estadual'],
                ['tributacao', 'tributos', 'municipal'],
              ],
              controls: [
                [
                  'input[name="ValorTributos.TipoValorTributos"][value="2"]',
                  'opção de informar o percentual dos tributos',
                ],
              ],
            },
            3: {
              cfg: [],
              controls: [
                [
                  'input[name="ValorTributos.TipoValorTributos"][value="3"]',
                  'opção de não informar os tributos',
                ],
              ],
            },
            4: {
              cfg: [['tributacao', 'aliquota_sn']],
              controls: [
                [
                  'input[name="ValorTributos.TipoValorTributos"][value="4"]',
                  'opção de informar a alíquota do Simples Nacional',
                ],
              ],
            },
          },
        },
      ],
    },
  };

  // Returns a list of problems; empty list = supported shape, go fill.
  window.__nfseShapeGuard = function (pageId, cfg) {
    const shape = SHAPE[pageId];
    if (!shape) return ['página desconhecida: ' + pageId];
    const problems = [];
    const check = (block) => {
      for (const path of block.cfg) {
        // Structure only: '' is a legitimate value (onboarding warns about unread
        // fields and fills them empty); a missing key means another profile shape.
        if (get(cfg, path) == null) problems.push('perfil sem o campo ' + path.join('.'));
      }
      for (const [sel, label] of block.controls) {
        if (!document.querySelector(sel)) problems.push('a página não tem ' + label);
      }
    };
    check(shape.common);
    for (const dim of shape.dimensions) {
      if (dim.applies && !dim.applies(cfg)) continue;
      const value = get(cfg, dim.path);
      if (value == null) {
        problems.push('perfil sem o campo ' + dim.path.join('.'));
        continue;
      }
      // hasOwnProperty: um discriminante corrompido ("constructor") não pode resolver
      // para um membro herdado de Object.prototype — recusa limpa, nunca TypeError.
      const key = String(value);
      const variant = Object.prototype.hasOwnProperty.call(dim.variants, key) ? dim.variants[key] : null;
      if (!variant) {
        problems.push(dim.label + ' "' + key + '" não é suportado');
        continue;
      }
      check(variant);
    }
    return problems;
  };
})();
