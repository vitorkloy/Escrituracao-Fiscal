/**
 * Tipos compartilhados da UI (certificado, listagem, download).
 * Mantidos fora dos componentes para leitura e reutilização mais simples.
 */

export type AppTab =
  | 'config'
  | 'listagem'
  | 'download'
  | 'relatorio'
  | 'manual'
  | 'xml-retencao'
  | 'nfe-dist-dfe'
  | 'nfe-recepcao-evento'
  | 'cte-consulta'

/** Item da barra lateral (ícone Ionicons como data URI / nome). */
export interface NavTabConfig {
  id: AppTab
  label: string
  icon: string
}

export type SefazEnvironment = 'producao'
export type AppModule = 'nfce' | 'nfe' | 'relatorio' | 'xml-retencao' | 'cte'

export type CertificateSourceMode = 'store' | 'arquivo'

/** Estado do certificado na UI (inclui senha só em memória). */
export interface CertificateUiState {
  pfxPath: string
  thumbprint?: string
  origemStore: boolean
  senha: string
  ambiente: SefazEnvironment
  /** Nome exibido na sidebar (completo; o layout trunca com ellipsis). */
  certificadoNome?: string
  /** CNPJ somente dígitos (14), para formatar na UI. */
  certificadoCnpj?: string
}

export interface KeyListItem {
  chave: string
  selecionada: boolean
}

export type ToastVariant = 'ok' | 'erro' | 'info'

export interface ToastMessage {
  id: number
  tipo: ToastVariant
  msg: string
}

export type OverlayKind = 'listagem' | 'lote' | 'request'

export interface LoadingUiState {
  type: OverlayKind | null
  atual?: number
  total?: number
  label?: string
}

/** Resposta tipada do IPC de download em lote (alinhada ao retorno do main). */
export interface BatchDownloadResponse {
  ok?: boolean
  resultados?: Array<{ chave: string; ok: boolean; erro?: string }>
  xMotivo?: string
}

export type EmitenteFilter = 'todos' | 'matriz' | 'filiais' | (string & {})

/** Linha da prévia/classificação de XML por pastas de retenção (espelha o IPC «xml-retencao»). */
export interface XmlRetencaoLinha {
  nome: string
  caminhoOriginal: string
  temRetencao: boolean | null
  pastaDestino: 'retencao' | 'sem_retencao' | 'invalidos'
  percentualRetencao?: string
  percentualPasta?: string
  origemDeteccao?: 'infCpl' | 'retTrib' | 'retTrib-regex' | 'none'
  caminhoCopiado?: string
  erro?: string
}
