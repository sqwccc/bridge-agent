-- 只读核验。先确认current_database为paishui_db，current_user为paishui。
SELECT current_database(), current_user, version();

-- 应出现4张表；旧flyway_schema_history不影响本次部署，无需删除。
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'bridge_agent'
  AND table_name IN ('bm_user','bm_structure_config','bm_structure_part','bm_structure_binding')
ORDER BY table_name;

-- 核对已有表字段和默认值。CREATE IF NOT EXISTS不会升级已有表。
SELECT table_name, column_name, data_type, character_maximum_length, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'bridge_agent'
  AND table_name IN ('bm_user','bm_structure_config','bm_structure_part','bm_structure_binding')
ORDER BY table_name, ordinal_position;

SELECT 'bm_user' AS table_name, count(*) AS row_count FROM bridge_agent.bm_user
UNION ALL SELECT 'bm_structure_config', count(*) FROM bridge_agent.bm_structure_config
UNION ALL SELECT 'bm_structure_part', count(*) FROM bridge_agent.bm_structure_part
UNION ALL SELECT 'bm_structure_binding', count(*) FROM bridge_agent.bm_structure_binding;
