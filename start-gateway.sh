#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22

# Load environment variables
export ANTHROPIC_API_KEY=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
export OPENCLAW_SKIP_CHANNELS=1
export ODIN_ORCHESTRATOR_URL=http://localhost:5105
export USE_ODIN_BACKEND=true

# Disable device authentication for web access
export OPENCLAW_GATEWAY_CONTROL_UI_DANGEROUSLY_DISABLE_DEVICE_AUTH=true
export OPENCLAW_GATEWAY_CONTROL_UI_ALLOW_INSECURE_AUTH=true

cd /home/samuel/sv/odin-s/openclaw-fork
./openclaw.mjs gateway run --bind loopback
