/**
 * Após DistDFe CT-e: lista chaves com evento/res sem procCTe e tenta consSitCTe
 * (limites: máx. por execução + intervalo entre chamadas).
 */
import fs from 'fs'
import path from 'path'
import type https from 'https'
import type { ConfigCert } from './sefaz'
import { cteConsultaSituacaoPorChave, type CteAmbienteEndpoint } from './cte'
import { extrairXmlRetConsSitCTe, parsearRetConsSitCTe } from './cte-consulta-parser'
import { extrairAnoMesEmissao } from './nfe-dist-dfe-parser'
import { listarXmlsCteSalvos } from './cte-list-xmls-local'

export const CTE_BUSCAR_PROC_MAX_POR_EXEC = 10
export const CTE_BUSCAR_PROC_INTERVALO_MS = 3_000

export interface CteBuscarProcProgresso {
  tipo: 'inicio' | 'chave' | 'concluido' | 'erro'
  chave?: string
  indice?: number
  total?: number
  mensagem?: string
  salvos?: number
  falhas?: number
  semProc?: number
  pulados?: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function procCteJaExiste(pastaRaiz: string, cnpj14: string, chave: string): boolean {
  const cnpj = cnpj14.replace(/\D/g, '')
  const base = path.join(pastaRaiz, cnpj)
  if (!fs.existsSync(base)) return false
  const nomeAlvo = `${chave}_procCTe.xml`
  function walk(dir: string): boolean {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return false
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        if (walk(full)) return true
      } else if (ent.isFile() && ent.name.toLowerCase() === nomeAlvo.toLowerCase()) {
        return true
      }
    }
    return false
  }
  return walk(base)
}

/** Chaves 44 com algum arquivo local, mas sem `*_procCTe.xml`. */
export function listarChavesCteSemProc(pastaRaiz: string, cnpj14: string): string[] {
  const arquivos = listarXmlsCteSalvos(pastaRaiz, cnpj14)
  const porChave = new Map<string, { temProc: boolean; temOutro: boolean }>()
  for (const a of arquivos) {
    const ch = a.chave.replace(/\D/g, '')
    if (ch.length !== 44) continue
    const cur = porChave.get(ch) ?? { temProc: false, temOutro: false }
    const nome = path.basename(a.caminho).toLowerCase()
    if (nome.includes('_proccte')) cur.temProc = true
    else cur.temOutro = true
    porChave.set(ch, cur)
  }
  return [...porChave.entries()]
    .filter(([, v]) => !v.temProc && v.temOutro)
    .map(([ch]) => ch)
    .sort()
}

function salvarProcCteNaPasta(
  pastaRaiz: string,
  cnpj14: string,
  chave: string,
  xmlProc: string
): 'salvo' | 'ignorado' {
  const cnpj = cnpj14.replace(/\D/g, '')
  const am = extrairAnoMesEmissao(xmlProc)
  const ano = am?.ano ?? `20${chave.slice(2, 4)}`
  const mes = am?.mes ?? chave.slice(4, 6)
  const dir = path.join(pastaRaiz, cnpj, ano, mes)
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, `${chave}_procCTe.xml`)
  if (fs.existsSync(dest)) return 'ignorado'
  fs.writeFileSync(dest, xmlProc, 'utf-8')
  return 'salvo'
}

export async function buscarProcCteFaltantes(params: {
  config: ConfigCert
  agente: https.Agent
  pastaRaiz: string
  cnpj14: string
  tpAmb: '1' | '2'
  ambienteEndpoint: CteAmbienteEndpoint
  maxConsultas?: number
  intervaloMs?: number
  onProgress?: (p: CteBuscarProcProgresso) => void
}): Promise<{
  ok: boolean
  candidatos: number
  tentadas: number
  salvos: number
  ignorados: number
  falhas: number
  semProcNaResposta: number
  xMotivo?: string
  log: string[]
}> {
  const pastaRaiz = String(params.pastaRaiz ?? '').trim()
  const cnpj14 = String(params.cnpj14 ?? '').replace(/\D/g, '')
  const max = Math.min(
    Math.max(1, params.maxConsultas ?? CTE_BUSCAR_PROC_MAX_POR_EXEC),
    CTE_BUSCAR_PROC_MAX_POR_EXEC
  )
  const intervalo = Math.max(1_000, params.intervaloMs ?? CTE_BUSCAR_PROC_INTERVALO_MS)
  const log: string[] = []

  if (!pastaRaiz || cnpj14.length !== 14) {
    return {
      ok: false,
      candidatos: 0,
      tentadas: 0,
      salvos: 0,
      ignorados: 0,
      falhas: 0,
      semProcNaResposta: 0,
      xMotivo: 'Pasta ou CNPJ inválido.',
      log,
    }
  }

  const candidatos = listarChavesCteSemProc(pastaRaiz, cnpj14).filter(
    (ch) => !procCteJaExiste(pastaRaiz, cnpj14, ch)
  )
  const fila = candidatos.slice(0, max)

  params.onProgress?.({
    tipo: 'inicio',
    total: fila.length,
    mensagem: `${candidatos.length} chave(s) sem procCTe; consultando até ${fila.length} (intervalo ${intervalo} ms).`,
  })
  log.push(
    `Candidatos: ${candidatos.length}. Nesta execução: ${fila.length} (máx. ${max}, intervalo ${intervalo} ms).`
  )

  let salvos = 0
  let ignorados = 0
  let falhas = 0
  let semProcNaResposta = 0

  for (let i = 0; i < fila.length; i++) {
    const chave = fila[i]
    params.onProgress?.({
      tipo: 'chave',
      chave,
      indice: i + 1,
      total: fila.length,
      mensagem: `Consultando ${chave}…`,
    })
    try {
      const xmlResposta = await cteConsultaSituacaoPorChave(
        params.config,
        {
          chCTe: chave,
          tpAmb: params.tpAmb,
          ambienteEndpoint: params.ambienteEndpoint,
        },
        params.agente
      )
      const inner = extrairXmlRetConsSitCTe(xmlResposta)
      const resumo = parsearRetConsSitCTe(inner)
      if (resumo.cStat === '656') {
        falhas++
        const msg = `[${chave}] cStat 656 — consumo indevido; interrompendo lote.`
        log.push(msg)
        params.onProgress?.({ tipo: 'erro', chave, mensagem: msg })
        break
      }
      if (!resumo.xmlProcCTe) {
        semProcNaResposta++
        log.push(`[${chave}] [${resumo.cStat}] ${resumo.xMotivo || 'sem xmlProcCTe na resposta'}`)
      } else {
        const r = salvarProcCteNaPasta(pastaRaiz, cnpj14, chave, resumo.xmlProcCTe)
        if (r === 'salvo') {
          salvos++
          log.push(`[${chave}] procCTe salvo.`)
        } else {
          ignorados++
          log.push(`[${chave}] procCTe já existia.`)
        }
      }
    } catch (err) {
      falhas++
      const m = err instanceof Error ? err.message : String(err)
      log.push(`[${chave}] falha: ${m}`)
      params.onProgress?.({ tipo: 'erro', chave, mensagem: m })
    }
    if (i < fila.length - 1) await sleep(intervalo)
  }

  const result = {
    ok: true as const,
    candidatos: candidatos.length,
    tentadas: Math.min(fila.length, salvos + ignorados + falhas + semProcNaResposta),
    salvos,
    ignorados,
    falhas,
    semProcNaResposta,
    log,
  }
  params.onProgress?.({
    tipo: 'concluido',
    salvos,
    falhas,
    semProc: semProcNaResposta,
    mensagem: `Concluído: ${salvos} salvos, ${semProcNaResposta} sem proc, ${falhas} falhas.`,
  })
  return result
}
