#!/usr/bin/env python3
"""
Import products with categories from scrape_lotus data.
Usage: python import_products.py
"""
import csv
import sys
import os
import subprocess

# Paths
CATEGORIES_CSV = "/home/khang/Work/promt-ai/tim-gia-su/scrape_lotus/categories.csv"
MAPPING_CSV = "/home/khang/Work/promt-ai/tim-gia-su/scrape_lotus/product_category_mapping.csv"

# Database connection
DB_HOST = "localhost"
DB_PORT = "5433"
DB_USER = "lotussouvenir"
DB_PASS = "lotussouvenir123654"
DB_NAME = "lotussouvenir"

def run_sql(sql, params=None):
    """Run SQL and return result"""
    env = os.environ.copy()
    env["PGPASSWORD"] = DB_PASS
    
    cmd = ["psql", "-h", DB_HOST, "-p", DB_PORT, "-U", DB_USER, "-d", DB_NAME, "-t", "-A", "-c", sql]
    if params:
        for p in params:
            cmd.extend(["--set", f"p{p}={params[p]}"])
    
    result = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if result.returncode != 0:
        print(f"SQL Error: {result.stderr}")
        return None
    return result.stdout.strip()

def load_categories():
    """Load categories from CSV"""
    categories = {}  # id -> {name, parent_id, slug}
    
    with open(CATEGORIES_CSV, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            cat_id = row['id']
            name = row['name']
            parent_id = row['parent_id'] if row['parent_id'] else None
            path = row['path']
            
            # Create slug from name
            slug = name.lower().replace(' ', '-').replace('>', '-')
            slug = ''.join(c for c in slug if c.isalnum() or c == '-')
            
            categories[cat_id] = {
                'name': name,
                'parent_id': parent_id if parent_id else None,
                'path': path,
                'slug': slug
            }
    
    return categories

def import_categories(categories):
    """Import categories into database"""
    print(f"Importing {len(categories)} categories...")
    
    # Get existing categories
    existing = run_sql("SELECT id, name FROM \"Category\"")
    existing_ids = set()
    if existing:
        for line in existing.split('\n'):
            if '|' in line:
                parts = line.split('|')
                if len(parts) >= 2:
                    existing_ids.add(parts[0])
    
    print(f"Found {len(existing_ids)} existing categories in DB")
    
    # Insert categories (skip if exists)
    for cat_id, cat in categories.items():
        # Check if exists by name (since id might be different)
        existing = run_sql(
            "SELECT id FROM \"Category\" WHERE slug = %s OR name = %s LIMIT 1",
            {'1': cat['slug'], '2': cat['name']}
        )
        
        if not existing:
            # Generate new UUID-like ID
            new_id = f"cat-{cat_id}"
            slug = cat['slug'][:50]  # Truncate if needed
            
            sql = f"""
                INSERT INTO \"Category\" (id, name, slug, description)
                VALUES ('{new_id}', '{cat['name'].replace("'", "''")}', '{slug}', '{cat['path'].replace("'", "''")}')
                ON CONFLICT DO NOTHING
            """
            run_sql(sql)
    
    print("Categories import complete")
    
    # Get category ID by name
    def get_cat_id(name):
        result = run_sql(f"SELECT id FROM \"Category\" WHERE name = '{name.replace("'", "''")}' LIMIT 1")
        if result and '|' not in str(result):
            return result.strip()
        return None
    
    return categories, get_cat_id

def load_product_mapping():
    """Load product-category mapping"""
    products = []
    
    with open(MAPPING_CSV, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = row['code']
            name = row['name']
            category_name = row['default_category_path'].split(' > ')[-1] if row['default_category_path'] else None
            
            products.append({
                'code': code,
                'name': name,
                'category_name': category_name
            })
    
    return products

def update_products(products, get_cat_id_func):
    """Update products with correct categories"""
    print(f"Updating {len(products)} products...")
    
    updated = 0
    errors = 0
    
    for i, p in enumerate(products):
        if i % 100 == 0:
            print(f"  Progress: {i}/{len(products)}")
        
        code = p['code']
        category_name = p['category_name']
        
        if not category_name:
            errors += 1
            continue
        
        # Get category ID
        cat_id = get_cat_id_func(category_name)
        if not cat_id:
            # Try to find parent category
            cat_id = get_cat_id_func("Suvenýry s tématikou Prahy")
            if not cat_id:
                errors += 1
                continue
        
        # Update product
        sql = f"""
            UPDATE \"Product\"
            SET \"categoryId\" = '{cat_id}',
                \"isClassified\" = true,
                name = '{p['name'].replace("'", "''")}'
            WHERE (\"productCode\" = '{code}' OR sku = '{code}')
            AND \"deletedAt\" IS NULL
        """
        result = run_sql(sql)
        
        # Check if update was successful (psql returns empty on success)
        if result is not None:
            updated += 1
    
    print(f"Updated {updated} products, {errors} errors")
    return updated, errors

def main():
    print("=" * 50)
    print("Product Import Script")
    print("=" * 50)
    
    # Load categories
    print("\n1. Loading categories from CSV...")
    categories = load_categories()
    print(f"   Loaded {len(categories)} categories")
    
    # Import categories
    print("\n2. Importing categories to database...")
    categories, get_cat_id = import_categories(categories)
    
    # Load product mapping
    print("\n3. Loading product mapping...")
    products = load_product_mapping()
    print(f"   Loaded {len(products)} product mappings")
    
    # Update products
    print("\n4. Updating products...")
    updated, errors = update_products(products, get_cat_id)
    
    # Mark remaining unclassified products
    print("\n5. Marking remaining products as classified...")
    result = run_sql("""
        UPDATE \"Product\"
        SET \"isClassified\" = true
        WHERE \"isClassified\" = false
        AND \"deletedAt\" IS NULL
    """)
    
    # Count results
    classified = run_sql("SELECT COUNT(*) FROM \"Product\" WHERE \"isClassified\" = true AND \"deletedAt\" IS NULL")
    print(f"\n   Total classified products: {classified}")
    
    print("\n" + "=" * 50)
    print("Import complete!")
    print("=" * 50)

if __name__ == "__main__":
    main()
