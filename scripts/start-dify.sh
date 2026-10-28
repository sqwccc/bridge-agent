#!/usr/bin/env bash
set -euo pipefail
cd /opt/bridgemind-dify-1.18.0
for img in $(docker compose -p bridgemind-dify -f docker-compose.yaml -f compose.override.yaml config --images | sort -u); do
  success=false
  for attempt in 1 2 3 4; do
    if docker pull "$img"; then success=true; break; fi
  done
  if [ "$success" != true ]; then exit 1; fi
done
docker compose -p bridgemind-dify -f docker-compose.yaml -f compose.override.yaml up -d
