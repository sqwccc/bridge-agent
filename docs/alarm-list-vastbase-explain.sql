EXPLAIN (VERBOSE, COSTS OFF)
WITH bridge_latest AS (
        SELECT r.*,row_number() OVER (PARTITION BY qlid ORDER BY sjtbsj DESC NULLS LAST,
        xgsj DESC NULLS LAST,sczt DESC NULLS LAST,to_jsonb(r)::text DESC) AS source_rank
        FROM qiaoliang.dwd_ql_js_ql_inc r
        WHERE nullif(trim(qlid),'') IS NOT NULL
        ), bridge_candidates AS (
        SELECT * FROM bridge_latest WHERE source_rank=1 AND (sczt=0 OR sczt IS NULL) AND sscsdm LIKE '32%'
        ), point_latest AS (
        SELECT DISTINCT ON(sscsdm,bsm) * FROM qiaoliang.dwd_ql_jc_jcd_inc r
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
        SELECT DISTINCT ON(sscsdm,bsm) * FROM qiaoliang.dwd_ql_jc_jcsb_inc r
        WHERE nullif(trim(bsm),'') IS NOT NULL
        ORDER BY sscsdm,bsm,sjtbsj DESC NULLS LAST,(sjtbzt='D') DESC NULLS LAST,cjsj DESC NULLS LAST,to_jsonb(r)::text
        DESC
        ), device_source AS (
        SELECT * FROM device_latest WHERE coalesce(sjtbzt,'')!='D'
        ), device_bridges AS MATERIALIZED (
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
        alarm_latest AS (SELECT DISTINCT ON(sscsdm,bsm) * FROM qiaoliang.dwd_ql_jc_jcbj_data r ORDER BY sscsdm,bsm,tbsj DESC NULLS
        LAST,extract_time DESC NULLS LAST,(sjtbzt='D') DESC NULLS LAST,to_jsonb(r)::text DESC),
        alarm_source AS (SELECT * FROM alarm_latest WHERE coalesce(sjtbzt,'')!='D'),
        filtered AS (SELECT a.*,b.qlid AS bridge_id,b.qlmc AS bridge_name FROM alarm_source a
        JOIN point_bridge p ON p.bsm=a.dwbsm AND p.sscsdm=a.sscsdm JOIN bridge_base b ON b.qlid=p.bridge_id
        )
        SELECT a.bsm AS id,a.bridge_id,a.bridge_name,a.sscsdm AS city_code,a.bjsj AS time,a.bjmc AS name,
        a.jcbjzb AS metric,a.bjjb AS level,a.bjz AS value,a.bjyz AS threshold,h.czzt::text AS handling_status,h.wcczsj
        AS handled_at,count(*) OVER() AS matching_total
        FROM filtered a LEFT JOIN (
        SELECT h.bjbh,left(h.xzqhdm,4) AS city_prefix,h.czzt,h.wcczsj,
        row_number() OVER (PARTITION BY h.bjbh,left(h.xzqhdm,4)
        ORDER BY h.gxsj DESC NULLS LAST,h.bsm) AS handling_rank
        FROM qiaoliang.dwd_ql_jc_bjcz_data h WHERE coalesce(h.sjtbzt,'')!='D'
        ) h ON h.bjbh=a.bjbh AND h.city_prefix=left(a.sscsdm,4) AND h.handling_rank=1
         WHERE a.bjsj IS NOT NULL 
        ORDER BY a.bjsj DESC,a.bsm,a.sscsdm LIMIT 50 OFFSET 0;
