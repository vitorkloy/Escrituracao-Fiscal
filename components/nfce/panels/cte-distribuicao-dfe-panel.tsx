'use client'

import { useCallback, useEffect, useState } from 'react'
import { IonIcon } from '@ionic/react'
import { archiveOutline, chevronForwardOutline, cloudDownloadOutline, codeSlashOutline } from 'ionicons/icons'
import type { CertificateUiState, LoadingUiState, ToastVariant } from '@/types/nfce-app'
import { useIsElectron } from '@/hooks/useIsElectron'
import { getErrorMessage } from '@/lib/error-utils'
import { CertificatePasswordWarning } from '@/components/nfce/certificate-password-warning'
import { Badge } from '@/components/nfce/ui/badge'
import {
  BUTTON_PRIMARY_CLASS,
  BUTTON_SUBTLE_CLASS,
  BUTTON_TEAL_GHOST_CLASS,
  INPUT_BASE_CLASS,
  SURFACE_CARD_CLASS,
} from '@/components/nfce/ui/classes'
import { Spinner } from '@/components/nfce/ui/spinner'

type CteDistribuicaoDfePanelProps = {
  certificateState: CertificateUiState
  showToast: (variant: ToastVariant, message: string) => void
  onLoadingStateChange: (state: LoadingUiState) => void
}

type ModoPainel = 'xml-livre' | 'sincronizacao' | 'arquivos-salvos'

type FiltroPapelDistDfe = 'todos' | 'emitente' | 'destinatario'

function formatarProgressoSync(p: {
  tipo: string
  cStat?: string
  ultNSU?: string
  maxNSU?: string
  loteSalvos?: number
  loteIgnorados?: number
  loteFiltrados?: number
  totalSalvos?: number
  totalIgnorados?: number
  totalFiltrados?: number
  mensagem?: string
}): string {
  const ts = new Date().toLocaleTimeString('pt-BR')
  if (p.tipo === 'lote') {
    const filtroLote = (p.loteFiltrados ?? 0) > 0 ? `, ${p.loteFiltrados} filtrados (não gravados)` : ''
    const filtroTot =
      (p.totalFiltrados ?? 0) > 0 ? `, ${p.totalFiltrados} filtrados no acumulado` : ''
    return `[${ts}] Lote cStat=${p.cStat ?? '—'} +${p.loteSalvos ?? 0} novos, ${p.loteIgnorados ?? 0} já existentes${filtroLote} | ultNSU=${p.ultNSU ?? '—'} | acumulado: ${p.totalSalvos ?? 0} salvos${filtroTot}`
  }
  if (p.tipo === 'concluido') {
    const filtroFim = (p.totalFiltrados ?? 0) > 0 ? `, ${p.totalFiltrados} filtrados (não gravados)` : ''
    return `[${ts}] Concluído — total ${p.totalSalvos ?? 0} novos, ${p.totalIgnorados ?? 0} ignorados${filtroFim}. ${p.mensagem ?? ''}`
  }
  const msgErro = `[${ts}] Erro: ${p.mensagem ?? '—'}`
  if (p.cStat === '656') {
    return `${msgErro} — Aguarde cerca de 1 h antes de nova tentativa; não use “reiniciar NSU” sem necessidade e use o ultNSU da última resposta.`
  }
  return msgErro
}

function badgeToneResumo(cStat: string): 'green' | 'amber' | 'red' {
  if (cStat === '656') return 'red'
  if (cStat === '137' || cStat === '138') return 'green'
  return 'amber'
}

export function CteDistribuicaoDfePanel({
  certificateState,
  showToast,
  onLoadingStateChange,
}: CteDistribuicaoDfePanelProps) {
  const { isElectron } = useIsElectron()
  const [modo, setModo] = useState<ModoPainel>('sincronizacao')
  const [xml, setXml] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [cUFAutor, setCUFAutor] = useState('35')
  const [resposta, setResposta] = useState<string | null>(null)
  const [resumoDist, setResumoDist] = useState<{
    cStat: string
    xMotivo: string
    ultNSU: string
    maxNSU: string
  } | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const [pastaRaiz, setPastaRaiz] = useState('')
  const [filtroPapel, setFiltroPapel] = useState<FiltroPapelDistDfe>('todos')
  const [reiniciarNsu, setReiniciarNsu] = useState(false)
  const [ultNsuPersistido, setUltNsuPersistido] = useState<string | null>(null)
  const [logSync, setLogSync] = useState<string[]>([])
  const [syncRodando, setSyncRodando] = useState(false)

  const [filtroAno, setFiltroAno] = useState('')
  const [filtroMes, setFiltroMes] = useState('')
  const [listaArquivos, setListaArquivos] = useState<Array<{ chave: string; caminho: string; ano: string; mes: string }>>([])
  const [previewXml, setPreviewXml] = useState<string | null>(null)
  const [previewTitulo, setPreviewTitulo] = useState('')

  useEffect(() => {
    if (certificateState.certificadoCnpj?.length === 14) {
      setCnpj(certificateState.certificadoCnpj)
    }
  }, [certificateState.certificadoCnpj])

  useEffect(() => {
    if (!isElectron) return
    const off = window.electron.cte.onSyncDistProgress((p) => {
      setLogSync((prev) => [...prev.slice(-120), formatarProgressoSync(p)])
    })
    return off
  }, [isElectron])

  const certOk =
    (certificateState.thumbprint || certificateState.pfxPath) &&
    (certificateState.origemStore || certificateState.senha)

  async function enviarPayload(xmlPayload: string) {
    if (!isElectron) return
    if (!certOk) {
      showToast('erro', 'Configure o certificado na aba Certificado.')
      return
    }

    const texto = xmlPayload.trim()
    if (!texto) {
      showToast('erro', 'Nada para enviar.')
      return
    }

    setIsLoading(true)
    setResposta(null)
    setResumoDist(null)
    onLoadingStateChange({ type: 'request', label: 'Consultando CTeDistribuicaoDFe…' })
    if (window.electron?.app) window.electron.app.setBusy(true)
    try {
      const resp = await window.electron.cte.distribuicaoDfe(certificateState as never, texto)
      if (!resp.ok) {
        showToast('erro', resp.xMotivo ?? 'Falha na Distribuição DFe (CT-e).')
        return
      }
      setResposta(resp.xmlResposta ?? '')
      const d = resp.resumoDistribuicao
      setResumoDist(d ?? null)
      if (d?.cStat === '656') {
        showToast('erro', `SEFAZ: [656] ${d.xMotivo || 'Consumo indevido'} · aguarde cerca de 1h para nova tentativa.`)
        return
      }
      showToast(
        'ok',
        d
          ? `SEFAZ: [${d.cStat}] ${d.xMotivo || 'OK'} · ultNSU ${d.ultNSU} · maxNSU ${d.maxNSU}`
          : 'Resposta recebida da SEFAZ.',
      )
    } catch (err) {
      showToast('erro', getErrorMessage(err, 'Erro ao chamar Distribuição DFe (CT-e).'))
    } finally {
      setIsLoading(false)
      onLoadingStateChange({ type: null })
      if (window.electron?.app) window.electron.app.setBusy(false)
    }
  }

  const escolherPasta = useCallback(async () => {
    if (!isElectron) return
    try {
      const p = await window.electron.fs.selecionarPasta()
      if (p) setPastaRaiz(p)
    } catch (err) {
      showToast('erro', `Erro ao selecionar pasta: ${getErrorMessage(err, 'Erro')}`)
    }
  }, [isElectron, showToast])

  const atualizarEstadoNsu = useCallback(async () => {
    if (!isElectron || !pastaRaiz.trim() || cnpj.replace(/\D/g, '').length !== 14) {
      setUltNsuPersistido(null)
      return
    }
    const r = await window.electron.cte.distDfeEstado(pastaRaiz.trim(), cnpj)
    if (r.ok && r.ultNSU) setUltNsuPersistido(r.ultNSU)
    else setUltNsuPersistido(null)
  }, [isElectron, pastaRaiz, cnpj])

  useEffect(() => {
    if (modo === 'sincronizacao' || modo === 'arquivos-salvos') {
      void atualizarEstadoNsu()
    }
  }, [modo, atualizarEstadoNsu])

  async function executarSincronizacao() {
    if (!isElectron) return
    if (!certOk) {
      showToast('erro', 'Configure o certificado.')
      return
    }
    if (!pastaRaiz.trim()) {
      showToast('erro', 'Selecione a pasta raiz onde os XMLs serão gravados.')
      return
    }
    if (cnpj.replace(/\D/g, '').length !== 14) {
      showToast('erro', 'Informe o CNPJ com 14 dígitos.')
      return
    }
    const cnpjInformado = cnpj.replace(/\D/g, '')
    const cnpjCert = (certificateState.certificadoCnpj ?? '').replace(/\D/g, '')
    if (cnpjCert.length === 14 && cnpjInformado !== cnpjCert) {
      showToast(
        'erro',
        'O CNPJ informado difere do CNPJ do certificado selecionado. Use o mesmo CNPJ do certificado para sincronizar.',
      )
      return
    }
    if (!/^\d{2}$/.test(cUFAutor.replace(/\D/g, ''))) {
      showToast('erro', 'cUFAutor inválido.')
      return
    }

    setLogSync([])
    setSyncRodando(true)
    onLoadingStateChange({ type: 'request', label: 'Sincronizando CT-e (AN)…' })
    window.electron.app.setBusy(true)
    try {
      const r = await window.electron.cte.syncDistDfe(certificateState as never, {
        pastaRaiz: pastaRaiz.trim(),
        cnpj14: cnpj.replace(/\D/g, ''),
        cUFAutor: cUFAutor.replace(/\D/g, ''),
        reiniciarNsu,
        filtroPapel,
      })
      if (r.ok) {
        const partFiltrados =
          r.totalFiltrados > 0 ? `, ${r.totalFiltrados} não gravados (filtro)` : ''
        showToast(
          'ok',
          `Sincronização concluída: ${r.totalSalvos} XML(s) novos, ${r.totalIgnorados} já existentes${partFiltrados} (${r.lotes} lote(s)).`,
        )
      } else {
        const base = r.xMotivo ?? 'Falha na sincronização.'
        showToast(
          'erro',
          base.includes('656')
            ? `${base} Se apareceu consumo indevido, aguarde ~1 h e evite “reiniciar NSU” sem motivo.`
            : base,
        )
      }
      await atualizarEstadoNsu()
    } catch (err) {
      showToast('erro', getErrorMessage(err, 'Erro na sincronização.'))
    } finally {
      window.electron.app.setBusy(false)
      onLoadingStateChange({ type: null })
      setSyncRodando(false)
    }
  }

  async function carregarListaArquivos() {
    if (!isElectron || !pastaRaiz.trim() || cnpj.replace(/\D/g, '').length !== 14) {
      showToast('erro', 'Pasta raiz e CNPJ são obrigatórios.')
      return
    }
    onLoadingStateChange({ type: 'request', label: 'Consultando XMLs já salvos…' })
    if (window.electron?.app) window.electron.app.setBusy(true)
    try {
      const r = await window.electron.cte.listarXmlsSalvos(pastaRaiz.trim(), cnpj.replace(/\D/g, ''), {
        ano: filtroAno.trim() || undefined,
        mes: filtroMes.trim() || undefined,
      })
      if (!r.ok) {
        showToast('erro', r.xMotivo ?? 'Falha ao listar arquivos.')
        return
      }
      setListaArquivos(r.arquivos ?? [])
      showToast('info', `${r.total ?? 0} arquivo(s) encontrado(s).`)
    } catch (err) {
      showToast('erro', getErrorMessage(err, 'Falha ao listar arquivos.'))
    } finally {
      onLoadingStateChange({ type: null })
      if (window.electron?.app) window.electron.app.setBusy(false)
    }
  }

  async function abrirPreview(caminho: string, chave: string) {
    if (!isElectron) return
    onLoadingStateChange({ type: 'request', label: 'Abrindo prévia do XML…' })
    if (window.electron?.app) window.electron.app.setBusy(true)
    try {
      const r = await window.electron.fs.lerArquivoUtf8(caminho)
      if (!r.ok || r.conteudo === undefined) {
        showToast('erro', r.xMotivo ?? 'Não foi possível ler o arquivo.')
        return
      }
      setPreviewTitulo(chave)
      setPreviewXml(r.conteudo)
    } catch (err) {
      showToast('erro', getErrorMessage(err, 'Não foi possível ler o arquivo.'))
    } finally {
      onLoadingStateChange({ type: null })
      if (window.electron?.app) window.electron.app.setBusy(false)
    }
  }

  const pillModo = (id: ModoPainel, label: string, icon: string) => (
    <button
      key={id}
      type="button"
      onClick={() => {
        setModo(id)
        if (id !== 'xml-livre') {
          setResposta(null)
          setResumoDist(null)
        }
      }}
      className={[
        'px-3 py-1.5 rounded text-xs font-semibold no-drag transition-colors inline-flex items-center gap-1.5',
        modo === id ? 'bg-[var(--teal-glow)] text-[var(--teal)]' : 'text-[var(--text-secondary)]',
      ].join(' ')}
    >
      <IonIcon icon={icon} className="w-3.5 h-3.5" />
      {label}
    </button>
  )

  return (
    <div className="fade-in flex flex-col h-full">
      <div className="p-6 pb-4 border-b border-[var(--border)] shrink-0">
        <h2 className="text-xl font-semibold mb-2 text-[var(--text-primary)]">Distribuição DFe · CT-e (AN)</h2>
        <p className="text-xs text-[var(--text-muted)] mb-1">
          Fila por NSU no Ambiente Nacional. Fluxo parecido com o download NFC-e: pasta de destino, certificado e ação
          principal — sem precisar da chave para puxar o lote.
        </p>
        <p className="text-xs text-[var(--text-secondary)] mb-4">
          Serviço <code className="text-[11px]">CTeDistribuicaoDFe</code> · método{' '}
          <code className="text-[11px]">cteDistDFeInteresse</code>
        </p>

        {!certificateState.origemStore && !certificateState.senha && certificateState.pfxPath && (
          <CertificatePasswordWarning context="cte-dist" />
        )}

        <div className="mb-2 inline-flex rounded border border-[var(--border)] bg-[var(--bg-surface)] p-1 flex-wrap gap-0.5">
          {pillModo('sincronizacao', 'Sincronizar', cloudDownloadOutline)}
          {pillModo('arquivos-salvos', 'Arquivos salvos', archiveOutline)}
          {pillModo('xml-livre', 'XML avançado', codeSlashOutline)}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-6">
        {modo === 'sincronizacao' && (
          <div className={`p-4 ${SURFACE_CARD_CLASS} space-y-4 max-w-4xl`}>
            <p className="text-xs text-[var(--text-secondary)]">
              Grava em <code className="text-[11px]">CNPJ/ano/mês/</code>. Estado do NSU:{' '}
              <code className="text-[11px]">.cte-dist-state.json</code>. Arquivos existentes não são sobrescritos.
            </p>

            <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-[var(--text-secondary)]">
              <strong className="text-[var(--text-primary)]">Atenção:</strong> excesso de consultas pode gerar{' '}
              <strong>cStat 656</strong>. Aguarde cerca de 1 h. “Reiniciar NSU” só se for realmente necessário.
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void escolherPasta()} className={`no-drag text-sm ${BUTTON_SUBTLE_CLASS}`}>
                Escolher pasta raiz
              </button>
              <IonIcon icon={chevronForwardOutline} className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
              <span className="text-xs text-[var(--text-muted)] truncate max-w-[min(100%,280px)]" title={pastaRaiz || undefined}>
                {pastaRaiz || 'Nenhuma pasta'}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">CNPJ (14 dígitos)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cnpj}
                  onChange={(e) => setCnpj(e.target.value.replace(/\D/g, '').slice(0, 14))}
                  className={`${INPUT_BASE_CLASS} mt-1 font-mono text-sm w-full`}
                  placeholder="Somente números"
                />
              </label>
              <label className="block">
                <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">cUFAutor (IBGE)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cUFAutor}
                  onChange={(e) => setCUFAutor(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  className={`${INPUT_BASE_CLASS} mt-1 w-full text-sm`}
                  placeholder="35"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">O que gravar na pasta</span>
              <select
                value={filtroPapel}
                onChange={(e) => setFiltroPapel(e.target.value as FiltroPapelDistDfe)}
                disabled={syncRodando}
                className={`${INPUT_BASE_CLASS} mt-1 w-full max-w-xl text-sm`}
              >
                <option value="todos">Todos os documentos da fila</option>
                <option value="emitente">Apenas saída (emitente)</option>
                <option value="destinatario">Apenas entrada (destinatário)</option>
              </select>
              <p className="text-[10px] text-[var(--text-muted)] mt-1">
                Eventos: CNPJ como autor em <code className="text-[10px]">infEvento</code>.{' '}
                <code className="text-[10px]">resCTe</code> pode não ter <code className="text-[10px]">dest</code> para o
                filtro entrada.
              </p>
            </label>

            <label className="flex items-start gap-2 text-xs text-[var(--text-secondary)] cursor-pointer no-drag">
              <input
                type="checkbox"
                checked={reiniciarNsu}
                onChange={(e) => setReiniciarNsu(e.target.checked)}
                className="rounded border-[var(--border)] mt-0.5"
              />
              <span>
                Reiniciar do NSU zero (ignora <code className="text-[10px]">.cte-dist-state.json</code>)
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
              <span>Último NSU: {ultNsuPersistido ?? '—'}</span>
              <button type="button" onClick={() => void atualizarEstadoNsu()} className={`no-drag ${BUTTON_TEAL_GHOST_CLASS}`}>
                Atualizar leitura
              </button>
            </div>

            <button
              type="button"
              onClick={() => void executarSincronizacao()}
              disabled={syncRodando}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm no-drag ${BUTTON_PRIMARY_CLASS}`}
            >
              {syncRodando ? (
                <>
                  <Spinner /> Sincronizando…
                </>
              ) : (
                <>
                  <IonIcon icon={cloudDownloadOutline} className="w-4 h-4" />
                  Sincronizar agora
                </>
              )}
            </button>

            {logSync.length > 0 && (
              <details className="rounded border border-[var(--border)] bg-[var(--bg-deep)]">
                <summary className="px-3 py-2 text-xs cursor-pointer text-[var(--text-secondary)]">Log de lotes</summary>
                <pre className="px-3 pb-3 text-[11px] font-mono whitespace-pre-wrap break-all max-h-48 overflow-auto text-[var(--text-muted)]">
                  {logSync.join('\n')}
                </pre>
              </details>
            )}
          </div>
        )}

        {modo === 'arquivos-salvos' && (
          <div className={`p-4 ${SURFACE_CARD_CLASS} space-y-4 max-w-4xl`}>
            <p className="text-xs text-[var(--text-secondary)]">
              XMLs gravados nesta máquina (<code className="text-[11px]">procCTe</code>, <code className="text-[11px]">resCTe</code>, eventos).
            </p>
            <div className="flex flex-wrap gap-2 items-end">
              <button type="button" onClick={() => void escolherPasta()} className={`no-drag text-sm ${BUTTON_SUBTLE_CLASS}`}>
                Pasta raiz
              </button>
              <label className="block">
                <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Ano</span>
                <input
                  value={filtroAno}
                  onChange={(e) => setFiltroAno(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className={`${INPUT_BASE_CLASS} mt-1 w-24 text-sm`}
                  placeholder="AAAA"
                />
              </label>
              <label className="block">
                <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Mês</span>
                <input
                  value={filtroMes}
                  onChange={(e) => setFiltroMes(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  className={`${INPUT_BASE_CLASS} mt-1 w-20 text-sm`}
                  placeholder="MM"
                />
              </label>
              <button type="button" onClick={() => void carregarListaArquivos()} className={`no-drag text-sm ${BUTTON_PRIMARY_CLASS}`}>
                Listar
              </button>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              {pastaRaiz || '—'} · CNPJ {cnpj.replace(/\D/g, '').length === 14 ? cnpj : '—'}
            </p>

            <div className="max-h-64 overflow-auto border border-[var(--border)] rounded">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[var(--bg-raised)] text-[var(--text-muted)]">
                  <tr>
                    <th className="text-left p-2">Ano/Mês</th>
                    <th className="text-left p-2">Chave / id</th>
                    <th className="p-2 w-24"> </th>
                  </tr>
                </thead>
                <tbody>
                  {listaArquivos.slice(0, 200).map((a) => (
                    <tr key={a.caminho} className="border-t border-[var(--border)]">
                      <td className="p-2 text-[var(--text-secondary)]">
                        {a.ano}/{a.mes}
                      </td>
                      <td className="p-2 font-mono text-[10px] break-all text-[var(--text-primary)]">{a.chave}</td>
                      <td className="p-2">
                        <button
                          type="button"
                          onClick={() => void abrirPreview(a.caminho, a.chave)}
                          className={`no-drag ${BUTTON_TEAL_GHOST_CLASS} text-[11px]`}
                        >
                          Ver XML
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {listaArquivos.length > 200 && (
                <p className="p-2 text-[10px] text-[var(--text-muted)]">Mostrando 200 de {listaArquivos.length}.</p>
              )}
            </div>

            {previewXml !== null && (
              <details open className={`${SURFACE_CARD_CLASS} p-3`}>
                <summary className="text-xs cursor-pointer text-[var(--text-secondary)] mb-2">Prévia: {previewTitulo}</summary>
                <pre className="text-[10px] font-mono whitespace-pre-wrap break-all max-h-72 overflow-auto text-[var(--text-muted)]">
                  {previewXml}
                </pre>
                <button type="button" onClick={() => setPreviewXml(null)} className={`mt-2 no-drag ${BUTTON_SUBTLE_CLASS}`}>
                  Fechar prévia
                </button>
              </details>
            )}
          </div>
        )}

        {modo === 'xml-livre' && (
          <div className={`p-4 ${SURFACE_CARD_CLASS} space-y-4 max-w-4xl`}>
            <p className="text-xs text-[var(--text-secondary)]">
              Cole o conteúdo de <code className="text-[11px]">cteDadosMsg</code> (ex.: <code className="text-[11px]">distDFeInt</code> no namespace CT-e). Uso avançado / diagnóstico.
            </p>
            <textarea
              value={xml}
              onChange={(e) => setXml(e.target.value)}
              className="w-full min-h-[160px] px-3 py-2.5 rounded text-xs font-mono no-drag bg-[var(--bg-raised)] border border-[var(--border)] resize-y"
              spellCheck={false}
              aria-label="XML cteDadosMsg"
            />
            <button
              type="button"
              onClick={() => void enviarPayload(xml)}
              disabled={isLoading}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm no-drag ${BUTTON_PRIMARY_CLASS}`}
            >
              {isLoading ? (
                <>
                  <Spinner /> Enviando…
                </>
              ) : (
                <>
                  <IonIcon icon={codeSlashOutline} className="w-4 h-4" />
                  Enviar
                </>
              )}
            </button>

            {resumoDist !== null && (
              <div className={`flex flex-wrap items-center gap-3 p-3 rounded border border-[var(--border)] ${SURFACE_CARD_CLASS}`}>
                <Badge tone={badgeToneResumo(resumoDist.cStat)} label={`cStat ${resumoDist.cStat}`} />
                <span className="text-sm text-[var(--text-secondary)]">{resumoDist.xMotivo}</span>
                <p className="w-full text-[11px] font-mono text-[var(--text-muted)] mt-1">
                  ultNSU {resumoDist.ultNSU} · maxNSU {resumoDist.maxNSU}
                </p>
              </div>
            )}

            {resposta !== null && (
              <details className={`${SURFACE_CARD_CLASS} p-3`}>
                <summary className="text-sm cursor-pointer text-[var(--text-secondary)]">Resposta bruta (SOAP)</summary>
                <pre className="mt-3 text-[10px] font-mono whitespace-pre-wrap break-all max-h-[360px] overflow-auto text-[var(--text-muted)]">
                  {resposta || '—'}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
