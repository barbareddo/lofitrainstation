// Frecciarossa-inspired high-speed train, drawn as a long, low side-view
// consist. It is deliberately proportioned for a close parallel track: the
// window frame crops the undercarriage while the roof remains below the
// landscape horizon.

const CAR = 610
const GAP = 10
const CARS = 7
const WIDTH = CARS * CAR + (CARS - 1) * GAP

const RED = '#c8242c'
const DARK_RED = '#8f151c'
const ROOF = '#8f959b'
const ROOF_EQ = '#5c6167'
const BAND = '#12161d'
const STRIPE = '#d4d7db'
const BLADE = '#eceff1'
const UNDER = '#14161a'
const BOGIE = '#0c0e11'
const GLASS = '#0d1117'
const LIT = '#ffd9a0'

function bogies(x: number) {
  return (
    <>
      <rect x={x + 66} y={137} width={82} height={18} rx={7} fill={BOGIE} />
      <rect x={x + CAR - 148} y={137} width={82} height={18} rx={7} fill={BOGIE} />
    </>
  )
}

// Warm interior windows; a deterministic quarter of them stay dark
function litWindows(x: number, count: number, seed: number, lightLevel: number) {
  return (
    <g className="passing-train__lit-windows" opacity={0.08 + lightLevel * 0.92} fill={LIT}>
      {Array.from({ length: count }, (_, i) =>
        (seed * 3 + i) % 4 === 1 ? null : (
          <rect key={i} x={x + 42 + i * 66} y={71} width={38} height={15} rx={3} />
        ),
      )}
    </g>
  )
}

function middleCar(x: number, seed: number, lightLevel: number) {
  return (
    <g key={seed}>
      {bogies(x)}
      <rect x={x + 14} y={127} width={CAR - 28} height={15} fill={UNDER} />
      <rect x={x} y={47} width={CAR} height={82} rx={7} fill="url(#passengerBody)" />
      <rect x={x} y={116} width={CAR} height={13} rx={5} fill={DARK_RED} />
      <rect x={x + 8} y={41} width={CAR - 16} height={10} rx={5} fill={ROOF} />
      <rect x={x + 142} y={35} width={74} height={7} rx={3} fill={ROOF_EQ} />
      <rect x={x + 390} y={35} width={74} height={7} rx={3} fill={ROOF_EQ} />
      <rect x={x + 22} y={65} width={CAR - 44} height={27} rx={7} fill={BAND} />
      <rect x={x + 14} y={99} width={CAR - 28} height={4} rx={2} fill={STRIPE} />
      {litWindows(x, 8, seed, lightLevel)}
    </g>
  )
}

function noseCar(x: number, seed: number, lightLevel: number, leading = false) {
  const body =
    `M ${x} 48 H ${x + 360} ` +
    `C ${x + 440} 49 ${x + 512} 70 ${x + 592} 105 ` +
    `C ${x + 605} 111 ${x + 604} 118 ${x + 590} 121 ` +
    `C ${x + 515} 132 ${x + 435} 131 ${x + 350} 129 H ${x} Z`
  const windshield = `${x + 455},65 ${x + 548},88 ${x + 529},98 ${x + 438},76`
  const blade = `${x + 370},91 ${x + 598},111 ${x + 500},122 ${x + 360},105`
  return (
    <g key={seed}>
      {bogies(x)}
      <rect x={x + 14} y={127} width={350} height={15} fill={UNDER} />
      <path d={body} fill="url(#passengerBody)" />
      <rect x={x + 8} y={41} width={350} height={10} rx={5} fill={ROOF} />
      <rect x={x + 142} y={35} width={74} height={7} rx={3} fill={ROOF_EQ} />
      <rect x={x + 22} y={65} width={330} height={27} rx={7} fill={BAND} />
      <polygon points={windshield} fill={GLASS} />
      <polygon points={blade} fill={BLADE} />
      <rect x={x + 14} y={99} width={342} height={4} rx={2} fill={STRIPE} />
      {litWindows(x, 5, seed, lightLevel)}
      {leading && (
        <g className="passing-train__headlights" opacity={lightLevel}>
          <ellipse cx={x + 585} cy={110} rx={34} ry={10} fill="#ffe6b3" filter="url(#headlightGlow)" />
          <circle cx={x + 582} cy={110} r={4.5} fill="#fff4d6" />
        </g>
      )}
    </g>
  )
}

function pantograph(x: number) {
  const pts = `${x + 245},41 ${x + 280},15 ${x + 315},41 ${x + 280},31 ${x + 245},41`
  return (
    <>
      <g stroke="#2a2d32" strokeWidth={3.5} fill="none">
        <polyline points={pts} />
      </g>
      <rect x={x + 247} y={11} width={66} height={5} rx={2} fill="#2a2d32" />
    </>
  )
}

export function PassingTrain({ lightLevel }: { lightLevel: number }) {
  const cars = []
  // Tail car: the nose car mirrored
  cars.push(
    <g key="tail" transform={`translate(${CAR} 0) scale(-1 1)`}>
      {noseCar(0, 0, lightLevel)}
    </g>,
  )
  for (let i = 1; i < CARS - 1; i += 1) {
    cars.push(middleCar(i * (CAR + GAP), i, lightLevel))
  }
  const noseX = (CARS - 1) * (CAR + GAP)
  return (
    <svg viewBox={`0 0 ${WIDTH} 160`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="A high-speed train passing in the opposite direction">
      <defs>
        <linearGradient id="passengerBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e13a43" />
          <stop offset="0.55" stopColor={RED} />
          <stop offset="1" stopColor="#9d171e" />
        </linearGradient>
        <filter id="headlightGlow" x="-100%" y="-200%" width="300%" height="500%">
          <feGaussianBlur stdDeviation="12 4" />
        </filter>
        <filter id="passengerMotion" x="-2%" y="-5%" width="104%" height="110%">
          <feGaussianBlur stdDeviation="0.75 0.12" />
        </filter>
      </defs>
      <g filter="url(#passengerMotion)">
        {cars}
        {pantograph(3 * (CAR + GAP))}
        {noseCar(noseX, CARS - 1, lightLevel, true)}
      </g>
    </svg>
  )
}
