-- Up Migration
--
-- Legacy stable compatibility sentinel for N09.
--
-- Historical stable v1.0.1 databases recorded the equally-prefixed
-- session-activation migration before N09 was introduced.  The release
-- migrator repairs that precise ledger state transactionally before invoking
-- node-pg-migrate; this forward migration proves that the N09 schema is now
-- present before later governance migrations use it.  Fresh and development
-- databases have already applied N09 normally, so this is intentionally a
-- non-mutating validation migration for them.
DO $$
BEGIN
  IF to_regclass('public.governance_approval_known_limitations') IS NULL
     OR to_regclass('public.governance_r2_lineage') IS NULL
     OR to_regclass('public.governance_sandbox_smoke_plans') IS NULL
     OR to_regclass('public.execution_operation_queue_read') IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'governance_approval_requests'
         AND column_name = 'supersedes_approval_id'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'execution_operation_queue_items'
         AND column_name = 'assigned_to_user_id'
     ) THEN
    RAISE EXCEPTION
      'N09 governance schema is absent; run the controlled legacy migration recovery before this release';
  END IF;
END
$$;

-- Down Migration
-- A release ledger compatibility sentinel has no schema of its own to undo.
SELECT 1;
