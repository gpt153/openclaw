#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22

# Load environment variables from .env file
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

export OPENCLAW_SKIP_CHANNELS=1
export ODIN_ORCHESTRATOR_URL=http://localhost:5105
export USE_ODIN_BACKEND=true

cd /home/samuel/sv/odin-s/openclaw-fork

# Use config file (.openclaw.yml) for gateway settings
# Config file contains: gateway.controlUi.dangerouslyDisableDeviceAuth: true
./openclaw.mjs gateway run --bind loopback
