# Self-hosted production deployment runner

This is a narrowly scoped, non-root GitHub Actions runner for the `deploy.yml`
production deployment job. It exists to avoid GitHub-hosted runner-minute
admission failures. It does **not** replace GitHub-hosted CI, visual tests,
image publication, signatures, SBOMs, provenance, or the signed candidate
manifest gate.

## Boundary

- Host: SGP control host only; never AWS-HK, Trading System, broker, or Source
  Proxy host.
- Identity: Linux user `portal-gh-runner`, with no sudo, Docker group, login
  shell, or persisted deployment SSH key.
- Repository scope: `BobbyAxerol/awesome-portal` only.
- Workflow scope: `deploy.yml` is the sole workflow carrying the
  `portal-deploy` runner label. Production environment approval/secrets and
  the immutable-candidate checks remain mandatory.
- Network: outbound HTTPS to GitHub and the existing SSH deployment route only.
  The runner opens no listener or inbound firewall port.
- Secret hygiene: the workflow writes the deployment key only beneath
  `RUNNER_TEMP`, pins host keys, then securely removes both files in an
  `always()` cleanup step.

The runner itself has no production key or database authority. During a
production environment job, GitHub injects the already-approved deployment
secret transiently; the workflow uses it only to execute the existing remote
release procedure.

## Bootstrap prerequisites

1. A fine-grained token with repository **Administration: Read and write** for
   `BobbyAxerol/awesome-portal`. It is used only to request a short-lived
   runner registration token and is never copied into the runner service.
2. `sudo -n` for the operator on the SGP host.
3. The values pinned in [actions-runner.lock.json](actions-runner.lock.json).
   Do not substitute `latest` or skip the SHA-256 check.

## Bootstrap procedure

From the SGP host, retrieve a short-lived registration token through the
GitHub API, save it as a mode-0600 temporary file, then run:

```bash
sudo ./scripts/install-portal-deploy-runner.sh \
  --repository-url https://github.com/BobbyAxerol/awesome-portal \
  --registration-token-file /tmp/portal-gh-runner-registration-token \
  --lock-file deploy/self-hosted-runner/actions-runner.lock.json
```

The installer consumes and removes the registration-token file, verifies the
runner tarball hash, creates the restricted system user, installs the hardened
service and starts it. It never writes a personal access token into the host.

## Acceptance and recovery

```bash
sudo systemctl status portal-gh-deploy-runner.service --no-pager
sudo journalctl -u portal-gh-deploy-runner.service -n 80 --no-pager
```

Then verify the runner is `online` in the repository Actions runner list and
dispatch `deploy.yml` only with an already-reviewed candidate manifest. A
failed or cancelled deployment must leave the runner service up and must not
leave `id_ed25519` or `known_hosts` under its work directory.

To remove it, disable the service, use GitHub to remove the registered runner,
then remove exactly `/srv/portal-gh-runner` after confirming no job is running.
Do not remove the production Portal runtime, `/srv/portal`, Docker volumes, or
any AWS-HK files.
