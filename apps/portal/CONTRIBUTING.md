# Contributing

1. Start from `dev`; do not commit directly to `main`.
2. Work only inside this repository.
3. Never edit `strategy/main.py` or the sibling QuantBT repository.
4. Keep runtime modules free from notebook globals and presentation side effects.
5. Run `./scripts/test_backend.sh` before every meaningful commit.
6. Commit generated artifacts, data, secrets and environments nowhere.
7. Open a reviewed merge from `dev` to `main` only after domain parity and UI
   gates in `implementation_plan_protoyype.md` pass.

Enable the repository hook once after cloning:

```bash
git config core.hooksPath .githooks
```
