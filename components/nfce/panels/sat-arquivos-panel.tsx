'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CertificateUiState, ToastVariant } from '@/types/nfce-app'
import { useIsElectron } from '@/hooks/useIsElectron'
import { BUTTON_PRIMARY_CLASS, BUTTON_SUBTLE_CLASS, INPUT_BASE_CLASS, SURFACE_CARD_CLASS } from '@/components/nfce/ui/classes'

type SatArquivosPanelProps = {
  certificateState: CertificateUiState
  showToast: (variant: ToastVariant, message: string) => void
}

export function SatArquivosPanel({ certificateState, showToast }: SatArquivosPanelProps) {
  const { isElectron } = useIsElectron()
  const [cnpj, setCnpj] = useState('')
  const [pastaRaiz, setPastaRaiz] = useState('')
  const [filtroAno, setFiltroAno] = useState('')
  const [filtroMes, setFiltroMes] = useState('')
  const [lista, setLista] = useState<
    Array<{ chave: string; caminho: string; ano: string; mes: string; tipo: string }>
  >([])
  const [previewXml, setPreviewXml] = useState<string | null>(null)
  const [previewTitulo, setPreviewTitulo] = useState('')

  useEffect(() => {
    if (certificateState.certificadoCnpj?.length === 14) {
      setCnpj(certificateState.certificadoCnpj)
    }
  }, [certificateState.certificadoCnpj])

  const escolherPasta = useCallback(async () => {
    if (!isElectron) return
    const p = await window.electron.fs.selecionarPasta()
    if (p) setPastaRaiz(p)
  }, [isElectron])

  async function carregarLista() {
    if (!isElectron) return
    const cj = cnpj.replace(/\D/g, '')
    if (!pastaRaiz.trim() || cj.length !== 14) {
      showToast('erro', 'Selecione a pasta do eFis e informe o CNPJ com 14 dígitos.')
      return
    }
    const r = await window.electron.sat.listarXmlsSalvos(pastaRaiz.trim(), cj, {
      ano: filtroAno || undefined,
      mes: filtroMes || undefined,
    })
    if (!r.ok) {
      showToast('erro', r.xMotivo ?? 'Falha ao listar XMLs SAT.')
      setLista([])
      return
    }
    setLista(r.arquivos ?? [])
  }

  async function abrirPreview(caminho: string, titulo: string) {
    if (!isElectron) return
    const r = await window.electron.fs.lerArquivoUtf8(caminho)
    if (!r.ok || !r.conteudo) {
      showToast('erro', r.xMotivo ?? 'Não foi possível ler o XML.')
      return
    }
    setPreviewTitulo(titulo)
    setPreviewXml(r.conteudo)
  }

  const rotuloTipo = (tipo: string) => {
    if (tipo === 'cfeSat') return 'Cupom SAT'
    if (tipo === 'cancCFe') return 'Cancelamento'
    return 'Outro'
  }

  return (
    <div className="fade-in h-full overflow-auto p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-1">Arquivos SAT na pasta</h2>
        <p className="text-sm text-[var(--text-secondary)] max-w-3xl">
          Lista cupons e cancelamentos em <code className="text-[11px]">CNPJ/ano/mês</code>. Depois gere o Excel no
          módulo Relatório → Relatório Notas (mesma pasta).
        </p>
      </div>

      <div className={`p-4 ${SURFACE_CARD_CLASS} space-y-3`}>
        <div className="flex flex-wrap gap-2 items-end">
          <button type="button" onClick={() => void escolherPasta()} className={`px-3 py-2 text-sm no-drag ${BUTTON_SUBTLE_CLASS}`}>
            Pasta do eFis
          </button>
          <div>
            <label className="block text-[10px] uppercase text-[var(--text-muted)] mb-1">CNPJ</label>
            <input
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value.replace(/\D/g, '').slice(0, 14))}
              className={`${INPUT_BASE_CLASS} w-40 font-mono`}
              placeholder="14 dígitos"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-[var(--text-muted)] mb-1">Ano</label>
            <input
              value={filtroAno}
              onChange={(e) => setFiltroAno(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className={`${INPUT_BASE_CLASS} w-24`}
              placeholder="2025"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-[var(--text-muted)] mb-1">Mês</label>
            <input
              value={filtroMes}
              onChange={(e) => setFiltroMes(e.target.value.replace(/\D/g, '').slice(0, 2))}
              className={`${INPUT_BASE_CLASS} w-20`}
              placeholder="03"
            />
          </div>
          <button type="button" onClick={() => void carregarLista()} className={`px-3 py-2 text-sm no-drag ${BUTTON_PRIMARY_CLASS}`}>
            Listar
          </button>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          {pastaRaiz || 'Selecione a pasta do eFis'} · {lista.length} arquivo(s)
        </p>

        <div className="max-h-72 overflow-auto border border-[var(--border)] rounded">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[var(--bg-raised)] text-[var(--text-muted)]">
              <tr>
                <th className="text-left p-2">Ano/Mês</th>
                <th className="text-left p-2">Tipo</th>
                <th className="text-left p-2">Chave</th>
                <th className="p-2 w-24"> </th>
              </tr>
            </thead>
            <tbody>
              {lista.slice(0, 300).map((a) => (
                <tr key={a.caminho} className="border-t border-[var(--border)]">
                  <td className="p-2 text-[var(--text-secondary)]">
                    {a.ano}/{a.mes}
                  </td>
                  <td className="p-2 text-[var(--text-secondary)]">{rotuloTipo(a.tipo)}</td>
                  <td className="p-2 font-mono text-[10px] break-all text-[var(--text-primary)]">{a.chave}</td>
                  <td className="p-2">
                    <button
                      type="button"
                      onClick={() => void abrirPreview(a.caminho, a.chave)}
                      className="text-[var(--teal)] underline no-drag"
                    >
                      Ver XML
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lista.length > 300 && (
            <p className="p-2 text-[10px] text-[var(--text-muted)]">Mostrando 300 de {lista.length}.</p>
          )}
        </div>

        {previewXml !== null && (
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <p className="text-xs text-[var(--text-muted)]">Prévia: {previewTitulo}</p>
              <button type="button" onClick={() => setPreviewXml(null)} className="text-xs text-[var(--teal)] no-drag">
                Fechar
              </button>
            </div>
            <pre className="text-[10px] font-mono whitespace-pre-wrap break-all max-h-80 overflow-auto p-2 rounded border border-[var(--border)] bg-[var(--bg-deep)]">
              {previewXml}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
