"""Build reproducible, separately licensed OpenNutrition SQLite catalogs.

Usage: python scripts/build-food-catalog.py --input opennutrition_foods.tsv
Outputs are ignored build artifacts under build/catalog/. The source TSV is read only.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import heapq
import json
import re
import shutil
import sqlite3
import time
from collections import Counter
from pathlib import Path

SCHEMA_VERSION = 1
CORE = {"calories", "protein", "carbohydrates", "total_fat", "dietary_fiber", "total_sugars", "sodium"}
MOROCCAN = "couscous tagine tajine harira rfissa msemen baghrir khobz bastilla pastilla zaalouk taktouka amlou bissara briouat chebakia sfenj batbout mechoui merguez loubia kefta chermoula seffa tanjia".split()
FITNESS = "chicken turkey egg tuna salmon sardine mackerel cod tilapia shrimp yogurt skyr cottage quinoa oatmeal oats lentil chickpea tofu tempeh whey protein rice banana avocado almond peanut bean spinach broccoli sweet potato beef".split()
INTERNATIONAL = "pasta pizza sushi ramen taco burrito kimchi curry hummus falafel paella risotto dumpling noodles burger kebab shakshuka bibimbap pho lasagna quesadilla".split()
COMMON = "apple orange pear grape strawberry blueberry milk cheese bread butter olive oil potato tomato onion garlic carrot cucumber lettuce pepper mushroom flour sugar honey coffee tea water date fig lemon lime peach peach mango melon corn barley wheat".split()

DDL = """
PRAGMA page_size=4096;
CREATE TABLE catalog_info(key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE foods(
 id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT, labels_json TEXT,
 kcal_100 REAL, protein_100 REAL, carbs_100 REAL, fat_100 REAL,
 fiber_100 REAL, sugar_100 REAL, sodium_100 REAL,
 micronutrients_json TEXT, serving_name TEXT, serving_quantity REAL,
 serving_grams REAL, serving_json TEXT, sources_json TEXT,
 barcode_raw TEXT
) WITHOUT ROWID;
CREATE TABLE food_aliases(food_id TEXT NOT NULL REFERENCES foods(id), alias TEXT NOT NULL,
 PRIMARY KEY(food_id,alias)) WITHOUT ROWID;
CREATE TABLE food_barcodes(barcode TEXT NOT NULL, food_id TEXT NOT NULL REFERENCES foods(id),
 PRIMARY KEY(barcode,food_id)) WITHOUT ROWID;
CREATE INDEX foods_category ON foods(category,name);
CREATE INDEX foods_name ON foods(name COLLATE NOCASE);
CREATE INDEX aliases_name ON food_aliases(alias COLLATE NOCASE,food_id);
CREATE INDEX barcodes_food ON food_barcodes(food_id);
CREATE VIRTUAL TABLE food_search USING fts5(food_id UNINDEXED, term, tokenize='unicode61 remove_diacritics 2', prefix='2 3');
"""


def compact(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def json_field(raw, fallback):
    try:
        value = json.loads(raw) if raw else fallback
        return value if isinstance(value, type(fallback)) else fallback
    except (ValueError, TypeError):
        return fallback


def number(value):
    try:
        value = float(value)
        return value if 0 <= value <= 100000 and value != float('inf') else None
    except (ValueError, TypeError):
        return None


def barcode_valid(value):
    if not re.fullmatch(r"\d{8}|\d{12,14}", value):
        return False
    check = int(value[-1])
    body = [int(c) for c in value[:-1]][::-1]
    return (10 - sum(n * (3 if i % 2 == 0 else 1) for i, n in enumerate(body)) % 10) % 10 == check


def create_db(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise FileExistsError(f"Refusing to overwrite existing release: {path}")
    db = sqlite3.connect(path)
    db.executescript(DDL)
    db.executemany('INSERT INTO catalog_info VALUES (?,?)', [
        ('schema_version', str(SCHEMA_VERSION)),
        ('source', 'OpenNutrition Foods'),
        ('source_url', 'https://www.opennutrition.app'),
        ('license', 'Open Database License 1.0'),
        ('license_url', 'https://opendatacommons.org/licenses/odbl/1-0/'),
        ('contents_license', 'Modified Database Contents License 1.0; see OpenNutrition download package'),
        ('open_food_facts_attribution', '(c) Open Food Facts contributors — https://world.openfoodfacts.org'),
    ])
    return db


def insert_food(db, row, stats):
    food_id, name = row['id'].strip(), row['name'].strip()
    if not food_id or not name:
        stats['missing_id_or_name'] += 1
        return
    nutrients = json_field(row['nutrition_100g'], {})
    serving = json_field(row['serving'], {})
    metric = serving.get('metric') or {}
    common = serving.get('common') or {}
    aliases = json_field(row['alternate_names'], [])
    labels = json_field(row['labels'], [])
    sources = json_field(row['source'], [])
    micro = {k: v for k, v in nutrients.items() if k not in CORE}
    macro = [number(nutrients.get(k)) for k in ('calories', 'protein', 'carbohydrates', 'total_fat')]
    if any(v is None for v in macro):
        stats['missing_or_invalid_macro_profiles'] += 1
    barcode = row['ean_13'].strip()
    values = (food_id, name, row['type'].strip() or None, compact(labels) if labels else None,
              *macro, number(nutrients.get('dietary_fiber')), number(nutrients.get('total_sugars')),
              number(nutrients.get('sodium')), compact(micro) if micro else None,
              str(common.get('unit') or '').strip() or None, number(common.get('quantity')),
              number(metric.get('quantity')) if metric.get('unit') == 'g' else None,
              compact(serving) if serving else None, compact(sources) if sources else None,
              barcode if barcode and not barcode_valid(barcode) else None)
    try:
        db.execute('INSERT INTO foods VALUES (' + ','.join('?' * len(values)) + ')', values)
    except sqlite3.IntegrityError:
        stats['duplicate_food_ids'] += 1
        return
    unique_aliases = sorted({str(a).strip() for a in aliases if isinstance(a, str) and a.strip() and a.strip().casefold() != name.casefold()})
    db.executemany('INSERT INTO food_aliases VALUES (?,?)', ((food_id, a) for a in unique_aliases))
    if barcode:
        if barcode_valid(barcode):
            db.execute('INSERT INTO food_barcodes VALUES (?,?)', (barcode, food_id))
        else:
            stats['invalid_barcodes'] += 1
    stats['valid_foods'] += 1
    stats['aliases'] += len(unique_aliases)
    stats['category_' + (row['type'].strip() or 'empty')] += 1
    if not sources:
        stats['foods_without_sources'] += 1
    if not serving:
        stats['foods_without_serving'] += 1
    if not nutrients:
        stats['foods_without_nutrients'] += 1


def finish(db):
    db.execute('INSERT INTO food_search(food_id,term) SELECT id,name FROM foods')
    db.execute('INSERT INTO food_search(food_id,term) SELECT food_id,alias FROM food_aliases')
    db.commit()
    db.execute('ANALYZE')
    db.execute('VACUUM')
    db.commit()
    assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'


def score(row):
    food_id, name, category, kcal, protein, carbs, fat = row
    low = name.casefold()
    words = re.findall(r"\w+", low)
    base = 50 if category == 'everyday' else 10
    base += sum(v is not None for v in (kcal, protein, carbs, fat)) * 5
    base += max(0, 25 - len(words) * 3)
    base -= max(0, len(name) - 65)
    groups = []
    for label, terms, bonus in (('moroccan', MOROCCAN, 100), ('fitness', FITNESS, 60), ('international', INTERNATIONAL, 55), ('common', COMMON, 65)):
        if any(term in words or (len(term) >= 5 and term in low) for term in terms):
            groups.append((label, base + bonus))
    if category == 'everyday':
        groups.append(('everyday', base))
    return groups


def starter_ids(db):
    quotas = {'moroccan': 220, 'fitness': 500, 'international': 300, 'common': 650, 'everyday': 900}
    heaps = {key: [] for key in quotas}
    for row in db.execute('SELECT id,name,category,kcal_100,protein_100,carbs_100,fat_100 FROM foods'):
        for group, value in score(row):
            # Stable hash tie break; selection never depends on TSV row order.
            tie = int.from_bytes(hashlib.sha256(row[0].encode()).digest()[:8], 'big')
            candidate = (value, tie, row[0])
            heap = heaps[group]
            if len(heap) < quotas[group]:
                heapq.heappush(heap, candidate)
            elif candidate > heap[0]:
                heapq.heapreplace(heap, candidate)
    return sorted({item[2] for heap in heaps.values() for item in heap})


def make_starter(full_path, starter_path):
    starter = create_db(starter_path)
    starter.execute('ATTACH DATABASE ? AS full', (str(full_path),))
    # Use a separate read connection so selection can stream while attached copy waits.
    full = sqlite3.connect(full_path)
    ids = starter_ids(full)
    full.close()
    starter.execute('CREATE TEMP TABLE selected(id TEXT PRIMARY KEY) WITHOUT ROWID')
    starter.executemany('INSERT INTO selected VALUES (?)', ((item,) for item in ids))
    starter.execute('INSERT INTO foods SELECT f.* FROM full.foods f JOIN selected s ON s.id=f.id')
    starter.execute('INSERT INTO food_aliases SELECT a.* FROM full.food_aliases a JOIN selected s ON s.id=a.food_id')
    starter.execute('INSERT INTO food_barcodes SELECT b.* FROM full.food_barcodes b JOIN selected s ON s.id=b.food_id')
    starter.commit()
    starter.execute('DETACH DATABASE full')
    finish(starter)
    count = starter.execute('SELECT COUNT(*) FROM foods').fetchone()[0]
    starter.close()
    return count


def compress(path):
    target = path.with_suffix(path.suffix + '.gz')
    with path.open('rb') as source, target.open('wb') as out:
        with gzip.GzipFile(filename='', mode='wb', fileobj=out, compresslevel=9, mtime=0) as zipout:
            for chunk in iter(lambda: source.read(1024 * 1024), b''):
                zipout.write(chunk)
    return target


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def benchmark(path):
    db = sqlite3.connect(path)
    queries = {'name': "SELECT f.id FROM food_search s JOIN foods f ON f.id=s.food_id WHERE food_search MATCH ? LIMIT 30",
               'barcode': 'SELECT food_id FROM food_barcodes WHERE barcode=? LIMIT 30'}
    probes = {'name': ['chicken*', 'couscous*', 'tagine*', 'rice*', 'yogurt*'],
              'barcode': [r[0] for r in db.execute('SELECT barcode FROM food_barcodes LIMIT 5')]}
    out = {}
    for kind, sql in queries.items():
        values = probes[kind]
        if not values:
            out[kind + '_median_ms'] = None
            continue
        samples = []
        for _ in range(20):
            for value in values:
                start = time.perf_counter()
                db.execute(sql, (value,)).fetchall()
                samples.append((time.perf_counter() - start) * 1000)
        out[kind + '_median_ms'] = round(sorted(samples)[len(samples) // 2], 3)
        out[kind + '_p95_ms'] = round(sorted(samples)[int(len(samples) * .95)], 3)
    try:
        out['search_index_bytes'] = db.execute("SELECT sum(pgsize) FROM dbstat WHERE name LIKE 'food_search%'").fetchone()[0]
    except sqlite3.OperationalError:
        # Windows' Python SQLite often omits dbstat. Measure a vacuumed copy
        # without FTS rather than reporting an estimate.
        stripped = path.with_suffix('.without-fts.tmp')
        try:
            shutil.copyfile(path, stripped)
            other = sqlite3.connect(stripped)
            other.execute('DROP TABLE food_search')
            other.commit()
            other.execute('VACUUM')
            other.close()
            out['search_index_bytes'] = path.stat().st_size - stripped.stat().st_size
        finally:
            stripped.unlink(missing_ok=True)
    out['duplicate_barcode_assignments'] = db.execute('SELECT count(*) FROM (SELECT barcode FROM food_barcodes GROUP BY barcode HAVING count(*)>1)').fetchone()[0]
    db.close()
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--input', type=Path, required=True)
    p.add_argument('--output', type=Path, default=Path('build/catalog'))
    p.add_argument('--version', default='v1')
    p.add_argument('--base-url', default='')
    args = p.parse_args()
    if not re.fullmatch(r'v[1-9]\d*', args.version):
        p.error('version must be v1, v2, ...')
    args.output.mkdir(parents=True, exist_ok=True)
    full_path = args.output / f'foods-full-{args.version}.sqlite'
    starter_path = args.output / f'foods-starter-{args.version}.sqlite'
    start = time.perf_counter()
    db = create_db(full_path)
    stats = Counter()
    with args.input.open('r', encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f, delimiter='\t')
        expected = {'id','name','alternate_names','description','type','source','serving','nutrition_100g','ean_13','labels','package_size','ingredients','ingredient_analysis'}
        if set(reader.fieldnames or []) != expected:
            raise ValueError('Unexpected TSV columns')
        for row in reader:
            stats['rows'] += 1
            insert_food(db, row, stats)
            if stats['rows'] % 10000 == 0:
                db.commit()
    finish(db)
    full_count = db.execute('SELECT COUNT(*) FROM foods').fetchone()[0]
    db.close()
    full_duration = round(time.perf_counter() - start, 2)
    start = time.perf_counter()
    starter_count = make_starter(full_path, starter_path)
    starter_duration = round(time.perf_counter() - start, 2)
    release = {'version': args.version, 'schema_version': SCHEMA_VERSION, 'release_date': __import__('datetime').date.today().isoformat(),
               'minimum_supported_schema_version': SCHEMA_VERSION, 'source': 'OpenNutrition', 'license': 'ODbL-1.0 / modified DbCL-1.0', 'catalogs': {}}
    for label, path, count, duration in [('starter', starter_path, starter_count, starter_duration), ('full', full_path, full_count, full_duration)]:
        gz = compress(path)
        release['catalogs'][label] = {'food_count': count, 'filename': gz.name,
            'download_url': f"{args.base_url.rstrip('/')}/nutrition/{label}/{gz.name}" if args.base_url else None,
            'compressed_bytes': gz.stat().st_size, 'sqlite_bytes': path.stat().st_size,
            'sha256': sha256(gz), 'sqlite_sha256': sha256(path), 'import_seconds': duration,
            **benchmark(path)}
    (args.output / f'manifest-{args.version}.json').write_text(json.dumps(release, indent=2) + '\n', encoding='utf-8')
    (args.output / f'analysis-{args.version}.json').write_text(json.dumps(dict(stats), indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(json.dumps({'analysis': dict(stats), 'manifest': release}, indent=2))


if __name__ == '__main__':
    main()
