// Mock for expo-sqlite on web platform
export const openDatabaseSync = () => ({
  execSync: () => {},
  runSync: () => ({ changes: 0, lastInsertRowId: 0 }),
  getAllSync: () => [],
  getFirstSync: () => null,
  closeSync: () => {},
});

export const SQLiteDatabase = class SQLiteDatabase {
  constructor() {}
  execSync() {}
  runSync() { return { changes: 0, lastInsertRowId: 0 }; }
  getAllSync() { return []; }
  getFirstSync() { return null; }
  closeSync() {}
};

export default {
  openDatabaseSync,
  SQLiteDatabase,
};