-- Execute on APP_DB only after verifying database/version/schema and backup policy.
BEGIN;
CREATE SCHEMA IF NOT EXISTS bridge_agent;
CREATE TABLE IF NOT EXISTS bridge_agent.bm_monitor_inbox (
 topic varchar(249) NOT NULL, partition_id integer NOT NULL, offset_id bigint NOT NULL,
 message_key text, payload text, status varchar(24) NOT NULL,
 city varchar(32), bridge_id varchar(64), received_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(topic,partition_id,offset_id)
);
CREATE TABLE IF NOT EXISTS bridge_agent.bm_monitor_quarantine (
 topic varchar(249) NOT NULL, partition_id integer NOT NULL, offset_id bigint NOT NULL,
 reason varchar(64) NOT NULL, PRIMARY KEY(topic,partition_id,offset_id),
 FOREIGN KEY(topic,partition_id,offset_id) REFERENCES bridge_agent.bm_monitor_inbox(topic,partition_id,offset_id)
);
CREATE TABLE IF NOT EXISTS bridge_agent.bm_monitor_sample (
 city varchar(32) NOT NULL, bsm varchar(64) NOT NULL, bridge_id varchar(64),
 dwbsm varchar(64), sbbsm varchar(64), jczb varchar(32), jcz numeric(18,6),
 jccjsj timestamp, jcsbsj timestamp, bz varchar(255), sbzt integer,
 yskzjbz varchar(64), sjtbzt varchar(16), tbsj timestamp, content text,
 topic varchar(249), partition_id integer, offset_id bigint,
 received_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(city,bsm)
);
CREATE INDEX IF NOT EXISTS bm_monitor_sample_channel_time ON bridge_agent.bm_monitor_sample(city,dwbsm,sbbsm,jczb,jccjsj);
CREATE INDEX IF NOT EXISTS bm_monitor_inbox_status ON bridge_agent.bm_monitor_inbox(status,received_at);
COMMIT;
