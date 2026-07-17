const WAGON = 500
const GAP = 18
const WAGONS = 7
const LOCO = 590
const WIDTH = WAGONS * (WAGON + GAP) + LOCO

const UNDER = '#111519'
const BOGIE = '#090c0f'

function bogies(x: number, width = WAGON) {
  return (
    <>
      <rect x={x + 58} y={142} width={84} height={18} rx={7} fill={BOGIE} />
      <rect x={x + width - 142} y={142} width={84} height={18} rx={7} fill={BOGIE} />
    </>
  )
}

function wagon(x: number, index: number) {
  const isContainer = index % 3 !== 1
  return (
    <g key={index}>
      {bogies(x)}
      <rect x={x + 12} y={132} width={WAGON - 24} height={15} rx={3} fill={UNDER} />
      {isContainer ? (
        <>
          <rect x={x + 24} y={59 + (index % 2) * 8} width={WAGON - 48} height={72 - (index % 2) * 8} rx={5} fill={`url(#cargoContainer${index % 3})`} />
          {Array.from({ length: 7 }, (_, rib) => (
            <rect key={rib} x={x + 45 + rib * 59} y={64 + (index % 2) * 8} width={3} height={61 - (index % 2) * 8} fill="rgba(255,255,255,.1)" />
          ))}
        </>
      ) : (
        <>
          <rect x={x + 34} y={82} width={WAGON - 68} height={51} rx={25} fill="url(#cargoTanker)" />
          <rect x={x + 92} y={73} width={WAGON - 184} height={8} rx={4} fill="#343b3f" />
          <rect x={x + 108} y={77} width={5} height={55} fill="#1c2226" />
          <rect x={x + WAGON - 113} y={77} width={5} height={55} fill="#1c2226" />
        </>
      )}
      <rect x={x + WAGON - 4} y={136} width={GAP + 8} height={5} rx={2} fill="#171b1e" />
    </g>
  )
}

function locomotive(x: number, lightLevel: number) {
  const body =
    `M ${x} 64 H ${x + 350} L ${x + 470} 78 ` +
    `C ${x + 530} 87 ${x + 566} 105 ${x + 584} 124 ` +
    `L ${x + 570} 139 H ${x} Z`
  return (
    <g>
      {bogies(x, LOCO)}
      <path d={body} fill="url(#cargoLoco)" />
      <path d={`M ${x + 350} 70 L ${x + 461} 82 L ${x + 435} 101 L ${x + 330} 91 Z`} fill="#12191e" />
      <rect x={x + 28} y={82} width={265} height={20} rx={5} fill="#20282d" />
      <path d={`M ${x + 22} 114 H ${x + 512}`} stroke="#d7a33a" strokeWidth="6" />
      <g className="passing-train__headlights" opacity={0.18 + lightLevel * 0.82}>
        <ellipse cx={x + 569} cy={124} rx={42} ry={12} fill="#ffe3a1" filter="url(#cargoHeadlightGlow)" />
        <circle cx={x + 565} cy={123} r={5} fill="#fff1c8" />
      </g>
    </g>
  )
}

export function CargoTrain({ lightLevel }: { lightLevel: number }) {
  const locoX = WAGONS * (WAGON + GAP)
  return (
    <svg viewBox={`0 0 ${WIDTH} 170`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="A freight train passing in the opposite direction">
      <defs>
        <linearGradient id="cargoContainer0" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5a493b" />
          <stop offset="1" stopColor="#2d2926" />
        </linearGradient>
        <linearGradient id="cargoContainer1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4c5556" />
          <stop offset="1" stopColor="#272e30" />
        </linearGradient>
        <linearGradient id="cargoContainer2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5b3c35" />
          <stop offset="1" stopColor="#312421" />
        </linearGradient>
        <linearGradient id="cargoTanker" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#596267" />
          <stop offset="0.5" stopColor="#30383d" />
          <stop offset="1" stopColor="#1d2326" />
        </linearGradient>
        <linearGradient id="cargoLoco" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#455158" />
          <stop offset="0.55" stopColor="#273137" />
          <stop offset="1" stopColor="#151b1f" />
        </linearGradient>
        <filter id="cargoHeadlightGlow" x="-100%" y="-200%" width="300%" height="500%">
          <feGaussianBlur stdDeviation="15 4" />
        </filter>
        <filter id="cargoMotion" x="-2%" y="-5%" width="104%" height="110%">
          <feGaussianBlur stdDeviation="1 0.14" />
        </filter>
      </defs>
      <g filter="url(#cargoMotion)">
        <g className="passing-train__tail-light" opacity={lightLevel}>
          <ellipse cx="18" cy="122" rx="24" ry="9" fill="#e13b30" filter="url(#cargoHeadlightGlow)" />
          <circle cx="20" cy="122" r="4" fill="#ff5144" />
        </g>
        {Array.from({ length: WAGONS }, (_, index) => wagon(index * (WAGON + GAP), index))}
        {locomotive(locoX, lightLevel)}
      </g>
    </svg>
  )
}
