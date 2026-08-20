'use client'

import { useEffect, useState } from 'react'
import type { AppModule, CertificateUiState, ToastVariant } from '@/types/nfce-app'
import { useIsElectron } from '@/hooks/useIsElectron'
import { BUTTON_PRIMARY_CLASS, BUTTON_SUBTLE_CLASS, INPUT_BASE_CLASS, SURFACE_CARD_CLASS } from '@/components/nfce/ui/classes'
import { Spinner } from '@/components/nfce/ui/spinner'

type ImportarXmlsSaidaPanelProps = {
  appModule: Extract<AppModule, 'nfe' | 'cte'>
  certificateState: CertificateUiState
  showToast: (variant: ToastVariant, message: string) => void
}

export function ImportarXmlsSaidaPanel({
  appModule,
  certificateState,
  showToast,
}: ImportarXmlsSaidaPanelProps) {
  const { isElectron } = useIsElectron()
  const tipo = appModule === 'cte' ? 'cte' : 'nfe'
  const rotuloDoc = tipo === 'nfe' ? 'NF-e' : 'CT-e'
  const sufixo = tipo === 'nfe' ? '_procNFe.xml' : '_procCTe.xml'

  const [cnpj, setCnpj] = useState('')
  const [pastaOrigem, setPastaOrigem] = useState('')
  const [pastaDestino, setPastaDestino] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [ultimoResumo, setUltimoResumo] = useState<string | null>(null)
  const [amostra, setAmostra] = useState<string[]>([])

  useEffect(() => {
    if (certificateState.certificadoCnpj?.length === 14) {
      setCnpj(certificateState.certificadoCnpj)
    }
  }, [certificateState.certificadoCnpj])

  async function escolherOrigem() {
    if (!isElectron) return
    const p = await window.electron.fs.selecionarPasta()
    if (p) setPastaOrigem(p)
  }

  async function escolherDestino() {
    if (!isElectron) return
    const p = await window.electron.fs.selecionarPasta()
    if (p) setPastaDestino(p)
  }

  async function importar() {
    if (!isElectron) {
      showToast('erro', 'Disponível apenas no aplicativo desktop.')
      return
    }
    const cj = cnpj.replace(/\D/g, '')
    if (cj.length !== 14) {
      showToast('erro', 'Informe o CNPJ emitente com 14 dígitos.')
      return
    }
    if (!pastaOrigem.trim()) {
      showToast('erro', 'Selecione a pasta de origem (exportação do ERP/emissor).')
      return
    }
    if (!pastaDestino.trim()) {
      showToast('erro', 'Selecione a pasta de destino (mesma árvore usada na DistDFe / Relatório Notas).')
      return
    }

    setIsLoading(true)
    setUltimoResumo(null)
    setAmostra([])
    try {
      const r = await window.electron.fs.importarXmlsSaida({
        pastaOrigem: pastaOrigem.trim(),
        pastaDestino: pastaDestino.trim(),
        cnpj14: cj,
        tipo,
      })
      if (!r.ok) {
        showToast('erro', r.xMotivo ?? 'Importação sem arquivos válidos.')
        setUltimoResumo(
          [
            r.xMotivo,
            `Pulados: ${r.pulados ?? 0}`,
            `Já existentes: ${r.ignorados ?? 0}`,
            `Falhas: ${r.falhas ?? 0}`,
          ]
            .filter(Boolean)
            .join(' · ')
        )
        return
      }
      const msg = `Importados ${r.copiados} XML(s); ${r.ignorados} já existiam; ${r.pulados} pulados (outro CNPJ / não ${rotuloDoc} completo).`
      showToast('ok', msg)
      setUltimoResumo(msg + (r.pastaDestino ? ` Destino: ${r.pastaDestino}` : ''))
      setAmostra(r.amostra ?? [])
      if (r.pastaDestino) {
        try {
          await window.electron.fs.abrirPasta(r.pastaDestino)
        } catch {
          /* opcional */
        }
      }
    } catch (err) {
      showToast('erro', err instanceof Error ? err.message : 'Erro na importação.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fade-in flex flex-col h-full overflow-auto">
      <div className="p-6 pb-4 border-b border-[var(--border)]">
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Importar saída ({rotuloDoc})</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-3xl leading-relaxed">
          A DistDFe <strong className="text-[var(--text-primary)]">não</strong> entrega ao emitente o XML completo das{' '}
          {rotuloDoc} que a própria empresa autorizou. Use esta aba para copiar os arquivos do{' '}
          <strong className="text-[var(--text-primary)]">ERP/emissor</strong> para a pasta do eFis (
          <code className="text-[11px]">CNPJ/ano/mês/{'{chave}'}{sufixo}</code>
          ), depois use o módulo Relatório → Relatório Notas.
        </p>
      </div>

      <div className="p-6 flex flex-col gap-4 max-w-3xl">
        <div className={`p-4 text-sm leading-relaxed ${SURFACE_CARD_CLASS}`}>
          <p className="text-[var(--text-secondary)]">
            Aceita varredura recursiva. Mantém só XMLs completos do CNPJ informado (
            {tipo === 'nfe' ? 'nfeProc / procNFe com itens' : 'cteProc / procCTe'}). Arquivos que já existem no destino são
            ignorados (não sobrescreve).
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-widest text-[var(--text-muted)]">CNPJ emitente</label>
          <input
            value={cnpj}
            onChange={(e) => setCnpj(e.target.value.replace(/\D/g, '').slice(0, 14))}
            className={`px-3 py-2 text-sm font-mono ${INPUT_BASE_CLASS}`}
            placeholder="14 dígitos"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Pasta origem (ERP)</label>
          <div className="flex gap-2">
            <input
              readOnly
              value={pastaOrigem}
              className={`flex-1 px-3 py-2 text-sm ${INPUT_BASE_CLASS}`}
              placeholder="Selecione a pasta com XMLs exportados…"
            />
            <button type="button" onClick={escolherOrigem} className={`px-4 py-2 text-sm shrink-0 ${BUTTON_SUBTLE_CLASS}`}>
              Escolher…
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Pasta destino (eFis)</label>
          <div className="flex gap-2">
            <input
              readOnly
              value={pastaDestino}
              className={`flex-1 px-3 py-2 text-sm ${INPUT_BASE_CLASS}`}
              placeholder="Mesma pasta raiz da DistDFe / Relatório…"
            />
            <button type="button" onClick={escolherDestino} className={`px-4 py-2 text-sm shrink-0 ${BUTTON_SUBTLE_CLASS}`}>
              Escolher…
            </button>
          </div>
        </div>

        <button
          type="button"
          disabled={isLoading}
          onClick={importar}
          className={`self-start flex items-center gap-2 px-5 py-2 text-sm ${BUTTON_PRIMARY_CLASS}`}
        >
          {isLoading ? (
            <>
              <Spinner /> Importando…
            </>
          ) : (
            `Importar XMLs de ${rotuloDoc}`
          )}
        </button>

        {ultimoResumo && (
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{ultimoResumo}</p>
        )}
        {amostra.length > 0 && (
          <ul className="text-xs font-mono text-[var(--text-muted)] space-y-1">
            {amostra.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
