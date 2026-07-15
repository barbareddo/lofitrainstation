import { useEffect, useMemo, useRef, useState } from 'react'
import Clock3 from 'lucide-react/dist/esm/icons/clock-3.mjs'
import Headphones from 'lucide-react/dist/esm/icons/headphones.mjs'
import MapPin from 'lucide-react/dist/esm/icons/map-pin.mjs'
import Maximize2 from 'lucide-react/dist/esm/icons/maximize-2.mjs'
import Pause from 'lucide-react/dist/esm/icons/pause.mjs'
import Play from 'lucide-react/dist/esm/icons/play.mjs'
import Radio from 'lucide-react/dist/esm/icons/radio.mjs'
import Route from 'lucide-react/dist/esm/icons/route.mjs'
import SlidersHorizontal from 'lucide-react/dist/esm/icons/sliders-horizontal.mjs'
import { createAudioEngine, type AudioSource } from './audio'

const TRAVEL_MS = 4 * 60 * 60 * 1000
const STOP_MS = 8 * 60 * 1000
const CYCLE_MS = TRAVEL_MS + STOP_MS
const EPOCH = new Date('2026-07-15T05:30:00+02:00').getTime()
const MUSIC_VOLUME_KEY = 'nightline.musicVolume'
const TRAIN_VOLUME_KEY = 'nightline.trainVolume'

function loadVolume(key: string, fallback: number) {
  try {
    const storedValue = window.localStorage.getItem(key)
    if (storedValue === null) return fallback
    const value = Number(storedValue)
    return Number.isFinite(value) && value >= 0 && value <= 100 ? value : fallback
  } catch {
    return fallback
  }
}

const scenes = [
  { src: '/scenes/milano-centrale-day.png', nightSrc: '/scenes/milano-centrale-night.png', label: 'Milano Centrale', detail: 'Platform 7 · Milano', at: 0, station: true },
  { src: '/scenes/milan-departure-v2.webp', label: 'Leaving Milano', detail: 'Lombardy · IT', at: 0.055 },
  { src: '/scenes/alps.webp', label: 'Crossing the Alps', detail: 'Val di Susa · IT', at: 0.31 },
  { src: '/scenes/france-countryside.webp', label: 'French countryside', detail: 'Bourgogne · FR', at: 0.64 },
  { src: '/scenes/paris-arrival.webp', label: 'Approaching Paris', detail: 'Île-de-France · FR', at: 0.87 },
  { src: '/scenes/paris-gare-de-lyon-day.png', nightSrc: '/scenes/paris-gare-de-lyon-night.png', label: 'Paris Gare de Lyon', detail: 'Arrival platform · Paris', at: 0.975, station: true },
]

function sceneOpacity(progress: number, index: number) {
  const blend = index === 1 || index === scenes.length - 1 ? 0.02 : 0.035
  const center = scenes[index].at
  const next = scenes[index + 1]?.at
  if (index > 0 && progress < center - blend) return 0
  if (index > 0 && progress < center + blend) return (progress - (center - blend)) / (blend * 2)
  if (next !== undefined && progress > next + blend) return 0
  if (next !== undefined && progress > next - blend) return ((next + blend) - progress) / (blend * 2)
  return 1
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function getTimeOfDay(date: Date) {
  const hour = date.getHours() + date.getMinutes() / 60
  const daylight = clamp(Math.sin(((hour - 5.5) / 15) * Math.PI))
  const dawnWarmth = clamp(1 - Math.abs(hour - 6.7) / 1.7)
  const sunsetWarmth = clamp(1 - Math.abs(hour - 18.7) / 2.2)
  const warmth = Math.max(dawnWarmth, sunsetWarmth)
  if (hour < 5.5 || hour >= 22) return { label: 'NIGHT', track: 'Midnight carriage', daylight, warmth, phase: 'night' }
  if (hour < 8) return { label: 'DAWN', track: 'First light over the rails', daylight, warmth, phase: 'dawn' }
  if (hour < 17) return { label: 'DAYLIGHT', track: 'Window seat sketches', daylight, warmth, phase: 'day' }
  if (hour < 20.5) return { label: 'GOLDEN HOUR', track: 'Sunset over Burgundy', daylight, warmth, phase: 'golden' }
  return { label: 'BLUE HOUR', track: 'Evening express', daylight, warmth, phase: 'dusk' }
}

function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours ? `${hours}h ${minutes.toString().padStart(2, '0')}m` : `${minutes} min`
}

function App() {
  const [now, setNow] = useState(Date.now())
  const [playing, setPlaying] = useState(false)
  const [audioSource, setAudioSource] = useState<AudioSource>('radio')
  const [showJourney, setShowJourney] = useState(false)
  const [showMixer, setShowMixer] = useState(false)
  const [musicVolume, setMusicVolume] = useState(() => loadVolume(MUSIC_VOLUME_KEY, 62))
  const [trainVolume, setTrainVolume] = useState(() => loadVolume(TRAIN_VOLUME_KEY, 55))
  const audio = useRef<ReturnType<typeof createAudioEngine> | null>(null)
  const musicFadeTimer = useRef<number | null>(null)
  
  // Landing screen vestibule states
  const [entered, setEntered] = useState(false)
  const [entering, setEntering] = useState(false)
  const [entryProgress, setEntryProgress] = useState(0)
  const [draggingEntry, setDraggingEntry] = useState(false)
  const [windowOpen, setWindowOpen] = useState(0) // 0 to 100 (percentage open)
  const [curtainHeight, setCurtainHeight] = useState(15) // 0 to 100 (percentage lowered)

  const isDraggingWindow = useRef(false)
  const windowDragStartY = useRef(0)
  const windowDragStartOpen = useRef(0)

  const isDraggingCurtain = useRef(false)
  const curtainDragStartY = useRef(0)
  const curtainDragStartHeight = useRef(0)

  const entryDragStartX = useRef(0)
  const entryDragStartProgress = useRef(0)
  const entryDragged = useRef(false)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => () => {
    if (musicFadeTimer.current !== null) window.clearTimeout(musicFadeTimer.current)
    audio.current?.stop()
  }, [])

  useEffect(() => {
    audio.current?.setMusicVolume(musicVolume / 100)
    try { window.localStorage.setItem(MUSIC_VOLUME_KEY, String(musicVolume)) } catch { /* storage unavailable */ }
  }, [musicVolume])

  useEffect(() => {
    audio.current?.setTrainVolume(trainVolume / 100)
    try { window.localStorage.setItem(TRAIN_VOLUME_KEY, String(trainVolume)) } catch { /* storage unavailable */ }
  }, [trainVolume])

  // Keep audio engine synchronized with windowOpen state changes
  useEffect(() => {
    if (audio.current) {
      audio.current.setWindowOpen(windowOpen / 100)
    }
  }, [windowOpen])

  // Window drag / toggle click handlers
  const handleWindowPointerDown = (e: React.PointerEvent) => {
    isDraggingWindow.current = true
    windowDragStartY.current = e.clientY
    windowDragStartOpen.current = windowOpen
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handleWindowPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingWindow.current) return
    const rect = e.currentTarget.parentElement?.getBoundingClientRect()
    if (!rect) return
    const deltaY = e.clientY - windowDragStartY.current
    const deltaPercent = (deltaY / rect.height) * 100
    const nextOpen = clamp(windowDragStartOpen.current + deltaPercent, 0, 100)
    setWindowOpen(nextOpen)
  }

  const handleWindowPointerUp = (e: React.PointerEvent) => {
    if (isDraggingWindow.current) {
      isDraggingWindow.current = false
      e.currentTarget.releasePointerCapture(e.pointerId)
      
      const deltaY = Math.abs(e.clientY - windowDragStartY.current)
      if (deltaY < 5) {
        // Toggle window fully open/closed
        setWindowOpen(prev => prev > 50 ? 0 : 100)
      }
    }
  }

  // Curtain drag / toggle click handlers
  const handleCurtainPointerDown = (e: React.PointerEvent) => {
    isDraggingCurtain.current = true
    curtainDragStartY.current = e.clientY
    curtainDragStartHeight.current = curtainHeight
    e.currentTarget.setPointerCapture(e.pointerId)
    e.stopPropagation() // Avoid triggering parent or window clicks
  }

  const handleCurtainPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingCurtain.current) return
    const rect = e.currentTarget.parentElement?.getBoundingClientRect()
    if (!rect) return
    const deltaY = e.clientY - curtainDragStartY.current
    const deltaPercent = (deltaY / rect.height) * 100
    const nextHeight = clamp(curtainDragStartHeight.current + deltaPercent, 0, 100)
    setCurtainHeight(nextHeight)
  }

  const handleCurtainPointerUp = (e: React.PointerEvent) => {
    if (isDraggingCurtain.current) {
      isDraggingCurtain.current = false
      e.currentTarget.releasePointerCapture(e.pointerId)
      
      const deltaY = Math.abs(e.clientY - curtainDragStartY.current)
      if (deltaY < 5) {
        // Toggle curtain fully raised/lowered
        setCurtainHeight(prev => prev > 50 ? 0 : 100)
      }
    }
  }

  const journey = useMemo(() => {
    const elapsed = ((now - EPOCH) % CYCLE_MS + CYCLE_MS) % CYCLE_MS
    const stopped = elapsed >= TRAVEL_MS
    const progress = stopped ? 1 : elapsed / TRAVEL_MS
    const remaining = stopped ? CYCLE_MS - elapsed : TRAVEL_MS - elapsed
    const arrival = new Date(now + (stopped ? 0 : remaining))
    const currentIndex = [...scenes].reverse().findIndex((scene) => progress >= scene.at)
    const sceneIndex = scenes.length - 1 - currentIndex
    const departureSpeed = clamp((progress - 0.012) / 0.055)
    const arrivalSpeed = clamp((1 - progress) / 0.055)
    const speed = stopped ? 0 : Math.min(departureSpeed, arrivalSpeed)
    return { elapsed, stopped, progress, remaining, arrival, speed, sceneIndex: Math.max(0, sceneIndex), scene: scenes[Math.max(0, sceneIndex)] }
  }, [now])

  const timeOfDay = useMemo(() => getTimeOfDay(new Date(now)), [now])
  const localTime = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const ensureAudio = async () => {
    let engine = audio.current
    if (!engine) {
      engine = createAudioEngine(setAudioSource)
      audio.current = engine
      engine.setMusicVolume(musicVolume / 100)
      engine.setTrainVolume(trainVolume / 100)
      engine.setWindowOpen(windowOpen / 100)
    }
    if (engine.context.state === 'suspended') await engine.context.resume()
    return engine
  }

  const toggleMusic = async () => {
    if (playing) {
      audio.current?.pauseMusic()
      setPlaying(false)
    } else {
      const engine = await ensureAudio()
      engine.setMusicVolume(musicVolume / 100)
      await engine.startMusic()
      setPlaying(true)
    }
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen()
    else document.exitFullscreen()
  }

  // Handle the vestibule door as a physical, draggable sliding panel.
  const handleEnter = async () => {
    if (entering || entered) return
    setEntering(true)
    setEntryProgress(1)

    const engine = await ensureAudio()
    engine.playDoorOpen()

    // Begin the stream during the user's gesture, but keep it silent until
    // the door has visually opened. This respects browser autoplay rules.
    if (!playing) {
      engine.setMusicVolume(0)
      await engine.startMusic()
      setPlaying(true)
      if (musicFadeTimer.current !== null) window.clearTimeout(musicFadeTimer.current)
      musicFadeTimer.current = window.setTimeout(() => {
        engine.setMusicVolume(musicVolume / 100)
      }, 1200)
    }
    
    // Match CSS transition timing (1.4s) before unmounting overlay
    setTimeout(() => {
      setEntered(true)
    }, 1550)
  }

  const handleEntryPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (entering) return
    // Browsers require a user gesture before audio can start. From the first
    // touch or drag, the vestibule plays train ambience only.
    void ensureAudio()
    entryDragStartX.current = e.clientX
    entryDragStartProgress.current = entryProgress
    entryDragged.current = false
    setDraggingEntry(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handleEntryPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingEntry || entering) return
    const distance = e.clientX - entryDragStartX.current
    if (Math.abs(distance) > 5) entryDragged.current = true
    const travel = Math.min(720, Math.max(280, window.innerWidth * 0.52))
    setEntryProgress(clamp(entryDragStartProgress.current + distance / travel))
  }

  const handleEntryPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingEntry || entering) return
    setDraggingEntry(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)

    if (!entryDragged.current || entryProgress > 0.34) {
      void handleEnter()
    } else {
      setEntryProgress(0)
    }
  }

  const handleEntryKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      void handleEnter()
    }
  }

  return (
    <main
      className={`station station--${timeOfDay.phase} ${!entered ? 'station--not-entered' : ''} ${entering ? 'station--entering' : ''}`}
      style={{ '--entry-reveal': entryProgress } as React.CSSProperties}
    >
      {!entered && (
        <div className={`corridor-overlay ${entering ? 'corridor-overlay--entering' : ''} ${draggingEntry ? 'corridor-overlay--dragging' : ''}`}>
          <div className="vestibule-backdrop" aria-hidden="true" />
          <div className="vestibule-light" aria-hidden="true" />
          <div
            className="entry-portal"
            style={{ '--door-open': entryProgress } as React.CSSProperties}
            onPointerDown={handleEntryPointerDown}
            onPointerMove={handleEntryPointerMove}
            onPointerUp={handleEntryPointerUp}
            onPointerCancel={handleEntryPointerUp}
            onKeyDown={handleEntryKeyDown}
            role="button"
            tabIndex={0}
            aria-label="Slide the door to the right to enter the carriage"
          >
            <div className="cabin-glimpse" aria-hidden="true">
              <div className="glimpse-landscape" style={{ backgroundImage: `url(${journey.scene.src})` }} />
              <img src="/train-carriage.webp" alt="" />
              <div className="glimpse-light" />
            </div>
            <div className="sliding-door" aria-hidden="true">
              <div className="door-reflection" />
            </div>
            <div className="door-shadow" aria-hidden="true" />
          </div>
          <div className="door-prompt">
            <small>COACH 07 · NIGHTLINE</small>
            <strong><span>→</span> SLIDE THE DOOR TO ENTER</strong>
            <em>or tap to open</em>
          </div>
        </div>
      )}
      <div
        className={`world ${journey.stopped ? 'world--stopped' : ''} ${journey.scene.station ? 'world--platform' : ''}`}
        style={{
          '--scene-brightness': 0.4 + timeOfDay.daylight * 0.6,
          '--scene-saturation': 0.72 + timeOfDay.daylight * 0.28,
          '--scene-sepia': timeOfDay.warmth * 0.16,
          '--speed-opacity': journey.speed * 0.17,
        } as React.CSSProperties}
        aria-hidden="true"
      >
        {scenes.map((scene, index) => (entered || entering) && Math.abs(index - journey.sceneIndex) <= 1 && (
          <div
            className={`scene-stage ${scene.station ? 'scene-stage--station' : ''}`}
            key={scene.label}
            style={{ opacity: sceneOpacity(journey.progress, index) }}
          >
            <div
              className="scene scene--day"
              style={{
                backgroundImage: `url(${scene.src})`,
                opacity: scene.nightSrc ? timeOfDay.daylight : 1,
                '--drift': `${-3 - index * 0.7}%`,
              } as React.CSSProperties}
            />
            {scene.nightSrc && <div
              className="scene scene--night"
              style={{
                backgroundImage: `url(${scene.nightSrc})`,
                opacity: 1 - timeOfDay.daylight,
                '--drift': `${-3 - index * 0.7}%`,
              } as React.CSSProperties}
            />}
          </div>
        ))}
        <div className="night-wash" style={{ opacity: (1 - timeOfDay.daylight) * 0.24 }} />
        <div className="golden-wash" style={{ opacity: timeOfDay.warmth * 0.2 }} />
        <div className="speed-lines" />
      </div>

      <div className="carriage-wrapper">
        <img className="carriage" src="/train-carriage.webp" alt="Cozy train compartment looking onto the journey" />
        
        {/* Sliding Window Glass Overlay */}
        <div className="window-container">
          <div
            className="window-glass"
            style={{ transform: `translateY(${(windowOpen / 100) * 86}%)` }}
            onPointerDown={handleWindowPointerDown}
            onPointerMove={handleWindowPointerMove}
            onPointerUp={handleWindowPointerUp}
            aria-label="Train window glass, drag or tap handle to slide open/close"
          >
            <div className="window-handle" />
          </div>
        </div>

        {/* Pull-down Fabric Curtain Overlay */}
        <div className="curtain-container">
          <div
            className="curtain-fabric"
            style={{ height: `${curtainHeight}%` }}
          >
            <div
              className="curtain-pullbar"
              onPointerDown={handleCurtainPointerDown}
              onPointerMove={handleCurtainPointerMove}
              onPointerUp={handleCurtainPointerUp}
              aria-label="Curtain pull-bar, drag or tap to raise/lower"
            >
              <div className="curtain-ring" />
            </div>
          </div>
        </div>
      </div>
      <div className="vignette" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <header className="topbar">
        <button className="brand" onClick={() => setShowJourney(false)} aria-label="Nightline home">
          <span className="brand-mark"><Radio size={18} /></span>
          <span><b>NIGHTLINE</b><small>LOFI RADIO</small></span>
        </button>
        <div className="live"><span /> LIVE JOURNEY</div>
        <div className="top-actions">
          <div className="time-badge"><Clock3 size={14} /><span>{timeOfDay.label}</span><b>{localTime}</b></div>
          <button className="icon-button" onClick={toggleFullscreen} aria-label="Toggle fullscreen"><Maximize2 size={18} /></button>
        </div>
      </header>

      <section className="trip-card">
        <div className="eyebrow">{journey.stopped ? 'NOW AT PLATFORM' : 'CURRENT JOURNEY'}</div>
        <div className="route-title">
          <div><strong>MIL</strong><span>Milano</span></div>
          <div className="route-line"><i /><Route size={18} /><i /></div>
          <div className="align-right"><strong>PAR</strong><span>Paris</span></div>
        </div>
        <div className="progress-track"><span style={{ width: `${journey.progress * 100}%` }}><i /></span></div>
        <div className="trip-meta">
          <div><MapPin size={15} /><span><small>NOW PASSING</small>{journey.scene.detail}</span></div>
          <div className="align-right"><small>{journey.stopped ? 'DEPARTING AGAIN' : 'ARRIVAL'}</small><b>{journey.stopped ? formatDuration(journey.remaining) : journey.arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b></div>
        </div>
      </section>

      <section className="now-playing">
        <div className={`cover ${playing ? 'cover--playing' : ''}`}><Headphones size={23} /></div>
        <div className="track-copy">
          <small>NOW PLAYING · {audioSource === 'radio' ? 'LIVE 24/7' : timeOfDay.label}</small>
          <strong>{audioSource === 'radio' ? 'Chilling' : timeOfDay.track}</strong>
          <span>{audioSource === 'radio' ? <><a href="https://loficafe.net/chilling" target="_blank" rel="noreferrer">Lofi Cafe</a> · Train ambience</> : 'Original generative fallback · 72 BPM'}</span>
        </div>
        <div className="wave" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ '--i': i } as React.CSSProperties} />)}</div>
        <button className="play" onClick={toggleMusic} aria-label={playing ? 'Pause radio' : 'Play radio'}>
          {playing ? <Pause fill="currentColor" size={21} /> : <Play fill="currentColor" size={21} />}
        </button>
      </section>

      <section className={`sound-mixer ${showMixer ? 'sound-mixer--open' : ''}`} aria-label="Sound mixer" aria-hidden={!showMixer}>
        <div className="mixer-heading"><span>YOUR SOUND MIX</span><b>Saved automatically</b></div>
        <label>
          <span><b>Music</b><em>{musicVolume}%</em></span>
          <input aria-label="Music volume" type="range" min="0" max="100" value={musicVolume} onChange={(event) => setMusicVolume(Number(event.target.value))} />
        </label>
        <label>
          <span><b>Train ambience</b><em>{trainVolume}%</em></span>
          <input aria-label="Train ambience volume" type="range" min="0" max="100" value={trainVolume} onChange={(event) => setTrainVolume(Number(event.target.value))} />
        </label>
      </section>

      <div className="bottom-actions">
        <button className="journey-button" onClick={() => setShowJourney((value) => !value)}><Route size={17} /> View journey</button>
        <button className={`sound-button ${showMixer ? 'sound-button--active' : ''}`} onClick={() => setShowMixer((value) => !value)} aria-label="Open sound mixer" aria-expanded={showMixer}><SlidersHorizontal size={18} /></button>
      </div>

      <aside className={`journey-panel ${showJourney ? 'journey-panel--open' : ''}`}>
        <div className="eyebrow">THE ROUTE</div>
        <h2>Milano → Paris</h2>
        <p>A slow radio journey, unfolding in real time.</p>
        <ol>
          {scenes.map((scene, index) => {
            const reached = journey.progress >= scene.at
            return <li className={reached ? 'reached' : ''} key={scene.label}><i /> <span><b>{scene.label}</b><small>{scene.detail}</small></span>{index === scenes.length - 1 && <em>ETA {journey.arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</em>}</li>
          })}
        </ol>
        <div className="next-route"><small>COMING NEXT</small><b>Paris → Berlin</b><span>Next route pack in preparation</span></div>
      </aside>
    </main>
  )
}

export default App
