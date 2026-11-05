-- 巡查：AgentMapper.focusSnapshot，kind=patrols
-- 目标：应用实际 SOURCE_DB，记录为 qiaoliang_db / qiaoliang，使用与应用相同账号。
-- 无页面筛选、无业务日期筛选；维度 total/resultProvided；最新示例3条。
-- 日志只记录133座桥，未记录编号/页面筛选。本脚本不声称精确重放那133座桥。
-- bridge_id IN 子查询代替应用传入的编号常量；范围取当前全部有效接入桥梁，执行计划可能不同。
-- 只读；事务内设置schema与30秒超时，不改表。错误后执行ROLLBACK，再开始下一次验证。
BEGIN READ ONLY;
SET LOCAL search_path TO qiaoliang;
SET LOCAL statement_timeout = '30s';
-- EXPLAIN 不实际执行；不要将计划生成成功当作查询成功。
EXPLAIN
WITH bridge_latest AS (
        SELECT r.*,row_number() OVER (PARTITION BY qlid ORDER BY sjtbsj DESC NULLS LAST,
        xgsj DESC NULLS LAST,sczt DESC NULLS LAST,to_jsonb(r)::text DESC) AS source_rank
        FROM dwd_ql_js_ql_inc r
        WHERE nullif(trim(qlid),'') IS NOT NULL
        ), bridge_candidates AS (
        SELECT * FROM bridge_latest WHERE source_rank=1 AND (sczt=0 OR sczt IS NULL) AND sscsdm LIKE '32%'
        ), point_latest AS (
        SELECT DISTINCT ON(sscsdm,bsm) * FROM dwd_ql_jc_jcd_inc r
        WHERE nullif(trim(bsm),'') IS NOT NULL
        ORDER BY sscsdm,bsm,sjtbsj DESC NULLS LAST,(sjtbzt='D') DESC NULLS LAST,to_jsonb(r)::text DESC
        ), point_source AS (
        SELECT * FROM point_latest WHERE coalesce(sjtbzt,'')!='D' AND (jclx=70 OR jclx IS NULL)
        ), bridge_keys AS (
        SELECT sscsdm,qlid AS bridge_key,qlid AS bridge_id FROM bridge_candidates
        UNION
        SELECT sscsdm,qlbh AS bridge_key,qlid AS bridge_id FROM bridge_candidates WHERE nullif(trim(qlbh),'') IS NOT NULL
        ), point_candidates AS (
        SELECT p.*,k.bridge_id,count(*) OVER (PARTITION BY p.sscsdm,p.bsm) AS matches
        FROM point_source p JOIN bridge_keys k
        ON ARRAY[k.sscsdm,k.bridge_key]::text[]=ARRAY[p.sscsdm,p.ssbm]::text[]
        ), point_bridge AS (
        SELECT * FROM point_candidates WHERE matches=1
        ), device_latest AS (
        SELECT DISTINCT ON(sscsdm,bsm) * FROM dwd_ql_jc_jcsb_inc r
        WHERE nullif(trim(bsm),'') IS NOT NULL
        ORDER BY sscsdm,bsm,sjtbsj DESC NULLS LAST,(sjtbzt='D') DESC NULLS LAST,cjsj DESC NULLS LAST,to_jsonb(r)::text
        DESC
        ), device_source AS (
        SELECT * FROM device_latest WHERE coalesce(sjtbzt,'')!='D'
        ), device_bridges AS (
        SELECT DISTINCT p.bridge_id FROM point_bridge p JOIN device_source d
        ON ARRAY[d.sscsdm,d.dwbsm]::text[]=ARRAY[p.sscsdm,p.bsm]::text[]
        ), bridge_active AS (
        SELECT b.* FROM bridge_candidates b JOIN device_bridges d ON d.bridge_id=b.qlid
        ), bridge_base AS (
        SELECT b.*,d.bridge_id IS NOT NULL AS has_monitoring_devices,
        CASE WHEN b.yhlb=1 THEN 'I' WHEN b.yhlb BETWEEN 2 AND 5 THEN 'II_V' ELSE 'unknown' END AS assessment_category,
        CASE WHEN nullif(trim(b.qlwhzk),'') IS NULL THEN 'missing'
        WHEN trim(b.qlwhzk) NOT IN('1','2','3','4','5','6','7') THEN 'invalid'
        WHEN b.yhlb IS NULL OR b.yhlb NOT BETWEEN 1 AND 5 THEN 'unclassified'
        WHEN (b.yhlb=1 AND trim(b.qlwhzk) IN('3','4','5','6','7'))
          OR (b.yhlb BETWEEN 2 AND 5 AND trim(b.qlwhzk) IN('1','2')) THEN 'conflict'
        ELSE trim(b.qlwhzk) END AS condition_grade_bucket,
        CASE WHEN nullif(trim(b.qljgzk),'') IS NULL THEN 'missing'
        WHEN trim(b.qljgzk) NOT IN('1','2','3','4','5','6','7') THEN 'invalid'
        WHEN b.yhlb IS NULL OR b.yhlb NOT BETWEEN 1 AND 5 THEN 'unclassified'
        WHEN (b.yhlb=1 AND trim(b.qljgzk) IN('3','4','5','6','7'))
          OR (b.yhlb BETWEEN 2 AND 5 AND trim(b.qljgzk) IN('1','2')) THEN 'conflict'
        ELSE trim(b.qljgzk) END AS structure_grade_bucket,
        CASE WHEN b.jkjclx IS NULL AND d.bridge_id IS NOT NULL THEN 2 ELSE b.jkjclx END AS effective_monitoring_type
        FROM bridge_active b LEFT JOIN device_bridges d ON d.bridge_id=b.qlid
        )
     ,
        unique_keys AS (
        SELECT sscsdm,bridge_key,min(bridge_id) AS bridge_id FROM bridge_keys GROUP BY 1,2 HAVING count(*)=1
        ), target_keys AS (
        SELECT * FROM unique_keys WHERE
                 bridge_id IN  (  SELECT qlid FROM bridge_base )
        AND EXISTS(SELECT 1 FROM bridge_active b WHERE b.qlid=unique_keys.bridge_id)
        ), candidate_keys AS (
        SELECT DISTINCT r.sscsdm,r.bsm FROM
         dwd_ql_xjjl_inc
        r JOIN target_keys k
        ON ARRAY[k.sscsdm,k.bridge_key]::text[]=ARRAY[r.sscsdm,r.
         xjdx
     ]::text[]
        WHERE nullif(trim(r.bsm),'') IS NOT NULL
        ), candidate_versions AS (
        SELECT r.* FROM
         dwd_ql_xjjl_inc
        r JOIN candidate_keys c
        ON c.sscsdm=r.sscsdm AND c.bsm=r.bsm
        ), source_latest AS (
        SELECT DISTINCT ON(r.sscsdm,r.bsm) r.* FROM candidate_versions r
        ORDER BY r.sscsdm,r.bsm,r.tbsj DESC NULLS LAST,(r.sjtbzt='D') DESC NULLS LAST,
         to_jsonb(r)::text DESC
        ), records AS (
        SELECT r.bsm AS id,'patrols'::text AS kind,r.sscsdm AS city_code,k.bridge_id,b.qlmc AS bridge_name,
        r.
         xjdx
        AS source_bridge_key,r.tbsj AS source_updated_at,r.sjtbzt AS sync_status,r.bz AS note,
                r.jcrq AS occurred_at,r.rcxcbsm AS task_id,NULL::text AS code,r.jcdy AS unit,r.jcxm AS item_text,r.jcff
                AS method,
                r.jcnr AS content,r.jcjg AS result,r.czyh AS hazard,NULL::integer AS zone,NULL::integer AS item,
                NULL::integer AS damage_type,NULL::integer AS origin,NULL::integer AS severity,NULL::integer AS status,
                NULL::text AS description,NULL::text AS quantity,NULL::text AS location,NULL::integer AS
                maintenance_type,
                NULL::date AS rectified_date,r.fj AS attachment_raw
        FROM source_latest r JOIN target_keys k
        ON ARRAY[k.sscsdm,k.bridge_key]::text[]=ARRAY[r.sscsdm,r.
         xjdx
     ]::text[]
        JOIN bridge_active b ON b.qlid=k.bridge_id WHERE coalesce(r.sjtbzt,'')!='D'
        )
     ,
        matched AS (SELECT * FROM records r
     ),
        summary_rows AS (
        SELECT 'total' AS dimension,'all' AS code,count(*) AS count,min(occurred_at)::text AS first_date,
            max(occurred_at)::text AS last_date,max(source_updated_at)::text AS latest_sync FROM matched
            UNION ALL
            SELECT 'resultProvided', CASE WHEN nullif(trim(r.result),'') IS NULL THEN 'no' ELSE 'yes' END,count(*),NULL,NULL,NULL FROM matched r GROUP BY CASE WHEN nullif(trim(r.result),'') IS NULL THEN 'no' ELSE 'yes' END
        ORDER BY dimension,code
     ),
        example_rows AS (SELECT * FROM matched r ORDER BY r.occurred_at DESC NULLS LAST,r.id LIMIT 3),
        candidate_rows AS (
            SELECT * FROM matched r
            WHERE  FALSE
            ORDER BY CASE WHEN r.severity IN (4,5) AND (r.status IS NULL OR r.status NOT IN (4,5)) THEN 0
                WHEN r.status IN (1,2,3) THEN 1 WHEN r.status IS NULL THEN 2 ELSE 3 END,
                r.occurred_at DESC NULLS LAST,r.id LIMIT 5
        )
        SELECT coalesce((SELECT json_agg(s ORDER BY dimension,code) FROM summary_rows s),'[]'::json)::text AS summary,
            coalesce((SELECT json_agg(e ORDER BY e.occurred_at DESC NULLS LAST,e.id) FROM example_rows e),'[]'::json)::text AS examples,
            coalesce((SELECT json_agg(c ORDER BY
                CASE WHEN c.severity IN (4,5) AND (c.status IS NULL OR c.status NOT IN (4,5)) THEN 0
                    WHEN c.status IN (1,2,3) THEN 1 WHEN c.status IS NULL THEN 2 ELSE 3 END,
                c.occurred_at DESC NULLS LAST,c.id) FROM candidate_rows c),'[]'::json)::text AS candidates;
ROLLBACK;
