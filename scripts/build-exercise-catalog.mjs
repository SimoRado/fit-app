import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const source = resolve(process.argv[2] ?? 'exercises-dataset-main/exercises-dataset-main');
const raw = await readFile(join(source, 'data/exercises.json'));
const rows = JSON.parse(raw.toString('utf8'));
if (!Array.isArray(rows) || rows.length !== 1324) throw Error('Unexpected source exercise count');
const ids = new Set();
const normalized = rows.map(row => {
  if (!/^\d{4}$/.test(row.id) || ids.has(row.id)) throw Error(`Invalid or duplicate source ID: ${row.id}`);
  ids.add(row.id);
  for (const language of ['en', 'fr', 'es', 'it', 'tr', 'ru', 'zh', 'hi', 'pl', 'ko']) {
    if (!row.instructions?.[language] || !Array.isArray(row.instruction_steps?.[language])) throw Error(`Missing ${language} instructions: ${row.id}`);
  }
  return {
    source_id: row.id,
    name: row.name.trim().replace(/\s+/g, ' '),
    category: row.category.trim(),
    body_part: row.body_part.trim(),
    equipment: row.equipment.trim(),
    muscle_group: row.muscle_group.trim(),
    target_muscle: row.target.trim(),
    secondary_muscles: row.secondary_muscles,
    instructions: row.instructions,
    instruction_steps: row.instruction_steps,
  };
});
const contentIds = new Map();
const aliases = [];
const catalog = normalized.filter(row => {
  const { source_id, ...content } = row;
  const key = JSON.stringify(content);
  const canonical = contentIds.get(key);
  if (canonical) { aliases.push({ source_id, canonical_source_id: canonical }); return false; }
  contentIds.set(key, source_id);
  return true;
});
const directory = resolve('src/data/catalog');
await mkdir(directory, { recursive: true });
await writeFile(join(directory, 'exercises.json'), JSON.stringify(catalog) + '\n');
await writeFile(join(directory, 'source-aliases.json'), JSON.stringify(aliases) + '\n');
await writeFile(join(directory, 'version.json'), JSON.stringify({ sha256: createHash('sha256').update(raw).digest('hex'), count: catalog.length }) + '\n');
await copyFile(join(source, 'LICENSE'), join(directory, 'LICENSE'));
await copyFile(join(source, 'NOTICE.md'), join(directory, 'NOTICE.md'));
console.log(`Prepared ${catalog.length} exercises and ${aliases.length} source aliases without media.`);
