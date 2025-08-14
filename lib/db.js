// lib/db.js
import 'server-only';
import mysql from 'mysql2/promise';

function pick(...keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (v !== undefined && v !== '') return v;
  }
  return undefined;
}

const host = pick('DB_HOST', 'MYSQL_HOST', 'DATABASE_HOST') || 'localhost';
const port = Number(pick('DB_PORT', 'MYSQL_PORT') || 3306);
const user = pick('DB_USER', 'MYSQL_USER');
const password = pick('DB_PASS', 'MYSQL_PASSWORD', 'DB_PASSWORD', 'MYSQL_PASS');
const database = pick('DB_NAME', 'MYSQL_DB');

const missing = [];
if (!user) missing.push('DB_USER/MYSQL_USER');
if (!database) missing.push('DB_NAME/MYSQL_DB');

if (missing.length) {
  throw new Error(
    `DB config missing: ${missing.join(', ')}. ` +
      `Got host=${host}, port=${port}, user=${String(user)}, db=${String(database)}`
  );
}

export const pool = mysql.createPool({
  host,
  port,
  user,
  password,
  database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
});
