import fs from 'fs'
import path from 'path'
import { XMLParser } from 'fast-xml-parser'

export const DIR_COM_RETENCAO = 'retencao'
export const DIR_SEM_RETENCAO = 'sem_retencao'
export const DIR_INVALIDOS = 'invalidos'
export const RETENCAO_PERCENTUAL_NAO_IDENTIFICADO = 'percentual_nao_identificado'

const MAX_XML_BYTES = 14 * 1024 * 1024

export type OrigemDeteccaoRetencao = 'infCpl' | 'retTrib' | 'retTrib-regex' | 'none'

export interface ClassificacaoRetencaoOk {
  classe: typeof DIR_COM_RETENCAO | typeof DIR_SEM_RETENCAO
  origemDeteccao: OrigemDeteccaoRetencao
  percentualRetencao?: string
  percentualPasta?: string
}

export interface ClassificacaoRetencaoInvalido {
  classe: typeof DIR_INVALIDOS
  erro: string
  origemDeteccao: OrigemDeteccaoRetencao
}

export type ResultadoClassificacaoXmlRetencao = ClassificacaoRetencaoOk | ClassificacaoRetencaoInvalido

/** Grupo total.retTrib e campos relacionados tipados no layout NF-e (valores monetários). */
function valorNumericoEhRetencaoPositiva(raw: unknown): boolean {
  if (raw === null || raw === undefined) return false
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0
  const s = String(raw).trim().replace(',', '.')
  const n = parseFloat(s)
  return !Number.isNaN(n) && n > 0
}

/** Percorre o objeto retido em retTrib (ou equivalente). */
export function retTribIndicaValorPositivo(retTrib: unknown): boolean {
  if (retTrib === null || retTrib === undefined || retTrib === '') return false
  if (typeof retTrib !== 'object') {
    return valorNumericoEhRetencaoPositiva(retTrib)
  }
  if (Array.isArray(retTrib)) {
    return retTrib.some((x) => retTribIndicaValorPositivo(x))
  }
  const o = retTrib as Record<string, unknown>
  return Object.entries(o).some(([k, v]) => {
    if (v === null || v === undefined) return false
    if (typeof v === 'object') return retTribIndicaValorPositivo(v)
    if (/^@_/i.test(k)) return false
    return valorNumericoEhRetencaoPositiva(v)
  })
}

function encontrarRetTribNoObjeto(data: unknown): unknown {
  if (data === null || data === undefined) return undefined
  if (typeof data !== 'object') return undefined
  if (Array.isArray(data)) {
    for (const el of data) {
      const r = encontrarRetTribNoObjeto(el)
      if (r !== undefined) return r
    }
    return undefined
  }
  const o = data as Record<string, unknown>
  if ('retTrib' in o) return o.retTrib
  for (const v of Object.values(o)) {
    const r = encontrarRetTribNoObjeto(v)
    if (r !== undefined) return r
  }
  return undefined
}

function encontrarPrimeiroTextoPorChave(data: unknown, chave: string): string | undefined {
  if (data === null || data === undefined) return undefined
  if (typeof data !== 'object') return undefined
  if (Array.isArray(data)) {
    for (const el of data) {
      const r = encontrarPrimeiroTextoPorChave(el, chave)
      if (r) return r
    }
    return undefined
  }
  const o = data as Record<string, unknown>
  const val = o[chave]
  if (typeof val === 'string' && val.trim()) return val.trim()
  for (const item of Object.values(o)) {
    const r = encontrarPrimeiroTextoPorChave(item, chave)
    if (r) return r
  }
  return undefined
}

function extrairInfCplPorRegex(xml: string): string | undefined {
  const m = /<infCpl>([\s\S]*?)<\/infCpl>/i.exec(xml)
  if (!m?.[1]) return undefined
  const limpo = m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return limpo || undefined
}

function normalizarPercentualNumerico(valorBruto: string): string {
  const limpo = valorBruto.replace(',', '.').trim()
  const n = Number.parseFloat(limpo)
  if (!Number.isFinite(n)) return ''
  return n.toFixed(2).replace('.', ',')
}

function slugPercentualParaPasta(percentualNormalizado: string): string {
  const base = percentualNormalizado.replace(/[^\d,.-]/g, '').replace(/\./g, ',').trim()
  return base ? `${base}_porcento` : RETENCAO_PERCENTUAL_NAO_IDENTIFICADO
}

function extrairPercentualRetencaoDoTexto(texto: string): string | undefined {
  if (!texto) return undefined
  const regexes = [
    /reten[cç][aã]o\s*de\s*([0-9]+(?:[.,][0-9]+)?)\s*%/i,
    /ret(?:en[cç][aã]o)?\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)\s*%\s*(?:ir|na fonte|irrf)?/i,
    /([0-9]+(?:[.,][0-9]+)?)\s*%\s*(?:ir\s+na\s+fonte|irrf|reten[cç][aã]o)/i,
  ]
  for (const re of regexes) {
    const m = re.exec(texto)
    const g = m?.[1]?.trim()
    if (!g) continue
    const norm = normalizarPercentualNumerico(g)
    if (norm) return norm
  }
  return undefined
}

function textoMencionaRetencao(texto: string): boolean {
  return /reten[cç][aã]o|ir\s+na\s+fonte|irrf/i.test(texto)
}

/** Heurística rápida: documento típico de NF-e/NFC-e com infNFe. */
export function pareceXmlNfeOuNfce(conteudo: string): boolean {
  return /<(nfeProc|nfceProc|inutNFe|procInutNFe)\b/i.test(conteudo) || /<infNFe\b/i.test(conteudo)
}

/**
 * Fallback quando o DOM parseado falha ou não expõe retTrib: busca um bloco <retTrib>...</retTrib>
 * no texto e valores monetários dentro de tags v- no layout da NF-e.
 */
function pareceHaRetencaoPorRegex(xml: string): boolean {
  if (/<retTrib\b[^/]*\/\s*>/i.test(xml)) return false
  const m = /<retTrib\b[^>]*>([\s\S]*?)<\/retTrib>/i.exec(xml)
  if (!m) return false
  const inner = m[1] ?? ''
  const numRe = />\s*([0-9][0-9.,]*)\s*</g
  let g: RegExpExecArray | null
  while ((g = numRe.exec(inner)) !== null) {
    const val = parseFloat(String(g[1]).replace(',', '.'))
    if (!Number.isNaN(val) && val > 0) return true
  }
  return false
}

const xmlParserSoft = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
})

/** Classifica pelo infCpl e, em fallback, pelo total.retTrib. */
export function classificarXmlRetencaoDeString(conteudo: string): ResultadoClassificacaoXmlRetencao {
  if (!conteudo || !String(conteudo).trim()) {
    return { classe: DIR_INVALIDOS, erro: 'XML vazio.', origemDeteccao: 'none' }
  }
  try {
    const parsed = xmlParserSoft.parse(conteudo) as Record<string, unknown>

    const infCpl = encontrarPrimeiroTextoPorChave(parsed, 'infCpl') ?? extrairInfCplPorRegex(conteudo)
    if (infCpl) {
      const percentual = extrairPercentualRetencaoDoTexto(infCpl)
      if (percentual) {
        return {
          classe: DIR_COM_RETENCAO,
          origemDeteccao: 'infCpl',
          percentualRetencao: percentual,
          percentualPasta: slugPercentualParaPasta(percentual),
        }
      }
      if (textoMencionaRetencao(infCpl)) {
        return {
          classe: DIR_COM_RETENCAO,
          origemDeteccao: 'infCpl',
          percentualPasta: RETENCAO_PERCENTUAL_NAO_IDENTIFICADO,
        }
      }
    }

    const rt = encontrarRetTribNoObjeto(parsed)
    if (retTribIndicaValorPositivo(rt)) {
      return {
        classe: DIR_COM_RETENCAO,
        origemDeteccao: 'retTrib',
        percentualPasta: RETENCAO_PERCENTUAL_NAO_IDENTIFICADO,
      }
    }
    if (pareceHaRetencaoPorRegex(conteudo)) {
      return {
        classe: DIR_COM_RETENCAO,
        origemDeteccao: 'retTrib-regex',
        percentualPasta: RETENCAO_PERCENTUAL_NAO_IDENTIFICADO,
      }
    }
    if (!pareceXmlNfeOuNfce(conteudo)) {
      return {
        classe: DIR_INVALIDOS,
        erro: 'Arquivo não reconhecido como NF-e/NFC-e (infNFe / nfeProc).',
        origemDeteccao: 'none',
      }
    }
    return { classe: DIR_SEM_RETENCAO, origemDeteccao: 'none' }
  } catch (e: unknown) {
    try {
      const infCplRaw = extrairInfCplPorRegex(conteudo)
      if (infCplRaw) {
        const percentual = extrairPercentualRetencaoDoTexto(infCplRaw)
        if (percentual) {
          return {
            classe: DIR_COM_RETENCAO,
            origemDeteccao: 'infCpl',
            percentualRetencao: percentual,
            percentualPasta: slugPercentualParaPasta(percentual),
          }
        }
        if (textoMencionaRetencao(infCplRaw)) {
          return {
            classe: DIR_COM_RETENCAO,
            origemDeteccao: 'infCpl',
            percentualPasta: RETENCAO_PERCENTUAL_NAO_IDENTIFICADO,
          }
        }
      }
      if (pareceHaRetencaoPorRegex(conteudo)) {
        return {
          classe: DIR_COM_RETENCAO,
          origemDeteccao: 'retTrib-regex',
          percentualPasta: RETENCAO_PERCENTUAL_NAO_IDENTIFICADO,
        }
      }
      if (pareceXmlNfeOuNfce(conteudo)) return { classe: DIR_SEM_RETENCAO, origemDeteccao: 'none' }
    } catch {
      /* ignore */
    }
    const msg = e instanceof Error ? e.message : String(e)
    return { classe: DIR_INVALIDOS, erro: `Falha ao interpretar XML: ${msg}`, origemDeteccao: 'none' }
  }
}

export function classificarArquivoXmlPorCaminho(caminho: string): ResultadoClassificacaoXmlRetencao {
  let p = path.resolve(String(caminho ?? ''))
  try {
    p = fs.realpathSync(p)
  } catch {
    return { classe: DIR_INVALIDOS, erro: 'Arquivo não encontrado ou inacessível.', origemDeteccao: 'none' }
  }
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) {
    return { classe: DIR_INVALIDOS, erro: 'Arquivo não encontrado.', origemDeteccao: 'none' }
  }
  const stat = fs.statSync(p)
  if (stat.size > MAX_XML_BYTES) {
    return {
      classe: DIR_INVALIDOS,
      erro: `Arquivo maior que ${MAX_XML_BYTES / (1024 * 1024)} MB.`,
      origemDeteccao: 'none',
    }
  }
  let conteudo: string
  try {
    conteudo = fs.readFileSync(p, 'utf-8')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { classe: DIR_INVALIDOS, erro: msg, origemDeteccao: 'none' }
  }
  return classificarXmlRetencaoDeString(conteudo)
}

export function destinoUnicoNoDir(dirDestino: string, nomePreferido: string): string {
  const base = nomePreferido || 'arquivo.xml'
  let cand = path.join(dirDestino, base)
  if (!fs.existsSync(cand)) return cand
  const ext = path.extname(base)
  const semExt = base.slice(0, -ext.length) || base
  let n = 1
  while (fs.existsSync(cand)) {
    cand = path.join(dirDestino, `${semExt}_${n}${ext}`)
    n++
  }
  return cand
}
