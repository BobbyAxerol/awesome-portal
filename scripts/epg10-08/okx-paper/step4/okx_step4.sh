#!/bin/bash
# DRAFT, NOT EXECUTED, no mode below has ever been run. STEP 4 of the OKX Paper profile: new source proxy + new Edge instance PAPER_OKX_SWAP on 10.70.0.2:8446.
#   stage | cert-csr (option a only) | cert-install <crt> (option a only) | proxy-up | edge-up | verify | rollback | rollback-files
# OPTION via OKX_STEP4_OPTION: b (DEFAULT, minimal risk) = NO new bridge, NO new certificate: the new proxy listens on the existing Paper bridge gateway 172.23.0.1 at the new port 8454 with the
# existing server certificate; the new Edge joins the Paper bridge at 172.23.0.4. a = new bridge 172.30.0.0/24, gateway 172.30.0.1:8444, NEW leaf source-proxy-server-okx.crt/.key.
# Touches ONLY: project portal-execution-edge-okx (containers portal-execution-edge-okx-source-proxy-1 and -execution-edge-1; option a also its own bridge) and NEW files named *okx*
# next to the existing ones in /srv/primus/portal/source-proxy (option b: two conf files; option a: those two plus the new certificate and key). Never touches the Paper/Sandbox/Live Edges, proxies, Managers, the shared Edge secret directory, the existing proxy files,
# the OKX Manager containers, any database. One step per call, stops at the first error, never edits or deletes an existing file.
# SUDO: marked `SUDO` below, each one a single non-interactive `sudo -n <command>`; everything else runs as bobby (docker group), no sudo.
# Required env: OKX_EDGE_IMAGE (sha256:<64 hex>, the image id of the built Edge) and OKX_EDGE_COMPOSE_SHA (sha256 of edge-okx.compose.json rendered WITH that digest, approved by the owner).
set -euo pipefail

OPT=${OKX_STEP4_OPTION:-b}
case "$OPT" in
  b) GW=172.23.0.1; PORT=8454; ES=execution-edge-okx; EDGE_IP=172.23.0.4; BRIDGE=portal-execution-edge_execution-private ;;
  a) GW=172.30.0.1; PORT=8444; ES=execution-edge; EDGE_IP=; BRIDGE= ;;
  *) echo "STOP: OKX_STEP4_OPTION must be a or b"; exit 64 ;;
esac
SRC=${OKX_STEP4_SRC:-/home/bobby/.worktrees/edge-okx-paper-ts-20261118/scripts/epg10-08/okx-paper}
R=/home/bobby/.local/state/portal-execution-edge/releases
D=${OKX_STEP4_STATE:-$R/okx-paper-20261118}            # non-secret staging dir (rendered files, release file, CSR, baseline), created by stage
PX=/srv/primus/portal/source-proxy
EDGE_SECRETS=/srv/primus/portal/execution-edge
P=portal-execution-edge-okx
PC=$P-source-proxy-1; EC=$P-execution-edge-1
PAPER_EC=portal-execution-edge-execution-edge-1; SBX_EC=portal-execution-edge-sandbox-execution-edge-1; LIVE_EC=portal-execution-edge-live-execution-edge-1
PAPER_PC=portal-execution-edge-source-proxy-1; SBX_PC=portal-execution-edge-sandbox-source-proxy-1; LIVE_PC=portal-execution-edge-live-source-proxy-1
MGR_FACADE=trading-system-manager-read-paper-okx-portal_manager_read-1; MGR_ISSUER=trading-system-manager-read-paper-okx-portal_manager_issuer-1
PROXY_IMAGE=ghcr.io/bobbyaxerol/portal-source-proxy@sha256:aa14e21c546997a94c61238ee46cf92cb650e822c4ea22f357090e275886246b
RUNTIME_GID=987
RELEASE_SHA=8fd7bdf8d1cc36a50077b7e5565c58ba6886a03f76680c48640c00a9f97d6f82
# approved hashes (DRAFT values: the owner re-approves them with the final image digest)
if [ "$OPT" = b ]; then NGINX_SHA=748b90228c747ca0482b01f418695d708bf1c4e270ad780adc906a927ef19ce8; else NGINX_SHA=1d36d5d5c1b9052adb39e78022a59d23dc3dde14db86f4ff2c4b8bbc9ae4d7c5; fi
LOC_SHA=54956b72138d5c9a6af937e29d3e124fb1556f30c302a1b41f16e294a4e531fa
PROXY_COMPOSE_SHA=7b336d48f607e3f5f477e5ac9bad6c98b7f2b2ae181a67eae319dd7c9875f50b
RENDER_PY_SHA=fa64f594ad8d799b277456768273df9930ac0f45d931faa35710f2e9ecab8ad0
PROBE_SHA=fb292608e8583ce91ff6452d9fc96876eca0e36160c0e7c19a2692069a39f85b

h() { sha256sum "$1" | cut -c1-64; }
need() { [ "$(h "$1")" = "$2" ] || { echo "STOP: hash of $1 differs from approved $2"; exit 2; }; }
dc() { docker compose -p $P -f $D/render/edge-okx.compose.json -f $D/render/proxy-okx.compose.json "$@"; }
img_of() { docker inspect "$1" --format '{{.Image}}'; }
started_of() { docker inspect "$1" --format '{{.State.StartedAt}}'; }
wait_healthy() { s=""; for i in 1 2 3 4 5 6; do sleep 10; s=$(docker inspect "$1" --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}'); echo "$1 health=$s"; [ "$s" = healthy ] && break; done; return 0; }
need_src() { need $SRC/step4/render_step4.py $RENDER_PY_SHA; need $SRC/step3/okx_manager_probe.py $PROBE_SHA; }
need_render() {   # the rendered files are exactly the approved ones
  need $D/render/nginx.manager-okx.conf $NGINX_SHA; need $D/render/manager-v2-locations-okx.conf $LOC_SHA; need $D/render/proxy-okx.compose.json $PROXY_COMPOSE_SHA
  [ -n "${OKX_EDGE_COMPOSE_SHA:-}" ] || { echo "STOP: set OKX_EDGE_COMPOSE_SHA"; exit 3; }
  need $D/render/edge-okx.compose.json "${OKX_EDGE_COMPOSE_SHA#sha256:}"
}
others_unchanged() {   # the running stacks must be exactly as recorded by stage
  while read -r name image started; do
    [ "$(img_of $name)" = "$image" ] && [ "$(started_of $name)" = "$started" ] || { echo "STOP: $name changed since stage (image or start time)"; exit 3; }
  done < $D/baseline.txt
}
managers_up() { for c in $MGR_FACADE $MGR_ISSUER; do [ "$(docker inspect $c --format '{{.State.Status}}')" = running ] || { echo "STOP: $c is not running"; exit 3; }; done; }

case "${1:-}" in
stage)   # no service touched. Creates $D (bobby), renders offline, copies the release file; SUDO only to install two non-secret config files next to the existing ones.
  [ ! -e $D ] || { echo "STOP: $D exists (stage never overwrites)"; exit 3; }
  need_src
  [ -n "${OKX_EDGE_IMAGE:-}" ] && [ -n "${OKX_EDGE_COMPOSE_SHA:-}" ] || { echo "STOP: set OKX_EDGE_IMAGE=sha256:<image id> and OKX_EDGE_COMPOSE_SHA"; exit 3; }
  [ "$(docker image inspect localhost/portal-execution-edge@$OKX_EDGE_IMAGE --format '{{.Id}}')" = "$OKX_EDGE_IMAGE" ] || { echo "STOP: the Edge image $OKX_EDGE_IMAGE is not on this host"; exit 3; }
  docker image inspect $PROXY_IMAGE --format '{{.Id}}' >/dev/null || { echo "STOP: proxy image not on this host"; exit 3; }
  install -d -m 0755 $D
  { for c in $PAPER_EC $SBX_EC $LIVE_EC $PAPER_PC $SBX_PC $LIVE_PC; do echo "$c $(img_of $c) $(started_of $c)"; done; } > $D/baseline.txt
  install -m 0644 $SRC/artifacts/paper-okx-swap/manager-catalogue-release.json $D/manager-catalogue-release.json; need $D/manager-catalogue-release.json $RELEASE_SHA
  python3 -B $SRC/step4/render_step4.py render --out $D/render --option $OPT --image "$OKX_EDGE_IMAGE"
  need_render
  docker compose -f $D/render/edge-okx.compose.json -f $D/render/proxy-okx.compose.json config --quiet
  # SUDO 1: the two non-secret config files, root:portal-runtime 0640 like their siblings; refuse if present.
  for f in nginx.manager-okx.conf manager-v2-locations-okx.conf; do
    sudo -n test ! -e "$PX/$f" || { echo "STOP: $PX/$f exists"; exit 3; }
    sudo -n install -m 0640 -o root -g portal-runtime "$D/render/$f" "$PX/$f"
  done
  echo "stage done $(date -u +%FT%TZ) option $OPT: next $([ "$OPT" = a ] && echo cert-csr || echo proxy-up)"; ls -l $D ;;
cert-csr|cert-install)
  [ "$OPT" = a ] || { echo "STOP: option b reuses the existing proxy certificate (SAN IP 172.23.0.1 covers any port): no CSR, no certificate step"; exit 3; }
  ;;&
cert-csr)   # SUDO 2: generate the NEW proxy server key inside $PX (it never leaves) and a CSR (public) in $D for the owner to sign with the Edge server CA.
  need_src; [ -d $D ] || { echo "STOP: run stage first"; exit 3; }
  sudo -n test ! -e "$PX/source-proxy-server-okx.key" || { echo "STOP: key exists"; exit 3; }
  sudo -n sh -c "umask 077; openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout $PX/source-proxy-server-okx.key -out /dev/stdout \
     -subj '/CN=portal-source-proxy-okx' -addext 'subjectAltName=IP:172.30.0.1,URI:spiffe://primusspark/portal/source-proxy/execution'" > $D/source-proxy-server-okx.csr
  sudo -n chown root:portal-runtime "$PX/source-proxy-server-okx.key"; sudo -n chmod 0640 "$PX/source-proxy-server-okx.key"
  openssl req -in $D/source-proxy-server-okx.csr -noout -subject -verify -text | grep -E "subject=|verify|IP Address|URI" || true
  echo "CSR (public): $D/source-proxy-server-okx.csr -> owner signs offline; then: $0 cert-install <signed.crt>" ;;
cert-install)   # SUDO 3 (read of the public CA and of the key's public half for the match check) + SUDO 4 (install of the signed certificate)
  need_src; crt=${2:?usage: cert-install <signed.crt>}; [ -d $D ] || { echo "STOP: run stage first"; exit 3; }
  sudo -n test ! -e "$PX/source-proxy-server-okx.crt" || { echo "STOP: certificate already installed"; exit 3; }
  openssl x509 -in "$crt" -noout -ext subjectAltName | grep -q "IP Address:172.30.0.1" || { echo "STOP: SAN lacks IP 172.30.0.1"; exit 3; }
  openssl x509 -in "$crt" -noout -checkend $((30*86400)) >/dev/null || { echo "STOP: certificate expires within 30 days"; exit 3; }
  openssl x509 -in "$crt" -noout -ext extendedKeyUsage | grep -q "TLS Web Server Authentication" || { echo "STOP: EKU lacks serverAuth"; exit 3; }
  sudo -n cat "$EDGE_SECRETS/source-proxy-ca.crt" > $D/ca-copy.crt
  openssl verify -CAfile $D/ca-copy.crt "$crt" >/dev/null || { echo "STOP: the certificate does not chain to source-proxy-ca.crt"; exit 3; }
  [ "$(openssl x509 -in "$crt" -noout -pubkey | sha256sum)" = "$(sudo -n openssl pkey -in "$PX/source-proxy-server-okx.key" -pubout | sha256sum)" ] || { echo "STOP: certificate does not match the generated key"; exit 3; }
  sudo -n install -m 0640 -o root -g portal-runtime "$crt" "$PX/source-proxy-server-okx.crt"
  openssl x509 -in "$crt" -noout -subject -issuer -enddate -ext subjectAltName | sed 's/^/installed: /' ;;
proxy-up)   # option b: starts ONLY the new proxy on the existing bridge gateway; option a: first creates the bridge via the stopped Edge container
  need_src; need_render; others_unchanged; managers_up
  files="nginx.manager-okx.conf manager-v2-locations-okx.conf"; [ "$OPT" = a ] && files="$files source-proxy-server-okx.crt source-proxy-server-okx.key"
  for f in $files; do sudo -n test -f "$PX/$f" || { echo "STOP: staged proxy file $f missing"; exit 3; }; done
  [ -z "$(docker ps -aq --filter name=^$PC$ --filter name=^$EC$)" ] || { echo "STOP: a container of the project exists"; exit 3; }
  if ss -ltn | grep -q "$GW:$PORT "; then echo "STOP: $GW:$PORT already listens"; exit 3; fi
  if [ "$OPT" = b ]; then
    [ "$(docker network inspect $BRIDGE --format '{{(index .IPAM.Config 0).Subnet}} {{(index .IPAM.Config 0).Gateway}}')" = "172.23.0.0/24 172.23.0.1" ] || { echo "STOP: the Paper bridge is not 172.23.0.0/24"; exit 3; }
    ss -ltn | grep -q '172.23.0.1:8444 ' || { echo "STOP: the Paper proxy does not listen on 172.23.0.1:8444 (unexpected state)"; exit 3; }
    if docker network inspect $BRIDGE --format '{{range .Containers}}{{.IPv4Address}} {{end}}' | grep -q "$EDGE_IP/"; then echo "STOP: $EDGE_IP is taken on the Paper bridge"; exit 3; fi
  else
    [ "$(docker network ls --filter name=^${P}_execution-private$ -q | wc -l)" = 0 ] || { echo "STOP: the bridge already exists"; exit 3; }
  fi
  # pre-check of the nginx config with the same image, user, group and mounts, no network (nginx -t does not bind)
  docker run --rm --pull=never --network host --user 101:101 --group-add $RUNTIME_GID --read-only --cap-drop ALL --tmpfs /tmp --tmpfs /var/cache/nginx:uid=101,gid=101 \
    -v $PX:/run/secrets:ro -v $PX/nginx.manager-okx.conf:/etc/nginx/nginx.conf:ro -v $PX/manager-v2-locations-okx.conf:/run/secrets/manager-v2-locations.conf:ro \
    --entrypoint nginx $PROXY_IMAGE -t -q
  echo "proxy-up start $(date -u +%FT%TZ) option $OPT"
  if [ "$OPT" = a ]; then
    dc create --pull never $ES                                    # creates network portal-execution-edge-okx_execution-private 172.30.0.0/24 + the STOPPED edge container
    [ "$(docker network inspect ${P}_execution-private --format '{{(index .IPAM.Config 0).Subnet}} {{(index .IPAM.Config 0).Gateway}}')" = "172.30.0.0/24 172.30.0.1" ] || { echo "STOP: bridge has another subnet: run rollback"; exit 4; }
  fi
  dc up -d --no-deps --pull never source-proxy
  wait_healthy $PC; state=$(docker inspect $PC --format '{{.State.Status}}')
  if [ "$state" != running ] || [ "$s" != healthy ] || ! ss -ltn | grep -q "$GW:$PORT "; then echo "STOP: proxy not healthy or not listening on $GW:$PORT: run rollback"; exit 4; fi
  ss -ltn | grep -q '172.23.0.1:8444 ' || { echo "STOP: the Paper proxy listener disappeared: run rollback and report"; exit 4; }
  others_unchanged; echo "proxy-up done $(date -u +%FT%TZ): next (owner) probe: sudo -n python3 -B $SRC/step3/okx_manager_probe.py proxy --endpoint $GW:$PORT" ;;
edge-up)   # option b: creates and starts the Edge on the Paper bridge; option a: starts the created Edge; automatic rollback of THIS project if it is not healthy
  need_src; need_render; others_unchanged; managers_up
  [ "$(docker inspect $PC --format '{{.State.Health.Status}}')" = healthy ] || { echo "STOP: proxy not healthy"; exit 3; }
  [ -n "${OKX_EDGE_IMAGE:-}" ] || { echo "STOP: set OKX_EDGE_IMAGE"; exit 3; }
  if [ "$OPT" = a ]; then [ "$(img_of $EC)" = "$OKX_EDGE_IMAGE" ] || { echo "STOP: the created Edge container is not on OKX_EDGE_IMAGE"; exit 3; }
  else [ -z "$(docker ps -aq --filter name=^$EC$)" ] || { echo "STOP: the Edge container exists"; exit 3; }; fi
  echo "edge-up start $(date -u +%FT%TZ) option $OPT"
  dc up -d --no-deps --pull never $ES
  [ "$(img_of $EC)" = "$OKX_EDGE_IMAGE" ] || { echo "STOP: Edge container is not on OKX_EDGE_IMAGE"; dc down --remove-orphans; exit 4; }
  wait_healthy $EC
  if [ "$(docker inspect $EC --format '{{.State.Status}}')" != running ] || [ "$s" != healthy ] || ! ss -ltn | grep -q '10.70.0.2:8446 '; then
    echo "Edge not healthy or not listening: rolling back the project"; dc down --remove-orphans; echo "STOP: edge-up failed, project removed $(date -u +%FT%TZ)"; exit 4; fi
  others_unchanged
  echo "edge-up done $(date -u +%FT%TZ): next: verify" ;;
verify)   # read-only
  need_src; [ -d $D ] || { echo "STOP: no stage dir"; exit 3; }
  for c in $PC $EC; do echo "$c image=$(img_of $c) status=$(docker inspect $c --format '{{.State.Status}}') restarts=$(docker inspect $c --format '{{.RestartCount}}') health=$(docker inspect $c --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}')"; done
  ss -ltn | grep -E "$GW:$PORT |172.23.0.1:8444 |10.70.0.2:8446 |127.0.0.1:8323 |127.0.0.1:8324 " || true
  docker inspect $EC --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^EDGE_(ENVIRONMENT|MANAGER_V2_PROFILE_ID|DELEGATION_AUDIENCE|MANAGER_CATALOGUE_CACHE_TTL_MS|MANAGER_SOURCE_DB_PIN_FILE)=' | sed 's/^/edge env: /'
  echo "proxy log lines with error/emerg (120 s): $(docker logs --since 120s $PC 2>&1 | grep -Eci 'emerg|error' || true) (expected 0)"
  echo "edge log lines with error (120 s): $(docker logs --since 120s $EC 2>&1 | grep -ci error || true) (expected 0)"
  others_unchanged && echo "Paper/Sandbox/Live Edges and proxies unchanged since stage"
  python3 -B $SRC/step3/okx_manager_probe.py edge-tls
  echo "owner, with sudo: sudo -n python3 -B $SRC/step3/okx_manager_probe.py proxy --endpoint $GW:$PORT" ;;
rollback)   # removes ONLY this project (containers + its bridge); no volume, no image, no file in /srv, no other container
  [ "$(docker ps -a --filter label=com.docker.compose.project=$P -q | wc -l)" -le 2 ] || { echo "STOP: unexpected containers in project $P"; exit 3; }
  echo "rollback start $(date -u +%FT%TZ)"; dc down --remove-orphans      # option b: the external Paper bridge is never removed by compose
  docker network inspect ${BRIDGE:-${P}_execution-private} --format '{{.Name}} containers={{len .Containers}}' 2>/dev/null || echo "network of the project: none left"
  if [ -s $D/baseline.txt ]; then others_unchanged && echo "other stacks unchanged"; fi ;;
rollback-files)   # SUDO: only after `rollback`; removes ONLY the *okx* files this procedure installed (literal names, fixed directory)
  [ -z "$(docker ps -aq --filter label=com.docker.compose.project=$P)" ] || { echo "STOP: project $P still has containers: run rollback first"; exit 3; }
  sudo -n rm -v -- /srv/primus/portal/source-proxy/nginx.manager-okx.conf /srv/primus/portal/source-proxy/manager-v2-locations-okx.conf
  if [ "$OPT" = a ]; then sudo -n rm -v -- /srv/primus/portal/source-proxy/source-proxy-server-okx.crt /srv/primus/portal/source-proxy/source-proxy-server-okx.key; fi ;;
*) echo "usage: okx_step4.sh stage|cert-csr|cert-install <crt>|proxy-up|edge-up|verify|rollback|rollback-files"; exit 64 ;;
esac
