/**
 * Testes do parser EFD ICMS/IPI e do relatório gerado a partir dele.
 * Rodam sobre o build do Electron (`dist-electron/`), gerado por `npm test`.
 * Fixture em tests/fixtures/efd/ é sintética (CNPJ fictício).
 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const dist = path.join(__dirname, '..', 'dist-electron')
const parser = require(path.join(dist, 'efd-icms-ipi-parser.js'))
const relatorioEfd = require(path.join(dist, 'relatorio-efd.js'))
const xlsxComum = require(path.join(dist, 'relatorio-xlsx.js'))

const FIXTURE = path.join(__dirname, 'fixtures', 'efd', 'efd-sintetico.txt')
const CNPJ = '11222333000181'
const CHAVE_NFE = '35240111222333000181550010000001231000012310'
const CHAVE_NFCE = '35240111222333000181650010000004561000004561'
const CHAVE_CANC = '35240111222333000181550010000001241000001241'

const efdComAcento = [
  '|0000|017|0|01012024|31012024|EMPRESA AÇÃO LTDA|11222333000181||SP|123456789111||3550308|||A|1|',
  '|0001|0|',
  '|C001|0|',
  '|C100|1|0||65|00|1|1|35240111222333000181650010000000011000000011|02012024|02012024|10,00|0|0,00|0,00|10,00|9|0,00|0,00|0,00|10,00|1,20|0,00|0,00|0,00|0,00|0,00|0,00|0,00|',
  '|C190|000|5102|12,00|10,00|10,00|1,20|0,00|0,00|0,00|0,00||',
  '|C990|3|',
  '|9999|6|',
].join('\n')

test('parser: lê 0000, 0150, 0200, C100, C170 e C190 da amostra', () => {
  const texto = fs.readFileSync(FIXTURE, 'utf-8')
  const parsed = parser.parseEfdTexto(texto)
  assert.equal(parsed.abertura.nome, 'EMPRESA ACAO LTDA')
  assert.equal(parsed.abertura.cnpj, CNPJ)
  assert.equal(parsed.abertura.uf, 'SP')
  assert.equal(parsed.abertura.dtIni, '01012024')
  assert.equal(parsed.documentos.length, 3)
  assert.equal(parsed.participantes.get('CLI01')?.nome, 'CLIENTE GAMA LTDA')
  assert.equal(parsed.participantes.get('CLI01')?.uf, 'RJ')
  assert.equal(parsed.itens.get('P1')?.ncm, '22021000')
  assert.equal(parsed.itens.get('P1')?.codigoBarras, '7891234567890')

  const nfe = parsed.documentos[0]
  assert.equal(nfe.codMod, '55')
  assert.equal(nfe.codSit, '00')
  assert.equal(nfe.chvNfe, CHAVE_NFE)
  assert.equal(nfe.itens.length, 1)
  assert.equal(nfe.itens[0].cfop, '5102')
  assert.equal(nfe.itens[0].vlItem, '100,00')
  assert.equal(nfe.itens[0].vlBcIcms, '100,00')
  assert.equal(nfe.itens[0].aliqIcms, '18,00')
  assert.equal(nfe.itens[0].vlIcms, '18,00')
  assert.equal(nfe.itens[0].vlBcIcmsSt, '10,00')
  assert.equal(nfe.itens[0].aliqSt, '18,00')
  assert.equal(nfe.itens[0].vlIcmsSt, '1,80')
  assert.equal(nfe.itens[0].vlBcPis, '100,00')
  assert.equal(nfe.itens[0].aliqPis, '1,65')
  assert.equal(nfe.itens[0].vlPis, '1,65')
  assert.equal(nfe.itens[0].vlBcCofins, '100,00')
  assert.equal(nfe.itens[0].aliqCofins, '7,60')
  assert.equal(nfe.itens[0].vlCofins, '7,60')
  assert.equal(nfe.analiticos.length, 1)

  const nfce = parsed.documentos[1]
  assert.equal(nfce.codMod, '65')
  assert.equal(nfce.itens.length, 0)
  assert.equal(nfce.analiticos.length, 1)
  assert.equal(nfce.chvNfe, CHAVE_NFCE)

  const canc = parsed.documentos[2]
  assert.equal(canc.codSit, '02')
  assert.equal(parser.efdDocCancelado(canc.codSit), true)
  assert.equal(canc.chvNfe, CHAVE_CANC)
})

test('parser: resumo conta aprovados, cancelados e itens', () => {
  const parsed = parser.parseEfdTexto(fs.readFileSync(FIXTURE, 'utf-8'))
  const r = parser.resumirEfd(parsed)
  assert.equal(r.documentos, 3)
  assert.equal(r.aprovados, 2)
  assert.equal(r.cancelados, 1)
  assert.equal(r.itensC170, 1)
  assert.equal(r.analiticosC190, 2)
  assert.equal(r.dtIni, '01/01/2024')
  assert.equal(r.dtFin, '31/01/2024')
})

test('parser: latin1/windows-1252 preserva cedilha e til', () => {
  const buf = Buffer.from(efdComAcento, 'latin1')
  const texto = parser.decodificarTextoEfd(buf)
  assert.equal(texto.includes('AÇÃO'), true)
  const parsed = parser.parseEfdTexto(texto)
  assert.equal(parsed.abertura.nome, 'EMPRESA AÇÃO LTDA')
})

test('parser: windows-1252 decodifica aspas curvas (bytes 0x93/0x94)', () => {
  const aspas = Buffer.from([0x93, 0x41, 0x94])
  const texto = parser.decodificarTextoEfd(aspas)
  assert.equal(texto, '\u201C' + 'A' + '\u201D')
})

test('parser: rejeita arquivo sem registro 0000', () => {
  assert.throws(() => parser.parseEfdTexto('|C100|1|0||55|00|1|1||01012024|01012024|1,00|'), /0000/)
})

test('parser: UF a partir do código IBGE do município', () => {
  assert.equal(parser.ufDeCodMun('3550308'), 'SP')
  assert.equal(parser.ufDeCodMun('3304557'), 'RJ')
  assert.equal(parser.ufDeCodMun(''), '')
})

test('relatório: C170 vira linha de item; C190 cobre NFC-e sem item; cancelado fica de fora', () => {
  const parsed = parser.parseEfdTexto(fs.readFileSync(FIXTURE, 'utf-8'))
  const linhas = relatorioEfd.mapearEfdParaLinhasNotas(parsed)
  assert.equal(linhas.length, 2)

  const nfe = linhas.find((l) => l.chave === CHAVE_NFE)
  assert.ok(nfe)
  assert.equal(nfe.modelo, '55')
  assert.equal(nfe.numero, '123')
  assert.equal(nfe.serie, '1')
  assert.equal(nfe.item, '001')
  assert.equal(nfe.codigoProduto, 'P1')
  assert.equal(nfe.descricao, 'PRODUTO UM')
  assert.equal(nfe.ncm, '22021000')
  assert.equal(nfe.cfop, '5102')
  assert.equal(nfe.qtd, 2)
  assert.equal(nfe.vProd, 100)
  assert.equal(nfe.vUnit, 50)
  assert.equal(nfe.icmsCst, '000')
  assert.equal(nfe.icmsVBc, 100)
  assert.equal(nfe.icmsAliq, 18)
  assert.equal(nfe.icmsValor, 18)
  assert.equal(nfe.icmsStVBc, 10)
  assert.equal(nfe.icmsStAliq, 18)
  assert.equal(nfe.icmsStValor, 1.8)
  assert.equal(nfe.pisCst, '01')
  assert.equal(nfe.pisVBc, 100)
  assert.equal(nfe.pisAliq, 1.65)
  assert.equal(nfe.pisValor, 1.65)
  assert.equal(nfe.cofinsCst, '01')
  assert.equal(nfe.cofinsVBc, 100)
  assert.equal(nfe.cofinsAliq, 7.6)
  assert.equal(nfe.cofinsValor, 7.6)
  assert.equal(nfe.ibsCbsCst, '')
  assert.equal(nfe.cbsValor, null)
  assert.equal(nfe.ibsValorTotal, null)
  assert.equal(nfe.emitenteDoc.replace(/\D/g, ''), CNPJ)
  assert.equal(nfe.emitenteNome, 'EMPRESA ACAO LTDA')
  assert.equal(nfe.destNome, 'CLIENTE GAMA LTDA')
  assert.equal(nfe.destUf, 'RJ')
  assert.equal(nfe.codigoBarras, '7891234567890')

  const nfce = linhas.find((l) => l.chave === CHAVE_NFCE)
  assert.ok(nfce)
  assert.equal(nfce.modelo, '65')
  assert.match(nfce.descricao, /C190/)
  assert.equal(nfce.cfop, '5102')
  assert.equal(nfce.vProd, 50)
  assert.equal(nfce.icmsAliq, 12)

  assert.equal(linhas.some((l) => l.chave === CHAVE_CANC), false)
})

test('relatório: comparativo separa aprovado e cancelamento', () => {
  const parsed = parser.parseEfdTexto(fs.readFileSync(FIXTURE, 'utf-8'))
  const { aprovados, cancelados } = relatorioEfd.mapearEfdParaComparativo(parsed)
  assert.equal(aprovados.length, 2)
  assert.equal(cancelados.length, 1)
  assert.equal(cancelados[0].chave, CHAVE_CANC)
  assert.equal(cancelados[0].nNF, '124')
  assert.equal(aprovados.map((l) => l.chave).sort().join(','), [CHAVE_NFE, CHAVE_NFCE].sort().join(','))
})

test('relatório: gera um único XLSX com abas e nome razão social + CNPJ', async () => {
  const ExcelJS = require('exceljs')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'efis-efd-'))
  const origem = path.join(dir, 'sped.txt')
  fs.copyFileSync(FIXTURE, origem)

  const r = await relatorioEfd.gerarRelatoriosEfd(origem)
  assert.equal(r.ok, true)
  assert.equal(r.aprovados, 2)
  assert.equal(r.cancelados, 1)
  assert.equal(r.itens, 2)
  assert.equal(r.notas, 2)

  const arquivo = xlsxComum.montarNomeArquivoRelatorioEfd({ nome: 'EMPRESA ACAO LTDA', cnpj: CNPJ })
  assert.match(arquivo, /EMPRESA ACAO LTDA - 11222333000181 - relatorio\.xlsx$/)
  assert.equal(r.arquivo, arquivo)
  assert.equal(r.arquivos.length, 1)
  assert.equal(fs.existsSync(path.join(dir, arquivo)), true)
  assert.equal(fs.readdirSync(dir).filter((n) => n.endsWith('.xlsx')).length, 1)

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path.join(dir, arquivo))
  assert.deepEqual(
    wb.worksheets.map((ws) => ws.name),
    ['Comparativo aprovado', 'Comparativo cancelamento', 'Notas']
  )
  const notas = wb.getWorksheet('Notas')
  assert.equal(notas.getRow(1).getCell(1).value, xlsxComum.HEADERS_NOTAS[0])
  assert.equal(notas.getRow(1).cellCount, xlsxComum.HEADERS_NOTAS.length)
  assert.ok(xlsxComum.HEADERS_NOTAS.includes('ICMS ST Valor'))
  assert.ok(xlsxComum.HEADERS_NOTAS.includes('PIS Valor'))
  assert.ok(xlsxComum.HEADERS_NOTAS.includes('COFINS Valor'))
  assert.ok(xlsxComum.HEADERS_NOTAS.includes('Valor CBS'))
  assert.ok(xlsxComum.HEADERS_NOTAS.includes('Valor Total IBS'))
})

test('preview: devolve resumo do arquivo em disco (latin1)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'efis-efd-prev-'))
  const origem = path.join(dir, 'sped-latin1.txt')
  fs.writeFileSync(origem, Buffer.from(efdComAcento, 'latin1'))
  const prev = relatorioEfd.previewRelatorioEfd(origem)
  assert.equal(prev.ok, true)
  assert.equal(prev.resumo.nome, 'EMPRESA AÇÃO LTDA')
  assert.equal(prev.resumo.cnpj, CNPJ)
  assert.equal(prev.resumo.documentos, 1)
  assert.equal(prev.resumo.aprovados, 1)
})
