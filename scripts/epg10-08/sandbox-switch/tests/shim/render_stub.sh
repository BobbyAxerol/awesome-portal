#!/bin/bash
# stands in for `python3 -B sandbox_render.py` (its logic is unit tested in test_sandbox_render.py)
echo "RENDER $*" >> "$SHIM_STATE/calls.log"
exit ${RENDER_RC:-0}
