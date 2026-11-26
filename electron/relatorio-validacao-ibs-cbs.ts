import fs from 'fs'
import path from 'path'
import ExcelJS from 'exceljs'
import { XMLParser } from 'fast-xml-parser'
import {
  extrairLinhasRelatorioNotas,
  listarXmlsRecursivo,
  xmlElegivelRelatorioNotas,
} from './relatorio-notas-fsist'
import {
  FLYWAY_BASE_RFB,
  IT_TABELAS_RFB,
  VERSAO_CALCULADORA_RFB,
  buscarClassTrib,
} from './ibs-cbs-parametros'
import {
  TOLERANCIA_ALIQ,
  TOLERANCIA_VALOR_NT,
  arredondarValorFiscal,
  baseNt2025002,
  calcularItemIbsCbs,
  quaseIgual,
} from './ibs-cbs-calculadora'
import {
  formatarCnpjRelatorioDigitos,
  limparNomeArquivo,
  type CabecalhoEmpresaRelatorio,
} from './relatorio-xlsx'

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (name) => name === 'det',
})

const FILL_HEADER: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE5E7EB' },
}
const FILL_DIVERG: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFDE68A' },
}
const FILL_ERRO: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFECACA' },
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

function texto(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v).trim()
  if (typeof v === 'object' && v && '#text' in (v as object)) return texto((v as { '#text': unknown })['#text'])
  return ''
}

function parseNumeroXml(raw: string): number | null {
  if (!raw) return null
  const limpo = raw.trim().replace(/\s/g, '')
  if (!limpo) return null
  const normalizado = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo
  const n = Number(normalizado)
  return Number.isFinite(n) ? n : null
}

function numCampo(obj: unknown, ...keys: string[]): number | null {
  if (obj == null || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  for (const k of keys) {
    if (k in o) {
      const n = parseNumeroXml(texto(o[k]))
      if (n != null) return n
    }
  }
  return null
}

function encontrarNumero(data: unknown, chave: string, maxDepth = 10): number | null {
  if (data == null || maxDepth < 0 || typeof data !== 'object') return null
  if (Array.isArray(data)) {
    for (const el of data) {
      const r = encontrarNumero(el, chave, maxDepth - 1)
      if (r != null) return r
    }
    return null
  }
  const o = data as Record<string, unknown>
  if (chave in o) {
    const n = parseNumeroXml(texto(o[chave]))
    if (n != null) return n
  }
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith('@_')) continue
    const r = encontrarNumero(v, chave, maxDepth - 1)
    if (r != null) return r
  }
  return null
}

function anoDeDhEmi(dhEmi: string, emissaoFmt: string): number {
  const iso = dhEmi.match(/^(\d{4})-/)
  if (iso) return Number(iso[1])
  const br = emissaoFmt.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return Number(br[3])
  return new Date().getFullYear()
}

export interface TotaisIbsCbsXml {
  vBc: number | null
  vIbsUf: number | null
  vIbsMun: number | null
  vIbs: number | null
  vCbs: number | null
}

function extrairIbsCbsTot(parsed: unknown): TotaisIbsCbsXml {
  const vazio: TotaisIbsCbsXml = { vBc: null, vIbsUf: null, vIbsMun: null, vIbs: null, vCbs: null }
  if (parsed == null || typeof parsed !== 'object') return vazio
  const stack: unknown[] = [parsed]
  let tot: unknown = null
  let guard = 0
  while (stack.length && guard++ < 400) {
    const cur = stack.pop()
    if (cur == null || typeof cur !== 'object') continue
    if (Array.isArray(cur)) {
      stack.push(...cur)
      continue
    }
    const o = cur as Record<string, unknown>
    if (o.IBSCBSTot && typeof o.IBSCBSTot === 'object') {
      tot = o.IBSCBSTot
      break
    }
    for (const [k, v] of Object.entries(o)) {
      if (!k.startsWith('@_') && v && typeof v === 'object') stack.push(v)
    }
  }
  if (!tot) return vazio
  const gIbs = (tot as Record<string, unknown>).gIBS
  const gUf = gIbs && typeof gIbs === 'object' ? (gIbs as Record<string, unknown>).gIBSUF : null
  const gMun = gIbs && typeof gIbs === 'object' ? (gIbs as Record<string, unknown>).gIBSMun : null
  const gCbs = (tot as Record<string, unknown>).gCBS
  return {
    vBc: numCampo(tot, 'vBCIBSCBS', 'vBC') ?? encontrarNumero(tot, 'vBCIBSCBS'),
    vIbsUf: numCampo(gUf, 'vIBSUF') ?? encontrarNumero(tot, 'vIBSUF'),
    vIbsMun: numCampo(gMun, 'vIBSMun') ?? encontrarNumero(tot, 'vIBSMun'),
    vIbs: numCampo(gIbs, 'vIBS') ?? encontrarNumero(tot, 'vIBS'),
    vCbs: numCampo(gCbs, 'vCBS') ?? encontrarNumero(tot, 'vCBS'),
  }
}

export type CodigoDivergenciaIbsCbs =
  | 'cst_incompativel'
  | 'cclasstrib_desconhecido'
  | 'codigo_nao_habilitado'
  | 'grupo_ausente'
  | 'aliquota'
  | 'reducao'
  | 'valor'
  | 'vIbs'
  | 'totais'
  | 'base_nt'
  | 'destaque_indevido'

export interface DivergenciaCampo {
  codigo: CodigoDivergenciaIbsCbs
  campo: string
  xml: string
  esperado: string
  detalhe: string
}

export interface LinhaValidacaoIbsCbs {
  chave: string
  modelo: string
  numero: string
  serie: string
  emissao: string
  item: string
  descricao: string
  ncm: string
  cstXml: string
  classTribXml: string
  cstEsp: string
  classTribNome: string
  tipoAliq: string
  vBcXml: number | null
  vBcNt: number | null
  pIbsUfXml: number | null
  pIbsUfEsp: number | null
  pIbsMunXml: number | null
  pIbsMunEsp: number | null
  pCbsXml: number | null
  pCbsEsp: number | null
  pRedUfXml: number | null
  pRedUfEsp: number | null
  pRedMunXml: number | null
  pRedMunEsp: number | null
  pRedCbsXml: number | null
  pRedCbsEsp: number | null
  pEfetUfXml: number | null
  pEfetUfEsp: number | null
  pEfetMunXml: number | null
  pEfetMunEsp: number | null
  pEfetCbsXml: number | null
  pEfetCbsEsp: number | null
  vIbsUfXml: number | null
  vIbsUfEsp: number | null
  vIbsMunXml: number | null
  vIbsMunEsp: number | null
  vIbsXml: number | null
  vIbsEsp: number | null
  vCbsXml: number | null
  vCbsEsp: number | null
  divergencias: DivergenciaCampo[]
  avisos: string[]
}

export interface LinhaTotaisValidacao {
  chave: string
  modelo: string
  numero: string
  xml: TotaisIbsCbsXml
  somaItens: TotaisIbsCbsXml
  divergencias: DivergenciaCampo[]
}

function fmt2(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(2)
}

function addDiv(
  lista: DivergenciaCampo[],
  codigo: CodigoDivergenciaIbsCbs,
  campo: string,
  xml: string,
  esperado: string,
  detalhe: string
) {
  lista.push({ codigo, campo, xml, esperado, detalhe })
}

function compararNum(
  lista: DivergenciaCampo[],
  codigo: CodigoDivergenciaIbsCbs,
  campo: string,
  xml: number | null | undefined,
  esp: number | null | undefined,
  tol: number,
  detalhe: string
) {
  if (esp == null) return
  if (!quaseIgual(xml ?? null, esp, tol)) {
    addDiv(lista, codigo, campo, xml == null ? '—' : String(xml), String(esp), detalhe)
  }
}

export function validarItemIbsCbs(opts: {
  modelo: string
  ano: number
  cstXml: string
  classTribXml: string
  vBcXml: number | null
  vBcNt: number
  pIbsUfXml: number | null
  pIbsMunXml: number | null
  pCbsXml: number | null
  pRedUfXml: number | null
  pRedMunXml: number | null
  pRedCbsXml: number | null
  pEfetUfXml: number | null
  pEfetMunXml: number | null
  pEfetCbsXml: number | null
  vIbsUfXml: number | null
  vIbsMunXml: number | null
  vIbsXml: number | null
  vCbsXml: number | null
}): { divergencias: DivergenciaCampo[]; avisos: string[]; calc: ReturnType<typeof calcularItemIbsCbs> } {
  const divergencias: DivergenciaCampo[] = []
  const avisos: string[] = []
  const cst = String(opts.cstXml || '').replace(/\D/g, '').padStart(3, '0')
  const classTrib = String(opts.classTribXml || '').replace(/\D/g, '').padStart(6, '0')
  const temGrupo = Boolean(opts.classTribXml || opts.cstXml || opts.vBcXml != null)

  if (!temGrupo) {
    if (opts.ano >= 2026) {
      addDiv(divergencias, 'grupo_ausente', 'IBSCBS', 'ausente', 'grupo no item', 'Emissão ≥ 2026 sem grupo IBSCBS no item')
    }
    const calcVazio = calcularItemIbsCbs({ cClassTrib: '000001', vBc: 0, ano: opts.ano })
    return { divergencias, avisos, calc: calcVazio }
  }

  const classif = buscarClassTrib(classTrib)
  if (!classif) {
    addDiv(divergencias, 'cclasstrib_desconhecido', 'cClassTrib', classTrib, 'código da tabela V0073', 'Par CST/cClassTrib não encontrado na tabela embarcada')
  } else {
    if (classif.cst !== cst) {
      addDiv(
        divergencias,
        'cst_incompativel',
        'CST',
        cst,
        classif.cst,
        'CST deve ser os 3 primeiros dígitos do cClassTrib'
      )
    }
    const modelo = opts.modelo
    if (modelo === '55' && !classif.nfe) {
      addDiv(divergencias, 'codigo_nao_habilitado', 'cClassTrib', classTrib, 'habilitado para NF-e', classif.nome)
    }
    if (modelo === '65' && !classif.nfce) {
      addDiv(divergencias, 'codigo_nao_habilitado', 'cClassTrib', classTrib, 'habilitado para NFC-e', classif.nome)
    }
  }

  const vBcEntrada = opts.vBcXml ?? opts.vBcNt
  const calc = calcularItemIbsCbs({
    cClassTrib: classTrib,
    vBc: vBcEntrada ?? 0,
    ano: opts.ano,
  })
  avisos.push(...calc.avisos)

  if (opts.vBcXml != null && !quaseIgual(opts.vBcXml, opts.vBcNt, TOLERANCIA_VALOR_NT)) {
    addDiv(
      divergencias,
      'base_nt',
      'vBC',
      fmt2(opts.vBcXml),
      fmt2(opts.vBcNt),
      'Base do XML difere da composição NT 2025.002 (aviso; valores usam o vBC declarado)'
    )
  }

  const recalculaValores = calc.tipo === 'padrao' || calc.tipo === 'sem'
  if (calc.tipo === 'sem') {
    const destacado =
      (opts.vIbsUfXml != null && Math.abs(opts.vIbsUfXml) > TOLERANCIA_VALOR_NT) ||
      (opts.vIbsMunXml != null && Math.abs(opts.vIbsMunXml) > TOLERANCIA_VALOR_NT) ||
      (opts.vCbsXml != null && Math.abs(opts.vCbsXml) > TOLERANCIA_VALOR_NT)
    if (destacado) {
      addDiv(divergencias, 'destaque_indevido', 'valores', 'destacado', '0,00', 'Tipo «Sem alíquota» não deve destacar IBS/CBS')
    }
  }

  if (recalculaValores && calc.tipo === 'padrao') {
    compararNum(divergencias, 'aliquota', 'pIBSUF', opts.pIbsUfXml, calc.ibsUf.pAliq, TOLERANCIA_ALIQ, 'Alíquota UF de referência 1.7.2')
    compararNum(divergencias, 'aliquota', 'pIBSMun', opts.pIbsMunXml, calc.ibsMun.pAliq, TOLERANCIA_ALIQ, 'Alíquota municipal de referência 1.7.2')
    if (calc.cbs) {
      compararNum(divergencias, 'aliquota', 'pCBS', opts.pCbsXml, calc.cbs.pAliq, TOLERANCIA_ALIQ, 'Alíquota CBS de referência 1.7.2')
    }
    if (calc.ibsUf.pRed > 0) {
      compararNum(divergencias, 'reducao', 'pRedAliq UF', opts.pRedUfXml, calc.ibsUf.pRed, TOLERANCIA_ALIQ, 'Redução da tabela cClassTrib')
    }
    if (calc.ibsMun.pRed > 0) {
      compararNum(divergencias, 'reducao', 'pRedAliq Mun', opts.pRedMunXml, calc.ibsMun.pRed, TOLERANCIA_ALIQ, 'Redução da tabela cClassTrib')
    }
    if (calc.cbs && calc.cbs.pRed > 0) {
      compararNum(divergencias, 'reducao', 'pRedAliq CBS', opts.pRedCbsXml, calc.cbs.pRed, TOLERANCIA_ALIQ, 'Redução da tabela cClassTrib')
    }
    const efetUfXml = opts.pEfetUfXml ?? (calc.ibsUf.pRed === 0 ? opts.pIbsUfXml : null)
    const efetMunXml = opts.pEfetMunXml ?? (calc.ibsMun.pRed === 0 ? opts.pIbsMunXml : null)
    const efetCbsXml = opts.pEfetCbsXml ?? (calc.cbs && calc.cbs.pRed === 0 ? opts.pCbsXml : null)
    compararNum(divergencias, 'aliquota', 'pAliqEfet UF', efetUfXml, calc.ibsUf.pAliqEfet, TOLERANCIA_ALIQ, 'pAliqEfet = arred4(pAliq × (1 − pRed/100))')
    compararNum(divergencias, 'aliquota', 'pAliqEfet Mun', efetMunXml, calc.ibsMun.pAliqEfet, TOLERANCIA_ALIQ, 'pAliqEfet municipal')
    if (calc.cbs) {
      compararNum(divergencias, 'aliquota', 'pAliqEfet CBS', efetCbsXml, calc.cbs.pAliqEfet, TOLERANCIA_ALIQ, 'pAliqEfet CBS')
    }
    compararNum(divergencias, 'valor', 'vIBSUF', opts.vIbsUfXml, calc.ibsUf.valor, TOLERANCIA_VALOR_NT, 'arred2(vBC × pAliqEfet ÷ 100) HALF_EVEN')
    compararNum(divergencias, 'valor', 'vIBSMun', opts.vIbsMunXml, calc.ibsMun.valor, TOLERANCIA_VALOR_NT, 'arred2(vBC × pAliqEfet ÷ 100) HALF_EVEN')
    if (calc.cbs) {
      compararNum(divergencias, 'valor', 'vCBS', opts.vCbsXml, calc.cbs.valor, TOLERANCIA_VALOR_NT, 'arred2(vBC × pAliqEfet ÷ 100) HALF_EVEN')
    }
    const vIbsXml = opts.vIbsXml ?? (opts.vIbsUfXml != null && opts.vIbsMunXml != null
      ? arredondarValorFiscal(opts.vIbsUfXml + opts.vIbsMunXml)
      : null)
    if (vIbsXml != null && !quaseIgual(vIbsXml, calc.vIbs, 0)) {
      addDiv(divergencias, 'vIbs', 'vIBS', fmt2(vIbsXml), fmt2(calc.vIbs), 'vIBS deve ser a soma de vIBSUF e vIBSMun publicados (1.7.2, sem tolerância)')
    }
  }

  return { divergencias, avisos, calc }
}

export function validarTotaisIbsCbs(xml: TotaisIbsCbsXml, soma: TotaisIbsCbsXml): DivergenciaCampo[] {
  const d: DivergenciaCampo[] = []
  const campos: Array<[keyof TotaisIbsCbsXml, string]> = [
    ['vBc', 'vBCIBSCBS'],
    ['vIbsUf', 'vIBSUF'],
    ['vIbsMun', 'vIBSMun'],
    ['vIbs', 'vIBS'],
    ['vCbs', 'vCBS'],
  ]
  for (const [k, nome] of campos) {
    const a = xml[k]
    const b = soma[k]
    if (a == null && b == null) continue
    if (!quaseIgual(a, b, 0)) {
      addDiv(d, 'totais', nome, fmt2(a), fmt2(b), 'IBSCBSTot deve fechar com a soma dos itens (ADR003 / rejeição 1091)')
    }
  }
  return d
}

function ehArquivoEventoPorNome(nome: string): boolean {
  return /_evento/i.test(nome) || /procEvento/i.test(nome) || /_cancCFe\.xml$/i.test(nome)
}

export function validarXmlIbsCbs(xmlStr: string): {
  modelo: string
  linhas: LinhaValidacaoIbsCbs[]
  totais?: LinhaTotaisValidacao
  cabecalho?: CabecalhoEmpresaRelatorio
} {
  if (!xmlElegivelRelatorioNotas(xmlStr) || /<(?:[\w.-]+:)?infCFe\b/i.test(xmlStr)) {
    return { modelo: '', linhas: [] }
  }
  const extraido = extrairLinhasRelatorioNotas(xmlStr)
  const modelo = extraido.linhas[0]?.modelo || ''
  if (modelo !== '55' && modelo !== '65') return { modelo, linhas: [] }

  let parsed: unknown
  try {
    parsed = xmlParser.parse(xmlStr)
  } catch {
    parsed = null
  }
  const totXml = extrairIbsCbsTot(parsed)
  const dhEmi = xmlStr.match(/<(?:[\w.-]+:)?dhEmi>([^<]+)</i)?.[1] || extraido.linhas[0]?.emissao || ''
  const ano = anoDeDhEmi(dhEmi, extraido.linhas[0]?.emissao || '')

  const soma: TotaisIbsCbsXml = { vBc: 0, vIbsUf: 0, vIbsMun: 0, vIbs: 0, vCbs: 0 }
  const linhas: LinhaValidacaoIbsCbs[] = []

  for (const l of extraido.linhas) {
    const vBcNt = baseNt2025002({
      vProd: l.vProd,
      vFrete: l.vFrete,
      vSeg: l.vSeg,
      vOutro: l.vOutro,
      vDesc: l.vDesc,
      vPis: l.pisValor,
      vCofins: l.cofinsValor,
      vIcms: l.icmsValor,
    })
    const { divergencias, avisos, calc } = validarItemIbsCbs({
      modelo,
      ano,
      cstXml: l.ibsCbsCst,
      classTribXml: l.ibsCbsClassTrib,
      vBcXml: l.ibsCbsVBc,
      vBcNt,
      pIbsUfXml: l.ibsAliqUf,
      pIbsMunXml: l.ibsAliqMun,
      pCbsXml: l.cbsAliq,
      pRedUfXml: l.ibsUfPctRed,
      pRedMunXml: l.ibsMunPctRed,
      pRedCbsXml: l.cbsPctRed,
      pEfetUfXml: l.ibsUfAliqEfet,
      pEfetMunXml: l.ibsMunAliqEfet,
      pEfetCbsXml: l.cbsAliqEfet,
      vIbsUfXml: l.ibsValorUf,
      vIbsMunXml: l.ibsValorMun,
      vIbsXml: l.ibsValorTotal,
      vCbsXml: l.cbsValor,
    })
    if (l.ibsCbsVBc != null) soma.vBc = arredondarValorFiscal((soma.vBc ?? 0) + l.ibsCbsVBc)
    if (l.ibsValorUf != null) soma.vIbsUf = arredondarValorFiscal((soma.vIbsUf ?? 0) + l.ibsValorUf)
    if (l.ibsValorMun != null) soma.vIbsMun = arredondarValorFiscal((soma.vIbsMun ?? 0) + l.ibsValorMun)
    const vIbsItem = l.ibsValorTotal ?? (l.ibsValorUf != null || l.ibsValorMun != null
      ? arredondarValorFiscal((l.ibsValorUf ?? 0) + (l.ibsValorMun ?? 0))
      : null)
    if (vIbsItem != null) soma.vIbs = arredondarValorFiscal((soma.vIbs ?? 0) + vIbsItem)
    if (l.cbsValor != null) soma.vCbs = arredondarValorFiscal((soma.vCbs ?? 0) + l.cbsValor)

    linhas.push({
      chave: l.chave,
      modelo,
      numero: l.numero,
      serie: l.serie,
      emissao: l.emissao,
      item: l.item,
      descricao: l.descricao,
      ncm: l.ncm,
      cstXml: l.ibsCbsCst,
      classTribXml: l.ibsCbsClassTrib,
      cstEsp: calc.classif?.cst ?? '',
      classTribNome: calc.classif?.nome ?? '',
      tipoAliq: calc.tipo,
      vBcXml: l.ibsCbsVBc,
      vBcNt,
      pIbsUfXml: l.ibsAliqUf,
      pIbsUfEsp: calc.ibsUf.pAliq,
      pIbsMunXml: l.ibsAliqMun,
      pIbsMunEsp: calc.ibsMun.pAliq,
      pCbsXml: l.cbsAliq,
      pCbsEsp: calc.cbs?.pAliq ?? null,
      pRedUfXml: l.ibsUfPctRed,
      pRedUfEsp: calc.ibsUf.pRed,
      pRedMunXml: l.ibsMunPctRed,
      pRedMunEsp: calc.ibsMun.pRed,
      pRedCbsXml: l.cbsPctRed,
      pRedCbsEsp: calc.cbs?.pRed ?? null,
      pEfetUfXml: l.ibsUfAliqEfet,
      pEfetUfEsp: calc.ibsUf.pAliqEfet,
      pEfetMunXml: l.ibsMunAliqEfet,
      pEfetMunEsp: calc.ibsMun.pAliqEfet,
      pEfetCbsXml: l.cbsAliqEfet,
      pEfetCbsEsp: calc.cbs?.pAliqEfet ?? null,
      vIbsUfXml: l.ibsValorUf,
      vIbsUfEsp: calc.ibsUf.valor,
      vIbsMunXml: l.ibsValorMun,
      vIbsMunEsp: calc.ibsMun.valor,
      vIbsXml: l.ibsValorTotal,
      vIbsEsp: calc.vIbs,
      vCbsXml: l.cbsValor,
      vCbsEsp: calc.cbs?.valor ?? null,
      divergencias,
      avisos,
    })
  }

  const totais: LinhaTotaisValidacao = {
    chave: extraido.linhas[0]?.chave || '',
    modelo,
    numero: extraido.linhas[0]?.numero || '',
    xml: totXml,
    somaItens: soma,
    divergencias: validarTotaisIbsCbs(totXml, soma),
  }

  return { modelo, linhas, totais, cabecalho: extraido.cabecalho }
}

export interface PreviewValidacaoIbsCbs {
  ok: boolean
  totalXml: number
  elegiveis: number
  arquivos: string[]
  xMotivo?: string
}

export function listarXmlsValidacaoIbsCbs(pastaRaiz: string): PreviewValidacaoIbsCbs {
  try {
    if (!pastaRaiz) throw new Error('Pasta de destino não informada.')
    if (!fs.existsSync(pastaRaiz)) throw new Error('Pasta de destino não encontrada.')
    const { caminhos, relativos } = listarXmlsRecursivo(pastaRaiz)
    const arquivos: string[] = []
    for (let i = 0; i < caminhos.length; i++) {
      const nome = path.basename(caminhos[i])
      if (ehArquivoEventoPorNome(nome)) continue
      let conteudo = ''
      try {
        conteudo = fs.readFileSync(caminhos[i], 'utf-8')
      } catch {
        continue
      }
      if (!xmlElegivelRelatorioNotas(conteudo) || /<(?:[\w.-]+:)?infCFe\b/i.test(conteudo)) continue
      const mod = conteudo.match(/<(?:[\w.-]+:)?mod>(\d{2})<\/(?:[\w.-]+:)?mod>/i)?.[1]
      if (mod === '55' || mod === '65') arquivos.push(relativos[i])
    }
    return { ok: true, totalXml: caminhos.length, elegiveis: arquivos.length, arquivos }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, totalXml: 0, elegiveis: 0, arquivos: [], xMotivo: msg }
  }
}

export function montarNomeArquivoValidacaoIbsCbs(cab?: CabecalhoEmpresaRelatorio): string {
  const nome = (cab?.nome ?? '').trim() || 'empresa-sem-nome'
  const cnpj = (cab?.cnpj ?? '').replace(/\D/g, '') || 'sem-cnpj'
  return `${limparNomeArquivo(`${nome} - ${cnpj}`)} - validacao_ibs_cbs.xlsx`
}

const HEADERS_ITENS = [
  'Chave',
  'Modelo',
  'Número',
  'Série',
  'Emissão',
  'Item',
  'Descrição',
  'NCM',
  'CST XML',
  'cClassTrib XML',
  'CST esperado',
  'Nome cClassTrib',
  'Tipo alíquota',
  'BC XML',
  'BC NT 2025.002',
  'pIBSUF XML',
  'pIBSUF calc',
  'pIBSMun XML',
  'pIBSMun calc',
  'pCBS XML',
  'pCBS calc',
  'pRed UF XML',
  'pRed UF calc',
  'vIBSUF XML',
  'vIBSUF calc',
  'vIBSMun XML',
  'vIBSMun calc',
  'vIBS XML',
  'vIBS calc',
  'vCBS XML',
  'vCBS calc',
  'Divergências',
  'Avisos',
] as const

function linhaItemParaArray(l: LinhaValidacaoIbsCbs): (string | number | null)[] {
  return [
    l.chave,
    l.modelo,
    l.numero,
    l.serie,
    l.emissao,
    l.item,
    l.descricao,
    l.ncm,
    l.cstXml,
    l.classTribXml,
    l.cstEsp,
    l.classTribNome,
    l.tipoAliq,
    l.vBcXml,
    l.vBcNt,
    l.pIbsUfXml,
    l.pIbsUfEsp,
    l.pIbsMunXml,
    l.pIbsMunEsp,
    l.pCbsXml,
    l.pCbsEsp,
    l.pRedUfXml,
    l.pRedUfEsp,
    l.vIbsUfXml,
    l.vIbsUfEsp,
    l.vIbsMunXml,
    l.vIbsMunEsp,
    l.vIbsXml,
    l.vIbsEsp,
    l.vCbsXml,
    l.vCbsEsp,
    l.divergencias.map((d) => `${d.campo}: XML ${d.xml} ≠ ${d.esperado}`).join(' | '),
    l.avisos.join(' | '),
  ]
}

const COLS_NUM_ITENS = new Set(
  HEADERS_ITENS.map((h, i) => ({ h, col: i + 1 }))
    .filter(({ h }) => /^(BC |pIBS|pCBS|pRed |vIBS|vCBS)/.test(h))
    .map(({ col }) => col)
)

function pintarDivergencia(row: ExcelJS.Row, temDiv: boolean, colsXmlCalc: Array<[number, number]>) {
  if (!temDiv) return
  for (const [xmlCol, calcCol] of colsXmlCalc) {
    const a = row.getCell(xmlCol).value
    const b = row.getCell(calcCol).value
    if (String(a ?? '') !== String(b ?? '')) {
      row.getCell(xmlCol).fill = FILL_DIVERG
      row.getCell(calcCol).fill = FILL_DIVERG
    }
  }
}

export async function gerarValidacaoIbsCbsXlsxBuffer(
  linhas: LinhaValidacaoIbsCbs[],
  totais: LinhaTotaisValidacao[],
  cab?: CabecalhoEmpresaRelatorio,
  resumo?: { notas: number; itens: number; comDiv: number; totaisDiv: number }
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const nomeEmpresa = (cab?.nome ?? '').trim() || '—'
  const cnpjFmt = formatarCnpjRelatorioDigitos(cab?.cnpj)

  const wsR = wb.addWorksheet('Resumo', { views: [{ state: 'frozen', ySplit: 2 }] })
  wsR.mergeCells('A1:B1')
  wsR.getCell('A1').value = `EMPRESA : ${nomeEmpresa}    |    CNPJ ${cnpjFmt}`
  wsR.getCell('A1').font = { bold: true, color: { argb: 'FFB91C1C' }, size: 12 }
  const meta = [
    ['Ferramenta', 'Validação Notas IBS|CBS (modelos 55 e 65)'],
    ['Calculadora RFB', `${VERSAO_CALCULADORA_RFB} · Flyway ${FLYWAY_BASE_RFB} · ${IT_TABELAS_RFB}`],
    ['Arredondamento', 'HALF_EVEN (ABNT NBR 5891), política 1.7.2 — sem Java no cliente'],
    ['Notas analisadas', resumo?.notas ?? 0],
    ['Itens', resumo?.itens ?? linhas.length],
    ['Itens com divergência', resumo?.comDiv ?? linhas.filter((l) => l.divergencias.length > 0).length],
    ['Notas com totais divergentes', resumo?.totaisDiv ?? totais.filter((t) => t.divergencias.length > 0).length],
  ]
  for (const [k, v] of meta) {
    const r = wsR.addRow([k, v])
    r.getCell(1).font = { bold: true }
  }
  wsR.columns = [{ width: 32 }, { width: 72 }]

  const wsI = wb.addWorksheet('Itens', { views: [{ state: 'frozen', ySplit: 1 }] })
  const hI = wsI.addRow([...HEADERS_ITENS])
  hI.font = { bold: true, color: { argb: 'FF111827' } }
  hI.fill = FILL_HEADER
  const pares: Array<[number, number]> = [
    [14, 15],
    [16, 17],
    [18, 19],
    [20, 21],
    [24, 25],
    [26, 27],
    [28, 29],
    [30, 31],
  ]
  for (const l of linhas) {
    const row = wsI.addRow(linhaItemParaArray(l))
    for (let c = 1; c <= HEADERS_ITENS.length; c++) {
      row.getCell(c).numFmt = COLS_NUM_ITENS.has(c) ? '#,##0.00' : '@'
    }
    if (l.divergencias.length > 0) {
      row.getCell(HEADERS_ITENS.length - 1).fill = FILL_DIVERG
      pintarDivergencia(row, true, pares)
    }
  }
  wsI.columns = HEADERS_ITENS.map((h) => ({ width: Math.min(36, Math.max(10, h.length + 2)) }))
  if (linhas.length > 0) {
    wsI.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: HEADERS_ITENS.length } }
  }

  const wsT = wb.addWorksheet('Totais', { views: [{ state: 'frozen', ySplit: 1 }] })
  const hT = wsT.addRow([
    'Chave',
    'Modelo',
    'Número',
    'vBCIBSCBS XML',
    'vBCIBSCBS soma',
    'vIBSUF XML',
    'vIBSUF soma',
    'vIBSMun XML',
    'vIBSMun soma',
    'vIBS XML',
    'vIBS soma',
    'vCBS XML',
    'vCBS soma',
    'Divergências',
  ])
  hT.font = { bold: true, color: { argb: 'FF111827' } }
  hT.fill = FILL_HEADER
  for (const t of totais) {
    const row = wsT.addRow([
      t.chave,
      t.modelo,
      t.numero,
      t.xml.vBc,
      t.somaItens.vBc,
      t.xml.vIbsUf,
      t.somaItens.vIbsUf,
      t.xml.vIbsMun,
      t.somaItens.vIbsMun,
      t.xml.vIbs,
      t.somaItens.vIbs,
      t.xml.vCbs,
      t.somaItens.vCbs,
      t.divergencias.map((d) => `${d.campo}: XML ${d.xml} ≠ ${d.esperado}`).join(' | '),
    ])
    for (let c = 4; c <= 13; c++) row.getCell(c).numFmt = '#,##0.00'
    row.getCell(1).numFmt = '@'
    if (t.divergencias.length > 0) {
      row.getCell(14).fill = FILL_ERRO
      for (let c = 4; c <= 13; c++) row.getCell(c).fill = FILL_ERRO
    }
  }
  wsT.columns = Array.from({ length: 14 }, (_, i) => ({ width: i === 0 ? 48 : i === 13 ? 50 : 16 }))

  const soDiv = linhas.filter((l) => l.divergencias.length > 0)
  const wsD = wb.addWorksheet('Divergências', { views: [{ state: 'frozen', ySplit: 1 }] })
  const hD = wsD.addRow([...HEADERS_ITENS])
  hD.font = { bold: true, color: { argb: 'FF111827' } }
  hD.fill = FILL_HEADER
  for (const l of soDiv) {
    const row = wsD.addRow(linhaItemParaArray(l))
    for (let c = 1; c <= HEADERS_ITENS.length; c++) {
      row.getCell(c).numFmt = COLS_NUM_ITENS.has(c) ? '#,##0.00' : '@'
    }
    row.getCell(HEADERS_ITENS.length - 1).fill = FILL_DIVERG
  }
  wsD.columns = HEADERS_ITENS.map((h) => ({ width: Math.min(36, Math.max(10, h.length + 2)) }))

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
}

export async function gerarValidacaoIbsCbsNaPasta(pastaRaiz: string): Promise<{
  ok: boolean
  arquivo?: string
  caminhoCompleto?: string
  notas?: number
  itens?: number
  comDivergencia?: number
  totaisDivergentes?: number
  avisos?: number
  versaoCalculadora?: string
  arquivos?: string[]
  amostra?: Array<{ chave: string; item: string; divergencias: string }>
  xMotivo?: string
}> {
  try {
    if (!pastaRaiz) throw new Error('Pasta de destino não informada.')
    if (!fs.existsSync(pastaRaiz)) throw new Error('Pasta de destino não encontrada.')

    const { caminhos, relativos } = listarXmlsRecursivo(pastaRaiz)
    const porChave = new Map<
      string,
      { linhas: LinhaValidacaoIbsCbs[]; totais?: LinhaTotaisValidacao; cab?: CabecalhoEmpresaRelatorio; rel: string }
    >()
    let cabecalho: CabecalhoEmpresaRelatorio | undefined

    for (let i = 0; i < caminhos.length; i++) {
      const nome = path.basename(caminhos[i])
      if (ehArquivoEventoPorNome(nome)) continue
      let conteudo = ''
      try {
        conteudo = fs.readFileSync(caminhos[i], 'utf-8')
      } catch {
        continue
      }
      const r = validarXmlIbsCbs(conteudo)
      if (r.linhas.length === 0) continue
      const chave = r.linhas[0].chave || relativos[i]
      const atual = porChave.get(chave)
      if (!atual || r.linhas.length > atual.linhas.length) {
        porChave.set(chave, { linhas: r.linhas, totais: r.totais, cab: r.cabecalho, rel: relativos[i] })
      }
      if (!cabecalho && r.cabecalho) cabecalho = r.cabecalho
    }

    const todas: LinhaValidacaoIbsCbs[] = []
    const totais: LinhaTotaisValidacao[] = []
    for (const n of porChave.values()) {
      if (!cabecalho && n.cab) cabecalho = n.cab
      todas.push(...n.linhas)
      if (n.totais) totais.push(n.totais)
    }
    todas.sort((a, b) => a.chave.localeCompare(b.chave) || a.item.localeCompare(b.item))

    if (todas.length === 0) {
      return {
        ok: false,
        xMotivo: 'Nenhum XML de NF-e (55) ou NFC-e (65) com itens encontrado na pasta.',
      }
    }

    const comDiv = todas.filter((l) => l.divergencias.length > 0).length
    const totDiv = totais.filter((t) => t.divergencias.length > 0).length
    const avisos = todas.reduce((n, l) => n + l.avisos.length, 0)
    const buffer = await gerarValidacaoIbsCbsXlsxBuffer(todas, totais, cabecalho, {
      notas: porChave.size,
      itens: todas.length,
      comDiv,
      totaisDiv: totDiv,
    })
    const arquivo = montarNomeArquivoValidacaoIbsCbs(cabecalho)
    const caminhoCompleto = path.join(pastaRaiz, arquivo)
    fs.writeFileSync(caminhoCompleto, buffer)

    const amostra = todas
      .filter((l) => l.divergencias.length > 0)
      .slice(0, 8)
      .map((l) => ({
        chave: l.chave,
        item: l.item,
        divergencias: l.divergencias.map((d) => d.campo).join(', '),
      }))

    return {
      ok: true,
      arquivo,
      caminhoCompleto,
      notas: porChave.size,
      itens: todas.length,
      comDivergencia: comDiv,
      totaisDivergentes: totDiv,
      avisos,
      versaoCalculadora: VERSAO_CALCULADORA_RFB,
      arquivos: [...porChave.values()].map((n) => n.rel),
      amostra,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, xMotivo: msg }
  }
}
