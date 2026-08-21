/**
 * Download assistido de NF-e completas pelo Portal Nacional (nfe.fazenda.gov.br),
 * a mesma técnica de ferramentas como o FSist:
 *
 * 1. Abre a "Consultar NF-e" do portal e preenche a chave.
 * 2. O usuário resolve o hCaptcha ("não sou um robô") — único passo manual;
 *    o portal exige o desafio a cada consulta e não há como automatizá-lo.
 * 3. O eFis clica em Continuar, localiza "Download do documento", apresenta o
 *    certificado do repositório do Windows (mTLS) e salva o XML na estrutura
 *    CNPJ/ano/mês com o nome `{chave}_procNFe.xml`.
 *
 * Nota: a URL antiga `tipoConsulta=completa` hoje redireciona para a home do
 * portal; usamos `tipoConsulta=resumo` (link oficial "Consultar NF-e").
 */
import { app, BrowserWindow, session } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import zlib from 'zlib'
import { extrairAnoMesEmissao } from './nfe-dist-dfe-parser'
import { resolverPastaCnpj } from './pasta-empresa'

export const PORTAL_NACIONAL_MAX_POR_EXEC = 20

/**
 * URL atual do portal (menu "Consultar NF-e").
 * A antiga `tipoConsulta=completa` redireciona para `principal.aspx` (home) e não tem o formulário.
 */
const URL_CONSULTA_NFE =
  'https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=resumo&tipoConteudo=7PhJ+gAVw2g='
const PARTITION = 'persist:portal-nacional-nfe'
const TIMEOUT_CAPTCHA_MS = 5 * 60_000
const TIMEOUT_FORM_MS = 45_000
const TIMEOUT_RESULTADO_MS = 60_000
const TIMEOUT_DOWNLOAD_MS = 90_000
const POLL_MS = 700

export interface PortalNacionalProgresso {
  tipo: 'inicio' | 'chave' | 'status' | 'concluido' | 'erro'
  chave?: string
  indice?: number
  total?: number
  mensagem?: string
  salvos?: number
  falhas?: number
}

interface JobPortal {
  win: BrowserWindow
  cnpj14: string
  cancelado: boolean
  downloadPendente: {
    resolve: (caminho: string) => void
    reject: (err: Error) => void
  } | null
}

let jobAtual: JobPortal | null = null
let certHandlerRegistrado = false

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Seleciona automaticamente o certificado do repositório do Windows no mTLS do portal. */
function registrarCertHandler(): void {
  if (certHandlerRegistrado) return
  certHandlerRegistrado = true
  app.on('select-client-certificate', (event, _wc, url, lista, callback) => {
    if (!jobAtual || !url.includes('fazenda.gov.br') || lista.length === 0) return
    event.preventDefault()
    const cnpj = jobAtual.cnpj14
    const porCnpj = lista.find((c) => (c.subjectName ?? '').replace(/\D/g, '').includes(cnpj))
    const porRaiz = lista.find((c) =>
      (c.subjectName ?? '').replace(/\D/g, '').includes(cnpj.slice(0, 8))
    )
    callback(porCnpj ?? porRaiz ?? lista[0])
  })
}

/** Sonda o estado da página atual (formulário, captcha resolvido, resultado, erro). */
const SCRIPT_SONDA = `(() => {
  const texto = (el) => ((el && (el.value || el.textContent)) || '').trim()
  const inputChave =
    document.querySelector('#ctl00_ContentPlaceHolder1_txtChaveAcessoResumo, #ctl00_ContentPlaceHolder1_txtChaveAcesso, input[id*="txtChaveAcesso"], input[id*="ChaveAcesso"], input[name*="txtChaveAcesso"], input[name*="ChaveAcesso"]') ||
    Array.from(document.querySelectorAll('input[type="text"]')).find((el) => {
      const id = ((el.id || '') + ' ' + (el.name || '')).toLowerCase()
      return id.includes('chave')
    })
  const captchaEl = document.querySelector('[name="h-captcha-response"], [name="g-recaptcha-response"], textarea[name="h-captcha-response"]')
  const clicaveis = Array.from(document.querySelectorAll('input[type="submit"], input[type="button"], button, a'))
  const btnDownload = clicaveis.find((b) =>
    /download\\s+d[oa]\\s+documento/i.test(texto(b)) ||
    /baixar\\s+xml/i.test(texto(b)) ||
    /btnDownload/i.test(b.id || '')
  )
  const erroEl = document.querySelector('[id*="MsgErro" i], [id*="lblMsg" i], [id*="vdsErros"], .validation-summary-errors, .listaErro, #ctl00_ContentPlaceHolder1_lblStatus')
  const naHome = /principal\\.aspx/i.test(location.href) || !!document.querySelector('a[href*="consultaRecaptcha"]')
  return {
    temForm: !!inputChave,
    captchaOk: !!(captchaEl && captchaEl.value && captchaEl.value.length > 10),
    temDownload: !!btnDownload,
    erro: texto(erroEl),
    url: location.href,
    naHome: naHome && !inputChave,
  }
})()`

interface SondaPagina {
  temForm: boolean
  captchaOk: boolean
  temDownload: boolean
  erro: string
  url?: string
  naHome?: boolean
}

function scriptPreencherChave(chave: string, indice: number, total: number): string {
  return `(() => {
    const input =
      document.querySelector('#ctl00_ContentPlaceHolder1_txtChaveAcessoResumo, #ctl00_ContentPlaceHolder1_txtChaveAcesso, input[id*="txtChaveAcesso"], input[id*="ChaveAcesso"], input[name*="txtChaveAcesso"], input[name*="ChaveAcesso"]') ||
      Array.from(document.querySelectorAll('input[type="text"]')).find((el) => {
        const id = ((el.id || '') + ' ' + (el.name || '')).toLowerCase()
        return id.includes('chave')
      })
    if (!input) return false
    input.focus()
    input.value = ${JSON.stringify(chave)}
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }))
    let faixa = document.getElementById('efis-banner')
    if (!faixa) {
      faixa = document.createElement('div')
      faixa.id = 'efis-banner'
      faixa.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#0d9488;color:#fff;padding:10px 16px;font:600 14px system-ui;box-shadow:0 2px 8px rgba(0,0,0,.3)'
      document.body.appendChild(faixa)
    }
    faixa.textContent = 'eFis — Nota ${indice} de ${total}: marque "Sou humano" (captcha). O restante é automático.'
    return true
  })()`
}

const SCRIPT_IR_PARA_CONSULTA = `(() => {
  const links = Array.from(document.querySelectorAll('a[href*="consultaRecaptcha"]'))
  const preferido = links.find((a) => /tipoConsulta=resumo/i.test(a.getAttribute('href') || '')) || links[0]
  if (preferido) { preferido.click(); return true }
  return false
})()`

const SCRIPT_CLICAR_CONSULTAR = `(() => {
  const texto = (el) => ((el && (el.value || el.textContent)) || '').trim()
  const clicaveis = Array.from(document.querySelectorAll('input[type="submit"], input[type="button"], button'))
  const btn = clicaveis.find((b) =>
    /continuar|consultar/i.test(texto(b)) ||
    /btnConsultar/i.test(b.id || '')
  )
  if (btn) { btn.click(); return true }
  return false
})()`

const SCRIPT_CLICAR_DOWNLOAD = `(() => {
  const texto = (el) => ((el && (el.value || el.textContent)) || '').trim()
  const clicaveis = Array.from(document.querySelectorAll('input[type="submit"], input[type="button"], button, a'))
  const btn = clicaveis.find((b) =>
    /download\\s+d[oa]\\s+documento/i.test(texto(b)) ||
    /baixar\\s+xml/i.test(texto(b)) ||
    /btnDownload/i.test(b.id || '')
  )
  if (btn) { btn.click(); return true }
  return false
})()`

async function sondar(win: BrowserWindow): Promise<SondaPagina | null> {
  try {
    return (await win.webContents.executeJavaScript(SCRIPT_SONDA, true)) as SondaPagina
  } catch {
    return null // página em transição/navegando
  }
}

/** Garante que a página de consulta com o campo da chave está aberta. */
async function abrirFormularioConsulta(win: BrowserWindow, job: JobPortal): Promise<void> {
  await win.loadURL(URL_CONSULTA_NFE)
  const inicio = Date.now()
  let clicouMenu = false
  while (!job.cancelado) {
    if (Date.now() - inicio > TIMEOUT_FORM_MS) {
      throw new Error(
        'formulário de consulta não carregou (portal redirecionou ou mudou). Tente de novo ou abra manualmente Consultar NF-e.'
      )
    }
    const s = await sondar(win)
    if (s?.temForm) return
    if (s?.naHome && !clicouMenu) {
      clicouMenu = true
      try {
        await win.webContents.executeJavaScript(SCRIPT_IR_PARA_CONSULTA, true)
      } catch {
        /* navegação */
      }
    }
    await sleep(POLL_MS)
  }
  throw new Error('cancelado.')
}

/** Extrai o primeiro .xml de um zip simples (métodos store/deflate). */
function extrairXmlDeZip(buf: Buffer): string | null {
  let off = 0
  while (off + 30 <= buf.length && buf.readUInt32LE(off) === 0x04034b50) {
    const metodo = buf.readUInt16LE(off + 8)
    const tamComp = buf.readUInt32LE(off + 18)
    const tamNome = buf.readUInt16LE(off + 26)
    const tamExtra = buf.readUInt16LE(off + 28)
    const nome = buf.toString('utf-8', off + 30, off + 30 + tamNome)
    const iniDados = off + 30 + tamNome + tamExtra
    const dados = buf.subarray(iniDados, iniDados + tamComp)
    if (nome.toLowerCase().endsWith('.xml')) {
      try {
        if (metodo === 0) return dados.toString('utf-8')
        if (metodo === 8) return zlib.inflateRawSync(dados).toString('utf-8')
      } catch {
        return null
      }
    }
    off = iniDados + tamComp
  }
  return null
}

function lerXmlBaixado(caminho: string): string | null {
  let buf: Buffer
  try {
    buf = fs.readFileSync(caminho)
  } catch {
    return null
  }
  const xml =
    buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b ? extrairXmlDeZip(buf) : buf.toString('utf-8')
  if (!xml) return null
  const temNfe = /<(?:[\w.-]+:)?(?:nfeProc|procNFe)[\s>]/i.test(xml) ||
    (/<(?:[\w.-]+:)?NFe[\s>]/i.test(xml) && /<(?:[\w.-]+:)?protNFe[\s>]/i.test(xml))
  return temNfe ? xml : null
}

function salvarProcNfe(
  pastaRaiz: string,
  cnpj14: string,
  chave: string,
  xml: string
): 'salvo' | 'ignorado' {
  const am = extrairAnoMesEmissao(xml)
  const ano = am?.ano ?? `20${chave.slice(2, 4)}`
  const mes = am?.mes ?? chave.slice(4, 6)
  const dir = path.join(resolverPastaCnpj(pastaRaiz, cnpj14), ano, mes)
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, `${chave}_procNFe.xml`)
  if (fs.existsSync(dest)) return 'ignorado'
  fs.writeFileSync(dest, xml, 'utf-8')
  return 'salvo'
}

export function cancelarPortalNacional(): boolean {
  if (!jobAtual) return false
  jobAtual.cancelado = true
  if (!jobAtual.win.isDestroyed()) jobAtual.win.close()
  return true
}

export async function baixarProcNfePortalNacional(params: {
  pastaRaiz: string
  cnpj14: string
  chaves: string[]
  parent?: BrowserWindow | null
  onProgress?: (p: PortalNacionalProgresso) => void
}): Promise<{
  ok: boolean
  tentadas: number
  salvos: number
  ignorados: number
  falhas: number
  cancelado: boolean
  log: string[]
  xMotivo?: string
}> {
  const log: string[] = []
  const pastaRaiz = String(params.pastaRaiz ?? '').trim()
  const cnpj14 = String(params.cnpj14 ?? '').replace(/\D/g, '')
  const chaves = [...new Set(params.chaves.map((c) => c.replace(/\D/g, '')))]
    .filter((c) => c.length === 44)
    .slice(0, PORTAL_NACIONAL_MAX_POR_EXEC)

  if (!pastaRaiz || cnpj14.length !== 14) {
    return { ok: false, tentadas: 0, salvos: 0, ignorados: 0, falhas: 0, cancelado: false, log, xMotivo: 'Pasta ou CNPJ inválido.' }
  }
  if (chaves.length === 0) {
    return { ok: false, tentadas: 0, salvos: 0, ignorados: 0, falhas: 0, cancelado: false, log, xMotivo: 'Nenhuma chave válida para baixar.' }
  }
  if (jobAtual) {
    return { ok: false, tentadas: 0, salvos: 0, ignorados: 0, falhas: 0, cancelado: false, log, xMotivo: 'Já existe uma janela do Portal Nacional aberta.' }
  }

  registrarCertHandler()

  const ses = session.fromPartition(PARTITION)
  const dirTemp = path.join(os.tmpdir(), 'efis-portal-nacional')
  fs.mkdirSync(dirTemp, { recursive: true })

  const win = new BrowserWindow({
    width: 1024,
    height: 820,
    parent: params.parent ?? undefined,
    title: 'eFis — Portal Nacional da NF-e (download assistido)',
    autoHideMenuBar: true,
    webPreferences: {
      partition: PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  const job: JobPortal = { win, cnpj14, cancelado: false, downloadPendente: null }
  jobAtual = job

  const onWillDownload = (_e: Electron.Event, item: Electron.DownloadItem) => {
    const destino = path.join(dirTemp, `${Date.now()}-${item.getFilename() || 'download.bin'}`)
    item.setSavePath(destino)
    item.once('done', (_ev, estado) => {
      const pendente = job.downloadPendente
      job.downloadPendente = null
      if (!pendente) return
      if (estado === 'completed') pendente.resolve(destino)
      else pendente.reject(new Error(`download ${estado}`))
    })
  }
  ses.on('will-download', onWillDownload)

  // Alguns botões do portal abrem o download em nova janela: baixar na mesma sessão.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/download/i.test(url)) win.webContents.downloadURL(url)
    return { action: 'deny' }
  })

  win.on('closed', () => {
    job.cancelado = true
    job.downloadPendente?.reject(new Error('janela fechada'))
    job.downloadPendente = null
  })

  const progresso = (p: PortalNacionalProgresso) => params.onProgress?.(p)

  progresso({
    tipo: 'inicio',
    total: chaves.length,
    mensagem: `Portal Nacional: ${chaves.length} chave(s). Resolva o "não sou um robô" a cada nota; o resto é automático.`,
  })
  log.push(`Iniciando Portal Nacional com ${chaves.length} chave(s) (máx. ${PORTAL_NACIONAL_MAX_POR_EXEC} por execução).`)

  let salvos = 0
  let ignorados = 0
  let falhas = 0
  let tentadas = 0
  let foiCancelado = false

  try {
    for (let i = 0; i < chaves.length; i++) {
      if (job.cancelado) break
      const chave = chaves[i]
      tentadas++
      progresso({ tipo: 'chave', chave, indice: i + 1, total: chaves.length, mensagem: `Abrindo consulta da chave ${chave}…` })

      let resultadoChave = ''
      try {
        await abrirFormularioConsulta(win, job)
        if (job.cancelado) break
        const preenchida = (await win.webContents.executeJavaScript(
          scriptPreencherChave(chave, i + 1, chaves.length),
          true
        )) as boolean
        if (!preenchida) {
          throw new Error('campo de chave de acesso não encontrado no portal (página sem formulário)')
        }

        // 1) usuário resolve o captcha → clicar Continuar
        const inicioCaptcha = Date.now()
        let clicouConsultar = false
        while (!job.cancelado && !clicouConsultar) {
          if (Date.now() - inicioCaptcha > TIMEOUT_CAPTCHA_MS) throw new Error('tempo esgotado aguardando o captcha')
          const s = await sondar(win)
          if (s?.temForm && s.captchaOk) {
            await win.webContents.executeJavaScript(SCRIPT_CLICAR_CONSULTAR, true)
            clicouConsultar = true
            progresso({ tipo: 'status', chave, mensagem: 'Captcha ok — consultando a nota…' })
          } else if (s && !s.temForm && s.temDownload) {
            clicouConsultar = true // usuário consultou manualmente
          } else {
            await sleep(POLL_MS)
          }
        }
        if (job.cancelado) break

        // 2) aguardar página da nota (ou rejeição)
        const inicioResultado = Date.now()
        let prontoParaDownload = false
        while (!job.cancelado && !prontoParaDownload) {
          if (Date.now() - inicioResultado > TIMEOUT_RESULTADO_MS) {
            throw new Error('resultado da consulta não carregou (botão de download não encontrado)')
          }
          const s = await sondar(win)
          if (s?.temDownload) {
            prontoParaDownload = true
          } else if (s?.temForm && s.erro) {
            throw new Error(`portal recusou a consulta: ${s.erro}`)
          } else {
            await sleep(POLL_MS)
          }
        }
        if (job.cancelado) break

        // 3) clicar em "Download do documento" e aguardar o arquivo
        const arquivo = await new Promise<string>((resolve, reject) => {
          job.downloadPendente = { resolve, reject }
          const timer = setTimeout(() => {
            if (job.downloadPendente) {
              job.downloadPendente = null
              reject(new Error('tempo esgotado no download (verifique se o certificado A1 está instalado no Windows)'))
            }
          }, TIMEOUT_DOWNLOAD_MS)
          void win.webContents
            .executeJavaScript(SCRIPT_CLICAR_DOWNLOAD, true)
            .then((clicou) => {
              if (!clicou) {
                clearTimeout(timer)
                job.downloadPendente = null
                reject(new Error('botão "Download do documento" não encontrado'))
              }
            })
            .catch(() => {/* navegação em curso; o download decide */})
        })

        const xml = lerXmlBaixado(arquivo)
        try { fs.unlinkSync(arquivo) } catch { /* temp */ }
        if (!xml) throw new Error('arquivo baixado não contém NF-e completa')
        if (!xml.includes(chave)) throw new Error('XML baixado não corresponde à chave consultada')

        const r = salvarProcNfe(pastaRaiz, cnpj14, chave, xml)
        if (r === 'salvo') {
          salvos++
          resultadoChave = 'procNFe salvo (Portal Nacional).'
        } else {
          ignorados++
          resultadoChave = 'procNFe já existia.'
        }
      } catch (err) {
        falhas++
        resultadoChave = `falha: ${err instanceof Error ? err.message : String(err)}`
        if (job.cancelado) resultadoChave = 'cancelado.'
      }
      log.push(`[${chave}] ${resultadoChave}`)
      progresso({ tipo: 'status', chave, indice: i + 1, total: chaves.length, mensagem: `[${chave}] ${resultadoChave}` })
    }
  } finally {
    ses.removeListener('will-download', onWillDownload)
    foiCancelado = job.cancelado
    jobAtual = null
    if (!win.isDestroyed()) win.close()
    const resumo = `Concluído: ${salvos} salvos, ${ignorados} já existiam, ${falhas} falhas${foiCancelado ? ' (cancelado pelo usuário)' : ''}.`
    log.push(resumo)
    progresso({ tipo: 'concluido', salvos, falhas, mensagem: resumo })
  }

  return { ok: true, tentadas, salvos, ignorados, falhas, cancelado: foiCancelado, log }
}
