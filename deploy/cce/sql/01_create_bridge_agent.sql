-- 在 paishui_db 数据库中，以 paishui 账号执行整个脚本。
-- 仅建立 bridge_agent schema 和本应用4张表，不导入桥梁来源数据、不创建登录账号。
-- 已存在的同名表会保留；本脚本不自动修复已有表结构。出现错误立即停止并ROLLBACK。
-- bm_user使用bigserial，避免旧数据库对GENERATED ALWAYS AS IDENTITY的兼容问题。
BEGIN;

CREATE SCHEMA IF NOT EXISTS bridge_agent;

CREATE TABLE IF NOT EXISTS bridge_agent.bm_user (
  id bigserial PRIMARY KEY,
  username varchar(64) NOT NULL UNIQUE,
  password_hash varchar(100) NOT NULL,
  display_name varchar(100) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bridge_agent.bm_structure_config (
  bridge_id varchar(255) PRIMARY KEY,
  version bigint NOT NULL CHECK (version >= 0),
  shape varchar(32) NOT NULL,
  updated_by varchar(64) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bridge_agent.bm_structure_part (
  bridge_id varchar(255) NOT NULL REFERENCES bridge_agent.bm_structure_config(bridge_id) ON DELETE CASCADE,
  id varchar(36) NOT NULL,
  zone varchar(16) NOT NULL CHECK (zone IN ('上部结构','下部结构','桥面系')),
  name varchar(80) NOT NULL,
  description varchar(1000) NOT NULL DEFAULT '',
  anchor varchar(120),
  ordinal integer NOT NULL,
  PRIMARY KEY (bridge_id,id),
  UNIQUE (bridge_id,zone,name)
);

CREATE TABLE IF NOT EXISTS bridge_agent.bm_structure_binding (
  bridge_id varchar(255) NOT NULL,
  part_id varchar(36) NOT NULL,
  ordinal integer NOT NULL,
  point_id text NOT NULL,
  device_id text NOT NULL,
  metric text,
  PRIMARY KEY (bridge_id,part_id,ordinal),
  FOREIGN KEY (bridge_id,part_id) REFERENCES bridge_agent.bm_structure_part(bridge_id,id) ON DELETE CASCADE
);

COMMIT;
