/**
 * CT-e — Ambiente Nacional: CTeDistribuicaoDFe (distDFeInt / retDistDFeInt).
 */
import axios, { AxiosError } from 'axios'
import type https from 'https'
import type { ConfigCertNfe } from './nfe'

export const ENDPOINTS_CTE_AN_PRODUCAO = {
  distribuicaoDFe: 'https://www1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx',
} as const

/** Envelope SOAP 1.2 — espelho de `nfe.ts` / `nfeDistDFeInteresse`, com tags CT-e. */
function soapEnvelopeCteDistribuicaoDFe(cteDadosMsgInnerXml: string): string {
  const payload = (cteDadosMsgInnerXml ?? '').trim()
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <cteDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe">
      <cteDadosMsg>${payload}</cteDadosMsg>
    </cteDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`
}

async function postSoapCteDist(
  url: string,
  envelope: string,
  agente: https.Agent
): Promise<string> {
  const soapAction =
    'http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe/cteDistDFeInteresse'
  const contentType = `application/soap+xml; charset=utf-8; action="${soapAction}"`

  try {
    const { data } = await axios.post(url, envelope, {
      httpsAgent: agente,
      timeout: 120_000,
      headers: { 'Content-Type': contentType },
      responseType: 'text',
      transformResponse: [(d) => d as string],
      validateStatus: () => true,
    })
    const xml = String(data ?? '')
    if (!xml) throw new Error('Resposta vazia da AN (CT-e DistDFe).')
    return xml
  } catch (err) {
    if (err instanceof AxiosError) {
      throw new Error(`Falha de conexão com a AN (CT-e DistDFe): ${err.message}`)
    }
    throw err
  }
}

export async function cteDistDFeInteresse(
  _config: ConfigCertNfe,
  cteDadosMsgInnerXml: string,
  agente: https.Agent
): Promise<string> {
  void _config
  const envelope = soapEnvelopeCteDistribuicaoDFe(cteDadosMsgInnerXml)
  return postSoapCteDist(ENDPOINTS_CTE_AN_PRODUCAO.distribuicaoDFe, envelope, agente)
}
