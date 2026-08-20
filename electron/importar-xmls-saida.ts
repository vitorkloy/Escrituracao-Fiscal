import fs from 'fs'
import path from 'path'
import {
  extrairAnoMesEmissao,
  extrairChaveAcesso44,
  extrairCnpjEmitenteDaChave44,
  extrairCnpjEmitenteDistDfe,
} from './nfe-dist-dfe-parser'
import {
  extrairChaveAcesso44Cte,
  extrairCnpjEmitenteDistDfeCte,
} from './cte-dist-dfe-parser'

export type TipoImportacaoSaida = 'nfe' | 'cte'

export interface ImportarXmlsSaidaResultado {
  ok: boolean
  copiados: number
  ignorados: number
  pulados: number
  falhas: number
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

function xmlEhNfeCompleta(conteudo: string): boolean {
  if (!/<(?:[\w.-]+:)?infNFe\b/i.test(conteudo)) return false
  if (!/<(?:[\w.-]+:)?det\b/i.test(conteudo)) return false
  // Preferir documentos autorizados / com itens (não só resumo)
  if (/<(?:[\w.-]+:)?resNFe\b/i.test(conteudo) && !/<(?:[\w.-]+:)?nfeProc\b/i.test(conteudo) && !/<(?:[\w.-]+:)?NFe\b/i.test(conteudo)) {
    return false
  }
  return true
}

function xmlEhCteCompleto(conteudo: string): boolean {
  if (!/<(?:[\w.-]+:)?(?:infCte|infCTe)\b/i.test(conteudo)) return false
  return (
    /<(?:[\w.-]+:)?cteProc\b/i.test(conteudo) ||
    /<(?:[\w.-]+:)?procCTe\b/i.test(conteudo) ||
    /<(?:[\w.-]+:)?CTe\b/i.test(conteudo)
  )
}

function destinoUnico(dir: string, nomeArquivo: string): string {
  let dest = path.join(dir, nomeArquivo)
  if (!fs.existsSync(dest)) return dest
  const base = nomeArquivo.replace(/\.xml$/i, '')
  let i = 2
  while (fs.existsSync(path.join(dir, `${base}_${i}.xml`))) i++
  return path.join(dir, `${base}_${i}.xml`)
}

/**
 * Copia XMLs completos de saída (procNFe / procCTe) de uma pasta origem
 * para `{pastaDestino}/{CNPJ}/{ano}/{mes}/{chave}_procNFe|procCTe.xml`.
 */
export function importarXmlsSaida(params: {
  pastaOrigem: string
  pastaDestino: string
  cnpj14: string
  tipo: TipoImportacaoSaida
}): ImportarXmlsSaidaResultado {
  const pastaOrigem = String(params.pastaOrigem ?? '').trim()
  const pastaDestino = String(params.pastaDestino ?? '').trim()
  const cnpj = String(params.cnpj14 ?? '').replace(/\D/g, '')
  const tipo = params.tipo

  if (!pastaOrigem) return { ok: false, copiados: 0, ignorados: 0, pulados: 0, falhas: 0, xMotivo: 'Pasta de origem não informada.' }
  if (!pastaDestino) return { ok: false, copiados: 0, ignorados: 0, pulados: 0, falhas: 0, xMotivo: 'Pasta de destino não informada.' }
  if (cnpj.length !== 14) return { ok: false, copiados: 0, ignorados: 0, pulados: 0, falhas: 0, xMotivo: 'CNPJ com 14 dígitos é obrigatório.' }
  if (!fs.existsSync(pastaOrigem)) return { ok: false, copiados: 0, ignorados: 0, pulados: 0, falhas: 0, xMotivo: 'Pasta de origem não encontrada.' }
  if (!fs.existsSync(pastaDestino)) {
    try {
      fs.mkdirSync(pastaDestino, { recursive: true })
    } catch {
      return { ok: false, copiados: 0, ignorados: 0, pulados: 0, falhas: 0, xMotivo: 'Não foi possível criar a pasta de destino.' }
    }
  }

  const arquivos = listarXmlsRecursivo(pastaOrigem)
  let copiados = 0
  let ignorados = 0
  let pulados = 0
  let falhas = 0
  const amostra: string[] = []

  for (const full of arquivos) {
    let conteudo = ''
    try {
      conteudo = fs.readFileSync(full, 'utf-8')
    } catch {
      falhas++
      continue
    }

    if (tipo === 'nfe') {
      if (!xmlEhNfeCompleta(conteudo)) {
        pulados++
        continue
      }
      const chave = extrairChaveAcesso44(conteudo)
      if (!chave || chave.length !== 44) {
        pulados++
        continue
      }
      const emit =
        extrairCnpjEmitenteDistDfe(conteudo) ?? extrairCnpjEmitenteDaChave44(chave)
      if (emit && emit !== cnpj) {
        pulados++
        continue
      }
      const am = extrairAnoMesEmissao(conteudo)
      const ano = am?.ano ?? (chave ? `20${chave.slice(2, 4)}` : 'sem-data')
      const mes = am?.mes ?? (chave ? chave.slice(4, 6) : '00')
      const dir = path.join(pastaDestino, cnpj, ano, mes)
      fs.mkdirSync(dir, { recursive: true })
      const nome = `${chave}_procNFe.xml`
      const destPadrao = path.join(dir, nome)
      if (fs.existsSync(destPadrao)) {
        ignorados++
        continue
      }
      try {
        const dest = destinoUnico(dir, nome)
        fs.copyFileSync(full, dest)
        copiados++
        if (amostra.length < 8) amostra.push(path.relative(pastaDestino, dest).replace(/\\/g, '/'))
      } catch {
        falhas++
      }
    } else {
      if (!xmlEhCteCompleto(conteudo)) {
        pulados++
        continue
      }
      const chave = extrairChaveAcesso44Cte(conteudo)
      if (!chave || chave.length !== 44) {
        pulados++
        continue
      }
      const emit = extrairCnpjEmitenteDistDfeCte(conteudo) ?? extrairCnpjEmitenteDaChave44(chave)
      if (emit && emit !== cnpj) {
        pulados++
        continue
      }
      const am = extrairAnoMesEmissao(conteudo)
      const ano = am?.ano ?? (chave ? `20${chave.slice(2, 4)}` : 'sem-data')
      const mes = am?.mes ?? (chave ? chave.slice(4, 6) : '00')
      const dir = path.join(pastaDestino, cnpj, ano, mes)
      fs.mkdirSync(dir, { recursive: true })
      const nome = `${chave}_procCTe.xml`
      const destPadrao = path.join(dir, nome)
      if (fs.existsSync(destPadrao)) {
        ignorados++
        continue
      }
      try {
        const dest = destinoUnico(dir, nome)
        fs.copyFileSync(full, dest)
        copiados++
        if (amostra.length < 8) amostra.push(path.relative(pastaDestino, dest).replace(/\\/g, '/'))
      } catch {
        falhas++
      }
    }
  }

  if (copiados === 0 && ignorados === 0 && pulados === 0 && falhas === 0) {
    return {
      ok: false,
      copiados: 0,
      ignorados: 0,
      pulados: 0,
      falhas: 0,
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
      pastaDestino: path.join(pastaDestino, cnpj),
      xMotivo:
        tipo === 'nfe'
          ? 'Nenhum XML completo de NF-e (procNFe/nfeProc com itens) do CNPJ informado foi encontrado.'
          : 'Nenhum XML completo de CT-e (procCTe/cteProc) do CNPJ informado foi encontrado.',
    }
  }

  return {
    ok: true,
    copiados,
    ignorados,
    pulados,
    falhas,
    pastaDestino: path.join(pastaDestino, cnpj),
    amostra,
  }
}
