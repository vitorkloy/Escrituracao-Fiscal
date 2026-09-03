/** CF-e-SAT (modelo 59): cupom autenticado pelo equipamento SAT em SP. */

const CHAVE_44 = /\b(\d{44})\b/

export function xmlEhCfeCanc(xml: string): boolean {
  return /<(?:[\w.-]+:)?(?:CFeCanc|infCFeCanc)\b/i.test(xml)
}

/** Cupom SAT com itens (não é só cancelamento). */
export function xmlEhCfeSatCompleto(xml: string): boolean {
  if (xmlEhCfeCanc(xml) && !/<(?:[\w.-]+:)?infCFe\b/i.test(xml)) return false
  if (!/<(?:[\w.-]+:)?infCFe\b/i.test(xml) && !/<(?:[\w.-]+:)?CFe\b/i.test(xml)) return false
  if (xmlEhCfeCanc(xml) && !/<(?:[\w.-]+:)?det\b/i.test(xml)) return false
  return /<(?:[\w.-]+:)?det\b/i.test(xml) && /<(?:[\w.-]+:)?prod\b/i.test(xml)
}

export function extrairChaveCfe(xml: string): string | undefined {
  const id = xml.match(/Id\s*=\s*["']CFe(\d{44})["']/i)
  if (id?.[1]) return id[1]
  const ch = xml.match(/<(?:[\w.-]+:)?chCanc>(\d{44})<\/(?:[\w.-]+:)?chCanc>/i)
  if (ch?.[1]) return ch[1]
  const any = xml.match(CHAVE_44)
  return any?.[1]
}

export function extrairCnpjEmitenteCfe(xml: string): string | undefined {
  const emit = xml.match(
    /<(?:[\w.-]+:)?emit\b[^>]*>[\s\S]*?<(?:[\w.-]+:)?CNPJ>(\d{14})<\/(?:[\w.-]+:)?CNPJ>/i
  )
  if (emit?.[1]) return emit[1]
  const chave = extrairChaveCfe(xml)
  if (chave && chave.length === 44) return chave.slice(6, 20)
  return undefined
}

/** dEmi SAT costuma ser AAAAMMDD (sem hífen). */
export function extrairAnoMesCfe(xml: string): { ano: string; mes: string } | null {
  const dEmi = xml.match(/<(?:[\w.-]+:)?dEmi>([^<]+)<\/(?:[\w.-]+:)?dEmi>/i)?.[1]?.trim()
  if (dEmi) {
    const compacto = dEmi.replace(/\D/g, '')
    if (compacto.length >= 6) {
      const ano = compacto.length >= 8 ? compacto.slice(0, 4) : `20${compacto.slice(0, 2)}`
      const mes = compacto.length >= 8 ? compacto.slice(4, 6) : compacto.slice(2, 4)
      if (/^\d{4}$/.test(ano) && /^\d{2}$/.test(mes)) return { ano, mes }
    }
    if (/^\d{4}-\d{2}/.test(dEmi)) return { ano: dEmi.slice(0, 4), mes: dEmi.slice(5, 7) }
  }
  const chave = extrairChaveCfe(xml)
  if (chave && chave.length === 44) {
    return { ano: `20${chave.slice(2, 4)}`, mes: chave.slice(4, 6) }
  }
  return null
}
