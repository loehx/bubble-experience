#!/usr/bin/env bash
# Trim silence from Soundboard m4a clips (in place).
#
# Usage:
#   bash scripts/trim-soundboard-audio.sh start [from] [to]   # start only, gentle (-60 dB) — recommended
#   bash scripts/trim-soundboard-audio.sh gentle [from] [to]  # both ends, gentle (-55 dB)
#   bash scripts/trim-soundboard-audio.sh aggressive          # both ends, aggressive (-42 dB)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$ROOT/src/soundboard/sounds"

MODE="${1:-start}"
shift || true

case "$MODE" in
  start)
    THRESHOLD="-65dB"
    MIN_SILENCE="0.15"
    FILTER="silenceremove=start_periods=1:start_duration=${MIN_SILENCE}:start_threshold=${THRESHOLD}:detection=peak"
    ;;
  gentle)
    THRESHOLD="-55dB"
    MIN_SILENCE="0.1"
    FILTER="silenceremove=start_periods=1:start_duration=${MIN_SILENCE}:start_threshold=${THRESHOLD}:detection=peak,areverse,silenceremove=start_periods=1:start_duration=${MIN_SILENCE}:start_threshold=${THRESHOLD}:detection=peak,areverse"
    ;;
  aggressive)
    THRESHOLD="-42dB"
    MIN_SILENCE="0.04"
    FILTER="silenceremove=start_periods=1:start_duration=${MIN_SILENCE}:start_threshold=${THRESHOLD}:detection=peak,areverse,silenceremove=start_periods=1:start_duration=${MIN_SILENCE}:start_threshold=${THRESHOLD}:detection=peak,areverse"
    ;;
  *)
    echo "Unknown mode: $MODE (use start, gentle, or aggressive)" >&2
    exit 1
    ;;
esac

shopt -s nullglob
if (($# >= 2)); then
  files=()
  for i in $(seq "$1" "$2"); do
    files+=("$DIR/$i.m4a")
  done
elif (($# == 1)); then
  files+=("$DIR/$1.m4a")
else
  files=("$DIR"/*.m4a)
fi

if ((${#files[@]} == 0)); then
  echo "No .m4a files found"
  exit 1
fi

for input in "${files[@]}"; do
  name="$(basename "$input")"
  tmp="$(mktemp "${TMPDIR:-/tmp}/soundboard-trim.XXXXXX.m4a")"

  before="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$input")"

  ffmpeg -y -hide_banner -loglevel error -i "$input" -af "$FILTER" -c:a aac -b:a 128k "$tmp"

  after="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$tmp")"
  mv "$tmp" "$input"

  printf '%s: %.2fs → %.2fs\n' "$name" "$before" "$after"
done

echo "Done (${MODE}). Trimmed ${#files[@]} files."
