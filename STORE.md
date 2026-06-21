# Publicação nas lojas — Chrome Web Store, Edge Add-ons e Firefox AMO

Material pronto para submeter a extensão às três lojas. Os textos voltados ao
revisor (justificativas de permissão, notas de certificação) estão em **inglês**
(revisores internacionais); a descrição da loja, voltada ao usuário, está em
**português (pt-BR) com versão em inglês** para um locale opcional.

**Estado do pacote:** Manifest V3, versão `0.3.0`. `npm run build` gera os dois zips
em `dist/`: `nfse-emissor-chrome-v0.3.0.zip` (Chrome Web Store **e** Edge Add-ons) e
`nfse-emissor-firefox-v0.3.0.zip` (Firefox AMO), cada um com manifest limpo e o
conjunto de ícones 16/32/48/128. Nada foi publicado em nenhuma loja ainda.

> **Antes de tudo, decida a versão.** Os zips são `v0.3.0`, mas um primeiro
> lançamento público costuma ficar melhor como `1.0.0`. Como `0.3.0` nunca foi
> publicado, dá para emendar a própria `0.3.0` ou subir para `1.0.0`. Para subir:
> edite só a versão no **`manifest.json` da raiz** e rode `npm run build` — os
> manifests de `dist/chrome` e `dist/firefox` são **gerados** a partir da raiz
> (`scripts/build.mjs`), então não se edita à mão, e os zips saem renomeados com a
> nova versão. É decisão sua; o resto deste guia vale para a versão que você escolher.

**Vídeo de demonstração (YouTube):** https://www.youtube.com/watch?v=kcj-tuIkcbA — cole no campo **Vídeo** da Chrome Web Store. No Firefox AMO não há campo de vídeo: referencie o link na descrição. (Edge: adicionar quando sair da revisão.)

---

## 1. Texto da loja (pt-BR primário + EN)

### pt-BR (primário)

**Nome da extensão** (43 caracteres, dentro do limite de 45):
> NFS-e Nacional — Preenchimento (exportação)

**Descrição curta / resumo — Chrome / Edge (limite rígido 132):** *(124 caracteres)*
> Preenche o rascunho da NFS-e de exportação de serviço no Emissor Nacional e calcula o valor em BRL pela cotação PTAX do BCB.

**Descrição curta — AMO (até 250):** *(245 caracteres)*
> Preenche automaticamente o rascunho da NFS-e de exportação de serviço (ME/EPP no Simples Nacional, ISS não incidente) no Emissor Nacional e calcula o valor em BRL pela cotação PTAX do Banco Central. Você revisa e emite. Sem senhas, sem servidor.

**Descrição detalhada:**

**Preenchimento da NFS-e de exportação de serviço, do jeito certo e sem digitação manual.**

Esta extensão preenche o **rascunho** da NFS-e mensal de **exportação de serviço** no portal oficial **Emissor Nacional** (nfse.gov.br/EmissorNacional). Ela completa o assistente de 3 páginas (~35 campos) e busca a cotação **PTAX do Banco Central** para converter o valor em US$ para BRL na competência correta.

**Para quem é:**
- Exportadores de serviço brasileiros — devs e consultores que prestam serviço para o exterior
- Seus contadores

**Como funciona com segurança:**
- **Você sempre revisa e clica em "Emitir".** A extensão nunca emite por conta própria.
- **Sem credenciais.** Roda na aba em que você já está logado — nada de senha ou captcha.
- **Seus dados ficam no seu navegador.** Sem servidor, sem conta, sem analytics, sem rastreadores. Os perfis de cliente e o rascunho em andamento ficam só no armazenamento local e podem ser apagados no painel ou ao desinstalar.

**Escopo suportado:**
- Exportação de serviço (LC 116/2003, art. 2º, I)
- ME/EPP no Simples Nacional, ISS não incidente

**Disponível para Chrome, Edge e Firefox.**

Política de privacidade: https://github.com/thgrcarvalho/nfse-emissor-extension/blob/main/PRIVACY.md

**Categoria sugerida:** Chrome Web Store / Edge Add-ons → **Productivity (Produtividade)**. Firefox AMO → confirmar a categoria mais próxima na lista vigente do Developer Hub no momento da submissão (utilitário fiscal de nicho).

**Palavras-chave / tags:** `NFS-e`, `Emissor Nacional`, `nota fiscal`, `exportação de serviço`, `Simples Nacional`, `PTAX`

### EN (secundário)

**Extension name** (43 chars — same product name across locales):
> NFS-e Nacional — Preenchimento (exportação)

**Short description — Chrome / Edge (hard limit 132):** *(120 chars)*
> Fills the service-export NFS-e draft on Brazil's Emissor Nacional and prices it in BRL using the central bank PTAX rate.

**Short description — AMO (up to 250):** *(249 chars)*
> Auto-fills the service-export NFS-e draft (ME/EPP, Simples Nacional, ISS non-incident) on Brazil's official Emissor Nacional portal and prices it in BRL via the Central Bank PTAX rate. You review and emit. No passwords, no server, no data collected.

**Detailed description:**

**Fill the service-export NFS-e draft correctly, without manual typing.**

This extension auto-fills the **draft** of Brazil's monthly **service-export NFS-e** invoice on the official **Emissor Nacional** portal (nfse.gov.br/EmissorNacional). It completes the 3-page wizard (~35 fields) and pulls the **Brazilian Central Bank PTAX** rate to convert your USD amount to BRL for the correct accrual period.

**Who it's for:**
- Brazilian service exporters — devs and consultants serving clients abroad
- Their accountants

**Built to be safe:**
- **You always review and click "Emit".** The extension never emits on its own.
- **No credentials.** It runs in the tab where you're already logged in — no passwords, no captcha.
- **Your data stays in your browser.** No server, no account, no analytics, no trackers. Client profiles and the in-progress draft live only in local storage and can be deleted in the panel or by uninstalling.

**Supported scope:**
- Export of service (LC 116/2003, art. 2 I)
- ME/EPP small business under Simples Nacional, ISS non-incident

**Available for Chrome, Edge, and Firefox.**

Privacy policy: https://github.com/thgrcarvalho/nfse-emissor-extension/blob/main/PRIVACY.md

**Category:** Chrome / Edge → **Productivity**. AMO → closest available fit for a niche tax utility; confirm against the current AMO category list at submission.

**Keywords / tags:** `NFS-e`, `Emissor Nacional`, `service export`, `invoice`, `Simples Nacional`, `PTAX`

---

## 2. Permissões e propósito único (revisores Chrome/Edge, EN)

**Single purpose description**
This extension fills the export-of-service NFS-e draft on Brazil's official Emissor Nacional portal (nfse.gov.br/EmissorNacional) for a small business (ME/EPP under Simples Nacional) and computes the invoice value in BRL from the Brazilian Central Bank (BCB) PTAX exchange rate. It only populates the 3-page draft wizard; the user always reviews and clicks "Emitir" themselves — the extension never submits or emits the invoice.

**Permission justification: storage**
Used to persist, locally in the browser, the user's reusable client profiles (company name, CNPJ tax id, recipient data, service codes, rate type) and the in-progress draft inputs (competence month, USD amount, exchange rate). Nothing is ever sent to a server; all stored data stays on the device and is deletable in-panel or by uninstalling.

**Permission justification: activeTab**
Used to read the displayed invoice/identity data on the Emissor Nacional tab the user is currently viewing, so the fill engine knows which company and draft it is working with. Access is granted by the user's click on the extension's action and is limited to that tab.

**Permission justification: scripting**
Used to inject, on user action only, the fill engine into the already-open Emissor Nacional page so it can type the ~35 wizard fields across the 3-page draft. Injection never happens automatically and only targets the portal page.

**Permission justification: sidePanel**
The entire user interface is a side panel that stays open alongside the portal during the multi-page draft workflow, so the user can drive and review the fill across all three wizard pages without losing context.

**Host permission justification: `https://*.nfse.gov.br/*`**
This is the only portal the extension works on. The host access lets it read the open Emissor Nacional page and fill the draft wizard there; the extension does not contact any other nfse.gov.br endpoint on its own.

**Host permission justification: `https://olinda.bcb.gov.br/*`**
Used for a single public GET request to the Brazilian Central Bank's PTAX exchange-rate API to price the invoice in BRL. The query contains only a date — no personal or company data is sent.

**Are you using remote code? — No.** All code ships inside the package (unminified); the extension loads no remote scripts, eval'd code, or externally hosted modules — its only network call is the date-only PTAX rate lookup, which returns data, not code.

---

## 3. Privacidade e segurança de dados (Chrome/Edge/AMO, EN)

Estas respostas batem com `PRIVACY.md`: **nenhum dado é coletado ou transmitido**, o
armazenamento é **só local**, nenhuma senha é tocada e a única requisição que a
extensão faz é a **chamada PTAX só-com-data** para `olinda.bcb.gov.br`.

### Chrome Web Store — aba "Privacy practices"

**Single purpose:** This extension fills the draft of Brazil's monthly NFS-e service-export invoice on the official Emissor Nacional portal (nfse.gov.br/EmissorNacional) and computes the BRL amount from the Brazilian Central Bank's public PTAX exchange rate. It auto-fills the 3-page wizard; the user always reviews and clicks "Emitir" themselves — the extension never emits.

**"Are you collecting or using user data?" → No** — no user data is collected or transmitted off the device. Nuance to state so the `storage` permission isn't a surprise: the extension stores data **locally only**, inside the browser's own extension storage, on the user's machine — user-created client profiles (company name, CNPJ, tomador data, service codes, rate) plus the in-progress draft state (competência, USD amount, exchange rate). None of it is ever sent anywhere (no server, no account, no analytics, no upload). Local-only storage is **not** "collection" under Chrome's definition, which concerns data transmitted off the device.

**"What user data do you collect?" → none** transmitted, for every category:

| Chrome data type | Collected / transmitted? |
|---|---|
| Personally identifiable information | No — not transmitted. (CNPJ/company name, if entered, stay in local storage only.) |
| Health information | No |
| Financial and payment information | No — USD amount and PTAX rate stay in local session storage; nothing transmitted. |
| Authentication information | No — never requested, read, or stored. Operates on the already-logged-in nfse.gov.br tab. |
| Personal communications | No |
| Location | No |
| Web history | No |
| User activity | No |
| Website content | No — the extension reads the open Emissor Nacional page to fill it, but does not collect or transmit that content off the device. |

**Certifications (check all three — all true):**
- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases.
- ☑ I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes.

**"Does your extension use remote code?" → No.** All code ships inside the package; nothing is fetched or `eval`'d at runtime (full Manifest V3 compliance).

**Privacy policy URL:** `https://github.com/thgrcarvalho/nfse-emissor-extension/blob/main/PRIVACY.md`

### Edge Add-ons (Partner Center)

Espelha o Chrome exatamente:
- **Collects user data? → No** — no data collected or transmitted (local-only browser storage of user-created profiles + in-progress draft; never uploaded, no server/account/analytics).
- **Per data-type:** identical to the Chrome table — **none transmitted** for every category, including **no authentication/password data**.
- **Transferred to third parties / sold? → No.** **Creditworthiness or lending? → No.**
- **Uses remote code? → No** — all code ships in the package.
- **Privacy policy URL:** `https://github.com/thgrcarvalho/nfse-emissor-extension/blob/main/PRIVACY.md`
- **Network behavior:** exactly two hosts. `nfse.gov.br` is the page already open in the user's tab (the extension originates no request — it only reads/fills that page). `olinda.bcb.gov.br` receives one public GET whose query contains **only a date** (the competência), no personal data, to fetch the PTAX rate.

### Firefox AMO — data collection

O manifest do Firefox (`dist/firefox/manifest.json`) já declara a asserção legível por
máquina de que **nada é coletado** (correto, deixar como está):

```json
"browser_specific_settings": {
  "gecko": {
    "id": "nfse-emissor@trc.dev",
    "data_collection_permissions": {
      "required": ["none"]
    }
  }
}
```

**Descrição de uso de dados (uma linha, para o resumo do AMO):**
> This add-on collects and transmits no data. It stores client profiles and the in-progress invoice draft only in the browser's local extension storage on the user's device; the sole outbound request is a date-only GET to the Brazilian Central Bank's public PTAX exchange-rate API (olinda.bcb.gov.br), which carries no personal data.

Pontos de apoio: sem contas/servidores/analytics/cookies/identificadores; sem código
remoto (código não-minificado no pacote); sem senhas (atua na aba já logada); todos os
dados são apagáveis no painel ou ao desinstalar.

---

## 4. Notas para o revisor / certificação (Edge/AMO/Chrome, EN)

**What this extension does (plain English).** It is a single-purpose form-filler for one Brazilian government website: the official "Emissor Nacional" NFS-e portal at `https://www.nfse.gov.br/EmissorNacional`. For a narrow tax case (a small Brazilian business issuing a *service-export* invoice), it auto-types about 35 fields across the portal's 3-page draft wizard so the user does not have to re-type them by hand each month. The extension never submits/issues the invoice — the human always reviews the filled draft and clicks "Emitir" themselves. The UI is a side panel (Chrome/Edge) or sidebar (Firefox) that stays open during the multi-page draft.

**The only two hosts it touches.**
- `https://*.nfse.gov.br/*` — the portal itself. The content script is matched only to `https://*.nfse.gov.br/EmissorNacional` and its sub-paths (`/EmissorNacional/*`); it reads the page the user already has open and fills the wizard fields there. The extension makes no network request to this host; it operates on the tab the user navigated to.
- `https://olinda.bcb.gov.br/*` — exactly ONE public GET to the Brazilian Central Bank (BCB) PTAX exchange-rate API, to convert the invoice's foreign-currency amount into BRL. The query carries only a date (and a fixed ISO-4217 currency symbol, default `USD`) — neither is personal data or an identifier. You can see the exact call in `src/rate.js`: it hits `.../PTAX/versao/v1/odata/CotacaoMoedaDia(moeda=@moeda,dataCotacao=@dataCotacao)` with `@moeda='USD'` and `@dataCotacao='<date>'`. This is the only outbound network request the extension itself makes.

**Why you cannot fully exercise the fill flow (expected, not a defect).** The portal sits behind a Brazilian federal government login (CPF/CNPJ + password, or gov.br SSO) tied to a real Brazilian taxpayer identity. There is no public/guest/demo account and no way to provision one for a reviewer. So the actual field-filling can only be demonstrated by someone with a Brazilian tax login on a page they are already authenticated into. The extension is also strictly user-action-driven and must never run unattended/headless — injection happens only when the user clicks "Preencher" in the panel. None of this is a workaround for review tooling; it is how the tax portal works. To be fully transparent: the government also runs a staging portal at `producaorestrita.nfse.gov.br`, but it requires the *same* login, so it does not let a reviewer bypass the wall either — there genuinely is no public test path.

**What you CAN verify without any login:**
1. **Load the extension and open the panel on any non-portal tab.** It does not act off-portal. Instead it shows a gate: "Esta extensão funciona apenas no Emissor Nacional (www.nfse.gov.br/EmissorNacional) — Abra o portal e faça login para usar." No fields are read or written, and the fill action is unavailable, when you are not on the portal. This proves the scope is enforced, not merely declared.
2. **Read the source — it is fully unminified.** The logic ships in `src/` (including `popup.js`, `content.js`, `field-ops.js`, `fill-plan.js`, `rate.js`, `shape-guard.js`, `sw.js`, `popup.html`, and the `config.default.json` / `config.example.json` templates). No build step obfuscates it; what ships is what you read.
3. **Confirm there is no remote code.** Everything executes from the package — no `eval` of fetched code, no remote `<script>`, no CDN, no hosted bundle. (Chrome "uses remote code" = NO.)
4. **Confirm the network surface.** Grep the source for `fetch(` / `XMLHttpRequest`. You will see exactly two `fetch(` hits: `src/rate.js` — the single date-only BCB PTAX GET described above (the only call that hits the network) — and `src/popup.js`, which does `fetch(runtime.getURL('src/config.default.json'))` to read a file bundled *inside the package*; that one never leaves the extension and touches no host. The only host the extension contacts is `olinda.bcb.gov.br`; the other declared host, `nfse.gov.br`, is the page the user is already on and is never called by the extension. These are exactly the two declared `host_permissions`.
5. **Confirm it is credential-free.** The extension never asks for, reads, or stores a password. It operates only on the tab where the user is *already* logged in — no login form, no password field, no token capture anywhere in the source.
6. **Confirm local-only data.** Per `PRIVACY.md`: no servers, no accounts, no analytics, no cookies, no tracking IDs. It stores locally only (a) user-created client profiles and (b) in-progress draft state, both deletable in-panel or by uninstalling. The Firefox/AMO manifest declares `data_collection_permissions: { required: ["none"] }`.

**Per-permission rationale (matches §2):** `storage` = save profiles + in-progress draft locally; `activeTab` + `scripting` = read the open portal tab and inject the fill engine on user click only; `sidePanel` (Chrome/Edge) / `sidebar_action` (Firefox) = the panel UI that persists across the multi-page draft; host `nfse.gov.br` = the only site it works on; host `olinda.bcb.gov.br` = the one date-only PTAX call.

**Offer.** A step-by-step walkthrough is in the GitHub README (`https://github.com/thgrcarvalho/nfse-emissor-extension`); a short screencast of the full fill flow against a real logged-in portal session can be provided on request. Privacy policy: `https://github.com/thgrcarvalho/nfse-emissor-extension/blob/main/PRIVACY.md`. Happy to answer any specific question.

**Build note.** Loaded unpacked in *developer mode*, the browser may emit two benign warnings about manifest keys inert for that browser (the single source manifest carries both Chrome and Firefox keys). They are NOT present in the submitted per-browser zips: each store gets a browser-specific package whose manifest contains only the keys valid for that browser, so it loads cleanly with no warnings.

---

## 5. Screenshots e arte promocional

Tudo renderiza a partir de `dist/chrome` carregado sem compactação, então o único dado
visível é o exemplo saneado embarcado em `dist/chrome/src/config.default.json` (label
`MINHA EMPRESA LTDA`, CNPJ `00.000.000/0001-00`, tomador `Example Client Inc.`,
município `Rio de Janeiro/RJ`, CTN `14.02.01`, alíquota SN `4,00`, Valor US$ `1000`).
**Nunca** digite um CNPJ real; para um segundo cliente salvo, injete o placeholder
`Empresa Exemplo ME` / `12.345.678/0001-90` via `renderProfileList`, não edite um real.

### As 5 cenas (Chrome/Edge: 5 imagens em 1280×800; AMO reaproveita os PNGs)

As views são os ids reais de `dist/chrome/src/popup.html`: `idle`, `nota`, `form`
(mais as barras `#identity`, `#profileInfo`, `#versionLine`). Dirija cada estado pelos
globais de `popup.js` (script clássico — funções de topo viram `window.*`).

1. **Painel de clientes salvos (dashboard).** `showView('idle')` com `#profilesBox`
   visível e duas linhas — `MINHA EMPRESA LTDA · 00.000.000/0001-00 · logado` e
   `Empresa Exemplo ME · 12.345.678/0001-90`; botões Exportar/Importar visíveis.
   - pt-BR: **"Seus clientes salvos, só neste navegador — nada sai do seu computador."**
   - en: **"Your saved clients, only in this browser — nothing leaves your computer."**
2. **Onboarding a partir de uma nota emitida.** `showView('nota')`, `#notaSummary`
   preenchido com o exemplo (Cliente, Município, CTN, Alíquota SN, Valor padrão US$,
   Descrição), `#notaNum` `(nº 42)`, botões "Usar nesta emissão" / "Salvar como padrão"
   habilitados.
   - pt-BR: **"Crie o perfil do cliente a partir de uma nota que você já emitiu."**
   - en: **"Create a client profile from an invoice you've already issued."**
3. **Preenchimento (hero shot).** `showView('form')`, `#competencia` `01/05/2026`,
   `#usd` `1.000,00`, `#cambio` `5,1687`, `#ptaxInfo` `PTAX de fechamento de 30/04/2026
   (Banco Central)`, `#valorBRL` `R$ 5.168,70`; `#profileInfo` `Dados: MINHA EMPRESA
   LTDA — perfil salvo`. **É o hero — deve ser o screenshot nº 1 na ordenação da loja.**
   - pt-BR: **"Digite o valor em dólar — o câmbio PTAX do Banco Central vira o valor em reais."**
   - en: **"Type the amount in dollars — the Central Bank PTAX rate turns it into reais."**
4. **Cabeçalho de identidade + versão do portal.** Reaproveite `idle`, enquadrando o
   topo: barra verde `#identity` com o CNPJ logado e `#versionLine` mostrando
   `Validada com o Emissor Nacional v1.6.0.0`; `#portalWarn` vazio (versão suportada).
   - pt-BR: **"Trava pelo CNPJ logado e confere a versão do portal antes de preencher."**
   - en: **"Locked to the logged-in CNPJ and checks the portal version before filling."**
5. **Exportar / Importar perfis.** `showView('idle')` com `#profilesBox` visível e
   `#profilesMsg` `1 perfil(is) exportado(s).`, botões Exportar/Importar em foco.
   - pt-BR: **"Leve seus perfis para outro navegador — exporte e importe quando quiser."**
   - en: **"Take your profiles to another browser — export and import whenever you like."**

Se quiser só 4, corte a #4 (dobre a barra de identidade no enquadramento da #1).

### Renderizar o painel estreito de forma atraente em 1280×800

O painel tem ~240–320px, então **não** capture cru (ficaria perdido em branco) nem
capture o portal real atrás (muro de login + vazaria dado real). Componha o painel sobre
uma tela com a marca:
- **Tela:** 1280×800, fundo suave da marca — gradiente vertical do verde `#1b6b3a` ao
  acento `#eef7f0` (ambos já no CSS do popup), ou `#eef7f0` chapado com um canto `#1b6b3a`.
- **Painel:** renderizado na largura natural (viewport ~360px, padding intacto), sombra +
  cantos ~12px arredondados, centralizado, ocupando ~380–460px da largura (capturado em
  deviceScaleFactor 2 para ficar nítido).
- **Faixa de legenda:** uma pílula/barra no topo ou base em verde da marca com texto
  branco, uma frase grande legível no thumbnail 640×400 que a loja exibe.
- **Consistência:** mesmo fundo, mesma posição, mesma faixa nas 5, para a galeria ler como
  um conjunto. Sem chrome do SO/navegador — só painel + fundo + legenda.

### Abordagem de captura (spec — não implementar aqui)

Um harness Playwright headless-off (Chromium com extensão) que carrega o build
descompactado e dirige o painel pelas funções de página expostas. Sugestão: `scripts/shots.mjs`,
rodar após `npm run build`.
- **Launch:** `chromium.launchPersistentContext('', { headless: false, args:
  ['--disable-extensions-except=<abs dist/chrome>', '--load-extension=<abs dist/chrome>'],
  deviceScaleFactor: 2, viewport: { width: 360, height: 760 } })`. Headed é obrigatório p/ MV3.
- **Resolver o id da extensão:** aguardar o service worker e extrair o id da URL; montar
  `chrome-extension://<id>/src/popup.html` (o path é `src/popup.html`, conforme o manifest do dist).
- **Semear dados seguros uma vez:** antes de navegar, gravar os perfis de exemplo em
  `chrome.storage.local` via `evaluate` na página da extensão, chaveando por dígitos do
  CNPJ como faz `importProfiles`. Fonte: `dist/chrome/src/config.default.json` (exemplo
  saneado). Adicionar o segundo placeholder (`Empresa Exemplo ME`) aqui, não editando o bundle.
- **Dirigir cada estado pelos globais** (`window.showView(...)`, `renderProfileList(...)`,
  `setIdentity(...)`, `setProfileInfo(...)`, `setProfilesMsg(...)`). Para a `form`, setar
  `#competencia`/`#usd`/`#cambio`/`#valorBRL` e o texto de `#ptaxInfo` direto (injetar a taxa
  fixa `5,1687` / `R$ 5.168,70`, **sem** chamada real ao BCB, para ser determinístico/offline).
  Para a cena 2, fixar o sumário de exemplo. Para a cena 4, `#versionLine` =
  `Validada com o Emissor Nacional v1.6.0.0` e `#portalWarn` vazio.
- **Screenshot:** clip do painel em 2x, depois um passo de composição (página-template
  1280×800 separada, ou lib de imagem) para por painel + fundo + legenda e emitir os PNGs
  finais 1280×800 (e 640×400) em `screenshots/`. Nunca commitar nada com CNPJ real (só os
  dois placeholders existem).

### Promo tile (Chrome, opcional, 440×280)

Fundo verde `#1b6b3a`, lockup curto "NFS-e Nacional" em branco (nome completo
secundário, para o tile ficar legível em miniatura), motivo Brasil→EUA / R$↔US$, tagline:
- pt-BR: **"Preenche o rascunho da NFS-e de exportação. Você revisa e emite."**
- en: **"Fills the export NFS-e draft. You review and issue."**

Edge/AMO não exigem; pule se faltar tempo.

---

## 6. Checklist de submissão (por loja)

Legenda: **[USER]** = ação manual só você pode fazer (conta, pagamento, upload de
arquivo, screenshots, declarações, submit final). **[PRONTO]** = material já escrito
acima, é só colar.

### Chrome Web Store

- [ ] **[USER]** Entrar no Developer Dashboard com uma conta Google.
- [ ] **[USER]** Pagar a taxa única de **US$5** de registro de desenvolvedor (uma vez por conta, para sempre).
- [ ] **[USER]** Concluir a verificação de e-mail de contato do desenvolvedor, se pedida.
- [ ] **[USER]** "Add new item" e subir o **zip do Chrome** (`nfse-emissor-chrome-v<versão>.zip`). Não suba o zip do Firefox aqui.
- [ ] **[PRONTO]** Colar nome, resumo e descrição **pt-BR** (listagem primária) + a cópia **EN** num locale `en`.
- [ ] **[PRONTO]** Definir categoria e idioma; colar o **single purpose** (§2).
- [ ] **[USER]** Subir **1–5 screenshots 1280×800** (ou 640×400). Promo tile **440×280** opcional.
- [ ] **[PRONTO]** Colar as **justificativas de permissão** (§2): storage, activeTab, scripting, sidePanel, host `nfse.gov.br`, host `olinda.bcb.gov.br`, e "uses remote code" → **NO**.
- [ ] **[PRONTO]** Aba Privacy: declarar **nenhum dado coletado/transmitido** (§3) + URL da política.
- [ ] **[USER]** Marcar afirmativamente **as três** certificações (não vende/transfere a terceiros; não usa fora do propósito único; não usa para crédito/empréstimo).
- [ ] **[USER]** Declaração **trader/non-trader**: declarar **NON-trader** (pessoa física, projeto de portfólio sem monetização). Não habilitar campos de pagamento. É sua declaração legal/identidade — faça você mesmo, não é boilerplate.
- [ ] **[USER]** "Submit for review". Prazo típico **~1 dia útil a poucos dias** (pode esticar se sinalizado).
- [ ] *Gotcha:* o revisor **não loga no portal gov**; mantenha §2/§4 autossuficientes. Se pedirem demo, aponte README + screenshots (o muro de login é inevitável).

### Edge Add-ons

- [ ] **[USER]** Registrar/entrar no **Microsoft Partner Center** (programa Edge). **Grátis.** A verificação de conta pode levar dias.
- [ ] **[USER]** Nova submissão e subir o **mesmo zip do Chrome**. Não precisa build separado.
- [ ] **[PRONTO]** Colar cópia **pt-BR** (primária) + **EN**; definir categoria, idioma e termos de busca (campos próprios do Partner Center).
- [ ] **[USER]** Subir screenshots (reaproveite o set 1280×800).
- [ ] **[PRONTO]** Privacidade: **nenhum dado coletado/transmitido/vendido** (§3) + URL da política.
- [ ] **[PRONTO]** **"Notes for certification" — CAMPO CRÍTICO (EN).** Colar §4: o site-alvo está **atrás de um muro de login do governo brasileiro que o revisor não passa**, e como avaliar mesmo assim — a UI/código do painel são **inspecionáveis sem login** (fonte não-minificada), mas o **comportamento de preenchimento exige a aba já logada do usuário** e não dá para reproduzir atrás do muro (remeter à fonte + README + screenshots). Pontos-chave: só preenche rascunho e nunca clica "Emitir"; a única requisição que a extensão faz é a chamada PTAX só-com-data a `olinda.bcb.gov.br`; tudo é local; e **não há credenciais de teste** porque roda na sessão já autenticada do próprio usuário.
- [ ] **[USER]** Submeter para certificação. Prazo **até ~7 dias úteis** (em geral mais rápido).
- [ ] *Gotcha:* sem as notas (ou se fracas), o Edge **provavelmente recusa** por "não consegui verificar a funcionalidade" — as notas são a única forma de explicar o muro de login.

### Firefox AMO (addons.mozilla.org)

- [ ] **[USER]** Entrar no addons.mozilla.org com conta Firefox/Mozilla. **Grátis.**
- [ ] **[USER]** Nova submissão no canal **Listed** e subir o **zip do Firefox** (`nfse-emissor-firefox-v<versão>.zip`). Não suba o do Chrome.
- [ ] **[PRONTO]** Como o pacote é **não-minificado** (build é só cópia de arquivos, sem transpile/minify), normalmente **não exige upload de código-fonte** separado — forneça se um revisor pedir. O manifest AMO já declara `data_collection_permissions: { required: ["none"] }` e o build Firefox usa `sidebar_action` (sem `sidePanel`).
- [ ] **[PRONTO]** Colar nome/resumo/descrição **pt-BR** (primária) + **EN** (secundária); escolher **categorias**; URL da política.
- [ ] **[USER]** Subir screenshots (reaproveite o set).
- [ ] **[PRONTO]** "Notes to reviewer" (EN): mesma explicação do muro de login do Edge (§4).
- [ ] **[USER]** Submeter. No upload, o AMO roda **validação/assinatura automática**; depois vem **revisão humana** (alguns dias, até ~10) e **publica quando ela conclui**. Um revisor também pode pedir mudanças após a publicação.
- [ ] *Gotcha:* manter `strict_min_version` (128.0) honesto; avisos do linter AMO são quase sempre de chave de manifest, não bloqueantes, dada a fonte não-minificada.

### Fechamento entre lojas

- [ ] **[USER]** Após submeter as três, taguear o release no git e anotar o status de revisão de cada loja.
- [ ] Manter as notas-ao-revisor/justificativas idênticas em substância entre as lojas; só o **zip** muda (zip Chrome → Chrome + Edge; zip Firefox → AMO).

---

## 7. Pendências antes de submeter

- **Contas e taxas (lead time) [USER].** Chrome: **US$5** uma vez + e-mail de contato
  verificado. Edge: conta **Partner Center** (grátis, mas a verificação de identidade
  pode levar dias — comece cedo). AMO: conta Mozilla. Nenhuma é coberta pelo material acima.
- **Screenshots e arte promocional [follow-up].** O **plano + spec de captura** está no
  §5, mas os **PNGs** ainda não existem: Chrome/Edge exigem ≥1 screenshot 1280×800 (ou
  640×400); AMO exige ≥1. O promo tile 440×280 (e o opcional marquee 1400×560) também
  precisam ser gerados. Posso montar o `scripts/shots.mjs` e renderizar as cenas quando quiser.
- **Localização das listagens.** pt-BR primária + EN secundária são criadas **no painel de
  cada loja** — não precisa de `_locales` no pacote (a cópia é colada no dashboard).
- **Upload de fonte no AMO — confirmado não necessário.** `scripts/build.mjs` só **copia**
  os arquivos `src/*.js` (sem bundler/transpiler/minifier), então o zip é byte-equivalente
  à fonte do repo. Forneça a fonte só se um revisor pedir explicitamente.
- **Zips frescos — já reconstruídos.** `dist/` tem os zips v0.3.0 com o conjunto de ícones
  novo. Se subir para `1.0.0`, edite só o `manifest.json` da raiz e rode `npm run build`.
- **Conjunto de ícones — pronto.** O manifest referencia 16/32/48/128 e o build os
  empacota; o `icons/icon300.png` (logo 300×300 do Edge) fica no repo para upload no
  dashboard, não vai no zip.
- **(Opcional, de-risca a revisão) um screencast/GIF curto** do fluxo de preenchimento
  ajudaria Chrome/Edge, já que o revisor não passa do muro de login. Pode ir no README e
  ser citado nas notas-ao-revisor.

---

> Projeto independente, sem vínculo com a RFB, o Serpro ou o portal NFS-e. Licença MIT.
