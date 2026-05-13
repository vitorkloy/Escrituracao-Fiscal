'use client'

import { useState } from 'react'
import type { CertificateUiState, LoadingUiState, ToastVariant } from '@/types/nfce-app'
import { useIsElectron } from '@/hooks/useIsElectron'
import { TAMANHO_CHAVE_ACESSO } from '@/lib/nfce-format'
import { CertificatePasswordWarning } from '@/components/nfce/certificate-password-warning'
import { BUTTON_PRIMARY_CLASS, BUTTON_SUBTLE_CLASS, INPUT_BASE_CLASS, SURFACE_CARD_CLASS } from '@/components/nfce/ui/classes'
import { Spinner } from '@/components/nfce/ui/spinner'

type CteConsultaPanelProps = {
  certificateState: CertificateUiState
  showToast: (variant: ToastVariant, message: string) => void
  onLoadingStateChange: (state: LoadingUiState) => void
}

const ENDPOINTS_INFO =
  'Produção: nfe.fazenda.sp.gov.br/CTeWS/WS/CTeConsultaV4.asmx · Homologação: homologacao.nfe.fazenda.sp.gov.br (CT-e v4.00, SEFAZ-SP).'

export function CteConsultaPanel({
  certificateState,
  showToast,
  onLoadingStateChange,
}: CteConsultaPanelProps) {
  const { isElectron } = useIsElectron()
  const [chave, setChave] = useState('')
  const [tpAmb, setTpAmb] = useState<'1' | '2'>('1')
  const [ambienteEndpoint, setAmbienteEndpoint] = useState<'producao' | 'homologacao'>('producao')
  const [respostaBruta, setRespostaBruta] = useState<string | null>(null)
  const [resumo, setResumo] = useState<{
    cStat: string
    xMotivo: string
    chCTe?: string
    xmlProtCTe?: string
    xmlProcCTe?: string
  } | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function consultar() {
    if (!isElectron) return
    if (!certificateState.thumbprint && !certificateState.pfxPath) {
      showToast('erro', 'Selecione um certificado na aba Certificado.')
      return
    }
    if (!certificateState.origemStore && !certificateState.senha) {
      showToast('erro', 'Informe a senha do certificado.')
      return
    }
    const ch = chave.replace(/\D/g, '')
    if (ch.length !== TAMANHO_CHAVE_ACESSO) {
      showToast('erro', `A chave deve ter ${TAMANHO_CHAVE_ACESSO} dígitos.`)
      return
    }

    setIsLoading(true)
    setRespostaBruta(null)
    setResumo(null)
    onLoadingStateChange({ type: 'request', label: 'Consultando CT-e na SEFAZ-SP…' })
    if (window.electron?.app) window.electron.app.setBusy(true)
    try {
      const resp = await window.electron.cte.consultaSituacao(certificateState as never, {
        chCTe: ch,
        tpAmb,
        ambienteEndpoint,
      })
      if (!resp.ok) {
        showToast('erro', resp.xMotivo ?? 'Falha na consulta de situação do CT-e.')
        return
      }
      setRespostaBruta(resp.xmlResposta ?? '')
      setResumo(resp.resumo ?? null)
      const r = resp.resumo
      showToast(
        'ok',
        r ? `SEFAZ: [${r.cStat}] ${r.xMotivo || 'Resposta recebida.'}` : 'Resposta SOAP recebida (retConsSitCTe não interpretado).',
      )
    } catch (err) {
      showToast('erro', err instanceof Error ? err.message : 'Erro ao consultar CT-e.')
    } finally {
      setIsLoading(false)
      onLoadingStateChange({ type: null })
      if (window.electron?.app) window.electron.app.setBusy(false)
    }
  }

  async function salvarProcCte() {
    if (!resumo?.xmlProcCTe) {
      showToast('info', 'Não há XML procCTe nesta resposta.')
      return
    }
    const nome = `${(resumo.chCTe ?? chave.replace(/\D/g, '')).slice(0, 44) || 'cte'}_procCTe.xml`
    const ok = await window.electron.fs.salvarXml(resumo.xmlProcCTe, nome)
    if (ok) showToast('ok', 'XML salvo.')
    else showToast('info', 'Salvamento cancelado.')
  }

  async function salvarProtCte() {
    if (!resumo?.xmlProtCTe) {
      showToast('info', 'Não há XML de protocolo (protCTe) nesta resposta.')
      return
    }
    const nome = `${(resumo.chCTe ?? chave.replace(/\D/g, '')).slice(0, 44) || 'cte'}_protCTe.xml`
    const ok = await window.electron.fs.salvarXml(resumo.xmlProtCTe, nome)
    if (ok) showToast('ok', 'XML salvo.')
    else showToast('info', 'Salvamento cancelado.')
  }

  async function salvarRespostaSoap() {
    if (!respostaBruta) return
    const nome = `${chave.replace(/\D/g, '').slice(0, 44) || 'cte'}_resposta_consulta_soap.xml`
    const ok = await window.electron.fs.salvarXml(respostaBruta, nome)
    if (ok) showToast('ok', 'Resposta SOAP salva.')
    else showToast('info', 'Salvamento cancelado.')
  }

  return (
    <div className="fade-in h-full overflow-auto p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-1">Consulta situação CT-e (SEFAZ-SP)</h2>
        <p className="text-xs text-[var(--text-muted)]">{ENDPOINTS_INFO}</p>
        <p className="text-xs text-[var(--text-secondary)] mt-2">
          Serviço <code className="text-[11px]">CTeConsultaV4</code> com <code className="text-[11px]">consSitCTe</code>
          {' '}(chave 44 posições). O certificado deve ser compatível com o documento consultado.
        </p>
      </div>

      {!certificateState.origemStore && !certificateState.senha && certificateState.pfxPath && (
        <CertificatePasswordWarning context="cte" />
      )}

      <div className={`${SURFACE_CARD_CLASS} p-4 flex flex-col gap-3`}>
        <label className="block">
          <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Chave de acesso (44 dígitos)</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={chave}
            onChange={(e) => setChave(e.target.value.replace(/\D/g, '').slice(0, TAMANHO_CHAVE_ACESSO))}
            className={`${INPUT_BASE_CLASS} mt-1 font-mono text-sm w-full`}
            placeholder="Somente números"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">tpAmb (XML)</span>
            <select
              value={tpAmb}
              onChange={(e) => setTpAmb(e.target.value === '2' ? '2' : '1')}
              className={`${INPUT_BASE_CLASS} mt-1 w-full text-sm`}
            >
              <option value="1">1 — Produção</option>
              <option value="2">2 — Homologação</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Endpoint</span>
            <select
              value={ambienteEndpoint}
              onChange={(e) => setAmbienteEndpoint(e.target.value === 'homologacao' ? 'homologacao' : 'producao')}
              className={`${INPUT_BASE_CLASS} mt-1 w-full text-sm`}
            >
              <option value="producao">Produção</option>
              <option value="homologacao">Homologação</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void consultar()}
            disabled={isLoading}
            className={`flex items-center gap-2 px-4 py-2 no-drag ${BUTTON_PRIMARY_CLASS}`}
          >
            {isLoading ? (
              <>
                <Spinner />
                Consultando…
              </>
            ) : (
              'Consultar'
            )}
          </button>
        </div>
      </div>

      {resumo && (
        <div className={`${SURFACE_CARD_CLASS} p-4 text-sm`}>
          <p className="font-mono text-[var(--teal)] mb-2">
            cStat: {resumo.cStat} — {resumo.xMotivo}
          </p>
          {resumo.chCTe && (
            <p className="text-xs text-[var(--text-secondary)] break-all mb-3">
              chCTe: <span className="font-mono">{resumo.chCTe}</span>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {resumo.xmlProcCTe && (
              <button type="button" onClick={() => void salvarProcCte()} className={`no-drag ${BUTTON_SUBTLE_CLASS}`}>
                Salvar procCTe (.xml)
              </button>
            )}
            {resumo.xmlProtCTe && (
              <button type="button" onClick={() => void salvarProtCte()} className={`no-drag ${BUTTON_SUBTLE_CLASS}`}>
                Salvar protCTe (.xml)
              </button>
            )}
            {respostaBruta && (
              <button type="button" onClick={() => void salvarRespostaSoap()} className={`no-drag ${BUTTON_SUBTLE_CLASS}`}>
                Salvar resposta SOAP completa
              </button>
            )}
          </div>
        </div>
      )}

      {respostaBruta && !resumo && (
        <div className={`${SURFACE_CARD_CLASS} p-4`}>
          <p className="text-xs text-[var(--text-secondary)] mb-2">
            A resposta foi recebida, mas o retorno <code className="text-[11px]">retConsSitCTe</code> não foi reconhecido
            neste formato. Guarde o SOAP para análise.
          </p>
          <button type="button" onClick={() => void salvarRespostaSoap()} className={`no-drag ${BUTTON_SUBTLE_CLASS}`}>
            Salvar resposta SOAP
          </button>
        </div>
      )}

      {respostaBruta && (
        <details className={`${SURFACE_CARD_CLASS} p-4`}>
          <summary className="text-sm cursor-pointer text-[var(--text-secondary)]">Resposta bruta (SOAP)</summary>
          <pre className="mt-3 text-[10px] font-mono whitespace-pre-wrap break-all max-h-[320px] overflow-auto text-[var(--text-muted)]">
            {respostaBruta}
          </pre>
        </details>
      )}
    </div>
  )
}
