"""Preview generator for the passing Frecciarossa-style train SVG.

Mirrors the geometry that will live in src/PassingTrain.tsx so the design can
be reviewed as PNG before shipping. Output: /tmp/train_preview.svg
"""

CAR = 400
GAP = 12
CARS = 7
WIDTH = CARS * CAR + (CARS - 1) * GAP

RED = "#c8242c"
DARK_RED = "#8f151c"
ROOF = "#8f959b"
ROOF_EQ = "#5c6167"
BAND = "#12161d"
STRIPE = "#d4d7db"
BLADE = "#eceff1"
UNDER = "#14161a"
BOGIE = "#0c0e11"
GLASS = "#0d1117"
LIT = "#ffd9a0"


def bogies(x):
    return (
        f'<rect x="{x + 42}" y="164" width="76" height="26" rx="8" fill="{BOGIE}"/>'
        f'<rect x="{x + CAR - 118}" y="164" width="76" height="26" rx="8" fill="{BOGIE}"/>'
    )


def lit_windows(x, count, seed, opacity=1.0):
    out = [f'<g opacity="{opacity}" fill="{LIT}">']
    for i in range(count):
        if (seed * 3 + i) % 4 == 1:
            continue
        out.append(f'<rect x="{x + 26 + i * 58}" y="79" width="30" height="20" rx="4"/>')
    out.append("</g>")
    return "".join(out)


def middle_car(x, seed):
    return (
        bogies(x)
        + f'<rect x="{x + 10}" y="154" width="{CAR - 20}" height="14" fill="{UNDER}"/>'
        + f'<rect x="{x}" y="44" width="{CAR}" height="112" rx="8" fill="{RED}"/>'
        + f'<rect x="{x}" y="140" width="{CAR}" height="16" rx="6" fill="{DARK_RED}"/>'
        + f'<rect x="{x + 6}" y="36" width="{CAR - 12}" height="14" rx="7" fill="{ROOF}"/>'
        + f'<rect x="{x + 90}" y="30" width="60" height="8" rx="3" fill="{ROOF_EQ}"/>'
        + f'<rect x="{x + 250}" y="30" width="60" height="8" rx="3" fill="{ROOF_EQ}"/>'
        + f'<rect x="{x + 14}" y="72" width="{CAR - 28}" height="34" rx="8" fill="{BAND}"/>'
        + f'<rect x="{x + 8}" y="112" width="{CAR - 16}" height="5" rx="2.5" fill="{STRIPE}"/>'
        + lit_windows(x, 6, seed)
    )


def nose_car(x, seed):
    body = (
        f"M {x} 46 H {x + 235} "
        f"C {x + 305} 48 {x + 352} 82 {x + 392} 116 "
        f"C {x + 396} 120 {x + 396} 124 {x + 392} 127 "
        f"C {x + 352} 149 {x + 305} 156 {x + 235} 156 H {x} Z"
    )
    windshield = f"{x + 316},72 {x + 366},96 {x + 358},104 {x + 308},82"
    blade = f"{x + 238},98 {x + 394},119 {x + 330},134 {x + 238},116"
    return (
        bogies(x)
        + f'<rect x="{x + 10}" y="154" width="230" height="14" fill="{UNDER}"/>'
        + f'<path d="{body}" fill="{RED}"/>'
        + f'<rect x="{x + 6}" y="36" width="229" height="14" rx="7" fill="{ROOF}"/>'
        + f'<rect x="{x + 90}" y="30" width="60" height="8" rx="3" fill="{ROOF_EQ}"/>'
        + f'<rect x="{x + 14}" y="72" width="216" height="34" rx="8" fill="{BAND}"/>'
        + f'<polygon points="{windshield}" fill="{GLASS}"/>'
        + f'<polygon points="{blade}" fill="{BLADE}"/>'
        + f'<rect x="{x + 8}" y="112" width="222" height="5" rx="2.5" fill="{STRIPE}"/>'
        + lit_windows(x, 4, seed)
    )


def pantograph(x):
    pts = f"{x + 150},36 {x + 185},10 {x + 220},36 {x + 185},26 {x + 150},36"
    return (
        f'<g stroke="#2a2d32" stroke-width="3.5" fill="none"><polyline points="{pts}"/></g>'
        f'<rect x="{x + 152}" y="6" width="66" height="5" rx="2" fill="#2a2d32"/>'
    )


parts = [
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} 200">',
    '<rect width="2872" height="200" fill="#2b3540"/>',  # preview backdrop only
]
# tail: nose car mirrored around x=CAR
parts.append(f'<g transform="translate({CAR} 0) scale(-1 1)">{nose_car(0, 0)}</g>')
for i in range(1, CARS - 1):
    parts.append(middle_car(i * (CAR + GAP), i))
parts.append(pantograph(3 * (CAR + GAP)))
parts.append(nose_car((CARS - 1) * (CAR + GAP), CARS - 1))
parts.append("</svg>")

with open("/tmp/train_preview.svg", "w") as fh:
    fh.write("".join(parts))
print("written /tmp/train_preview.svg", WIDTH)
