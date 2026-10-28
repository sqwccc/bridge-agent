-- Owned by the application. Never write structure configuration into source tables.
CREATE TABLE bm_structure_config (
  bridge_id varchar(255) PRIMARY KEY,
  version bigint NOT NULL CHECK (version >= 0),
  shape varchar(32) NOT NULL,
  updated_by varchar(64) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE bm_structure_part (
  bridge_id varchar(255) NOT NULL REFERENCES bm_structure_config(bridge_id) ON DELETE CASCADE,
  id varchar(36) NOT NULL,
  zone varchar(16) NOT NULL CHECK (zone IN ('上部结构','下部结构','桥面系')),
  name varchar(80) NOT NULL,
  description varchar(1000) NOT NULL DEFAULT '',
  anchor varchar(120),
  ordinal integer NOT NULL,
  PRIMARY KEY (bridge_id,id),
  UNIQUE (bridge_id,zone,name)
);
CREATE TABLE bm_structure_binding (
  bridge_id varchar(255) NOT NULL,
  part_id varchar(36) NOT NULL,
  ordinal integer NOT NULL,
  point_id text NOT NULL,
  device_id text NOT NULL,
  metric text,
  PRIMARY KEY (bridge_id,part_id,ordinal),
  FOREIGN KEY (bridge_id,part_id) REFERENCES bm_structure_part(bridge_id,id) ON DELETE CASCADE
);
