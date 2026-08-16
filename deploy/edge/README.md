# Edge deploy runbook — portal.primusspark.com (U06)

> Owner-operational steps. This directory contains **templates only**;
> credentials, certs and real values never enter the repository.

## 0. Preconditions

- Access application `PrimusSpark Portal` exists with: deny-by-default,
  Google Workspace (prototype fallback: OTP giới hạn `@azdag.com`), session
  24 h, hostname `portal.primusspark.com`, và **không** có `Bypass/Everyone`.
- Named tunnel created in Zero Trust → note `<TUNNEL_UUID>` + the
  credentials JSON.

## 1. DNS record (Cloudflare dashboard)

```text
Type:  CNAME
Name:  portal
Target: <TUNNEL_UUID>.cfargotunnel.com
Proxy: enabled (orange cloud)
```

## 2. VPS — cloudflared

```bash
sudo install -d -o root -g cloudflared -m 0750 /etc/cloudflared
sudo cp deploy/cloudflared/config.example.yml /etc/cloudflared/config.yml
sudo chown root:cloudflared /etc/cloudflared/config.yml && sudo chmod 0640 /etc/cloudflared/config.yml
# place <TUNNEL_UUID>.json from the dashboard:
sudo chown root:cloudflared /etc/cloudflared/<TUNNEL_UUID>.json
sudo chmod 0640 /etc/cloudflared/<TUNNEL_UUID>.json

sudo cloudflared --config /etc/cloudflared/config.yml tunnel ingress validate
sudo cloudflared --config /etc/cloudflared/config.yml tunnel ingress rule https://portal.primusspark.com
sudo systemctl restart cloudflared
```

## 3. VPS — nginx loopback TLS

```bash
# Install the Origin CA certificate and key (from Cloudflare) OUTSIDE the repo:
sudo install -m 0644 primusspark_origin.crt /etc/ssl/certs/
sudo install -o root -g root -m 0600 primusspark_origin.key /etc/ssl/private/

sudo cp deploy/nginx/portal-loopback.conf /etc/nginx/conf.d/
sudo nginx -t && sudo systemctl reload nginx
```

Portal binds `127.0.0.1:8080` (loopback only).

## 4. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw default deny incoming
sudo ufw enable
# verify public 80/443/8080 closed: curl from outside must fail
```

## 5. Validation checklist (guide §40.16)

- [ ] `noTLSVerify: false` in the tunnel config.
- [ ] Wrong cert/AUD/hostname fails closed.
- [ ] Stopping the tunnel makes the hostname unavailable but never exposes
      the origin.
- [ ] `/nginx-healthz` returns `ok` on the loopback only.
- [ ] App-level auth (BFF) is enabled before granting broad access; before
      that, Access alone gates the domain to `@azdag.com`.
