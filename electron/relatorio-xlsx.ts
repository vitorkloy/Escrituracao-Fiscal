import ExcelJS from 'exceljs'

/** Cabeçalho (razão social + CNPJ) usado nos nomes e na 1ª linha do comparativo. */
export interface CabecalhoEmpresaRelatorio {
  nome?: string
  cnpj?: string
}

export type RelatorioNotasCabecalho = CabecalhoEmpresaRelatorio

/** Uma linha do relatório Notas — 1 item por linha (layout FSist 61 colunas + CRT). */
export interface RelatorioNotasLinha {
  chave: string
  numero: string
  serie: string
  modelo: string
  emissao: string
  emitenteDoc: string
  emitenteNome: string
  emitenteUf: string
  destDoc: string
  destNome: string
  destUf: string
  transportadorDoc: string
  transportadorNome: string
  item: string
  codigoProduto: string
  codigoBarras: string
  descricao: string
  ncm: string
  cfop: string
  qtd: number | null
  vUnit: number | null
  vProd: number | null
  vFrete: number | null
  vSeg: number | null
  vDesc: number | null
  vOutro: number | null
  icmsCst: string
  icmsVBc: number | null
  icmsAliq: number | null
  icmsValor: number | null
  ipiValor: number | null
  pisCst: string
  pisVBc: number | null
  pisAliq: number | null
  pisValor: number | null
  cofinsCst: string
  cofinsVBc: number | null
  cofinsAliq: number | null
  cofinsValor: number | null
  ibsCbsCst: string
  ibsCbsClassTrib: string
  ibsCbsVBc: number | null
  ibsAliqUf: number | null
  ibsUfPctRed: number | null
  ibsUfAliqEfet: number | null
  ibsValorUf: number | null
  ibsAliqMun: number | null
  ibsMunPctRed: number | null
  ibsMunAliqEfet: number | null
  ibsValorMun: number | null
  ibsValorTotal: number | null
  cbsAliq: number | null
  cbsPctRed: number | null
  cbsAliqEfet: number | null
  cbsValor: number | null
  indPres: string
  pRedBc: number | null
  pRedBcSt: number | null
  pRedBcEfet: number | null
  tpNFDebito: string
  tpNFCredito: string
  finNFe: string
  crt: string
}

export interface RelatorioComparativoLinha {
  chave: string
  dhEmi?: string
  serie?: string
  nNF?: string
  vNF?: string
}

/** Cabeçalhos idênticos ao relatório de referência FSist (61 colunas). */
export const HEADERS_NOTAS = [
  'Chave',
  'Número',
  'Série',
  'Modelo',
  'Emissão',
  'Emitente CNPJ/CPF',
  'Emitente',
  'Emitente UF',
  'Destinatário CNPJ/CPF',
  'Destinatário',
  'Destinatário UF',
  'Transportador CNPJ/CPF',
  'Transportador',
  'Item',
  'Código do produto',
  'Código de Barras',
  'Descrição do produto',
  'NCM',
  'CFOP',
  'Qtd',
  'Valor Unitário',
  'Valor Produto',
  'Valor Frete',
  'Valor Seguro',
  'Valor Desconto',
  'Valor Outras Despesas',
  'ICMS CST',
  'ICMS Valor da BC',
  'ICMS Alíquota',
  'ICMS Valor',
  'IPI Valor',
  'PIS CST',
  'PIS Valor da BC',
  'PIS Alíquota',
  'PIS Valor',
  'COFINS CST',
  'COFINS Valor da BC',
  'COFINS Alíquota',
  'COFINS Valor',
  'IBS/CBS CST',
  'Classificação Tributária IBS/CBS',
  'IBS/CBS Valor BC',
  'IBS Alíquota UF',
  'IBS UF % Redução Alíquota',
  'IBS UF Alíquota Efetiva',
  'Valor IBS UF',
  'IBS Alíquota Municipal',
  'IBS Mun. % Redução Alíquota',
  'IBS Mun. Alíquota Efetiva',
  'Valor IBS Municipal',
  'Valor Total IBS',
  'CBS Alíquota',
  'CBS % Redução Alíquota',
  'CBS Alíquota Efetiva',
  'Valor CBS',
  'indPres',
  'pRedBC',
  'pRedBCST',
  'pRedBCEfet',
  'tpNFDebito',
  'tpNFCredito',
  'finNFe',
  'CRT',
] as const

export function linhaRelatorioNotasEmBranco(): RelatorioNotasLinha {
  return {
    chave: '',
    numero: '',
    serie: '',
    modelo: '',
    emissao: '',
    emitenteDoc: '',
    emitenteNome: '',
    emitenteUf: '',
    destDoc: '',
    destNome: '',
    destUf: '',
    transportadorDoc: '',
    transportadorNome: '',
    item: '',
    codigoProduto: '',
    codigoBarras: '',
    descricao: '',
    ncm: '',
    cfop: '',
    qtd: null,
    vUnit: null,
    vProd: null,
    vFrete: null,
    vSeg: null,
    vDesc: null,
    vOutro: null,
    icmsCst: '',
    icmsVBc: null,
    icmsAliq: null,
    icmsValor: null,
    ipiValor: null,
    pisCst: '',
    pisVBc: null,
    pisAliq: null,
    pisValor: null,
    cofinsCst: '',
    cofinsVBc: null,
    cofinsAliq: null,
    cofinsValor: null,
    ibsCbsCst: '',
    ibsCbsClassTrib: '',
    ibsCbsVBc: null,
    ibsAliqUf: null,
    ibsUfPctRed: null,
    ibsUfAliqEfet: null,
    ibsValorUf: null,
    ibsAliqMun: null,
    ibsMunPctRed: null,
    ibsMunAliqEfet: null,
    ibsValorMun: null,
    ibsValorTotal: null,
    cbsAliq: null,
    cbsPctRed: null,
    cbsAliqEfet: null,
    cbsValor: null,
    indPres: '',
    pRedBc: null,
    pRedBcSt: null,
    pRedBcEfet: null,
    tpNFDebito: '',
    tpNFCredito: '',
    finNFe: '',
    crt: '',
  }
}

export function limparNomeArquivo(base: string): string {
  const semInvalidos = base.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim()
  return semInvalidos.replace(/[. ]+$/g, '') || 'empresa-sem-nome'
}

export function formatarCnpjCpf(raw: string): string {
  const d = raw.replace(/\D/g, '')
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`
  }
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`
  }
  return raw.trim()
}

export function formatarCnpjRelatorioDigitos(raw: string | undefined): string {
  if (!raw) return '—'
  const d = raw.replace(/\D/g, '')
  if (d.length !== 14) {
    const t = raw.trim()
    return t || '—'
  }
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`
}

export function parseValorMonetarioRelatorio(raw: string | undefined): number | null {
  if (!raw) return null
  const limpo = raw.trim()
  if (!limpo) return null
  // XML NFC-e/NFe (vNF): ponto como separador decimal, sem separador de milhar — ex.: "63.33".
  // Se houver vírgula, interpreta como formato BR visual — ex.: "1.234,56".
  let normalizado: string
  if (limpo.includes(',')) {
    normalizado = limpo.replace(/\./g, '').replace(',', '.')
  } else {
    normalizado = limpo.replace(/\s/g, '')
  }
  const n = Number(normalizado)
  return Number.isFinite(n) ? n : null
}

function baseNomeEmpresaCnpj(cabecalhoEmpresa?: CabecalhoEmpresaRelatorio): string {
  const nome = (cabecalhoEmpresa?.nome ?? '').trim() || 'empresa-sem-nome'
  const cnpj = (cabecalhoEmpresa?.cnpj ?? '').replace(/\D/g, '') || 'sem-cnpj'
  return limparNomeArquivo(`${nome} - ${cnpj}`)
}

export function montarNomesArquivosRelatorio(cabecalhoEmpresa?: CabecalhoEmpresaRelatorio): {
  aprovado: string
  cancelado: string
} {
  const base = baseNomeEmpresaCnpj(cabecalhoEmpresa)
  return {
    aprovado: `${base} - comparativo_aprovado.xlsx`,
    cancelado: `${base} - comparativo_cancelamento.xlsx`,
  }
}

export function montarNomeArquivoRelatorioNotas(cab?: RelatorioNotasCabecalho): string {
  return `${baseNomeEmpresaCnpj(cab)} - relatorio_notas.xlsx`
}

function linhaNotasParaArray(l: RelatorioNotasLinha): (string | number | null)[] {
  return [
    l.chave,
    l.numero,
    l.serie,
    l.modelo,
    l.emissao,
    l.emitenteDoc,
    l.emitenteNome,
    l.emitenteUf,
    l.destDoc,
    l.destNome,
    l.destUf,
    l.transportadorDoc,
    l.transportadorNome,
    l.item,
    l.codigoProduto,
    l.codigoBarras,
    l.descricao,
    l.ncm,
    l.cfop,
    l.qtd,
    l.vUnit,
    l.vProd,
    l.vFrete,
    l.vSeg,
    l.vDesc,
    l.vOutro,
    l.icmsCst,
    l.icmsVBc,
    l.icmsAliq,
    l.icmsValor,
    l.ipiValor,
    l.pisCst,
    l.pisVBc,
    l.pisAliq,
    l.pisValor,
    l.cofinsCst,
    l.cofinsVBc,
    l.cofinsAliq,
    l.cofinsValor,
    l.ibsCbsCst,
    l.ibsCbsClassTrib,
    l.ibsCbsVBc,
    l.ibsAliqUf,
    l.ibsUfPctRed,
    l.ibsUfAliqEfet,
    l.ibsValorUf,
    l.ibsAliqMun,
    l.ibsMunPctRed,
    l.ibsMunAliqEfet,
    l.ibsValorMun,
    l.ibsValorTotal,
    l.cbsAliq,
    l.cbsPctRed,
    l.cbsAliqEfet,
    l.cbsValor,
    l.indPres,
    l.pRedBc,
    l.pRedBcSt,
    l.pRedBcEfet,
    l.tpNFDebito,
    l.tpNFCredito,
    l.finNFe,
    l.crt,
  ]
}

export async function gerarComparativoXlsxBuffer(
  linhas: RelatorioComparativoLinha[],
  cabecalhoEmpresa?: CabecalhoEmpresaRelatorio
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Comparativo NFC-e', {
    views: [{ state: 'frozen', ySplit: 2 }],
  })

  const nomeEmpresa = (cabecalhoEmpresa?.nome ?? '').trim() || '—'
  const cnpjFmt = formatarCnpjRelatorioDigitos(cabecalhoEmpresa?.cnpj)
  ws.mergeCells('A1:E1')
  ws.getCell('A1').value = `EMPRESA : ${nomeEmpresa}    |    CNPJ ${cnpjFmt}`
  ws.getCell('A1').font = { bold: true, color: { argb: 'FFB91C1C' }, size: 12 }

  const headerRow = ws.addRow([
    'Série',
    'Número do documento',
    'Data de emissão',
    'Valor do cupom',
    'Chave de acesso',
  ])
  headerRow.font = { bold: true, color: { argb: 'FF111827' } }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE5E7EB' },
  }
  headerRow.border = {
    top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  }

  let somaValores = 0
  for (const l of linhas) {
    const vNfNumero = parseValorMonetarioRelatorio(l.vNF)
    if (vNfNumero != null) somaValores += vNfNumero
    const row = ws.addRow([
      l.serie ?? '',
      l.nNF ?? '',
      l.dhEmi ?? '',
      vNfNumero ?? l.vNF ?? '',
      l.chave ?? '',
    ])
    row.getCell(1).numFmt = '@'
    row.getCell(2).numFmt = '@'
    row.getCell(4).numFmt = '#,##0.00'
    row.getCell(5).numFmt = '@'
  }

  if (linhas.length > 0) {
    const totalRow = ws.addRow(['', '', 'Total geral', somaValores, ''])
    totalRow.getCell(3).font = { bold: true }
    totalRow.getCell(4).numFmt = '#,##0.00'
    totalRow.getCell(4).font = { bold: true }
  }

  ws.columns = [
    { width: 12 },
    { width: 24 },
    { width: 28 },
    { width: 18 },
    { width: 50 },
  ]
  ws.autoFilter = {
    from: 'A2',
    to: 'E2',
  }

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
}

export async function gerarRelatorioNotasXlsxBuffer(
  linhas: RelatorioNotasLinha[]
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Notas', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  const headerRow = ws.addRow([...HEADERS_NOTAS])
  headerRow.font = { bold: true, color: { argb: 'FF111827' } }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE5E7EB' },
  }

  // Colunas numéricas (1-based): Qtd=20, valores monetários/alíquotas
  const numFmtCols = new Set([
    20, 21, 22, 23, 24, 25, 26, 28, 29, 30, 31, 33, 34, 35, 37, 38, 39, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 57, 58, 59,
  ])

  for (const l of linhas) {
    const row = ws.addRow(linhaNotasParaArray(l))
    for (let c = 1; c <= HEADERS_NOTAS.length; c++) {
      row.getCell(c).numFmt = numFmtCols.has(c) ? '#,##0.00' : '@'
    }
  }

  ws.columns = HEADERS_NOTAS.map((h) => ({
    width: Math.min(48, Math.max(10, h.length + 2)),
  }))
  if (linhas.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: HEADERS_NOTAS.length },
    }
  }

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
}
