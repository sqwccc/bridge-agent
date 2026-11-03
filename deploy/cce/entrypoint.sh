#!/bin/bash
set -Eeuo pipefail
nginx -e /dev/stderr -t
java -jar /app/application.jar &
java_pid=$!
nginx -e /dev/stderr -g 'daemon off;' &
nginx_pid=$!
cleanup() {
  trap - TERM INT
  kill -TERM "$java_pid" "$nginx_pid" 2>/dev/null || true
  wait "$java_pid" 2>/dev/null || true
  wait "$nginx_pid" 2>/dev/null || true
}
trap 'cleanup; exit 0' TERM INT
set +e
wait -n "$java_pid" "$nginx_pid"
status=$?
set -e
cleanup
# Either service exiting unexpectedly must restart the whole container.
if [ "$status" -eq 0 ]; then status=1; fi
exit "$status"
