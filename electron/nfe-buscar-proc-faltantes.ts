/**
 * Após DistDFe NF-e: lista chaves com evento/res sem procNFe e tenta
 * NFeConsultaProtocolo4 (SEFAZ-SP) — fluxo em 2 etapas do pacote técnico.
 *
 * A DistDFe AN (consChNFe) costuma responder 641 ao emitente; a consulta
 * estadual por chave é a alternativa documentada para tentar o XML completo.
 */
import fs from 'fs'
import path from 'path'
import type https from 'https'
import type { ConfigCertNfe } from './nfe'
import {
  nfeConsultaProtocoloPorChave,
  type NfeConsultaAmbienteEndpoint,
} from './nfe-consulta-protocolo'
import { extrairXmlRetConsSitNFe, parsearRetConsSitNFe } from './nfe-consulta-protocolo-parser'
import { extrairAnoMesEmissao } from './nfe-dist-dfe-parser'
import { listarXmlsNfeSalvos } from './nfe-list-xmls-local'
import { resolverPastaCnpj } from './pasta-empresa'

export const NFE_BUSCAR_PROC_MAX_POR_EXEC = 40
export const NFE_BUSCAR_PROC_INTERVALO_MS = 600

/** cStat em que não vale insistir nesta chave. */
const CSTAT_DEFINITIVO = new Set(['217', '216', '562', '613', '226'])

export interface NfeBuscarProcProgresso {
  tipo: 'inicio' | 'chave' | 'concluido' | 'erro'
  chave?: string
  indice?: number
  total?: number
  mensagem?: string
  salvos?: number
  falhas?: number
  semProc?: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function procNFeJaExiste(pastaRaiz: string, cnpj14: string, chave: string): boolean {
  const cnpj = cnpj14.replace(/\D/g, '')
  const base = resolverPastaCnpj(pastaRaiz, cnpj)
  if (!fs.existsSync(base)) return false
  const nomeAlvo = `${chave}_procNFe.xml`
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

/** Chaves 44 com algum arquivo local, mas sem `*_procNFe.xml`.
 * Preferência: chaves com `*_resNFe.xml` e cSitNFe=1 (Autorização de Uso),
 * depois demais chaves só com evento/resumo.
 */
export function listarChavesNfeSemProc(pastaRaiz: string, cnpj14: string): string[] {
  const arquivos = listarXmlsNfeSalvos(pastaRaiz, cnpj14)
  const porChave = new Map<
    string,
    { temProc: boolean; temResNFe: boolean; temOutro: boolean; cSitNFe?: string }
  >()

  for (const a of arquivos) {
    const ch = a.chave.replace(/\D/g, '')
    if (ch.length !== 44) continue
    const cur = porChave.get(ch) ?? { temProc: false, temResNFe: false, temOutro: false }
    const nome = path.basename(a.caminho).toLowerCase()
    if (nome.includes('_procnfe')) {
      cur.temProc = true
    } else if (nome.includes('_resnfe')) {
      cur.temResNFe = true
      try {
        const xml = fs.readFileSync(a.caminho, 'utf-8')
        const m = xml.match(/<(?:[\w.-]+:)?cSitNFe>(\d)<\/(?:[\w.-]+:)?cSitNFe>/i)
        if (m?.[1]) cur.cSitNFe = m[1]
      } catch {
        /* ignora leitura */
      }
    } else {
      cur.temOutro = true
    }
    porChave.set(ch, cur)
  }

  const autorizadas: string[] = []
  const demais: string[] = []
  for (const [ch, v] of porChave) {
    if (v.temProc) continue
    if (!v.temResNFe && !v.temOutro) continue
    // resNFe com cSitNFe=1 = Autorização de Uso (não confundir com evento)
    if (v.temResNFe && (v.cSitNFe === '1' || !v.cSitNFe)) autorizadas.push(ch)
    else demais.push(ch)
  }
  autorizadas.sort()
  demais.sort()
  // Preferir resNFe autorizados; em seguida chaves só com evento (fallback)
  const soAutorizadas = new Set(autorizadas)
  return [...autorizadas, ...demais.filter((c) => !soAutorizadas.has(c))]
}

function chaveEhUfSp(chave: string): boolean {
  return chave.slice(0, 2) === '35'
}

function salvarProcNfeNaPasta(
  pastaRaiz: string,
  cnpj14: string,
  chave: string,
  xmlProc: string
): 'salvo' | 'ignorado' {
  const cnpj = cnpj14.replace(/\D/g, '')
  const am = extrairAnoMesEmissao(xmlProc)
  const ano = am?.ano ?? `20${chave.slice(2, 4)}`
  const mes = am?.mes ?? chave.slice(4, 6)
  const dir = path.join(resolverPastaCnpj(pastaRaiz, cnpj), ano, mes)
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, `${chave}_procNFe.xml`)
  if (fs.existsSync(dest)) return 'ignorado'
  fs.writeFileSync(dest, xmlProc, 'utf-8')
  return 'salvo'
}

export async function buscarProcNfeFaltantes(params: {
  config: ConfigCertNfe
  agente: https.Agent
  pastaRaiz: string
  cnpj14: string
  tpAmb?: '1' | '2'
  ambienteEndpoint?: NfeConsultaAmbienteEndpoint
  maxConsultas?: number
  intervaloMs?: number
  /** Se informado, usa esta lista em vez de varrer o disco. */
  chaves?: string[]
  onProgress?: (p: NfeBuscarProcProgresso) => void
}): Promise<{
  ok: boolean
  candidatos: number
  tentadas: number
  salvos: number
  ignorados: number
  falhas: number
  semProcNaResposta: number
  puladosUf: number
  xMotivo?: string
  log: string[]
}> {
  const pastaRaiz = String(params.pastaRaiz ?? '').trim()
  const cnpj14 = String(params.cnpj14 ?? '').replace(/\D/g, '')
  const max = Math.min(
    Math.max(1, params.maxConsultas ?? NFE_BUSCAR_PROC_MAX_POR_EXEC),
    NFE_BUSCAR_PROC_MAX_POR_EXEC
  )
  const intervalo = Math.max(300, params.intervaloMs ?? NFE_BUSCAR_PROC_INTERVALO_MS)
  const tpAmb: '1' | '2' = params.tpAmb === '2' ? '2' : '1'
  const ambienteEndpoint: NfeConsultaAmbienteEndpoint =
    params.ambienteEndpoint === 'homologacao' ? 'homologacao' : 'producao'
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
      puladosUf: 0,
      xMotivo: 'Pasta ou CNPJ inválido.',
      log,
    }
  }

  const baseLista =
    params.chaves && params.chaves.length > 0
      ? params.chaves.map((c) => c.replace(/\D/g, '')).filter((c) => c.length === 44)
      : listarChavesNfeSemProc(pastaRaiz, cnpj14)

  const candidatos = [...new Set(baseLista)].filter((ch) => !procNFeJaExiste(pastaRaiz, cnpj14, ch))
  const soSp = candidatos.filter(chaveEhUfSp)
  const puladosUf = candidatos.length - soSp.length
  const fila = soSp.slice(0, max)

  params.onProgress?.({
    tipo: 'inicio',
    total: fila.length,
    mensagem: `${candidatos.length} sem procNFe (${puladosUf} fora de SP); consultando até ${fila.length} na SEFAZ-SP (intervalo ${intervalo} ms).`,
  })
  log.push(
    `Candidatos: ${candidatos.length} (${puladosUf} UF≠35 pulados). Nesta execução: ${fila.length} (máx. ${max}).`
  )

  let salvos = 0
  let ignorados = 0
  let falhas = 0
  let semProcNaResposta = 0
  let tentadas = 0

  for (let i = 0; i < fila.length; i++) {
    const chave = fila[i]
    tentadas++
    params.onProgress?.({
      tipo: 'chave',
      chave,
      indice: i + 1,
      total: fila.length,
      mensagem: `Consultando ${chave}…`,
    })
    try {
      const soap = await nfeConsultaProtocoloPorChave(
        params.config,
        { chNFe: chave, tpAmb, ambienteEndpoint },
        params.agente
      )
      const inner = extrairXmlRetConsSitNFe(soap)
      const resumo = parsearRetConsSitNFe(inner)

      if (resumo.cStat === '656') {
        falhas++
        const msg = `[${chave}] cStat 656 — interrompendo lote.`
        log.push(msg)
        params.onProgress?.({ tipo: 'erro', chave, mensagem: msg })
        break
      }

      if (!resumo.xmlProcNFe) {
        semProcNaResposta++
        const hint =
          resumo.cStat === '100'
            ? 'autorizada, mas sem XML completo — use Portal Nacional ou Importar saída'
            : ''
        log.push(
          `[${chave}] [${resumo.cStat}] ${resumo.xMotivo || 'sem procNFe'}${hint ? ` · ${hint}` : ''}`
        )
        if (CSTAT_DEFINITIVO.has(resumo.cStat)) {
          /* não reconsultar */
        }
      } else {
        const r = salvarProcNfeNaPasta(pastaRaiz, cnpj14, chave, resumo.xmlProcNFe)
        if (r === 'salvo') {
          salvos++
          log.push(`[${chave}] procNFe salvo (SEFAZ-SP).`)
        } else {
          ignorados++
          log.push(`[${chave}] procNFe já existia.`)
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

  params.onProgress?.({
    tipo: 'concluido',
    salvos,
    falhas,
    semProc: semProcNaResposta,
    mensagem: `Concluído: ${salvos} salvos, ${semProcNaResposta} sem XML completo, ${falhas} falhas.`,
  })

  return {
    ok: true,
    candidatos: candidatos.length,
    tentadas,
    salvos,
    ignorados,
    falhas,
    semProcNaResposta,
    puladosUf,
    log,
  }
}
