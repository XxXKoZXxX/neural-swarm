#!/usr/bin/env bash
# Regenerates the launcher icons from the mark geometry below.
# Requires ImageMagick. Run from mobile/:  bash scripts/make-icons.sh
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=public/icons
GOLD='#f0cd7a'

# Draws the swarm mark at an arbitrary size using integer math scaled from the
# 512px master art. Primitives (not SVG) so output does not depend on which SVG
# delegate ImageMagick happens to have.
draw_icon() {
  local size=$1 name=$2 pad=$3
  local s=$size p=$pad
  local hx=(256 394 394 256 118 118)   # hexagon x
  local hy=(96 176 336 416 336 176)    # hexagon y
  local pts=""
  local i
  for i in 0 1 2 3 4 5; do
    local x=$(( hx[i] * (s - 2 * p) / 512 + p ))
    local y=$(( hy[i] * (s - 2 * p) / 512 + p ))
    pts+="$x,$y "
  done
  # scale a master coordinate to this icon size
  sc() { echo $(( $1 * (s - 2 * p) / 512 + p )); }
  local cx256=$(sc 256) cy176=$(sc 176) cy256=$(sc 256) cy216=$(sc 216)
  local cx326=$(sc 326) cx186=$(sc 186) cy296=$(sc 296) cy193=$(sc 193)
  local cy230=$(sc 230) cy310=$(sc 310)

  local radius=$(( s / 7 ))
  local stroke=$(( s * 14 / 512 ))
  [ "$stroke" -lt 2 ] && stroke=2
  local thin=$(( s * 8 / 512 ))
  [ "$thin" -lt 1 ] && thin=1

  local args=(
    -size "${s}x${s}" "xc:#0a0708"
    -fill '#120e0f' -stroke none
    -draw "roundrectangle 0,0 $((s - 1)),$((s - 1)) $radius,$radius"
    -stroke "$GOLD" -strokewidth "$stroke" -fill none
    -draw "polygon ${pts% }"
    -strokewidth "$thin"
    -draw "line $cx256,$cy176 $cx256,$cy256"
    -draw "line $cx256,$cy256 $cx326,$cy216"
    -draw "line $cx256,$cy256 $cx186,$cy296"
    -stroke none -fill "$GOLD"
    -draw "circle $cx256,$cy176 $cx256,$cy193"
    -draw "circle $cx326,$cy216 $cx326,$cy230"
    -draw "circle $cx186,$cy296 $cx186,$cy310"
  )

  convert "${args[@]}" "$OUT/$name"
  echo "wrote $OUT/$name (${s}px)"
}

mkdir -p "$OUT"
# pad = safe-area inset in master pixels. Maskable icons need ~20% margin.
draw_icon 192 icon-192.png 0
draw_icon 512 icon-512.png 0
draw_icon 512 maskable-512.png 58
draw_icon 180 apple-touch-icon.png 0
