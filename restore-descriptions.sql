-- 如果需要還原被修改的卡片描述
-- 這個腳本會找出包含 uploads/ 路徑的描述並顯示它們

-- 1. 查看哪些卡片的描述可能被修改了
SELECT
  id,
  name,
  description,
  updated_at
FROM card
WHERE description LIKE '%uploads/card-%'
ORDER BY updated_at DESC;

-- 2. 如果您有備份，可以從備份還原特定卡片:
-- UPDATE card
-- SET description = '<從備份複製的原始描述>'
-- WHERE id = '<card_id>';

-- 3. 或者手動移除損壞的圖片連結 (保留文字):
-- UPDATE card
-- SET description = regexp_replace(description, '!\[[^\]]*\]\(uploads/[^)]+\)', '', 'g')
-- WHERE description LIKE '%uploads/card-%';
