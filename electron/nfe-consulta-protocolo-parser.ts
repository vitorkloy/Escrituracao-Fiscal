import { extrairTagTextoLocal } from './nfe-dist-dfe-parser'

export interface RetConsSitNFeResumo {
  cStat: string
  xMotivo: string
  chNFe?: string
  xmlProtNFe?: string
  /** XML completo (nfeProc) quando a SEFAZ devolver NFe + protocolo. */
  xmlProcNFe?: string
}

/** Extrai `retConsSitNFe` do envelope SOAP. */
export function extrairXmlRetConsSitNFe(soapXml: string): string {
  const fault = soapXml.match(/<faultstring[^>]*>([^<]*)<\/faultstring>/i)
  if (fault?.[1]) throw new Error(`SOAP Fault: ${fault[1].trim()}`)

  const cdata = soapXml.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)
  if (cdata?.[1]?.includes('retConsSitNFe')) return cdata[1].trim()

  const resultTags = [
    /<nfeResultMsg[^>]*>([\s\S]*?)<\/nfeResultMsg>/i,
    /<nfeConsultaNFResult[^>]*>([\s\S]*?)<\/nfeConsultaNFResult>/i,
  ]
  for (const re of resultTags) {
    const inner = soapXml.match(re)
    if (inner?.[1]) {
      let s = inner[1].trim()
      s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      if (s.includes('retConsSitNFe')) return s
    }
  }

  const direto = soapXml.match(/<retConsSitNFe[\s\S]*?<\/retConsSitNFe>/i)
  if (direto) return direto[0]
  throw new Error('Não foi possível localizar retConsSitNFe na resposta SOAP.')
}

function extrairBloco(xml: string, localName: string): string | undefined {
  const re = new RegExp(`<(?:[\\w.-]+:)?${localName}\\b[\\s\\S]*?<\\/(?:[\\w.-]+:)?${localName}>`, 'i')
  return xml.match(re)?.[0]?.trim()
}

/**
 * Monta nfeProc a partir de NFe + protNFe quando a SEFAZ não devolve o wrapper pronto.
 */
export function montarNfeProcDePartes(xmlNFe: string, xmlProt: string): string {
  const versao = xmlProt.match(/versao\s*=\s*["']([^"']+)["']/i)?.[1] ?? '4.00'
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="${versao}">` +
    xmlNFe +
    xmlProt +
    `</nfeProc>`
  )
}

export function parsearRetConsSitNFe(retXml: string): RetConsSitNFeResumo {
  const prot = extrairBloco(retXml, 'protNFe')
  const procPronto = extrairBloco(retXml, 'nfeProc')
  const nfe = extrairBloco(retXml, 'NFe')

  let xmlProcNFe: string | undefined
  if (procPronto && /<(?:[\w.-]+:)?det\b/i.test(procPronto)) {
    xmlProcNFe = procPronto
  } else if (nfe && prot && /<(?:[\w.-]+:)?det\b/i.test(nfe)) {
    xmlProcNFe = montarNfeProcDePartes(nfe, prot)
  }

  return {
    cStat: extrairTagTextoLocal(retXml, 'cStat') || '0',
    xMotivo: extrairTagTextoLocal(retXml, 'xMotivo'),
    chNFe: extrairTagTextoLocal(retXml, 'chNFe') || undefined,
    xmlProtNFe: prot || undefined,
    xmlProcNFe,
  }
}
