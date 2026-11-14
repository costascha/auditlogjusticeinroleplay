#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f config.js ]]; then
    cp config.example.js config.js
fi

printf 'Serving AuditLog at http://localhost:8000\n'
exec python3 -m http.server 8000 --bind 0.0.0.0
