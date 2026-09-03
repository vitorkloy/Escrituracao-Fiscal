import {
  busOutline,
  cloudDownloadOutline,
  documentTextOutline,
  downloadOutline,
  folderOpenOutline,
  funnelOutline,
  hardwareChipOutline,
  listOutline,
  sendOutline,
  settingsOutline,
} from 'ionicons/icons'
import type { NavTabConfig } from '@/types/nfce-app'

export const NFCE_NAV_TABS: NavTabConfig[] = [
  { id: 'config', label: 'Certificado', icon: settingsOutline },
  { id: 'listagem', label: 'Listagem', icon: listOutline },
  { id: 'download', label: 'Download XML', icon: downloadOutline },
  { id: 'relatorio', label: 'Relatório', icon: documentTextOutline },
]

export const NFE_NAV_TABS: NavTabConfig[] = [
  { id: 'config', label: 'Certificado', icon: settingsOutline },
  { id: 'nfe-dist-dfe', label: 'Baixar documentos', icon: cloudDownloadOutline },
  { id: 'nfe-importar-saida', label: 'Importar saída', icon: folderOpenOutline },
  { id: 'nfe-recepcao-evento', label: 'Recepção evento', icon: sendOutline },
]

export const CTE_NAV_TABS: NavTabConfig[] = [
  { id: 'config', label: 'Certificado', icon: settingsOutline },
  { id: 'cte-dist-dfe', label: 'Distribuição DFe', icon: cloudDownloadOutline },
  { id: 'cte-importar-saida', label: 'Importar saída', icon: folderOpenOutline },
  { id: 'cte-consulta', label: 'Consulta XML', icon: busOutline },
]

export const RELATORIO_NAV_TABS: NavTabConfig[] = [
  { id: 'relatorio', label: 'Relatório', icon: documentTextOutline },
]

export const XML_RETENCAO_NAV_TABS: NavTabConfig[] = [
  { id: 'xml-retencao', label: 'Classif. XML retenção', icon: funnelOutline },
]

export const SAT_NAV_TABS: NavTabConfig[] = [
  { id: 'config', label: 'Certificado', icon: settingsOutline },
  { id: 'sat-importar', label: 'Importar cupons', icon: folderOpenOutline },
  { id: 'sat-arquivos', label: 'Arquivos na pasta', icon: hardwareChipOutline },
]

export function navTabsForModule(
  modulo: 'nfce' | 'nfe' | 'relatorio' | 'xml-retencao' | 'cte' | 'sat'
): NavTabConfig[] {
  if (modulo === 'nfe') return NFE_NAV_TABS
  if (modulo === 'cte') return CTE_NAV_TABS
  if (modulo === 'relatorio') return RELATORIO_NAV_TABS
  if (modulo === 'xml-retencao') return XML_RETENCAO_NAV_TABS
  if (modulo === 'sat') return SAT_NAV_TABS
  return NFCE_NAV_TABS
}
