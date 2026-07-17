type AudioEngine = {
  context: AudioContext
  startMusic: () => Promise<void>
  pauseMusic: () => void
  playDoorOpen: () => void
  playBrakes: () => void
  playDeparture: () => void
  stop: () => void
  setWindowOpen: (value: number) => void
  setMusicVolume: (value: number) => void
  setRollingVolume: (value: number) => void
  setAmbienceVolume: (value: number) => void
  setSpeed: (value: number) => void
  setAtPlatform: (value: boolean) => void
  setTunnel: (value: boolean) => void
  setLocale: (locale: Locale) => void
  onRailClick?: (strength: number) => void
  onPassingTrain?: (duration: number, kind: 'passenger' | 'cargo') => void
}

export type AudioSource = 'radio' | 'fallback'
export type Locale = 'fr' | 'uk' | 'it'

const LOFI_STREAM_URL = 'https://radio.loficafe.net/listen/chilling/radio.mp3'

const NOTES = [
  [146.83, 174.61, 220],
  [130.81, 164.81, 196],
  [110, 146.83, 174.61],
  [123.47, 155.56, 196],
]

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const rand = (min: number, max: number) => min + Math.random() * (max - min)
const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

// Voice "walla" character per language: pitch range, syllable lengths, vowel
// formants and melodic contour. Voices stay unintelligible — this is the
// film-industry trick of shaping rhythm and melody so chatter *feels* French,
// English or Italian without any real words.
const WALLA: Record<Locale, {
  pitch: [number, number]
  syl: [number, number]
  gap: [number, number]
  formants: Array<[number, number]>
  contour: 'rise' | 'fall' | 'arc'
}> = {
  fr: {
    pitch: [150, 240],
    syl: [0.11, 0.16],
    gap: [0.02, 0.06],
    formants: [[420, 1900], [520, 2100], [360, 1750]],
    contour: 'rise',
  },
  uk: {
    pitch: [115, 195],
    syl: [0.08, 0.2],
    gap: [0.01, 0.12],
    formants: [[520, 1500], [620, 1650], [470, 1400]],
    contour: 'fall',
  },
  it: {
    pitch: [140, 260],
    syl: [0.1, 0.17],
    gap: [0.02, 0.07],
    formants: [[720, 1250], [820, 1400], [660, 1180]],
    contour: 'arc',
  },
}

export function createAudioEngine(onSourceChange?: (source: AudioSource) => void): AudioEngine {
  const context = new AudioContext()
  const master = context.createGain()
  master.gain.value = 0.68
  master.connect(context.destination)

  const musicBus = context.createGain()
  const trainBus = context.createGain()
  musicBus.gain.value = 0.62
  trainBus.gain.value = 0.55
  musicBus.connect(master)
  trainBus.connect(master)

  // The train side splits in two, each with its own mixer slider:
  //   rollingBus  — wheels, track, rumble, roar, singing rails, squeal
  //   ambienceBus — wind, crowd, voices, PA, stations, brakes, doors
  const rollingBus = context.createGain()
  const ambienceBus = context.createGain()
  rollingBus.gain.value = 0.55
  ambienceBus.gain.value = 0.55
  rollingBus.connect(trainBus)
  ambienceBus.connect(trainBus)

  // Generated impulse response: a small, warm wooden space. The wet amount is
  // automated — dry in the open country, roomy at platforms, splashy and hard
  // inside the Channel Tunnel.
  const verbSend = context.createGain()
  verbSend.gain.value = 0.08
  const convolver = context.createConvolver()
  const irLength = Math.floor(context.sampleRate * 1.5)
  const impulse = context.createBuffer(2, irLength, context.sampleRate)
  for (let channel = 0; channel < 2; channel += 1) {
    const irData = impulse.getChannelData(channel)
    for (let i = 0; i < irLength; i += 1) {
      irData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLength, 2.8)
    }
  }
  convolver.buffer = impulse
  trainBus.connect(verbSend)
  verbSend.connect(convolver)
  convolver.connect(master)

  // Lofi Cafe's official 24/7 Chilling stream, mixed through Web Audio so the
  // live station and the procedural train share one master control.
  const radio = new Audio()
  radio.crossOrigin = 'anonymous'
  radio.preload = 'none'
  radio.src = LOFI_STREAM_URL
  const radioSource = context.createMediaElementSource(radio)
  const radioGain = context.createGain()
  radioGain.gain.value = 1
  radioSource.connect(radioGain).connect(musicBus)

  // Shared noise material: white for the train bed, brown for station crowds.
  const white = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
  const whiteData = white.getChannelData(0)
  for (let i = 0; i < whiteData.length; i += 1) whiteData[i] = Math.random() * 2 - 1

  const brown = context.createBuffer(1, context.sampleRate * 4, context.sampleRate)
  const brownData = brown.getChannelData(0)
  let brownLast = 0
  for (let i = 0; i < brownData.length; i += 1) {
    brownLast = (brownLast + 0.02 * (Math.random() * 2 - 1)) / 1.02
    brownData[i] = brownLast * 3.2
  }

  const noise = context.createBufferSource()
  noise.buffer = white
  noise.loop = true
  noise.start()

  const crowdNoise = context.createBufferSource()
  crowdNoise.buffer = brown
  crowdNoise.loop = true
  crowdNoise.start()

  // ---- Continuous train bed (rollingBus) --------------------------------------
  // Wheel/bogie rumble (lowpassed noise) — owned by the dynamics timer so it
  // can pulse with every rail joint and swell on bridges.
  const rumbleFilter = context.createBiquadFilter()
  rumbleFilter.type = 'lowpass'
  rumbleFilter.frequency.value = 140
  const rumbleGain = context.createGain()
  rumbleGain.gain.value = 0.02
  noise.connect(rumbleFilter)
  rumbleFilter.connect(rumbleGain).connect(rollingBus)

  // Sub-bass body pressure you feel more than hear
  const subFilter = context.createBiquadFilter()
  subFilter.type = 'lowpass'
  subFilter.frequency.value = 55
  const subGain = context.createGain()
  subGain.gain.value = 0
  noise.connect(subFilter)
  subFilter.connect(subGain).connect(rollingBus)

  // Ballast roar — the broadband rush that builds at speed
  const roarFilter = context.createBiquadFilter()
  roarFilter.type = 'bandpass'
  roarFilter.frequency.value = 420
  roarFilter.Q.value = 0.7
  const roarGain = context.createGain()
  roarGain.gain.value = 0
  noise.connect(roarFilter)
  roarFilter.connect(roarGain).connect(rollingBus)

  // Rail singing — the faint corrugation ring that wanders in and out at speed
  const singFilter = context.createBiquadFilter()
  singFilter.type = 'bandpass'
  singFilter.frequency.value = 900
  singFilter.Q.value = 9
  const singGain = context.createGain()
  singGain.gain.value = 0
  noise.connect(singFilter)
  singFilter.connect(singGain).connect(rollingBus)

  // Traction hum with a slightly detuned partial for a beating, alive tone
  const hum = context.createOscillator()
  hum.type = 'sine'
  hum.frequency.value = 42
  const humGain = context.createGain()
  humGain.gain.value = 0.03
  hum.connect(humGain).connect(rollingBus)
  hum.start()
  const hum2 = context.createOscillator()
  hum2.type = 'sine'
  hum2.frequency.value = 63.4
  const hum2Gain = context.createGain()
  hum2Gain.gain.value = 0.012
  hum2.connect(hum2Gain).connect(rollingBus)
  hum2.start()

  // ---- Continuous environment bed (ambienceBus) --------------------------------
  // Interior HVAC hiss — always barely there inside the carriage
  const hissFilter = context.createBiquadFilter()
  hissFilter.type = 'highpass'
  hissFilter.frequency.value = 5200
  const hissGain = context.createGain()
  hissGain.gain.value = 0.003
  noise.connect(hissFilter)
  hissFilter.connect(hissGain).connect(ambienceBus)

  // Rushing air at the window gap
  const windFilter = context.createBiquadFilter()
  windFilter.type = 'bandpass'
  windFilter.frequency.value = 420
  windFilter.Q.value = 1.1
  const windGain = context.createGain()
  windGain.gain.value = 0
  noise.connect(windFilter)
  windFilter.connect(windGain).connect(ambienceBus)

  // Tunnel pressure whistle (narrow, high — that "in a tube" ringing)
  const tunnelWhistleFilter = context.createBiquadFilter()
  tunnelWhistleFilter.type = 'bandpass'
  tunnelWhistleFilter.frequency.value = 1150
  tunnelWhistleFilter.Q.value = 7
  const tunnelWhistleGain = context.createGain()
  tunnelWhistleGain.gain.value = 0
  noise.connect(tunnelWhistleFilter)
  tunnelWhistleFilter.connect(tunnelWhistleGain).connect(ambienceBus)

  // Muffled platform crowd when standing at a station
  const crowdFilter = context.createBiquadFilter()
  crowdFilter.type = 'lowpass'
  crowdFilter.frequency.value = 420
  const crowdGain = context.createGain()
  crowdGain.gain.value = 0
  crowdNoise.connect(crowdFilter)
  crowdFilter.connect(crowdGain).connect(ambienceBus)

  // Tinny loudspeaker chain for station announcements
  const speakerFilter = context.createBiquadFilter()
  speakerFilter.type = 'bandpass'
  speakerFilter.frequency.value = 1150
  speakerFilter.Q.value = 0.5
  const speakerGain = context.createGain()
  speakerGain.gain.value = 0.9
  speakerFilter.connect(speakerGain).connect(ambienceBus)

  // Vinyl surface noise glued to the music bus for a cozy radio feel
  const vinylNoise = context.createBufferSource()
  vinylNoise.buffer = white
  vinylNoise.loop = true
  vinylNoise.playbackRate.value = 0.82
  vinylNoise.start()
  const vinylFilter = context.createBiquadFilter()
  vinylFilter.type = 'highpass'
  vinylFilter.frequency.value = 3600
  const vinylGain = context.createGain()
  vinylGain.gain.value = 0
  vinylNoise.connect(vinylFilter)
  vinylFilter.connect(vinylGain).connect(musicBus)

  // ---- Live state -----------------------------------------------------------
  let speed = 0
  let windowOpenVal = 0
  let atPlatform = false
  let inTunnel = false
  let stopped = false
  let musicPaused = true
  let locale: Locale = 'fr'
  let bridgeUntil = 0
  let amBoost = 0

  const inBridge = () => context.currentTime < bridgeUntil

  const set = (param: AudioParam, value: number, tc = 0.35) => {
    param.setTargetAtTime(value, context.currentTime, tc)
  }

  const applyAmbience = () => {
    const s = speed
    set(subGain.gain, Math.pow(s, 1.8) * 0.064 * (inTunnel ? 1.5 : 1))
    set(humGain.gain, 0.02 + s * 0.05)
    set(hum2Gain.gain, 0.008 + s * 0.02)
    set(hissGain.gain, 0.0026 + s * 0.0012)
    if (windowOpenVal <= 0.05) set(windGain.gain, 0)
    else set(windGain.gain, windowOpenVal * (0.004 + s * 0.048))
    set(windFilter.frequency, 260 + windowOpenVal * 300 + s * 170)
    set(tunnelWhistleGain.gain, inTunnel ? s * 0.016 * (1 + windowOpenVal) : 0)
    set(crowdGain.gain, atPlatform ? 0.02 : 0)
    set(verbSend.gain, inTunnel ? 0.3 : atPlatform ? 0.16 : 0.07, 0.6)
    set(radioGain.gain, 1 - windowOpenVal * 0.16)
  }

  // ---- One-shot helpers -----------------------------------------------------
  const burst = (
    at: number,
    filterType: BiquadFilterType,
    freq: number,
    q: number,
    peak: number,
    attack: number,
    decay: number,
    dest: AudioNode = ambienceBus,
    freqTo?: number,
  ) => {
    const src = context.createBufferSource()
    src.buffer = white
    src.playbackRate.value = rand(0.9, 1.1)
    const filter = context.createBiquadFilter()
    filter.type = filterType
    filter.frequency.setValueAtTime(freq, at)
    if (freqTo !== undefined) filter.frequency.exponentialRampToValueAtTime(freqTo, at + attack + decay)
    filter.Q.value = q
    const g = context.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.linearRampToValueAtTime(peak, at + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay)
    src.connect(filter)
    filter.connect(g)
    g.connect(dest)
    src.start(at)
    src.stop(at + attack + decay + 0.1)
  }

  const tone = (
    at: number,
    from: number,
    to: number,
    dur: number,
    peak: number,
    attack = 0.03,
    type: OscillatorType = 'sine',
    pan = 0,
    dest: AudioNode = ambienceBus,
  ) => {
    const osc = context.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(from, at)
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + dur)
    const g = context.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.linearRampToValueAtTime(peak, at + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    osc.connect(g)
    if (pan !== 0) {
      const panner = context.createStereoPanner()
      panner.pan.value = pan
      g.connect(panner)
      panner.connect(dest)
    } else {
      g.connect(dest)
    }
    osc.start(at)
    osc.stop(at + dur + 0.1)
  }

  // A small bell: fundamental + two inharmonic partials, long decay
  const bell = (at: number, freq: number, dur: number, peak: number) => {
    tone(at, freq, freq, dur, peak, 0.008)
    tone(at, freq * 2.4, freq * 2.38, dur * 0.6, peak * 0.35, 0.005)
    tone(at, freq * 4.16, freq * 4.1, dur * 0.32, peak * 0.12, 0.004)
  }

  // ---- Voice synthesis (unintelligible "walla" chatter) -----------------------
  const speakSyllable = (
    at: number,
    pitchFrom: number,
    pitchTo: number,
    dur: number,
    formants: [number, number],
    level: number,
    pan: number,
    dest: AudioNode = ambienceBus,
  ) => {
    const osc = context.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(Math.max(60, pitchFrom), at)
    osc.frequency.exponentialRampToValueAtTime(Math.max(60, pitchTo), at + dur)
    const bp1 = context.createBiquadFilter()
    bp1.type = 'bandpass'
    bp1.frequency.value = formants[0]
    bp1.Q.value = 4.5
    const bp2 = context.createBiquadFilter()
    bp2.type = 'bandpass'
    bp2.frequency.value = formants[1]
    bp2.Q.value = 8
    const g2 = context.createGain()
    g2.gain.value = 0.45
    const env = context.createGain()
    env.gain.setValueAtTime(0.0001, at)
    env.gain.linearRampToValueAtTime(level, at + Math.min(0.03, dur * 0.3))
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    const panner = context.createStereoPanner()
    panner.pan.value = pan
    osc.connect(bp1)
    bp1.connect(env)
    osc.connect(bp2)
    bp2.connect(g2)
    g2.connect(env)
    env.connect(panner)
    panner.connect(dest)
    osc.start(at)
    osc.stop(at + dur + 0.05)
  }

  // Speaks a nonsense phrase with the locale's rhythm and melody.
  // Returns the end time so phrases can be chained into announcements.
  const speakPhrase = (
    at: number,
    loc: Locale,
    options: { level?: number; pan?: number; dest?: AudioNode; maxSyl?: number } = {},
  ) => {
    const w = WALLA[loc]
    const level = options.level ?? 0.008
    const pan = options.pan ?? 0
    const dest = options.dest ?? ambienceBus
    const syllables = 2 + Math.floor(rand(0, (options.maxSyl ?? 5) - 1))
    const base = rand(w.pitch[0], w.pitch[1])
    let t = at
    for (let i = 0; i < syllables; i += 1) {
      const dur = rand(w.syl[0], w.syl[1])
      const formants = w.formants[Math.floor(rand(0, w.formants.length))]
      let p1 = base
      if (w.contour === 'rise') p1 = base * (1 + i * 0.07)
      else if (w.contour === 'fall') p1 = base * (1.06 - i * 0.06)
      else p1 = base * (i < syllables / 2 ? 1 + i * 0.08 : 1 + (syllables - i) * 0.05)
      const p0 = i === 0 ? base * rand(0.92, 1.0) : base * rand(0.94, 1.06)
      speakSyllable(t, p0, p1, dur, formants, level * rand(0.7, 1.1), pan, dest)
      t += dur + rand(w.gap[0], w.gap[1])
    }
    return t
  }

  // The conductor's platform shout — two or three shaped vowels, no words
  const shout = (at: number, loc: Locale) => {
    const pan = rand(-0.25, 0.25)
    if (loc === 'uk') {
      // "AAH-bohd!" — two broad syllables
      speakSyllable(at, 215, 190, 0.3, [780, 1200], 0.013, pan)
      speakSyllable(at + 0.36, 190, 148, 0.34, [500, 950], 0.012, pan)
    } else if (loc === 'fr') {
      // "ah-vwah-TYH!" — three syllables, rising tail
      speakSyllable(at, 200, 205, 0.17, [700, 1100], 0.011, pan)
      speakSyllable(at + 0.21, 210, 215, 0.15, [450, 900], 0.01, pan)
      speakSyllable(at + 0.4, 225, 250, 0.3, [600, 1400], 0.013, pan)
    } else {
      // "ah-BOR-doh!" — three melodic syllables
      speakSyllable(at, 220, 225, 0.18, [750, 1250], 0.012, pan)
      speakSyllable(at + 0.23, 205, 195, 0.17, [550, 1000], 0.011, pan)
      speakSyllable(at + 0.44, 235, 180, 0.32, [700, 1150], 0.013, pan)
    }
  }

  // ---- Station PA jingles ------------------------------------------------------
  const playJingle = (loc: Locale) => {
    const at = context.currentTime + rand(0.1, 0.6)
    let announcementAt = at + 1.3
    if (loc === 'fr') {
      // SNCF signature: C–G–A–E (Do, Sol, La, Mi) — soft and warm
      const notes = [261.63, 392.0, 440.0, 659.25]
      const gaps = [0, 0.34, 0.64, 1.0]
      notes.forEach((freq, i) => {
        tone(at + gaps[i], freq, freq, 0.55, 0.011, 0.02, 'triangle')
        tone(at + gaps[i], freq * 2, freq * 2, 0.4, 0.004, 0.02, 'sine')
      })
      announcementAt = at + 1.6
    } else if (loc === 'uk') {
      // "Ding Dong Dang" bell — brighter and louder
      bell(at, 783.99, 1.1, 0.02)
      bell(at + 0.42, 659.25, 1.1, 0.02)
      bell(at + 0.84, 523.25, 1.7, 0.023)
      announcementAt = at + 1.7
    } else {
      // Italian "bi-bu-ba" — three light ascending notes
      tone(at, 523.25, 523.25, 0.32, 0.012, 0.015, 'triangle')
      tone(at + 0.28, 587.33, 587.33, 0.32, 0.012, 0.015, 'triangle')
      tone(at + 0.56, 659.25, 659.25, 0.5, 0.013, 0.015, 'triangle')
      announcementAt = at + 1.2
    }
    // …followed by a muffled, unintelligible loudspeaker announcement
    let t = announcementAt + rand(0.2, 0.5)
    const phrases = 2 + Math.floor(rand(0, 3))
    for (let i = 0; i < phrases; i += 1) {
      t = speakPhrase(t, loc, { level: 0.006, pan: rand(-0.3, 0.3), dest: speakerFilter, maxSyl: 6 }) + rand(0.12, 0.35)
    }
  }

  // ---- Rail clicks: real bogie rhythm ---------------------------------------
  // Two axles per bogie up front, then the carriages behind answering the same
  // joints a beat later, duller. Each click also nudges the rumble louder for
  // a split second, like the car body taking the shock.
  // Click loudness trim: ~25% softer than the first v2 mix so the rolling bed
  // sits under the music instead of competing with it.
  const CLICK_LEVEL = 0.75
  const scheduleClick = (at: number, velocity: number, dull = false) => {
    amBoost = Math.min(0.3, amBoost + velocity * (dull ? 0.06 : 0.14))
    if (dull) {
      tone(at, 70 + rand(0, 14), 50, 0.09, velocity * 0.04 * CLICK_LEVEL, 0.004, 'sine', 0, rollingBus)
      burst(at, 'bandpass', rand(300, 600), 1.1, velocity * 0.026 * CLICK_LEVEL, 0.003, 0.05, rollingBus)
      return
    }
    tone(at, 86 + rand(0, 26), 60, 0.1, velocity * 0.055 * CLICK_LEVEL, 0.004, 'sine', 0, rollingBus)
    burst(at, 'bandpass', rand(620, 1350) * (1 + windowOpenVal * 0.3), 1.25, velocity * 0.04 * CLICK_LEVEL, 0.003, 0.055, rollingBus)
    // high transient "tick" for definition
    burst(at, 'highpass', 2400, 0.8, velocity * 0.011 * CLICK_LEVEL, 0.001, 0.028, rollingBus)
    // on a bridge the joint rings back once, hollow
    if (inBridge()) burst(at + 0.085, 'bandpass', rand(380, 620), 1.2, velocity * 0.018 * CLICK_LEVEL, 0.003, 0.06, rollingBus)
  }

  let nextClickAt = context.currentTime + 0.4
  const clickTimer = window.setInterval(() => {
    const horizon = context.currentTime + 0.32
    while (nextClickAt < horizon) {
      if (speed > 0.03 && !stopped) {
        const at = Math.max(nextClickAt, context.currentTime + 0.005)
        const velocity = (0.38 + 0.62 * speed) * (1 + windowOpenVal * 0.85) * rand(0.85, 1.15)
        scheduleClick(at, velocity)
        scheduleClick(at + rand(0.08, 0.105), velocity * rand(0.7, 0.9))
        // the carriages behind us, a beat later and duller
        scheduleClick(at + rand(0.16, 0.24), velocity * 0.4, true)
        scheduleClick(at + rand(0.26, 0.34), velocity * 0.32, true)
        engine.onRailClick?.(Math.min(1, velocity))
      }
      const interval = lerp(1.05, 0.34, Math.pow(speed, 0.85)) * rand(0.94, 1.06)
      nextClickAt = Math.max(nextClickAt, context.currentTime) + interval
    }
  }, 90)

  // ---- Rolling dynamics: rumble pulse, roar, singing, bridge resonance ----------
  const dynamicsTimer = window.setInterval(() => {
    if (stopped) return
    const s = speed
    const bridge = inBridge()
    amBoost *= 0.55
    const rumbleBase = (0.018 + Math.pow(s, 1.55) * 0.21) * (inTunnel ? 1.6 : 1) * (1 + windowOpenVal * 0.5)
    set(rumbleGain.gain, rumbleBase * (bridge ? 1.35 : 1) * (1 + amBoost), 0.12)
    set(rumbleFilter.frequency, lerp(100, inTunnel ? 175 : 240, s) + (bridge ? 130 : 0), 0.15)
    set(roarGain.gain, Math.pow(s, 2.2) * 0.05 * (inTunnel ? 1.4 : 1) * (bridge ? 1.5 : 1), 0.2)
    set(roarFilter.frequency, 320 + s * 260, 0.25)
    const t = context.currentTime
    const singLevel = s > 0.5 && !inTunnel
      ? (s - 0.5) * 0.022 * Math.max(0, 0.55 + 0.45 * Math.sin(t * 0.21) + 0.15 * Math.sin(t * 0.53))
      : 0
    set(singGain.gain, singLevel, 0.4)
    set(singFilter.frequency, 900 + Math.sin(t * 0.09) * 120, 0.5)
  }, 200)

  // ---- Points/switch crossings: a fast clatter you can feel ----------------------
  const pointsTimer = window.setInterval(() => {
    if (stopped || speed < 0.5 || inTunnel || Math.random() > 1 / 75) return
    let t = context.currentTime + rand(0.05, 0.3)
    const hits = 5 + Math.floor(rand(0, 3))
    for (let i = 0; i < hits; i += 1) {
      scheduleClick(t, rand(1.0, 1.45) * (0.5 + speed * 0.5), i % 2 === 1)
      t += rand(0.065, 0.11)
    }
    engine.onRailClick?.(1.3)
  }, 2000)

  // ---- Bridge crossings: a few seconds of hollow resonance -------------------------
  const bridgeTimer = window.setInterval(() => {
    if (stopped || speed < 0.55 || inTunnel || Math.random() > 1 / 100) return
    bridgeUntil = context.currentTime + rand(3, 6)
  }, 3000)

  // ---- Wind gusts + pressure buffets at the open window -----------------------------
  const gustTimer = window.setInterval(() => {
    if (stopped) return
    if (windowOpenVal > 0.05) {
      const t = context.currentTime
      const gust = 0.72 + 0.28 * Math.sin(t * 1.7) + 0.14 * Math.sin(t * 3.9 + 1.3)
      set(windGain.gain, windowOpenVal * (0.004 + speed * 0.05) * Math.max(0.35, gust), 0.12)
      set(windFilter.frequency, 240 + windowOpenVal * 300 + speed * 190 + Math.sin(t * 2.3) * 60, 0.12)
      if (windowOpenVal > 0.5 && speed > 0.6 && Math.random() < 0.05) {
        tone(t, 58, 44, 0.12, 0.02, 0.02)
      }
    }
  }, 160)

  // ---- Occasional flange squeal on curves ------------------------------------
  const squealTimer = window.setInterval(() => {
    if (stopped || speed < 0.45 || Math.random() > 1 / 26) return
    const at = context.currentTime + 0.05
    const dur = rand(1.0, 1.8)
    const peak = rand(2000, 2500)
    const osc = context.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1750, at)
    osc.frequency.exponentialRampToValueAtTime(peak, at + dur * 0.4)
    osc.frequency.exponentialRampToValueAtTime(1900, at + dur)
    const g = context.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.linearRampToValueAtTime(rand(0.004, 0.009), at + dur * 0.3)
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    const panner = context.createStereoPanner()
    panner.pan.value = rand(-0.55, 0.55)
    osc.connect(g)
    g.connect(panner)
    panner.connect(rollingBus)
    osc.start(at)
    osc.stop(at + dur + 0.1)
  }, 1000)

  // ---- A train passing the other way ------------------------------------------
  const passingTimer = window.setInterval(() => {
    if (stopped || speed < 0.55 || Math.random() > 1 / 170) return
    const at = context.currentTime + 0.1
    const cargo = Math.random() < 0.3
    // Freight consists are longer and slower: a deep, drawn-out rumble instead
    // of the bright whoosh of a passenger train.
    const dur = cargo ? rand(4.5, 7) : rand(4.6, 5.4)
    const openness = 0.62 + windowOpenVal * 0.72
    const src = context.createBufferSource()
    src.buffer = white
    src.playbackRate.setValueCurveAtTime(new Float32Array([1.13, 1.09, 1.03, 0.97, 0.9, 0.84]), at, dur)

    // Two layers: a low body/rail roar and a brighter skin-of-the-train rush.
    // The cabin low-pass opens with the physical window.
    const bodyFilter = context.createBiquadFilter()
    bodyFilter.type = 'bandpass'
    bodyFilter.Q.value = cargo ? 0.72 : 0.9
    bodyFilter.frequency.setValueCurveAtTime(
      cargo
        ? new Float32Array([105, 165, 320, 240, 120])
        : new Float32Array([430, 880, 1450, 820, 310]),
      at,
      dur,
    )
    const airFilter = context.createBiquadFilter()
    airFilter.type = 'highpass'
    airFilter.frequency.value = cargo ? 720 : 1150
    const airGain = context.createGain()
    airGain.gain.value = (cargo ? 0.014 : 0.026) * openness
    const passMix = context.createGain()
    const peak = (cargo ? rand(0.048, 0.062) : rand(0.06, 0.082)) * openness
    passMix.gain.setValueCurveAtTime(
      new Float32Array([0.0001, peak * 0.12, peak * 0.55, peak, peak * 0.62, peak * 0.16, 0.0001]),
      at,
      dur,
    )
    const cabinFilter = context.createBiquadFilter()
    cabinFilter.type = 'lowpass'
    const closedCutoff = cargo ? 980 : 1350
    const openCutoff = cargo ? 3600 : 6200
    const cutoff = lerp(closedCutoff, openCutoff, windowOpenVal)
    cabinFilter.frequency.setValueCurveAtTime(new Float32Array([cutoff * 0.62, cutoff, cutoff * 0.9, cutoff * 0.52]), at, dur)
    cabinFilter.Q.value = 0.55
    const panner = context.createStereoPanner()
    panner.pan.setValueCurveAtTime(new Float32Array([-0.98, -0.9, -0.62, 0, 0.62, 0.9, 0.98]), at, dur)
    src.connect(bodyFilter)
    bodyFilter.connect(passMix)
    src.connect(airFilter)
    airFilter.connect(airGain)
    airGain.connect(passMix)
    passMix.connect(cabinFilter)
    cabinFilter.connect(panner)
    panner.connect(ambienceBus)

    // A short, darker reflection from the wood and glass makes the sound feel
    // located inside the compartment instead of pasted onto the headphones.
    const reflectionDelay = context.createDelay(0.2)
    reflectionDelay.delayTime.value = cargo ? 0.075 : 0.052
    const reflectionFilter = context.createBiquadFilter()
    reflectionFilter.type = 'lowpass'
    reflectionFilter.frequency.value = cargo ? 650 : 920
    const reflectionGain = context.createGain()
    reflectionGain.gain.value = 0.11 + (1 - windowOpenVal) * 0.09
    panner.connect(reflectionDelay)
    reflectionDelay.connect(reflectionFilter)
    reflectionFilter.connect(reflectionGain)
    reflectionGain.connect(ambienceBus)
    src.start(at)
    src.stop(at + dur + 0.1)
    if (cargo) {
      // Individual wagon joints travel through the stereo field after the loco.
      const wagons = 7
      for (let i = 0; i < wagons; i += 1) {
        const progress = 0.2 + i * 0.085
        const pan = lerp(-0.78, 0.78, progress)
        const wagonAt = at + dur * progress
        tone(wagonAt, 54 + rand(0, 9), 38, 0.34, 0.018 * openness, 0.025, 'sine', pan)
        tone(wagonAt + 0.08, 82, 51, 0.16, 0.009 * openness, 0.012, 'triangle', pan)
      }
    } else {
      // Pressure wave and turbine note bend downward at the closest point.
      tone(at + dur * 0.19, 92, 54, dur * 0.65, 0.028 * openness, dur * 0.2, 'sine', 0)
      tone(at + dur * 0.28, 230, 154, dur * 0.46, 0.007 * openness, 0.08, 'triangle', 0)
    }
    engine.onPassingTrain?.(dur, cargo ? 'cargo' : 'passenger')
  }, 2000)

  // ---- Level crossings: alternating bells, sometimes a distant horn --------------
  const playHorn = (at: number, level: number, pan = 0) => {
    // Two-tone horn a fourth apart, each note slightly detuned for a slow beat
    for (const base of [311, 415]) {
      tone(at, base * 0.985, base, 1.7, level, 0.24, 'triangle', pan, ambienceBus)
      tone(at, base * 1.006, base, 1.7, level * 0.7, 0.28, 'sine', pan, ambienceBus)
    }
  }
  const crossingTimer = window.setInterval(() => {
    if (stopped || speed < 0.45 || inTunnel || Math.random() > 1 / 150) return
    const at = context.currentTime + 0.08
    if (Math.random() < 0.45) playHorn(at, 0.011, rand(-0.3, 0.3))
    const bellsAt = at + rand(0.8, 1.4)
    const strikes = 6 + Math.floor(rand(0, 4))
    for (let i = 0; i < strikes; i += 1) {
      bell(bellsAt + i * 0.42, i % 2 === 0 ? 1046.5 : 784, 0.5, 0.007)
    }
  }, 1000)

  // ---- Rare distant horn out in open country --------------------------------------
  const hornTimer = window.setInterval(() => {
    if (stopped || speed < 0.5 || inTunnel || Math.random() > 1 / 240) return
    playHorn(context.currentTime + rand(0.1, 0.5), rand(0.006, 0.011), rand(-0.5, 0.5))
  }, 1000)

  // ---- Station life: PA jingle + announcement, nearby chatter -------------------
  const paTimer = window.setInterval(() => {
    if (stopped || !atPlatform || Math.random() > 1 / 6) return
    playJingle(locale)
  }, 4000)

  const platformVoiceTimer = window.setInterval(() => {
    if (stopped || !atPlatform || Math.random() > 0.45) return
    speakPhrase(context.currentTime + rand(0.1, 1.2), locale, { level: rand(0.006, 0.013), pan: rand(-0.6, 0.6), maxSyl: 6 })
  }, 1300)

  // ---- Random quiet passenger chatter inside the carriage while moving ----------
  const movingVoiceTimer = window.setInterval(() => {
    if (stopped || speed < 0.3 || inTunnel || Math.random() > 1 / 55) return
    speakPhrase(context.currentTime + rand(0.2, 1.5), locale, { level: rand(0.0035, 0.007), pan: rand(-0.45, 0.45), maxSyl: 4 })
  }, 1000)

  // ---- Vinyl crackle on the music bus -----------------------------------------
  const vinylTimer = window.setInterval(() => {
    if (musicPaused || stopped || Math.random() > 0.42) return
    burst(context.currentTime + 0.01, 'highpass', rand(1800, 2800), 0.7, rand(0.0012, 0.0045), 0.002, 0.02, musicBus)
  }, 130)

  // ---- Procedural door opening (entry screen) ------------------------------------
  const playDoorOpenSound = () => {
    const now = context.currentTime
    tone(now, 620, 120, 0.09, 0.045, 0.005, 'triangle')
    burst(now + 0.05, 'bandpass', 240, 1.0, 0.032, 0.18, 0.7, ambienceBus, 560)
    tone(now + 0.78, 95, 68, 0.14, 0.022, 0.01)
  }

  // ---- Brake application into a station ------------------------------------------
  let lastBrakes = -10
  const playBrakesSound = () => {
    const now = context.currentTime
    if (now - lastBrakes < 6) return
    lastBrakes = now
    burst(now, 'highpass', 2500, 0.6, 0.032, 0.15, 2.65)
    tone(now + 0.1, 300, 172, 1.15, 0.0075, 0.15)
    burst(now + 2.4, 'bandpass', 800, 1.1, 0.018, 0.05, 0.4)
    tone(now + 2.65, 68, 52, 0.13, 0.05, 0.012)
    burst(now + 2.65, 'lowpass', 300, 0.8, 0.025, 0.01, 0.09)
  }

  // ---- Leaving a station: loud whistle, conductor shout, door beeps, slam -----------
  const playDepartureSound = () => {
    const now = context.currentTime
    // loud conductor whistle — long-short double blast
    tone(now, 659, 655, 0.5, 0.026, 0.05)
    tone(now, 987, 983, 0.5, 0.017, 0.05)
    tone(now + 0.85, 659, 657, 0.28, 0.02, 0.04)
    tone(now + 0.85, 987, 985, 0.28, 0.013, 0.04)
    // the conductor's shout
    shout(now + 1.2, locale)
    // door closing warning: bip bip bip
    for (let i = 0; i < 3; i += 1) {
      tone(now + 2.1 + i * 0.17, 988, 986, 0.075, 0.009, 0.008, 'square')
    }
    // doors slam
    tone(now + 2.75, 74, 58, 0.16, 0.05, 0.012)
    burst(now + 2.75, 'lowpass', 320, 0.8, 0.02, 0.01, 0.1)
  }

  // ---- Generative fallback chords (when the stream is unreachable) -------------------
  let chord = 0
  const playChord = () => {
    const now = context.currentTime
    NOTES[chord % NOTES.length].forEach((frequency, index) => {
      const osc = context.createOscillator()
      const filter = context.createBiquadFilter()
      const gain = context.createGain()
      osc.type = index === 0 ? 'triangle' : 'sine'
      osc.frequency.value = frequency
      filter.type = 'lowpass'
      filter.frequency.value = 760
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.028, now + 0.7)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 6.8)
      osc.connect(filter).connect(gain).connect(musicBus)
      osc.start(now)
      osc.stop(now + 7)
    })
    chord++
  }

  let chordTimer: number | null = null
  let reconnectTimer: number | null = null

  const stopFallback = () => {
    if (chordTimer !== null) window.clearInterval(chordTimer)
    chordTimer = null
  }

  const startFallback = () => {
    if (stopped || chordTimer !== null) return
    playChord()
    chordTimer = window.setInterval(playChord, 7000)
    onSourceChange?.('fallback')
  }

  const scheduleReconnect = () => {
    if (stopped || musicPaused || reconnectTimer !== null) return
    reconnectTimer = window.setTimeout(async () => {
      reconnectTimer = null
      try {
        radio.load()
        await radio.play()
      } catch {
        scheduleReconnect()
      }
    }, 12000)
  }

  radio.addEventListener('playing', () => {
    if (musicPaused) return
    stopFallback()
    onSourceChange?.('radio')
  })
  radio.addEventListener('error', () => {
    if (musicPaused) return
    startFallback()
    scheduleReconnect()
  })

  const engine: AudioEngine = {
    context,
    startMusic: async () => {
      musicPaused = false
      set(vinylGain.gain, 0.0012, 0.5)
      try {
        radio.load()
        await radio.play()
        onSourceChange?.('radio')
      } catch {
        startFallback()
        scheduleReconnect()
      }
    },
    pauseMusic: () => {
      musicPaused = true
      set(vinylGain.gain, 0, 0.2)
      radio.pause()
      stopFallback()
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    },
    playDoorOpen: playDoorOpenSound,
    playBrakes: playBrakesSound,
    playDeparture: playDepartureSound,
    stop: () => {
      stopped = true
      musicPaused = true
      stopFallback()
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      window.clearInterval(clickTimer)
      window.clearInterval(dynamicsTimer)
      window.clearInterval(pointsTimer)
      window.clearInterval(bridgeTimer)
      window.clearInterval(gustTimer)
      window.clearInterval(squealTimer)
      window.clearInterval(passingTimer)
      window.clearInterval(paTimer)
      window.clearInterval(platformVoiceTimer)
      window.clearInterval(movingVoiceTimer)
      window.clearInterval(vinylTimer)
      radio.pause()
      radio.removeAttribute('src')
      radio.load()
      void context.close()
    },
    setWindowOpen: (value: number) => {
      windowOpenVal = clamp01(value)
      applyAmbience()
    },
    setSpeed: (value: number) => {
      speed = clamp01(value)
      applyAmbience()
    },
    setAtPlatform: (value: boolean) => {
      atPlatform = value
      applyAmbience()
    },
    setTunnel: (value: boolean) => {
      inTunnel = value
      applyAmbience()
    },
    setLocale: (value: Locale) => {
      locale = value
    },
    setMusicVolume: (value: number) => {
      set(musicBus.gain, clamp01(value), 0.08)
    },
    setRollingVolume: (value: number) => {
      set(rollingBus.gain, clamp01(value), 0.08)
    },
    setAmbienceVolume: (value: number) => {
      set(ambienceBus.gain, clamp01(value), 0.08)
    },
  }

  applyAmbience()
  return engine
}
