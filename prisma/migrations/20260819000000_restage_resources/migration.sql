-- 资源分类重构：按学习进度重新划分适用阶段
-- 旧三段式（课前预习/课中跟课/期末复习/全部阶段）→ 新四格（平时学习/小测/期中/期末）
--   BEFORE（课前预习）→ COURSE（平时学习）
--   DURING（课中跟课）→ COURSE（平时学习）
--   ALL（全部阶段）   → COURSE（平时学习）
--   FINAL（期末复习）→ FINAL（期末）保持不变
--   NULL 保持不变
-- applicableStage 为 String 列，无需改列类型，仅数据回填。

UPDATE "Resource"
SET "applicableStage" = 'COURSE'
WHERE "applicableStage" IN ('BEFORE', 'DURING', 'ALL');
