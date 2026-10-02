#!/bin/sh
# Renders every app icon and splash image from the Walkaholic mark, public/icons/icon.svg.
# Re-run after changing the mark: npm run android:assets
#
# Needs rsvg-convert (brew install librsvg) to rasterise the SVG; `sips` (built into macOS) pads
# the splash images.
#
# The mark is a centred glyph on a solid #020617 square, inside the adaptive-icon / maskable
# safe zone, so:
#   - public/icons/icon-192.png, icon-512.png: the PWA icons (any + maskable)
#   - ic_launcher / ic_launcher_round / ic_launcher_foreground: the whole mark, scaled
#     (the background colour matches res/values/ic_launcher_background.xml)
#   - splash: the mark at 40% of the shorter side, centred on the same background
set -eu

SRC="public/icons/icon.svg"
BG="020617"
RES="android/app/src/main/res"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v rsvg-convert >/dev/null || { echo "rsvg-convert not found: brew install librsvg" >&2; exit 1; }

# render <px> <out>
render() {
  rsvg-convert -w "$1" -h "$1" "$SRC" -o "$2"
}

render 192 public/icons/icon-192.png
render 512 public/icons/icon-512.png

for density in mdpi:48:108 hdpi:72:162 xhdpi:96:216 xxhdpi:144:324 xxxhdpi:192:432; do
  name=${density%%:*}; rest=${density#*:}; icon=${rest%%:*}; foreground=${rest#*:}
  render "$icon" "$RES/mipmap-$name/ic_launcher.png"
  render "$icon" "$RES/mipmap-$name/ic_launcher_round.png"
  render "$foreground" "$RES/mipmap-$name/ic_launcher_foreground.png"
done

for splash in "$RES"/drawable*/splash.png; do
  width=$(sips -g pixelWidth "$splash" | awk '/pixelWidth/ {print $2}')
  height=$(sips -g pixelHeight "$splash" | awk '/pixelHeight/ {print $2}')
  short=$(( width < height ? width : height ))
  logo=$(( short * 2 / 5 ))
  render "$logo" "$TMP/logo.png"
  sips --padToHeightWidth "$height" "$width" --padColor "$BG" "$TMP/logo.png" --out "$splash" >/dev/null
done

echo "Icons and splash images rendered from $SRC"
