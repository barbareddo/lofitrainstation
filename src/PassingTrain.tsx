// Frecciarossa-inspired high-speed train, drawn as a side-view SVG consist:
// aerodynamic nose car with the white blade swoosh, five middle cars, and a
// mirrored tail car. Lit windows fade with daylight so night passes glow.

const CAR = 400
const GAP = 12
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
      <rect x={x + 42} y={164} width={76} height={26} rx={8} fill={BOGIE} />
      <rect x={x + CAR - 118} y={164} width={76} height={26} rx={8} fill={BOGIE} />
    </>
  )
}

// Warm interior windows; a deterministic quarter of them stay dark
function litWindows(x: number, count: number, seed: number, opacity: number) {
  return (
    <g opacity={opacity} fill={LIT}>
      {Array.from({ length: count }, (_, i) =>
        (seed * 3 + i) % 4 === 1 ? null : (
          <rect key={i} x={x + 26 + i * 58} y={79} width={30} height={20} rx={4} />
        ),
      )}
    </g>
  )
}

function middleCar(x: number, seed: number, litOpacity: number) {
  return (
    <g key={seed}>
      {bogies(x)}
      <rect x={x + 10} y={154} width={CAR - 20} height={14} fill={UNDER} />
      <rect x={x} y={44} width={CAR} height={112} rx={8} fill={RED} />
      <rect x={x} y={140} width={CAR} height={16} rx={6} fill={DARK_RED} />
      <rect x={x + 6} y={36} width={CAR - 12} height={14} rx={7} fill={ROOF} />
      <rect x={x + 90} y={30} width={60} height={8} rx={3} fill={ROOF_EQ} />
      <rect x={x + 250} y={30} width={60} height={8} rx={3} fill={ROOF_EQ} />
      <rect x={x + 14} y={72} width={CAR - 28} height={34} rx={8} fill={BAND} />
      <rect x={x + 8} y={112} width={CAR - 16} height={5} rx={2.5} fill={STRIPE} />
      {litWindows(x, 6, seed, litOpacity)}
    </g>
  )
}

function noseCar(x: number, seed: number, litOpacity: number) {
  const body =
    `M ${x} 46 H ${x + 235} ` +
    `C ${x + 305} 48 ${x + 352} 82 ${x + 392} 116 ` +
    `C ${x + 396} 120 ${x + 396} 124 ${x + 392} 127 ` +
    `C ${x + 352} 149 ${x + 305} 156 ${x + 235} 156 H ${x} Z`
  const windshield = `${x + 316},72 ${x + 366},96 ${x + 358},104 ${x + 308},82`
  const blade = `${x + 238},98 ${x + 394},119 ${x + 330},134 ${x + 238},116`
  return (
    <g key={seed}>
      {bogies(x)}
      <rect x={x + 10} y={154} width={230} height={14} fill={UNDER} />
      <path d={body} fill={RED} />
      <rect x={x + 6} y={36} width={229} height={14} rx={7} fill={ROOF} />
      <rect x={x + 90} y={30} width={60} height={8} rx={3} fill={ROOF_EQ} />
      <rect x={x + 14} y={72} width={216} height={34} rx={8} fill={BAND} />
      <polygon points={windshield} fill={GLASS} />
      <polygon points={blade} fill={BLADE} />
      <rect x={x + 8} y={112} width={222} height={5} rx={2.5} fill={STRIPE} />
      {litWindows(x, 4, seed, litOpacity)}
    </g>
  )
}

function pantograph(x: number) {
  const pts = `${x + 150},36 ${x + 185},10 ${x + 220},36 ${x + 185},26 ${x + 150},36`
  return (
    <>
      <g stroke="#2a2d32" strokeWidth={3.5} fill="none">
        <polyline points={pts} />
      </g>
      <rect x={x + 152} y={6} width={66} height={5} rx={2} fill="#2a2d32" />
    </>
  )
}

export function PassingTrain({ litOpacity }: { litOpacity: number }) {
  const cars = []
  // Tail car: the nose car mirrored
  cars.push(
    <g key="tail" transform={`translate(${CAR} 0) scale(-1 1)`}>
      {noseCar(0, 0, litOpacity)}
    </g>,
  )
  for (let i = 1; i < CARS - 1; i += 1) {
    cars.push(middleCar(i * (CAR + GAP), i, litOpacity))
  }
  const noseX = (CARS - 1) * (CAR + GAP)
  return (
    <svg viewBox={`0 0 ${WIDTH} 200`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="A high-speed train passing in the opposite direction">
      {cars}
      {pantograph(3 * (CAR + GAP))}
      {noseCar(noseX, CARS - 1, litOpacity)}
    </svg>
  )
}
