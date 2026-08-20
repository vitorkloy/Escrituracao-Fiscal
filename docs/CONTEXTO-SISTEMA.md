# Contexto do sistema — Escrituração Fiscal (eFis)

Documento de referência para desenvolvimento e assistentes de IA. A versão com detalhes de SOAP, XML de entrada e tabelas completas de `cStat` permanece em **`CONTEXTO.md`** (raiz do repositório). O manual do usuário e visão geral estão em **`README.md`**.

---

## 1. Visão geral

| Item | Descrição |
|------|-----------|
| Nome npm | `efis` (versão em `package.json`) |
| Produto | Escrituração Fiscal — eFis |
| Plataforma | Desktop **Windows** (instalador via Electron Builder) |
| Stack | **Electron** + **Next.js 14** (export estático) + **TypeScript** |
| UI | React, Tailwind, Ionicons / `@ionic/react` (onde aplicável) |
| Domínio | Integração com **SEFAZ-SP (NFC-e)** e **Ambiente Nacional (NF-e)** com **mTLS** (certificado e-CNPJ) |

Escopo funcional principal:

- **NFC-e (SP):** listagem com cancelamento, download unitário e em lote, relatório XLSX comparativo.
- **NF-e (AN):** Distribuição DFe (XML livre), Recepção de Evento, sincronização automática por **NSU**, listagem de XMLs salvos, logs de diagnóstico em disco.
- **Auxiliares:** relatório a partir de pasta de XMLs; fluxo **xml-retencao** (classificação/exportação conforme IPC em `preload`).

Comportamento de sessão: **não** há tela inicial de módulo; o app inicia em **NFC-e**; troca **NFC-e ↔ NF-e** (e módulos auxiliares) pela **sidebar**.

---

## 2. Arquitetura

```
Renderer (Next.js)     preload.ts (contextBridge)     Main (Node.js)
──────────────────     ─────────────────────────     ──────────────────
app/page.tsx           window.electron.*      ───►  electron/main.ts
components/nfce/…                             │      ├─ IPC handlers
hooks/                                        │      ├─ electron/sefaz.ts (NFC-e)
                                              │      ├─ electron/nfe*.ts (NF-e)
                                              │      ├─ PowerShell: listar / exportar PFX
                                              │      └─ fs, diálogos, updater
```

- O **renderer** não acessa Node, rede ou disco diretamente; só a API exposta em `window.electron`.
- Certificado: no **main**, com exportação **temporária** de PFX quando necessário; arquivo removido após o uso.
- **TLS:** uso documentado de `rejectUnauthorized: false` no agente Node por limitação de CAs da ICP-Brasil no bundle; cadeia reforçada no export PFX com `-ChainOption BuildChain` quando o Windows suporta.

---

## 3. Mapa de pastas (código)

| Área | Caminhos principais |
|------|---------------------|
| Electron | `electron/main.ts`, `preload.ts`, `sefaz.ts`, `nfe.ts`, `nfe-dist-dfe-build.ts`, `nfe-dist-dfe-sync.ts`, `nfe-dist-dfe-parser.ts`, `nfe-recepcao-evento-parser.ts`, `nfe-list-xmls-local.ts`, `updater.ts`, `electron.d.ts` |
| App Next | `app/layout.tsx`, `app/page.tsx`, `app/globals.css` |
| UI | `components/nfce/shell/`, `components/nfce/panels/`, `components/nfce/ui/` |
| Hooks | `hooks/use-certificate-persistence.ts`, `use-electron-app-meta.ts`, `use-auto-updater.ts`, `useIsElectron.ts`, etc. |
| Tipos UI | `types/nfce-app.ts` |
| Build | `next.config.mjs` (export), `tsconfig.json`, `tsconfig.electron.json`, `electron-builder.yml` |

---

## 4. Superfície IPC (`window.electron`)

Resumo do que `electron/preload.ts` expõe:

| Namespace | Função |
|-----------|--------|
| `cert` | Listar certs do sistema, testar store/arquivo, selecionar PFX, salvar/carregar config |
| `sefaz` | Listagem NFC-e (com cancelamento e progresso), download unitário/lote, progresso de lote |
| `nfe` | Distribuição DFe, recepção de evento, estado NSU, sync DistDFe (com eventos de progresso), listar XMLs salvos |
| `cte` | CT-e: consulta SP (`consSitCTe`), DistDFe AN (`cteDistDFeInteresse`), sync NSU, listagem, chaves sem procCTe, buscar proc faltantes |
| `fs` | Pasta, salvar XML, abrir pasta, ler UTF-8, importar XMLs de saída (NF-e/CT-e) |
| `relatorio` | Comparativo XLSX, listar XMLs da pasta |
| `xmlRetencao` | Seleção/análise/export/relatório XLSX do fluxo de retenção |
| `app` | Busy, versão, módulo ativo, timer de bloqueio NF-e **656** (get/set/clear por `certId`) |
| `ui` | Tema (light/dark/system) |
| `updater` | Check, download, install, listeners de eventos |

---

## 5. NFC-e (SEFAZ-SP)

- Endpoints e operações: **SOAP 1.2** — `NFCeListagemChaves`, `NFCeDownloadXML` (URLs em `CONTEXTO.md` / `README.md`).
- Paginação automática quando a SEFAZ retorna lista incompleta; limite máximo de páginas no código.
- **Saída:** o serviço lista/baixa cupons **emitidos** pelo CNPJ do certificado; o lote grava `*_nfce.xml` (nfeProc) e `*_evento.xml` quando houver.
- Relatório XLSX: nomes com razão social + CNPJ; valores numéricos no Excel com formato local ao abrir.
- Códigos `cStat` e formatos de data/XML: ver **`CONTEXTO.md`** seção 6–7 e 11.

---

## 6. NF-e (Ambiente Nacional)

- **NFeDistribuicaoDFe:** produção; `distDFeInt` sem CDATA no SOAP (evitar rejeição por XML mal formado). Recepção de evento com **CDATA** onde o WSDL exige conteúdo literal.
- **Sincronização por NSU:** pasta raiz configurável; subpastas por CNPJ; estado `.nfe-dist-state.json`; `sync-debug.log`; XMLs em `{ano}/{mes}/` com sufixos `_procNFe`, `_resNFe`, `_evento`, `_outro` para não colidir nota/evento na mesma chave; fallback `sem-data/00` quando não há data. Resultado da sync inclui `salvosPorTipo` (procNFe / resNFe / evento / outro).
- **Emitente vs destinatário (NT 2014.002):** a DistDFe **não** distribui ao emitente o `procNFe` da própria emissão (`consChNFe` → tipicamente **641**). Fluxo em 2 etapas: (1) DistDFe NSU grava eventos/chaves; (2) `NFeConsultaProtocolo4` SEFAZ-SP por chave (`electron/nfe-consulta-protocolo.ts`, IPC `nfe:buscar-proc-faltantes`) — só UF 35. Se a resposta não trouxer NFe com itens, use **Importar saída** (ERP).
- **cStat:** `138` documento(s) localizado(s); `137` nenhum (fim de “sem novos” no fluxo); `656` consumo indevido — UI com **timer** (~1 h típico); registro por certificado via IPC `app.*nfeBlockTimer*`.
- CNPJ da consulta de sync deve coincidir com o CNPJ do certificado (validação na UI).

---

## 7. CT-e (SEFAZ-SP + Ambiente Nacional)

- **Consulta por chave (SP):** `CTeConsultaV4` — `consSitCTe` / `retConsSitCTe` em `electron/cte.ts`, parser `electron/cte-consulta-parser.ts`, IPC `cte:consulta-situacao` → `window.electron.cte.consultaSituacao`.
- **Distribuição DFe (AN):** `CTeDistribuicaoDFe` — `cteDistDFeInteresse` / `retDistDFeInt` em `electron/cte-dist-dfe.ts`, build `cte-dist-dfe-build.ts`, parser `cte-dist-dfe-parser.ts`, sincronização `cte-dist-dfe-sync.ts`; IPC `cte:distribuicao-dfe`, `cte:dist-dfe-estado`, `cte:sync-dist-dfe`, evento `cte:sync-dist-progress`, `cte:listar-xmls-salvos`, `cte:listar-chaves-sem-proc`, `cte:buscar-proc-faltantes`. Estado `.cte-dist-state.json`; log `sync-cte-debug.log` na pasta raiz configurada. Sync retorna `salvosPorTipo` (procCTe / resCTe / evento / outro). Emitente tipicamente vê eventos na fila; XML de saída: Importar saída, consulta por chave ou busca limitada de proc faltantes.
- **Visão de arquitetura:** **`docs/ARQUITETURA-MODULO-CTE.md`**. Especificação e URLs: **`docs/MODULO-CTE-SEFAZ-SP.md`**. Logs de desenvolvimento: `DEBUG=cte`.

---

## 8. Certificado

| Modo | Senha na UI | Observação |
|------|-------------|------------|
| Repositório Windows | Não obrigatória | Certificado desbloqueado pelo SO; export PFX usa senha placeholder |
| Arquivo `.pfx` | Obrigatória | Validar antes de operações; senha via variável de ambiente no PowerShell para não vazar em mensagens de erro |

A senha **não** é persistida em disco pelo aplicativo.

---

## 9. Scripts e documentação irmã

| Documento | Conteúdo |
|-----------|-----------|
| `docs/GUIA-BUILD-EXE.md` | Build do instalador `.exe` |
| `docs/VERSIONAMENTO.md` | Versão alinhada ao `package.json` |
| `README.md` | Início rápido, pré-requisitos, tabela de serviços |
| `CONTEXTO.md` (raiz) | SOAP 1.2, envelopes, XMLs de exemplo, histórico de bugs, tabelas `cStat` |

Comandos úteis: `npm run dev`, `npm run build`, `npm run wsdl`, `npm run diagnostico:listagem`; variável `DEBUG=sefaz` para logs SOAP no desenvolvimento.

---

## 10. Dependências relevantes

`axios`, `fast-xml-parser`, `exceljs`, `electron-store`, `electron-updater`, `next`, `react`, `next-themes`, `electron`, `electron-builder`, `tailwindcss`, `typescript` (versões exatas em `package.json`).

---

*Última consolidação: referência estática para o repositório; alterações de comportamento devem ser refletidas aqui ou em `CONTEXTO.md` conforme o tipo de detalhe.*
