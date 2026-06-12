# Política de Privacidade — NFS-e Nacional Preenchimento

_Última atualização: 11 de junho de 2026._

## Resumo

A extensão **não coleta, não transmite e não vende nenhum dado**. Tudo o que ela
guarda fica no armazenamento local do **seu** navegador, no **seu** computador.

## Quais dados a extensão guarda (localmente)

- **Perfis de cliente** (razão social, CNPJ, dados do tomador, códigos de serviço,
  alíquota) — criados por você, a partir de uma nota já emitida ou do arquivo de
  configuração. Ficam no `storage` local do navegador e podem ser excluídos a qualquer
  momento pelo gerenciador de clientes do painel ou desinstalando a extensão.
- **Estado da emissão em andamento** (competência, valor em US$, câmbio) — guardado
  na sessão do navegador e descartado quando o navegador fecha.

Nenhum desses dados sai do navegador. Não há servidor da extensão, não há conta,
não há analytics, não há cookies, não há identificadores de qualquer tipo.

## Senhas e credenciais

A extensão **não pede, não lê e não armazena senhas**. Ela atua apenas na aba em que
você já está logado no Emissor Nacional.

## Conexões de rede

A extensão se comunica com exatamente dois domínios:

1. **nfse.gov.br** — a página do Emissor Nacional já aberta no seu navegador, para
   ler a nota exibida e preencher o assistente de emissão. Nenhuma requisição própria
   é feita; a extensão só interage com a página que você está vendo.
2. **olinda.bcb.gov.br** — API pública do Banco Central, para buscar a cotação PTAX
   da data de competência. A requisição contém somente a data — nenhum dado pessoal.

## Código remoto

Todo o código executa do pacote instalado. A extensão não baixa nem executa código
remoto (exigência do Manifest V3, que ela cumpre integralmente).

## Exclusão dos dados

- Pelo painel: tela inicial → clientes salvos → excluir.
- Ou desinstale a extensão — o navegador apaga todo o `storage` junto.

## Contato

Dúvidas ou problemas: [abra uma issue no GitHub](https://github.com/thgrcarvalho/nfse-emissor-extension/issues).

---

## Privacy Policy (English summary)

This extension collects, transmits and sells **no data**. Client profiles (company
name, CNPJ tax id, service codes) are created by the user and stored only in the
browser's local extension storage; they can be deleted in the panel or by
uninstalling. No passwords are requested, read or stored — the extension operates on
the already-logged-in nfse.gov.br tab. The only external request is to the Brazilian
Central Bank's public exchange-rate API (olinda.bcb.gov.br), containing only a date.
No analytics, no remote code, no servers, no accounts.
