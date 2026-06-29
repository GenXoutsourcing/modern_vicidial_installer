#!/usr/bin/env bash
#
# Convenience wrapper for installing the GENX VICIdial modern UI overlay from
# the root of this installer repo.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OVERLAY_INSTALLER="${SCRIPT_DIR}/genx-vicidial-overlay/install.sh"

if [[ ! -x "$OVERLAY_INSTALLER" ]]; then
  chmod +x "$OVERLAY_INSTALLER"
fi

exec "$OVERLAY_INSTALLER" "$@"
