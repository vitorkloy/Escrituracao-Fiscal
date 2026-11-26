import {
  aliquotasDoAno,
  buscarClassTrib,
  type ClassTribRfb,
  type TipoAliquotaRfb,
} from './ibs-cbs-parametros'

/** numer/denom em inteiros; HALF_EVEN na casa pedida, sem produto binário. */
function halfEvenDivide(numer: bigint, denom: bigint, casas: number): number {
  if (denom === 0n) return NaN
  let sinal = 1n
  if (numer < 0n) {
    sinal = -sinal
    numer = -numer
  }
  if (denom < 0n) {
    sinal = -sinal
    denom = -denom
  }
  const fator = 10n ** BigInt(casas)
  const q = numer * fator
  const inteiro = q / denom
  const rem = q % denom
  let escolhido = inteiro
  if (rem * 2n > denom) escolhido = inteiro + 1n
  else if (rem * 2n === denom && inteiro % 2n !== 0n) escolhido = inteiro + 1n
  return Number(sinal * escolhido) / 10 ** casas
}

function decimalStringToFraction(valor: number): { numer: bigint; denom: bigint } {
  if (!Number.isFinite(valor)) return { numer: 0n, denom: 1n }
  let s = valor.toString()
  let exp = 0
  if (/e/i.test(s)) {
    const [m, e] = s.split(/e/i)
    s = m
    exp = Number(e)
  }
  const neg = s.startsWith('-')
  s = s.replace(/^-/, '')
  const [ip, fp = ''] = s.split('.')
  let numer = BigInt((ip || '0') + fp)
  let denom = 10n ** BigInt(fp.length)
  if (exp > 0) numer *= 10n ** BigInt(exp)
  if (exp < 0) denom *= 10n ** BigInt(-exp)
  if (neg) numer = -numer
  return { numer, denom }
}

/** HALF_EVEN (ABNT NBR 5891), igual a ArredondamentoUtils.MODO da calculadora 1.7.2. */
export function arredondarHalfEven(valor: number, casas: number): number {
  if (!Number.isFinite(valor)) return valor
  const { numer, denom } = decimalStringToFraction(valor)
  return halfEvenDivide(numer, denom, casas)
}

/** Valor fiscal 13v2 — ArredondamentoUtils.arredondarValorFiscal. */
export function arredondarValorFiscal(valor: number): number {
  return arredondarHalfEven(valor, 2)
}

/** Alíquota publicada 3v2-4 — ArredondamentoUtils.arredondarAliquotaPublicada. */
export function arredondarAliquotaPublicada(aliquotaPercentual: number): number {
  return arredondarHalfEven(aliquotaPercentual, 4)
}

/**
 * publicarAliquota da 1.7.2: fração → % → 4 casas → fração.
 * Equivale a arredondar o percentual a 4 casas e voltar a aplicar sobre a base.
 */
export function aliquotaEfetivaPublicada(aliquotaNominalPct: number, pRedPct: number): number {
  const redutor = 1 - (Number.isFinite(pRedPct) ? pRedPct : 0) / 100
  return arredondarAliquotaPublicada(aliquotaNominalPct * redutor)
}

/** valor = arred2(vBC × pAliqEfet ÷ 100), com vBC já a 2 casas. */
export function valorTributo(vBc: number, pAliqEfetPct: number): number {
  const base = arredondarValorFiscal(vBc)
  const aliq = arredondarAliquotaPublicada(pAliqEfetPct)
  const { numer: nB, denom: dB } = decimalStringToFraction(base)
  const { numer: nA, denom: dA } = decimalStringToFraction(aliq)
  return halfEvenDivide(nB * nA, dB * dA * 100n, 2)
}

export const TOLERANCIA_VALOR_NT = 0.01
export const TOLERANCIA_ALIQ = 0.0001

export function quaseIgual(
  a: number | null | undefined,
  b: number | null | undefined,
  tol: number
): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return Math.abs(a - b) <= tol + 1e-12
}

export interface TributoCalculado {
  pAliq: number
  pRed: number
  pAliqEfet: number
  valor: number
}

export interface ItemCalculadoIbsCbs {
  classif?: ClassTribRfb
  tipo: TipoAliquotaRfb | 'desconhecido'
  vBc: number
  ibsUf: TributoCalculado
  ibsMun: TributoCalculado
  cbs: TributoCalculado | null
  vIbs: number
  avisos: string[]
}

export function calcularItemIbsCbs(opts: {
  cClassTrib: string
  vBc: number
  ano: number
}): ItemCalculadoIbsCbs {
  const avisos: string[] = []
  const classif = buscarClassTrib(opts.cClassTrib)
  const ref = aliquotasDoAno(opts.ano)
  const vBc = arredondarValorFiscal(opts.vBc)
  const tipo: TipoAliquotaRfb | 'desconhecido' = classif?.tipo ?? 'desconhecido'

  if (!classif) {
    avisos.push(`cClassTrib ${opts.cClassTrib || '—'} não está na tabela ${ref.ano >= 2026 ? 'V0073' : 'embarcada'}`)
  } else if (tipo === 'fixa' || tipo === 'uniforme') {
    avisos.push(
      `Tipo de alíquota «${tipo}» não recalcula valor (monofasia/fixa exige tabela própria da 1.7.2)`
    )
  }
  if (ref.pCbs == null) {
    avisos.push(`CBS ${ref.ano}: sem alíquota de referência embarcada (${ref.fonte})`)
  }

  const zerado: TributoCalculado = { pAliq: 0, pRed: 0, pAliqEfet: 0, valor: 0 }
  if (!classif || tipo === 'sem') {
    return {
      classif,
      tipo,
      vBc,
      ibsUf: { ...zerado },
      ibsMun: { ...zerado },
      cbs: { ...zerado },
      vIbs: 0,
      avisos,
    }
  }

  const pRedUf = classif.pRedIbsUf
  const pRedMun = classif.pRedIbsMun
  const pRedCbs = classif.pRedCbs

  const ibsUf: TributoCalculado = {
    pAliq: arredondarAliquotaPublicada(ref.pIbsUf),
    pRed: pRedUf,
    pAliqEfet: aliquotaEfetivaPublicada(ref.pIbsUf, pRedUf),
    valor: 0,
  }
  ibsUf.valor = valorTributo(vBc, ibsUf.pAliqEfet)

  const ibsMun: TributoCalculado = {
    pAliq: arredondarAliquotaPublicada(ref.pIbsMun),
    pRed: pRedMun,
    pAliqEfet: aliquotaEfetivaPublicada(ref.pIbsMun, pRedMun),
    valor: 0,
  }
  ibsMun.valor = valorTributo(vBc, ibsMun.pAliqEfet)

  let cbs: TributoCalculado | null = null
  if (ref.pCbs != null) {
    cbs = {
      pAliq: arredondarAliquotaPublicada(ref.pCbs),
      pRed: pRedCbs,
      pAliqEfet: aliquotaEfetivaPublicada(ref.pCbs, pRedCbs),
      valor: 0,
    }
    cbs.valor = valorTributo(vBc, cbs.pAliqEfet)
  }

  const vIbs = arredondarValorFiscal(ibsUf.valor + ibsMun.valor)
  return { classif, tipo, vBc, ibsUf, ibsMun, cbs, vIbs, avisos }
}

/** Composição NT 2025.002 da base unificada (item), arredondada a 2 casas. */
export function baseNt2025002(p: {
  vProd?: number | null
  vServ?: number | null
  vFrete?: number | null
  vSeg?: number | null
  vOutro?: number | null
  vII?: number | null
  vIS?: number | null
  vDesc?: number | null
  vPis?: number | null
  vCofins?: number | null
  vIcms?: number | null
  vIcmsUfDest?: number | null
  vFcp?: number | null
  vFcpUfDest?: number | null
  vIcmsMono?: number | null
  vIssqn?: number | null
}): number {
  const n = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? 0 : v)
  const soma =
    n(p.vProd) +
    n(p.vServ) +
    n(p.vFrete) +
    n(p.vSeg) +
    n(p.vOutro) +
    n(p.vII) +
    n(p.vIS) -
    n(p.vDesc) -
    n(p.vPis) -
    n(p.vCofins) -
    n(p.vIcms) -
    n(p.vIcmsUfDest) -
    n(p.vFcp) -
    n(p.vFcpUfDest) -
    n(p.vIcmsMono) -
    n(p.vIssqn)
  return arredondarValorFiscal(Math.max(0, soma))
}
