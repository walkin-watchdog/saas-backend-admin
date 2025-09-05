-- Row-Level Security for multi-tenant isolation (fresh DB)
-- 
-- Assumes all tables already exist from Prisma's init migration and already
-- include tenantId (except "tenants", which uses "id").
-- No ADD COLUMN / RENAME / DROP INDEX here—safe for fresh databases.

-- Optional helper: treat sessions with app.role='admin' as superuser for RLS
CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT current_setting('app.role', true) = 'admin';
$$;

-- Enable RLS on all tenant-scoped tables
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "itineraries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "itinerary_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "packages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "package_slots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "slot_adult_tiers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "slot_child_tiers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductAvailabilitySubrange" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coupons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coupon_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "newsletters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "abandoned_carts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "blocked_dates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "destinations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attractions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "experience_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeamMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "partners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "home" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "logo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "slides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FAQ" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JobPosting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "itinerary_proposals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "itinerary_proposal_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "proposal_shares" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refresh_token_blacklist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentMethod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UsageRecord"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plans"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "global_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_domains"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscribers"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_notes"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coupon_redemptions"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coupon_entitlements"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "impersonation_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "offboarding_jobs"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "kyc_records"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs"           ENABLE ROW LEVEL SECURITY;

-- RLS: one policy per table (covers SELECT/INSERT/UPDATE/DELETE)
CREATE POLICY tenant_isolation_users ON "users"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_products ON "products"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_itineraries ON "itineraries"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_itinerary_activities ON "itinerary_activities"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_packages ON "packages"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_package_slots ON "package_slots"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_slot_adult_tiers ON "slot_adult_tiers"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_slot_child_tiers ON "slot_child_tiers"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_bookings ON "bookings"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_availability_subrange ON "ProductAvailabilitySubrange"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_payments ON "payments"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_reviews ON "reviews"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_coupons ON "coupons"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_coupon_usage ON "coupon_usage"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_trip_requests ON "trip_requests"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_newsletters ON "newsletters"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_abandoned_carts ON "abandoned_carts"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_blocked_dates ON "blocked_dates"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_destinations ON "destinations"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_attractions ON "attractions"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_experience_categories ON "experience_categories"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_team_members ON "TeamMember"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_partners ON "partners"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_home ON "home"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_logo ON "logo"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_slides ON "slides"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_faq ON "FAQ"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_job_postings ON "JobPosting"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_itinerary_proposals ON "itinerary_proposals"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_itinerary_proposal_revisions ON "itinerary_proposal_revisions"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_proposal_shares ON "proposal_shares"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_refresh_token_blacklist ON "refresh_token_blacklist"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_idempotency_keys ON "idempotency_keys"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_tenant_configs ON "tenant_configs"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_subscription ON "Subscription"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_invoice ON "Invoice"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_payment_method ON "PaymentMethod"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_usage_record ON "UsageRecord"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_subscribers ON "subscribers"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_orders ON "orders"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_credit_notes ON "credit_notes"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_coupon_redemptions ON "coupon_redemptions"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_coupon_entitlements ON "coupon_entitlements"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_impersonation_grants ON "impersonation_grants"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_offboarding_jobs ON "offboarding_jobs"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_kyc_records ON "kyc_records"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_audit_logs ON "audit_logs"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

CREATE POLICY tenant_isolation_tenant_domains ON "tenant_domains"
  USING (is_admin() OR "tenantId" = current_setting('app.tenantId', true))
  WITH CHECK (is_admin() OR "tenantId" = current_setting('app.tenantId', true));

-- Bootstrap lookup: allow SELECT by exact host before app.tenantId is set.
-- The application must set this once per request/txn:
--   SELECT set_config('app.host', :incoming_host, true);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class  c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema()
      AND c.relname  = 'tenant_domains'
      AND p.polname  = 'tenant_domains_lookup_by_host'
  ) THEN
    CREATE POLICY tenant_domains_lookup_by_host ON "tenant_domains"
      FOR SELECT
      USING (
        is_admin()
        OR domain = current_setting('app.host', true)
      );
  END IF;
END$$;

DO $$
BEGIN
  -- Check via pg_policy (has polname) joined to class/namespace for the current schema
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class  c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema()
      AND c.relname  = 'webhook_events'
      AND p.polname  = 'webhook_event_read_any'
  ) THEN
    CREATE POLICY webhook_event_read_any ON "webhook_events"
      FOR SELECT
      USING (true);
  END IF;
END$$;


DO $$
BEGIN
  -- write_any
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class  c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema()
      AND c.relname  = 'webhook_events'
      AND p.polname  = 'webhook_event_write_any'
  ) THEN
    CREATE POLICY webhook_event_write_any ON "webhook_events"
      FOR INSERT
      WITH CHECK (true);
  END IF;
  -- update_any
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class  c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema()
      AND c.relname  = 'webhook_events'
      AND p.polname  = 'webhook_event_update_any'
  ) THEN
    CREATE POLICY webhook_event_update_any ON "webhook_events"
      FOR UPDATE
      USING (true)
      WITH CHECK (true);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema()
      AND c.relname = 'plans'
      AND p.polname = 'plan_read_all'
  ) THEN
    CREATE POLICY plan_read_all ON "plans"
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema()
      AND c.relname = 'plans'
      AND p.polname = 'plan_write_admin'
  ) THEN
    CREATE POLICY plan_write_admin ON "plans"
      FOR ALL
      USING (is_admin())
      WITH CHECK (is_admin());
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema()
      AND c.relname = 'global_configs'
      AND p.polname = 'global_config_read_app'
  ) THEN
    CREATE POLICY global_config_read_app ON "global_configs"
      FOR SELECT
      USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema()
      AND c.relname = 'global_configs'
      AND p.polname = 'global_config_write_admin'
  ) THEN
    CREATE POLICY global_config_write_admin ON "global_configs"
      FOR ALL
      USING (is_admin())
      WITH CHECK (is_admin());
  END IF;
END$$;