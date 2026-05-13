import fs from 'fs'
import path from 'path'
import type https from 'https'
import type { ConfigCertNfe } from './nfe'
import { cteDistDFeInteresse } from './cte-dist-dfe'
import { montarDistDfeIntListagemNsuCte, formatarUltNsu } from './cte-dist-dfe-build'
import {
  compararNsu,
  devePersistirDocumentoDistDfeCte,
  extrairAnoMesEmissao,
  extrairChaveAcesso44Cte,
  extrairCnpjEmitenteDistDfeCte,
  extrairXmlRetDistDfeIntCte,
  extrairSufixoArquivoEventoCte,
  inferirTipoArquivoDistDfeCte,
  maiorNsuDosDocumentos,
  maxNsuValidoParaTerminoSincronia,
  parsearRetDistDfeInt,
  resumirTiposDocZipPorSchemaCte,
  type DistDfeFiltroPapel,
} from './cte-dist-dfe-parser'
import { extrairCnpjEmitenteDaChave44 } from './nfe-dist-dfe-parser'

export type { DistDfeFiltroPapel }

export interface CteDistDfeSyncProgresso {
  tipo: 'lote' | 'concluido' | 'erro'
  ultNSU?: string
  maxNSU?: string
  cStat?: string
  loteSalvos?: number
  loteIgnorados?: number
  loteFiltrados?: number
  totalSalvos?: number
  totalIgnorados?: number
  totalFiltrados?: number
  mensagem?: string
}

export interface CteDistDfeSyncResultado {
  ok: boolean
  totalSalvos: number
  totalIgnorados: number
  totalFiltrados: number
  ultNSU: string
  lotes: number
  xMotivo?: string
}

interface CteDistDfeSyncStateFile {
  ultNSU: string
  atualizadoEm: string
}

const STATE_FILENAME = '.cte-dist-state.json'
const DEBUG_LOG_FILENAME = 'sync-cte-debug.log'
const MAX_LOTES_SEGURANCA = 2000
const INTERVALO_ENTRE_LOTES_MS = 900

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function caminhoState(pastaRaiz: string, cnpj14: string): string {
  const base = path.join(pastaRaiz, cnpj14.replace(/\D/g, ''))
  return path.join(base, STATE_FILENAME)
}

function caminhoDebugLog(pastaRaiz: string, cnpj14: string): string {
  const base = path.join(pastaRaiz, cnpj14.replace(/\D/g, ''))
  return path.join(base, DEBUG_LOG_FILENAME)
}

function escreverDebugSync(
  pastaRaiz: string,
  cnpj14: string,
  payload: Record<string, string | number | boolean | undefined>
): void {
  try {
    const cnpj = cnpj14.replace(/\D/g, '')
    const dir = path.join(pastaRaiz, cnpj)
    fs.mkdirSync(dir, { recursive: true })
    const file = caminhoDebugLog(pastaRaiz, cnpj14)
    const ts = new Date().toISOString()
    const corpo = Object.entries(payload)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${String(v).replace(/\s+/g, ' ').trim()}`)
      .join(' | ')
    fs.appendFileSync(file, `[${ts}] ${corpo}\n`, 'utf-8')
  } catch {
    /* log nunca deve quebrar o fluxo principal */
  }
}

function lerStateArquivo(pastaRaiz: string, cnpj14: string): CteDistDfeSyncStateFile | null {
  const p = caminhoState(pastaRaiz, cnpj14)
  try {
    const raw = fs.readFileSync(p, 'utf-8')
    const j = JSON.parse(raw) as CteDistDfeSyncStateFile
    if (j && typeof j === 'object' && typeof j.ultNSU === 'string') return j
  } catch {
    /* sem estado */
  }
  return null
}

export function carregarUltNsuCte(pastaRaiz: string, cnpj14: string): string {
  const j = lerStateArquivo(pastaRaiz, cnpj14)
  if (j?.ultNSU && /^\d+$/.test(j.ultNSU.replace(/\D/g, ''))) return formatarUltNsu(j.ultNSU)
  return formatarUltNsu('0')
}

function persistirEstadoDistDfeCte(pastaRaiz: string, cnpj14: string, ultNSU: string): void {
  const cnpj = cnpj14.replace(/\D/g, '')
  const dir = path.join(pastaRaiz, cnpj)
  fs.mkdirSync(dir, { recursive: true })
  const payload: CteDistDfeSyncStateFile = {
    ultNSU: formatarUltNsu(ultNSU),
    atualizadoEm: new Date().toISOString(),
  }
  fs.writeFileSync(path.join(dir, STATE_FILENAME), JSON.stringify(payload, null, 2), 'utf-8')
}

function salvarDocumentoCte(
  pastaRaiz: string,
  cnpj14: string,
  xml: string,
  nsu: string,
  schema: string
): 'salvo' | 'ignorado' {
  const cnpj = cnpj14.replace(/\D/g, '')
  const chave = extrairChaveAcesso44Cte(xml)
  const tipo = inferirTipoArquivoDistDfeCte(schema, xml)
  const am = extrairAnoMesEmissao(xml)
  const ano = am?.ano ?? 'sem-data'
  const mes = am?.mes ?? '00'
  const nsuSeguro = (nsu || '0').replace(/\D/g, '') || '0'
  const schCurto = schema.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 48) || 'doc'
  let nomeArquivo: string
  if (chave && tipo === 'evento') {
    const suf = extrairSufixoArquivoEventoCte(xml).replace(/[^\dA-Za-z_-]/g, '').slice(0, 40) || 'evt'
    nomeArquivo = `${chave}_evento_${suf}.xml`
  } else if (chave) {
    nomeArquivo = `${chave}_${tipo}.xml`
  } else {
    nomeArquivo = `NSU_${nsuSeguro}_${tipo}_${schCurto}.xml`
  }

  const dir = path.join(pastaRaiz, cnpj, ano, mes)
  fs.mkdirSync(dir, { recursive: true })
  const destino = path.join(dir, nomeArquivo)

  if (fs.existsSync(destino)) return 'ignorado'
  fs.writeFileSync(destino, xml, 'utf-8')
  return 'salvo'
}

export type ProgressCallbackCte = (p: CteDistDfeSyncProgresso) => void

/**
 * Sincronização por NSU (CT-e AN). Não inclui fase extra por chave (consChCTe).
 */
export async function sincronizarDistDfeCte(params: {
  config: ConfigCertNfe
  agente: https.Agent
  pastaRaiz: string
  cnpj14: string
  cUFAutor: string
  reiniciarNsu: boolean
  filtroPapel?: DistDfeFiltroPapel
  onProgress?: ProgressCallbackCte
}): Promise<CteDistDfeSyncResultado> {
  const { config, agente, pastaRaiz, cnpj14, cUFAutor, reiniciarNsu, onProgress } = params
  const filtroPapel: DistDfeFiltroPapel = params.filtroPapel ?? 'todos'

  let ultNSU = reiniciarNsu ? formatarUltNsu('0') : carregarUltNsuCte(pastaRaiz, cnpj14)
  let totalSalvos = 0
  let totalIgnorados = 0
  let totalFiltrados = 0
  let lotes = 0
  let fase1Ok = false

  escreverDebugSync(pastaRaiz, cnpj14, {
    evento: 'sync_cte_inicio',
    cnpj14: cnpj14.replace(/\D/g, ''),
    cUFAutor,
    reiniciarNsu,
    filtroPapel,
    ultNSUInicial: ultNSU,
  })

  const emit = (p: CteDistDfeSyncProgresso) => {
    onProgress?.(p)
  }

  try {
    for (let i = 0; i < MAX_LOTES_SEGURANCA; i++) {
      if (i > 0) await delay(INTERVALO_ENTRE_LOTES_MS)

      const distXml = montarDistDfeIntListagemNsuCte({ cnpj14, cUFAutor, ultNSU })
      const soapXml = await cteDistDFeInteresse(config, distXml, agente)

      let retXml: string
      try {
        retXml = extrairXmlRetDistDfeIntCte(soapXml)
      } catch (e) {
        const snippet = soapXml.slice(0, 800)
        escreverDebugSync(pastaRaiz, cnpj14, {
          evento: 'erro_extracao_soap_cte',
          lote: i + 1,
          ultNSUSolicitado: ultNSU,
          motivo: e instanceof Error ? e.message : 'parse_soap',
        })
        return {
          ok: false,
          totalSalvos,
          totalIgnorados,
          totalFiltrados,
          ultNSU,
          lotes,
          xMotivo: `${e instanceof Error ? e.message : 'Parse SOAP'} — trecho: ${snippet}`,
        }
      }

      const ret = parsearRetDistDfeInt(retXml)
      lotes += 1
      escreverDebugSync(pastaRaiz, cnpj14, {
        evento: 'lote_recebido_cte',
        lote: lotes,
        ultNSUSolicitado: ultNSU,
        cStat: ret.cStat,
        xMotivo: ret.xMotivo,
        ultNSURetorno: ret.ultNSU,
        maxNSURetorno: ret.maxNSU,
        docZip: ret.documentos.length,
        tiposSchema: resumirTiposDocZipPorSchemaCte(ret.documentos),
      })

      if (ret.cStat === '656') {
        const nsuSolicitado656 = ultNSU
        const detalhe =
          ret.xMotivo ||
          'Consumo indevido: use sempre o ultNSU devolvido pela última resposta; aguarde ~1 h se a SEFAZ bloqueou.'
        const candidato656 = formatarUltNsu(ret.ultNSU.replace(/\D/g, ''))
        let ultApos656 = nsuSolicitado656
        if (candidato656 && compararNsu(candidato656, nsuSolicitado656) >= 0) {
          persistirEstadoDistDfeCte(pastaRaiz, cnpj14, candidato656)
          ultApos656 = candidato656
        } else {
          persistirEstadoDistDfeCte(pastaRaiz, cnpj14, nsuSolicitado656)
        }
        emit({ tipo: 'erro', cStat: '656', mensagem: detalhe })
        escreverDebugSync(pastaRaiz, cnpj14, {
          evento: 'erro_656_cte',
          lote: lotes,
          ultNSUSolicitado: nsuSolicitado656,
          ultNSUPersistido: ultApos656,
          xMotivo: detalhe,
        })
        return {
          ok: false,
          totalSalvos,
          totalIgnorados,
          totalFiltrados,
          ultNSU: ultApos656,
          lotes,
          xMotivo: `[656] ${detalhe}`,
        }
      }

      if (ret.cStat === '137') {
        ultNSU = ret.ultNSU
        persistirEstadoDistDfeCte(pastaRaiz, cnpj14, ultNSU)
        escreverDebugSync(pastaRaiz, cnpj14, {
          evento: 'sync_cte_concluido_137_sem_docs',
          lote: lotes,
          ultNSU,
          maxNSU: ret.maxNSU,
          totalSalvos,
          totalIgnorados,
          totalFiltrados,
          xMotivo: ret.xMotivo,
        })
        fase1Ok = true
        break
      }

      if (ret.cStat !== '138') {
        escreverDebugSync(pastaRaiz, cnpj14, {
          evento: 'erro_cstat_nao_sucesso_cte',
          lote: lotes,
          cStat: ret.cStat,
          xMotivo: ret.xMotivo,
          ultNSU,
        })
        return {
          ok: false,
          totalSalvos,
          totalIgnorados,
          totalFiltrados,
          ultNSU,
          lotes,
          xMotivo: `[${ret.cStat}] ${ret.xMotivo || 'Resposta não sucedida.'}`,
        }
      }

      let loteSalvos = 0
      let loteIgnorados = 0
      let loteFiltrados = 0
      let filtDiag = { procCTe: 0, resCTe: 0, evento: 0, outro: 0, matchEmKey: 0 }
      const cnpjLimpo = cnpj14.replace(/\D/g, '')
      for (const doc of ret.documentos) {
        const persistir = devePersistirDocumentoDistDfeCte(doc.xmlUtf8, doc.schema, cnpj14, filtroPapel)
        if (!persistir) {
          loteFiltrados++
          totalFiltrados++
          if (filtroPapel !== 'todos') {
            const tipo = inferirTipoArquivoDistDfeCte(doc.schema, doc.xmlUtf8)
            const ch = extrairChaveAcesso44Cte(doc.xmlUtf8)
            const emDaChave = ch ? extrairCnpjEmitenteDaChave44(ch) : undefined
            if (tipo === 'procCTe') filtDiag.procCTe++
            else if (tipo === 'resCTe') filtDiag.resCTe++
            else if (tipo === 'evento') filtDiag.evento++
            else filtDiag.outro++
            if (emDaChave === cnpjLimpo) filtDiag.matchEmKey++
            if (tipo !== 'evento' && emDaChave === cnpjLimpo) {
              const emExtraido = extrairCnpjEmitenteDistDfeCte(doc.xmlUtf8)
              escreverDebugSync(pastaRaiz, cnpj14, {
                evento: 'doc_filtrado_inesperado_cte',
                lote: lotes,
                nsu: doc.nsu,
                schema: doc.schema,
                tipo,
                chave: ch ?? '(sem chave)',
                emitenteDaChave: emDaChave,
                emitenteExtraido: emExtraido ?? '(nenhum)',
                cnpjConsulta: cnpjLimpo,
                matchEmitente: String(emExtraido === cnpjLimpo),
                xmlTrecho: doc.xmlUtf8.slice(0, 300),
              })
            }
          }
          continue
        }
        const r = salvarDocumentoCte(pastaRaiz, cnpj14, doc.xmlUtf8, doc.nsu, doc.schema)
        if (r === 'salvo') {
          loteSalvos++
          totalSalvos++
        } else {
          loteIgnorados++
          totalIgnorados++
        }
      }

      if (filtroPapel !== 'todos' && loteFiltrados > 0) {
        escreverDebugSync(pastaRaiz, cnpj14, {
          evento: 'filtro_resumo_lote_cte',
          lote: lotes,
          filtro: filtroPapel,
          filtProcCTe: filtDiag.procCTe,
          filtResCTe: filtDiag.resCTe,
          filtEvento: filtDiag.evento,
          filtOutro: filtDiag.outro,
          filtComChaveEmitMatch: filtDiag.matchEmKey,
          loteSalvos,
          loteIgnorados,
          loteFiltrados,
        })
      }

      const nsuSolicitadoNesteLote = ultNSU
      let proximoUlt = formatarUltNsu(ret.ultNSU)
      const maxDocNsu = maiorNsuDosDocumentos(ret.documentos)
      if (maxDocNsu && compararNsu(maxDocNsu, proximoUlt) > 0) {
        proximoUlt = maxDocNsu
      }
      if (compararNsu(proximoUlt, nsuSolicitadoNesteLote) <= 0 && ret.documentos.length > 0) {
        if (maxDocNsu) proximoUlt = maxDocNsu
      }
      if (compararNsu(proximoUlt, nsuSolicitadoNesteLote) <= 0 && ret.documentos.length > 0) {
        emit({
          tipo: 'erro',
          mensagem:
            'NSU não avançou após lote com documentos — possível falha de leitura do XML. Aguarde antes de tentar de novo.',
        })
        escreverDebugSync(pastaRaiz, cnpj14, {
          evento: 'erro_nsu_sem_avanco_cte',
          lote: lotes,
          ultNSUSolicitado: nsuSolicitadoNesteLote,
          ultNSURetornado: ret.ultNSU,
          maxNSURetornado: ret.maxNSU,
          docZip: ret.documentos.length,
        })
        return {
          ok: false,
          totalSalvos,
          totalIgnorados,
          totalFiltrados,
          ultNSU: nsuSolicitadoNesteLote,
          lotes,
          xMotivo:
            'O ultNSU da resposta não superou o NSU solicitado. Verifique o XML retornado ou aguarde ~1 h se recebeu 656 antes.',
        }
      }

      ultNSU = proximoUlt
      persistirEstadoDistDfeCte(pastaRaiz, cnpj14, ultNSU)

      emit({
        tipo: 'lote',
        ultNSU,
        maxNSU: ret.maxNSU,
        cStat: '138',
        loteSalvos,
        loteIgnorados,
        loteFiltrados,
        totalSalvos,
        totalIgnorados,
        totalFiltrados,
        mensagem: ret.xMotivo,
      })

      if (maxNsuValidoParaTerminoSincronia(ret.maxNSU) && compararNsu(ultNSU, ret.maxNSU) >= 0) {
        escreverDebugSync(pastaRaiz, cnpj14, {
          evento: 'sync_cte_concluido_max_nsu',
          lote: lotes,
          ultNSU,
          maxNSU: ret.maxNSU,
          totalSalvos,
          totalIgnorados,
          totalFiltrados,
        })
        fase1Ok = true
        break
      }

      if (ret.documentos.length === 0) {
        escreverDebugSync(pastaRaiz, cnpj14, {
          evento: 'sync_cte_concluido_sem_doczip',
          lote: lotes,
          ultNSU,
          maxNSU: ret.maxNSU,
          totalSalvos,
          totalIgnorados,
          totalFiltrados,
          xMotivo: ret.xMotivo,
        })
        fase1Ok = true
        break
      }
    }

    if (fase1Ok) {
      persistirEstadoDistDfeCte(pastaRaiz, cnpj14, ultNSU)
      emit({
        tipo: 'concluido',
        ultNSU,
        totalSalvos,
        totalIgnorados,
        totalFiltrados,
        mensagem: 'Sincronização concluída.',
      })
      return { ok: true, totalSalvos, totalIgnorados, totalFiltrados, ultNSU, lotes }
    }

    persistirEstadoDistDfeCte(pastaRaiz, cnpj14, ultNSU)
    return {
      ok: false,
      totalSalvos,
      totalIgnorados,
      totalFiltrados,
      ultNSU,
      lotes,
      xMotivo: `Limite de ${MAX_LOTES_SEGURANCA} lotes atingido (proteção).`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    try {
      persistirEstadoDistDfeCte(pastaRaiz, cnpj14, ultNSU)
    } catch {
      /* não falhar por I/O de estado */
    }
    escreverDebugSync(pastaRaiz, cnpj14, {
      evento: 'erro_excecao_sync_cte',
      ultNSU,
      lotes,
      totalSalvos,
      totalIgnorados,
      totalFiltrados,
      motivo: msg,
    })
    emit({ tipo: 'erro', mensagem: msg })
    return {
      ok: false,
      totalSalvos,
      totalIgnorados,
      totalFiltrados,
      ultNSU,
      lotes,
      xMotivo: msg,
    }
  }
}
