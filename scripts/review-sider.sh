#!/usr/bin/env bash
# v1.5 侧边栏视觉复验：编排层放 shell（Bash 工具可直接起 node.exe；
# node 进程内 spawn 子进程在本机恒为 EBUSY，故 chrome 由 shell 起）。
set -e
cd "$(dirname "$0")/.."
PORT="${CDP_PORT:-9339}"
SHOTS=".tmp-shots/v15-sider"
PROFILE=".tmp-shots/chrome-profile-v15"
mkdir -p "$SHOTS" "$PROFILE"

CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
if [ ! -f "$CHROME" ]; then echo "chrome not found: $CHROME"; exit 1; fi

"$CHROME" --headless=new --remote-debugging-port="$PORT" --disable-gpu --no-first-run \
  --user-data-dir="$PROFILE" about:blank >/dev/null 2>&1 &
CHROME_PID=$!
trap 'kill $CHROME_PID 2>/dev/null || true' EXIT

CDP_PORT="$PORT" node scripts/review-sider.mjs
