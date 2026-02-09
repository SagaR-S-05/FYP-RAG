#!/bin/bash
set -e

mkdir -p /output

manim -qk scene.py --media_dir /output > /output/render.log 2>&1

mv /output/videos/*/video.mp4 /output/video.mp4
