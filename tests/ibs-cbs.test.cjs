/**
 * Validação IBS/CBS (issue #10) — motor 1.7.2 embarcado, sem Java.
 * Fixtures sintéticas em tests/fixtures/ibs-cbs/ (CNPJ fictício).
 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const dist = path.join(__dirname, '..', 'dist-electron')
const calc = require(path.join(dist, 'ibs-cbs-calculadora.js'))
const parametros = require(path.join(dist, 'ibs-cbs-parametros.js'))
const validacao = require(path.join(dist, 'relatorio-validacao-ibs-cbs.js'))

const FIX = path.join(__dirname, 'fixtures', 'ibs-cbs')
const ler = (nome) => fs.readFileSync(path.join(FIX, nome), 'utf-8')

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'efis-ibs-'))
}

test('arredondamento 1.7.2: HALF_EVEN 25,00 × 0,9% = 0,22 e 14,00 × 0,9% = 0,13', () => {
  assert.equal(calc.arredondarHalfEven(0.225, 2), 0.22)
  assert.equal(calc.valorTributo(25, 0.9), 0.22)
  assert.equal(calc.valorTributo(14, 0.9), 0.13)
  assert.equal(calc.valorTributo(100, 0.9), 0.9)
  assert.equal(calc.valorTributo(100, 0.1), 0.1)
})

test('arredondamento 1.7.2: 1000000325 × 0,9% → 9000002,92 (empate HALF_EVEN em inteiro)', () => {
  assert.equal(calc.valorTributo(1000000325, 0.9), 9000002.92)
})

test('alíquota efetiva publicada: redução 40% em 0,9% → 0,54', () => {
  assert.equal(calc.aliquotaEfetivaPublicada(0.9, 40), 0.54)
  assert.equal(calc.aliquotaEfetivaPublicada(0.1, 40), 0.06)
  assert.equal(calc.valorTributo(100, 0.54), 0.54)
})

test('tabela V0073: 000001 e 200047', () => {
  const a = parametros.buscarClassTrib('000001')
  assert.equal(a.cst, '000')
  assert.equal(a.tipo, 'padrao')
  assert.equal(a.pRedCbs, 0)
  assert.equal(a.nfe, true)
  assert.equal(a.nfce, true)
  const b = parametros.buscarClassTrib('200047')
  assert.equal(b.cst, '200')
  assert.equal(b.pRedCbs, 40)
  assert.equal(parametros.VERSAO_CALCULADORA_RFB, '1.7.2')
  assert.equal(parametros.FLYWAY_BASE_RFB, 'V0073')
})

test('XML NF-e 55 correto: sem divergência de valor/alíquota', () => {
  const r = validacao.validarXmlIbsCbs(ler('nfe-55-ok.xml'))
  assert.equal(r.modelo, '55')
  assert.equal(r.linhas.length, 1)
  const hard = r.linhas[0].divergencias.filter((d) => d.codigo !== 'base_nt')
  assert.deepEqual(hard, [])
  assert.equal(r.totais.divergencias.length, 0)
  assert.equal(r.linhas[0].vCbsEsp, 0.9)
  assert.equal(r.linhas[0].vIbsUfEsp, 0.1)
})

test('XML NFC-e 65 correto (HALF_EVEN 25,00): vCBS 0,22', () => {
  const r = validacao.validarXmlIbsCbs(ler('nfce-65-ok.xml'))
  assert.equal(r.modelo, '65')
  const hard = r.linhas[0].divergencias.filter((d) => d.codigo !== 'base_nt')
  assert.deepEqual(hard, [])
  assert.equal(r.linhas[0].vCbsXml, 0.22)
  assert.equal(r.linhas[0].vCbsEsp, 0.22)
  assert.equal(r.linhas[0].vIbsUfEsp, 0.02)
})

test('XML NFC-e 65 com redução 200047 correta', () => {
  const r = validacao.validarXmlIbsCbs(ler('nfce-65-reducao-ok.xml'))
  const hard = r.linhas[0].divergencias.filter((d) => d.codigo !== 'base_nt')
  assert.deepEqual(hard, [])
  assert.equal(r.linhas[0].cstXml, '200')
  assert.equal(r.linhas[0].classTribXml, '200047')
  assert.equal(r.linhas[0].vCbsEsp, 0.54)
  assert.equal(r.linhas[0].vIbsUfEsp, 0.06)
})

test('XML com CBS errada aponta divergência de alíquota e valor', () => {
  const r = validacao.validarXmlIbsCbs(ler('nfce-65-valor-errado.xml'))
  const codigos = r.linhas[0].divergencias.map((d) => d.codigo)
  assert.ok(codigos.includes('aliquota'))
  assert.ok(codigos.includes('valor'))
  assert.equal(r.linhas[0].vCbsEsp, 0.9)
})

test('IBSCBSTot divergente da soma dos itens (0,25 vs 0,26)', () => {
  const r = validacao.validarXmlIbsCbs(ler('nfce-65-totais-divergentes.xml'))
  assert.equal(r.linhas.length, 2)
  assert.ok(r.totais.divergencias.some((d) => d.campo === 'vCBS'))
  assert.equal(r.linhas[0].vCbsEsp, 0.13)
  assert.equal(r.linhas[1].vCbsEsp, 0.13)
})

test('redução declarada quando a tabela pede 0 é divergência; ausente não é', () => {
  const base = {
    modelo: '65',
    ano: 2026,
    cstXml: '000',
    classTribXml: '000001',
    vBcXml: 100,
    vBcNt: 100,
    pIbsUfXml: 0.1,
    pIbsMunXml: 0,
    pCbsXml: 0.9,
    pRedUfXml: null,
    pRedMunXml: null,
    pRedCbsXml: null,
    pEfetUfXml: null,
    pEfetMunXml: null,
    pEfetCbsXml: null,
    vIbsUfXml: 0.1,
    vIbsMunXml: 0,
    vIbsXml: 0.1,
    vCbsXml: 0.9,
  }
  const ok = validacao.validarItemIbsCbs(base)
  assert.equal(ok.divergencias.some((d) => d.codigo === 'reducao'), false)
  const ruim = validacao.validarItemIbsCbs({ ...base, pRedUfXml: 40 })
  assert.ok(ruim.divergencias.some((d) => d.codigo === 'reducao' && d.campo === 'pRedAliq UF'))
})

test('vIBS do XML deve fechar com vIBSUF+vIBSMun publicados, não com o calculado', () => {
  const r = validacao.validarItemIbsCbs({
    modelo: '55',
    ano: 2026,
    cstXml: '000',
    classTribXml: '000001',
    vBcXml: 100,
    vBcNt: 100,
    pIbsUfXml: 0.1,
    pIbsMunXml: 0,
    pCbsXml: 0.9,
    pRedUfXml: null,
    pRedMunXml: null,
    pRedCbsXml: null,
    pEfetUfXml: null,
    pEfetMunXml: null,
    pEfetCbsXml: null,
    vIbsUfXml: 0.11,
    vIbsMunXml: 0.01,
    vIbsXml: 0.1,
    vCbsXml: 0.9,
  })
  assert.ok(r.divergencias.some((d) => d.codigo === 'vIbs' && d.esperado === '0.12'))
})

test('CST 000 com cClassTrib 200047 é incompatível', () => {
  const r = validacao.validarXmlIbsCbs(ler('nfe-55-cst-invalido.xml'))
  assert.ok(r.linhas[0].divergencias.some((d) => d.codigo === 'cst_incompativel'))
})

test('gerar XLSX na pasta: notas ok e com divergência', async () => {
  const pasta = tmpDir()
  for (const nome of fs.readdirSync(FIX)) {
    fs.copyFileSync(path.join(FIX, nome), path.join(pasta, nome))
  }
  const r = await validacao.gerarValidacaoIbsCbsNaPasta(pasta)
  assert.equal(r.ok, true)
  assert.ok(r.arquivo.includes('validacao_ibs_cbs.xlsx'))
  assert.equal(fs.existsSync(r.caminhoCompleto), true)
  assert.ok(r.notas >= 5)
  assert.ok(r.itens >= 6)
  assert.ok(r.comDivergencia >= 2)
  assert.ok(r.totaisDivergentes >= 1)
  assert.equal(r.versaoCalculadora, '1.7.2')
  const buf = fs.readFileSync(r.caminhoCompleto)
  assert.ok(buf.length > 1000)
})
