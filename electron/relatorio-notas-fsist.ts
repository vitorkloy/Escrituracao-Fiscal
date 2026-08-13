import fs from 'fs'
import path from 'path'
import ExcelJS from 'exceljs'
import { XMLParser } from 'fast-xml-parser'

/** Uma linha do relatório Notas — 1 item por linha (layout FSist 61 colunas). */
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
}

export interface RelatorioNotasCabecalho {
  nome?: string
  cnpj?: string
}

export interface RelatorioNotasArquivoIgnorado {
  relativo: string
  motivo: string
}

export interface RelatorioNotasScanResult {
  caminhos: string[]
  relativos: string[]
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
] as const

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
  // CNPJ/CPF/chaves com zero à esquerda não podem virar number
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (name) => name === 'det',
})

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

function texto(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return String(v).trim()
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('#text' in o) return texto(o['#text'])
  }
  return ''
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

function strCampo(obj: unknown, ...keys: string[]): string {
  if (obj == null || typeof obj !== 'object') return ''
  const o = obj as Record<string, unknown>
  for (const k of keys) {
    if (k in o) {
      const s = texto(o[k])
      if (s) return s
    }
  }
  return ''
}

/** Busca em profundidade o primeiro valor textual da chave. */
function encontrarTexto(data: unknown, chave: string, maxDepth = 12): string {
  if (data == null || maxDepth < 0) return ''
  if (typeof data !== 'object') return ''
  if (Array.isArray(data)) {
    for (const el of data) {
      const r = encontrarTexto(el, chave, maxDepth - 1)
      if (r) return r
    }
    return ''
  }
  const o = data as Record<string, unknown>
  if (chave in o) {
    const t = texto(o[chave])
    if (t) return t
  }
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith('@_')) continue
    const r = encontrarTexto(v, chave, maxDepth - 1)
    if (r) return r
  }
  return ''
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

/** Converte dhEmi ISO → dd/MM/yyyy HH:mm:ss */
export function formatarDhEmiRelatorio(dhEmi: string): string {
  const m = dhEmi.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/)
  if (!m) {
    // dEmi antigo YYYY-MM-DD
    const d = dhEmi.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (d) return `${d[3]}/${d[2]}/${d[1]} 00:00:00`
    return dhEmi
  }
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

function extrairDocPessoaObj(bloco: unknown): string {
  const cnpj = strCampo(bloco, 'CNPJ')
  if (cnpj) return formatarDoc(cnpj)
  const cpf = strCampo(bloco, 'CPF')
  if (cpf) return formatarDoc(cpf)
  return ''
}

function codigoBarrasDoProd(prod: unknown): string {
  const cean = strCampo(prod, 'cEAN')
  if (cean && cean.toUpperCase() !== 'SEM GTIN') return cean
  const trib = strCampo(prod, 'cEANTrib')
  if (trib && trib.toUpperCase() !== 'SEM GTIN') return trib
  return 'SEM GTIN'
}

/** Primeiro grupo filho de ICMS / PIS / COFINS (ex.: ICMS00, PISAliq). */
function primeiroGrupoImposto(bloco: unknown): unknown {
  if (bloco == null || typeof bloco !== 'object' || Array.isArray(bloco)) return bloco
  const o = bloco as Record<string, unknown>
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith('@_')) continue
    if (v != null && typeof v === 'object') return v
  }
  return bloco
}

function extrairIcms(imposto: unknown): {
  cst: string
  vBc: number | null
  pIcms: number | null
  vIcms: number | null
  pRedBc: number | null
  pRedBcSt: number | null
  pRedBcEfet: number | null
} {
  const icms = (imposto as Record<string, unknown> | undefined)?.ICMS ?? imposto
  const g = primeiroGrupoImposto(icms)
  return {
    cst: strCampo(g, 'CST', 'CSOSN') || encontrarTexto(icms, 'CST') || encontrarTexto(icms, 'CSOSN'),
    vBc: numCampo(g, 'vBC') ?? parseNumeroXml(encontrarTexto(icms, 'vBC')),
    pIcms: numCampo(g, 'pICMS') ?? parseNumeroXml(encontrarTexto(icms, 'pICMS')),
    vIcms: numCampo(g, 'vICMS') ?? parseNumeroXml(encontrarTexto(icms, 'vICMS')),
    pRedBc: numCampo(g, 'pRedBC') ?? parseNumeroXml(encontrarTexto(icms, 'pRedBC')),
    pRedBcSt: numCampo(g, 'pRedBCST') ?? parseNumeroXml(encontrarTexto(icms, 'pRedBCST')),
    pRedBcEfet: numCampo(g, 'pRedBCEfet') ?? parseNumeroXml(encontrarTexto(icms, 'pRedBCEfet')),
  }
}

function extrairPisCofins(
  imposto: unknown,
  raiz: 'PIS' | 'COFINS'
): { cst: string; vBc: number | null; aliq: number | null; valor: number | null } {
  const bloco = (imposto as Record<string, unknown> | undefined)?.[raiz]
  const g = primeiroGrupoImposto(bloco)
  return {
    cst: strCampo(g, 'CST') || encontrarTexto(bloco, 'CST'),
    vBc: numCampo(g, 'vBC') ?? parseNumeroXml(encontrarTexto(bloco, 'vBC')),
    aliq: numCampo(g, 'pPIS', 'pCOFINS') ?? parseNumeroXml(encontrarTexto(bloco, raiz === 'PIS' ? 'pPIS' : 'pCOFINS')),
    valor: numCampo(g, 'vPIS', 'vCOFINS') ?? parseNumeroXml(encontrarTexto(bloco, raiz === 'PIS' ? 'vPIS' : 'vCOFINS')),
  }
}

function extrairIpiValor(imposto: unknown): number | null {
  const ipi = (imposto as Record<string, unknown> | undefined)?.IPI
  return numCampo(primeiroGrupoImposto(ipi), 'vIPI') ?? parseNumeroXml(encontrarTexto(ipi, 'vIPI'))
}

/** IBS/CBS (reforma) — tenta vários layouts comuns no XML. */
function extrairIbsCbs(imposto: unknown): {
  cst: string
  classTrib: string
  vBc: number | null
  aliqUf: number | null
  pctRedUf: number | null
  aliqEfetUf: number | null
  valorUf: number | null
  aliqMun: number | null
  pctRedMun: number | null
  aliqEfetMun: number | null
  valorMun: number | null
  valorTotal: number | null
  cbsAliq: number | null
  cbsPctRed: number | null
  cbsAliqEfet: number | null
  cbsValor: number | null
} {
  const o = (imposto ?? {}) as Record<string, unknown>
  const raiz =
    o.IBSCBS ??
    o.IBSCBSTot ??
    o.gIBSCBS ??
    o.IS ??
    o.impostoDevol ??
    null

  const gIBS = (() => {
    if (!raiz || typeof raiz !== 'object') return raiz
    const r = raiz as Record<string, unknown>
    return r.gIBSCBS ?? r.gIBS ?? r.IBS ?? raiz
  })()

  const gUF = (() => {
    if (!gIBS || typeof gIBS !== 'object') return null
    const r = gIBS as Record<string, unknown>
    return r.gIBSUF ?? r.gUF ?? r.IBSUF ?? null
  })()

  const gMun = (() => {
    if (!gIBS || typeof gIBS !== 'object') return null
    const r = gIBS as Record<string, unknown>
    return r.gIBSMun ?? r.gMun ?? r.IBSMun ?? null
  })()

  const gCBS = (() => {
    if (!raiz || typeof raiz !== 'object') return null
    const r = raiz as Record<string, unknown>
    return r.gCBS ?? r.CBS ?? null
  })()

  return {
    cst: strCampo(raiz, 'CST') || strCampo(gIBS, 'CST') || encontrarTexto(raiz, 'CST'),
    classTrib:
      strCampo(raiz, 'cClassTrib', 'cClassTribReg') ||
      strCampo(gIBS, 'cClassTrib') ||
      encontrarTexto(raiz, 'cClassTrib'),
    vBc:
      numCampo(raiz, 'vBC', 'vBCIBSCBS') ??
      numCampo(gIBS, 'vBC') ??
      parseNumeroXml(encontrarTexto(raiz, 'vBC')),
    aliqUf: numCampo(gUF, 'pIBSUF', 'pIBS') ?? parseNumeroXml(encontrarTexto(gUF, 'pIBSUF')),
    pctRedUf: numCampo(gUF, 'pRedAliq', 'pReducaoAliq') ?? parseNumeroXml(encontrarTexto(gUF, 'pRedAliq')),
    aliqEfetUf: numCampo(gUF, 'pAliqEfet') ?? parseNumeroXml(encontrarTexto(gUF, 'pAliqEfet')),
    valorUf: numCampo(gUF, 'vIBSUF', 'vIBS') ?? parseNumeroXml(encontrarTexto(gUF, 'vIBSUF')),
    aliqMun: numCampo(gMun, 'pIBSMun', 'pIBS') ?? parseNumeroXml(encontrarTexto(gMun, 'pIBSMun')),
    pctRedMun: numCampo(gMun, 'pRedAliq', 'pReducaoAliq') ?? parseNumeroXml(encontrarTexto(gMun, 'pRedAliq')),
    aliqEfetMun: numCampo(gMun, 'pAliqEfet') ?? parseNumeroXml(encontrarTexto(gMun, 'pAliqEfet')),
    valorMun: numCampo(gMun, 'vIBSMun', 'vIBS') ?? parseNumeroXml(encontrarTexto(gMun, 'vIBSMun')),
    valorTotal:
      numCampo(gIBS, 'vIBS', 'vIBSCBS') ??
      numCampo(raiz, 'vIBS') ??
      parseNumeroXml(encontrarTexto(raiz, 'vIBS')),
    cbsAliq: numCampo(gCBS, 'pCBS', 'pAliq') ?? parseNumeroXml(encontrarTexto(gCBS, 'pCBS')),
    cbsPctRed: numCampo(gCBS, 'pRedAliq') ?? parseNumeroXml(encontrarTexto(gCBS, 'pRedAliq')),
    cbsAliqEfet: numCampo(gCBS, 'pAliqEfet') ?? parseNumeroXml(encontrarTexto(gCBS, 'pAliqEfet')),
    cbsValor: numCampo(gCBS, 'vCBS') ?? parseNumeroXml(encontrarTexto(gCBS, 'vCBS')),
  }
}

/**
 * Conta tags `<det nItem="...">` de produto (ignora detEvento / detPag).
 */
export function contarDetItensNoXml(xmlStr: string): number {
  const re = /<(?:[\w.-]+:)?det\b(?![A-Za-z0-9_])[^>]*\bnItem\s*=/gi
  return (xmlStr.match(re) ?? []).length
}

export function xmlElegivelRelatorioNotas(conteudo: string): boolean {
  if (!/<(?:[\w.-]+:)?infNFe\b/i.test(conteudo)) return false
  return contarDetItensNoXml(conteudo) > 0 || /<(?:[\w.-]+:)?det\b[^>]*\bnItem\s*=/i.test(conteudo)
}

function ehArquivoEventoPorNome(nome: string): boolean {
  return /_evento/i.test(nome) || /procEvento/i.test(nome)
}

function ehArquivoResumoPorNome(nome: string): boolean {
  return /_resNFe\.xml$/i.test(nome) || /^resNFe/i.test(nome)
}

function prioridadeArquivo(nome: string, qtdItens: number): number {
  // Preferir procNFe / nfeProc completos; desempate por quantidade de itens
  let p = qtdItens * 10
  if (/_procNFe\.xml$/i.test(nome) || /nfeProc/i.test(nome)) p += 1000
  if (ehArquivoResumoPorNome(nome)) p -= 500
  return p
}

/** Localiza infNFe no objeto parseado (nfeProc / NFe / raiz). */
function localizarInfNFe(parsed: unknown): Record<string, unknown> | null {
  if (parsed == null || typeof parsed !== 'object') return null
  const root = parsed as Record<string, unknown>

  const tryInf = (obj: unknown): Record<string, unknown> | null => {
    if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return null
    const o = obj as Record<string, unknown>
    if (o.infNFe && typeof o.infNFe === 'object' && !Array.isArray(o.infNFe)) {
      return o.infNFe as Record<string, unknown>
    }
    return null
  }

  const nfeProc = root.nfeProc
  if (nfeProc && typeof nfeProc === 'object') {
    const np = nfeProc as Record<string, unknown>
    const viaNfe = tryInf(np.NFe)
    if (viaNfe) return viaNfe
    const direto = tryInf(np)
    if (direto) return direto
  }

  const viaNfe = tryInf(root.NFe)
  if (viaNfe) return viaNfe
  const diretoRoot = tryInf(root)
  if (diretoRoot) return diretoRoot

  const stack: unknown[] = [root]
  let guard = 0
  while (stack.length && guard++ < 200) {
    const cur = stack.pop()
    if (cur == null || typeof cur !== 'object') continue
    if (Array.isArray(cur)) {
      stack.push(...cur)
      continue
    }
    const hit = tryInf(cur)
    if (hit) return hit
    for (const [k, v] of Object.entries(cur as Record<string, unknown>)) {
      if (k.startsWith('@_')) continue
      if (v && typeof v === 'object') stack.push(v)
    }
  }
  return null
}

function chaveDeInfNFe(inf: Record<string, unknown>, xmlFallback: string): string {
  const id = texto(inf['@_Id']) || texto((inf as { Id?: unknown }).Id)
  const m = id.match(/NFe(\d{44})/i)
  if (m) return m[1]
  const fromXml = xmlFallback.match(/<(?:[\w.-]+:)?infNFe\b[^>]*\bId\s*=\s*["']NFe(\d{44})["']/i)?.[1]
  if (fromXml) return fromXml
  return encontrarTexto(inf, 'chNFe') || xmlFallback.match(/<chNFe>(\d{44})<\/chNFe>/i)?.[1] || ''
}

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
  const paired = caminhos.map((c, i) => ({ c, r: relativos[i] }))
  paired.sort((a, b) => a.r.localeCompare(b.r, 'pt-BR'))
  return {
    caminhos: paired.map((p) => p.c),
    relativos: paired.map((p) => p.r),
  }
}

export function listarXmlsElegiveisNotas(pastaRaiz: string): {
  totalXml: number
  elegiveis: string[]
  totalElegiveis: number
  ignorados: RelatorioNotasArquivoIgnorado[]
} {
  const { caminhos, relativos } = listarXmlsRecursivo(pastaRaiz)
  const elegiveis: string[] = []
  const ignorados: RelatorioNotasArquivoIgnorado[] = []

  for (let i = 0; i < caminhos.length; i++) {
    const nome = path.basename(caminhos[i])
    const rel = relativos[i]
    if (ehArquivoEventoPorNome(nome)) {
      ignorados.push({ relativo: rel, motivo: 'arquivo de evento (sem itens de produto)' })
      continue
    }
    let conteudo = ''
    try {
      conteudo = fs.readFileSync(caminhos[i], 'utf-8')
    } catch {
      ignorados.push({ relativo: rel, motivo: 'falha ao ler arquivo' })
      continue
    }
    if (ehArquivoResumoPorNome(nome) && !xmlElegivelRelatorioNotas(conteudo)) {
      ignorados.push({ relativo: rel, motivo: 'resumo resNFe sem itens <det>' })
      continue
    }
    if (xmlElegivelRelatorioNotas(conteudo)) {
      elegiveis.push(rel)
    } else if (!ehArquivoResumoPorNome(nome)) {
      ignorados.push({ relativo: rel, motivo: 'XML sem infNFe+itens (det)' })
    }
  }

  return {
    totalXml: caminhos.length,
    elegiveis,
    totalElegiveis: elegiveis.length,
    ignorados,
  }
}

export function extrairLinhasRelatorioNotas(xmlStr: string): {
  linhas: RelatorioNotasLinha[]
  cabecalho?: RelatorioNotasCabecalho
  detsEsperados: number
} {
  const detsEsperados = contarDetItensNoXml(xmlStr)
  if (!xmlElegivelRelatorioNotas(xmlStr)) {
    return { linhas: [], detsEsperados }
  }

  let parsed: unknown
  try {
    parsed = xmlParser.parse(xmlStr)
  } catch {
    return { linhas: [], detsEsperados }
  }

  const inf = localizarInfNFe(parsed)
  if (!inf) return { linhas: [], detsEsperados }

  const ide = (inf.ide ?? {}) as Record<string, unknown>
  const emit = inf.emit
  const dest = inf.dest
  const transp = (inf.transp ?? {}) as Record<string, unknown>
  const transporta = transp.transporta ?? asArray(transp.vol)[0]

  const chave = chaveDeInfNFe(inf, xmlStr)
  const numero = strCampo(ide, 'nNF')
  const serie = strCampo(ide, 'serie')
  const modelo = strCampo(ide, 'mod')
  const emissao = formatarDhEmiRelatorio(strCampo(ide, 'dhEmi') || strCampo(ide, 'dEmi'))
  const indPres = strCampo(ide, 'indPres')
  const tpNFDebito = strCampo(ide, 'tpNFDebito')
  const tpNFCredito = strCampo(ide, 'tpNFCredito')
  const finNFe = strCampo(ide, 'finNFe')

  const emitenteDoc = extrairDocPessoaObj(emit)
  const emitenteNome = strCampo(emit, 'xNome')
  const emitenteUf = strCampo((emit as Record<string, unknown> | undefined)?.enderEmit, 'UF')

  const destDoc = extrairDocPessoaObj(dest)
  const destNome = strCampo(dest, 'xNome')
  const destUf = strCampo((dest as Record<string, unknown> | undefined)?.enderDest, 'UF')

  const transportadorDoc = extrairDocPessoaObj(transporta)
  const transportadorNome = strCampo(transporta, 'xNome')

  const cabecalho: RelatorioNotasCabecalho | undefined =
    destDoc || destNome
      ? { nome: destNome || undefined, cnpj: destDoc.replace(/\D/g, '') || undefined }
      : emitenteDoc || emitenteNome
        ? { nome: emitenteNome || undefined, cnpj: emitenteDoc.replace(/\D/g, '') || undefined }
        : undefined

  const dets = asArray(inf.det)
  const linhas: RelatorioNotasLinha[] = []

  for (let i = 0; i < dets.length; i++) {
    const det = dets[i] as Record<string, unknown>
    const prod = det.prod ?? {}
    const imposto = det.imposto ?? {}
    const nItem = texto(det['@_nItem']) || String(i + 1)
    const icms = extrairIcms(imposto)
    const pis = extrairPisCofins(imposto, 'PIS')
    const cofins = extrairPisCofins(imposto, 'COFINS')
    const ibs = extrairIbsCbs(imposto)

    linhas.push({
      chave,
      numero,
      serie,
      modelo,
      emissao,
      emitenteDoc,
      emitenteNome,
      emitenteUf,
      destDoc,
      destNome,
      destUf,
      transportadorDoc,
      transportadorNome,
      item: nItem.padStart(3, '0'),
      codigoProduto: strCampo(prod, 'cProd'),
      codigoBarras: codigoBarrasDoProd(prod),
      descricao: strCampo(prod, 'xProd'),
      ncm: strCampo(prod, 'NCM'),
      cfop: strCampo(prod, 'CFOP'),
      qtd: numCampo(prod, 'qCom'),
      vUnit: numCampo(prod, 'vUnCom'),
      vProd: numCampo(prod, 'vProd'),
      vFrete: numCampo(prod, 'vFrete'),
      vSeg: numCampo(prod, 'vSeg'),
      vDesc: numCampo(prod, 'vDesc'),
      icmsCst: icms.cst,
      icmsVBc: icms.vBc,
      icmsAliq: icms.pIcms,
      icmsValor: icms.vIcms,
      ipiValor: extrairIpiValor(imposto),
      pisCst: pis.cst,
      pisVBc: pis.vBc,
      pisAliq: pis.aliq,
      pisValor: pis.valor,
      cofinsCst: cofins.cst,
      cofinsVBc: cofins.vBc,
      cofinsAliq: cofins.aliq,
      cofinsValor: cofins.valor,
      ibsCbsCst: ibs.cst,
      ibsCbsClassTrib: ibs.classTrib,
      ibsCbsVBc: ibs.vBc,
      ibsAliqUf: ibs.aliqUf,
      ibsUfPctRed: ibs.pctRedUf,
      ibsUfAliqEfet: ibs.aliqEfetUf,
      ibsValorUf: ibs.valorUf,
      ibsAliqMun: ibs.aliqMun,
      ibsMunPctRed: ibs.pctRedMun,
      ibsMunAliqEfet: ibs.aliqEfetMun,
      ibsValorMun: ibs.valorMun,
      ibsValorTotal: ibs.valorTotal,
      cbsAliq: ibs.cbsAliq,
      cbsPctRed: ibs.cbsPctRed,
      cbsAliqEfet: ibs.cbsAliqEfet,
      cbsValor: ibs.cbsValor,
      indPres,
      pRedBc: icms.pRedBc,
      pRedBcSt: icms.pRedBcSt,
      pRedBcEfet: icms.pRedBcEfet,
      tpNFDebito,
      tpNFCredito,
      finNFe,
    })
  }

  return { linhas, cabecalho, detsEsperados }
}

function linhaParaArray(l: RelatorioNotasLinha): (string | number | null)[] {
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
  ]
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
    20, 21, 22, 23, 24, 25, 27, 28, 29, 30, 32, 33, 34, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48,
    49, 50, 51, 52, 53, 54, 56, 57, 58,
  ])

  for (const l of linhas) {
    const row = ws.addRow(linhaParaArray(l))
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

interface NotaAcumulada {
  linhas: RelatorioNotasLinha[]
  relativo: string
  prioridade: number
  cabecalho?: RelatorioNotasCabecalho
}

export async function gerarRelatorioNotasNaPasta(pastaRaiz: string): Promise<{
  ok: boolean
  arquivo?: string
  caminhoCompleto?: string
  diagnostico?: string
  notas?: number
  itens?: number
  falhas?: number
  ignorados?: RelatorioNotasArquivoIgnorado[]
  avisos?: string[]
  xMotivo?: string
}> {
  try {
    if (!pastaRaiz) throw new Error('Pasta de destino não informada.')
    if (!fs.existsSync(pastaRaiz)) throw new Error('Pasta de destino não encontrada.')

    const { caminhos, relativos } = listarXmlsRecursivo(pastaRaiz)
    const porChave = new Map<string, NotaAcumulada>()
    const ignorados: RelatorioNotasArquivoIgnorado[] = []
    const avisos: string[] = []
    let falhas = 0
    let cabecalho: RelatorioNotasCabecalho | undefined

    for (let i = 0; i < caminhos.length; i++) {
      const full = caminhos[i]
      const rel = relativos[i]
      const nome = path.basename(full)

      if (ehArquivoEventoPorNome(nome)) {
        ignorados.push({ relativo: rel, motivo: 'arquivo de evento' })
        continue
      }

      let conteudo = ''
      try {
        conteudo = fs.readFileSync(full, 'utf-8')
      } catch {
        falhas++
        ignorados.push({ relativo: rel, motivo: 'falha ao ler arquivo' })
        continue
      }

      if (!xmlElegivelRelatorioNotas(conteudo)) {
        if (ehArquivoResumoPorNome(nome)) {
          ignorados.push({
            relativo: rel,
            motivo: 'resumo resNFe sem itens — baixe/sincronize o procNFe completo',
          })
        } else {
          ignorados.push({ relativo: rel, motivo: 'sem infNFe + itens <det>' })
        }
        continue
      }

      const { linhas, cabecalho: cab, detsEsperados } = extrairLinhasRelatorioNotas(conteudo)
      if (linhas.length === 0) {
        falhas++
        ignorados.push({
          relativo: rel,
          motivo: `parse não extraiu itens (esperados≈${detsEsperados})`,
        })
        continue
      }

      if (detsEsperados > 0 && linhas.length < detsEsperados) {
        avisos.push(
          `${rel}: extraídos ${linhas.length} de ≈${detsEsperados} itens detectados no XML`
        )
      }

      const chave = linhas[0]?.chave || `sem-chave:${rel}`
      const prio = prioridadeArquivo(nome, linhas.length)
      const atual = porChave.get(chave)
      if (!atual || prio > atual.prioridade) {
        if (atual) {
          ignorados.push({
            relativo: atual.relativo,
            motivo: `substituído por versão mais completa (${rel}, ${linhas.length} itens)`,
          })
        }
        porChave.set(chave, { linhas, relativo: rel, prioridade: prio, cabecalho: cab })
      } else {
        ignorados.push({
          relativo: rel,
          motivo: `duplicata da chave ${chave} — mantido ${atual.relativo} (${atual.linhas.length} itens)`,
        })
      }

      if (!cabecalho && cab) cabecalho = cab
    }

    const todasLinhas: RelatorioNotasLinha[] = []
    for (const nota of porChave.values()) {
      if (!cabecalho && nota.cabecalho) cabecalho = nota.cabecalho
      todasLinhas.push(...nota.linhas)
    }

    // Ordenar por emissão + chave + item para estabilidade
    todasLinhas.sort((a, b) => {
      const e = a.emissao.localeCompare(b.emissao, 'pt-BR')
      if (e !== 0) return e
      const c = a.chave.localeCompare(b.chave)
      if (c !== 0) return c
      return a.item.localeCompare(b.item)
    })

    if (todasLinhas.length === 0) {
      return {
        ok: false,
        notas: 0,
        itens: 0,
        falhas,
        ignorados,
        avisos,
        xMotivo:
          'Nenhum XML de NF-e/NFC-e com itens encontrado. Verifique se existem arquivos procNFe (completos), não apenas resNFe.',
      }
    }

    const buffer = await gerarRelatorioNotasXlsxBuffer(todasLinhas)
    const arquivo = montarNomeArquivoRelatorioNotas(cabecalho)
    const caminhoCompleto = path.join(pastaRaiz, arquivo)
    fs.writeFileSync(caminhoCompleto, buffer)

    const diagNome = arquivo.replace(/\.xlsx$/i, '') + ' - diagnostico.txt'
    const diagPath = path.join(pastaRaiz, diagNome)
    const diagLines = [
      `Relatório Notas — diagnóstico`,
      `Gerado em: ${new Date().toISOString()}`,
      `Arquivo: ${arquivo}`,
      `Notas (chaves únicas): ${porChave.size}`,
      `Itens (linhas): ${todasLinhas.length}`,
      `Falhas de parse/leitura: ${falhas}`,
      `Arquivos ignorados/substituídos: ${ignorados.length}`,
      '',
      '--- Avisos ---',
      ...(avisos.length ? avisos : ['(nenhum)']),
      '',
      '--- Ignorados ---',
      ...ignorados.map((x) => `${x.relativo}\t${x.motivo}`),
      '',
      '--- Notas incluídas ---',
      ...[...porChave.entries()].map(
        ([ch, n]) => `${ch}\t${n.linhas.length} itens\t${n.relativo}`
      ),
    ]
    fs.writeFileSync(diagPath, diagLines.join('\n'), 'utf-8')

    return {
      ok: true,
      arquivo,
      caminhoCompleto,
      diagnostico: diagNome,
      notas: porChave.size,
      itens: todasLinhas.length,
      falhas,
      ignorados,
      avisos,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, xMotivo: msg }
  }
}
