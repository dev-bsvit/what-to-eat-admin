#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'EOF'
Usage:
  npm run imagekit:setup-webp

Installs the WebP command line tools through Homebrew so the recipe
pipeline can convert images to local .webp files before ImageKit upload.

After setup, run uploads with:
  npm run imagekit:recipes -- --manifest ./АВТО_РЕЦЕПТ/recipes-manifest.jsonl --out ./АВТО_РЕЦЕПТ/output/recipes-output.csv --folder /recipes/ukrainian --quality 80 --local-webp
EOF
  exit 0
fi

if command -v cwebp >/dev/null 2>&1; then
  echo "cwebp is already installed: $(command -v cwebp)"
  cwebp -version || true
  exit 0
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is not installed or not available in PATH."
  echo "Install Homebrew first, then run: brew install webp"
  exit 1
fi

echo "Installing WebP tools with Homebrew..."
brew install webp

echo "Checking cwebp..."
command -v cwebp
cwebp -version || true

echo "WebP setup complete."
