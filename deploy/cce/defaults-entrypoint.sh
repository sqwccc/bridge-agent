#!/bin/bash
set -Eeuo pipefail
# Parse literal KEY=value without evaluating shell syntax. Explicit CCE env values win.
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"
  [[ -z "$line" || "$line" == \#* ]] && continue
  [[ "$line" == *=* ]] || { echo 'Invalid default configuration line' >&2; exit 1; }
  key="${line%%=*}"
  value="${line#*=}"
  [[ "$key" =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo 'Invalid default variable name' >&2; exit 1; }
  if [[ ! -v "$key" ]]; then
    export "$key=$value"
  fi
done < /app/production-defaults.env
unset line key value
if (( $# )); then
  exec "$@"
fi
exec /app/entrypoint.sh
