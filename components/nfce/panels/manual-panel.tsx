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
      O <strong>eFis</strong> é o aplicativo desktop para Windows que consulta a SEFAZ e o Ambiente Nacional com o seu{' '}
      <strong>certificado e-CNPJ</strong>. O certificado fica no seu computador — não é enviado para servidores da empresa.
    </>,
    <>
      Ao abrir, escolha o módulo. Depois use <strong>Trocar módulo</strong> na barra lateral para voltar à escolha.
    </>,
    <>
      Módulos: <strong>NFC-e</strong> (cupons SP), <strong>NF-e</strong> (notas 55), <strong>CT-e</strong> (frete),{' '}
      <strong>SAT</strong> (cupons históricos CF-e-SAT), <strong>Relatório</strong> (Excel a partir da pasta) e{' '}
      <strong>XML Retenção</strong>. Detalhes na aba <strong>Módulos</strong>.
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
  <>Não feche o aplicativo durante busca longa, download em lote ou sincronização — pode perder progresso.</>,
  <>
    No módulo <strong>NFC-e</strong>, a aba <strong>Relatório</strong> gera Excel a partir da pasta; o cartão{' '}
    <strong>Relatório</strong> na escolha inicial é para quem só precisa dessa função.
  </>,
  <>
    Bloqueio da SEFAZ (código 656): aguarde o temporizador na tela (~1 h). Não recomece a fila do zero sem necessidade.
  </>,
  <>
    Portais oficiais: NFC-e SP e o portal nacional da NF-e.
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
        <strong>Notas de saída:</strong> este módulo <strong>lista e baixa os cupons emitidos</strong> pelo CNPJ do
        certificado (SAE-SP). O download grava o XML completo do cupom (e eventos, se houver). Isso é diferente da DistDFe
        de NF-e/CT-e, que <strong>não</strong> devolve ao emitente o XML das próprias notas modelo 55/57.
      </>,
      <>
        Durante a busca aparece overlay de progresso; pode <strong>Cancelar busca</strong>. Se tentar fechar o app com operação em
        curso, será pedida confirmação.
      </>,
    ],
  },
  {
    titulo: 'Módulo NF-e (notas modelo 55)',
    itens: [
      <>
        <strong>O que faz:</strong> sincroniza a fila de documentos, tenta completar o XML, baixa pelo Portal Nacional
        (saída) e importa XMLs do ERP. Também envia eventos (ciência, etc.).
      </>,
      <>
        <strong>Abas:</strong> <strong>Certificado</strong>, <strong>Baixar documentos</strong>,{' '}
        <strong>Importar saída</strong>, <strong>Recepção evento</strong>.
      </>,
      <>
        <strong>Fluxo guiado (saída):</strong> (1) <strong>Sincronizar fila</strong> — grava resumos e eventos com as
        chaves; (2) <strong>Buscar XML completo</strong> na SEFAZ-SP (sem captcha; muitas vezes não devolve o XML ao
        emitente); (3) <strong>Portal Nacional</strong> — marque “Sou humano” em cada nota; (4) módulo{' '}
        <strong>Relatório</strong>. Se o ERP já tiver os arquivos, use <strong>Importar saída</strong> e pule o Portal.
      </>,
      <>
        <strong>Pastas:</strong> escolha a <strong>pasta do eFis</strong> (pai ou pasta do CNPJ). Os arquivos ficam em{' '}
        <code className="text-[11px]">CNPJ/ano/mês</code>. Use a <strong>mesma pasta</strong> em Importar saída e no
        Relatório.
      </>,
      <>
        <strong>Glossário:</strong> <em>resumo</em> = autorização sem itens; <em>evento</em> = ciência/cancelamento/CC-e
        (não é a nota); <em>XML completo</em> = nota com itens (o Relatório precisa deste).
      </>,
      <>
        <strong>Bloqueio (código 656):</strong> a tela mostra um temporizador (~1 h). Não recomece a fila do zero sem
        necessidade.
      </>,
      <>
        <strong>Recepção de evento:</strong> cole o XML do evento (ciência etc.) e envie. Uso avançado — a maioria dos
        casos de escrituração fica em Baixar documentos / Importar saída.
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
        sincronização. O resumo da sync inclui contagem por tipo (<code className="text-[11px]">procCTe</code> /{' '}
        <code className="text-[11px]">resCTe</code> / evento).
      </>,
      <>
        <strong>Abas:</strong> <strong>Certificado</strong>, <strong>Distribuição DFe</strong>, <strong>Importar saída</strong>,{' '}
        <strong>Consulta XML</strong>.
      </>,
      <>
        Na <strong>Distribuição DFe</strong>, indique pasta raiz e CNPJ (alinhado ao certificado), <code className="text-[11px]">cUFAutor</code>, filtro e
        inicie a sincronização; o estado fica em <code className="text-[11px]">.cte-dist-state.json</code> na pasta raiz. Após a sync, pode
        usar <strong>Buscar procCTe faltantes</strong> (até 10 chaves, intervalo 3 s). Na <strong>Consulta XML</strong>, informe chave,{' '}
        <code className="text-[11px]">tpAmb</code> e endpoint SP; pode guardar <code className="text-[11px]">procCTe</code>,{' '}
        <code className="text-[11px]">protCTe</code> ou o SOAP completo. Na <strong>Importar saída</strong>, organize XMLs do ERP em{' '}
        <code className="text-[11px]">CNPJ/ano/mês/*_procCTe.xml</code>.
      </>,
      <>
        <strong>CT-e de saída:</strong> como na NF-e, a DistDFe costuma entregar <strong>eventos</strong> ao emitente, não
        necessariamente o <code className="text-[11px]">procCTe</code> da própria emissão. Prefira importar do emissor, consultar
        por chave ou a busca limitada de proc faltantes.
      </>,
      <>
        O certificado utilizado deve ser adequado à operação (emitente, tomador, etc., conforme regras da SEFAZ para aquele documento).
      </>,
    ],
  },
  {
    titulo: 'Módulo SAT (CF-e-SAT histórico — SP)',
    itens: [
      <>
        <strong>O que faz:</strong> organiza cupons <strong>já emitidos</strong> pelo equipamento SAT (modelo 59).{' '}
        <strong>Não emite</strong> cupom e não fala com o hardware. Desde 01/01/2026 a emissão SAT em SP é inválida (erro 1001);
        venda nova usa o módulo <strong>NFC-e</strong>.
      </>,
      <>
        <strong>Abas:</strong> <strong>Certificado</strong>, <strong>Importar cupons</strong>, <strong>Arquivos na pasta</strong>.
      </>,
      <>
        <strong>Fluxo:</strong> (1) importe a pasta/ZIP do PDV ou backup do SAT; (2) confira em Arquivos na pasta; (3) no
        módulo <strong>Relatório</strong> → Relatório Notas, aponte a mesma pasta do eFis. Os arquivos ficam em{' '}
        <code className="text-[11px]">CNPJ/ano/mês/{'{chave}'}_cfeSat.xml</code>.
      </>,
      <>
        <strong>Glossário:</strong> <em>cupom SAT</em> = XML completo com itens; <em>cancelamento</em> = anula o cupom (
        <code className="text-[11px]">_cancCFe.xml</code>); isso não é NFC-e.
      </>,
    ],
  },
  {
    titulo: 'Módulo Relatório',
    itens: [
      <>
        Disponível como módulo próprio na tela inicial. Serve para gerar ficheiros <strong>XLSX</strong> comparativos a partir de uma{' '}
        <strong>pasta</strong> que já contenha XMLs de NFC-e baixados pelo eFis (aprovadas e canceladas), e o{' '}
        <strong>Relatório Notas</strong> (itens) a partir de NF-e/NFC-e com <code className="text-[11px]">procNFe</code> e
        cupons SAT (<code className="text-[11px]">*_cfeSat.xml</code>).
      </>,
      <>
        Escolha a pasta, confira a pré-visualização e os totais, depois <strong>Gerar XLSX</strong>. Os nomes dos ficheiros gerados
        costumam incluir <strong>razão social</strong> e <strong>CNPJ</strong> quando esses dados são obtidos dos XMLs.
      </>,
      <>
        <strong>Importar XMLs de saída:</strong> nos módulos NF-e e CT-e use a aba <strong>Importar saída</strong>; no SAT,
        use <strong>Importar cupons</strong>. Depois <strong>Relatório Notas</strong> na mesma pasta.
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
