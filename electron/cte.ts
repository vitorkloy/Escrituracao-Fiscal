/**
 * CT-e — SEFAZ-SP: consulta situação por chave (CTeConsultaV4 / consSitCTe).
 * Envelope conforme MOC / WSDL público (SOAP 1.2, cabeçalho cteCabecMsg).
 */
import axios, { AxiosError } from 'axios'
import type https from 'https'
import type { ConfigCert } from './sefaz'

export type CteAmbienteEndpoint = 'producao' | 'homologacao'

export const ENDPOINTS_CTE_CONSULTA_SP = {
  producao: 'https://nfe.fazenda.sp.gov.br/CTeWS/WS/CTeConsultaV4.asmx',
  homologacao: 'https://homologacao.nfe.fazenda.sp.gov.br/CTeWS/WS/CTeConsultaV4.asmx',
} as const

const NS_WSDL = 'http://www.portalfiscal.inf.br/cte/wsdl/CTeConsulta4'
const NS_CTE = 'http://www.portalfiscal.inf.br/cte'

/** SOAP 1.2 action usada pelo serviço document/literal (ajustar se o WSDL local divergir). */
const SOAP_ACTION_CTE_CONSULTA =
  'http://www.portalfiscal.inf.br/cte/wsdl/CTeConsulta4/cteConsultaCT'

function montarConsSitCTe(chCTe: string, tpAmb: '1' | '2'): string {
  return (
    `<consSitCTe xmlns="${NS_CTE}" versao="4.00">` +
    `<tpAmb>${tpAmb}</tpAmb>` +
    `<xServ>CONSULTAR</xServ>` +
    `<chCTe>${chCTe}</chCTe>` +
    `</consSitCTe>`
  )
}

function montarEnvelopeSoap(consSitXml: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header>
    <cteCabecMsg xmlns="${NS_WSDL}">
      <cUF>35</cUF>
      <versaoDados>4.00</versaoDados>
    </cteCabecMsg>
  </soap12:Header>
  <soap12:Body>
    <cteDadosMsg xmlns="${NS_WSDL}">
      ${consSitXml}
    </cteDadosMsg>
  </soap12:Body>
</soap12:Envelope>`
}

async function postSoapCte(
  url: string,
  envelope: string,
  agente: https.Agent
): Promise<string> {
  const debug = process.env.DEBUG === 'cte'
  if (debug) {
    console.log(`[CT-e] POST ${url}`)
    console.log(`[CT-e] Envelope:\n${envelope}`)
  }
  const ERROS_RETRY = new Set(['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNABORTED'])
  const MAX_TENTATIVAS = 3
  let ultimoErro: unknown

  const contentType = `application/soap+xml; charset=utf-8; action="${SOAP_ACTION_CTE_CONSULTA}"`

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
      if (!xml) throw new Error('Resposta vazia da SEFAZ (CT-e).')

      if (status >= 400) {
        const fault = xml.match(/<faultstring[^>]*>([^<]*)<\/faultstring>/i)
        const detalhe = fault?.[1]?.trim()
        throw new Error(
          detalhe
            ? `HTTP ${status} (SOAP Fault): ${detalhe}`
            : `HTTP ${status} ao consultar CT-e na SEFAZ-SP.`
        )
      }

      if (debug) console.log(`[CT-e] HTTP ${status} resposta:\n${xml.slice(0, 8000)}${xml.length > 8000 ? '\n…' : ''}`)

      return xml
    } catch (err) {
      ultimoErro = err
      if (err instanceof AxiosError) {
        const code = err.code ?? ''
        if (ERROS_RETRY.has(code) && tentativa < MAX_TENTATIVAS) {
          await new Promise((r) => setTimeout(r, tentativa * 2000))
          continue
        }
        throw new Error(`Falha de conexão com a SEFAZ-SP (CT-e): ${err.message}`)
      }
      throw err
    }
  }

  throw new Error(
    `Falha após ${MAX_TENTATIVAS} tentativas (CT-e): ${
      ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro)
    }`
  )
}

/**
 * Consulta situação do CT-e por chave (44 dígitos) no endpoint SP v4.00.
 * `config` e `agente` seguem o mesmo fluxo de certificado do restante do app.
 */
export async function cteConsultaSituacaoPorChave(
  _config: ConfigCert,
  opts: {
    chCTe: string
    tpAmb: '1' | '2'
    ambienteEndpoint: CteAmbienteEndpoint
  },
  agente: https.Agent
): Promise<string> {
  void _config
  const ch = String(opts.chCTe ?? '').replace(/\D/g, '')
  if (ch.length !== 44) throw new Error('A chave de acesso do CT-e deve ter 44 dígitos.')

  const url = ENDPOINTS_CTE_CONSULTA_SP[opts.ambienteEndpoint]
  const inner = montarConsSitCTe(ch, opts.tpAmb)
  const envelope = montarEnvelopeSoap(inner)
  return postSoapCte(url, envelope, agente)
}
