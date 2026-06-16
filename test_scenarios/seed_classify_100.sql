-- ============================================================
-- TEST SCRIPT: Tạo category đa tầng + classify 100 sản phẩm
-- Theo cấu trúc web LotusSouvenir (https://ecom.neulon.io.vn/en)
-- ============================================================
-- Cấu trúc:
--   Suvenýry (root)
--   ├── Klíčenka
--   ├── Magnetky
--   ├── Nášivky
--   ├── Odznaky
--   ├── Hrnky a lahve
--   ├── Panáky
--   │   ├── Kovové
--   │   ├── S potiskem
--   │   └── Skleněné
--   ├── Zrcátka
--   ├── Pamětní mince
--   ├── Krteček
--   └── Čokoládové (Chocolate)
--
--   Oděv (root)
--   └── Čepice Praha
--
--   Ostatní (root)
--   └── Dřevěné dekorace

BEGIN;

-- 1. Tạo 3 ROOT CATEGORIES
INSERT INTO "Category" (id, name, slug, description, "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'Suvenýry', 'suvenyry', 'Quà lưu niệm Séc chính hãng', true, 1, NOW(), NOW()),
  (gen_random_uuid(), 'Oděv', 'odev', 'Quần áo và phụ kiện thời trang', true, 2, NOW(), NOW()),
  (gen_random_uuid(), 'Ostatní', 'ostatni', 'Sản phẩm khác', true, 3, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING
RETURNING id, name;

-- 2. Tạo SUB-CATEGORIES (id sẽ tự tạo bằng uuid mới)
DO $$
DECLARE
  v_suvenyry_id TEXT;
  v_odev_id TEXT;
  v_ostatni_id TEXT;
  v_panaky_id TEXT;
BEGIN
  -- Lấy id của root categories
  SELECT id INTO v_suvenyry_id FROM "Category" WHERE slug = 'suvenyry';
  SELECT id INTO v_odev_id FROM "Category" WHERE slug = 'odev';
  SELECT id INTO v_ostatni_id FROM "Category" WHERE slug = 'ostatni';

  -- Sub-categories của Suvenýry
  INSERT INTO "Category" (id, name, slug, "parentId", "isActive", "sortOrder", "createdAt", "updatedAt")
  VALUES
    (gen_random_uuid(), 'Klíčenka', 'klicenka', v_suvenyry_id, true, 1, NOW(), NOW()),
    (gen_random_uuid(), 'Magnetky', 'magnetky', v_suvenyry_id, true, 2, NOW(), NOW()),
    (gen_random_uuid(), 'Nášivky', 'nasivky', v_suvenyry_id, true, 3, NOW(), NOW()),
    (gen_random_uuid(), 'Odznaky', 'odznaky', v_suvenyry_id, true, 4, NOW(), NOW()),
    (gen_random_uuid(), 'Hrnky a lahve', 'hrnky-lahve', v_suvenyry_id, true, 5, NOW(), NOW()),
    (gen_random_uuid(), 'Panáky', 'panaky', v_suvenyry_id, true, 6, NOW(), NOW()),
    (gen_random_uuid(), 'Zrcátka', 'zrcatka', v_suvenyry_id, true, 7, NOW(), NOW()),
    (gen_random_uuid(), 'Pamětní mince', 'pamatci-mince', v_suvenyry_id, true, 8, NOW(), NOW()),
    (gen_random_uuid(), 'Krteček', 'krtecek', v_suvenyry_id, true, 9, NOW(), NOW()),
    (gen_random_uuid(), 'Čokoládové', 'cokoladove', v_suvenyry_id, true, 10, NOW(), NOW());

  -- Sub-categories của Panáky (3 cấp sâu)
  SELECT id INTO v_panaky_id FROM "Category" WHERE slug = 'panaky';
  INSERT INTO "Category" (id, name, slug, "parentId", "isActive", "sortOrder", "createdAt", "updatedAt")
  VALUES
    (gen_random_uuid(), 'Panáky kovové', 'panaky-kovove', v_panaky_id, true, 1, NOW(), NOW()),
    (gen_random_uuid(), 'Panáky s potiskem', 'panaky-s-potiskem', v_panaky_id, true, 2, NOW(), NOW()),
    (gen_random_uuid(), 'Panáky skleněné', 'panaky-sklenene', v_panaky_id, true, 3, NOW(), NOW());

  -- Sub-categories của Oděv
  INSERT INTO "Category" (id, name, slug, "parentId", "isActive", "sortOrder", "createdAt", "updatedAt")
  VALUES
    (gen_random_uuid(), 'Čepice Praha', 'cepice-praha', v_odev_id, true, 1, NOW(), NOW()),
    (gen_random_uuid(), 'Trička', 'tricka', v_odev_id, true, 2, NOW(), NOW());

  -- Sub-categories của Ostatní
  INSERT INTO "Category" (id, name, slug, "parentId", "isActive", "sortOrder", "createdAt", "updatedAt")
  VALUES
    (gen_random_uuid(), 'Dřevěné dekorace', 'drevene-dekorace', v_ostatni_id, true, 1, NOW(), NOW()),
    (gen_random_uuid(), 'Keramika', 'keramika', v_ostatni_id, true, 2, NOW(), NOW());
END $$;

-- 3. CLASSIFY 100 sản phẩm mẫu (mapping dựa trên keyword tên)
WITH mapping AS (
  SELECT id,
    CASE
      WHEN name ILIKE '%Klíčenka%' OR name ILIKE '%přívěsek%' THEN 'klicenka'
      WHEN name ILIKE '%Magnetka%' OR name ILIKE '%magnet%' THEN 'magnetky'
      WHEN name ILIKE '%Nášivka%' OR name ILIKE '%patch%' THEN 'nasivky'
      WHEN name ILIKE '%Odznak%' OR name ILIKE '%badge%' THEN 'odznaky'
      WHEN name ILIKE '%Hrnk%' OR name ILIKE '%lahve%' OR name ILIKE '%mug%' THEN 'hrnky-lahve'
      WHEN name ILIKE '%Kovový panák%' OR name ILIKE '%Kovová panák%' OR name ILIKE '%Kov. panák%' THEN 'panaky-kovove'
      WHEN name ILIKE '%Panák s potiskem%' OR name ILIKE '%panák potisk%' THEN 'panaky-s-potiskem'
      WHEN name ILIKE '%Skleněný panák%' OR name ILIKE '%skleněná panák%' THEN 'panaky-sklenene'
      WHEN name ILIKE '%Panák%' AND name ILIKE '%kov%' THEN 'panaky-kovove'
      WHEN name ILIKE '%Panák%' AND name ILIKE '%sklo%' THEN 'panaky-sklenene'
      WHEN name ILIKE '%Panák%' THEN 'panaky'
      WHEN name ILIKE '%Zrcátk%' OR name ILIKE '%mirror%' THEN 'zrcatka'
      WHEN name ILIKE '%Mince%' OR name ILIKE '%coin%' THEN 'pamatci-mince'
      WHEN name ILIKE '%Krteček%' OR name ILIKE '%Krtečk%' THEN 'krtecek'
      WHEN name ILIKE '%Puzzle%' OR name ILIKE '%čokolád%' OR name ILIKE '%chocolate%' THEN 'cokoladove'
      WHEN name ILIKE '%Čepice%' OR name ILIKE '%cap%' THEN 'cepice-praha'
      WHEN name ILIKE '%Tričk%' OR name ILIKE '%T-Shirt%' OR name ILIKE '%t-shirt%' THEN 'tricka'
      WHEN name ILIKE '%dřev%' OR name ILIKE '%wood%' THEN 'drevene-dekorace'
      WHEN name ILIKE '%keramick%' OR name ILIKE '%ceramic%' OR name ILIKE '%porcelain%' THEN 'keramika'
      ELSE NULL
    END AS target_slug
  FROM "Product"
  WHERE "deletedAt" IS NULL
),
-- Lấy 100 SP đầu tiên match (chia đều categories)
selected AS (
  SELECT id, target_slug, ROW_NUMBER() OVER (PARTITION BY target_slug ORDER BY id) AS rn
  FROM mapping
  WHERE target_slug IS NOT NULL
),
-- Mỗi category lấy tối đa ~12 SP, tổng 100
top100 AS (
  SELECT id, target_slug
  FROM selected
  WHERE rn <= 12
  ORDER BY target_slug, id
  LIMIT 100
)
UPDATE "Product" p
SET
  "categoryId" = c.id,
  "isClassified" = true
FROM top100 t
JOIN "Category" c ON c.slug = t.target_slug
WHERE p.id = t.id;

-- 4. Verify
SELECT
  (SELECT count(*) FROM "Category") AS total_categories,
  (SELECT count(*) FROM "Product" WHERE "isClassified" = true) AS classified,
  (SELECT count(*) FROM "Product" WHERE "isClassified" = false) AS unclassified;

COMMIT;
