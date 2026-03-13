#!/bin/bash
set -e

mkdir -p /output
cd /app

echo "Starting Manim render..." > /output/render.log

SCENE=$(grep -oP 'class\s+\K\w+(?=\(Scene\))' scene.py | head -n 1)

if [ -z "$SCENE" ]; then
    echo "ERROR: Scene class not found" >> /output/render.log
    exit 1
fi

echo "Detected scene: $SCENE" >> /output/render.log

manim -ql scene.py $SCENE --media_dir /output >> /output/render.log 2>&1

VIDEO_FILE=$(find /output -type f -name "*.mp4" | head -n 1)

if [ -z "$VIDEO_FILE" ]; then
  echo "ERROR: No video produced" >> /output/render.log
  exit 1
fi

mv "$VIDEO_FILE" /output/video.mp4