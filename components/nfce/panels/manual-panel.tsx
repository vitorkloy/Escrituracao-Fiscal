'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'

type ManualTab = 'geral' | 'modulos'

type ManualSectionData = {
  titulo: string
  itens: ReactNode[]
}

function ManualSection({ titulo, itens, isLast = false }: { titulo: string; itens: ReactNode[]; isLast?: boolean }) {
  return (
    <section className={`${isLast ? '' : 'mb-5'} rounded border border-[var(--border)] bg-[var(--bg-surface)] p-4`}>
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">{titulo}</h3>
      <ul className="list-disc pl-5 text-sm text-[var(--text-secondary)] space-y-2 leading-relaxed">
        {itens.map((item, i) => (
          <li key={`${titulo}-${i}`}>{item}</li>
        ))}
      </ul>
    </section>
  )
}

const MANUAL_VISAO_GERAL: ManualSectionData = {
  titulo: 'Visão geral do eFis',
  itens: [
    <>
      O <strong>eFis</strong> (Escrituração Fiscal) é um aplicativo <strong>desktop</strong> para Windows que fala com a{' '}
      <strong>SEFAZ-SP</strong> e o <strong>Ambiente Nacional</strong> usando o seu <strong>certificado digital e-CNPJ</strong>{' '}
      (<abbr title="Transport Layer Security">TLS</abbr> mútuo). O certificado <strong>não</strong> é enviado para servidores da
      empresa: a ligação é feita a partir do seu computador.
    </>,
    <>
      Ao abrir, aparece a tela <strong>Escolha o módulo</strong>. Nenhum módulo fica “ativo” até você clicar num cartão. Depois disso,
      use <strong>Trocar módulo</strong> na barra lateral para voltar à escolha.
    </>,
    <>
      Módulos disponíveis: <strong>NFC-e</strong> (SP), <strong>NF-e</strong> (AN), <strong>CT-e</strong> (consulta SP + DistDFe AN),{' '}
      <strong>Relatório</strong> (XLSX a partir de pasta de XMLs) e <strong>XML Retenção</strong> (classificação de XMLs). O detalhe
      de cada um está na aba <strong>Módulos</strong> deste manual.
    </>,
    <>
      Para diagnóstico técnico, o desenvolvimento pode usar variáveis de ambiente como{' '}
      <code className="text-[11px]">DEBUG=sefaz</code> ou <code className="text-[11px]">DEBUG=cte</code> no processo Electron (ver
      documentação do projeto).
    </>,
  ],
}

const MANUAL_CERTIFICADOS: ManualSectionData = {
  titulo: 'Como configurar o certificado digital',
  itens: [
    <>
      O certificado <strong>ICP-Brasil</strong> identifica o seu CNPJ perante a SEFAZ. A <strong>chave privada</strong> tem de estar
      utilizável neste PC. O eFis <strong>não grava a senha</strong> do ficheiro <code className="text-[11px]">.pfx</code> em disco.
    </>,
    <>
      <strong>Modo A — Repositório do Windows (recomendado):</strong> o certificado fica em <strong>Pessoal → Certificados</strong> do
      utilizador atual. No eFis, abra a aba <strong>Certificado</strong>, escolha <strong>Repositório</strong> e selecione o e-CNPJ
      na lista. Normalmente <strong>não é necessário</strong> informar senha na interface.
    </>,
    <>
      <strong>Por que marcar a chave como “exportável” na instalação:</strong> em algumas operações o aplicativo precisa de{' '}
      <strong>exportar temporariamente</strong> o certificado e a cadeia para um <code className="text-[11px]">.pfx</code> na pasta
      temporária, para o motor de rede assinar a ligação HTTPS. Se, ao importar o certificado no Windows, a chave tiver sido definida
      como <strong>não exportável</strong>, essa etapa pode falhar e as consultas à SEFAZ não funcionam.
    </>,
    <>
      <strong>Na importação no Windows</strong> (duplo clique num <code className="text-[11px]">.pfx</code> /{' '}
      <code className="text-[11px]">.p12</code>, ou <code className="text-[11px]">certmgr.msc</code> → Pessoal → Certificados →
      Importar): nas opções avançadas ou no assistente, ative a opção equivalente a{' '}
      <strong>“Marcar esta chave como exportável”</strong> / <strong>“Mark this key as exportable”</strong> (o texto exato varia
      conforme a versão do Windows). Faça isso se a política de segurança da empresa permitir.
    </>,
    <>
      <strong>Conferir instalação:</strong> <code className="text-[11px]">Win + R</code> → digite <code className="text-[11px]">certmgr.msc</code> →{' '}
      <strong>Pessoal</strong> → <strong>Certificados</strong> → localize o e-CNPJ → confirme que existe <strong>chave privada</strong>{' '}
      associada. No eFis, confira se o certificado aparece ao listar o repositório.
    </>,
    <>
      <strong>Certificado em token (A3) ou HSM</strong> com política de “nunca exportar”: o fluxo de repositório pode não ser
      compatível. Nesse caso, se tiver um ficheiro <code className="text-[11px]">.pfx</code> válido, use o <strong>Modo B</strong> ou
      contacte o suporte interno.
    </>,
    <>
      <strong>Modo B — Arquivo .pfx:</strong> use quando tiver o backup A1 em ficheiro. Selecione o caminho no eFis, informe a{' '}
      <strong>senha</strong> e clique em <strong>Verificar</strong> antes de listagens, downloads ou consultas. A senha fica só em
      memória na sessão.
    </>,
    <>
      <strong>Problemas frequentes:</strong> erro de ligação ou TLS — verifique validade do certificado, data/hora do Windows e cadeia
      ICP-Brasil. Mensagens sobre CNPJ da chave diferente do certificado — selecione o certificado da empresa correta.
    </>,
    <>
      Serviços de NFC-e e NF-e no eFis utilizam <strong>produção</strong> nos fluxos principais; no <strong>CT-e</strong>, a DistDFe AN
      está em produção e a <strong>consulta por chave</strong> na SP permite escolher produção ou homologação na própria tela.
    </>,
  ],
}

const MANUAL_OBSERVACOES: ReactNode[] = [
  <>Não feche o aplicativo durante busca longa, download em lote ou sincronização NF-e — pode perder progresso ou interromper a ligação.</>,
  <>
    No módulo <strong>NFC-e</strong>, a aba <strong>Relatório</strong> gera o mesmo tipo de XLSX a partir da pasta; na entrada inicial,
    o cartão <strong>Relatório</strong> é para quem só precisa dessa função.
  </>,
  <>
    Em caso de dúvida sobre códigos <code className="text-[11px]">cStat</code> ou formatos de XML, consulte o ficheiro{' '}
    <code className="text-[11px]">CONTEXTO.md</code> e o <code className="text-[11px]">README.md</code> na pasta do projeto.
  </>,
  <>
    Portais oficiais: NFC-e SP (<code className="text-[11px]">nfce.fazenda.sp.gov.br</code>), CT-e e NF-e no portal da{' '}
    <strong>NF-e</strong> / documentação da Receita Federal.
  </>,
]

const MANUAL_SECOES_MODULOS: ManualSectionData[] = [
  {
    titulo: 'Módulo NFC-e (SEFAZ-SP — SAE-NFC-e)',
    itens: [
      <>
        <strong>O que faz:</strong> apoio à escrituração da NFC-e em <strong>produção</strong> junto da SEFAZ-SP: listagem de chaves
        por período, download de XML (cupom e eventos), download em lote e relatório comparativo em Excel.
      </>,
      <>
        <strong>Abas:</strong> <strong>Certificado</strong>, <strong>Listagem</strong>, <strong>Download XML</strong>,{' '}
        <strong>Relatório</strong>.
      </>,
      <>
        <strong>Fluxo típico:</strong> configure o certificado → em <strong>Listagem</strong> informe data/hora inicial e final
        (formato exigido pela NT 2026) → <strong>Buscar</strong> → a paginação é <strong>automática</strong> até concluir o período
        (código <code className="text-[11px]">101</code> na SEFAZ) → selecione chaves → <strong>Baixar XMLs</strong> em lote ou use{' '}
        <strong>Download XML</strong> para uma chave → opcionalmente gere o XLSX na aba <strong>Relatório</strong> ou no próprio lote.
      </>,
      <>
        <strong>Limites úteis:</strong> até <strong>100 dias</strong> de histórico na consulta; até <strong>2.000</strong> chaves por
        resposta, com nova página automática quando aplicável. Códigos de retorno detalhados: ficheiro{' '}
        <code className="text-[11px]">CONTEXTO.md</code> na raiz do projeto ou README.
      </>,
      <>
        Durante a busca aparece overlay de progresso; pode <strong>Cancelar busca</strong>. Se tentar fechar o app com operação em
        curso, será pedida confirmação.
      </>,
    ],
  },
  {
    titulo: 'Módulo NF-e (Ambiente Nacional)',
    itens: [
      <>
        <strong>O que faz:</strong> integração com serviços da <strong>Receita / AN</strong> em produção:{' '}
        <strong>NFeDistribuicaoDFe</strong> (consulta por XML ou sincronização por NSU), <strong>NFeRecepcaoEvento4</strong> (envio de
        eventos) e listagem dos XMLs já gravados em disco.
      </>,
      <>
        <strong>Abas:</strong> <strong>Certificado</strong>, <strong>Distribuição DFe</strong>, <strong>Recepção evento</strong>.
      </>,
      <>
        <strong>Sincronização por NSU:</strong> indique pasta raiz e o <strong>CNPJ de 14 dígitos</strong> (deve ser o mesmo CNPJ do
        certificado). O app guarda estado (<code className="text-[11px]">.nfe-dist-state.json</code>), registo de diagnóstico (
        <code className="text-[11px]">sync-debug.log</code>) e XMLs em subpastas <code className="text-[11px]">{`{ano}/{mes}`}</code>{' '}
        com nomes que incluem sufixos como <code className="text-[11px]">_procNFe</code>, <code className="text-[11px]">_resNFe</code>,{' '}
        <code className="text-[11px]">_evento</code>, para não sobrescrever nota e evento da mesma chave.
      </>,
      <>
        <strong>Códigos frequentes:</strong> <code className="text-[11px]">138</code> há documentos na resposta;{' '}
        <code className="text-[11px]">137</code> nenhum documento novo nesse ciclo; <code className="text-[11px]">656</code> consumo
        indevido — a interface pode mostrar <strong>temporizador</strong> de espera; não há botão para “limpar” esse bloqueio
        manualmente.
      </>,
      <>
        <strong>Recepção de evento:</strong> cole o XML que iria dentro de <code className="text-[11px]">nfeDadosMsg</code> (por exemplo
        lote com <code className="text-[11px]">envEvento</code>). O aplicativo trata o envelope SOAP e CDATA conforme o serviço exige.
      </>,
    ],
  },
  {
    titulo: 'Módulo CT-e (SEFAZ-SP + AN)',
    itens: [
      <>
        <strong>O que faz:</strong> na <strong>SEFAZ-SP</strong>, consulta de <strong>situação</strong> do CT-e pela{' '}
        <strong>chave de 44 dígitos</strong> (<code className="text-[11px]">consSitCTe</code>, <strong>CTeConsultaV4</strong>). No{' '}
        <strong>Ambiente Nacional</strong>, <strong>Distribuição DFe</strong> por NSU (<code className="text-[11px]">cteDistDFeInteresse</code>,{' '}
        <strong>CTeDistribuicaoDFe</strong>), com filtro por papel (emitente/destinatário) e tabela de documentos por lote durante a
        sincronização.
      </>,
      <>
        <strong>Abas:</strong> <strong>Certificado</strong>, <strong>Distribuição DFe</strong>, <strong>Consulta XML</strong>.
      </>,
      <>
        Na <strong>Distribuição DFe</strong>, indique pasta raiz e CNPJ (alinhado ao certificado), <code className="text-[11px]">cUFAutor</code>, filtro e
        inicie a sincronização; o estado fica em <code className="text-[11px]">.cte-dist-state.json</code> na pasta raiz. Na{' '}
        <strong>Consulta XML</strong>, informe chave, <code className="text-[11px]">tpAmb</code> e endpoint SP; pode guardar{' '}
        <code className="text-[11px]">procCTe</code>, <code className="text-[11px]">protCTe</code> ou o SOAP completo.
      </>,
      <>
        O certificado utilizado deve ser adequado à operação (emitente, tomador, etc., conforme regras da SEFAZ para aquele documento).
      </>,
    ],
  },
  {
    titulo: 'Módulo Relatório',
    itens: [
      <>
        Disponível como módulo próprio na tela inicial. Serve para gerar ficheiros <strong>XLSX</strong> comparativos a partir de uma{' '}
        <strong>pasta</strong> que já contenha XMLs de NFC-e baixados pelo eFis (aprovadas e canceladas).
      </>,
      <>
        Escolha a pasta, confira a pré-visualização e os totais, depois <strong>Gerar XLSX</strong>. Os nomes dos ficheiros gerados
        costumam incluir <strong>razão social</strong> e <strong>CNPJ</strong> quando esses dados são obtidos dos XMLs.
      </>,
    ],
  },
  {
    titulo: 'Módulo XML Retenção',
    itens: [
      <>
        <strong>O que faz:</strong> analisa ficheiros XML (NF-e / NFC-e reconhecidos pelo app), classifica em pastas lógicas (com
        retenção, sem retenção, inválidos) e permite exportar cópias organizadas; pode gerar relatório XLSX do fluxo.
      </>,
      <>
        <strong>Fluxo:</strong> selecione ficheiros ou uma pasta com XMLs → <strong>Analisar</strong> → reveja as linhas na tabela →{' '}
        <strong>Exportar</strong> para a raiz escolhida e, se precisar, use a opção de relatório Excel.
      </>,
    ],
  },
]

const TAB_BTN_BASE =
  'px-3 py-1.5 rounded text-xs font-semibold no-drag transition-colors border border-transparent'
const TAB_BTN_ACTIVE = 'bg-[var(--teal-glow)] text-[var(--teal)] border-[var(--teal-dim)]'
const TAB_BTN_IDLE = 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'

export function ManualPanel() {
  const [aba, setAba] = useState<ManualTab>('geral')

  return (
    <div className="fade-in h-full flex flex-col min-h-0 overflow-hidden">
      <div className="shrink-0 p-6 pb-3 border-b border-[var(--border)]">
        <h2 className="text-xl font-semibold mb-2 text-[var(--text-primary)]">Manual de uso</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-4 max-w-3xl">
          Conteúdo alinhado a <code className="text-[11px]">docs/APRIMORAMENTO-MANUAL.md</code>. Use as abas abaixo para separar
          informação geral da documentação por módulo.
        </p>
        <div className="inline-flex rounded border border-[var(--border)] bg-[var(--bg-surface)] p-1">
          <button
            type="button"
            onClick={() => setAba('geral')}
            className={[TAB_BTN_BASE, aba === 'geral' ? TAB_BTN_ACTIVE : TAB_BTN_IDLE].join(' ')}
            aria-selected={aba === 'geral'}
          >
            Geral
          </button>
          <button
            type="button"
            onClick={() => setAba('modulos')}
            className={[TAB_BTN_BASE, aba === 'modulos' ? TAB_BTN_ACTIVE : TAB_BTN_IDLE].join(' ')}
            aria-selected={aba === 'modulos'}
          >
            Módulos
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-6 pt-4">
        {aba === 'geral' ? (
          <>
            <ManualSection titulo={MANUAL_VISAO_GERAL.titulo} itens={MANUAL_VISAO_GERAL.itens} />
            <ManualSection titulo={MANUAL_CERTIFICADOS.titulo} itens={MANUAL_CERTIFICADOS.itens} />
            <ManualSection titulo="Observações gerais" itens={MANUAL_OBSERVACOES} isLast />
          </>
        ) : (
          <>
            {MANUAL_SECOES_MODULOS.map((secao, idx) => (
              <ManualSection
                key={secao.titulo}
                titulo={secao.titulo}
                itens={secao.itens}
                isLast={idx === MANUAL_SECOES_MODULOS.length - 1}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
