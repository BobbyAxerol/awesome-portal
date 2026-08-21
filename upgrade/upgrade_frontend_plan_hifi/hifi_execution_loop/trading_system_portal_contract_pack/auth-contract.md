# auth-contract.md — Authentication hiện hành (sanitized, không có credential)

> ⚠ **Đã sửa 2026-08-21 (Phase F).** Bản trước mô tả chuỗi verify như thể luôn chạy.
> Thực tế `X-API-Key` là **tuỳ chọn** — xem §"Cảnh báo" bên dưới. Nguồn máy đọc được:
> [`extract/api-surface.json`](extract/api-surface.json).

## Cơ chế

| Interface | Cơ chế | Chi tiết |
|---|---|---|
| Alpha requests | X-API-Key **(TUỲ CHỌN — xem cảnh báo dưới)** | Cổng thật: `gate:active_alphas` (SISMEMBER). Key chỉ được verify **khi header có mặt**: gate:apikeys (HGET) → sha256$v1$ hoặc hmac-sha256$v1$ (pepper) + compare_digest; legacy plaintext upgrade-on-auth nếu enable |
| Rate limit | Redis bucket | rl:gateway:{route}:{alpha_id}:{mode}:{venue}:{account_id}:{epoch_sec}, default 300 req/s, TTL 2s, 429 retry_after_seconds |
| Admin | X-Admin-Token / user-pass | 503 nếu chưa configure |
| Public | không auth | /v1/health, /v1/health/capabilities, /v1/contracts, /openapi.json, /docs |
| DB | superuser (app+CLI chung) | không role read-only riêng — OWNER_DECISION_REQUIRED |
| Redis | network scoped | không ACL riêng |
| Broker | credential per venue/mode ref | binance:{mode}:{external_account_ref} |

## ⚠ Cảnh báo bảo mật — TS-GAP-008

`services/gateway/core/engine.py:check_auth_and_rate`:

```python
is_active = await self.redis.sismember("gate:active_alphas", alpha_id)
if not is_active:
    return False, "UNAUTHORIZED_ALPHA", 403
if api_key is not None:          # ← bỏ header thì bỏ qua toàn bộ verify
    ...verify_api_key(...)
```

- Gửi key **sai** → `403 INVALID_API_KEY` (chặn).
- **Không gửi** header → đi tiếp. Không gửi còn dễ lọt hơn gửi sai.
- Biết một `alpha_id` đang active là đủ để đọc **và submit lệnh** trên 41 operation.
- `GATEWAY_LEGACY_PLAINTEXT_API_KEYS_ENABLED` mặc định `true`.

Giảm nhẹ hiện tại: gateway bind `127.0.0.1:8000` (loopback), chưa expose ra ngoài.
Rủi ro thành hiện thực đúng lúc Portal edge mở đường vào.

**Hệ quả:** Portal edge là ranh giới danh tính **duy nhất**. Không được ghi vào audit
rằng "Trading System đã xác thực actor". Không để `alpha_id` xuống context browser
chạm được.

Mức bằng chứng: `CONFIRMED_SOURCE` + runtime corroborate một phần (probe với `alpha_id`
không tồn tại trả `403 UNAUTHORIZED_ALPHA`, chứng minh nhánh sismember là cổng đang
chạy). Không khai thác thật để tránh đọc dữ liệu production.

## Gaps vs Portal target §6

- KHÔNG JWT / mTLS / delegated actor assertion / per-scope key → MISSING
- Portal service account riêng: khả thi (allowlist X-API-Key riêng + X-Admin-Token riêng), CHƯA tạo (cần owner approval)
- OpenAPI securitySchemes rỗng — auth ở middleware, không khai báo spec

## Verification behavior (không tiết lộ secret)

- Token type: API key (256-bit hex, dạng sha256$v1$<hex> hoặc hmac-sha256$v1$<hex>)
- Header: X-API-Key (alpha), X-Admin-Token (admin)
- Scope: per alpha (route-scoped rate); admin global
- TTL: không có TTL key; rotation thủ công qua gate:apikeys
- Issuer/verifier: gateway services (Redis gate:* là nguồn verifier)