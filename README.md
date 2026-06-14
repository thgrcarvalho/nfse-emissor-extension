# NFS-e Nacional — Preenchimento automático

[![CI](https://github.com/thgrcarvalho/nfse-emissor-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/thgrcarvalho/nfse-emissor-extension/actions/workflows/ci.yml)

Extensão de navegador (Manifest V3) que **preenche o rascunho da NFS-e** no
[Emissor Nacional](https://www.nfse.gov.br/EmissorNacional) para **exportação de
serviços** — ME/EPP no Simples Nacional, ISS não incidente (LC 116/2003, art. 2º, I).
A extensão preenche o assistente; **você revisa e clica em Emitir.**

Feita para quem emite a mesma nota todo mês — o dev/consultor que exporta serviço, ou
o contador que emite para vários clientes desse perfil — e não aguenta mais digitar as
3 páginas e ~35 campos do assistente.

Como roda dentro do **seu navegador, já logado**, não esbarra nas defesas do portal
(WAF, captcha) que derrubariam uma automação externa. E não pede senha nenhuma.

## O que ela faz

- **Painel lateral** (abre pelo ícone na barra) que fica aberto durante toda a emissão.
- Mostra **quem está logado** (razão social + CNPJ) e só funciona no Emissor Nacional.
- **Perfis por cliente**, identificados pelo CNPJ — o painel seleciona sozinho o perfil
  do cliente logado e **nunca preenche dados de outro cliente**; se o CNPJ não puder ser
  lido, o preenchimento é bloqueado.
- **Cadastro a partir de uma nota já emitida**: abra qualquer nota do cliente no portal
  e escolha **Usar nesta emissão** (só desta vez) ou **Salvar como padrão deste cliente**
  (fica salvo no navegador). Campos que não puderem ser lidos ficam vazios e o painel
  avisa quais foram.
- **Câmbio automático**: busca a PTAX de fechamento do Banco Central para a data de
  competência escolhida (com aviso quando usa o fechamento de um dia anterior —
  fim de semana/feriado).
- **Gerenciador de clientes salvos** no painel (tela inicial): veja todos os perfis e
  exclua os dados de ex-clientes quando não precisar mais deles.
- Preenche as três páginas do assistente (Pessoas → Serviço → Valores) sob demanda;
  **para na tela de revisão — nunca emite sozinha.**

## Escopo suportado

A extensão preenche a nota de **exportação de serviço** (ISS não incidente,
LC 116/2003, art. 2º, I) de emitente ME/EPP no **Simples Nacional**, nas variantes
do assistente abaixo — todas validadas de ponta a ponta na **Produção Restrita**
(ambiente de homologação do portal): cada página aceita pelo servidor, notas de
teste **emitidas de verdade** e relidas pelo próprio painel:

- Tomador **no exterior** (com endereço), **no Brasil** (CPF/CNPJ — o portal busca o
  cadastro e completa nome e endereço sozinho) ou **não informado**;
- **NIF** informado ou não informado (tomador no exterior);
- Telefone e e-mail do tomador (opcionais);
- Total dos tributos por **alíquota do Simples Nacional**, por **valores por ente**
  ou por **percentuais por ente** ("não informar" não existe para ME/EPP — o portal
  recusa a emissão);
- Valor do serviço em **US$**, convertido pela PTAX do Banco Central.

Os campos de variante do perfil são criados automaticamente ao carregar de uma nota
emitida; perfis salvos por versões anteriores continuam valendo (migração
automática, sem ação do usuário). Exceções: perfis com tributos **por ente**
(valores ou percentuais) só podem ser criados editando a configuração — a
Visualização da nota não distingue um do outro, e a extensão não adivinha; e um
perfil que por acaso traga "não informar" passa a ser recusado, porque o próprio
portal rejeita a emissão de ME/EPP com esse indicador.

Quando a página ou o perfil não casam com uma variante reconhecida, a extensão
**se recusa a preencher a página inteira** (guarda de formato: nada é preenchido
parcialmente). Variantes que apenas _acrescentem_ campos aos do formato suportado
não são detectadas pela guarda — a conferência antes de emitir continua
indispensável.

Continuam **fora do escopo** (o painel avisa e nada é preenchido): ISS devido
(serviço não exportado), **imunidade e não incidência** (somente o motivo
"exportação" é suportado), retenções de ISSQN, intermediário de serviço, obra e
evento.

**Versão do portal validada: Emissor Nacional 1.6.0.0.** O portal exibe a versão em
todas as páginas; quando ela for diferente da validada — ou não puder ser lida — o
painel mostra um aviso (inclusive antes do login): o assistente pode ter mudado e
cada campo preenchido merece conferência redobrada. A fonte canônica do valor é
`SUPPORTED_PORTAL_VERSION` em `src/popup.js`; ao revalidar a extensão contra uma
nova versão do portal, atualize lá e neste README.

## Instalação (modo desenvolvedor) — Chrome, Edge e Firefox

A mesma pasta serve para os três navegadores.

1. `cp src/config.example.json src/config.default.json` e preencha com os seus dados —
   o arquivo real fica fora do git (gitignored), então dados de cliente nunca vão para o
   repositório. (Opcional: dá para criar perfis só a partir de uma nota emitida, passo 4.)
2. Carregue a extensão:
   - **Chrome / Edge:** `chrome://extensions` (ou `edge://extensions`) → ative o
     **Modo do desenvolvedor** → **Carregar sem compactação** → selecione esta pasta.
     O ícone na barra abre o **painel lateral**.
   - **Firefox (128+):** `about:debugging#/runtime/this-firefox` → **Carregar extensão
     temporária** → escolha o `manifest.json`. O ícone alterna a **barra lateral** (mesma
     interface). Obs.: o Firefox usa `sidebar_action` no lugar do `side_panel` do Chrome,
     e o preenchimento exige Firefox 128+. Se o câmbio não buscar sozinho ou o painel
     disser que o site é errado, conceda as permissões em `about:addons` → extensão →
     Permissões. Extensões temporárias somem ao fechar o Firefox (limitação do modo
     desenvolvedor).
3. Faça login no Emissor Nacional e abra o painel.
4. **Primeira vez com um cliente:** abra uma nota já emitida dele (pelo portal) → o
   painel mostra os dados lidos → **Salvar como padrão**.
5. **Cada emissão:** inicie a **Emissão completa**; em cada página confirme competência
   e valor em US$ (o câmbio preenche sozinho), clique **Preencher página atual**, confira
   e **Avançar**. Na tela final, revise e clique **Emitir** você mesmo.

## Empacotamento (build para as lojas)

`npm run build` gera em `dist/` um pacote por navegador, cada um com um manifest
limpo (sem os avisos de chaves cruzadas que o manifest único provoca no modo
desenvolvedor):

- `dist/chrome/` + `nfse-emissor-chrome-v*.zip` — Chrome Web Store **e** Edge Add-ons
  (mesmo pacote), só com `side_panel` + `background.service_worker`.
- `dist/firefox/` + `nfse-emissor-firefox-v*.zip` — Firefox AMO, só com
  `sidebar_action` + `background.scripts` (event page).

Os pacotes embarcam o `config.example.json` saneado como `config.default.json` —
o arquivo real (gitignored) nunca entra no zip; o build aborta se divergir.

## Privacidade

Política completa em [PRIVACY.md](PRIVACY.md). Em resumo:

- A extensão **não pede, não vê e não armazena senhas** — ela atua na aba em que você
  já está logado.
- Os dados dos clientes ficam **somente no seu navegador** (`chrome.storage` local).
  Nada é enviado a terceiros; a única chamada externa é a consulta pública de câmbio
  na API do Banco Central (PTAX/Olinda).
- Os perfis podem ser recriados a qualquer momento a partir de uma nota emitida — perder
  o storage não perde nada de importante.

## Arquitetura (en)

- `src/content.js` — isolated world: detects the page + login identity + the portal's
  displayed version, parses an emitted nota into a client profile (section-scoped,
  fail-closed on unreadable CNPJ), resolves which profile a fill may use.
- `src/fill-plan.js` — builds the ordered field operations per page (field ids and
  cascade order reverse-engineered from the portal's wizard).
- `src/field-ops.js` — applies them via the page's own jQuery (Chosen/select2 aware),
  polling AJAX cascades and re-applying values a late rebuild wiped.
- `src/shape-guard.js` — pre-flight: resolves which supported variant the profile
  declares (tomador locale, NIF, tributos type) and refuses the whole page when the
  page's controls or the profile don't match it — an unknown wizard variant is never
  partially filled, and unknown discriminant values fail closed.
- `src/rate.js` — BCB PTAX (fechamento, compra) lookup by competência date, with
  weekend/holiday walk-back.
- `src/popup.*` — the side panel (identity, profiles, per-run inputs, fill trigger).
  The fill engine + profile are injected on demand into the page's MAIN world via
  `scripting.executeScript` — no page-observable bridge, no engine parked on the page.
- `src/sw.js` — opens the side panel / toggles the sidebar on the toolbar-icon click.

Validated against the real portal by a private Playwright harness (kept outside this
repo, with the credentials): one script drives the fill engine end-to-end (35 fields),
another injects `content.js` on a real emitted nota and checks the parsed profile.
`CODE-REVIEW.md` tracks the audit findings and the hardening roadmap.

## English summary

Browser extension (MV3, Chrome/Edge/Firefox) that fills the monthly NFS-e (Brazilian
service invoice) draft on the national Emissor Nacional for service exporters
(ME/EPP, foreign client, ISS-exempt). Per-client profiles keyed by the logged-in CNPJ,
onboarding by parsing a previously emitted invoice, automatic BCB PTAX exchange rate.
It fills the 3-page wizard; the human always reviews and clicks Emitir. Credential-free:
it operates on the already-logged-in tab, and all data stays in local browser storage.
Scope (see _Escopo suportado_): the export-of-service invoice in its validated wizard
variants — tomador abroad/in Brazil/not informed, NIF, contact fields, three "total dos
tributos" modes ("not informed" is rejected by the portal itself for ME/EPP emitters) —
enforced by a fill-time guard that refuses whole pages outside it;
validated against Emissor Nacional 1.6.0.0 (each variant server-accepted on the
portal's staging), with an in-panel warning when the live portal version differs.

## Aviso

Projeto independente, sem qualquer vínculo com a RFB, o Serpro ou o portal NFS-e.
Confira sempre os dados preenchidos antes de emitir — a responsabilidade pela nota é
de quem emite. Licença MIT.
