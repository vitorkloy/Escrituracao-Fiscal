import fs from 'fs'
import path from 'path'

/**
 * Resolve a pasta da empresa (`…/CNPJ`).
 * Aceita pasta raiz = pai (`…/Nova pasta`) ou a própria pasta do CNPJ
 * (`…/Nova pasta/1947…`), para não falhar com "nenhuma chave".
 */
export function resolverPastaCnpj(pastaRaiz: string, cnpj14: string): string {
  const cnpj = cnpj14.replace(/\D/g, '')
  const raiz = pastaRaiz.trim().replace(/[/\\]+$/, '')
  const aninhada = path.join(raiz, cnpj)
  if (cnpj.length === 14 && fs.existsSync(aninhada)) return aninhada
  if (cnpj.length === 14 && path.basename(raiz).replace(/\D/g, '') === cnpj && fs.existsSync(raiz)) {
    return raiz
  }
  return aninhada
}

/** Pasta pai onde deve ficar a pasta do CNPJ (para gravar estado/XML no layout padrão). */
export function normalizarPastaRaizEmpresa(pastaRaiz: string, cnpj14: string): string {
  const cnpj = cnpj14.replace(/\D/g, '')
  const raiz = pastaRaiz.trim().replace(/[/\\]+$/, '')
  if (cnpj.length === 14 && path.basename(raiz).replace(/\D/g, '') === cnpj) {
    return path.dirname(raiz)
  }
  return raiz
}
