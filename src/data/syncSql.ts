export function cloudUpsertSql(kind: string, columns: string[], primary: string) {
  const keys = primary.split(',');
  const updates = columns.filter(column => !keys.includes(column));
  const conflict = updates.length ? `DO UPDATE SET ${updates.map(column => `${column}=excluded.${column}`).join(',')}` : 'DO NOTHING';
  return `INSERT INTO ${kind} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')}) ON CONFLICT(${primary}) ${conflict}`;
}
