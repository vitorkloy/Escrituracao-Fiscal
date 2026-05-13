import { extrairTagTextoLocal } from './nfe-dist-dfe-parser'

export interface RetConsSitCTeResumo {
  cStat: string
  xMotivo: string
  chCTe?: string
  /** XML do nó protCTe, quando existir. */
  xmlProtCTe?: string
  /** XML do procCTe (CT-e + protocolo), quando a SEFAZ devolver neste formato. */
  xmlProcCTe?: string
}

/** Extrai o trecho retConsSitCTe (ou equivalente) do envelope SOAP de retorno. */
export function extrairXmlRetConsSitCTe(soapXml: string): string {
  const fault = soapXml.match(/<faultstring[^>]*>([^<]*)<\/faultstring>/i)
  if (fault?.[1]) throw new Error(`SOAP Fault: ${fault[1].trim()}`)

  const cdata = soapXml.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)
  if (cdata?.[1]?.includes('retConsSitCTe')) return cdata[1].trim()

  const resultTags = [
    /<cteConsultaCTResult[^>]*>([\s\S]*?)<\/cteConsultaCTResult>/i,
    /<cteConsultaCTResponse[^>]*>([\s\S]*?)<\/cteConsultaCTResponse>/i,
    /<cteResultMsg[^>]*>([\s\S]*?)<\/cteResultMsg>/i,
  ]
  for (const re of resultTags) {
    const inner = soapXml.match(re)
    if (inner?.[1]) {
      let s = inner[1].trim()
      s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      if (s.includes('retConsSitCTe')) return s
    }
  }

  const direto = soapXml.match(/<retConsSitCTe[\s\S]*?<\/retConsSitCTe>/i)
  if (direto) return direto[0]
  throw new Error('Não foi possível localizar retConsSitCTe na resposta SOAP.')
}

export function parsearRetConsSitCTe(retXml: string): RetConsSitCTeResumo {
  const prot = retXml.match(/<protCTe[\s\S]*?<\/protCTe>/i)
  const proc = retXml.match(/<procCTe[\s\S]*?<\/procCTe>/i)
  return {
    cStat: extrairTagTextoLocal(retXml, 'cStat') || '0',
    xMotivo: extrairTagTextoLocal(retXml, 'xMotivo'),
    chCTe: extrairTagTextoLocal(retXml, 'chCTe') || undefined,
    xmlProtCTe: prot?.[0]?.trim() || undefined,
    xmlProcCTe: proc?.[0]?.trim() || undefined,
  }
}
