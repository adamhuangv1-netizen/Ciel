import { app, protocol, screen } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { electronApp } from '@electron-toolkit/utils'
import { DEFAULT_THEME, type Card, type CardKind, type EmblemState, type EmblemTheme } from '../shared/types'
import { cielPaths, type CielPaths } from './paths'
import { loadSettings, saveSettings, type Settings } from './settings'
import { loadPersona, sampleRateOf, type VoiceSettings } from './persona'
import { createTts, fetchAccountUsage } from './voice/tts'
import { TemplateCache } from './voice/templateCache'
import { SpeechQueue } from './voice/speechQueue'
import { SpeechBudget, type SpeechPriority } from './voice/speechBudget'
import { createAudioSink } from './voice/audioSink'
import { ASSET_SCHEME, AVATAR_URL, resolveAsset } from './assets'
import { displayLabel } from './overlay/bounds'
import { createOverlayWindow, type OverlayHandle } from './overlay/overlayWindow'
import { createTray, type TrayHandle } from './tray'

let tray: TrayHandle | null = null // module-level so it isn't garbage-collected
let overlay: OverlayHandle | null = null

// Must happen before 'ready'. fetch support lets three.js's loader read the avatar.
protocol.registerSchemesAsPrivileged([
  { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
])

/** Dev: the repo's personas/ciel. Packaged: %APPDATA%/Ciel/persona. CIEL_PERSONA_DIR overrides both. */
function personaDir(): string {
  const override = process.env['CIEL_PERSONA_DIR']
  if (override) return override
  return app.isPackaged
    ? path.join(app.getPath('appData'), 'Ciel', 'persona')
    : path.join(app.getAppPath(), '..', 'personas', 'ciel')
}

/** Her voice, or null for cards only (no key, or no voice designed yet). */
function createSpeech(
  voice: VoiceSettings | null,
  paths: CielPaths,
  overlay: OverlayHandle,
  onSpeaking: (on: boolean) => void
): SpeechQueue | null {
  const apiKey = process.env['ELEVENLABS_API_KEY']
  if (!apiKey) {
    console.warn('ELEVENLABS_API_KEY is not set: cards only')
    return null
  }
  if (!voice || voice.voiceId.startsWith('PENDING')) {
    console.warn('no voice chosen yet (voice.json): cards only')
    return null
  }
  const budget = new SpeechBudget({ statePath: path.join(paths.stateDir, 'speech-budget.json') })
  const refreshUsage = async (): Promise<void> => budget.sync(await fetchAccountUsage(apiKey))
  refreshUsage().catch((e: Error) => console.warn('could not read ElevenLabs usage:', e.message))

  const sink = createAudioSink({
    send: (channel, payload) => overlay.sendAudio(channel, payload),
    sampleRate: sampleRateOf(voice.outputFormat)
  })
  overlay.onAudioDone((id) => sink.ack(id))
  sink.onSpeaking(onSpeaking)
  return new SpeechQueue({
    tts: createTts(apiKey, voice),
    budget,
    cache: new TemplateCache({ dir: paths.ttsCache, voiceId: voice.voiceId, modelId: voice.modelId }),
    sink,
    refreshUsage,
    onVoiceUnavailable: (card) => {
      console.warn('voice unavailable:', card.body)
      overlay.showCard(card)
    }
  })
}

async function start(): Promise<void> {
  electronApp.setAppUserModelId('com.ciel.app')
  const paths = cielPaths(app.getPath('appData'))
  let settings: Settings = loadSettings(paths.settings)

  let theme: EmblemTheme = DEFAULT_THEME
  let avatarPath: string | null = null
  let voice: VoiceSettings | null = null
  try {
    const persona = await loadPersona(personaDir())
    theme = persona.emblem
    avatarPath = persona.avatarPath
    voice = persona.voice
  } catch (e) {
    console.error('persona pack not loaded; using defaults:', (e as Error).message)
  }

  protocol.handle(ASSET_SCHEME, async (req) => {
    const file = resolveAsset(req.url, avatarPath)
    if (!file) return new Response('Not found', { status: 404 })
    return new Response(await readFile(file), {
      headers: { 'content-type': 'model/gltf-binary', 'access-control-allow-origin': '*' }
    })
  })

  // Dev-only visual checks: CIEL_DEMO_LAYOUT=stage previews the stage layout without saving it.
  const demoLayout = process.env['CIEL_DEMO_LAYOUT']
  const startLayout =
    !app.isPackaged && (demoLayout === 'stage' || demoLayout === 'corner') ? demoLayout : settings.layout

  overlay = createOverlayWindow(theme, {
    displayId: settings.displayId,
    layout: startLayout,
    avatarUrl: avatarPath ? AVATAR_URL : null
  })
  overlay.onCardAction((cardId) => overlay?.dismissCard(cardId))

  // While audio plays she's 'speaking'; otherwise she shows her resting state.
  let restState: EmblemState = 'idle'
  let speaking = false
  const showState = (): void => overlay?.setEmblem(speaking ? 'speaking' : restState)
  showState()
  const speech = createSpeech(voice, paths, overlay, (on) => {
    speaking = on
    if (!app.isPackaged) console.log(`[speech] audio ${on ? 'started' : 'finished'} at ${Date.now()}`)
    showState()
  })

  /** Shows a card and speaks it; the card's auto-dismiss restarts when the speech ends. */
  const say = (kind: CardKind, body: string, priority: SpeechPriority, template = false): void => {
    const card: Card = { id: randomUUID(), kind, body, createdAt: Date.now() }
    overlay?.showCard(card)
    const queuedAt = Date.now()
    void speech
      ?.enqueue({ text: body, priority, cardId: card.id, template })
      .then((outcome) => {
        if (!app.isPackaged) console.log(`[speech] ${outcome} (queued at ${queuedAt}): ${body.slice(0, 48)}`)
        overlay?.restartDismissTimer(card.id)
      })
  }

  const update = (patch: Partial<Settings>): void => {
    settings = { ...settings, ...patch }
    saveSettings(paths.settings, settings)
  }

  tray = createTray({
    onToggleMute: () => {
      // Ears arrive in M1b.
    },
    onToggleQuiet: (quiet) => speech?.setQuiet(quiet),
    onTestSpeak: app.isPackaged
      ? undefined
      : () => say('notice', 'This is a test line, Master. Everything is in order.', 'notice'),
    onQuit: () => {
      tray?.tray.destroy()
      app.quit()
    },
    displays: () => {
      const primaryId = screen.getPrimaryDisplay().id
      return [
        { id: null, label: 'Main display (follow Windows)' },
        ...screen.getAllDisplays().map((d, i) => ({ id: d.id, label: displayLabel(d, i, primaryId) }))
      ]
    },
    currentDisplayId: () => settings.displayId,
    onPickDisplay: (id) => {
      update({ displayId: id })
      overlay?.moveToDisplay(id)
    },
    currentLayout: () => settings.layout,
    onPickLayout: (layout) => {
      update({ layout })
      overlay?.setLayout(layout)
    }
  })
  screen.on('display-added', () => tray?.refresh())
  screen.on('display-removed', () => tray?.refresh())

  if (!app.isPackaged && process.env['CIEL_DEMO'] === '1') {
    // The request arrives while the notice is speaking, so it cuts the notice off and goes first.
    say('notice', 'Your download finished: blender-4.5.zip.', 'notice')
    say('answer', 'Blender is using 62 % of your CPU right now.', 'answer')
    setTimeout(() => say('request', 'May I move 14 installers from Downloads into Downloads\\Sorted?', 'request'), 1500)
    restState = 'alert'
    showState()
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  void app.whenReady().then(start)

  // The overlay is never closed by the user; Ciel keeps running from the tray.
  app.on('window-all-closed', () => {})
}
