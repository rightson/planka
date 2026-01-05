-- 回滾資料庫 - 移除 inline_image 表
-- 執行這個 SQL 腳本來還原資料庫變更

-- 1. 刪除 inline_image 表
DROP TABLE IF EXISTS inline_image CASCADE;

-- 2. 刪除相關的 uploaded_file 記錄 (如果有的話)
-- 注意: 只刪除類型為 ATTACHMENT 且被 inline_image 引用的檔案
DELETE FROM uploaded_file
WHERE id IN (
  SELECT uploaded_file_id
  FROM inline_image
) AND type = 'attachment';

-- 3. 清理可能的孤立記錄
-- 這一步是可選的，用於清理任何相關的垃圾數據

-- 完成！資料庫已回滾到安裝此功能之前的狀態
