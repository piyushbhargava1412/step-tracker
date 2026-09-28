#!/bin/sh
# Regenerates the Android launcher icons and splash images from public/icons/icon-512.png using
# macOS's built-in `sips` (no native npm image library needed). Re-run after changing the icon.
#
# The PWA icon is already a centred glyph on a solid #020617 square with generous margins, so:
#   - ic_launcher / ic_launcher_round / ic_launcher_foreground: the whole icon, scaled
#     (the glyph stays inside the adaptive-icon safe zone; the background colour matches
#     res/values/ic_launcher_background.xml)
#   - splash: the icon at 40% of the shorter side, centred on the same background
set -eu

SRC="public/icons/icon-512.png"
BG="020617"
RES="android/app/src/main/res"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# scale <px> <out>
scale() {
  sips -z "$1" "$1" "$SRC" --out "$2" >/dev/null
}

for density in mdpi:48:108 hdpi:72:162 xhdpi:96:216 xxhdpi:144:324 xxxhdpi:192:432; do
  name=${density%%:*}; rest=${density#*:}; icon=${rest%%:*}; foreground=${rest#*:}
  scale "$icon" "$RES/mipmap-$name/ic_launcher.png"
  scale "$icon" "$RES/mipmap-$name/ic_launcher_round.png"
  scale "$foreground" "$RES/mipmap-$name/ic_launcher_foreground.png"
done

for splash in "$RES"/drawable*/splash.png; do
  width=$(sips -g pixelWidth "$splash" | awk '/pixelWidth/ {print $2}')
  height=$(sips -g pixelHeight "$splash" | awk '/pixelHeight/ {print $2}')
  short=$(( width < height ? width : height ))
  logo=$(( short * 2 / 5 ))
  sips -z "$logo" "$logo" "$SRC" --out "$TMP/logo.png" >/dev/null
  sips --padToHeightWidth "$height" "$width" --padColor "$BG" "$TMP/logo.png" --out "$splash" >/dev/null
done

echo "Android icons and splash images regenerated from $SRC"
