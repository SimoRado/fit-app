export function localDatabaseName(userId: string) {
  if (!/^user_[A-Za-z0-9]+$/.test(userId)) throw new Error('Invalid account identifier');
  return `better-day-${userId}.db`;
}
