-- ===================================================================
-- 手動清理 inline images 功能的資料庫變更
-- 使用前請先備份資料庫！
-- ===================================================================

-- 步驟 1: 檢查當前狀態
-- ===================================================================
\echo '=== 檢查 inline_image 表 ==='
SELECT COUNT(*) as inline_image_count FROM inline_image;

\echo '=== 檢查相關的 uploaded_file ==='
SELECT COUNT(*) as uploaded_file_count
FROM uploaded_file
WHERE type = 'attachment'
  AND mime_type LIKE 'image/%'
  AND created_at > NOW() - INTERVAL '24 hours';

\echo '=== 檢查被修改的卡片描述 ==='
SELECT
  COUNT(*) as affected_cards,
  SUM(LENGTH(description)) as total_desc_size
FROM card
WHERE description LIKE '%uploads/card-%';

-- 步驟 2: 開始清理事務（可以回滾）
-- ===================================================================
BEGIN;

-- 2.1 備份要刪除的資料到臨時表（以防萬一）
CREATE TEMP TABLE backup_inline_images AS
SELECT * FROM inline_image;

CREATE TEMP TABLE backup_affected_cards AS
SELECT id, description, updated_at
FROM card
WHERE description LIKE '%uploads/card-%';

\echo '=== 備份完成，開始清理 ==='

-- 2.2 刪除 inline_image 記錄
DELETE FROM inline_image;

-- 2.3 刪除相關的 uploaded_file 記錄
-- 注意：只刪除今天建立的且沒有被其他地方引用的
DELETE FROM uploaded_file
WHERE id IN (
  SELECT uploaded_file_id FROM backup_inline_images
)
AND references_total <= 1;

-- 2.4 清理卡片描述中的損壞圖片連結
-- 這會保留文字，只移除 ![](uploads/...) 格式的圖片
UPDATE card
SET description = regexp_replace(
  description,
  '!\[[^\]]*\]\(/?uploads/card-[^)]+\)',
  '',
  'g'
),
updated_at = NOW()
WHERE description LIKE '%uploads/card-%';

-- 步驟 3: 刪除 inline_image 表
-- ===================================================================
DROP TABLE IF EXISTS inline_image CASCADE;

-- 步驟 4: 檢查清理結果
-- ===================================================================
\echo '=== 清理完成，檢查結果 ==='

\echo '=== inline_image 表是否存在 ==='
SELECT tablename
FROM pg_tables
WHERE tablename = 'inline_image';

\echo '=== 被修改的卡片數量 ==='
SELECT COUNT(*) FROM backup_affected_cards;

\echo '=== 如果一切正常，執行 COMMIT; 提交變更 ==='
\echo '=== 如果有問題，執行 ROLLBACK; 回滾變更 ==='

-- 決定是否提交（取消下面其中一行的註解）
-- COMMIT;    -- 確認清理，無法撤銷
-- ROLLBACK;  -- 取消清理，回到原始狀態
