import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'juntas.db');

let db = null;

export async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  db.run('PRAGMA journal_mode=WAL');
  db.run('PRAGMA foreign_keys=ON');
  return db;
}

export function saveDb() {
  if (!db) throw new Error('DB not initialized');
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

function toArray(val) {
  if (Array.isArray(val)) return val;
  if (val == null) return [];
  return [val];
}

function prepare(sql, params = []) {
  const stmt = db.prepare(sql);
  const arr = toArray(params);
  if (arr.length > 0) {
    stmt.bind(arr);
  }
  return stmt;
}

export function query(sql, params = []) {
  const stmt = prepare(sql, params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

export function queryOne(sql, params = []) {
  const stmt = prepare(sql, params);
  const has = stmt.step();
  const result = has ? stmt.getAsObject() : null;
  stmt.free();
  return result;
}

export function execute(sql, params = []) {
  const stmt = prepare(sql, params);
  stmt.step();
  stmt.free();
}

export function insert(table, data) {
  const keys = Object.keys(data);
  const values = keys.map(k => data[k]);
  const placeholders = keys.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
  const stmt = prepare(sql, values);
  stmt.step();
  const id = db.exec("SELECT last_insert_rowid() AS rid")[0]?.values?.[0]?.[0];
  stmt.free();
  saveDb();
  return id;
}
