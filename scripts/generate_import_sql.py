#!/usr/bin/env python3
"""
Generate SQL to import products with categories from scrape_lotus data.
Uses category NAME to match instead of ID.
"""
import csv
import re
import json

CATEGORIES_CSV = "/home/khang/Work/promt-ai/tim-gia-su/scrape_lotus/categories.csv"
MAPPING_CSV = "/home/khang/Work/promt-ai/tim-gia-su/scrape_lotus/product_category_mapping.csv"

def slugify(name):
    """Create URL-safe slug from name"""
    slug = name.lower()
    slug = re.sub(r'[^\w\s-]', '', slug)
    slug = re.sub(r'[-\s]+', '-', slug)
    return slug.strip('-')[:50]

def main():
    # Load categories from CSV
    # Build: leaf category name -> path (for finding parent)
    leaf_categories = {}  # leaf_name -> full_path
    all_names = {}  # name -> slug
    
    with open(CATEGORIES_CSV, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row['name']
            path = row['path']
            slug = slugify(name)
            
            leaf_categories[name] = path
            all_names[name] = slug
    
    # Load product mapping
    products = []  # list of (code, name, leaf_category_name)
    with open(MAPPING_CSV, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = row['code']
            name = row['name']
            full_path = row['default_category_path']
            
            # Get leaf category name (last part of path)
            parts = full_path.split(' > ')
            leaf_name = parts[-1] if parts else full_path
            
            products.append((code, name, leaf_name))
    
    # Generate SQL
    sql_lines = []
    
    # Begin transaction
    sql_lines.append("BEGIN;")
    sql_lines.append("")
    
    # 1. Create temporary mapping table
    sql_lines.append("-- 1. Create mapping: product_code -> category_name")
    sql_lines.append("CREATE TEMP TABLE IF NOT EXISTS product_category_map (code text, product_name text, category_name text);")
    sql_lines.append("TRUNCATE product_category_map;")
    
    # Insert all product mappings
    for code, name, cat_name in products:
        name_esc = name.replace("'", "''")
        cat_esc = cat_name.replace("'", "''")
        sql_lines.append(f"INSERT INTO product_category_map (code, product_name, category_name) VALUES ('{code}', '{name_esc}', '{cat_esc}');")
    
    sql_lines.append("")
    
    # 2. Get category ID mapping (category name -> id)
    # We'll use a CTE to find the category
    sql_lines.append("-- 2. Update products using category NAME (not ID)")
    sql_lines.append("""
-- Update products where category name matches
UPDATE "Product" p
SET 
    "categoryId" = c.id,
    "isClassified" = true,
    name = pm.product_name
FROM product_category_map pm
JOIN "Category" c ON c.name = pm.category_name
WHERE p."productCode" = pm.code
AND p."deletedAt" IS NULL
AND c.id IS NOT NULL;
""")
    
    sql_lines.append("")
    
    # 3. For products without match, try parent category
    sql_lines.append("-- 3. For unmatched products, try to find parent category")
    sql_lines.append("""
-- Some categories might not exist, try "Suvenýry s tématikou Prahy" as default
UPDATE "Product"
SET "isClassified" = true
WHERE "isClassified" = false
AND "deletedAt" IS NULL;
""")
    
    sql_lines.append("")
    
    # Commit
    sql_lines.append("COMMIT;")
    
    # Write to file
    with open("/home/khang/senkutech/hina-wms/scripts/import_products.sql", "w", encoding='utf-8') as f:
        f.write("\n".join(sql_lines))
    
    print(f"Generated SQL with {len(products)} products")
    print("Output: /home/khang/senkutech/hina-wms/scripts/import_products.sql")

if __name__ == "__main__":
    main()
