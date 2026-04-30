'use client'

import { useCallback, useState } from 'react'
import type { ToastVariant, XmlRetencaoLinha } from '@/types/nfce-app'
import { useIsElectron } from '@/hooks/useIsElectron'

export interface XmlRetencaoPanelProps {
  showToast: (variant: ToastVariant, message: string) => void
}

export function XmlRetencaoPanel({ showToast }: XmlRetencaoPanelProps) {
  const { isElectron } = useIsElectron()
  const [caminhos, setCaminhos] = useState<string[]>([])
  const [linhas, setLinhas] = useState<XmlRetencaoLinha[]>([])
  const [isAnalisando, setIsAnalisando] = useState(false)
  const [isExportando, setIsExportando] = useState(false)
  const [isGerandoRelatorio, setIsGerandoRelatorio] = useState(false)

  const analisarLista = useCallback(
    async (lista: string[]) => {
      if (!isElectron) {
        setLinhas([])
        return
      }
      if (lista.length === 0) {
        setLinhas([])
        return
      }
      setIsAnalisando(true)
      try {
        const resp = await window.electron.xmlRetencao.analisar(lista)
        if (!resp.ok) {
          setLinhas([])
          showToast('erro', resp.xMotivo ?? 'Falha ao analisar os XMLs.')
          return
        }
        setLinhas(resp.linhas ?? [])
      } catch (err) {
        setLinhas([])
        showToast('erro', err instanceof Error ? err.message : 'Erro ao analisar.')
      } finally {
        setIsAnalisando(false)
      }
    },
    [isElectron, showToast],
  )

  async function adicionarXmlsArquivos() {
    if (!isElectron) {
      showToast('erro', 'Disponível apenas no aplicativo desktop.')
      return
    }
    try {
      const selecionados = await window.electron.xmlRetencao.selecionarXmls()
      if (selecionados.length === 0) return
      const mesclado = [...new Set([...caminhos, ...selecionados])]
      if (mesclado.length > 280) {
        showToast('info', `Limite de 280 arquivos. Mantidos os primeiros 280 na lista.`)
        mesclado.length = 280
      }
      setCaminhos(mesclado)
      await analisarLista(mesclado)
    } catch (err) {
      showToast('erro', err instanceof Error ? err.message : 'Erro ao selecionar XMLs.')
    }
  }

  async function adicionarXmlsPasta() {
    if (!isElectron) {
      showToast('erro', 'Disponível apenas no aplicativo desktop.')
      return
    }
    try {
      const selecionados = await window.electron.xmlRetencao.selecionarPastaComXmls()
      if (selecionados.length === 0) return
      const mesclado = [...new Set([...caminhos, ...selecionados])]
      if (mesclado.length > 280) {
        showToast('info', `Limite de 280 arquivos. Mantidos os primeiros 280 na lista.`)
        mesclado.length = 280
      }
      setCaminhos(mesclado)
      await analisarLista(mesclado)
    } catch (err) {
      showToast('erro', err instanceof Error ? err.message : 'Erro ao selecionar pasta.')
    }
  }

  function limparLista() {
    setCaminhos([])
    setLinhas([])
  }

  async function exportarPastas() {
    if (!isElectron) {
      showToast('erro', 'Disponível apenas no aplicativo desktop.')
      return
    }
    if (caminhos.length === 0) {
      showToast('erro', 'Adicione pelo menos um XML.')
      return
    }
    const pastaDestino = await window.electron.fs.selecionarPasta()
    if (!pastaDestino) return
    setIsExportando(true)
    try {
      const resp = await window.electron.xmlRetencao.exportar(pastaDestino, caminhos)
      if (!resp.ok) {
        showToast('erro', resp.xMotivo ?? 'Falha ao exportar.')
        return
      }
      const res = resp.resumo
      const gruposOrdenados = Object.entries(res?.gruposRetencao ?? {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
      const resumoGrupos =
        gruposOrdenados.length > 0
          ? ` Grupos: ${gruposOrdenados.map(([k, v]) => `${k} (${v})`).join(', ')}.`
          : ''
      showToast(
        'ok',
        res
          ? `Copiados: ${res.comRetencao} com retenção, ${res.semRetencao} sem${
              res.invalidos > 0 ? `, ${res.invalidos} em invalidos` : ''
            }. Subpastas em: ${resp.pastaRaiz ?? pastaDestino}.${resumoGrupos}`
          : 'Exportação concluída.',
      )
    } catch (err) {
      showToast('erro', err instanceof Error ? err.message : 'Erro ao exportar.')
    } finally {
      setIsExportando(false)
    }
  }

  async function gerarRelatorioXlsx() {
    if (!isElectron) {
      showToast('erro', 'Disponível apenas no aplicativo desktop.')
      return
    }
    if (caminhos.length === 0) {
      showToast('erro', 'Adicione pelo menos um XML.')
      return
    }
    const pastaSaida = await window.electron.fs.selecionarPasta()
    if (!pastaSaida) return
    setIsGerandoRelatorio(true)
    try {
      const resp = await window.electron.xmlRetencao.gerarRelatorioXlsx(pastaSaida, caminhos)
      if (!resp.ok) {
        showToast('erro', resp.xMotivo ?? 'Falha ao gerar relatório.')
        return
      }
      showToast(
        'ok',
        `Relatório gerado (${resp.gerados ?? 0} linhas, ${resp.falhas ?? 0} falhas): ${resp.arquivo ?? 'arquivo salvo'}.`,
      )
    } catch (err) {
      showToast('erro', err instanceof Error ? err.message : 'Erro ao gerar relatório.')
    } finally {
      setIsGerandoRelatorio(false)
    }
  }

  const comCount = linhas.filter((l) => l.temRetencao === true).length
  const semCount = linhas.filter((l) => l.temRetencao === false).length
  const invCount = linhas.filter((l) => l.temRetencao === null).length

  function rotuloLinha(row: XmlRetencaoLinha): string {
    if (row.temRetencao === true) {
      const pct = row.percentualRetencao?.trim()
      return pct ? `Com retenção (${pct}%)` : 'Com retenção (percentual não identificado)'
    }
    if (row.temRetencao === false) return 'Sem retenção'
    return row.erro ?? 'Inválido / não reconhecido'
  }

  function corRotulo(row: XmlRetencaoLinha): string {
    if (row.temRetencao === true) return 'text-[var(--teal)]'
    if (row.temRetencao === false) return 'text-[var(--text-secondary)]'
    return 'text-[var(--text-muted)]'
  }

  return (
    <div className="fade-in flex flex-col h-full overflow-hidden">
      <div className="p-6 pb-4 border-b border-[var(--border)] shrink-0">
        <h2 className="text-xl font-semibold mb-2 text-[var(--text-primary)]">
          Classificação por retenção (XML)
        </h2>

        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Anexe arquivos de NF-e / NFC-e. A verificação prioriza o campo{' '}
          <span className="font-mono text-[11px]">infCpl</span> (ex.: RETENCAO DE 1,20%) e agrupa retenções por
          percentual em <span className="font-mono text-[11px]">retencao/1,20_porcento</span>. XML sem retenção vai
          para <span className="font-mono text-[11px]">sem_retencao</span>.
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void adicionarXmlsArquivos()}
            disabled={isAnalisando}
            className="py-2.5 px-4 rounded text-sm font-semibold no-drag bg-[var(--bg-raised)] border border-[var(--border)] text-[var(--text-primary)] disabled:opacity-60"
          >
            Adicionar XMLs (arquivos)
          </button>
          <button
            type="button"
            onClick={() => void adicionarXmlsPasta()}
            disabled={isAnalisando}
            className="py-2.5 px-4 rounded text-sm font-semibold no-drag bg-[var(--bg-raised)] border border-[var(--border)] text-[var(--text-primary)] disabled:opacity-60"
          >
            Adicionar pasta de XMLs
          </button>
          <button
            type="button"
            onClick={limparLista}
            disabled={caminhos.length === 0 || isExportando || isGerandoRelatorio}
            className="py-2.5 px-4 rounded text-sm font-semibold no-drag bg-transparent border border-[var(--border)] text-[var(--text-secondary)] disabled:opacity-40"
          >
            Limpar
          </button>
          <button
            type="button"
            onClick={() => void exportarPastas()}
            disabled={isExportando || isGerandoRelatorio || caminhos.length === 0 || isAnalisando}
            className="flex items-center justify-center py-2.5 px-5 rounded text-sm font-semibold no-drag bg-[var(--teal-glow)] border border-[var(--teal-dim)] text-[var(--teal)] disabled:opacity-60"
          >
            {isExportando ? 'Exportando…' : 'Exportar (escolher pasta)'}
          </button>
          <button
            type="button"
            onClick={() => void gerarRelatorioXlsx()}
            disabled={isGerandoRelatorio || isExportando || caminhos.length === 0 || isAnalisando}
            className="flex items-center justify-center py-2.5 px-5 rounded text-sm font-semibold no-drag bg-[var(--bg-raised)] border border-[var(--border)] text-[var(--text-primary)] disabled:opacity-60"
          >
            {isGerandoRelatorio ? 'Gerando XLSX…' : 'Gerar relatório XLSX'}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded border border-[var(--border)] bg-[var(--bg-raised)] p-3">
            <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-1">
              Exportação
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              A pasta é escolhida no clique de <span className="font-mono">Exportar</span>.
            </p>
          </div>
          <div className="rounded border border-[var(--border)] bg-[var(--bg-raised)] p-3">
            <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-1">
              Resumo da análise
            </p>
            {isAnalisando ? (
              <p className="text-xs text-[var(--text-muted)]">Analisando…</p>
            ) : linhas.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">—</p>
            ) : (
              <p className="text-xs text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--teal)]">{comCount}</span> com retenção ·{' '}
                <span className="font-semibold text-[var(--text-primary)]">{semCount}</span> sem retenção
                {invCount > 0 ? (
                  <>
                    {' '}
                    · <span className="font-semibold text-[var(--text-muted)]">{invCount}</span> problema(s)
                  </>
                ) : null}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4 min-h-0">
        {!isElectron ? (
          <p className="text-sm text-[var(--text-muted)]">Use o aplicativo desktop para esta funcionalidade.</p>
        ) : caminhos.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            Adicione XMLs por arquivos ou por pasta para pré-visualizar a classificação.
          </p>
        ) : isAnalisando && linhas.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Analisando XMLs…</p>
        ) : (
          <div className="rounded border border-[var(--border)] bg-[var(--bg-raised)] overflow-hidden flex flex-col max-h-[min(60vh,480px)]">
            <div className="px-3 py-2 border-b border-[var(--border)] shrink-0 flex justify-between items-center gap-2">
              <p className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
                Lista ({linhas.length || caminhos.length})
              </p>
              {isAnalisando && linhas.length > 0 ? (
                <span className="text-[11px] text-[var(--text-muted)]">Atualizando…</span>
              ) : null}
            </div>
            <div className="overflow-auto divide-y divide-[var(--border)]">
              {linhas.map((cell) => (
                <div
                  key={`${cell.caminhoOriginal}`}
                  className="px-3 py-2 grid grid-cols-[1fr,minmax(8rem,auto)] gap-3 text-xs items-center"
                >
                  <span className="font-mono truncate text-[var(--text-primary)]" title={cell.caminhoOriginal}>
                    {cell.nome}
                  </span>
                  <span className={`text-right font-medium ${corRotulo(cell)}`}>{rotuloLinha(cell)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mt-4 text-[11px] text-[var(--text-muted)]">
          Exportação cria também <span className="font-mono text-[11px]">invalidos</span> quando o arquivo não é um
          XML de NF-e/NFC-e válido ou há erro de leitura. Se houver retenção sem percentual explícito, o destino é{' '}
          <span className="font-mono text-[11px]">retencao/percentual_nao_identificado</span>.
        </p>
      </div>
    </div>
  )
}
