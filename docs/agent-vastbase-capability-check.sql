-- 在生产来源库同账号逐条执行；仅常量 SELECT，不读写业务表。
-- 任意一条失败时保存 SQLState / 错误位置，继续单独检查其他条目。
-- 成功不等于完整业务查询及 JDBC 映射通过。

-- 1. 普通 CTE、窗口函数、空时间排序；应返回 id=2。
WITH versions AS (
 SELECT *,row_number() OVER (PARTITION BY city,id ORDER BY updated_at DESC NULLS LAST) AS rn
 FROM (VALUES ('3201',2,NULL::timestamp),('3201',2,'2026-11-03'::timestamp)) v(city,id,updated_at)
)
SELECT * FROM versions WHERE rn=1;

-- 2. 仍用于最新记录选择的 DISTINCT ON / JSON 确定性排序。
SELECT DISTINCT ON (city,id) city,id,to_jsonb(v)::text AS tie_break
FROM (VALUES ('3201',2,1),('3201',2,2)) v(city,id,revision)
ORDER BY city,id,revision DESC NULLS LAST,to_jsonb(v)::text DESC;

-- 3. focusSnapshot 的记录 JSON 聚合和空数组回退。
WITH records AS (SELECT 1 AS id,'2026-11-03'::timestamp AS occurred_at)
SELECT coalesce((SELECT json_agg(r ORDER BY occurred_at DESC NULLS LAST,id) FROM records r),'[]'::json)::text AS populated,
       coalesce((SELECT json_agg(r ORDER BY id) FROM records r WHERE FALSE),'[]'::json)::text AS empty_rows;

-- 4. NULL 指标与 NULL 复合键匹配；两列预期均为 true。
SELECT NULL::text IS NOT DISTINCT FROM NULL::text AS null_metric,
       ARRAY['3201',NULL]::text[]=ARRAY['3201',NULL]::text[] AS null_key;

-- 5. 通道多列去重保留 NULL；预期 2。
SELECT count(*) FROM (
 SELECT DISTINCT city,point,device,metric
 FROM (VALUES ('3201','p','d',NULL::text),('3201','p','d',NULL::text),('3202','p','d',NULL::text)) v(city,point,device,metric)
) channel_keys;

-- 6. 日期区间和月份分组。
SELECT '2026-11-03'::date + INTERVAL '1 day' AS exclusive_end,
       to_char('2026-11-03'::timestamp,'YYYY-MM') AS month;
