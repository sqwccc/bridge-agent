-- 账号属于本系统；桥梁来源数据不进入业务库，不复用来源用户凭据。
CREATE TABLE bm_user (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username varchar(64) NOT NULL UNIQUE,
  password_hash varchar(100) NOT NULL,
  display_name varchar(100) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
