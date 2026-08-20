/**
 * NF-e — consulta situação/protocolo por chave na SEFAZ-SP (NFeConsultaProtocolo4).
 * Diferente da DistDFe AN (consChNFe), este serviço estadual responde ao emitente
 * com a situação da nota; quando a SEFAZ devolve NFe/nfeProc, gravamos o XML completo.
 */
import axios, { AxiosError } from 'axios'
import type https from 'https'
import type { ConfigCertNfe } from './nfe'

export type NfeConsultaAmbienteEndpoint = 'producao' | 'homologacao'

export const ENDPOINTS_NFE_CONSULTA_PROTOCOLO_SP = {
  producao: 'https://nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx',
  homologacao: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx',
} as const

const NS_WSDL = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4'
const NS_NFE = 'http://www.portalfiscal.inf.br/nfe'
const SOAP_ACTION = `${NS_WSDL}/nfeConsultaNF`

function montarConsSitNFe(chNFe: string, tpAmb: '1' | '2'): string {
  return (
    `<consSitNFe xmlns="${NS_NFE}" versao="4.00">` +
    `<tpAmb>${tpAmb}</tpAmb>` +
    `<xServ>CONSULTAR</xServ>` +
    `<chNFe>${chNFe}</chNFe>` +
    `</consSitNFe>`
  )
}

function montarEnvelopeSoap(consSitXml: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDadosMsg xmlns="${NS_WSDL}">${consSitXml}</nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`
}

async function postSoap(url: string, envelope: string, agente: https.Agent): Promise<string> {
  const ERROS_RETRY = new Set(['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNABORTED'])
  const MAX_TENTATIVAS = 3
  let ultimoErro: unknown
  const contentType = `application/soap+xml; charset=utf-8; action="${SOAP_ACTION}"`

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      const { data, status } = await axios.post<string>(url, envelope, {
        httpsAgent: agente,
        timeout: 120_000,
        headers: { 'Content-Type': contentType },
        responseType: 'text',
        transformResponse: [(d) => d as string],
        validateStatus: () => true,
      })
      const xml = String(data ?? '')
      if (!xml) throw new Error('Resposta vazia da SEFAZ-SP (consulta NF-e).')
      if (status >= 400) {
        const fault = xml.match(/<faultstring[^>]*>([^<]*)<\/faultstring>/i)
        const detalhe = fault?.[1]?.trim()
        throw new Error(
          detalhe
            ? `HTTP ${status} (SOAP Fault): ${detalhe}`
            : `HTTP ${status} ao consultar NF-e na SEFAZ-SP.`
        )
      }
      return xml
    } catch (err) {
      ultimoErro = err
      if (err instanceof AxiosError) {
        const code = err.code ?? ''
        if (ERROS_RETRY.has(code) && tentativa < MAX_TENTATIVAS) {
          await new Promise((r) => setTimeout(r, tentativa * 2000))
          continue
        }
        throw new Error(`Falha de conexão com a SEFAZ-SP (consulta NF-e): ${err.message}`)
      }
      throw err
    }
  }
  throw new Error(
    `Falha após ${MAX_TENTATIVAS} tentativas (consulta NF-e): ${
      ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro)
    }`
  )
}

/**
 * Consulta situação da NF-e (44 dígitos) no endpoint SP v4.00.
 * Preferível para chaves com UF 35 (autorizadas em SP).
 */
export async function nfeConsultaProtocoloPorChave(
  _config: ConfigCertNfe,
  opts: {
    chNFe: string
    tpAmb: '1' | '2'
    ambienteEndpoint: NfeConsultaAmbienteEndpoint
  },
  agente: https.Agent
): Promise<string> {
  void _config
  const ch = String(opts.chNFe ?? '').replace(/\D/g, '')
  if (ch.length !== 44) throw new Error('A chave de acesso da NF-e deve ter 44 dígitos.')

  const url = ENDPOINTS_NFE_CONSULTA_PROTOCOLO_SP[opts.ambienteEndpoint]
  const envelope = montarEnvelopeSoap(montarConsSitNFe(ch, opts.tpAmb))
  return postSoap(url, envelope, agente)
}
