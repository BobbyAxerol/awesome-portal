-- Preserve candidate history; add exact Limit/OCO product proof after batch-index qualification.
INSERT INTO research.execution_recipe_product_receipts_v1(recipe_digest,receipt_path,receipt_sha256,scope)
VALUES('99b29e57151d36005921ae4fa4af65dd1289d458fcdca25815ef529079f82d58','upgrade/research_loop/evidence/P10/LIMIT_OCO_PRODUCT_QUALIFICATION_2026-10-08.md','f21cd2d548513bb70947897240bc17ec2cfd6145c1af4632cbdae3f1b80cf84a','EXACT_PROFILE_PRODUCT_RUN');
