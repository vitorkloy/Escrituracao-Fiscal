import fs from 'fs'
import path from 'path'
import {
  decodificarTextoEfd,
  efdDocCancelado,
  efdDocSemDocumento,
  formatarDataEfd,
  formatarDataEfdCurta,
  parseEfdTexto,
  resumirEfd,
  type EfdC100,
  type EfdC170,
  type EfdC190,
  type EfdParsed,
  type EfdParticipante,
  type EfdResumo,
} from './efd-icms-ipi-parser'
import {
  formatarCnpjCpf,
  gerarComparativoXlsxBuffer,
  gerarRelatorioNotasXlsxBuffer,
  linhaRelatorioNotasEmBranco,
  montarNomeArquivoRelatorioNotas,
  montarNomesArquivosRelatorio,
  parseValorMonetarioRelatorio,
  type CabecalhoEmpresaRelatorio,
  type RelatorioComparativoLinha,
  type RelatorioNotasLinha,
} from './relatorio-xlsx'

function docPessoa(cnpj: string, cpf: string): string {
  if (cnpj) return formatarCnpjCpf(cnpj)
  if (cpf) return formatarCnpjCpf(cpf)
  return ''
}

function partesDoDocumento(
  doc: EfdC100,
  parsed: EfdParsed
): {
  emitenteDoc: string
  emitenteNome: string
  emitenteUf: string
  destDoc: string
  destNome: string
  destUf: string
} {
  const empresaDoc = docPessoa(parsed.abertura.cnpj, parsed.abertura.cpf)
  const empresaNome = parsed.abertura.nome
  const empresaUf = parsed.abertura.uf
  const part: EfdParticipante | undefined = doc.codPart
    ? parsed.participantes.get(doc.codPart)
    : undefined
  const partDoc = part ? docPessoa(part.cnpj, part.cpf) : ''
  const partNome = part?.nome ?? ''
  const partUf = part?.uf ?? ''

  // IND_EMIT 0 = emissão própria (empresa do 0000 é o emitente)
  if (doc.indEmit !== '1') {
    return {
      emitenteDoc: empresaDoc,
      emitenteNome: empresaNome,
      emitenteUf: empresaUf,
      destDoc: partDoc,
      destNome: partNome,
      destUf: partUf,
    }
  }
  return {
    emitenteDoc: partDoc,
    emitenteNome: partNome,
    emitenteUf: partUf,
    destDoc: empresaDoc,
    destNome: empresaNome,
    destUf: empresaUf,
  }
}

function cabecalhoDoEfd(parsed: EfdParsed): CabecalhoEmpresaRelatorio {
  return {
    nome: parsed.abertura.nome || undefined,
    cnpj: parsed.abertura.cnpj || undefined,
  }
}

function linhaBaseDoC100(doc: EfdC100, parsed: EfdParsed): RelatorioNotasLinha {
  const partes = partesDoDocumento(doc, parsed)
  const l = linhaRelatorioNotasEmBranco()
  l.chave = doc.chvNfe
  l.numero = doc.numDoc
  l.serie = doc.ser
  l.modelo = doc.codMod
  l.emissao = formatarDataEfd(doc.dtDoc)
  l.emitenteDoc = partes.emitenteDoc
  l.emitenteNome = partes.emitenteNome
  l.emitenteUf = partes.emitenteUf
  l.destDoc = partes.destDoc
  l.destNome = partes.destNome
  l.destUf = partes.destUf
  return l
}

function mapearC170(
  doc: EfdC100,
  item: EfdC170,
  parsed: EfdParsed,
  idx: number
): RelatorioNotasLinha {
  const cad = item.codItem ? parsed.itens.get(item.codItem) : undefined
  const l = linhaBaseDoC100(doc, parsed)
  const nItem = item.numItem || String(idx + 1)
  l.item = nItem.padStart(3, '0')
  l.codigoProduto = item.codItem
  const barra = cad?.codigoBarras || ''
  l.codigoBarras = barra || 'SEM GTIN'
  l.descricao = item.descrCompl || cad?.descricao || ''
  l.ncm = cad?.ncm || ''
  l.cfop = item.cfop
  l.qtd = parseValorMonetarioRelatorio(item.qtd)
  l.vProd = parseValorMonetarioRelatorio(item.vlItem)
  if (l.vProd != null && l.qtd != null && l.qtd !== 0) {
    l.vUnit = Math.round((l.vProd / l.qtd) * 1e6) / 1e6
  }
  l.vDesc = parseValorMonetarioRelatorio(item.vlDesc)
  l.icmsCst = item.cstIcms
  l.icmsVBc = parseValorMonetarioRelatorio(item.vlBcIcms)
  l.icmsAliq = parseValorMonetarioRelatorio(item.aliqIcms)
  l.icmsValor = parseValorMonetarioRelatorio(item.vlIcms)
  l.ipiValor = parseValorMonetarioRelatorio(item.vlIpi)
  l.pisCst = item.cstPis
  l.pisVBc = parseValorMonetarioRelatorio(item.vlBcPis)
  l.pisAliq = parseValorMonetarioRelatorio(item.aliqPis)
  l.pisValor = parseValorMonetarioRelatorio(item.vlPis)
  l.cofinsCst = item.cstCofins
  l.cofinsVBc = parseValorMonetarioRelatorio(item.vlBcCofins)
  l.cofinsAliq = parseValorMonetarioRelatorio(item.aliqCofins)
  l.cofinsValor = parseValorMonetarioRelatorio(item.vlCofins)
  return l
}

function mapearC190(
  doc: EfdC100,
  an: EfdC190,
  parsed: EfdParsed,
  idx: number
): RelatorioNotasLinha {
  const l = linhaBaseDoC100(doc, parsed)
  l.item = String(idx + 1).padStart(3, '0')
  l.descricao = `Analítico C190 CFOP ${an.cfop || '—'} CST ${an.cstIcms || '—'}`
  l.codigoBarras = 'SEM GTIN'
  l.cfop = an.cfop
  l.icmsCst = an.cstIcms
  l.vProd = parseValorMonetarioRelatorio(an.vlOpr)
  l.icmsVBc = parseValorMonetarioRelatorio(an.vlBcIcms)
  l.icmsAliq = parseValorMonetarioRelatorio(an.aliqIcms)
  l.icmsValor = parseValorMonetarioRelatorio(an.vlIcms)
  l.ipiValor = parseValorMonetarioRelatorio(an.vlIpi)
  return l
}

export function mapearEfdParaLinhasNotas(parsed: EfdParsed): RelatorioNotasLinha[] {
  const linhas: RelatorioNotasLinha[] = []
  for (const doc of parsed.documentos) {
    if (efdDocCancelado(doc.codSit) || efdDocSemDocumento(doc.codSit)) continue
    if (doc.itens.length > 0) {
      doc.itens.forEach((it, i) => linhas.push(mapearC170(doc, it, parsed, i)))
      continue
    }
    // NFC-e e outros docs sem C170: uma linha por C190 (analítico).
    if (doc.analiticos.length > 0) {
      doc.analiticos.forEach((an, i) => linhas.push(mapearC190(doc, an, parsed, i)))
      continue
    }
    const unica = linhaBaseDoC100(doc, parsed)
    unica.item = '001'
    unica.codigoBarras = 'SEM GTIN'
    unica.vProd = parseValorMonetarioRelatorio(doc.vlMerc || doc.vlDoc)
    linhas.push(unica)
  }
  linhas.sort((a, b) => {
    const e = a.emissao.localeCompare(b.emissao, 'pt-BR')
    if (e !== 0) return e
    const c = a.chave.localeCompare(b.chave)
    if (c !== 0) return c
    return a.item.localeCompare(b.item)
  })
  return linhas
}

export function mapearEfdParaComparativo(parsed: EfdParsed): {
  aprovados: RelatorioComparativoLinha[]
  cancelados: RelatorioComparativoLinha[]
} {
  const aprovados: RelatorioComparativoLinha[] = []
  const cancelados: RelatorioComparativoLinha[] = []
  for (const doc of parsed.documentos) {
    if (efdDocSemDocumento(doc.codSit)) continue
    if (!doc.numDoc && !doc.vlDoc) continue
    const linha: RelatorioComparativoLinha = {
      chave: doc.chvNfe,
      dhEmi: formatarDataEfdCurta(doc.dtDoc),
      serie: doc.ser,
      nNF: doc.numDoc,
      vNF: doc.vlDoc,
    }
    if (efdDocCancelado(doc.codSit)) cancelados.push(linha)
    else aprovados.push(linha)
  }
  return { aprovados, cancelados }
}

export function parseEfdArquivo(caminho: string): EfdParsed {
  const buf = fs.readFileSync(caminho)
  return parseEfdTexto(decodificarTextoEfd(buf))
}

export function previewRelatorioEfd(caminho: string): {
  ok: boolean
  arquivo?: string
  resumo?: EfdResumo
  xMotivo?: string
} {
  try {
    if (!caminho) throw new Error('Arquivo EFD não informado.')
    if (!fs.existsSync(caminho)) throw new Error('Arquivo EFD não encontrado.')
    const parsed = parseEfdArquivo(caminho)
    return { ok: true, arquivo: path.basename(caminho), resumo: resumirEfd(parsed) }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, xMotivo: msg }
  }
}

export async function gerarRelatoriosEfd(caminhoEfd: string): Promise<{
  ok: boolean
  pastaSaida?: string
  arquivos?: string[]
  arquivoNotas?: string
  notas?: number
  itens?: number
  aprovados?: number
  cancelados?: number
  cabecalho?: CabecalhoEmpresaRelatorio
  xMotivo?: string
}> {
  try {
    if (!caminhoEfd) throw new Error('Arquivo EFD não informado.')
    if (!fs.existsSync(caminhoEfd)) throw new Error('Arquivo EFD não encontrado.')

    const parsed = parseEfdArquivo(caminhoEfd)
    const cabecalho = cabecalhoDoEfd(parsed)
    const linhasNotas = mapearEfdParaLinhasNotas(parsed)
    const { aprovados, cancelados } = mapearEfdParaComparativo(parsed)

    if (linhasNotas.length === 0 && aprovados.length === 0 && cancelados.length === 0) {
      return {
        ok: false,
        cabecalho,
        xMotivo: 'Nenhum documento C100 utilizável encontrado no EFD.',
      }
    }

    const pastaSaida = path.dirname(path.resolve(caminhoEfd))
    const nomes = montarNomesArquivosRelatorio(cabecalho)
    const arquivoNotas = montarNomeArquivoRelatorioNotas(cabecalho)
    const arquivos: string[] = []

    const xlsxAprovado = await gerarComparativoXlsxBuffer(aprovados, cabecalho)
    const xlsxCancelamento = await gerarComparativoXlsxBuffer(cancelados, cabecalho)
    fs.writeFileSync(path.join(pastaSaida, nomes.aprovado), xlsxAprovado)
    fs.writeFileSync(path.join(pastaSaida, nomes.cancelado), xlsxCancelamento)
    arquivos.push(nomes.aprovado, nomes.cancelado)

    if (linhasNotas.length > 0) {
      const xlsxNotas = await gerarRelatorioNotasXlsxBuffer(linhasNotas)
      fs.writeFileSync(path.join(pastaSaida, arquivoNotas), xlsxNotas)
      arquivos.push(arquivoNotas)
    }

    const chaves = new Set(linhasNotas.map((l) => l.chave || `${l.modelo}-${l.serie}-${l.numero}`))
    return {
      ok: true,
      pastaSaida,
      arquivos,
      arquivoNotas: linhasNotas.length > 0 ? arquivoNotas : undefined,
      notas: chaves.size,
      itens: linhasNotas.length,
      aprovados: aprovados.length,
      cancelados: cancelados.length,
      cabecalho,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, xMotivo: msg }
  }
}
