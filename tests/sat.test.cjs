/**
 * Testes do módulo SAT (issue #6, fase 1).
 * Rodam sobre o build do Electron (`dist-electron/`), gerado por `npm test`.
 * Fixtures em tests/fixtures/sat/ são XMLs SINTÉTICOS (CNPJ fictício), sem dado de cliente.
 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const dist = path.join(__dirname, '..', 'dist-electron')
const parser = require(path.join(dist, 'sat-cfe-parser.js'))
const { importarXmlsSat } = require(path.join(dist, 'importar-xmls-sat.js'))
const { listarXmlsSatSalvos } = require(path.join(dist, 'sat-list-xmls-local.js'))
const relatorio = require(path.join(dist, 'relatorio-notas-fsist.js'))

const FIXTURES = path.join(__dirname, 'fixtures', 'sat')
const CNPJ = '11222333000181'
const CHAVE_CUPOM = '35251211222333000181590001234560001014829103'
const CHAVE_CANC_PROPRIA = '35251211222333000181590001234560001025829117'
const CHAVE_2026 = '35260111222333000181590001234560003013334441'

const ler = (nome) => fs.readFileSync(path.join(FIXTURES, nome), 'utf-8')

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'efis-sat-'))
}

/** Copia as fixtures para uma árvore aninhada (simula backup do PDV com subpastas). */
function montarOrigem() {
  const origem = tmpDir()
  const sub = path.join(origem, 'caixa01', '2025-12')
  fs.mkdirSync(sub, { recursive: true })
  for (const nome of fs.readdirSync(FIXTURES)) {
    const destino = nome.startsWith('cupom-2025') || nome.startsWith('cancel') ? sub : origem
    fs.copyFileSync(path.join(FIXTURES, nome), path.join(destino, nome))
  }
  fs.writeFileSync(path.join(origem, 'leia-me.txt'), 'não é XML')
  return origem
}

test('parser: identifica cupom completo, cancelamento e NFC-e', () => {
  assert.equal(parser.xmlEhCfeSatCompleto(ler('cupom-2025-12.xml')), true)
  assert.equal(parser.xmlEhCfeCanc(ler('cupom-2025-12.xml')), false)

  assert.equal(parser.xmlEhCfeCanc(ler('cancelamento-2025-12.xml')), true)
  assert.equal(parser.xmlEhCfeSatCompleto(ler('cancelamento-2025-12.xml')), false)

  assert.equal(parser.xmlEhCfeSatCompleto(ler('nfce-nao-sat.xml')), false)
  assert.equal(parser.xmlEhCfeCanc(ler('nfce-nao-sat.xml')), false)
})

test('parser: chave, CNPJ e ano/mês do cupom', () => {
  const xml = ler('cupom-2025-12.xml')
  assert.equal(parser.extrairChaveCfe(xml), CHAVE_CUPOM)
  assert.equal(parser.extrairCnpjEmitenteCfe(xml), CNPJ)
  assert.deepEqual(parser.extrairAnoMesCfe(xml), { ano: '2025', mes: '12' })
})

test('parser: cancelamento usa a chave do cupom cancelado (chCanc)', () => {
  const xml = ler('cancelamento-2025-12.xml')
  assert.equal(parser.extrairChaveCfe(xml), CHAVE_CUPOM)
  assert.notEqual(parser.extrairChaveCfe(xml), CHAVE_CANC_PROPRIA)
})

test('parser: SAT a partir de 2026 é inválido (erro 1001)', () => {
  assert.equal(parser.cfeSatPosterior2025('2025'), false)
  assert.equal(parser.cfeSatPosterior2025('2026'), true)
  assert.equal(parser.cfeSatPosterior2025('2027'), true)
  assert.equal(parser.cfeSatPosterior2025(undefined), false)
})

test('importar: grava CNPJ/AAAA/MM/{chave}_cfeSat.xml e _cancCFe.xml, só do CNPJ, sem 2026', () => {
  const origem = montarOrigem()
  const destino = tmpDir()
  const r = importarXmlsSat({ pastaOrigem: origem, pastaDestino: destino, cnpj14: CNPJ })

  assert.equal(r.ok, true)
  assert.equal(r.copiados, 2)
  assert.equal(r.ignorados, 0)
  assert.equal(r.posteriores2025, 1)
  // outro CNPJ + NFC-e
  assert.equal(r.pulados, 2)
  assert.equal(r.pastaDestino, path.join(destino, CNPJ))

  const mesDir = path.join(destino, CNPJ, '2025', '12')
  assert.deepEqual(fs.readdirSync(mesDir).sort(), [`${CHAVE_CUPOM}_cancCFe.xml`, `${CHAVE_CUPOM}_cfeSat.xml`])
  assert.equal(fs.existsSync(path.join(destino, CNPJ, '2026')), false)
  assert.equal(fs.existsSync(path.join(destino, '99888777000166')), false)
  assert.equal(fs.readdirSync(path.join(destino, CNPJ)).join(','), '2025')
  assert.ok(!fs.readdirSync(mesDir).some((n) => n.includes(CHAVE_2026)))
})

test('importar: não sobrescreve arquivo existente', () => {
  const origem = montarOrigem()
  const destino = tmpDir()
  importarXmlsSat({ pastaOrigem: origem, pastaDestino: destino, cnpj14: CNPJ })

  const alvo = path.join(destino, CNPJ, '2025', '12', `${CHAVE_CUPOM}_cfeSat.xml`)
  fs.writeFileSync(alvo, 'conteúdo existente')

  const r2 = importarXmlsSat({ pastaOrigem: origem, pastaDestino: destino, cnpj14: CNPJ })
  assert.equal(r2.ok, true)
  assert.equal(r2.copiados, 0)
  assert.equal(r2.ignorados, 2)
  assert.equal(fs.readFileSync(alvo, 'utf-8'), 'conteúdo existente')
})

test('importar: aceita a própria pasta do CNPJ como destino (sem CNPJ/CNPJ)', () => {
  const origem = montarOrigem()
  const raiz = tmpDir()
  const pastaCnpj = path.join(raiz, CNPJ)
  fs.mkdirSync(pastaCnpj)

  const r = importarXmlsSat({ pastaOrigem: origem, pastaDestino: pastaCnpj, cnpj14: CNPJ })
  assert.equal(r.ok, true)
  assert.equal(r.pastaDestino, pastaCnpj)
  assert.equal(fs.existsSync(path.join(pastaCnpj, CNPJ)), false)
  assert.ok(fs.existsSync(path.join(pastaCnpj, '2025', '12', `${CHAVE_CUPOM}_cfeSat.xml`)))
})

test('importar: só cupons de 2026 → erro explicando o 1001', () => {
  const origem = tmpDir()
  fs.copyFileSync(path.join(FIXTURES, 'cupom-2026-01-invalido.xml'), path.join(origem, 'a.xml'))
  const r = importarXmlsSat({ pastaOrigem: origem, pastaDestino: tmpDir(), cnpj14: CNPJ })
  assert.equal(r.ok, false)
  assert.equal(r.posteriores2025, 1)
  assert.match(r.xMotivo, /1001/)
  assert.match(r.xMotivo, /NFC-e/)
})

test('importar: valida entradas', () => {
  assert.equal(importarXmlsSat({ pastaOrigem: '', pastaDestino: 'x', cnpj14: CNPJ }).ok, false)
  assert.equal(importarXmlsSat({ pastaOrigem: 'x', pastaDestino: '', cnpj14: CNPJ }).ok, false)
  assert.equal(importarXmlsSat({ pastaOrigem: tmpDir(), pastaDestino: tmpDir(), cnpj14: '123' }).ok, false)
  const vazio = importarXmlsSat({ pastaOrigem: tmpDir(), pastaDestino: tmpDir(), cnpj14: CNPJ })
  assert.equal(vazio.ok, false)
  assert.match(vazio.xMotivo, /Nenhum arquivo \.xml/)
})

test('arquivos na pasta: lista cupom e cancelamento (pasta pai ou do CNPJ)', () => {
  const origem = montarOrigem()
  const destino = tmpDir()
  importarXmlsSat({ pastaOrigem: origem, pastaDestino: destino, cnpj14: CNPJ })

  for (const raiz of [destino, path.join(destino, CNPJ)]) {
    const itens = listarXmlsSatSalvos(raiz, CNPJ)
    assert.equal(itens.length, 2)
    assert.deepEqual(itens.map((i) => i.tipo).sort(), ['cancCFe', 'cfeSat'])
    assert.ok(itens.every((i) => i.chave === CHAVE_CUPOM && i.ano === '2025' && i.mes === '12'))
  }
  assert.equal(listarXmlsSatSalvos(destino, CNPJ, { mes: '11' }).length, 0)
})

test('relatório notas: lê o cupom SAT (modelo 59) e ignora o cancelamento', () => {
  const origem = montarOrigem()
  const destino = tmpDir()
  importarXmlsSat({ pastaOrigem: origem, pastaDestino: destino, cnpj14: CNPJ })

  const scan = relatorio.listarXmlsElegiveisNotas(destino)
  assert.equal(scan.totalElegiveis, 1)
  assert.match(scan.elegiveis[0], /_cfeSat\.xml$/)
  assert.ok(scan.ignorados.some((i) => /_cancCFe\.xml$/.test(i.relativo)))

  const { linhas, cabecalho } = relatorio.extrairLinhasRelatorioNotas(ler('cupom-2025-12.xml'))
  assert.equal(linhas.length, 2)
  assert.equal(linhas[0].chave, CHAVE_CUPOM)
  assert.equal(linhas[0].modelo, '59')
  assert.equal(linhas[0].numero, '000101')
  assert.equal(linhas[0].serie, '000123456')
  assert.equal(linhas[0].emitenteDoc.replace(/\D/g, ''), CNPJ)
  assert.equal(linhas[0].descricao, 'PRODUTO TESTE A')
  assert.equal(linhas[1].cfop, '5405')
  assert.equal(cabecalho?.cnpj, CNPJ)
})
