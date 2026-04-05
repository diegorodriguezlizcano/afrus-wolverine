-- =============================================================================
-- Migration: 0001_add_rls_policies
-- Description: Enable Row Level Security on all tenant-scoped tables and create
--              per-table tenant-isolation policies.
-- Note: Prisma does not support RLS natively, so this is raw SQL applied after
--       the base schema migration. Run manually: prisma migrate deploy
--       Or apply via: npx prisma migrate resolve --applied 0001_add_rls_policies
--       after the base migration has run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Create the application role (run once)
-- -----------------------------------------------------------------------------

-- Create a dedicated non-superuser role for the Wolverine application.
-- This role will be used by the Prisma connection pool.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'wolverine_app') THEN
    CREATE ROLE wolverine_app LOGIN PASSWORD 'wolverine_app_secret';
  END IF;
END
$$;

-- Grant required permissions to the app role
GRANT CONNECT ON DATABASE wolverine TO wolverine_app;
GRANT USAGE ON SCHEMA public TO wolverine_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO wolverine_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO wolverine_app;

-- -----------------------------------------------------------------------------
-- 2. Create the RLS setter helper function
-- -----------------------------------------------------------------------------

-- Function to set the current organization context for the session.
-- Application code must call: SET app.current_org_id = 'uuid-here'
-- BEFORE executing any tenant-scoped queries.
CREATE OR REPLACE FUNCTION set_tenant_context(org_id uuid)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_org_id', org_id::text, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- SECURITY DEFINER so it can be called by the app role without superuser

-- Grant execute to app role
GRANT EXECUTE ON FUNCTION set_tenant_context(uuid) TO wolverine_app;

-- -----------------------------------------------------------------------------
-- 3. Enable RLS on all tenant-scoped tables
-- -----------------------------------------------------------------------------

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE origins ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE lost_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_transition_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_tag_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 4. Create tenant isolation policies per table
-- -----------------------------------------------------------------------------

-- USERS: rows must match the current_org_id session variable
CREATE POLICY tenant_isolation_users ON users
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- LEADS
CREATE POLICY tenant_isolation_leads ON leads
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- ORIGINS
CREATE POLICY tenant_isolation_origins ON origins
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- TAGS
CREATE POLICY tenant_isolation_tags ON tags
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- LOST_REASONS
CREATE POLICY tenant_isolation_lost_reasons ON lost_reasons
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- SYNC_TAGS
CREATE POLICY tenant_isolation_sync_tags ON sync_tags
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- STAGE_TRANSITION_LOG
CREATE POLICY tenant_isolation_stage_transition_log ON stage_transition_log
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- ACTION_TAG_LOG
CREATE POLICY tenant_isolation_action_tag_log ON action_tag_log
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- SYNC_LOG
CREATE POLICY tenant_isolation_sync_log ON sync_log
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- -----------------------------------------------------------------------------
-- 5. Force RLS for the app role on all tenant tables
-- -----------------------------------------------------------------------------

-- By default, the table owner bypasses RLS. We force RLS even for the owner
-- by setting row_security = true (always enforce).
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE leads FORCE ROW LEVEL SECURITY;
ALTER TABLE origins FORCE ROW LEVEL SECURITY;
ALTER TABLE tags FORCE ROW LEVEL SECURITY;
ALTER TABLE lost_reasons FORCE ROW LEVEL SECURITY;
ALTER TABLE sync_tags FORCE ROW LEVEL SECURITY;
ALTER TABLE stage_transition_log FORCE ROW LEVEL SECURITY;
ALTER TABLE action_tag_log FORCE ROW LEVEL SECURITY;
ALTER TABLE sync_log FORCE ROW LEVEL SECURITY;

-- Grant app role the ability to set session variables
GRANT SET ON PARAMETER app.current_org_id TO wolverine_app;

-- -----------------------------------------------------------------------------
-- 6. Organizations table — no RLS (it's the tenant root, not tenant-scoped)
--    Everyone can read organizations (needed for login/tenant lookup).
--    Only admins should write (enforced at application level).
-- -----------------------------------------------------------------------------

-- Allow public read on organizations for tenant lookup during auth
GRANT SELECT ON organizations TO wolverine_app;
-- Write operations on organizations are handled by Prisma superuser connection
-- or can be restricted here if needed (create/update org is admin-only in app)

-- -----------------------------------------------------------------------------
-- 7. Helper: Verify current tenant context (useful for debugging)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_current_org_id() RETURNS uuid AS $$
BEGIN
  RETURN current_setting('app.current_org_id', true)::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION get_current_org_id() TO wolverine_app;
