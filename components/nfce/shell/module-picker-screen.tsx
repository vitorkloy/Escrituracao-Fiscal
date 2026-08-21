'use client'

import { IonIcon } from '@ionic/react'
import { busOutline, documentTextOutline, funnelOutline, receiptOutline, statsChartOutline } from 'ionicons/icons'
import type { AppModule } from '@/types/nfce-app'

type ModulePickerScreenProps = {
  onSelectModule: (modulo: AppModule) => void
}

export function ModulePickerScreen({ onSelectModule }: ModulePickerScreenProps) {
  return (
    <div className="h-screen w-screen bg-[var(--bg-deep)] flex items-center justify-center p-6">
      <div className="w-full max-w-[820px] rounded border border-[var(--border)] bg-[var(--bg-base)] p-6">
        <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Escolha o módulo</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-5">
          Escolha o que precisa fazer agora. Depois você pode trocar em <strong>Trocar módulo</strong> na barra lateral.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <button
            type="button"
            onClick={() => onSelectModule('nfce')}
            className="rounded border border-[var(--border)] bg-[var(--bg-raised)] p-4 text-left no-drag transition-colors hover:border-[var(--teal-dim)] hover:bg-[var(--bg-surface)]"
          >
            <div className="flex items-center gap-2 mb-2 text-[var(--text-primary)]">
              <IonIcon icon={receiptOutline} className="w-5 h-5" />
              <span className="font-semibold">NFC-e</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Cupons fiscais SP: listar, baixar XML e relatório.
            </p>
          </button>
          <button
            type="button"
            onClick={() => onSelectModule('nfe')}
            className="rounded border border-[var(--border)] bg-[var(--bg-raised)] p-4 text-left no-drag transition-colors hover:border-[var(--teal-dim)] hover:bg-[var(--bg-surface)]"
          >
            <div className="flex items-center gap-2 mb-2 text-[var(--text-primary)]">
              <IonIcon icon={documentTextOutline} className="w-5 h-5" />
              <span className="font-semibold">NF-e</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Notas modelo 55: sincronizar fila, completar XML de saída e importar do ERP.
            </p>
          </button>
          <button
            type="button"
            onClick={() => onSelectModule('cte')}
            className="rounded border border-[var(--border)] bg-[var(--bg-raised)] p-4 text-left no-drag transition-colors hover:border-[var(--teal-dim)] hover:bg-[var(--bg-surface)]"
          >
            <div className="flex items-center gap-2 mb-2 text-[var(--text-primary)]">
              <IonIcon icon={busOutline} className="w-5 h-5" />
              <span className="font-semibold">CT-e</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Conhecimento de transporte: sincronizar fila e consultar por chave (SP).
            </p>
          </button>
          <button
            type="button"
            onClick={() => onSelectModule('relatorio')}
            className="rounded border border-[var(--border)] bg-[var(--bg-raised)] p-4 text-left no-drag transition-colors hover:border-[var(--teal-dim)] hover:bg-[var(--bg-surface)]"
          >
            <div className="flex items-center gap-2 mb-2 text-[var(--text-primary)]">
              <IonIcon icon={statsChartOutline} className="w-5 h-5" />
              <span className="font-semibold">Relatório</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Gerar Excel a partir de XMLs já na pasta (sem baixar de novo).
            </p>
          </button>
          <button
            type="button"
            onClick={() => onSelectModule('xml-retencao')}
            className="rounded border border-[var(--border)] bg-[var(--bg-raised)] p-4 text-left no-drag transition-colors hover:border-[var(--teal-dim)] hover:bg-[var(--bg-surface)]"
          >
            <div className="flex items-center gap-2 mb-2 text-[var(--text-primary)]">
              <IonIcon icon={funnelOutline} className="w-5 h-5" />
              <span className="font-semibold">XML Retenção</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Separar XMLs com e sem retenção de impostos.
            </p>
          </button>
        </div>
        <p className="mt-5 text-xs text-[var(--text-muted)]">
          Dúvida? Depois de escolher o módulo, abra <strong>Manual</strong> na barra lateral.
        </p>
      </div>
    </div>
  )
}
