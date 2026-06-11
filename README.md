# NFS-e Nacional — Preenchimento automático

Extensão de navegador (Manifest V3) que **preenche o rascunho da NFS-e** no
[Emissor Nacional](https://www.nfse.gov.br/EmissorNacional) para **exportação de
serviços** — ME/EPP no Simples Nacional, tomador no exterior, ISS não incidente
(LC 116/2003, art. 2º, I). A extensão preenche o assistente; **você revisa e clica
em Emitir.**

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

## Instalação (modo desenvolvedor) — Chrome, Edge e Firefox

A mesma pasta serve para os três navegadores.

1. `node scripts/make-icon.mjs` (gera o ícone; só na primeira vez).
2. `cp src/config.example.json src/config.default.json` e preencha com os seus dados —
   o arquivo real fica fora do git (gitignored), então dados de cliente nunca vão para o
   repositório. (Opcional: dá para criar perfis só a partir de uma nota emitida, passo 5.)
3. Carregue a extensão:
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
4. Faça login no Emissor Nacional e abra o painel.
5. **Primeira vez com um cliente:** abra uma nota já emitida dele (pelo portal) → o
   painel mostra os dados lidos → **Salvar como padrão**.
6. **Cada emissão:** inicie a **Emissão completa**; em cada página confirme competência
   e valor em US$ (o câmbio preenche sozinho), clique **Preencher página atual**, confira
   e **Avançar**. Na tela final, revise e clique **Emitir** você mesmo.

## Privacidade

- A extensão **não pede, não vê e não armazena senhas** — ela atua na aba em que você
  já está logado.
- Os dados dos clientes ficam **somente no seu navegador** (`chrome.storage` local).
  Nada é enviado a terceiros; a única chamada externa é a consulta pública de câmbio
  na API do Banco Central (PTAX/Olinda).
- Os perfis podem ser recriados a qualquer momento a partir de uma nota emitida — perder
  o storage não perde nada de importante.

## Arquitetura (en)

- `src/content.js` — isolated world: detects the page + login identity, parses an
  emitted nota into a client profile (fail-closed on unreadable CNPJ), relays fill
  requests.
- `src/fill-plan.js` — builds the ordered field operations per page (field ids and
  cascade order reverse-engineered from the portal's wizard).
- `src/field-ops.js` — applies them via the page's own jQuery (Chosen/select2 aware).
- `src/page-agent.js` — MAIN-world bridge between content script and the engine.
- `src/rate.js` — BCB PTAX (fechamento, compra) lookup by competência date, with
  weekend/holiday walk-back.
- `src/popup.*` — the side panel (identity, profiles, per-run inputs, fill trigger).
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

## Aviso

Projeto independente, sem qualquer vínculo com a RFB, o Serpro ou o portal NFS-e.
Confira sempre os dados preenchidos antes de emitir — a responsabilidade pela nota é
de quem emite. Licença MIT.
