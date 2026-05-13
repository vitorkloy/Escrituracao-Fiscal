/**
 * Montagem de distDFeInt para CTeDistribuicaoDFe (AN) — namespace CT-e.
 * Estrutura espelha `nfe-dist-dfe-build.ts` (NF-e).
 */
import { formatarUltNsu } from './nfe-dist-dfe-build'

const NAMESPACE_CTE = 'http://www.portalfiscal.inf.br/cte'
/** Versão do leiaute distDFeInt CT-e (conferir PL_CTeDistDFe / MOC vigente). */
const CTE_DIST_DFE_VERSAO = '1.00'
const TP_AMB_PRODUCAO = '1'

export { formatarUltNsu }

export function montarDistDfeIntListagemNsuCte(params: {
  cnpj14: string
  cUFAutor: string
  ultNSU: string
}): string {
  const cnpj = params.cnpj14.replace(/\D/g, '')
  if (cnpj.length !== 14) throw new Error('CNPJ deve ter 14 dígitos.')
  const uf = params.cUFAutor.replace(/\D/g, '')
  if (!/^\d{2}$/.test(uf)) throw new Error('cUFAutor inválido (2 dígitos IBGE).')
  const ult = formatarUltNsu(params.ultNSU)
  return (
    `<distDFeInt xmlns="${NAMESPACE_CTE}" versao="${CTE_DIST_DFE_VERSAO}">` +
    `<tpAmb>${TP_AMB_PRODUCAO}</tpAmb>` +
    `<cUFAutor>${uf}</cUFAutor>` +
    `<CNPJ>${cnpj}</CNPJ>` +
    `<distNSU><ultNSU>${ult}</ultNSU></distNSU>` +
    `</distDFeInt>`
  )
}
