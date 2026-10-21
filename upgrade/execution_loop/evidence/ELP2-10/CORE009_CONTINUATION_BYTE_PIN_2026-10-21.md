# Core continuation credential byte pin —21October2026,05:24UTC

Core independently read **metadata/hash only**, not token values, from the
actual new private file named in continuation READY:

- **File byte SHA256:** `f339db031b068d5a789e097b0523813e039b0f729a16b420d811dec924658c41`.
- stat: root0:0,0600,327bytes,regular file,onehardlink.
- **Path SHA256:** `3f1db92cf7b783fad490b62c9833ab88cf4f5343ccac785d44ce9f8a62b1ba29`
  is explicitly labeled pathSHA in the original official issue receipt/READY;
  it is not a byte checksum. Do not use it for credential byte verification.
- Session `ses_f1c6ea88ef394c4290a7bf393b0710d8`, expiry05:36:54.553UTC;
  original official issue receiptSHA5358a369 unchanged. No reissue or extension.

Core approves the independently matched byte pin above for the already
delegated single STREAMrevoke case. Keep first wrong-kind pin preflight refusal
as BEFOREHTTP/noadmission, not a connected failure or hidden retry. No source,
grants, tokenbytes or root custody was changed by this metadata check.
After case, see CORE009_RESTART_COORDINATION_2026-10-21.md for clientpauseACK.
