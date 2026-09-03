'use client'

import { useEffect, useState } from 'react'
import type { CertificateUiState, ToastVariant } from '@/types/nfce-app'
import { useIsElectron } from '@/hooks/useIsElectron'
import { BUTTON_PRIMARY_CLASS, BUTTON_SUBTLE_CLASS, INPUT_BASE_CLASS, SURFACE_CARD_CLASS } from '@/components/nfce/ui/classes'
import { Spinner } from '@/components/nfce/ui/spinner'

type SatImportarPanelProps = {
  certificateState: CertificateUiState
  showToast: (variant: ToastVariant, message: string) => void
}

export function SatImportarPanel({ certificateState, showToast }: SatImportarPanelProps) {
  const { isElectron } = useIsElectron()
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
      showToast('erro', 'Selecione a pasta de origem (backup do SAT / PDV / ZIP extraído).')
      return
    }
    if (!pastaDestino.trim()) {
      showToast('erro', 'Selecione a pasta do eFis (destino). Depois use Relatório Notas nessa pasta.')
      return
    }

    setIsLoading(true)
    setUltimoResumo(null)
    setAmostra([])
    try {
      const r = await window.electron.fs.importarXmlsSat({
        pastaOrigem: pastaOrigem.trim(),
        pastaDestino: pastaDestino.trim(),
        cnpj14: cj,
      })
      if (!r.ok) {
        showToast('erro', r.xMotivo ?? 'Importação sem arquivos válidos.')
        setUltimoResumo(
          [r.xMotivo, `Pulados: ${r.pulados ?? 0}`, `Já existentes: ${r.ignorados ?? 0}`, `Falhas: ${r.falhas ?? 0}`]
            .filter(Boolean)
            .join(' · ')
        )
        return
      }
      const msg = `Importados ${r.copiados} XML(s) SAT; ${r.ignorados} já existiam; ${r.pulados} pulados (outro CNPJ / não é cupom SAT).`
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
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Importar cupons SAT</h2>
          <span className="text-[10px] uppercase tracking-wider rounded border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2 py-0.5">
            Histórico — não emite
          </span>
        </div>
        <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-3xl leading-relaxed">
          Copia XMLs de CF-e-SAT do PDV/backup para a pasta do eFis (
          <code className="text-[11px]">CNPJ/ano/mês/{'{chave}'}_cfeSat.xml</code>
          ). Este módulo <strong>não emite</strong> cupom. Venda atual em SP é <strong>NFC-e</strong>. Emissão SAT a
          partir de 01/01/2026 é inválida (erro 1001).
        </p>
      </div>

      <div className="p-6 flex flex-col gap-4 max-w-3xl">
        <div className={`p-4 text-sm leading-relaxed ${SURFACE_CARD_CLASS}`}>
          <p className="font-medium text-[var(--text-primary)] mb-1">O que cada arquivo significa</p>
          <ul className="list-disc pl-4 text-[var(--text-secondary)] space-y-0.5 text-[13px]">
            <li>
              <strong>Cupom SAT</strong> — XML completo do CF-e (com itens). É o que o Relatório precisa.
            </li>
            <li>
              <strong>Cancelamento</strong> — anula um cupom. Gravado como <code className="text-[10px]">_cancCFe.xml</code>.
            </li>
            <li>
              <strong>NFC-e</strong> — outro documento (modelo 65). Não misture: use o módulo NFC-e.
            </li>
          </ul>
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
          <label className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Pasta origem (PDV / backup SAT)</label>
          <div className="flex gap-2">
            <input
              readOnly
              value={pastaOrigem}
              className={`flex-1 px-3 py-2 text-sm ${INPUT_BASE_CLASS}`}
              placeholder="Pasta com XMLs extraídos do SAT ou do sistema de caixa…"
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
              placeholder="Mesma pasta usada no Relatório Notas…"
            />
            <button type="button" onClick={escolherDestino} className={`px-4 py-2 text-sm shrink-0 ${BUTTON_SUBTLE_CLASS}`}>
              Escolher…
            </button>
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">
            Ex.: <code className="text-[10px]">C:\XMLs\Empresa</code> — o app organiza em{' '}
            <code className="text-[10px]">CNPJ\ano\mês</code>.
          </p>
        </div>

        <button
          type="button"
          disabled={isLoading}
          onClick={() => void importar()}
          className={`self-start flex items-center gap-2 px-5 py-2 text-sm ${BUTTON_PRIMARY_CLASS}`}
        >
          {isLoading ? (
            <>
              <Spinner /> Importando…
            </>
          ) : (
            'Importar cupons SAT'
          )}
        </button>

        {ultimoResumo && <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{ultimoResumo}</p>}
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
