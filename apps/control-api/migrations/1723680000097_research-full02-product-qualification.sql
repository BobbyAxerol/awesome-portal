-- Append product proof; keep 096's original candidate history immutable.
INSERT INTO research.execution_recipe_product_receipts_v1
 (recipe_digest,receipt_path,receipt_sha256,scope) VALUES
 ('7a208ce129e15bd1fdb6f4d411b2061ae8a1e54ab6a421a19b6e09e5e7e79716',
  'upgrade/research_loop/evidence/P10/FULL_02_PRODUCT_QUALIFICATION_2026-10-06.md',
  'aa66781df94bd4dcb9567a1fc3c856586e36c4f42b0be7969b1df1859d406859',
  'EXACT_PROFILE_PRODUCT_RUN'),
 ('b1c678862ac808ad159dfe552d4b4c7c200aeb0016efca03b33765042f93b993',
  'upgrade/research_loop/evidence/P10/FULL_02_PRODUCT_QUALIFICATION_2026-10-06.md',
  'aa66781df94bd4dcb9567a1fc3c856586e36c4f42b0be7969b1df1859d406859',
  'EXACT_PROFILE_PRODUCT_RUN');
