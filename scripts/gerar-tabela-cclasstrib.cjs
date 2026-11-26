/**
 * Gera electron/ibs-cbs-tabela.gerada.ts a partir de electron/ibs-cbs-dados/cclasstrib.csv.
 *
 * Fonte: dados abertos da Calculadora RTC (ReceitaFederal/calculadora-rtc-regime-regular),
 * base Flyway V0073 / IT 2025.002 v.1.71. Atualize o CSV e rode:
 *   node scripts/gerar-tabela-cclasstrib.cjs
 */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const CSV = path.join(ROOT, 'electron', 'ibs-cbs-dados', 'cclasstrib.csv')
const OUT = path.join(ROOT, 'electron', 'ibs-cbs-tabela.gerada.ts')

function tipoDe(raw) {
  const t = String(raw || '')
    .trim()
    .toLowerCase()
  if (t.startsWith('sem')) return 'sem'
  if (t.startsWith('fixa')) return 'fixa'
  if (t.startsWith('uniforme')) return 'uniforme'
  return 'padrao'
}

function num(raw) {
  const n = Number(String(raw || '0').replace(',', '.').trim())
  return Number.isFinite(n) ? n : 0
}

function tokensDocs(docs) {
  return String(docs || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

function parseLinha(line) {
  return line.split(';').map((c) => c.trim())
}

const raw = fs.readFileSync(CSV, 'utf-8').replace(/^\uFEFF/, '')
const linhas = raw.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('Fonte:') && !l.startsWith('"Fonte:'))
const header = parseLinha(linhas[0])
const idx = (nome) => header.findIndex((h) => h.toLowerCase() === nome.toLowerCase())

const iCst = idx('CST')
const iCod = idx('cClassTrib')
const iNome = idx('Descrição do cClassTrib')
const iTipo = idx('Tipo de alíquota')
const iRedCbs = idx('Redução CBS (%)')
const iRedUf = idx('Redução IBS UF (%)')
const iRedMun = idx('Redução IBS Mun (%)')
const iDocs = idx('Documentos fiscais')

if ([iCst, iCod, iNome, iTipo, iRedCbs, iRedUf, iRedMun, iDocs].some((i) => i < 0)) {
  throw new Error('CSV sem colunas esperadas: ' + header.join(' | '))
}

const rows = []
for (const line of linhas.slice(1)) {
  const c = parseLinha(line)
  const codigo = c[iCod]
  if (!/^\d{6}$/.test(codigo)) continue
  const docs = tokensDocs(c[iDocs] || '')
  rows.push({
    cst: c[iCst],
    codigo,
    nome: (c[iNome] || '').replace(/\s+/g, ' ').trim(),
    tipo: tipoDe(c[iTipo]),
    pRedCbs: num(c[iRedCbs]),
    pRedIbsUf: num(c[iRedUf]),
    pRedIbsMun: num(c[iRedMun]),
    nfe: docs.includes('nf-e'),
    nfce: docs.includes('nfc-e'),
  })
}

rows.sort((a, b) => a.codigo.localeCompare(b.codigo))

const corpo = rows
  .map((r) => {
    const nome = JSON.stringify(r.nome)
    return `  { cst: '${r.cst}', codigo: '${r.codigo}', nome: ${nome}, tipo: '${r.tipo}', pRedCbs: ${r.pRedCbs}, pRedIbsUf: ${r.pRedIbsUf}, pRedIbsMun: ${r.pRedIbsMun}, nfe: ${r.nfe}, nfce: ${r.nfce} },`
  })
  .join('\n')

const ts = `/**
 * Tabela compacta cClassTrib / CST IBS-CBS.
 * Gerada por scripts/gerar-tabela-cclasstrib.cjs a partir de electron/ibs-cbs-dados/cclasstrib.csv.
 * Não editar à mão — atualize o CSV (Calculadora RTC / IT 2025.002) e rode o script.
 */
export type TipoAliquotaRfb = 'padrao' | 'sem' | 'fixa' | 'uniforme'

export interface ClassTribRfb {
  cst: string
  codigo: string
  nome: string
  tipo: TipoAliquotaRfb
  pRedCbs: number
  pRedIbsUf: number
  pRedIbsMun: number
  nfe: boolean
  nfce: boolean
}

export const CLASS_TRIB_RFB: readonly ClassTribRfb[] = [
${corpo}
]
`

fs.writeFileSync(OUT, ts, 'utf-8')
console.log(`Gerado ${path.relative(ROOT, OUT)} com ${rows.length} códigos.`)
