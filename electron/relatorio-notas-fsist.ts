import fs from 'fs'
import path from 'path'
import ExcelJS from 'exceljs'

/** Uma linha do relatório Notas (estilo FSist) — 1 item por linha. */
export interface RelatorioNotasLinha {
  chave: string
  numero: string
  serie: string
  modelo: string
  emissao: string
  natureza: string
  emitenteDoc: string
  emitenteNome: string
  emitenteUf: string
  destDoc: string
  destNome: string
  destUf: string
  item: string
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
  icmsCst: string
  icmsVBc: number | null
  icmsAliq: number | null
  icmsValor: number | null
  ipiValor: number | null
}

export interface RelatorioNotasCabecalho {
  nome?: string
  cnpj?: string
}

export interface RelatorioNotasScanResult {
  caminhos: string[]
  /** Caminhos relativos à pasta raiz (para preview na UI). */
  relativos: string[]
}

const HEADERS_NOTAS = [
  'Chave',
  'Número',
  'Série',
  'Modelo',
  'Emissão',
  'Natureza da operação',
  'Emitente CNPJ/CPF',
  'Emitente',
  'Emitente UF',
  'Destinatário CNPJ/CPF',
  'Destinatário',
  'Destinatário UF',
  'Item',
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
  'ICMS CST',
  'ICMS Valor da BC',
  'ICMS Alíquota',
  'ICMS Valor',
  'IPI Valor',
] as const

function tag(bloco: string, nome: string): string {
  const m = bloco.match(new RegExp(`<(?:[\\w.-]+:)?${nome}(?:\\s[^>]*)?>([^<]*)</(?:[\\w.-]+:)?${nome}>`, 'i'))
  return m?.[1]?.trim() ?? ''
}

function blocoTag(xml: string, nome: string): string {
  const m = xml.match(new RegExp(`<(?:[\\w.-]+:)?${nome}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${nome}>`, 'i'))
  return m?.[1] ?? ''
}

function formatarDoc(raw: string): string {
  const d = raw.replace(/\D/g, '')
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`
  }
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`
  }
  return raw.trim()
}

function parseNumeroXml(raw: string): number | null {
  if (!raw) return null
  const limpo = raw.trim().replace(/\s/g, '')
  if (!limpo) return null
  let normalizado: string
  if (limpo.includes(',')) {
    normalizado = limpo.replace(/\./g, '').replace(',', '.')
  } else {
    normalizado = limpo
  }
  const n = Number(normalizado)
  return Number.isFinite(n) ? n : null
}

/** Converte dhEmi ISO (2026-07-02T14:48:11-03:00) → dd/MM/yyyy HH:mm:ss */
export function formatarDhEmiRelatorio(dhEmi: string): string {
  const m = dhEmi.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/
  )
  if (!m) return dhEmi
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6]}`
}

function limparNomeArquivo(base: string): string {
  const semInvalidos = base.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim()
  return semInvalidos.replace(/[. ]+$/g, '') || 'empresa-sem-nome'
}

export function montarNomeArquivoRelatorioNotas(cab?: RelatorioNotasCabecalho): string {
  const nome = (cab?.nome ?? '').trim() || 'empresa-sem-nome'
  const cnpj = (cab?.cnpj ?? '').replace(/\D/g, '') || 'sem-cnpj'
  return `${limparNomeArquivo(`${nome} - ${cnpj}`)} - relatorio_notas.xlsx`
}

function extrairDocPessoa(bloco: string): string {
  const cnpj = tag(bloco, 'CNPJ')
  if (cnpj) return formatarDoc(cnpj)
  const cpf = tag(bloco, 'CPF')
  if (cpf) return formatarDoc(cpf)
  return ''
}

function extrairIcmsDoImposto(imposto: string): {
  cst: string
  vBc: number | null
  pIcms: number | null
  vIcms: number | null
} {
  const cst = tag(imposto, 'CST') || tag(imposto, 'CSOSN')
  return {
    cst,
    vBc: parseNumeroXml(tag(imposto, 'vBC')),
    pIcms: parseNumeroXml(tag(imposto, 'pICMS')),
    vIcms: parseNumeroXml(tag(imposto, 'vICMS')),
  }
}

function codigoBarrasDoProd(prod: string): string {
  const cean = tag(prod, 'cEAN')
  if (cean && cean.toUpperCase() !== 'SEM GTIN') return cean
  const trib = tag(prod, 'cEANTrib')
  if (trib && trib.toUpperCase() !== 'SEM GTIN') return trib
  return 'SEM GTIN'
}

/**
 * XML elegível: tem infNFe e ao menos um det (procNFe / nfeProc / NFe).
 * resNFe e eventos sem det são ignorados.
 */
export function xmlElegivelRelatorioNotas(conteudo: string): boolean {
  if (!/<(?:[\w.-]+:)?infNFe\b/i.test(conteudo)) return false
  return /<(?:[\w.-]+:)?det\b/i.test(conteudo)
}

/** Lista recursiva de .xml sob pastaRaiz. */
export function listarXmlsRecursivo(pastaRaiz: string): RelatorioNotasScanResult {
  const caminhos: string[] = []
  const relativos: string[] = []

  function walk(dir: string, relBase: string) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      const rel = relBase ? path.join(relBase, ent.name) : ent.name
      if (ent.isDirectory()) {
        walk(full, rel)
      } else if (ent.isFile() && /\.xml$/i.test(ent.name)) {
        caminhos.push(full)
        relativos.push(rel.replace(/\\/g, '/'))
      }
    }
  }

  walk(pastaRaiz, '')
  caminhos.sort((a, b) => a.localeCompare(b, 'pt-BR'))
  relativos.sort((a, b) => a.localeCompare(b, 'pt-BR'))
  return { caminhos, relativos }
}

/** Preview: XMLs elegíveis (lê conteúdo; limita leitura a arquivos candidatos). */
export function listarXmlsElegiveisNotas(pastaRaiz: string): {
  totalXml: number
  elegiveis: string[]
  totalElegiveis: number
} {
  const { caminhos, relativos } = listarXmlsRecursivo(pastaRaiz)
  const elegiveis: string[] = []
  for (let i = 0; i < caminhos.length; i++) {
    const nome = path.basename(caminhos[i])
    // Atalho: resNFe / evento raramente têm det
    if (/_resNFe\.xml$/i.test(nome) || /_evento/i.test(nome)) continue
    let conteudo = ''
    try {
      conteudo = fs.readFileSync(caminhos[i], 'utf-8')
    } catch {
      continue
    }
    if (xmlElegivelRelatorioNotas(conteudo)) {
      elegiveis.push(relativos[i])
    }
  }
  return {
    totalXml: caminhos.length,
    elegiveis,
    totalElegiveis: elegiveis.length,
  }
}

export function extrairLinhasRelatorioNotas(xmlStr: string): {
  linhas: RelatorioNotasLinha[]
  cabecalho?: RelatorioNotasCabecalho
} {
  if (!xmlElegivelRelatorioNotas(xmlStr)) return { linhas: [] }

  const ide = blocoTag(xmlStr, 'ide')
  const emit = blocoTag(xmlStr, 'emit')
  const dest = blocoTag(xmlStr, 'dest')

  const chave =
    xmlStr.match(/<(?:[\w.-]+:)?infNFe\b[^>]*\bId\s*=\s*["']NFe(\d{44})["']/i)?.[1] ??
    tag(xmlStr, 'chNFe')

  const numero = tag(ide, 'nNF')
  const serie = tag(ide, 'serie')
  const modelo = tag(ide, 'mod')
  const emissao = formatarDhEmiRelatorio(tag(ide, 'dhEmi') || tag(ide, 'dEmi'))
  const natureza = tag(ide, 'natOp')

  const emitenteDoc = extrairDocPessoa(emit)
  const emitenteNome = tag(emit, 'xNome')
  const emitUf = blocoTag(emit, 'enderEmit')
  const emitenteUf = tag(emitUf, 'UF')

  const destDoc = extrairDocPessoa(dest)
  const destNome = tag(dest, 'xNome')
  const destEnd = blocoTag(dest, 'enderDest')
  const destUf = tag(destEnd, 'UF')

  const cabecalho: RelatorioNotasCabecalho | undefined =
    destDoc || destNome
      ? { nome: destNome || undefined, cnpj: destDoc.replace(/\D/g, '') || undefined }
      : emitenteDoc || emitenteNome
        ? { nome: emitenteNome || undefined, cnpj: emitenteDoc.replace(/\D/g, '') || undefined }
        : undefined

  const linhas: RelatorioNotasLinha[] = []
  const detRe = /<(?:[\w.-]+:)?det\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?det>/gi
  let m: RegExpExecArray | null
  while ((m = detRe.exec(xmlStr)) !== null) {
    const attrs = m[1] ?? ''
    const detBody = m[2] ?? ''
    const nItemAttr = attrs.match(/\bnItem\s*=\s*["'](\d+)["']/i)?.[1]
    const prod = blocoTag(detBody, 'prod')
    const imposto = blocoTag(detBody, 'imposto')
    const icmsBloco = blocoTag(imposto, 'ICMS') || imposto
    const icms = extrairIcmsDoImposto(icmsBloco)
    const ipiBloco = blocoTag(imposto, 'IPI')
    const ipiValor = parseNumeroXml(tag(ipiBloco, 'vIPI'))

    const nItem = nItemAttr || String(linhas.length + 1)
    const itemPad = nItem.padStart(3, '0')

    linhas.push({
      chave: chave || '',
      numero,
      serie,
      modelo,
      emissao,
      natureza,
      emitenteDoc,
      emitenteNome,
      emitenteUf,
      destDoc,
      destNome,
      destUf,
      item: itemPad,
      codigoBarras: codigoBarrasDoProd(prod),
      descricao: tag(prod, 'xProd'),
      ncm: tag(prod, 'NCM'),
      cfop: tag(prod, 'CFOP'),
      qtd: parseNumeroXml(tag(prod, 'qCom')),
      vUnit: parseNumeroXml(tag(prod, 'vUnCom')),
      vProd: parseNumeroXml(tag(prod, 'vProd')),
      vFrete: parseNumeroXml(tag(prod, 'vFrete')),
      vSeg: parseNumeroXml(tag(prod, 'vSeg')),
      vDesc: parseNumeroXml(tag(prod, 'vDesc')),
      icmsCst: icms.cst,
      icmsVBc: icms.vBc,
      icmsAliq: icms.pIcms,
      icmsValor: icms.vIcms,
      ipiValor,
    })
  }

  return { linhas, cabecalho }
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

  const moneyCols = new Set([19, 20, 21, 22, 23, 25, 27, 28])
  const qtyCols = new Set([18, 26])

  for (const l of linhas) {
    const row = ws.addRow([
      l.chave,
      l.numero,
      l.serie,
      l.modelo,
      l.emissao,
      l.natureza,
      l.emitenteDoc,
      l.emitenteNome,
      l.emitenteUf,
      l.destDoc,
      l.destNome,
      l.destUf,
      l.item,
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
      l.icmsCst,
      l.icmsVBc,
      l.icmsAliq,
      l.icmsValor,
      l.ipiValor,
    ])
    for (let c = 1; c <= 28; c++) {
      if (moneyCols.has(c)) {
        row.getCell(c).numFmt = '#,##0.00'
      } else if (qtyCols.has(c)) {
        row.getCell(c).numFmt = '#,##0.00'
      } else {
        row.getCell(c).numFmt = '@'
      }
    }
  }

  ws.columns = [
    { width: 48 },
    { width: 12 },
    { width: 8 },
    { width: 8 },
    { width: 20 },
    { width: 40 },
    { width: 20 },
    { width: 36 },
    { width: 10 },
    { width: 20 },
    { width: 36 },
    { width: 10 },
    { width: 8 },
    { width: 16 },
    { width: 48 },
    { width: 12 },
    { width: 8 },
    { width: 10 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 10 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
  ]

  if (linhas.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: 28 },
    }
  }

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
}

export async function gerarRelatorioNotasNaPasta(pastaRaiz: string): Promise<{
  ok: boolean
  arquivo?: string
  caminhoCompleto?: string
  notas?: number
  itens?: number
  falhas?: number
  xMotivo?: string
}> {
  try {
    if (!pastaRaiz) throw new Error('Pasta de destino não informada.')
    if (!fs.existsSync(pastaRaiz)) throw new Error('Pasta de destino não encontrada.')

    const { caminhos } = listarXmlsRecursivo(pastaRaiz)
    const todasLinhas: RelatorioNotasLinha[] = []
    let cabecalho: RelatorioNotasCabecalho | undefined
    const chaves = new Set<string>()
    let falhas = 0

    for (const full of caminhos) {
      const nome = path.basename(full)
      if (/_resNFe\.xml$/i.test(nome) || /_evento/i.test(nome)) continue

      let conteudo = ''
      try {
        conteudo = fs.readFileSync(full, 'utf-8')
      } catch {
        falhas++
        continue
      }

      if (!xmlElegivelRelatorioNotas(conteudo)) continue

      const { linhas, cabecalho: cab } = extrairLinhasRelatorioNotas(conteudo)
      if (linhas.length === 0) {
        falhas++
        continue
      }
      if (!cabecalho && cab) cabecalho = cab
      if (linhas[0]?.chave) chaves.add(linhas[0].chave)
      todasLinhas.push(...linhas)
    }

    if (todasLinhas.length === 0) {
      return {
        ok: false,
        notas: 0,
        itens: 0,
        falhas,
        xMotivo: 'Nenhum XML de NF-e/NFC-e com itens encontrado na pasta.',
      }
    }

    const buffer = await gerarRelatorioNotasXlsxBuffer(todasLinhas)
    const arquivo = montarNomeArquivoRelatorioNotas(cabecalho)
    const caminhoCompleto = path.join(pastaRaiz, arquivo)
    fs.writeFileSync(caminhoCompleto, buffer)

    return {
      ok: true,
      arquivo,
      caminhoCompleto,
      notas: chaves.size,
      itens: todasLinhas.length,
      falhas,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, xMotivo: msg }
  }
}
