'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CertificateUiState, LoadingUiState, ToastVariant } from '@/types/nfce-app'
import { useIsElectron } from '@/hooks/useIsElectron'
import { BUTTON_PRIMARY_CLASS, BUTTON_SUBTLE_CLASS, BUTTON_TEAL_GHOST_CLASS, INPUT_BASE_CLASS, SURFACE_CARD_CLASS } from '@/components/nfce/ui/classes'
import { Spinner } from '@/components/nfce/ui/spinner'
import { formatarUltNsu } from '@/lib/nfe-dist-dfe-xml'

type NfeDistribuicaoDfePanelProps = {
  certificateState: CertificateUiState
  showToast: (variant: ToastVariant, message: string) => void
  onLoadingStateChange: (state: LoadingUiState) => void
}

type ModoPainel = 'xml-livre' | 'sincronizacao' | 'arquivos-salvos'

type FiltroPapelDistDfe = 'todos' | 'emitente' | 'destinatario'

type NfeBlockTimer = {
  certId: string
  cnpj14?: string
  blockedAtMs: number
  retryAtMs: number
  cStat: '656'
}

function formatarTempoRestante(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0')
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0')
  const s = String(totalSec % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

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
    const filtroLote = (p.loteFiltrados ?? 0) > 0 ? `, ${p.loteFiltrados} fora do filtro` : ''
    const filtroTot =
      (p.totalFiltrados ?? 0) > 0 ? `, ${p.totalFiltrados} fora do filtro (acumulado)` : ''
    return `[${ts}] Lote (código ${p.cStat ?? '—'}): +${p.loteSalvos ?? 0} novos, ${p.loteIgnorados ?? 0} já na pasta${filtroLote} · ponto da fila ${p.ultNSU ?? '—'} · total salvos ${p.totalSalvos ?? 0}${filtroTot}`
  }
  if (p.tipo === 'concluido') {
    const filtroFim = (p.totalFiltrados ?? 0) > 0 ? `, ${p.totalFiltrados} fora do filtro` : ''
    return `[${ts}] Concluído — ${p.totalSalvos ?? 0} novos, ${p.totalIgnorados ?? 0} já existiam${filtroFim}. ${p.mensagem ?? ''}`
  }
  const msgErro = `[${ts}] Erro: ${p.mensagem ?? '—'}`
  if (p.cStat === '656') {
    return `${msgErro} — Consulta temporariamente bloqueada. Aguarde ~1 h; não recomece a fila do zero sem necessidade.`
  }
  return msgErro
}

export function NfeDistribuicaoDfePanel({
  certificateState,
  showToast,
  onLoadingStateChange,
}: NfeDistribuicaoDfePanelProps) {
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
  const [buscarProcRodando, setBuscarProcRodando] = useState(false)
  const [chavesSemProc, setChavesSemProc] = useState<number | null>(null)
  const [logBuscarProc, setLogBuscarProc] = useState<string[]>([])
  const [portalRodando, setPortalRodando] = useState(false)
  const [logPortal, setLogPortal] = useState<string[]>([])

  const [filtroAno, setFiltroAno] = useState('')
  const [filtroMes, setFiltroMes] = useState('')
  const [listaArquivos, setListaArquivos] = useState<Array<{ chave: string; caminho: string; ano: string; mes: string }>>([])
  const [previewXml, setPreviewXml] = useState<string | null>(null)
  const [previewTitulo, setPreviewTitulo] = useState('')
  const [nfeBlockTimer, setNfeBlockTimer] = useState<NfeBlockTimer | null>(null)
  const [agoraMs, setAgoraMs] = useState(() => Date.now())

  const certId = useMemo(() => {
    if (certificateState.thumbprint) return `thumb:${certificateState.thumbprint}`
    if (certificateState.pfxPath) return `pfx:${certificateState.pfxPath.toLowerCase()}`
    return ''
  }, [certificateState.thumbprint, certificateState.pfxPath])

  useEffect(() => {
    if (certificateState.certificadoCnpj?.length === 14) {
      setCnpj(certificateState.certificadoCnpj)
    }
  }, [certificateState.certificadoCnpj])

  useEffect(() => {
    if (!isElectron) return
    const off = window.electron.nfe.onSyncDistProgress((p) => {
      setLogSync((prev) => [...prev.slice(-120), formatarProgressoSync(p)])
    })
    return off
  }, [isElectron])

  useEffect(() => {
    if (!isElectron) return
    const off = window.electron.nfe.onPortalProgress((p) => {
      const ts = new Date().toLocaleTimeString('pt-BR')
      const pos = p.indice != null && p.total != null ? ` (${p.indice}/${p.total})` : ''
      setLogPortal((prev) => [...prev.slice(-80), `[${ts}]${pos} ${p.mensagem ?? p.tipo}`])
    })
    return off
  }, [isElectron])

  useEffect(() => {
    if (!isElectron) return
    const off = window.electron.nfe.onBuscarProcProgress((p) => {
      const ts = new Date().toLocaleTimeString('pt-BR')
      const linha = `[${ts}] ${p.mensagem ?? p.tipo}${p.chave ? ` · ${p.chave}` : ''}`
      setLogBuscarProc((prev) => [...prev.slice(-80), linha])
    })
    return off
  }, [isElectron])

  useEffect(() => {
    if (!isElectron || !certId) {
      setNfeBlockTimer(null)
      return
    }
    let cancelled = false
    window.electron.app.getNfeBlockTimer(certId).then((timer) => {
      if (cancelled) return
      setNfeBlockTimer(timer)
    }).catch(() => {
      if (cancelled) return
      // Compatibilidade em dev quando o processo main ainda não reiniciou com novos IPCs.
      setNfeBlockTimer(null)
    })
    return () => {
      cancelled = true
    }
  }, [isElectron, certId])

  useEffect(() => {
    const t = setInterval(() => setAgoraMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const certOk =
    (certificateState.thumbprint || certificateState.pfxPath) &&
    (certificateState.origemStore || certificateState.senha)

  const bloqueioAtivo = Boolean(nfeBlockTimer && nfeBlockTimer.retryAtMs > agoraMs)

  async function registrarBloqueio656() {
    if (!isElectron || !certId) return
    const payload: NfeBlockTimer = {
      certId,
      cnpj14: certificateState.certificadoCnpj,
      blockedAtMs: Date.now(),
      retryAtMs: Date.now() + 60 * 60 * 1000,
      cStat: '656',
    }
    try {
      await window.electron.app.setNfeBlockTimer(payload)
    } catch {
      return
    }
    setNfeBlockTimer(payload)
  }

  async function limparBloqueioSeHouver() {
    if (!isElectron || !certId) return
    try {
      await window.electron.app.clearNfeBlockTimer(certId)
    } catch {
      return
    }
    setNfeBlockTimer(null)
  }

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
    onLoadingStateChange({ type: 'request', label: 'Consultando Distribuição DFe…' })
    if (window.electron?.app) window.electron.app.setBusy(true)
    try {
      const resp = await window.electron.nfe.distribuicaoDfe(certificateState as never, texto)
      if (!resp.ok) {
        showToast('erro', resp.xMotivo ?? 'Falha na Distribuição DFe.')
        return
      }
      setResposta(resp.xmlResposta ?? '')
      const d = resp.resumoDistribuicao
      setResumoDist(d ?? null)
      if (d?.cStat === '656') {
        await registrarBloqueio656()
        showToast('erro', `SEFAZ: [656] ${d.xMotivo || 'Consumo indevido'} · aguarde cerca de 1h para nova tentativa.`)
        return
      }
      await limparBloqueioSeHouver()
      showToast(
        'ok',
        d
          ? `SEFAZ: [${d.cStat}] ${d.xMotivo || 'OK'} · ultNSU ${d.ultNSU} · maxNSU ${d.maxNSU}`
          : 'Resposta recebida da SEFAZ.',
      )
    } catch (err) {
      showToast('erro', err instanceof Error ? err.message : 'Erro ao chamar Distribuição DFe.')
    } finally {
      setIsLoading(false)
      onLoadingStateChange({ type: null })
      if (window.electron?.app) window.electron.app.setBusy(false)
    }
  }

  const escolherPasta = useCallback(async () => {
    if (!isElectron) return
    const p = await window.electron.fs.selecionarPasta()
    if (p) setPastaRaiz(p)
  }, [isElectron])

  const atualizarEstadoNsu = useCallback(async () => {
    if (!isElectron || !pastaRaiz.trim() || cnpj.replace(/\D/g, '').length !== 14) {
      setUltNsuPersistido(null)
      return
    }
    const r = await window.electron.nfe.distDfeEstado(pastaRaiz.trim(), cnpj)
    if (r.ok && r.ultNSU) setUltNsuPersistido(r.ultNSU)
    else setUltNsuPersistido(null)
  }, [isElectron, pastaRaiz, cnpj])

  const atualizarChavesSemProc = useCallback(async () => {
    if (!isElectron || !pastaRaiz.trim() || cnpj.replace(/\D/g, '').length !== 14) {
      setChavesSemProc(null)
      return
    }
    const r = await window.electron.nfe.listarChavesSemProc(pastaRaiz.trim(), cnpj)
    if (r.ok) setChavesSemProc(r.total ?? r.chaves?.length ?? 0)
    else setChavesSemProc(null)
  }, [isElectron, pastaRaiz, cnpj])

  useEffect(() => {
    if (modo === 'sincronizacao' || modo === 'arquivos-salvos') {
      void atualizarEstadoNsu()
      void atualizarChavesSemProc()
    }
  }, [modo, atualizarEstadoNsu, atualizarChavesSemProc])

  async function executarPortalBaixar() {
    if (!isElectron) return
    if (!pastaRaiz.trim()) {
      showToast('erro', 'Selecione a pasta do eFis onde os XMLs serão gravados.')
      return
    }
    if (cnpj.replace(/\D/g, '').length !== 14) {
      showToast('erro', 'Informe o CNPJ com 14 dígitos.')
      return
    }
    setPortalRodando(true)
    setLogPortal([])
    onLoadingStateChange({
      type: 'request',
      label: 'Portal Nacional: resolva o captcha em cada nota (janela aberta)…',
    })
    if (window.electron?.app) window.electron.app.setBusy(true)
    try {
      const r = await window.electron.nfe.portalBaixar({
        pastaRaiz: pastaRaiz.trim(),
        cnpj14: cnpj.replace(/\D/g, ''),
      })
      if (r.log?.length) setLogPortal((prev) => [...prev, ...r.log])
      if (!r.ok) {
        showToast('erro', r.xMotivo ?? 'Falha no Portal Nacional.')
        return
      }
      showToast(
        r.cancelado ? 'info' : 'ok',
        `Portal: ${r.salvos} XML(s) completos salvos · ${r.ignorados} já existiam · ${r.falhas} falhas${r.cancelado ? ' (cancelado)' : ''}.`,
      )
      await atualizarChavesSemProc()
    } catch (err) {
      showToast('erro', err instanceof Error ? err.message : 'Erro no download pelo Portal Nacional.')
    } finally {
      setPortalRodando(false)
      onLoadingStateChange({ type: null })
      if (window.electron?.app) window.electron.app.setBusy(false)
    }
  }

  async function cancelarPortal() {
    if (!isElectron) return
    try {
      await window.electron.nfe.portalCancelar()
      showToast('info', 'Cancelamento solicitado — a janela do portal será fechada.')
    } catch {
      showToast('erro', 'Não foi possível cancelar.')
    }
  }

  async function executarBuscarProcFaltantes() {
    if (!isElectron) return
    if (!certOk) {
      showToast('erro', 'Configure o certificado.')
      return
    }
    if (!pastaRaiz.trim()) {
      showToast('erro', 'Selecione a pasta do eFis onde os XMLs serão gravados.')
      return
    }
    if (cnpj.replace(/\D/g, '').length !== 14) {
      showToast('erro', 'Informe o CNPJ com 14 dígitos.')
      return
    }
    setBuscarProcRodando(true)
    setLogBuscarProc([])
    onLoadingStateChange({ type: 'request', label: 'Consultando notas sem XML completo (SEFAZ-SP)…' })
    if (window.electron?.app) window.electron.app.setBusy(true)
    try {
      const r = await window.electron.nfe.buscarProcFaltantes(certificateState as never, {
        pastaRaiz: pastaRaiz.trim(),
        cnpj14: cnpj.replace(/\D/g, ''),
        tpAmb: '1',
        ambienteEndpoint: 'producao',
        maxConsultas: 40,
      })
      if (r.log?.length) setLogBuscarProc((prev) => [...prev, ...r.log])
      if (!r.ok) {
        showToast('erro', r.xMotivo ?? 'Falha ao buscar XML completo.')
        return
      }
      if (r.salvos > 0) {
        showToast(
          'ok',
          `${r.salvos} XML(s) completo(s) salvos · ${r.semProcNaResposta} autorizadas sem XML (use Portal ou Importar saída) · ${r.falhas} falhas.`,
        )
      } else if (r.semProcNaResposta > 0) {
        showToast(
          'info',
          `SEFAZ-SP confirmou ${r.semProcNaResposta} nota(s), mas sem XML completo (comum em saída). Use o Passo 3 (Portal Nacional) ou a aba Importar saída.`,
        )
      } else {
        showToast(
          'ok',
          `Consulta concluída: ${r.salvos} salvos · ${r.semProcNaResposta} sem XML · ${r.falhas} falhas (${r.candidatos} candidatas).`,
        )
      }
      await atualizarChavesSemProc()
    } catch (err) {
      showToast('erro', err instanceof Error ? err.message : 'Erro ao buscar XML completo.')
    } finally {
      setBuscarProcRodando(false)
      onLoadingStateChange({ type: null })
      if (window.electron?.app) window.electron.app.setBusy(false)
    }
  }

  async function executarSincronizacao() {
    if (!isElectron) return
    if (!certOk) {
      showToast('erro', 'Configure o certificado.')
      return
    }
    if (!pastaRaiz.trim()) {
      showToast('erro', 'Selecione a pasta do eFis onde os XMLs serão gravados.')
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
        'O CNPJ informado difere do CNPJ do certificado selecionado. Use o mesmo CNPJ do certificado para sincronizar.'
      )
      return
    }
    if (!/^\d{2}$/.test(cUFAutor.replace(/\D/g, ''))) {
      showToast('erro', 'UF do autor inválida (use 2 dígitos, ex.: 35 = SP).')
      return
    }

    setLogSync([])
    setSyncRodando(true)
    onLoadingStateChange({ type: 'request', label: 'Sincronizando documentos da SEFAZ…' })
    window.electron.app.setBusy(true)
    try {
      const r = await window.electron.nfe.syncDistDfe(certificateState as never, {
        pastaRaiz: pastaRaiz.trim(),
        cnpj14: cnpj.replace(/\D/g, ''),
        cUFAutor: cUFAutor.replace(/\D/g, ''),
        reiniciarNsu,
        filtroPapel,
      })
      if (r.ok) {
        await limparBloqueioSeHouver()
        const partFiltrados =
          r.totalFiltrados > 0 ? `, ${r.totalFiltrados} não gravados (filtro)` : ''
        const t = r.salvosPorTipo
        const partTipos = t
          ? ` [completos ${t.procNFe}, resumos ${t.resNFe}, eventos ${t.evento}, outros ${t.outro}]`
          : ''
        showToast(
          'ok',
          `Sincronização concluída: ${r.totalSalvos} XML(s) novos, ${r.totalIgnorados} já existentes${partFiltrados}${partTipos} (${r.lotes} lote(s)).`,
        )
        await atualizarChavesSemProc()
      } else {
        const base = r.xMotivo ?? 'Falha na sincronização.'
        if (base.includes('656')) await registrarBloqueio656()
        showToast(
          'erro',
          base.includes('656')
            ? `${base} Aguarde ~1 h e evite “recomeçar a fila do zero” sem motivo.`
            : base
        )
      }
      await atualizarEstadoNsu()
    } catch (err) {
      showToast('erro', err instanceof Error ? err.message : 'Erro na sincronização.')
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
      const r = await window.electron.nfe.listarXmlsSalvos(pastaRaiz.trim(), cnpj.replace(/\D/g, ''), {
        ano: filtroAno.trim() || undefined,
        mes: filtroMes.trim() || undefined,
      })
      if (!r.ok) {
        showToast('erro', r.xMotivo ?? 'Falha ao listar arquivos.')
        return
      }
      setListaArquivos(r.arquivos ?? [])
      showToast('info', `${r.total ?? 0} arquivo(s) encontrado(s).`)
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
    } finally {
      onLoadingStateChange({ type: null })
      if (window.electron?.app) window.electron.app.setBusy(false)
    }
  }

  const btnModo = (id: ModoPainel, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setModo(id)}
      className={[
        'px-3 py-1.5 rounded text-xs font-medium no-drag border transition-colors',
        modo === id
          ? 'border-[var(--teal-dim)] bg-[var(--teal-glow)] text-[var(--teal)]'
          : 'border-[var(--border)] bg-[var(--bg-raised)] text-[var(--text-secondary)]',
      ].join(' ')}
    >
      {label}
    </button>
  )

  return (
    <div className="fade-in h-full overflow-auto p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-1">Baixar documentos da NF-e</h2>
        <p className="text-sm text-[var(--text-secondary)] max-w-3xl">
          Sincronize a fila → tente o XML completo → complete no Portal (saída) → depois use Relatório ou Importar saída.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {btnModo('sincronizacao', '1. Sincronizar fila')}
        {btnModo('arquivos-salvos', 'Arquivos na pasta')}
        {btnModo('xml-livre', 'Avançado (XML)')}
      </div>

      {certId && (
        <div className={`p-3 ${SURFACE_CARD_CLASS} ${bloqueioAtivo ? 'border border-amber-500/40' : ''}`}>
          {bloqueioAtivo ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-amber-700 dark:text-amber-300/90">
                Consulta temporariamente bloqueada (código 656). Tempo restante estimado:
                {' '}
                <strong>{formatarTempoRestante((nfeBlockTimer?.retryAtMs ?? 0) - agoraMs)}</strong>
                {' '}— aguarde ~1 h antes de nova tentativa.
              </span>
            </div>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">
              Sem bloqueio ativo para o certificado atual.
            </p>
          )}
        </div>
      )}

      {modo === 'sincronizacao' && (
        <div className={`p-4 ${SURFACE_CARD_CLASS} space-y-4`}>
          <div className="rounded border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-2 text-[11px] text-[var(--text-secondary)] space-y-1 max-w-3xl">
            <p className="font-medium text-[var(--text-primary)]">O que cada arquivo significa</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>
                <strong>Resumo</strong> — autorização registrada (sem itens da nota).
              </li>
              <li>
                <strong>Evento</strong> — ciência, cancelamento, CC-e etc. <strong>Não</strong> é a nota completa.
              </li>
              <li>
                <strong>XML completo</strong> — nota com itens (o que o Relatório precisa).
              </li>
            </ul>
          </div>

          <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-[var(--text-secondary)] space-y-1 max-w-3xl">
            <p>
              <strong className="text-[var(--text-primary)]">Atenção:</strong> várias sincronizações seguidas podem
              bloquear a consulta por cerca de <strong>1 hora</strong>.
            </p>
            <p>
              <strong className="text-[var(--text-primary)]">Notas de saída:</strong> a fila sozinha quase nunca traz o
              XML completo. Use os passos 2–3 ou a aba <strong>Importar saída</strong> (ERP).
            </p>
          </div>

          {(chavesSemProc ?? 0) > 0 && (
            <div className="rounded border border-teal-500/40 bg-teal-500/10 px-3 py-2 text-[11px] text-[var(--text-secondary)] max-w-3xl space-y-1">
              <p className="font-medium text-[var(--text-primary)]">
                {chavesSemProc} nota(s) sem XML completo nesta pasta
              </p>
              <ol className="list-decimal pl-4 space-y-0.5">
                <li>Tente o Passo 2 (SEFAZ-SP) — sem captcha.</li>
                <li>Se não vier o XML, use o Passo 3 (Portal Nacional) ou Importar saída.</li>
                <li>Depois: módulo Relatório → Relatório Notas.</li>
              </ol>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Pasta do eFis
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void escolherPasta()}
                className={`px-3 py-2 text-sm no-drag ${BUTTON_SUBTLE_CLASS}`}
              >
                Escolher pasta do eFis
              </button>
              <span
                className="text-xs text-[var(--text-muted)] truncate max-w-[min(100%,320px)]"
                title={pastaRaiz || undefined}
              >
                {pastaRaiz || 'Nenhuma pasta selecionada'}
              </span>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] max-w-3xl">
              Ex.: <code className="text-[10px]">C:\XMLs\Empresa</code> — o app grava em{' '}
              <code className="text-[10px]">pasta\CNPJ\ano\mês</code>. Aceita a pasta pai ou a pasta do CNPJ. Use a{' '}
              <strong>mesma pasta</strong> em Importar saída e no Relatório.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">CNPJ</label>
              <input
                type="text"
                inputMode="numeric"
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value.replace(/\D/g, '').slice(0, 14))}
                className={INPUT_BASE_CLASS}
                placeholder="00000000000000"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
                UF do autor (código IBGE)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={cUFAutor}
                onChange={(e) => setCUFAutor(e.target.value.replace(/\D/g, '').slice(0, 2))}
                className={INPUT_BASE_CLASS}
                title="35 = São Paulo"
              />
              <p className="text-[10px] text-[var(--text-muted)] mt-1">35 = SP</p>
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
              O que gravar na pasta
            </label>
            <select
              value={filtroPapel}
              onChange={(e) => setFiltroPapel(e.target.value as FiltroPapelDistDfe)}
              disabled={syncRodando}
              className={`${INPUT_BASE_CLASS} max-w-xl`}
            >
              <option value="todos">Tudo que a fila devolver</option>
              <option value="emitente">
                Saída — documentos em que o CNPJ é emitente (não traz o XML completo sozinho)
              </option>
              <option value="destinatario">
                Entrada — destinatário (melhor caminho para XML completo via fila)
              </option>
            </select>
          </div>

          <label className="flex items-start gap-2 text-xs text-[var(--text-secondary)] cursor-pointer no-drag">
            <input
              type="checkbox"
              checked={reiniciarNsu}
              onChange={(e) => setReiniciarNsu(e.target.checked)}
              className="rounded border-[var(--border)] mt-0.5"
            />
            <span>
              Recomeçar a fila do zero (só se necessário — aumenta chance de bloqueio).
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
            <span>
              Ponto de continuação da fila:{' '}
              {ultNsuPersistido ?? '— (ainda não há estado ou pasta inválida)'}
            </span>
            <button
              type="button"
              onClick={() => void atualizarEstadoNsu()}
              className="text-[var(--teal)] underline no-drag"
            >
              Atualizar leitura
            </button>
          </div>

          <div className="rounded border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-3 space-y-2 max-w-3xl">
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              Passo 1 — Buscar na fila (chaves, resumos e eventos)
            </p>
            <p className="text-[11px] text-[var(--text-secondary)]">
              Continua de onde parou e não sobrescreve arquivos já salvos.
            </p>
            <button
              type="button"
              onClick={() => void executarSincronizacao()}
              disabled={syncRodando || buscarProcRodando || bloqueioAtivo}
              className={`flex items-center gap-2 px-4 py-2 no-drag ${BUTTON_PRIMARY_CLASS}`}
            >
              {syncRodando ? (
                <>
                  <Spinner /> Sincronizando…
                </>
              ) : (
                'Sincronizar agora'
              )}
            </button>
          </div>

          <div className="rounded border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-3 space-y-2 max-w-3xl">
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              Passo 2 — Tentar XML completo (SEFAZ-SP, sem captcha)
            </p>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Consulta até 40 notas sem XML completo
              {chavesSemProc != null ? ` (${chavesSemProc} candidata(s) agora)` : ''}. Em notas de{' '}
              <strong>saída</strong>, a SEFAZ costuma confirmar a autorização sem devolver o XML — aí vá ao Passo 3.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void atualizarChavesSemProc()}
                disabled={buscarProcRodando || syncRodando}
                className={`text-xs no-drag ${BUTTON_TEAL_GHOST_CLASS}`}
              >
                Contar notas sem XML completo
              </button>
              <button
                type="button"
                onClick={() => void executarBuscarProcFaltantes()}
                disabled={buscarProcRodando || syncRodando || bloqueioAtivo}
                className={`flex items-center gap-2 text-sm no-drag ${BUTTON_SUBTLE_CLASS}`}
              >
                {buscarProcRodando ? (
                  <>
                    <Spinner /> Consultando SP…
                  </>
                ) : (
                  'Buscar XML completo (até 40)'
                )}
              </button>
            </div>
            {logBuscarProc.length > 0 && (
              <details className="rounded border border-[var(--border)] bg-[var(--bg-deep)]">
                <summary className="px-3 py-2 text-xs cursor-pointer text-[var(--text-secondary)]">
                  Log da consulta por chave
                </summary>
                <pre className="px-3 pb-3 text-[11px] font-mono whitespace-pre-wrap break-all max-h-40 overflow-auto text-[var(--text-muted)]">
                  {logBuscarProc.join('\n')}
                </pre>
              </details>
            )}
          </div>

          <div className="rounded border border-teal-500/40 bg-teal-500/10 px-3 py-3 space-y-2 max-w-3xl">
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              Passo 3 — Completar no Portal Nacional (saída)
            </p>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Baixa o XML completo no site da Fazenda com as chaves já na pasta
              {chavesSemProc != null ? ` (${chavesSemProc} sem XML completo)` : ''}. Requisito:{' '}
              <strong>certificado A1 no Windows</strong>. Até 20 notas por execução; em cada uma marque &quot;Sou
              humano&quot; — o resto é automático.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void executarPortalBaixar()}
                disabled={portalRodando || syncRodando || buscarProcRodando}
                className={`flex items-center gap-2 text-sm no-drag ${
                  (chavesSemProc ?? 0) > 0 ? BUTTON_PRIMARY_CLASS : BUTTON_SUBTLE_CLASS
                }`}
              >
                {portalRodando ? (
                  <>
                    <Spinner /> Portal aberto — resolva o captcha…
                  </>
                ) : (
                  'Baixar pelo Portal Nacional (até 20)'
                )}
              </button>
              {portalRodando && (
                <button
                  type="button"
                  onClick={() => void cancelarPortal()}
                  className={`text-sm no-drag ${BUTTON_SUBTLE_CLASS}`}
                >
                  Cancelar
                </button>
              )}
            </div>
            {logPortal.length > 0 && (
              <details open className="rounded border border-[var(--border)] bg-[var(--bg-deep)]">
                <summary className="px-3 py-2 text-xs cursor-pointer text-[var(--text-secondary)]">
                  Log do Portal Nacional
                </summary>
                <pre className="px-3 pb-3 text-[11px] font-mono whitespace-pre-wrap break-all max-h-48 overflow-auto text-[var(--text-muted)]">
                  {logPortal.join('\n')}
                </pre>
              </details>
            )}
          </div>

          <p className="text-[11px] text-[var(--text-muted)] max-w-3xl">
            Passo 4 — Com os XMLs completos na pasta, abra o módulo <strong>Relatório</strong> → Relatório Notas. Se o
            ERP já tiver os arquivos, prefira a aba <strong>Importar saída</strong> (sem captcha).
          </p>

          {logSync.length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] uppercase text-[var(--text-muted)] mb-1">Log da sincronização</p>
              <pre className="text-[11px] font-mono whitespace-pre-wrap break-all max-h-56 overflow-auto p-2 rounded border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-secondary)]">
                {logSync.join('\n')}
              </pre>
            </div>
          )}
        </div>
      )}

      {modo === 'arquivos-salvos' && (
        <div className={`p-4 ${SURFACE_CARD_CLASS} space-y-3`}>
          <p className="text-xs text-[var(--text-secondary)]">
            Lista XMLs já salvos em <code className="text-[11px]">CNPJ/ano/mês/*.xml</code>. Filtre por ano e/ou mês
            (opcional).
          </p>
          <div className="flex flex-wrap gap-2 items-end">
            <button
              type="button"
              onClick={() => void escolherPasta()}
              className={`px-3 py-2 text-sm no-drag ${BUTTON_SUBTLE_CLASS}`}
            >
              Pasta do eFis
            </button>
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
            <button
              type="button"
              onClick={() => void carregarListaArquivos()}
              className={`px-3 py-2 text-sm no-drag ${BUTTON_PRIMARY_CLASS}`}
            >
              Listar
            </button>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            {pastaRaiz || 'Selecione a pasta do eFis'} · CNPJ{' '}
            {cnpj.replace(/\D/g, '').length === 14 ? cnpj : '—'}
          </p>

          <div className="max-h-64 overflow-auto border border-[var(--border)] rounded">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[var(--bg-raised)] text-[var(--text-muted)]">
                <tr>
                  <th className="text-left p-2">Ano/Mês</th>
                  <th className="text-left p-2">Chave / arquivo</th>
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
                        className="text-[var(--teal)] underline no-drag"
                      >
                        Ver XML
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {listaArquivos.length > 200 && (
              <p className="p-2 text-[10px] text-[var(--text-muted)]">
                Mostrando 200 de {listaArquivos.length}.
              </p>
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
      )}

      {modo === 'xml-livre' && (
        <>
          <p className="text-xs text-[var(--text-secondary)]">
            Uso avançado: cole o XML da mensagem DistDFe (corpo da consulta). Preferível usar{' '}
            <strong>1. Sincronizar fila</strong>.
          </p>
          <textarea
            value={xml}
            onChange={(e) => setXml(e.target.value)}
            className={`${INPUT_BASE_CLASS} min-h-[180px] font-mono text-xs w-full resize-y`}
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => void enviarPayload(xml)}
            disabled={isLoading}
            className={`flex items-center gap-2 px-4 py-2 no-drag ${BUTTON_PRIMARY_CLASS}`}
          >
            {isLoading ? (
              <>
                <Spinner /> Enviando…
              </>
            ) : (
              'Enviar'
            )}
          </button>
        </>
      )}

      {resumoDist !== null && modo === 'xml-livre' && (
        <div className={`p-3 ${SURFACE_CARD_CLASS} border-l-2 border-[var(--teal-dim)]`}>
          <p className="text-[10px] uppercase text-[var(--text-muted)] mb-1">Resumo da resposta</p>
          <p className="text-sm text-[var(--text-primary)]">
            <strong>Código {resumoDist.cStat}</strong>
            {' · '}
            <span className="font-mono text-[11px]">fila {resumoDist.ultNSU}</span>
            {' · '}
            <span className="font-mono text-[11px]">máx. {resumoDist.maxNSU}</span>
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">{resumoDist.xMotivo || '—'}</p>
        </div>
      )}

      {resposta !== null && modo === 'xml-livre' && (
        <div className={`p-4 ${SURFACE_CARD_CLASS} flex-1 min-h-0 flex flex-col`}>
          <p className="text-xs text-[var(--text-muted)] mb-2">Resposta (XML bruto)</p>
          <pre className="text-xs font-mono whitespace-pre-wrap break-all overflow-auto max-h-[420px] text-[var(--text-primary)]">
            {resposta || '—'}
          </pre>
        </div>
      )}
    </div>
  )
}
