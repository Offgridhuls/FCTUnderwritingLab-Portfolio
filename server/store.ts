import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { ProgressEvent } from '../shared/types.js';
export const uid = () => randomUUID();
export const now = () => new Date().toISOString();
export class Store {
  db: DatabaseSync;
  events = new EventEmitter();
  constructor(public dir = resolve(process.env.FCT_DATA_DIR || '.data')) {
    mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(resolve(dir, 'lab.sqlite'));
    this.db.exec(
      `PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records(kind TEXT,id TEXT,owner TEXT,data TEXT,PRIMARY KEY(kind,id)); CREATE INDEX IF NOT EXISTS owner_idx ON records(owner,kind); CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,owner TEXT,data TEXT); CREATE TABLE IF NOT EXISTS commands(owner TEXT,key TEXT,fingerprint TEXT,result TEXT,PRIMARY KEY(owner,key));`,
    );
  }
  put(kind: string, id: string, owner: string, value: unknown) {
    this.db
      .prepare('INSERT OR REPLACE INTO records VALUES(?,?,?,?)')
      .run(kind, id, owner, JSON.stringify(value));
    return value;
  }
  get<T>(kind: string, id: string, owner?: string): T | undefined {
    const row = this.db
      .prepare('SELECT data,owner FROM records WHERE kind=? AND id=?')
      .get(kind, id) as any;
    if (!row || (owner !== undefined && row.owner !== owner)) return;
    return JSON.parse(row.data);
  }
  list<T>(kind: string, owner: string): T[] {
    return (
      this.db
        .prepare('SELECT data FROM records WHERE kind=? AND owner=? ORDER BY rowid')
        .all(kind, owner) as any[]
    ).map((x) => JSON.parse(x.data));
  }
  all<T>(kind: string): { owner: string; value: T }[] {
    return (this.db.prepare('SELECT owner,data FROM records WHERE kind=?').all(kind) as any[]).map(
      (x) => ({ owner: x.owner, value: JSON.parse(x.data) }),
    );
  }
  command<T>(owner: string, key: string, fingerprint: string, fn: () => T): T {
    const old = this.db
      .prepare('SELECT fingerprint,result FROM commands WHERE owner=? AND key=?')
      .get(owner, key) as any;
    if (old) {
      if (old.fingerprint !== fingerprint)
        throw Object.assign(new Error('Command ID already used for a different command'), {
          statusCode: 409,
        });
      return JSON.parse(old.result);
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db
        .prepare('INSERT INTO commands VALUES(?,?,?,?)')
        .run(owner, key, fingerprint, JSON.stringify(result));
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  emit(owner: string, event: Omit<ProgressEvent, 'id' | 'sessionId' | 'createdAt'>) {
    const data = { ...event, sessionId: owner, createdAt: now() };
    const id = Number(
      this.db.prepare('INSERT INTO events(owner,data) VALUES(?,?)').run(owner, JSON.stringify(data))
        .lastInsertRowid,
    );
    const full = { ...data, id };
    queueMicrotask(() => this.events.emit(owner, full));
    return full;
  }
  eventList(owner: string, after = 0): ProgressEvent[] {
    return (
      this.db
        .prepare('SELECT id,data FROM events WHERE owner=? AND id>? ORDER BY id LIMIT 500')
        .all(owner, after) as any[]
    ).map((x) => ({ ...JSON.parse(x.data), id: x.id }));
  }
  lastEvent(owner: string) {
    return Number(
      (
        this.db
          .prepare('SELECT COALESCE(MAX(id),0) AS id FROM events WHERE owner=?')
          .get(owner) as any
      ).id,
    );
  }
  removeSession(owner: string) {
    this.db.prepare('DELETE FROM records WHERE owner=?').run(owner);
    this.db.prepare('DELETE FROM events WHERE owner=?').run(owner);
    this.db.prepare('DELETE FROM commands WHERE owner=?').run(owner);
  }
  close() {
    this.db.close();
  }
}
