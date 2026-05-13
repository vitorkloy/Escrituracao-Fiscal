/**
 * Parser DistDFe CT-e (retDistDFeInt / docZip) — estrutura igual à NF-e;
 * extração SOAP usa o wrapper `cteDistDFeInteresseResult`.
 */
import { formatarUltNsu } from './nfe-dist-dfe-build'
import {
  compararNsu,
  extrairAnoMesEmissao,
  extrairCnpjEmitenteDaChave44,
  maiorNsuDosDocumentos,
  maxNsuValidoParaTerminoSincronia,
  parsearRetDistDfeInt,
  type DistDfeFiltroPapel,
  type DocZipItem,
  type RetDistDfeParseado,
} from './nfe-dist-dfe-parser'

export type { DistDfeFiltroPapel, DocZipItem, RetDistDfeParseado }
export {
  compararNsu,
  extrairAnoMesEmissao,
  formatarUltNsu,
  maiorNsuDosDocumentos,
  maxNsuValidoParaTerminoSincronia,
  parsearRetDistDfeInt,
}

/** Extrai XML `retDistDFeInt` do envelope SOAP CT-e (CDATA, literal ou corpo direto). */
export function extrairXmlRetDistDfeIntCte(soapXml: string): string {
  const fault = soapXml.match(/<faultstring>([^<]*)<\/faultstring>/i)
  if (fault?.[1]) throw new Error(`SOAP Fault: ${fault[1].trim()}`)

  const cdata = soapXml.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)
  if (cdata?.[1]?.includes('retDistDFeInt')) return cdata[1].trim()

  const innerCte = soapXml.match(
    /<cteDistDFeInteresseResult[^>]*>([\s\S]*?)<\/cteDistDFeInteresseResult>/i
  )
  if (innerCte?.[1]) {
    let s = innerCte[1].trim()
    s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    if (s.includes('retDistDFeInt')) return s
  }

  const innerNfe = soapXml.match(
    /<nfeDistDFeInteresseResult[^>]*>([\s\S]*?)<\/nfeDistDFeInteresseResult>/i
  )
  if (innerNfe?.[1]) {
    let s = innerNfe[1].trim()
    s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    if (s.includes('retDistDFeInt')) return s
  }

  const direto = soapXml.match(/<retDistDFeInt[\s\S]*?<\/retDistDFeInt>/i)
  if (direto) return direto[0]
  throw new Error('Não foi possível localizar retDistDFeInt na resposta SOAP (CT-e).')
}

export type DistDfeCteArquivoTipo = 'procCTe' | 'resCTe' | 'evento' | 'outro'

export function inferirTipoArquivoDistDfeCte(schema: string, xml: string): DistDfeCteArquivoTipo {
  const s = (schema ?? '').toLowerCase()
  if (s.includes('proccte')) return 'procCTe'
  if (s.includes('rescte')) return 'resCTe'
  if (s.includes('reseventocte') || s.includes('proceventocte') || s.includes('procevento')) return 'evento'
  if (s.includes('evento')) return 'evento'

  const x = xml ?? ''
  if (/<(?:[\w.-]+:)?cteProc\b/i.test(x)) return 'procCTe'
  if (/<(?:[\w.-]+:)?procEventoCTe\b/i.test(x) || /<(?:[\w.-]+:)?procEventoCte\b/i.test(x)) return 'evento'
  if (/<(?:[\w.-]+:)?resCTe\b/i.test(x)) return 'resCTe'
  if (/<(?:[\w.-]+:)?resEvento\b/i.test(x) && /cte/i.test(x)) return 'evento'
  return 'outro'
}

/** Chave 44 do CT-e: chCTe, Id CTe… ou primeiro bloco de 44 dígitos. */
export function extrairChaveAcesso44Cte(xml: string): string | undefined {
  const id = xml.match(/Id\s*=\s*["']CTe(\d{44})["']/i)
  if (id?.[1]) return id[1]
  const id2 = xml.match(/Id\s*=\s*["'][^"']*CTe(\d{44})["']/i)
  if (id2?.[1]) return id2[1]
  const ch = xml.match(/<(?:[\w.-]+:)?chCTe>(\d{44})<\/(?:[\w.-]+:)?chCTe>/i)
  if (ch?.[1]) return ch[1]
  const any = xml.match(/\b(\d{44})\b/)
  return any?.[1]
}

function corpoPrimeiraTagLocal(xml: string, localName: string): string | undefined {
  const esc = localName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(
    `<(?:[\\w.-]+:)?${esc}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${esc}>`,
    'i'
  )
  const m = xml.match(re)
  return m?.[1]
}

function extrairPrimeiroCnpj14NoBloco(bloco: string): string | undefined {
  const m = bloco.match(/<(?:[\w.-]+:)?CNPJ>(\d{14})<\/(?:[\w.-]+:)?CNPJ>/i)
  return m?.[1]
}

export function extrairCnpjEmitenteDistDfeCte(xml: string): string | undefined {
  const emitCorpo = corpoPrimeiraTagLocal(xml, 'emit')
  if (emitCorpo) {
    const c = extrairPrimeiroCnpj14NoBloco(emitCorpo)
    if (c) return c
  }
  if (/<(?:[\w.-]+:)?resCTe\b/i.test(xml)) {
    const corpoRes = corpoPrimeiraTagLocal(xml, 'resCTe')
    if (corpoRes) {
      const c = extrairPrimeiroCnpj14NoBloco(corpoRes)
      if (c) return c
    }
  }
  const chave = extrairChaveAcesso44Cte(xml)
  if (chave) return extrairCnpjEmitenteDaChave44(chave)
  return undefined
}

export function extrairCnpjDestinatarioDistDfeCte(xml: string): string | undefined {
  const destCorpo = corpoPrimeiraTagLocal(xml, 'dest')
  if (!destCorpo) return undefined
  return extrairPrimeiroCnpj14NoBloco(destCorpo)
}

export function extrairCnpjAutorEventoCte(xml: string): string | undefined {
  const corpo = corpoPrimeiraTagLocal(xml, 'infEvento')
  if (!corpo) return undefined
  return extrairPrimeiroCnpj14NoBloco(corpo)
}

export function extrairSufixoArquivoEventoCte(xml: string): string {
  const idxRet = xml.search(/<(?:[\w.-]+:)?retEvento\b/i)
  if (idxRet >= 0) {
    const slice = xml.slice(idxRet, idxRet + 4000)
    const mProt = slice.match(/<(?:[\w.-]+:)?nProt>(\d{1,25})<\/(?:[\w.-]+:)?nProt>/i)
    if (mProt?.[1]) return mProt[1].replace(/\D/g, '')
  }
  const tp = xml.match(/<(?:[\w.-]+:)?tpEvento>(\d{1,10})<\/(?:[\w.-]+:)?tpEvento>/i)
  const nseq = xml.match(/<(?:[\w.-]+:)?nSeqEvento>(\d{1,10})<\/(?:[\w.-]+:)?nSeqEvento>/i)
  if (tp?.[1] && nseq?.[1]) return `${tp[1].replace(/\D/g, '')}_${nseq[1].replace(/\D/g, '')}`
  if (tp?.[1]) return tp[1].replace(/\D/g, '')
  return 'evt'
}

export function devePersistirDocumentoDistDfeCte(
  xml: string,
  schema: string,
  cnpj14: string,
  filtro: DistDfeFiltroPapel
): boolean {
  if (filtro === 'todos') return true
  const cnpj = cnpj14.replace(/\D/g, '')
  if (cnpj.length !== 14) return true

  const tipo = inferirTipoArquivoDistDfeCte(schema, xml)
  if (tipo === 'evento') {
    if (filtro === 'emitente') {
      const ch = extrairChaveAcesso44Cte(xml)
      const emDaChave = ch ? extrairCnpjEmitenteDaChave44(ch) : undefined
      return Boolean(emDaChave && emDaChave === cnpj)
    }
    const autor = extrairCnpjAutorEventoCte(xml)
    return Boolean(autor && autor === cnpj)
  }

  if (filtro === 'emitente') {
    const em = extrairCnpjEmitenteDistDfeCte(xml)
    return Boolean(em && em === cnpj)
  }

  const de = extrairCnpjDestinatarioDistDfeCte(xml)
  return Boolean(de && de === cnpj)
}

export function resumirTiposDocZipPorSchemaCte(documentos: DocZipItem[]): string {
  let procCTe = 0
  let resCTe = 0
  let evento = 0
  let outro = 0
  for (const d of documentos) {
    const s = d.schema.toLowerCase()
    if (s.includes('resevento') || s.includes('proceventocte') || s.includes('evento')) evento++
    else if (s.includes('proccte')) procCTe++
    else if (s.includes('rescte')) resCTe++
    else outro++
  }
  return `procCTe=${procCTe} resCTe=${resCTe} evento=${evento} outro=${outro}`
}
