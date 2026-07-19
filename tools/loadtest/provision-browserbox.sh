#!/bin/bash
# ============================================================================
# Bootstrap a fresh AlmaLinux 9 box as a webphone-browser host for the GenX
# load test. Run ON the new box as root:
#   bash provision-browserbox.sh
# Then from the control box:  scp webphone-agents.mjs newbox:/root/loadtest/
# and launch fleets:  screen -dmS ltwebSN bash -c 'AGENTS=LT2XX-LT2YY node webphone-agents.mjs >webSN.log 2>&1'
# ============================================================================
set -euo pipefail

echo "== node 20 =="
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 20 ]; then
  dnf module reset -y nodejs
  dnf module enable -y nodejs:20
  dnf install -y nodejs
fi
node -v

echo "== chromium runtime deps + playwright =="
mkdir -p /root/loadtest && cd /root/loadtest
[ -f package.json ] || npm init -y >/dev/null
npm i playwright >/dev/null
npx playwright install --with-deps chromium chromium-headless-shell

echo "== sanity: launch/close a headless browser =="
node -e "const {chromium}=require('playwright');(async()=>{const b=await chromium.launch({headless:true});await b.close();console.log('playwright OK');})()"

echo "== done. Copy webphone-agents.mjs here and launch fleets. =="
