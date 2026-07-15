type AudioEngine = {
  context: AudioContext
  start: () => Promise<void>
  stop: () => void
  setWindowOpen: (value: number) => void
}

export type AudioSource = 'radio' | 'fallback'

const LOFI_STREAM_URL = 'https://radio.loficafe.net/listen/chilling/radio.mp3'

const NOTES = [
  [146.83, 174.61, 220],
  [130.81, 164.81, 196],
  [110, 146.83, 174.61],
  [123.47, 155.56, 196],
]

export function createAudioEngine(onSourceChange?: (source: AudioSource) => void): AudioEngine {
  const context = new AudioContext()
  const master = context.createGain()
  master.gain.value = 0.46
  master.connect(context.destination)

  // Lofi Cafe's official 24/7 Chilling stream. It is mixed through Web Audio
  // so the live station and our procedural train ambience share one control.
  const radio = new Audio()
  radio.crossOrigin = 'anonymous'
  radio.preload = 'none'
  radio.src = LOFI_STREAM_URL
  const radioSource = context.createMediaElementSource(radio)
  const radioGain = context.createGain()
  radioGain.gain.value = 0.72
  radioSource.connect(radioGain).connect(master)

  // Track the window open state (0.0 to 1.0)
  let windowOpenVal = 0.0

  // Rumble sound (lowpass filtered noise simulation of wheels on track)
  const rumbleFilter = context.createBiquadFilter()
  rumbleFilter.type = 'lowpass'
  rumbleFilter.frequency.value = 180
  const rumbleGain = context.createGain()
  rumbleGain.gain.value = 0.18
  rumbleFilter.connect(rumbleGain).connect(master)

  // Wind sound (bandpass filtered noise simulation of rushing air)
  const windFilter = context.createBiquadFilter()
  windFilter.type = 'bandpass'
  windFilter.frequency.value = 400
  windFilter.Q.value = 1.2
  const windGain = context.createGain()
  windGain.gain.value = 0.0 // starts fully silent when window is closed
  windFilter.connect(windGain).connect(master)

  // White noise buffer for both rumble and wind
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  
  const noise = context.createBufferSource()
  noise.buffer = buffer
  noise.loop = true
  noise.connect(rumbleFilter)
  noise.connect(windFilter)
  noise.start()

  // Low engine hum (deep bass tone)
  const lowOsc = context.createOscillator()
  const lowGain = context.createGain()
  lowOsc.type = 'sine'
  lowOsc.frequency.value = 42
  lowGain.gain.value = 0.09
  lowOsc.connect(lowGain).connect(master)
  lowOsc.start()

  // Procedural door opening sound (latch release click followed by sliding door whoosh)
  const playDoorOpenSound = () => {
    const now = context.currentTime
    
    // 1. Latch click (mechanical tick)
    const latchOsc = context.createOscillator()
    const latchGain = context.createGain()
    latchOsc.type = 'triangle'
    latchOsc.frequency.setValueAtTime(600, now)
    latchOsc.frequency.exponentialRampToValueAtTime(120, now + 0.08)
    
    latchGain.gain.setValueAtTime(0.04, now)
    latchGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08)
    
    latchOsc.connect(latchGain).connect(master)
    latchOsc.start(now)
    latchOsc.stop(now + 0.09)
    
    // 2. Sliding door whoosh (bandpass filtered noise sweep)
    const swooshFilter = context.createBiquadFilter()
    swooshFilter.type = 'bandpass'
    swooshFilter.frequency.setValueAtTime(250, now + 0.05)
    swooshFilter.frequency.exponentialRampToValueAtTime(550, now + 0.8)
    swooshFilter.Q.value = 1.0
    
    const swooshGain = context.createGain()
    swooshGain.gain.setValueAtTime(0.0, now)
    swooshGain.gain.linearRampToValueAtTime(0.035, now + 0.2)
    swooshGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9)
    
    noise.connect(swooshFilter)
    swooshFilter.connect(swooshGain).connect(master)
  }

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
      osc.connect(filter).connect(gain).connect(master)
      osc.start(now)
      osc.stop(now + 7)
    })
    chord++
  }

  // Rail clicks are modulated dynamically by window state
  const railClick = () => {
    const now = context.currentTime
    const osc = context.createOscillator()
    const gain = context.createGain()
    osc.type = 'triangle'
    // Clicks are slightly brighter and higher frequency when window is open
    osc.frequency.setValueAtTime((92 + Math.random() * 18) * (1.0 + windowOpenVal * 0.35), now)
    // Clicks are louder when window is open
    gain.gain.setValueAtTime(0.032 + windowOpenVal * 0.048, now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09 + windowOpenVal * 0.03)
    osc.connect(gain).connect(master)
    osc.start(now)
    osc.stop(now + 0.15)
  }

  let chordTimer: number | null = null
  let reconnectTimer: number | null = null
  let stopped = false

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
    if (stopped || reconnectTimer !== null) return
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
    stopFallback()
    onSourceChange?.('radio')
  })
  radio.addEventListener('error', () => {
    startFallback()
    scheduleReconnect()
  })

  playDoorOpenSound()
  const railTimer = window.setInterval(railClick, 560)

  // Dynamic wind speed modulation (gusts)
  const windModTimer = window.setInterval(() => {
    if (windowOpenVal > 0.05) {
      const now = context.currentTime
      // Fluctuate wind volume and pitch slightly to simulate wind gusts
      const targetFreq = 300 + windowOpenVal * 280 + Math.sin(now * 1.6) * 70
      const targetGain = windowOpenVal * (0.045 + Math.cos(now * 2.1) * 0.015)
      windFilter.frequency.setTargetAtTime(targetFreq, now, 0.15)
      windGain.gain.setTargetAtTime(targetGain, now, 0.15)
    }
  }, 150)

  return {
    context,
    start: async () => {
      try {
        await radio.play()
        onSourceChange?.('radio')
      } catch {
        startFallback()
        scheduleReconnect()
      }
    },
    stop: () => {
      stopped = true
      stopFallback()
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      window.clearInterval(railTimer)
      window.clearInterval(windModTimer)
      radio.pause()
      radio.removeAttribute('src')
      radio.load()
      context.close()
    },
    setWindowOpen: (value: number) => {
      windowOpenVal = value
      const now = context.currentTime
      
      // Muffle/unmuffle rumble. Goes from a deep 180Hz filter up to a brighter 680Hz filter.
      const rumbleFreq = 180 + value * 500
      const rumbleVol = 0.18 + value * 0.12
      rumbleFilter.frequency.setTargetAtTime(rumbleFreq, now, 0.1)
      rumbleGain.gain.setTargetAtTime(rumbleVol, now, 0.1)

      // The carriage radio recedes slightly as outside air becomes louder.
      radioGain.gain.setTargetAtTime(0.72 - value * 0.12, now, 0.18)

      // Set base wind volume
      if (value <= 0.05) {
        windGain.gain.setTargetAtTime(0.0, now, 0.1)
      } else {
        windGain.gain.setTargetAtTime(value * 0.045, now, 0.1)
      }
    }
  }
}
