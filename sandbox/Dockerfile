FROM python:3.11-slim

# Install system + build dependencies required by Manim
RUN apt-get update && apt-get install -y \
    build-essential \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libglib2.0-dev \
    ffmpeg \
    texlive-latex-extra \
    texlive-fonts-recommended \
    texlive-science \
    ghostscript \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN useradd -m sandbox
USER sandbox

ENTRYPOINT ["/entrypoint.sh"]
