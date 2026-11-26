import { CLASS_TRIB_RFB, type ClassTribRfb, type TipoAliquotaRfb } from './ibs-cbs-tabela.gerada'

export type { ClassTribRfb, TipoAliquotaRfb }

/** Release da Calculadora RTC usada como fonte das tabelas e do arredondamento. */
export const VERSAO_CALCULADORA_RFB = '1.7.2'
export const FLYWAY_BASE_RFB = 'V0073'
export const IT_TABELAS_RFB = 'IT 2025.002 v.1.71'
export const FONTE_CALCULADORA_RFB =
  'https://github.com/ReceitaFederal/calculadora-rtc-regime-regular/releases/tag/1.7.2'

export interface AliquotasReferenciaAno {
  ano: number
  pIbsUf: number
  pIbsMun: number
  /** null = IT 2025.002 ainda “aguardar legislação”. */
  pCbs: number | null
  fonte: string
}

/**
 * Alíquotas padrão do IBS/CBS (IT 2025.002 §05 / LC 214 arts. 343–346).
 * Em 2026 a calculadora oficial não aceita alíquota informada — usa estas.
 */
export const ALIQUOTAS_REFERENCIA_RFB: readonly AliquotasReferenciaAno[] = [
  { ano: 2025, pIbsUf: 0.1, pIbsMun: 0, pCbs: 0.9, fonte: 'LC 214/2025 arts. 343 e 346 (ano-teste)' },
  { ano: 2026, pIbsUf: 0.1, pIbsMun: 0, pCbs: 0.9, fonte: 'LC 214/2025 arts. 343 e 346 (ano-teste)' },
  { ano: 2027, pIbsUf: 0.05, pIbsMun: 0.05, pCbs: null, fonte: 'LC 214/2025 art. 344; CBS aguarda legislação' },
  { ano: 2028, pIbsUf: 0.05, pIbsMun: 0.05, pCbs: null, fonte: 'LC 214/2025 art. 344; CBS aguarda legislação' },
]

const POR_CODIGO = new Map(CLASS_TRIB_RFB.map((c) => [c.codigo, c]))

export function buscarClassTrib(codigo: string): ClassTribRfb | undefined {
  const c = String(codigo || '').replace(/\D/g, '').padStart(6, '0')
  if (c.length !== 6) return undefined
  return POR_CODIGO.get(c)
}

export function aliquotasDoAno(ano: number): AliquotasReferenciaAno {
  const hit = ALIQUOTAS_REFERENCIA_RFB.find((a) => a.ano === ano)
  if (hit) return hit
  if (ano < 2025) return ALIQUOTAS_REFERENCIA_RFB[0]
  return {
    ano,
    pIbsUf: 0,
    pIbsMun: 0,
    pCbs: null,
    fonte: 'Ano sem alíquota de referência embarcada (IT 2025.002 aguarda legislação)',
  }
}

export function resumoTabelaRfb(): { versao: string; flyway: string; it: string; codigos: number } {
  return {
    versao: VERSAO_CALCULADORA_RFB,
    flyway: FLYWAY_BASE_RFB,
    it: IT_TABELAS_RFB,
    codigos: CLASS_TRIB_RFB.length,
  }
}
