import fs from 'fs'
import path from 'path'
import { resolverPastaCnpj } from './pasta-empresa'

export interface SatXmlSalvoInfo {
  chave: string
  caminho: string
  ano: string
  mes: string
  tipo: 'cfeSat' | 'cancCFe' | 'outro'
}

export function listarXmlsSatSalvos(
  pastaRaiz: string,
  cnpj14: string,
  filtro?: { ano?: string; mes?: string }
): SatXmlSalvoInfo[] {
  const cnpj = cnpj14.replace(/\D/g, '')
  if (cnpj.length !== 14) return []
  const base = resolverPastaCnpj(pastaRaiz, cnpj)
  if (!fs.existsSync(base)) return []

  const out: SatXmlSalvoInfo[] = []

  const filtrarAno = (ano: string) => !filtro?.ano || filtro.ano === ano
  const filtrarMes = (mes: string) => !filtro?.mes || filtro.mes === mes

  for (const anoEnt of fs.readdirSync(base, { withFileTypes: true })) {
    if (!anoEnt.isDirectory()) continue
    const ano = anoEnt.name
    if (!/^\d{4}$/.test(ano) && ano !== 'sem-data') continue
    if (!filtrarAno(ano)) continue

    const anoPath = path.join(base, ano)
    for (const mesEnt of fs.readdirSync(anoPath, { withFileTypes: true })) {
      if (!mesEnt.isDirectory()) continue
      const mes = mesEnt.name
      if (!/^\d{2}$/.test(mes) && mes !== '00') continue
      if (!filtrarMes(mes)) continue

      const mesPath = path.join(anoPath, mes)
      for (const arq of fs.readdirSync(mesPath, { withFileTypes: true })) {
        if (!arq.isFile() || !arq.name.toLowerCase().endsWith('.xml')) continue
        const caminho = path.join(mesPath, arq.name)
        const baseNome = arq.name.replace(/\.xml$/i, '')
        const m = baseNome.match(/^(\d{44})_(cfeSat|cancCFe)$/i)
        const chave = m?.[1] ?? (/^\d{44}$/.test(baseNome) ? baseNome : baseNome)
        const tipoRaw = (m?.[2] ?? '').toLowerCase()
        const tipo: SatXmlSalvoInfo['tipo'] =
          tipoRaw === 'cfesat' ? 'cfeSat' : tipoRaw === 'canccfe' ? 'cancCFe' : 'outro'
        out.push({ chave, caminho, ano, mes, tipo })
      }
    }
  }

  out.sort((a, b) => (b.ano + b.mes).localeCompare(a.ano + a.mes) || b.chave.localeCompare(a.chave))
  return out
}
