/// <reference types="vite/client" />
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { Gunzip } from 'fflate';
import { portionNutrients } from '../src/core/nutrition';
import manifest from '../src/data/catalog/food-manifest.json';

const starterPath = join(process.cwd(), 'assets', 'foods-starter-v4.db');
const bundledFullArchivePath = join(process.cwd(), 'assets', 'foods-full-v4.sqlite.gz');
const fullPath = join(process.cwd(), 'build', 'catalog', 'foods-full-v4.sqlite');
const starterArchivePath = join(process.cwd(), 'build', 'catalog', 'foods-starter-v4.sqlite.gz');

describe('bundled OpenNutrition starter catalog', () => {
  it('is intact, versioned, and keeps original food identifiers', () => {
    const db = new DatabaseSync(starterPath);
    expect(db.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
    expect(db.prepare('SELECT count(*) AS n FROM foods').get()).toEqual({ n: manifest.catalogs.starter.food_count });
    expect(db.prepare("SELECT value FROM catalog_info WHERE key='schema_version'").get()).toEqual({ value: String(manifest.schema_version) });
    expect(db.prepare("SELECT value FROM catalog_info WHERE key='license_url'").get()).toEqual({ value: 'https://opendatacommons.org/licenses/odbl/1-0/' });
    expect((db.prepare('SELECT id FROM foods ORDER BY id LIMIT 1').get() as { id: string }).id).toMatch(/^fd_[A-Za-z0-9]+$/);
    db.close();
    expect(createHash('sha256').update(readFileSync(starterPath)).digest('hex')).toBe(manifest.catalogs.starter.sqlite_sha256);
  });

  it('keeps public catalog tables separate from account meal and sync tables', () => {
    const db = new DatabaseSync(starterPath);
    const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(row => row.name));
    expect(tables.has('foods')).toBe(true);
    expect(tables.has('food_entries')).toBe(false);
    expect(tables.has('profile')).toBe(false);
    expect(tables.has('sync_outbox')).toBe(false);
    db.close();
  });

  it('finds Moroccan foods, alternative names, and indexed barcodes', () => {
    const db = new DatabaseSync(starterPath);
    const search = db.prepare('SELECT f.id,f.name FROM food_search s JOIN foods f ON f.id=s.food_id WHERE food_search MATCH ? ORDER BY bm25(food_search) LIMIT 20');
    expect(search.all('couscous*').some(row => /couscous/i.test(String(row.name)))).toBe(true);
    expect(search.all('harira*').length).toBeGreaterThan(0);
    const alias = db.prepare('SELECT a.alias,a.food_id FROM food_aliases a LIMIT 1').get() as { alias: string; food_id: string };
    expect(db.prepare('SELECT food_id FROM food_search WHERE food_search MATCH ? AND food_id=?').get(`"${alias.alias}"`, alias.food_id)).toEqual({ food_id: alias.food_id });
    const barcode = db.prepare('SELECT barcode,food_id FROM food_barcodes LIMIT 1').get() as { barcode: string; food_id: string };
    expect(db.prepare('SELECT food_id FROM food_barcodes WHERE barcode=?').all(barcode.barcode).some(row => row.food_id === barcode.food_id)).toBe(true);
    db.close();
  });

  it('uses the stored metric serving grams for meal snapshots', () => {
    const db = new DatabaseSync(starterPath);
    const item = db.prepare('SELECT kcal_100,protein_100,carbs_100,fat_100,serving_grams FROM foods WHERE serving_grams > 0 AND kcal_100 IS NOT NULL AND protein_100 IS NOT NULL AND carbs_100 IS NOT NULL AND fat_100 IS NOT NULL LIMIT 1').get() as { kcal_100: number; protein_100: number; carbs_100: number; fat_100: number; serving_grams: number };
    const serving = portionNutrients({ kcal: item.kcal_100, protein: item.protein_100, carbs: item.carbs_100, fat: item.fat_100 }, item.serving_grams);
    expect(serving.kcal).toBeCloseTo(item.kcal_100 * item.serving_grams / 100);
    db.close();
  });
});

describe('bundled complete catalog initialization', () => {
  it('ships the verified complete archive required for an offline first launch', () => {
    expect(existsSync(bundledFullArchivePath)).toBe(true);
    expect(createHash('sha256').update(readFileSync(bundledFullArchivePath)).digest('hex')).toBe(manifest.catalogs.full.sha256);
  });

  it('streams the complete archive into the verified SQLite checksum without loading the database into JavaScript memory', () => {
    const compressed = readFileSync(bundledFullArchivePath);
    const digest = createHash('sha256');
    const gunzip = new Gunzip(chunk => digest.update(chunk));
    for (let offset = 0; offset < compressed.length; offset += 65536)
      gunzip.push(compressed.subarray(offset, offset + 65536), offset + 65536 >= compressed.length);
    expect(digest.digest('hex')).toBe(manifest.catalogs.full.sqlite_sha256);
  }, 120000);

  it('uses the bundled archive for automatic initialization and retains the validated full catalog across launches', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'data', 'foodCatalog.ts'), 'utf8');
    const startup = source.slice(source.indexOf('async function openCatalogOnce'), source.indexOf('export function openFoodCatalog'));
    const nutritionScreen = readFileSync(join(process.cwd(), 'src', 'app', '(tabs)', 'nutrition.tsx'), 'utf8');
    expect(source).toContain("require('../../assets/foods-full-v4.sqlite.gz')");
    expect(source).toContain('installBundledFullCatalog');
    expect(source).toContain('await staged.move(final)');
    expect(source).toContain('await recordBundledFull(final)');
    expect(source).toContain('trustedCatalogInstallation');
    expect(startup).not.toContain('fetch(');
    expect(nutritionScreen).not.toContain('CatalogManagerSheet');
  });
});

describe.skipIf(!existsSync(starterArchivePath))('gzip transport', () => {
  it('decompresses the real starter release in bounded chunks', () => {
    const compressed = readFileSync(starterArchivePath);
    const digest = createHash('sha256');
    const gunzip = new Gunzip(chunk => digest.update(chunk));
    for (let offset = 0; offset < compressed.length; offset += 65536)
      gunzip.push(compressed.subarray(offset, offset + 65536), offset + 65536 >= compressed.length);
    expect(digest.digest('hex')).toBe(manifest.catalogs.starter.sqlite_sha256);
  });
});

describe.skipIf(!existsSync(fullPath))('generated full catalog', () => {
  it('is intact and contains every valid food', () => {
    const db = new DatabaseSync(fullPath);
    expect(db.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
    expect(db.prepare('SELECT count(*) AS n FROM foods').get()).toEqual({ n: manifest.catalogs.full.food_count });
    db.close();
  }, 120000);

  it('finds representative foods through the ranked local index', () => {
    const db = new DatabaseSync(fullPath);
    const search = db.prepare('SELECT f.id FROM food_search s JOIN foods f ON f.id=s.food_id WHERE food_search MATCH ? ORDER BY rank LIMIT 90');
    for (const term of ['msemen', 'couscous', 'chicken breast', 'rice', 'eggs', 'oats']) {
      const query = term.split(' ').map(word => `"${word}"*`).join(' ');
      expect(search.all(query).length, term).toBeGreaterThan(0);
    }
    db.close();
  });

  it('uses the category index for the empty search screen', () => {
    const db = new DatabaseSync(fullPath);
    const plan = db.prepare('EXPLAIN QUERY PLAN SELECT id,name FROM foods WHERE category=? ORDER BY name LIMIT 30').all('everyday') as { detail: string }[];
    expect(plan.some(step => step.detail.includes('SEARCH foods USING') && step.detail.includes('foods_category'))).toBe(true);
    expect(db.prepare('SELECT id FROM foods WHERE category=? ORDER BY name LIMIT 30').all('everyday')).toHaveLength(30);
    db.close();
  });
});
