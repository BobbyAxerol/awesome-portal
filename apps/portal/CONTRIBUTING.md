# Contributing to Portal Research

This module follows the root Portal monorepo workflow:

1. Start a focused branch from root `dev`; never commit directly to `main`.
2. Keep QuantBT research changes inside this module's backend/frontend/domain
   boundaries, and coordinate shared runtime changes with root Compose/docs.
3. Never edit `strategy/main.py` or add a sibling QuantBT source tree.
4. Keep runtime modules free from notebook globals and presentation side effects.
5. Run `./scripts/test_backend.sh` and relevant frontend checks before each
   meaningful commit.
6. Commit generated artifacts, data, secrets and environments nowhere.
7. Commit every tested, coherent change immediately; open a reviewed merge from
   `dev` to `main` only after the domain/UI gates pass.

Enable the root hook once after cloning:

```bash
../../scripts/install-git-hooks.sh
```
