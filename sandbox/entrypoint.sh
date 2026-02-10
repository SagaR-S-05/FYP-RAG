#!/bin/bash
set -e

mkdir -p /output

# Run Manim
manim -ql scene.py --media_dir /output > /output/render.log 2>&1

# Find the generated mp4 (Manim output paths vary)
VIDEO_FILE=$(find /output -type f -name "*.mp4" | head -n 1)

if [ -z "$VIDEO_FILE" ]; then
  echo "ERROR: No video file produced by Manim" >> /output/render.log
  exit 1
fi

# Move to stable output path expected by backend
mv "$VIDEO_FILE" /output/video.mp4
