-- Read-only checks. Run on the same APP_DB database/account as the application.
SELECT current_database(), current_user, version();
SELECT table_name FROM information_schema.tables
WHERE table_schema='bridge_agent' AND table_name IN ('bm_monitor_inbox','bm_monitor_sample','bm_monitor_quarantine') ORDER BY table_name;
SELECT table_name,column_name,data_type,character_maximum_length,numeric_precision,numeric_scale,is_nullable
FROM information_schema.columns WHERE table_schema='bridge_agent'
AND table_name IN ('bm_monitor_inbox','bm_monitor_sample','bm_monitor_quarantine') ORDER BY table_name,ordinal_position;
SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='bridge_agent'
AND tablename IN ('bm_monitor_inbox','bm_monitor_sample','bm_monitor_quarantine') ORDER BY tablename,indexname;
SELECT 'bm_monitor_inbox' AS name,has_table_privilege(current_user,'bridge_agent.bm_monitor_inbox','SELECT,INSERT,UPDATE,DELETE') AS has_any_required_privilege;
-- Check each privilege independently; all must be true for the deployment role.
SELECT t.name,p.privilege,has_table_privilege(current_user,'bridge_agent.' || t.name,p.privilege) AS granted
FROM (VALUES ('bm_monitor_inbox'),('bm_monitor_sample'),('bm_monitor_quarantine')) AS t(name)
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) AS p(privilege);
-- No payloads or identifiers are read by these checks.
