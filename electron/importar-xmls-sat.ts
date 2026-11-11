import fs from 'fs'
import path from 'path'
import { normalizarPastaRaizEmpresa } from './pasta-empresa'
import {
  cfeSatPosterior2025,
  extrairAnoMesCfe,
  extrairChaveCfe,
  extrairCnpjEmitenteCfe,
  xmlEhCfeCanc,
  xmlEhCfeSatCompleto,
} from './sat-cfe-parser'

export interface ImportarXmlsSatResultado {
  ok: boolean
  copiados: number
  ignorados: number
  pulados: number
  falhas: number
  /** Cupons/cancelamentos com data a partir de 2026 (inválidos — erro 1001). Não são copiados. */
  posteriores2025: number
  pastaDestino?: string
  amostra?: string[]
  xMotivo?: string
}

function listarXmlsRecursivo(pasta: string): string[] {
  const out: string[] = []
  function walk(dir: string) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) walk(full)
      else if (ent.isFile() && /\.xml$/i.test(ent.name)) out.push(full)
    }
  }
  walk(pasta)
  return out
}

/**
 * Aceita como destino a pasta pai (`…/eFis`) ou a própria pasta do CNPJ (`…/eFis/{CNPJ}`).
 * Copia CF-e-SAT (cupom / cancelamento) para `{pastaDestino}/{CNPJ}/{ano}/{mes}/{chave}_cfeSat|cancCFe.xml`.
 */
export function importarXmlsSat(params: {
  pastaOrigem: string
  pastaDestino: string
  cnpj14: string
}): ImportarXmlsSatResultado {
  const pastaOrigem = String(params.pastaOrigem ?? '').trim()
  const cnpj = String(params.cnpj14 ?? '').replace(/\D/g, '')
  const pastaDestinoInformada = String(params.pastaDestino ?? '').trim()
  const pastaDestino = pastaDestinoInformada ? normalizarPastaRaizEmpresa(pastaDestinoInformada, cnpj) : ''

  if (!pastaOrigem) {
    return { ok: false, copiados: 0, ignorados: 0, pulados: 0, falhas: 0, posteriores2025: 0, xMotivo: 'Pasta de origem não informada.' }
  }
  if (!pastaDestino) {
    return { ok: false, copiados: 0, ignorados: 0, pulados: 0, falhas: 0, posteriores2025: 0, xMotivo: 'Pasta de destino não informada.' }
  }
  if (cnpj.length !== 14) {
    return { ok: false, copiados: 0, ignorados: 0, pulados: 0, falhas: 0, posteriores2025: 0, xMotivo: 'CNPJ com 14 dígitos é obrigatório.' }
  }
  if (!fs.existsSync(pastaOrigem)) {
    return { ok: false, copiados: 0, ignorados: 0, pulados: 0, falhas: 0, posteriores2025: 0, xMotivo: 'Pasta de origem não encontrada.' }
  }
  try {
    fs.mkdirSync(pastaDestino, { recursive: true })
  } catch {
    return {
      ok: false,
      copiados: 0,
      ignorados: 0,
      pulados: 0,
      falhas: 0,
      posteriores2025: 0,
      xMotivo: 'Não foi possível criar a pasta de destino.',
    }
  }

  const arquivos = listarXmlsRecursivo(pastaOrigem)
  let copiados = 0
  let ignorados = 0
  let pulados = 0
  let falhas = 0
  let posteriores2025 = 0
  const amostra: string[] = []

  for (const full of arquivos) {
    let conteudo = ''
    try {
      conteudo = fs.readFileSync(full, 'utf-8')
    } catch {
      falhas++
      continue
    }

    const ehCanc = xmlEhCfeCanc(conteudo)
    const ehCupom = xmlEhCfeSatCompleto(conteudo)
    if (!ehCanc && !ehCupom) {
      pulados++
      continue
    }

    const chave = extrairChaveCfe(conteudo)
    if (!chave || chave.length !== 44) {
      pulados++
      continue
    }

    const emit = extrairCnpjEmitenteCfe(conteudo)
    if (emit && emit !== cnpj) {
      pulados++
      continue
    }

    const am = extrairAnoMesCfe(conteudo)
    const ano = am?.ano ?? `20${chave.slice(2, 4)}`
    const mes = am?.mes ?? chave.slice(4, 6)
    if (cfeSatPosterior2025(ano)) {
      posteriores2025++
      continue
    }
    const dir = path.join(pastaDestino, cnpj, ano, mes)
    fs.mkdirSync(dir, { recursive: true })
    const nome = ehCanc && !ehCupom ? `${chave}_cancCFe.xml` : `${chave}_cfeSat.xml`
    const destPadrao = path.join(dir, nome)
    if (fs.existsSync(destPadrao)) {
      ignorados++
      continue
    }
    try {
      fs.copyFileSync(full, destPadrao)
      copiados++
      if (amostra.length < 8) amostra.push(path.relative(pastaDestino, destPadrao).replace(/\\/g, '/'))
    } catch {
      falhas++
    }
  }

  if (copiados === 0 && ignorados === 0 && pulados === 0 && falhas === 0 && posteriores2025 === 0) {
    return {
      ok: false,
      copiados: 0,
      ignorados: 0,
      pulados: 0,
      falhas: 0,
      posteriores2025: 0,
      xMotivo: 'Nenhum arquivo .xml encontrado na pasta de origem.',
    }
  }

  if (copiados === 0 && ignorados === 0) {
    return {
      ok: false,
      copiados: 0,
      ignorados: 0,
      pulados,
      falhas,
      posteriores2025,
      pastaDestino: path.join(pastaDestino, cnpj),
      xMotivo:
        posteriores2025 > 0
          ? `Nenhum cupom SAT até 2025 do CNPJ informado. ${posteriores2025} XML(s) com data a partir de 2026 foram ignorados (SAT inválido — erro 1001; use NFC-e).`
          : 'Nenhum XML de cupom SAT (CFe com itens) do CNPJ informado foi encontrado.',
    }
  }

  return {
    ok: true,
    copiados,
    ignorados,
    pulados,
    falhas,
    posteriores2025,
    pastaDestino: path.join(pastaDestino, cnpj),
    amostra,
  }
}
