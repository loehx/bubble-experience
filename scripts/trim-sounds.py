#!/usr/bin/env python3
"""Trim slash sounds using the same 1.5% start/tail tolerance as Slash Sounds."""

from __future__ import annotations

import struct
import subprocess
import sys
from pathlib import Path

SILENCE_WINDOW_MS = 12
START_THRESHOLD = 0.015
TAIL_THRESHOLD = 0.015
SOUNDS_DIR = Path(__file__).resolve().parents[1] / "src" / "soundboard" / "sounds"


def decode_to_mono(path: Path) -> tuple[tuple[float, ...], int]:
    probe = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=sample_rate",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    sample_rate = int(probe.stdout.strip())
    result = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(path),
            "-f",
            "f32le",
            "-acodec",
            "pcm_f32le",
            "-ac",
            "1",
            "-",
        ],
        capture_output=True,
        check=True,
    )
    sample_count = len(result.stdout) // 4
    samples = struct.unpack(f"<{sample_count}f", result.stdout)
    return samples, sample_rate


def find_content_start(samples: tuple[float, ...], sample_rate: int, threshold: float) -> int:
    window_size = max(1, int((SILENCE_WINDOW_MS / 1000) * sample_rate))
    start = 0
    while start < len(samples):
        end = min(start + window_size, len(samples))
        peak = max(abs(samples[index]) for index in range(start, end))
        if peak > threshold:
            return start
        start += window_size
    return len(samples)


def find_content_end(samples: tuple[float, ...], sample_rate: int, threshold: float) -> int:
    window_size = max(1, int((SILENCE_WINDOW_MS / 1000) * sample_rate))
    end = len(samples)
    while end > 0:
        start = max(0, end - window_size)
        peak = max(abs(samples[index]) for index in range(start, end))
        if peak > threshold:
            return min(end, len(samples))
        end -= window_size
    return 0


def trim_file(path: Path) -> None:
    samples, sample_rate = decode_to_mono(path)
    content_start = find_content_start(samples, sample_rate, START_THRESHOLD)
    content_end = find_content_end(samples, sample_rate, TAIL_THRESHOLD)

    if content_end <= content_start:
        print(f"{path.name}: skipped (no detectable content)")
        return

    start_sec = content_start / sample_rate
    end_sec = content_end / sample_rate
    duration_sec = end_sec - start_sec
    original_duration = len(samples) / sample_rate
    head_trim = start_sec
    tail_trim = original_duration - end_sec

    if head_trim < 0.001 and tail_trim < 0.001:
        print(f"{path.name}: no trim needed")
        return

    temp_path = path.with_suffix(".trim.tmp.m4a")
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-i",
            str(path),
            "-ss",
            f"{start_sec:.6f}",
            "-t",
            f"{duration_sec:.6f}",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            str(temp_path),
        ],
        check=True,
    )
    temp_path.replace(path)
    print(
        f"{path.name}: {original_duration:.3f}s -> {duration_sec:.3f}s "
        f"(start -{head_trim:.3f}s, tail -{tail_trim:.3f}s)"
    )


def main() -> int:
    files = sorted(SOUNDS_DIR.glob("*.m4a"), key=lambda file: int(file.stem))
    if not files:
        print(f"No .m4a files found in {SOUNDS_DIR}", file=sys.stderr)
        return 1

    for path in files:
        trim_file(path)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
