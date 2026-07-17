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
import Square from 'lucide-react/dist/esm/icons/square.mjs'
import Volume2 from 'lucide-react/dist/esm/icons/volume-2.mjs'
import { createAudioEngine, type AudioSource } from './audio'

const TRAVEL_MS = 4 * 60 * 60 * 1000
const STOP_MS = 8 * 60 * 1000
const CALAIS_STOP_MS = 5 * 60 * 1000
const EPOCH = new Date('2026-07-15T05:30:00+02:00').getTime()
const MUSIC_VOLUME_KEY = 'nightline.musicVolume'
const TRAIN_VOLUME_KEY = 'nightline.trainVolume'
const ROLLING_VOLUME_KEY = 'nightline.rollingVolume'
const AMBIENCE_VOLUME_KEY = 'nightline.ambienceVolume'

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

interface Scene {
  label: string
  detail: string
  at: number
  station?: boolean
  stopMs?: number
  tunnel?: boolean
  daySrc: string
  dawnSrc?: string
  afternoonSrc?: string
  goldenSrc?: string
  duskSrc?: string
  nightSrc?: string
}

interface RouteData {
  id: string
  name: string
  fromCode: string
  fromName: string
  toCode: string
  toName: string
  scenes: Scene[]
}

type ScenePhase = 'night' | 'dawn' | 'day' | 'afternoon' | 'golden' | 'dusk'
const SCENE_PHASES: ScenePhase[] = ['dawn', 'day', 'afternoon', 'golden', 'dusk', 'night']

const milanoParisScenes: Scene[] = [
  { daySrc: '/scenes/milano-centrale-day.png', dawnSrc: '/scenes/milano-centrale-dawn.jpg', afternoonSrc: '/scenes/milano-centrale-afternoon.jpg', goldenSrc: '/scenes/milano-centrale-golden.jpg', duskSrc: '/scenes/milano-centrale-dusk.jpg', nightSrc: '/scenes/milano-centrale-night.png', label: 'Milano Centrale', detail: 'Platform 7 · Milano', at: 0, station: true },
  { daySrc: '/scenes/milan-departure-day.jpg', dawnSrc: '/scenes/milan-departure-dawn.jpg', afternoonSrc: '/scenes/milan-departure-afternoon.jpg', goldenSrc: '/scenes/milan-departure-v2.webp', duskSrc: '/scenes/milan-departure-dusk.jpg', nightSrc: '/scenes/milan-departure-night.jpg', label: 'Leaving Milano', detail: 'Lombardy · IT', at: 0.055 },
  { daySrc: '/scenes/alps-day.jpg', dawnSrc: '/scenes/alps-dawn.jpg', afternoonSrc: '/scenes/alps-afternoon.jpg', goldenSrc: '/scenes/alps.webp', duskSrc: '/scenes/alps-dusk.jpg', nightSrc: '/scenes/alps-night.jpg', label: 'Crossing the Alps', detail: 'Val di Susa · IT', at: 0.31 },
  { daySrc: '/scenes/france-countryside-day.jpg', dawnSrc: '/scenes/france-countryside-dawn.jpg', afternoonSrc: '/scenes/france-countryside-afternoon.jpg', goldenSrc: '/scenes/france-countryside.webp', duskSrc: '/scenes/france-countryside-dusk.jpg', nightSrc: '/scenes/france-countryside-night.jpg', label: 'French countryside', detail: 'Bourgogne · FR', at: 0.64 },
  { daySrc: '/scenes/paris-arrival-day.jpg', dawnSrc: '/scenes/paris-arrival-dawn.jpg', afternoonSrc: '/scenes/paris-arrival-afternoon.jpg', goldenSrc: '/scenes/paris-arrival.webp', duskSrc: '/scenes/paris-arrival-dusk.jpg', nightSrc: '/scenes/paris-arrival-night.jpg', label: 'Approaching Paris', detail: 'Île-de-France · FR', at: 0.87 },
  { daySrc: '/scenes/paris-gare-de-lyon-day.png', dawnSrc: '/scenes/paris-gare-de-lyon-dawn.jpg', afternoonSrc: '/scenes/paris-gare-de-lyon-afternoon.jpg', goldenSrc: '/scenes/paris-gare-de-lyon-golden.jpg', duskSrc: '/scenes/paris-gare-de-lyon-dusk.jpg', nightSrc: '/scenes/paris-gare-de-lyon-night.png', label: 'Paris Gare de Lyon', detail: 'Arrival platform · Paris', at: 0.975, station: true },
]

const parisLondonScenes: Scene[] = [
  { ...milanoParisScenes[milanoParisScenes.length - 1], detail: 'Departure platform · Paris', at: 0 },
  { daySrc: '/scenes/picardy-countryside-day-v2.png', label: 'Picardy Countryside', detail: 'Hauts-de-France · FR', at: 0.20 },
  { daySrc: '/scenes/calais-terminal-day-v3.png', label: 'Calais-Fréthun Terminal', detail: 'Eurotunnel Port · Calais', at: 0.45, station: true, stopMs: CALAIS_STOP_MS },
  {
    daySrc: '/scenes/channel-tunnel-day-v2.png',
    dawnSrc: '/scenes/channel-tunnel-day-v2.png',
    afternoonSrc: '/scenes/channel-tunnel-day-v2.png',
    goldenSrc: '/scenes/channel-tunnel-day-v2.png',
    duskSrc: '/scenes/channel-tunnel-day-v2.png',
    nightSrc: '/scenes/channel-tunnel-day-v2.png',
    label: 'The Channel Tunnel',
    detail: 'Under the English Channel',
    at: 0.60,
    tunnel: true
  },
  { daySrc: '/scenes/kent-downs-day-v2.png', label: 'Kent Downs', detail: 'Kent · UK', at: 0.80 },
  { daySrc: '/scenes/london-st-pancras-day-v3.png', label: 'London St Pancras Intl', detail: 'Arrival platform · London', at: 0.975, station: true },
]

function reverseScenes(scenes: Scene[], departureDetail: string, arrivalDetail: string): Scene[] {
  const lastIndex = scenes.length - 1
  return [...scenes].reverse().map((scene, index) => ({
    ...scene,
    at: index === 0 ? 0 : index === lastIndex ? 0.975 : 1 - scene.at,
    detail: index === 0 ? departureDetail : index === lastIndex ? arrivalDetail : scene.detail,
  }))
}

const routes: RouteData[] = [
  {
    id: 'milano_paris',
    name: 'Milano → Paris',
    fromCode: 'MIL',
    fromName: 'Milano',
    toCode: 'PAR',
    toName: 'Paris',
    scenes: milanoParisScenes,
  },
  {
    id: 'paris_london',
    name: 'Paris → London',
    fromCode: 'PAR',
    fromName: 'Paris',
    toCode: 'LON',
    toName: 'London',
    scenes: parisLondonScenes,
  },
  {
    id: 'london_paris',
    name: 'London → Paris',
    fromCode: 'LON',
    fromName: 'London',
    toCode: 'PAR',
    toName: 'Paris',
    scenes: reverseScenes(parisLondonScenes, 'Departure platform · London', 'Arrival platform · Paris'),
  },
  {
    id: 'paris_milano',
    name: 'Paris → Milano',
    fromCode: 'PAR',
    fromName: 'Paris',
    toCode: 'MIL',
    toName: 'Milano',
    scenes: reverseScenes(milanoParisScenes, 'Departure platform · Paris', 'Platform 7 · Milano'),
  }
]

function getRouteTravelMs(route: RouteData) {
  return TRAVEL_MS + route.scenes.reduce((total, scene) => total + (scene.stopMs || 0), 0)
}

function getRouteLegMs(route: RouteData) {
  return getRouteTravelMs(route) + STOP_MS
}

const FULL_CYCLE_MS = routes.reduce((total, route) => total + getRouteLegMs(route), 0)

function sceneOpacity(progress: number, index: number, currentScenes: Scene[]) {
  const blend = index === 1 || index === currentScenes.length - 1 ? 0.02 : 0.035
  const center = currentScenes[index].at
  const next = currentScenes[index + 1]?.at
  if (index > 0 && progress < center - blend) return 0
  if (index > 0 && progress < center + blend) return (progress - (center - blend)) / (blend * 2)
  if (next !== undefined && progress > next + blend) return 0
  if (next !== undefined && progress > next - blend) return ((next + blend) - progress) / (blend * 2)
  return 1
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function getSceneSrcForPhase(scene: Scene, phase: ScenePhase): string {
  if (phase === 'dawn') return scene.dawnSrc || scene.daySrc
  if (phase === 'afternoon') return scene.afternoonSrc || scene.daySrc
  if (phase === 'golden') return scene.goldenSrc || scene.daySrc
  if (phase === 'dusk') return scene.duskSrc || scene.daySrc
  if (phase === 'night') return scene.nightSrc || scene.daySrc
  return scene.daySrc
}

function getPreviewSceneSrc(scene: Scene, phase: ScenePhase): string {
  if (phase === 'dawn') return scene.dawnSrc || scene.goldenSrc || scene.daySrc
  if (phase === 'dusk') return scene.duskSrc || scene.nightSrc || scene.goldenSrc || scene.daySrc
  return getSceneSrcForPhase(scene, phase)
}

function getTimeOfDay(date: Date) {
  const hour = date.getHours() + date.getMinutes() / 60
  const weights = { night: 0, dawn: 0, day: 0, afternoon: 0, golden: 0, dusk: 0 }

  const blend = (from: keyof typeof weights, to: keyof typeof weights, start: number, end: number) => {
    const progress = clamp((hour - start) / (end - start))
    weights[from] = 1 - progress
    weights[to] = progress
  }

  if (hour < 5 || hour >= 23) weights.night = 1
  else if (hour < 6) blend('night', 'dawn', 5, 6)
  else if (hour < 7.5) weights.dawn = 1
  else if (hour < 8.5) blend('dawn', 'day', 7.5, 8.5)
  else if (hour < 13.5) weights.day = 1
  else if (hour < 14.5) blend('day', 'afternoon', 13.5, 14.5)
  else if (hour < 16.5) weights.afternoon = 1
  else if (hour < 17.5) blend('afternoon', 'golden', 16.5, 17.5)
  else if (hour < 19.75) weights.golden = 1
  else if (hour < 20.75) blend('golden', 'dusk', 19.75, 20.75)
  else if (hour < 22) weights.dusk = 1
  else blend('dusk', 'night', 22, 23)

  const phases = [
    { name: 'night', label: 'NIGHT', track: 'Midnight carriage' },
    { name: 'dawn', label: 'EARLY MORNING', track: 'First light over the rails' },
    { name: 'day', label: 'DAYLIGHT', track: 'Window seat sketches' },
    { name: 'afternoon', label: 'AFTERNOON', track: 'Afternoon miles' },
    { name: 'golden', label: 'GOLDEN HOUR', track: 'Sunset over Burgundy' },
    { name: 'dusk', label: 'BLUE HOUR', track: 'Evening express' }
  ] as const

  const maxPhaseName = (Object.keys(weights) as Array<keyof typeof weights>).reduce((a, b) => weights[a] > weights[b] ? a : b)
  const activePhase = phases.find(p => p.name === maxPhaseName) || phases[0]

  const daylight = weights.day + weights.afternoon * 0.9 + (weights.dawn + weights.golden) * 0.72 + weights.dusk * 0.32
  const warmth = Math.max(weights.dawn * 0.52, weights.afternoon * 0.18, weights.golden, weights.dusk * 0.28)

  return {
    label: activePhase.label,
    track: activePhase.track,
    phase: activePhase.name,
    daylight,
    warmth,
    weights,
  }
}

function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours ? `${hours}h ${minutes.toString().padStart(2, '0')}m` : `${minutes} min`
}

// Which country's sound palette the current scene/station should use
function getSceneLocale(scene: Scene): 'fr' | 'uk' | 'it' {
  if (scene.label.includes('London') || scene.detail.endsWith('· UK')) return 'uk'
  if (scene.label.includes('Milano') || scene.label.includes('Milan') || scene.detail.endsWith('· IT')) return 'it'
  return 'fr'
}

function App() {
  const [now, setNow] = useState(Date.now())
  const [playing, setPlaying] = useState(false)
  const [audioSource, setAudioSource] = useState<AudioSource>('radio')
  const [showJourney, setShowJourney] = useState(false)
  const [showMixer, setShowMixer] = useState(false)
  const [musicVolume, setMusicVolume] = useState(() => loadVolume(MUSIC_VOLUME_KEY, 62))
  const [rollingVolume, setRollingVolume] = useState(() => loadVolume(ROLLING_VOLUME_KEY, loadVolume(TRAIN_VOLUME_KEY, 55)))
  const [ambienceVolume, setAmbienceVolume] = useState(() => loadVolume(AMBIENCE_VOLUME_KEY, loadVolume(TRAIN_VOLUME_KEY, 55)))
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

  // Realism layer: DOM refs for the rAF-driven motion/light loop
  const rigRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const nearFieldRef = useRef<HTMLDivElement>(null)
  const poleStripRef = useRef<HTMLDivElement>(null)
  const tunnelStripsRef = useRef<HTMLDivElement>(null)
  const lightBandsRef = useRef<HTMLDivElement>(null)
  const tunnelGlowRef = useRef<HTMLDivElement>(null)

  // Realism layer: mutable values shared with the frame loop
  const speedTargetRef = useRef(0)
  const joltRef = useRef(0)
  const daylightRef = useRef(0)
  const tunnelRef = useRef(false)
  const enteredRef = useRef(false)
  const reducedMotionRef = useRef(false)
  const brakedRef = useRef(false)
  const wasStoppedRef = useRef(false)
  const prevSpeedRef = useRef(0)

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
    audio.current?.setRollingVolume(rollingVolume / 100)
    try { window.localStorage.setItem(ROLLING_VOLUME_KEY, String(rollingVolume)) } catch { /* storage unavailable */ }
  }, [rollingVolume])

  useEffect(() => {
    audio.current?.setAmbienceVolume(ambienceVolume / 100)
    try { window.localStorage.setItem(AMBIENCE_VOLUME_KEY, String(ambienceVolume)) } catch { /* storage unavailable */ }
  }, [ambienceVolume])

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

  const itineraryElapsed = ((now - EPOCH) % FULL_CYCLE_MS + FULL_CYCLE_MS) % FULL_CYCLE_MS
  let currentRouteIndex = 0
  let legElapsed = itineraryElapsed
  while (legElapsed >= getRouteLegMs(routes[currentRouteIndex])) {
    legElapsed -= getRouteLegMs(routes[currentRouteIndex])
    currentRouteIndex += 1
  }
  const currentRoute = routes[currentRouteIndex]
  const routeTravelMs = getRouteTravelMs(currentRoute)
  const routeLegMs = getRouteLegMs(currentRoute)
  const nextRoute = routes[(currentRouteIndex + 1) % routes.length]

  const journey = useMemo(() => {
    const elapsed = legElapsed
    const stopped = elapsed >= routeTravelMs
    const currentScenes = currentRoute.scenes
    const timedStops = currentScenes.filter((scene) => scene.stopMs)
    let completedStopMs = 0
    let progress = stopped ? 1 : 0
    let midRouteStopped = false
    let intermediateStopRemaining = 0

    if (!stopped) {
      for (const station of timedStops) {
        const stopArrival = station.at * TRAVEL_MS + completedStopMs
        const stopDeparture = stopArrival + (station.stopMs || 0)
        if (elapsed < stopArrival) break
        if (elapsed < stopDeparture) {
          progress = station.at
          midRouteStopped = true
          intermediateStopRemaining = stopDeparture - elapsed
          break
        }
        completedStopMs += station.stopMs || 0
      }
      if (!midRouteStopped) progress = clamp((elapsed - completedStopMs) / TRAVEL_MS)
    }

    const remaining = stopped ? routeLegMs - elapsed : routeTravelMs - elapsed
    const arrival = new Date(now + (stopped ? 0 : remaining))
    const currentIndex = [...currentScenes].reverse().findIndex((scene) => progress >= scene.at)
    const sceneIndex = currentScenes.length - 1 - currentIndex
    const departureSpeed = clamp((progress - 0.012) / 0.055)
    const arrivalSpeed = clamp((1 - progress) / 0.055)

    let speedScale = Math.min(departureSpeed, arrivalSpeed)
    for (const station of timedStops) {
      const transition = 0.02
      if (progress >= station.at - transition && progress < station.at) {
        speedScale *= (station.at - progress) / transition
      } else if (progress > station.at && progress <= station.at + transition) {
        speedScale *= (progress - station.at) / transition
      }
    }

    const speed = stopped || midRouteStopped ? 0 : speedScale
    return { elapsed, stopped, progress, remaining, arrival, speed, sceneIndex: Math.max(0, sceneIndex), scene: currentScenes[Math.max(0, sceneIndex)], midRouteStopped, intermediateStopRemaining }
  }, [now, currentRoute, legElapsed, routeLegMs, routeTravelMs])

  const isAtPlatform = journey.stopped || journey.midRouteStopped
  const departureCountdown = journey.midRouteStopped ? journey.intermediateStopRemaining : journey.remaining
  const isTunnel = Boolean(journey.scene.tunnel)
  const locale = getSceneLocale(journey.scene)

  const timeOfDay = useMemo(() => getTimeOfDay(new Date(now)), [now])
  const localTime = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  // ---- Realism layer ---------------------------------------------------------
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reducedMotionRef.current = media.matches }
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => { enteredRef.current = entered }, [entered])
  useEffect(() => { daylightRef.current = timeOfDay.daylight }, [timeOfDay.daylight])
  useEffect(() => { tunnelRef.current = isTunnel }, [isTunnel])

  // Feed live speed into the audio engine and fire travel one-shots
  useEffect(() => {
    speedTargetRef.current = journey.speed
    const engine = audio.current
    if (engine) {
      engine.setSpeed(journey.speed)
      const previous = prevSpeedRef.current
      if (previous > 0.45 && journey.speed < 0.3 && !brakedRef.current) {
        engine.playBrakes()
        brakedRef.current = true
      }
      if (journey.speed > 0.55) brakedRef.current = false
      if (wasStoppedRef.current && previous < 0.03 && journey.speed >= 0.03) engine.playDeparture()
    }
    prevSpeedRef.current = journey.speed
  }, [journey.speed])

  useEffect(() => {
    wasStoppedRef.current = isAtPlatform
    audio.current?.setAtPlatform(isAtPlatform)
  }, [isAtPlatform])

  useEffect(() => {
    audio.current?.setTunnel(isTunnel)
  }, [isTunnel])

  useEffect(() => {
    audio.current?.setLocale(locale)
  }, [locale])

  // One frame loop driving seamless parallax, carriage vibration and light play
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let speed = 0
    let farX = 0
    let nearX = 0
    let poleX = 0
    let stripX = 0
    let bandX = 0
    let frameW = 0
    const seed = Math.random() * 100

    const NEAR_TILE = 480
    const POLE_TILE = 540
    const STRIP_TILE = 460
    const BAND_TILE = 560

    const onResize = () => { frameW = 0 }
    window.addEventListener('resize', onResize)

    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      speed += (speedTargetRef.current - speed) * Math.min(1, dt * 1.4)
      const reduced = reducedMotionRef.current
      const motion = reduced ? 0 : speed

      // Far scenery: seamless one-directional mirrored loop
      const world = worldRef.current
      if (world && enteredRef.current) {
        if (!frameW) {
          const frame = world.querySelector<HTMLElement>('.scene-frame')
          if (frame) frameW = frame.offsetWidth
        }
        if (frameW) {
          farX = (farX + dt * motion * 30) % (frameW * 2)
          world.querySelectorAll<HTMLElement>('.scene-track').forEach((track) => {
            track.style.transform = `translate3d(${-farX}px, 0, 0)`
          })
        }
        // Scenery judder: the world rattles relative to the carriage
        const jx = (Math.sin(t * 0.021) + Math.sin(t * 0.037 + 1.7) * 0.6) * motion * 0.9
        const jy = (Math.sin(t * 0.027 + 0.6) + Math.sin(t * 0.043 + 2.4) * 0.6) * motion * 0.6
        world.style.transform = `translate3d(${jx.toFixed(2)}px, ${jy.toFixed(2)}px, 0)`
      }

      // Foreground vegetation rushing past, catenary poles, tunnel light strips
      nearX = (nearX + dt * motion * 340) % NEAR_TILE
      if (nearFieldRef.current) nearFieldRef.current.style.transform = `translate3d(${-nearX}px, 0, 0)`
      poleX = (poleX + dt * motion * 620) % POLE_TILE
      if (poleStripRef.current) poleStripRef.current.style.transform = `translate3d(${-poleX}px, 0, 0)`
      stripX = (stripX + dt * motion * 880) % STRIP_TILE
      if (tunnelStripsRef.current) tunnelStripsRef.current.style.transform = `translate3d(${-stripX}px, 0, 0)`

      // Sunlight flickering through trees across the interior
      bandX = (bandX + dt * motion * 520) % BAND_TILE
      const bands = lightBandsRef.current
      if (bands) {
        const base = daylightRef.current * motion * 0.75
        const flicker = 0.72 + 0.28 * Math.sin(t * 0.011 + seed) + 0.12 * Math.sin(t * 0.029)
        bands.style.opacity = (base * flicker).toFixed(3)
        bands.style.backgroundPosition = `${-bandX}px 0`
      }
      const tunnelGlow = tunnelGlowRef.current
      if (tunnelGlow) {
        tunnelGlow.style.opacity = tunnelRef.current && !reduced
          ? (0.06 + 0.05 * Math.sin(t * 0.03) * motion).toFixed(3)
          : '0'
      }

      // Carriage vibration + rail-joint jolts synced with the click audio
      const rig = rigRef.current
      if (rig) {
        joltRef.current *= Math.exp(-dt * 5.5)
        const jolt = reduced ? 0 : joltRef.current
        const amp = motion
        const rx = (Math.sin(t * 0.023 + 0.9) + Math.sin(t * 0.041) * 0.5) * amp * 0.42 + (Math.random() - 0.5) * jolt * 1.1
        const ry = (Math.sin(t * 0.029 + 2.1) + Math.sin(t * 0.047 + 1.2) * 0.5) * amp * 0.3 + (Math.random() - 0.5) * jolt * 0.8
        const rr = Math.sin(t * 0.031 + 0.4) * 0.02 * amp + (Math.random() - 0.5) * jolt * 0.02
        rig.style.transform = `translate3d(${rx.toFixed(2)}px, ${ry.toFixed(2)}px, 0) rotate(${rr.toFixed(3)}deg)`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // Analog clock hands calculations
  const timeDate = new Date(now)
  const hours = timeDate.getHours()
  const minutes = timeDate.getMinutes()
  const seconds = timeDate.getSeconds()
  const hourDeg = (hours % 12) * 30 + minutes * 0.5
  const minuteDeg = minutes * 6 + seconds * 0.1
  const secondDeg = seconds * 6

  // Interior sunbeam: angle, strength and tint follow the time of day
  const weights = timeOfDay.weights
  const beamStrength = clamp(weights.day * 0.5 + weights.afternoon * 0.42 + weights.golden * 0.8 + weights.dawn * 0.45 + weights.dusk * 0.12) * (isTunnel ? 0.1 : 1)
  const beamAngle = 10 + weights.dawn * 14 + weights.day * 10 - weights.golden * 5 + weights.dusk * 8
  const beamColor = weights.golden > 0.35 ? '255, 178, 102' : weights.dawn > 0.4 ? '255, 205, 150' : weights.dusk > 0.3 ? '255, 160, 110' : '255, 240, 205'
  const lampOpacity = clamp((1 - timeOfDay.daylight) * 0.85 + (isTunnel ? 0.35 : 0))

  const ensureAudio = () => {
    let engine = audio.current
    if (!engine) {
      engine = createAudioEngine(setAudioSource)
      audio.current = engine
      engine.setMusicVolume(musicVolume / 100)
      engine.setRollingVolume(rollingVolume / 100)
      engine.setAmbienceVolume(ambienceVolume / 100)
      engine.setWindowOpen(windowOpen / 100)
      engine.setSpeed(journey.speed)
      engine.setAtPlatform(isAtPlatform)
      engine.setTunnel(isTunnel)
      engine.setLocale(locale)
      engine.onRailClick = (strength) => {
        joltRef.current = Math.min(0.9, joltRef.current + strength * 0.7)
      }
    }
    if (engine.context.state === 'suspended') void engine.context.resume()
    return engine
  }

  const toggleMusic = async () => {
    if (playing) {
      audio.current?.pauseMusic()
      setPlaying(false)
    } else {
      const engine = ensureAudio()
      engine.setMusicVolume(musicVolume / 100)
      void engine.startMusic()
      setPlaying(true)
    }
  }

  const playMusic = async () => {
    if (playing) return
    const engine = ensureAudio()
    engine.setMusicVolume(musicVolume / 100)
    void engine.startMusic()
    setPlaying(true)
  }

  const stopMusic = () => {
    if (!playing) return
    audio.current?.pauseMusic()
    setPlaying(false)
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

    const engine = ensureAudio()
    engine.playDoorOpen()

    // Begin the stream during the user's gesture, but keep it silent until
    // the door has visually opened. This respects browser autoplay rules.
    if (!playing) {
      engine.setMusicVolume(0)
      void engine.startMusic()
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
      className={`station station--${timeOfDay.phase} ${isTunnel ? 'station--tunnel' : ''} ${!entered ? 'station--not-entered' : ''} ${entering ? 'station--entering' : ''}`}
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
              <div className="glimpse-landscape" style={{ backgroundImage: `url(${getPreviewSceneSrc(journey.scene, timeOfDay.phase)})` }} />
              <img src="/train-carriage.webp" alt="" />
              <div className="glimpse-light" />
            </div>
            <div className="sliding-door" aria-hidden="true">
              <div className="door-wood" />
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

      <div className="rig" ref={rigRef}>
        <div
          className={`world ${journey.stopped || journey.midRouteStopped ? 'world--stopped' : ''} ${journey.scene.station ? 'world--platform' : ''} ${entered ? 'world--live' : ''}`}
          ref={worldRef}
          style={{
            '--scene-brightness': 0.4 + timeOfDay.daylight * 0.6,
            '--scene-saturation': 0.72 + timeOfDay.daylight * 0.28,
            '--scene-sepia': timeOfDay.warmth * 0.16,
            '--speed-opacity': journey.speed * 0.17,
          } as React.CSSProperties}
          aria-hidden="true"
        >
          {currentRoute.scenes.map((scene, index) => (entered || entering) && Math.abs(index - journey.sceneIndex) <= 1 && (
            <div
              className={`scene-stage ${scene.station ? 'scene-stage--station' : ''}`}
              key={scene.label}
              style={{ opacity: sceneOpacity(journey.progress, index, currentRoute.scenes) }}
            >
              <div className="scene-track">
                {[false, true, false, true].map((mirror, frameIndex) => (
                  <div className={`scene-frame ${mirror ? 'scene-frame--mirror' : ''}`} key={frameIndex}>
                    {SCENE_PHASES.map((phase) => {
                      const opacity = timeOfDay.weights[phase]
                      if (opacity === 0) return null
                      const hasDedicatedAsset = phase === 'day' || Boolean(scene[`${phase}Src` as keyof Scene])
                      return (
                        <div
                          className={`scene scene--${phase} ${hasDedicatedAsset ? '' : `scene--fallback-${phase}`}`}
                          key={phase}
                          style={{
                            backgroundImage: `url(${getSceneSrcForPhase(scene, phase)})`,
                            opacity,
                          }}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="near-field" ref={nearFieldRef} />
          <div className="pole-strip" ref={poleStripRef} />
          <div className="tunnel-strips" ref={tunnelStripsRef} />
          <div className="night-wash" style={{ opacity: (1 - timeOfDay.daylight) * 0.24 }} />
          <div className="golden-wash" style={{ opacity: timeOfDay.warmth * 0.2 }} />
          <div className="speed-lines" />
        </div>

        <div
          className="carriage-wrapper"
          style={{ '--sway': (journey.speed * 1.6).toFixed(3) } as React.CSSProperties}
        >
          <img className="carriage" src="/train-carriage.webp" alt="Cozy train compartment looking onto the journey" />

          {/* Wall Mounted Retro-Modern Screen */}
          <section className="trip-card trip-card--wall">
            <div className="eyebrow">{isAtPlatform ? 'NOW AT PLATFORM' : 'CURRENT JOURNEY'}</div>
            <div className="route-title">
              <div><strong>{currentRoute.fromCode}</strong><span>{currentRoute.fromName}</span></div>
              <div className="route-line"><i /><Route size={18} /><i /></div>
              <div className="align-right"><strong>{currentRoute.toCode}</strong><span>{currentRoute.toName}</span></div>
            </div>
            <div className="progress-track"><span style={{ width: `${journey.progress * 100}%` }}><i /></span></div>
            <div className="trip-meta">
              <div><MapPin size={15} /><span><small>{isAtPlatform ? 'NOW AT' : 'NOW PASSING'}</small>{journey.scene.detail}</span></div>
              <div className="align-right"><small>{isAtPlatform ? 'DEPARTING AGAIN' : 'ARRIVAL'}</small><b>{isAtPlatform ? formatDuration(departureCountdown) : journey.arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b></div>
            </div>
          </section>

          {/* Vintage Analog Wall Clock */}
          <div className="analog-clock">
            <div className="clock-dial">
              <div className="clock-hand clock-hand--hour" style={{ transform: `rotate(${hourDeg}deg)` }} />
              <div className="clock-hand clock-hand--minute" style={{ transform: `rotate(${minuteDeg}deg)` }} />
              <div className="clock-hand clock-hand--second" style={{ transform: `rotate(${secondDeg}deg)` }} />
              <div className="clock-center-pin" />
              <div className="clock-markers">
                <span className="marker-12" />
                <span className="marker-3" />
                <span className="marker-6" />
                <span className="marker-9" />
              </div>
            </div>
          </div>

          {/* Radio integrated into the left wood wall on desktop */}
          <section className={`wall-radio ${playing ? 'wall-radio--playing' : ''}`} aria-label="Nightline wall radio">
            <div className="wall-radio__case">
              <div className="wall-radio__speaker" aria-hidden="true">
                {Array.from({ length: 30 }, (_, index) => <i key={index} />)}
              </div>
              <div className="wall-radio__panel">
                <div className="wall-radio__brand"><span>NIGHTLINE</span><small>LOFI · LIVE</small></div>
                <div className="wall-radio__dial" aria-hidden="true"><span /></div>
                <div className="wall-radio__track">
                  <span className="wall-radio__signal" />
                  <div><small>{playing ? 'ON AIR' : 'RADIO OFF'}</small><strong>{audioSource === 'radio' ? 'Chilling' : timeOfDay.track}</strong></div>
                </div>
                <div className="wall-radio__controls">
                  <button type="button" onClick={() => void playMusic()} disabled={playing} aria-label="Play radio"><Play fill="currentColor" size={13} /></button>
                  <button type="button" onClick={stopMusic} disabled={!playing} aria-label="Stop radio"><Square fill="currentColor" size={11} /></button>
                  <label>
                    <Volume2 size={13} aria-hidden="true" />
                    <input aria-label="Radio volume" type="range" min="0" max="100" value={musicVolume} onChange={(event) => setMusicVolume(Number(event.target.value))} />
                  </label>
                </div>
              </div>
            </div>
            <span className="wall-radio__mount wall-radio__mount--left" aria-hidden="true" />
            <span className="wall-radio__mount wall-radio__mount--right" aria-hidden="true" />
          </section>

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

        {/* Interior light play: sunbeam, dust, flicker bands, lamps, tunnel glow */}
        <div
          className="sunbeam"
          style={{
            '--beam-opacity': beamStrength.toFixed(3),
            '--beam-angle': `${beamAngle.toFixed(1)}deg`,
            '--beam-color': beamColor,
          } as React.CSSProperties}
          aria-hidden="true"
        />
        <div className="dust" style={{ opacity: (beamStrength * 0.9).toFixed(3) }} aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => <i key={i} style={{ '--i': i } as React.CSSProperties} />)}
        </div>
        <div className="light-bands" ref={lightBandsRef} aria-hidden="true" />
        <div className="tunnel-glow" ref={tunnelGlowRef} aria-hidden="true" />
        <div className="lamp-glow" style={{ opacity: lampOpacity.toFixed(3) }} aria-hidden="true" />
      </div>

      <div className="vignette" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <header className="topbar">
        <button className="brand" onClick={() => setShowJourney(false)} aria-label="Nightline home">
          <span className="brand-mark"><Radio size={18} /></span>
          <span><b>NIGHTLINE</b><small>LOFI RADIO</small></span>
        </button>
        <div className="top-actions">
          <div className="time-badge"><Clock3 size={14} /><span>{timeOfDay.label}</span><b>{localTime}</b></div>
          <button className="icon-button" onClick={toggleFullscreen} aria-label="Toggle fullscreen"><Maximize2 size={18} /></button>
        </div>
      </header>

      <section className="trip-card trip-card--floating">
        <div className="eyebrow">{isAtPlatform ? 'NOW AT PLATFORM' : 'CURRENT JOURNEY'}</div>
        <div className="route-title">
          <div><strong>{currentRoute.fromCode}</strong><span>{currentRoute.fromName}</span></div>
          <div className="route-line"><i /><Route size={18} /><i /></div>
          <div className="align-right"><strong>{currentRoute.toCode}</strong><span>{currentRoute.toName}</span></div>
        </div>
        <div className="progress-track"><span style={{ width: `${journey.progress * 100}%` }}><i /></span></div>
        <div className="trip-meta">
          <div><MapPin size={15} /><span><small>{isAtPlatform ? 'NOW AT' : 'NOW PASSING'}</small>{journey.scene.detail}</span></div>
          <div className="align-right"><small>{isAtPlatform ? 'DEPARTING AGAIN' : 'ARRIVAL'}</small><b>{isAtPlatform ? formatDuration(departureCountdown) : journey.arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b></div>
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
          <span><b>Rolling</b><em>{rollingVolume}%</em></span>
          <input aria-label="Rolling sound volume — wheels, track and rumble" type="range" min="0" max="100" value={rollingVolume} onChange={(event) => setRollingVolume(Number(event.target.value))} />
        </label>
        <label>
          <span><b>Ambience</b><em>{ambienceVolume}%</em></span>
          <input aria-label="Ambience volume — wind, voices, stations" type="range" min="0" max="100" value={ambienceVolume} onChange={(event) => setAmbienceVolume(Number(event.target.value))} />
        </label>
      </section>

      <div className="bottom-actions">
        <button className="journey-button" onClick={() => setShowJourney((value) => !value)}><Route size={17} /> View journey</button>
        <button className={`sound-button ${showMixer ? 'sound-button--active' : ''}`} onClick={() => setShowMixer((value) => !value)} aria-label="Open sound mixer" aria-expanded={showMixer}><SlidersHorizontal size={18} /></button>
      </div>

      <aside className={`journey-panel ${showJourney ? 'journey-panel--open' : ''}`}>
        <div className="eyebrow">THE ROUTE</div>
        <h2>{currentRoute.name}</h2>
        <p>A slow radio journey, unfolding in real time.</p>

        <ol>
          {currentRoute.scenes.map((scene, index) => {
            const reached = journey.progress >= scene.at
            return <li className={reached ? 'reached' : ''} key={scene.label}><i /> <span><b>{scene.label}</b><small>{scene.detail}</small></span>{index === currentRoute.scenes.length - 1 && <em>ETA {journey.arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</em>}</li>
          })}
        </ol>

        <div className="next-route"><small>NEXT LEG</small><b>{nextRoute.name}</b><span>Departs after the 8-minute platform stop.</span></div>
      </aside>
    </main>
  )
}

export default App
