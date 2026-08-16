#!/usr/bin/env bash
set -euo pipefail

output=assets/itch-cover.png
if [[ -e "$output" ]]; then
  echo "$output already exists; refusing to overwrite" >&2
  exit 1
fi
mkdir -p assets
work=/tmp/draft-line-itch-cover
mkdir -p "$work"

# Work from the game's native 320x240 pixel grid. Point filtering is nearest-neighbour.
convert test/screenshot-race.png -filter point -resize 320x240\! \
  -crop 315x165+2+48 +repage "$work/scene.png"
# Exact 3x5 glyph rows from src/font.js, at seven logical pixels per font pixel.
declare -A glyph=(
  [D]='110,101,101,101,110' [R]='111,101,110,101,101'
  [A]='111,101,111,101,101' [F]='111,100,111,100,100'
  [T]='111,010,010,010,010' [L]='100,100,100,100,111'
  [I]='111,010,010,010,111' [N]='110,101,101,101,101'
  [E]='111,100,111,100,111' [' ']='000,000,000,000,000'
)
title='DRAFT LINE'
draw='fill #101833 rectangle 0,0 314,51 fill #18244a rectangle 0,43 314,51 fill #ffd45a '
for ((i=0; i<${#title}; i++)); do
  ch=${title:i:1}; IFS=, read -ra rows <<< "${glyph[$ch]}"
  for y in {0..4}; do for x in {0..2}; do
    if [[ ${rows[$y]:$x:1} == 1 ]]; then
      x0=$((35+i*28+x*7)); y0=$((9+y*7))
      draw+=" rectangle $x0,$y0 $((x0+6)),$((y0+6))"
    fi
  done; done
done

convert -size 315x250 xc:'#101833' \
  \( "$work/scene.png" -filter point -resize 315x198\! \) -geometry +0+52 -composite \
  -draw "$draw" -filter point -resize 630x500\! -depth 8 \
  -define png:color-type=2 "$output"

echo "$output"
