"""Verify a generated catalog release against the original OpenNutrition TSV."""
import argparse
import csv
import gzip
import hashlib
import json
import sqlite3
from pathlib import Path


def sha(path, compressed=False):
    digest = hashlib.sha256()
    opener = gzip.open if compressed else open
    with opener(path, 'rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--input', type=Path, required=True)
    p.add_argument('--manifest', type=Path, required=True)
    args = p.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding='utf-8'))
    folder = args.manifest.parent
    with args.input.open(encoding='utf-8-sig', newline='') as file:
        original = {row['id'].strip() for row in csv.DictReader(file, delimiter='\t') if row['id'].strip() and row['name'].strip()}
    results = {}
    for label in ('starter', 'full'):
        spec = manifest['catalogs'][label]
        dbpath = folder / spec['filename'].removesuffix('.gz')
        archive = folder / spec['filename']
        assert dbpath.stat().st_size == spec['sqlite_bytes']
        assert archive.stat().st_size == spec['compressed_bytes']
        assert sha(dbpath) == spec['sqlite_sha256']
        assert sha(archive) == spec['sha256']
        assert sha(archive, compressed=True) == spec['sqlite_sha256']
        db = sqlite3.connect(dbpath)
        assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert not db.execute('PRAGMA foreign_key_check').fetchall()
        ids = {r[0] for r in db.execute('SELECT id FROM foods')}
        assert len(ids) == spec['food_count']
        assert ids <= original
        if label == 'full':
            assert ids == original
        for word in ('couscous*', 'harira*', 'chicken*'):
            assert db.execute('SELECT 1 FROM food_search WHERE food_search MATCH ? LIMIT 1', (word,)).fetchone(), word
        barcode = db.execute('SELECT barcode,food_id FROM food_barcodes LIMIT 1').fetchone()
        assert barcode and db.execute('SELECT food_id FROM food_barcodes WHERE barcode=?', (barcode[0],)).fetchone()[0] == barcode[1]
        results[label] = {'foods': len(ids), 'sqlite_bytes': dbpath.stat().st_size,
                          'gzip_bytes': archive.stat().st_size, 'integrity': 'ok',
                          'source_ids_preserved': True}
        db.close()
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
