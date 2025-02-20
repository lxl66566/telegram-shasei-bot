CREATE TABLE
  IF NOT EXISTS ejaculations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    time TEXT NOT NULL, -- ISO8601 format: YYYY-MM-DDTHH:MM:SS.sssZ
    material TEXT -- 小菜内容，可以为 null
  );

-- 创建用户ID索引，用于快速查找特定用户的记录
CREATE INDEX IF NOT EXISTS idx_ejaculations_user_id ON ejaculations (user_id);

-- 创建时间索引，用于按时间顺序查询和统计
CREATE INDEX IF NOT EXISTS idx_ejaculations_time ON ejaculations (time);

-- 创建小菜索引，用于获取随机小菜
CREATE INDEX idx_ejaculations_material ON ejaculations (material);