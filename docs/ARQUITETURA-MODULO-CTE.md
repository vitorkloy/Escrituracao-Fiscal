# Arquitetura do módulo CT-e (eFis)

Documento de **referência sistémica**: camadas, ficheiros, fluxos de dados e IPC. O módulo CT-e combina **dois eixos** independentes — **SEFAZ-SP (consulta por chave)** e **Ambiente Nacional (distribuição por NSU)** — partilhando certificado, bridge Electron e padrões de UI do eFis.

---

## 1. Visão em camadas

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js (renderer)                                         │
│  app/page.tsx · MainPanelArea · nav-config · painéis CT-e   │
└──────────────────────────┬──────────────────────────────────┘
                           │ window.electron (contextBridge)
┌──────────────────────────▼──────────────────────────────────┐
│  preload.ts — expõe cte.* + fs + app                        │
└──────────────────────────┬──────────────────────────────────┘
                           │ ipcMain.invoke / send
┌──────────────────────────▼──────────────────────────────────┐
│  main.ts — handlers cte:* , agente HTTPS, certificado PFX   │
└───────┬───────────────────────────────┬───────────────────────┘
        │                               │
        ▼                               ▼
┌───────────────┐             ┌───────────────────────────────┐
│  cte.ts       │             │  cte-dist-dfe.ts              │
│  SP consulta  │             │  AN CTeDistribuicaoDFe        │
└───────────────┘             └───────────┬───────────────────┘
                                          │
                              ┌───────────▼───────────────────┐
                              │  cte-dist-dfe-build/parser/   │
                              │  sync · list-xmls-local       │
                              └───────────────────────────────┘
```

---

## 2. Eixo A — Consulta por chave (SEFAZ-SP)

| Peça | Ficheiro | Função |
|------|----------|--------|
| SOAP + URLs | `electron/cte.ts` | `CTeConsultaV4.asmx` (prod/hom), envelope `cteCabecMsg` + `cteDadosMsg`, `consSitCTe` 4.00, retry em erros de rede |
| Parse | `electron/cte-consulta-parser.ts` | Extrair `retConsSitCTe`, `cStat`, `protCTe` / `procCTe` quando existir |
| IPC | `main.ts` | `cte:consulta-situacao` |
| UI | `components/nfce/panels/cte-consulta-panel.tsx` | Chave 44, `tpAmb`, endpoint prod/hom, salvar XMLs |

**Não existe** na SEFAZ-SP um serviço equivalente ao `NFCeListagemChaves` para “listar só chaves de CT-e emitidos por período”. Para listagem sem chave inicial usa-se o **eixo B**.

---

## 3. Eixo B — Distribuição DFe (Ambiente Nacional)

| Peça | Ficheiro | Função |
|------|----------|--------|
| Montagem `distDFeInt` | `electron/cte-dist-dfe-build.ts` | Namespace CT-e, `versao` do leiaute, `tpAmb=1` (produção fixa no pedido atual) |
| SOAP AN | `electron/cte-dist-dfe.ts` | `cteDistDFeInteresse` → `https://www1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx` |
| Parse / filtros | `electron/cte-dist-dfe-parser.ts` | `retDistDFeInt`, `docZip`, chave CT-e, tipo proc/res/evento, filtro emitente/destinatário |
| Sincronização | `electron/cte-dist-dfe-sync.ts` | Loop NSU, `137`/`138`/`656`, estado `.cte-dist-state.json`, `sync-cte-debug.log`, progresso com `documentosLote` |
| Listagem disco | `electron/cte-list-xmls-local.ts` | Varre `CNPJ/ano/mês/*_procCTe.xml` etc. |
| IPC | `main.ts` | `cte:distribuicao-dfe`, `cte:dist-dfe-estado`, `cte:sync-dist-dfe`, `cte:listar-xmls-salvos`; evento `cte:sync-dist-progress` |
| UI | `components/nfce/panels/cte-distribuicao-dfe-panel.tsx` | Sincronizar, tabela de sessão, arquivos salvos, XML avançado |

**Persistência de estado (por CNPJ na pasta raiz):**

- `.cte-dist-state.json` — `ultNSU` (e metadados de atualização).
- `sync-cte-debug.log` — linhas de diagnóstico por sincronização.

**Gravação de XML:** `CNPJ/ano/mês/{chave}_{procCTe|resCTe|evento|outro}.xml` (ou `NSU_*` se não houver chave).

---

## 4. Integração na aplicação (módulo + abas)

| Conceito | Onde |
|----------|------|
| `AppModule` `'cte'` | `types/nfce-app.ts`, `main.ts`, `preload.ts`, `electron.d.ts` |
| Abas `cte-dist-dfe`, `cte-consulta` | `types/nfce-app.ts`, `nav-config.ts` (`CTE_NAV_TABS`), `main-panel-area.tsx` |
| Escolha inicial | `module-picker-screen.tsx` |
| Certificado | Mesmo `CertificateUiState` / `ConfigPanel`; avisos `CertificatePasswordWarning` com `context` `cte` ou `cte-dist` |
| Manual in-app | `manual-panel.tsx` — secção “Módulo CT-e” |

---

## 5. Nota sobre “DCT-e” / DACTe

O nome **“DCT-e”** não corresponde a um webservice padrão listado junto do CT-e. O documento auxiliar **impresso** do CT-e é o **DACTe** (representação para acompanhar carga); a geração fiel costuma ser **local** a partir do XML (`procCTe`), não um `.asmx` da SEFAZ. O eFis **não** inclui ainda gerador de DACTe/PDF — apenas XML e consulta/distribuição conforme esta arquitetura.

---

## 6. Referências cruzadas

| Documento | Conteúdo |
|-----------|-----------|
| `docs/MODULO-CTE-SEFAZ-SP.md` | URLs SP, SOAP consulta, notas de produto/homolog |
| `docs/INTEGRACAO-MODULO-CTE.md` | Checklist de integração na UI (histórico + estado) |
| `docs/CONTEXTO-SISTEMA.md` | Tabela IPC e secção CT-e resumida |

---

*Última revisão alinhada ao código em `electron/cte*.ts` e painéis `cte-*-panel.tsx`.*
