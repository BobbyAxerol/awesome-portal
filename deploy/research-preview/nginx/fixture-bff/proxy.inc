# Shared by every fixture location in fixture-bff.conf. Same proxy settings as the `/api/` block
# in deploy/nginx/portal.conf (HTTP/1.1, unbuffered, Host and X-Forwarded-*), pointed at the
# fixture server instead of PORTAL_WEB_UPSTREAM. FIXTURE_LAB lane: not acceptance evidence.
proxy_pass http://portal-fixture-bff:4100;
proxy_http_version 1.1;
proxy_connect_timeout 3s;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Request-ID $request_id;
proxy_set_header Connection '';
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 60s;
add_header X-Fixture-Overlay on always;
