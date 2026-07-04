#!/usr/bin/env bash
# Smoke test: submit a job, poll to completion, print the result.
# Usage: bash scripts/smoke.sh [BASE_URL]   (default http://localhost:3000)
set -euo pipefail

BASE="${1:-http://localhost:3000}"
json() { python3 -c 'import sys,json;print(json.load(sys.stdin).get(sys.argv[1],""))' "$1"; }

echo "== health =="
curl -sf "$BASE/v1/health"; echo

echo "== submit =="
RESP=$(curl -sf -X POST "$BASE/v1/jobs" \
  -H 'content-type: application/json' \
  -d '{"input_url":"https://www.okx.ai/agents","aspect_ratio":"9:16","style":"clean-tech"}')
echo "$RESP"
JOB_ID=$(echo "$RESP" | json job_id)
if [ -z "$JOB_ID" ]; then echo "FAIL: no job_id returned"; exit 1; fi
echo "job_id: $JOB_ID"

echo "== poll =="
for i in $(seq 1 40); do
  sleep 2
  S=$(curl -sf "$BASE/v1/jobs/$JOB_ID")
  STATUS=$(echo "$S" | json status)
  echo "[$i] status=$STATUS"
  if [ "$STATUS" = "completed" ]; then
    echo "== done =="
    echo "$S"
    RESULT=$(echo "$S" | json result_url)
    echo "result_url: $RESULT"
    exit 0
  fi
  if [ "$STATUS" = "failed" ]; then
    echo "== failed =="
    echo "$S"
    exit 1
  fi
done

echo "FAIL: job did not complete in time"
exit 1
