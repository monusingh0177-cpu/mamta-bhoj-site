#!/usr/bin/env bash
# Builds WebP copies of the site's large raster images (ImageMagick `convert` with WebP support).
# The original JPEG/PNG files are never modified or removed: pages serve the WebP through
# <picture> (lib/picture.js) and keep the original as the fallback and for social previews.
# Re-run after adding or replacing an image under public/images, then commit the .webp files.
#   scripts/build-webp.sh
set -euo pipefail
cd "$(dirname "$0")/../public/images"
command -v convert >/dev/null || { echo "ImageMagick 'convert' with WebP support is required" >&2; exit 1; }
enc() { # input output quality [resize]
  local in="$1" out="$2" q="$3" rs="${4:-}"
  if [ -n "$rs" ]; then convert "$in" -resize "$rs" -quality "$q" -define webp:method=6 -define webp:alpha-quality=100 "$out"
  else convert "$in" -quality "$q" -define webp:method=6 -define webp:alpha-quality=100 "$out"; fi
  printf '%-62s %7d -> %7d bytes\n' "$out" "$(wc -c < "$in")" "$(wc -c < "$out")"
}
for f in hero/*.jpg about-mill/*.jpg; do enc "$f" "${f%.jpg}.webp" 82; done
for f in products/*.jpg; do enc "$f" "${f%.jpg}.webp" 86; done   # packshots carry small label text
# Large 1536x1024 illustrations: full size plus a 768w variant for narrower screens.
for f in facility/mamta-bhoj-facility-overview.jpg quality/mamta-bhoj-quality-process-overview.jpg; do
  enc "$f" "${f%.jpg}.webp" 80
  enc "$f" "${f%.jpg}-768w.webp" 80 768x
done
enc mamta-bhoj-premium-logo.png mamta-bhoj-premium-logo.webp 90
