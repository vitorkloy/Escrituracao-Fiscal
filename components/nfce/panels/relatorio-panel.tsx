'use client'

import { useState } from 'react'
import type { ToastVariant } from '@/types/nfce-app'
import { useIsElectron } from '@/hooks/useIsElectron'

export interface RelatorioPanelProps {
  showToast: (variant: ToastVariant, message: string) => void
}

export function RelatorioPanel({ showToast }: RelatorioPanelProps) {
  const { isElectron } = useIsElectron()
  const [pasta, setPasta] = useState<string>('')
  const [isGerando, setIsGerando] = useState(false)
  const [isGerandoNotas, setIsGerandoNotas] = useState(false)
  const [isCarregandoXmls, setIsCarregandoXmls] = useState(false)
  const [xmlArquivos, setXmlArquivos] = useState<string[]>([])
  const [xmlCancelados, setXmlCancelados] = useState<string[]>([])
  const [qtdXmlFormatoLegado, setQtdXmlFormatoLegado] = useState(0)
  const [qtdXmlFormatoChave44, setQtdXmlFormatoChave44] = useState(0)
  const [xmlsNotas, setXmlsNotas] = useState<string[]>([])
  const [totalXmlArvore, setTotalXmlArvore] = useState(0)
  const [xmlsIbsCbs, setXmlsIbsCbs] = useState<string[]>([])
  const [totalXmlIbsCbs, setTotalXmlIbsCbs] = useState(0)
  const [isGerandoIbsCbs, setIsGerandoIbsCbs] = useState(false)
  const [resumoIbsCbs, setResumoIbsCbs] = useState<{
    arquivo: string
    notas: number
    itens: number
    comDivergencia: number
    totaisDivergentes: number
    versao: string
    amostra: Array<{ chave: string; item: string; divergencias: string }>
  } | null>(null)
  const [arquivoEfd, setArquivoEfd] = useState('')
  const [isGerandoEfd, setIsGerandoEfd] = useState(false)
  const [isCarregandoEfd, setIsCarregandoEfd] = useState(false)
  const [previewEfd, setPreviewEfd] = useState<{
    nome: string
    cnpj: string
    uf: string
    dtIni: string
    dtFin: string
    documentos: number
    aprovados: number
    cancelados: number
    itensC170: number
    analiticosC190: number
  } | null>(null)

  async function carregarPreviewXmls(pastaAlvo: string) {
    if (!isElectron || !pastaAlvo) {
      setXmlArquivos([])
      setXmlCancelados([])
      setQtdXmlFormatoLegado(0)
      setQtdXmlFormatoChave44(0)
      setXmlsNotas([])
      setTotalXmlArvore(0)
      setXmlsIbsCbs([])
      setTotalXmlIbsCbs(0)
      return
    }
    setIsCarregandoXmls(true)
    try {
      const [resp, respNotas, respIbs] = await Promise.all([
        window.electron.relatorio.listarXmls(pastaAlvo),
        window.electron.relatorio.listarXmlsNotas(pastaAlvo),
        window.electron.relatorio.listarXmlsIbsCbs(pastaAlvo),
      ])
      if (!resp.ok) {
        setXmlArquivos([])
        setXmlCancelados([])
        setQtdXmlFormatoLegado(0)
        setQtdXmlFormatoChave44(0)
        showToast('erro', resp.xMotivo ?? 'Falha ao listar XMLs.')
      } else {
        setXmlArquivos(resp.arquivos ?? [])
        setXmlCancelados(resp.cancelados ?? [])
        setQtdXmlFormatoLegado(resp.totalFormatoLegado ?? 0)
        setQtdXmlFormatoChave44(resp.totalFormatoChave44 ?? 0)
      }

      if (!respNotas.ok) {
        setXmlsNotas([])
        setTotalXmlArvore(0)
        showToast('erro', respNotas.xMotivo ?? 'Falha ao listar XMLs para relatório Notas.')
      } else {
        setXmlsNotas(respNotas.arquivos ?? [])
        setTotalXmlArvore(respNotas.totalXml ?? 0)
      }

      if (!respIbs.ok) {
        setXmlsIbsCbs([])
        setTotalXmlIbsCbs(0)
      } else {
        setXmlsIbsCbs(respIbs.arquivos ?? [])
        setTotalXmlIbsCbs(respIbs.totalXml ?? 0)
      }
    } catch (err) {
      setXmlArquivos([])
      setXmlCancelados([])
      setQtdXmlFormatoLegado(0)
      setQtdXmlFormatoChave44(0)
      setXmlsNotas([])
      setTotalXmlArvore(0)
      setXmlsIbsCbs([])
      setTotalXmlIbsCbs(0)
      showToast('erro', err instanceof Error ? err.message : 'Erro ao listar XMLs.')
    } finally {
      setIsCarregandoXmls(false)
    }
  }

  async function selecionarPasta() {
    if (!isElectron) return
    try {
      const r = await window.electron.fs.selecionarPasta()
      if (r) {
        setPasta(r)
        await carregarPreviewXmls(r)
      }
    } catch (err) {
      showToast('erro', err instanceof Error ? err.message : 'Erro ao selecionar pasta.')
    }
  }

  async function gerarXlsx() {
    if (!isElectron) {
      showToast('erro', 'Funcionalidade disponível apenas no aplicativo desktop.')
      return
    }
    if (!pasta) {
      showToast('erro', 'Selecione a pasta onde estão os XMLs.')
      return
    }

    setIsGerando(true)
    try {
      const resp = await window.electron.relatorio.gerarComparativoXlsx(pasta)
      if (!resp.ok) {
        showToast('erro', resp.xMotivo ?? 'Falha ao gerar o XLSX.')
        return
      }

      const gerados = resp.gerados ?? 0
      const aprovados = resp.aprovados ?? 0
      const cancelados = resp.cancelados ?? 0
      const falhas = resp.falhas ?? 0

      showToast(
        'ok',
        falhas > 0
          ? `Relatórios gerados (${gerados} XMLs: ${aprovados} aprovados, ${cancelados} cancelados, ${falhas} falha(s)).`
          : `Relatórios gerados com sucesso (${aprovados} aprovados, ${cancelados} cancelados).`
      )
    } catch (err) {
      showToast('erro', err instanceof Error ? err.message : 'Erro ao gerar XLSX.')
    } finally {
      setIsGerando(false)
    }
  }

  async function selecionarEfd() {
    if (!isElectron) return
    try {
      const r = await window.electron.relatorio.selecionarEfd()
      if (!r) return
      setArquivoEfd(r)
      setIsCarregandoEfd(true)
      setPreviewEfd(null)
      try {
        const resp = await window.electron.relatorio.previewEfd(r)
        if (!resp.ok) {
          showToast('erro', resp.xMotivo ?? 'Falha ao ler o EFD.')
          return
        }
        setPreviewEfd(resp.resumo ?? null)
      } catch (err) {
        showToast('erro', err instanceof Error ? err.message : 'Erro ao ler o EFD.')
      } finally {
        setIsCarregandoEfd(false)
      }
    } catch (err) {
      showToast('erro', err instanceof Error ? err.message : 'Erro ao selecionar o EFD.')
    }
  }

  async function gerarXlsxEfd() {
    if (!isElectron) {
      showToast('erro', 'Funcionalidade disponível apenas no aplicativo desktop.')
      return
    }
    if (!arquivoEfd) {
      showToast('erro', 'Selecione o arquivo EFD ICMS/IPI.')
      return
    }

    setIsGerandoEfd(true)
    try {
      const resp = await window.electron.relatorio.gerarXlsxEfd(arquivoEfd)
      if (!resp.ok) {
        showToast('erro', resp.xMotivo ?? 'Falha ao gerar o XLSX a partir do EFD.')
        return
      }
      const aprovados = resp.aprovados ?? 0
      const cancelados = resp.cancelados ?? 0
      const notas = resp.notas ?? 0
      const itens = resp.itens ?? 0
      const arquivo = resp.arquivo ?? (resp.arquivos ?? [])[0] ?? 'relatorio.xlsx'
      showToast(
        'ok',
        `EFD: ${aprovados} aprovado(s), ${cancelados} cancelado(s), ${notas} nota(s)/${itens} item(ns) → ${arquivo}.`
      )
    } catch (err) {
      showToast('erro', err instanceof Error ? err.message : 'Erro ao gerar XLSX do EFD.')
    } finally {
      setIsGerandoEfd(false)
    }
  }

  async function gerarNotasXlsx() {
    if (!isElectron) {
      showToast('erro', 'Funcionalidade disponível apenas no aplicativo desktop.')
      return
    }
    if (!pasta) {
      showToast('erro', 'Selecione a pasta onde estão os XMLs.')
      return
    }

    setIsGerandoNotas(true)
    try {
      const resp = await window.electron.relatorio.gerarNotasXlsx(pasta)
      if (!resp.ok) {
        showToast('erro', resp.xMotivo ?? 'Falha ao gerar o relatório Notas.')
        return
      }
      const notas = resp.notas ?? 0
      const itens = resp.itens ?? 0
      const falhas = resp.falhas ?? 0
      const ignorados = resp.ignorados?.length ?? 0
      const arquivo = resp.arquivo ?? 'relatorio_notas.xlsx'
      const diag = resp.diagnostico ? ` Diagnóstico: ${resp.diagnostico}.` : ''
      const extra =
        falhas > 0 || ignorados > 0
          ? ` (${falhas} falha(s), ${ignorados} arquivo(s) ignorado(s)/substituído(s)).`
          : '.'
      showToast('ok', `Relatório Notas: ${notas} nota(s), ${itens} item(ns) → ${arquivo}.${extra}${diag}`)
    } catch (err) {
      showToast('erro', err instanceof Error ? err.message : 'Erro ao gerar relatório Notas.')
    } finally {
      setIsGerandoNotas(false)
    }
  }

  async function validarIbsCbs() {
    if (!isElectron) {
      showToast('erro', 'Funcionalidade disponível apenas no aplicativo desktop.')
      return
    }
    if (!pasta) {
      showToast('erro', 'Selecione a pasta onde estão os XMLs.')
      return
    }

    setIsGerandoIbsCbs(true)
    setResumoIbsCbs(null)
    try {
      const resp = await window.electron.relatorio.validarIbsCbs(pasta)
      if (!resp.ok) {
        showToast('erro', resp.xMotivo ?? 'Falha ao validar IBS/CBS.')
        return
      }
      const notas = resp.notas ?? 0
      const itens = resp.itens ?? 0
      const comDiv = resp.comDivergencia ?? 0
      const totDiv = resp.totaisDivergentes ?? 0
      const arquivo = resp.arquivo ?? 'validacao_ibs_cbs.xlsx'
      setResumoIbsCbs({
        arquivo,
        notas,
        itens,
        comDivergencia: comDiv,
        totaisDivergentes: totDiv,
        versao: resp.versaoCalculadora ?? '1.7.2',
        amostra: resp.amostra ?? [],
      })
      showToast(
        'ok',
        `Validação IBS|CBS (${resp.versaoCalculadora ?? '1.7.2'}): ${notas} nota(s), ${itens} item(ns), ${comDiv} divergência(s) → ${arquivo}.`
      )
    } catch (err) {
      showToast('erro', err instanceof Error ? err.message : 'Erro ao validar IBS/CBS.')
    } finally {
      setIsGerandoIbsCbs(false)
    }
  }

  const ocupado = isGerando || isGerandoNotas || isGerandoEfd || isGerandoIbsCbs

  return (
    <div className="fade-in flex flex-col h-full">
      <div className="p-6 pb-4 border-b border-[var(--border)]">
        <h2 className="text-xl font-semibold mb-4 text-[var(--text-primary)]">
          Relatórios (XLSX)
        </h2>

        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Gere os relatórios a partir dos XMLs (selecione a pasta abaixo) ou de um arquivo EFD ICMS/IPI (seção no fim da página). Com XMLs, o comparativo NFC-e usa a pasta plana; o relatório Notas
          percorre subpastas (ex.: DistDFe ou SAT <span className="font-mono">CNPJ/ano/mês</span>). A{' '}
          <strong>Validação Notas IBS|CBS</strong> confere modelos 55 e 65 com a calculadora RFB 1.7.2 embarcada.
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={selecionarPasta}
            className="flex-1 py-2.5 rounded text-sm font-semibold transition-all no-drag bg-[var(--bg-raised)] border border-[var(--border)] text-[var(--text-primary)]"
            disabled={ocupado}
          >
            {pasta ? 'Trocar pasta' : 'Selecionar pasta'}
          </button>
        </div>

        <div className="mt-3">
          <p className="text-xs text-[var(--text-muted)]">Pasta atual</p>
          <p
            className="text-xs font-mono truncate"
            style={{ color: 'var(--text-primary)' }}
            title={pasta || '—'}
          >
            {pasta || '—'}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-8">
        {/* Comparativo NFC-e */}
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-primary)] mb-2">
            Comparativo NFC-e
          </h3>
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            Gera <span className="font-mono">comparativo_aprovado.xlsx</span> e{' '}
            <span className="font-mono">comparativo_cancelamento.xlsx</span> (1 linha por cupom) a
            partir dos XMLs na raiz da pasta.
          </p>
          {(qtdXmlFormatoChave44 > 0 || qtdXmlFormatoLegado > 0) && (
            <p className="text-xs text-[var(--text-secondary)] mb-3">
              Formatos identificados: <span className="font-mono">{qtdXmlFormatoChave44}</span>{' '}
              <span className="font-mono">[chave44].xml</span> e{' '}
              <span className="font-mono">{qtdXmlFormatoLegado}</span>{' '}
              <span className="font-mono">*_nfce.xml</span>.
            </p>
          )}

          <div className="rounded border border-[var(--border)] bg-[var(--bg-raised)] p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
                Prévia dos XMLs (raiz)
              </p>
              <span className="text-xs text-[var(--text-secondary)]">
                Total:{' '}
                <span className="font-semibold text-[var(--text-primary)]">{xmlArquivos.length}</span>
              </span>
            </div>
            {isCarregandoXmls ? (
              <p className="text-xs text-[var(--text-muted)]">Carregando arquivos…</p>
            ) : xmlArquivos.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">Nenhum arquivo XML na raiz.</p>
            ) : (
              <div className="max-h-32 overflow-auto rounded border border-[var(--border)] bg-[var(--bg-surface)]">
                {xmlArquivos.slice(0, 10).map((arquivo) => (
                  <div
                    key={arquivo}
                    className="px-2 py-1 text-xs font-mono border-b border-[var(--border)] last:border-b-0 text-[var(--text-primary)]"
                    title={arquivo}
                  >
                    {arquivo}
                  </div>
                ))}
              </div>
            )}
            {xmlArquivos.length > 10 && (
              <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                Mostrando 10 de {xmlArquivos.length} arquivos.
              </p>
            )}
          </div>

          <div className="rounded border border-[var(--border)] bg-[var(--bg-raised)] p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
                Prévia dos cancelados
              </p>
              <span className="text-xs text-[var(--text-secondary)]">
                Total cancelados:{' '}
                <span className="font-semibold text-[var(--text-primary)]">{xmlCancelados.length}</span>
              </span>
            </div>
            {isCarregandoXmls ? (
              <p className="text-xs text-[var(--text-muted)]">Carregando arquivos…</p>
            ) : xmlCancelados.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">0 cancelados</p>
            ) : (
              <div className="max-h-32 overflow-auto rounded border border-[var(--border)] bg-[var(--bg-surface)]">
                {xmlCancelados.slice(0, 10).map((arquivo) => (
                  <div
                    key={arquivo}
                    className="px-2 py-1 text-xs font-mono border-b border-[var(--border)] last:border-b-0 text-[var(--text-primary)]"
                    title={arquivo}
                  >
                    {arquivo}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={gerarXlsx}
            disabled={ocupado || !pasta}
            className="flex items-center justify-center px-5 py-2.5 rounded text-sm font-semibold no-drag bg-[var(--teal-glow)] border border-[var(--teal-dim)] text-[var(--teal)] disabled:opacity-60"
          >
            {isGerando ? 'Gerando…' : 'Gerar comparativo NFC-e'}
          </button>
        </section>

        {/* Relatório Notas estilo FSist */}
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-primary)] mb-2">
            Relatório Notas (itens)
          </h3>
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            Estilo FSist ampliado (61 colunas): 1 linha por item, deduplicação por chave (prefere{' '}
            <span className="font-mono">procNFe</span> ou <span className="font-mono">cfeSat</span>
            ). Aceita NF-e/NFC-e completos e cupons SAT importados no módulo SAT.
          </p>

          <div className="rounded border border-[var(--border)] bg-[var(--bg-raised)] p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
                Prévia (árvore)
              </p>
              <span className="text-xs text-[var(--text-secondary)]">
                Elegíveis:{' '}
                <span className="font-semibold text-[var(--text-primary)]">{xmlsNotas.length}</span>
                {totalXmlArvore > 0 && (
                  <span className="text-[var(--text-muted)]"> / {totalXmlArvore} XML(s)</span>
                )}
              </span>
            </div>
            {isCarregandoXmls ? (
              <p className="text-xs text-[var(--text-muted)]">Carregando arquivos…</p>
            ) : xmlsNotas.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                Nenhum XML com itens (NF-e/NFC-e) encontrado na pasta ou subpastas.
              </p>
            ) : (
              <div className="max-h-40 overflow-auto rounded border border-[var(--border)] bg-[var(--bg-surface)]">
                {xmlsNotas.slice(0, 15).map((arquivo) => (
                  <div
                    key={arquivo}
                    className="px-2 py-1 text-xs font-mono border-b border-[var(--border)] last:border-b-0 text-[var(--text-primary)]"
                    title={arquivo}
                  >
                    {arquivo}
                  </div>
                ))}
              </div>
            )}
            {xmlsNotas.length > 15 && (
              <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                Mostrando 15 de {xmlsNotas.length} arquivos.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => void gerarNotasXlsx()}
            disabled={ocupado || !pasta}
            className="flex items-center justify-center px-5 py-2.5 rounded text-sm font-semibold no-drag bg-[var(--teal-glow)] border border-[var(--teal-dim)] text-[var(--teal)] disabled:opacity-60"
          >
            {isGerandoNotas ? 'Gerando…' : 'Gerar relatório Notas'}
          </button>
        </section>

        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-primary)] mb-2">
            Validação Notas IBS|CBS
          </h3>
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            Confere NF-e (55) e NFC-e (65) com os parâmetros embarcados da Calculadora de Tributos da RFB{' '}
            <span className="font-mono">1.7.2</span> (tabela cClassTrib V0073, alíquotas de teste 2026, arredondamento
            HALF_EVEN). Não chama API remota e não exige Java. Gera{' '}
            <span className="font-mono">validacao_ibs_cbs.xlsx</span> na pasta, com células divergentes em destaque.
          </p>

          <div className="rounded border border-[var(--border)] bg-[var(--bg-raised)] p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
                Prévia 55/65 (árvore)
              </p>
              <span className="text-xs text-[var(--text-secondary)]">
                Elegíveis:{' '}
                <span className="font-semibold text-[var(--text-primary)]">{xmlsIbsCbs.length}</span>
                {totalXmlIbsCbs > 0 && (
                  <span className="text-[var(--text-muted)]"> / {totalXmlIbsCbs} XML(s)</span>
                )}
              </span>
            </div>
            {isCarregandoXmls ? (
              <p className="text-xs text-[var(--text-muted)]">Carregando arquivos…</p>
            ) : xmlsIbsCbs.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                Nenhum XML de NF-e (55) ou NFC-e (65) com itens na pasta.
              </p>
            ) : (
              <div className="max-h-40 overflow-auto rounded border border-[var(--border)] bg-[var(--bg-surface)]">
                {xmlsIbsCbs.slice(0, 15).map((arquivo) => (
                  <div
                    key={arquivo}
                    className="px-2 py-1 text-xs font-mono border-b border-[var(--border)] last:border-b-0 text-[var(--text-primary)]"
                    title={arquivo}
                  >
                    {arquivo}
                  </div>
                ))}
              </div>
            )}
            {xmlsIbsCbs.length > 15 && (
              <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                Mostrando 15 de {xmlsIbsCbs.length} arquivos.
              </p>
            )}
          </div>

          {resumoIbsCbs && (
            <div className="rounded border border-[var(--border)] bg-[var(--bg-raised)] p-3 mb-3 text-xs text-[var(--text-secondary)] space-y-1">
              <p>
                Arquivo:{' '}
                <span className="font-mono text-[var(--text-primary)]">{resumoIbsCbs.arquivo}</span>
              </p>
              <p>
                Calculadora RFB{' '}
                <span className="font-mono text-[var(--text-primary)]">{resumoIbsCbs.versao}</span>
                {' · '}
                {resumoIbsCbs.notas} nota(s), {resumoIbsCbs.itens} item(ns)
              </p>
              <p>
                Divergências em itens:{' '}
                <span className="font-semibold text-[var(--text-primary)]">
                  {resumoIbsCbs.comDivergencia}
                </span>
                {' · '}
                Totais divergentes:{' '}
                <span className="font-semibold text-[var(--text-primary)]">
                  {resumoIbsCbs.totaisDivergentes}
                </span>
              </p>
              {resumoIbsCbs.amostra.length > 0 && (
                <div className="mt-2 max-h-28 overflow-auto rounded border border-[var(--border)] bg-[var(--bg-surface)]">
                  {resumoIbsCbs.amostra.map((a) => (
                    <div
                      key={`${a.chave}-${a.item}`}
                      className="px-2 py-1 font-mono border-b border-[var(--border)] last:border-b-0 text-[var(--text-primary)]"
                    >
                      item {a.item} · {a.divergencias || '—'}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => void validarIbsCbs()}
            disabled={ocupado || !pasta}
            className="flex items-center justify-center px-5 py-2.5 rounded text-sm font-semibold no-drag bg-[var(--teal-glow)] border border-[var(--teal-dim)] text-[var(--teal)] disabled:opacity-60"
          >
            {isGerandoIbsCbs ? 'Validando…' : 'Validar IBS|CBS'}
          </button>
        </section>

        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-primary)] mb-2">
            Relatório a partir de EFD ICMS/IPI
          </h3>
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            Um único <span className="font-mono">.xlsx</span> (abas Comparativo aprovado, Comparativo
            cancelamento e Notas no layout FSist), gerado a partir de um arquivo SPED Fiscal{' '}
            <span className="font-mono">.txt</span> (registros 0000, C100, C170, C190). Encoding
            latin1/windows-1252. O nome usa razão social e CNPJ do registro 0000. O ficheiro é gravado
            na pasta do EFD.
          </p>

          <div className="flex gap-3 mb-3">
            <button
              type="button"
              onClick={() => void selecionarEfd()}
              className="flex-1 py-2.5 rounded text-sm font-semibold transition-all no-drag bg-[var(--bg-raised)] border border-[var(--border)] text-[var(--text-primary)]"
              disabled={ocupado}
            >
              {arquivoEfd ? 'Trocar arquivo EFD' : 'Selecionar arquivo EFD'}
            </button>
          </div>

          <div className="mb-3">
            <p className="text-xs text-[var(--text-muted)]">Arquivo atual</p>
            <p
              className="text-xs font-mono truncate"
              style={{ color: 'var(--text-primary)' }}
              title={arquivoEfd || '—'}
            >
              {arquivoEfd || '—'}
            </p>
          </div>

          <div className="rounded border border-[var(--border)] bg-[var(--bg-raised)] p-3 mb-3">
            <p className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-2">
              Prévia do EFD
            </p>
            {isCarregandoEfd ? (
              <p className="text-xs text-[var(--text-muted)]">Lendo arquivo…</p>
            ) : !previewEfd ? (
              <p className="text-xs text-[var(--text-muted)]">
                Nenhum EFD selecionado. Escolha o <span className="font-mono">.txt</span> do SPED
                Fiscal.
              </p>
            ) : (
              <div className="text-xs text-[var(--text-secondary)] space-y-1">
                <p>
                  Empresa:{' '}
                  <span className="font-semibold text-[var(--text-primary)]">{previewEfd.nome}</span>
                </p>
                <p>
                  CNPJ:{' '}
                  <span className="font-mono text-[var(--text-primary)]">{previewEfd.cnpj}</span>
                  {previewEfd.uf ? ` · UF ${previewEfd.uf}` : ''}
                </p>
                <p>
                  Período: {previewEfd.dtIni} a {previewEfd.dtFin}
                </p>
                <p>
                  Documentos C100:{' '}
                  <span className="font-semibold text-[var(--text-primary)]">
                    {previewEfd.documentos}
                  </span>{' '}
                  ({previewEfd.aprovados} aprovados, {previewEfd.cancelados} cancelados)
                </p>
                <p>
                  Itens C170:{' '}
                  <span className="font-semibold text-[var(--text-primary)]">
                    {previewEfd.itensC170}
                  </span>
                  {' · '}
                  Analíticos C190:{' '}
                  <span className="font-semibold text-[var(--text-primary)]">
                    {previewEfd.analiticosC190}
                  </span>
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void gerarXlsxEfd()}
            disabled={ocupado || !arquivoEfd}
            className="flex items-center justify-center px-5 py-2.5 rounded text-sm font-semibold no-drag bg-[var(--teal-glow)] border border-[var(--teal-dim)] text-[var(--teal)] disabled:opacity-60"
          >
            {isGerandoEfd ? 'Gerando…' : 'Gerar relatório do EFD'}
          </button>
        </section>
      </div>
    </div>
  )
}
