/**
 * Parser leve de EFD ICMS/IPI (SPED Fiscal, pipe-delimited).
 * Layout: registros 0000, 0150, 0200, C100, C170, C190.
 * Encoding: latin1 / windows-1252 (BOM UTF-8 também aceito).
 */

const UF_IBGE: Record<string, string> = {
  '11': 'RO',
  '12': 'AC',
  '13': 'AM',
  '14': 'RR',
  '15': 'PA',
  '16': 'AP',
  '17': 'TO',
  '21': 'MA',
  '22': 'PI',
  '23': 'CE',
  '24': 'RN',
  '25': 'PB',
  '26': 'PE',
  '27': 'AL',
  '28': 'SE',
  '29': 'BA',
  '31': 'MG',
  '32': 'ES',
  '33': 'RJ',
  '35': 'SP',
  '41': 'PR',
  '42': 'SC',
  '43': 'RS',
  '50': 'MS',
  '51': 'MT',
  '52': 'GO',
  '53': 'DF',
}

/** Situação do documento C100: 02/03 = cancelado. */
export const COD_SIT_CANCELADO = new Set(['02', '03'])

/** Denegado / inutilizado — não entram no comparativo nem no Relatório Notas. */
export const COD_SIT_SEM_DOCUMENTO = new Set(['04', '05'])

export interface EfdRegistro0000 {
  codVer: string
  dtIni: string
  dtFin: string
  nome: string
  cnpj: string
  cpf: string
  uf: string
  ie: string
}

export interface EfdParticipante {
  codPart: string
  nome: string
  cnpj: string
  cpf: string
  ie: string
  uf: string
}

export interface EfdItemCadastro {
  codItem: string
  descricao: string
  codigoBarras: string
  ncm: string
}

export interface EfdC170 {
  numItem: string
  codItem: string
  descrCompl: string
  qtd: string
  unid: string
  vlItem: string
  vlDesc: string
  cstIcms: string
  cfop: string
  vlBcIcms: string
  aliqIcms: string
  vlIcms: string
  cstIpi: string
  vlIpi: string
  cstPis: string
  vlBcPis: string
  aliqPis: string
  vlPis: string
  cstCofins: string
  vlBcCofins: string
  aliqCofins: string
  vlCofins: string
}

export interface EfdC190 {
  cstIcms: string
  cfop: string
  aliqIcms: string
  vlOpr: string
  vlBcIcms: string
  vlIcms: string
  vlIpi: string
}

export interface EfdC100 {
  indOper: string
  indEmit: string
  codPart: string
  codMod: string
  codSit: string
  ser: string
  numDoc: string
  chvNfe: string
  dtDoc: string
  vlDoc: string
  vlDesc: string
  vlMerc: string
  vlFrt: string
  vlSeg: string
  vlOutDa: string
  vlBcIcms: string
  vlIcms: string
  vlIpi: string
  vlPis: string
  vlCofins: string
  itens: EfdC170[]
  analiticos: EfdC190[]
}

export interface EfdParsed {
  abertura: EfdRegistro0000
  participantes: Map<string, EfdParticipante>
  itens: Map<string, EfdItemCadastro>
  documentos: EfdC100[]
}

function camposDaLinha(line: string): string[] {
  let s = line.replace(/\r$/, '')
  if (!s) return []
  if (s.endsWith('|')) s = s.slice(0, -1)
  if (s.startsWith('|')) s = s.slice(1)
  return s.split('|')
}

function c(cols: string[], i: number): string {
  return (cols[i] ?? '').trim()
}

export function ufDeCodMun(codMun: string): string {
  const d = codMun.replace(/\D/g, '')
  if (d.length < 2) return ''
  return UF_IBGE[d.slice(0, 2)] ?? ''
}

export function padCodSit(raw: string): string {
  const d = raw.replace(/\D/g, '')
  if (!d) return raw.trim()
  return d.padStart(2, '0').slice(-2)
}

export function efdDocCancelado(codSit: string): boolean {
  return COD_SIT_CANCELADO.has(padCodSit(codSit))
}

export function efdDocSemDocumento(codSit: string): boolean {
  return COD_SIT_SEM_DOCUMENTO.has(padCodSit(codSit))
}

/** ddmmaaaa → dd/MM/yyyy 00:00:00 (mesmo formato do relatório XML). */
export function formatarDataEfd(dt: string, hora = '00:00:00'): string {
  const d = dt.replace(/\D/g, '')
  if (d.length === 8) {
    return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4, 8)} ${hora}`
  }
  return dt.trim()
}

export function formatarDataEfdCurta(dt: string): string {
  const d = dt.replace(/\D/g, '')
  if (d.length === 8) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4, 8)}`
  return dt.trim()
}

/**
 * Lê bytes do SPED: BOM UTF-8 → utf8; senão latin1 (cobre windows-1252 para ç/ã/é).
 */
export function decodificarTextoEfd(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString('utf8')
  }
  return buf.toString('latin1')
}

const NOVO_DOCUMENTO = /^(C100|C300|C350|C400|C405|C490|C500|C600|C700|C800|C850|C860|C990|E001|D001|H001)$/

function parse0000(cols: string[]): EfdRegistro0000 {
  return {
    codVer: c(cols, 1),
    dtIni: c(cols, 3),
    dtFin: c(cols, 4),
    nome: c(cols, 5),
    cnpj: c(cols, 6).replace(/\D/g, ''),
    cpf: c(cols, 7).replace(/\D/g, ''),
    uf: c(cols, 8).toUpperCase(),
    ie: c(cols, 9),
  }
}

function parse0150(cols: string[]): EfdParticipante {
  return {
    codPart: c(cols, 1),
    nome: c(cols, 2),
    cnpj: c(cols, 4).replace(/\D/g, ''),
    cpf: c(cols, 5).replace(/\D/g, ''),
    ie: c(cols, 6),
    uf: ufDeCodMun(c(cols, 7)),
  }
}

function parse0200(cols: string[]): EfdItemCadastro {
  const barra = c(cols, 3)
  return {
    codItem: c(cols, 1),
    descricao: c(cols, 2),
    codigoBarras: !barra || barra.toUpperCase() === 'SEM GTIN' ? '' : barra,
    ncm: c(cols, 7),
  }
}

function parseC100(cols: string[]): EfdC100 {
  return {
    indOper: c(cols, 1),
    indEmit: c(cols, 2),
    codPart: c(cols, 3),
    codMod: c(cols, 4),
    codSit: padCodSit(c(cols, 5)),
    ser: c(cols, 6),
    numDoc: c(cols, 7),
    chvNfe: c(cols, 8).replace(/\D/g, ''),
    dtDoc: c(cols, 9),
    vlDoc: c(cols, 11),
    vlDesc: c(cols, 13),
    vlMerc: c(cols, 15),
    vlFrt: c(cols, 17),
    vlSeg: c(cols, 18),
    vlOutDa: c(cols, 19),
    vlBcIcms: c(cols, 20),
    vlIcms: c(cols, 21),
    vlIpi: c(cols, 24),
    vlPis: c(cols, 25),
    vlCofins: c(cols, 26),
    itens: [],
    analiticos: [],
  }
}

function parseC170(cols: string[]): EfdC170 {
  return {
    numItem: c(cols, 1),
    codItem: c(cols, 2),
    descrCompl: c(cols, 3),
    qtd: c(cols, 4),
    unid: c(cols, 5),
    vlItem: c(cols, 6),
    vlDesc: c(cols, 7),
    cstIcms: c(cols, 9),
    cfop: c(cols, 10),
    vlBcIcms: c(cols, 12),
    aliqIcms: c(cols, 13),
    vlIcms: c(cols, 14),
    cstIpi: c(cols, 19),
    vlIpi: c(cols, 23),
    cstPis: c(cols, 24),
    vlBcPis: c(cols, 25),
    aliqPis: c(cols, 26),
    vlPis: c(cols, 28),
    cstCofins: c(cols, 29),
    vlBcCofins: c(cols, 30),
    aliqCofins: c(cols, 31),
    vlCofins: c(cols, 33),
  }
}

function parseC190(cols: string[]): EfdC190 {
  return {
    cstIcms: c(cols, 1),
    cfop: c(cols, 2),
    aliqIcms: c(cols, 3),
    vlOpr: c(cols, 4),
    vlBcIcms: c(cols, 5),
    vlIcms: c(cols, 6),
    vlIpi: c(cols, 10),
  }
}

export function parseEfdTexto(texto: string): EfdParsed {
  const lines = texto.split(/\n/)
  let abertura: EfdRegistro0000 | undefined
  const participantes = new Map<string, EfdParticipante>()
  const itens = new Map<string, EfdItemCadastro>()
  const documentos: EfdC100[] = []
  let atual: EfdC100 | null = null

  for (const line of lines) {
    const cols = camposDaLinha(line)
    if (cols.length === 0) continue
    const reg = cols[0]
    if (!reg) continue

    if (reg === '0000') {
      abertura = parse0000(cols)
      continue
    }
    if (reg === '0150') {
      const p = parse0150(cols)
      if (p.codPart) participantes.set(p.codPart, p)
      continue
    }
    if (reg === '0200') {
      const it = parse0200(cols)
      if (it.codItem) itens.set(it.codItem, it)
      continue
    }
    if (reg === 'C100') {
      atual = parseC100(cols)
      documentos.push(atual)
      continue
    }
    if (NOVO_DOCUMENTO.test(reg)) {
      atual = null
      continue
    }
    if (!atual) continue
    if (reg === 'C170') {
      atual.itens.push(parseC170(cols))
      continue
    }
    if (reg === 'C190') {
      atual.analiticos.push(parseC190(cols))
    }
  }

  if (!abertura) {
    throw new Error('Arquivo não parece EFD ICMS/IPI: registro 0000 ausente.')
  }

  return { abertura, participantes, itens, documentos }
}

export interface EfdResumo {
  nome: string
  cnpj: string
  uf: string
  dtIni: string
  dtFin: string
  documentos: number
  aprovados: number
  cancelados: number
  itensC170: number
  analiticosC190: number
}

export function resumirEfd(parsed: EfdParsed): EfdResumo {
  let aprovados = 0
  let cancelados = 0
  let itensC170 = 0
  let analiticosC190 = 0
  for (const d of parsed.documentos) {
    if (efdDocCancelado(d.codSit)) cancelados++
    else if (!efdDocSemDocumento(d.codSit)) aprovados++
    itensC170 += d.itens.length
    analiticosC190 += d.analiticos.length
  }
  return {
    nome: parsed.abertura.nome,
    cnpj: parsed.abertura.cnpj,
    uf: parsed.abertura.uf,
    dtIni: formatarDataEfdCurta(parsed.abertura.dtIni),
    dtFin: formatarDataEfdCurta(parsed.abertura.dtFin),
    documentos: parsed.documentos.length,
    aprovados,
    cancelados,
    itensC170,
    analiticosC190,
  }
}
