import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { TEXT_PRICES, IMAGE_PRICES, type TypedTags } from './config';

const dataDir = path.join(process.cwd(), 'data');
fs.mkdirSync(path.join(dataDir, 'images'), { recursive: true });
export const IMAGES_DIR = path.join(dataDir, 'images');

export interface Post {
  id: number;
  topic: string;
  source: string;
  status: string;
  slug: string | null;
  image_prompt: string | null;
  image_path: string | null;
  title_json: string | null;
  tags_json: string | null;
  desc_json: string | null;
  body_json: string | null;
  attempts: number;
  error: string | null;
  created_at: string;
  published_at: string | null;
}

function init(): DatabaseSync {
  const d = new DatabaseSync(path.join(dataDir, 'app.db'));
  d.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS posts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      topic         TEXT NOT NULL,
      source        TEXT NOT NULL DEFAULT 'manual',
      status        TEXT NOT NULL DEFAULT 'pending',
      slug          TEXT UNIQUE,
      image_prompt  TEXT,
      image_path    TEXT,
      title_json    TEXT,
      tags_json     TEXT,
      desc_json     TEXT,
      body_json     TEXT,
      attempts      INTEGER NOT NULL DEFAULT 0,
      error         TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      published_at  TEXT
    );
    CREATE TABLE IF NOT EXISTS post_tags (
      post_id INTEGER NOT NULL REFERENCES posts(id),
      lang    TEXT NOT NULL,
      tag     TEXT NOT NULL,
      PRIMARY KEY (post_id, lang, tag)
    );
    CREATE INDEX IF NOT EXISTS idx_tags_lang_tag ON post_tags(lang, tag);
    CREATE TABLE IF NOT EXISTS llm_logs (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      ts                TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      post_id           INTEGER,
      step              TEXT NOT NULL,
      model             TEXT NOT NULL,
      prompt            TEXT,
      duration_ms       INTEGER,
      prompt_tokens     INTEGER,
      completion_tokens INTEGER,
      result            TEXT,
      error             TEXT
    );
  `);
  try {
    d.exec(`ALTER TABLE llm_logs ADD COLUMN post_id INTEGER`);
  } catch {
    /* column already exists */
  }
  try {
    d.exec(`ALTER TABLE post_tags ADD COLUMN kind TEXT NOT NULL DEFAULT 'other'`);
  } catch {
    /* column already exists */
  }
  return d;
}

// survive Next dev HMR reloads
const g = globalThis as unknown as { __alibbDb?: DatabaseSync };
export const db = (g.__alibbDb ??= init());

export function insertTopic(topic: string, source: 'manual' | 'auto'): number {
  const r = db.prepare(`INSERT INTO posts (topic, source) VALUES (?, ?)`).run(topic, source);
  return Number(r.lastInsertRowid);
}

export function getPost(id: number): Post | undefined {
  return db.prepare(`SELECT * FROM posts WHERE id = ?`).get(id) as Post | undefined;
}

export function listQueue(limit: number): Post[] {
  return db
    .prepare(`SELECT * FROM posts WHERE status NOT IN ('published','failed') AND attempts < 3 ORDER BY id LIMIT ?`)
    .all(limit) as unknown as Post[];
}

export function updateStep(id: number, col: string, value: string, nextStatus: string) {
  db.prepare(`UPDATE posts SET ${col} = ?, status = ? WHERE id = ?`).run(value, nextStatus, id);
}

export function failPost(id: number, error: string) {
  db.prepare(
    `UPDATE posts SET attempts = attempts + 1, error = ?,
     status = CASE WHEN attempts + 1 >= 3 THEN 'failed' ELSE status END
     WHERE id = ?`
  ).run(error.slice(0, 2000), id);
}

export function publishPost(id: number, slug: string) {
  db.prepare(
    `UPDATE posts SET slug = ?, status = 'published', published_at = datetime('now','localtime'), error = NULL WHERE id = ?`
  ).run(slug, id);
}

export function replaceTags(id: number, typed: TypedTags) {
  db.prepare(`DELETE FROM post_tags WHERE post_id = ?`).run(id);
  const ins = db.prepare(`INSERT OR IGNORE INTO post_tags (post_id, lang, tag, kind) VALUES (?, ?, ?, ?)`);
  for (const kind of ['char', 'style'] as const) {
    for (const [lang, csv] of Object.entries(typed[kind])) {
      for (const tag of csv.split(',')) {
        const t = tag.trim();
        if (t) ins.run(id, lang, t, kind);
      }
    }
  }
}

export function getPostBySlug(slug: string): Post | undefined {
  return db.prepare(`SELECT * FROM posts WHERE slug = ? AND status = 'published'`).get(slug) as Post | undefined;
}

export function listPublished(search?: string, limit = 60): Post[] {
  if (search) {
    return db
      .prepare(
        `SELECT * FROM posts WHERE status = 'published' AND (title_json LIKE ? OR tags_json LIKE ? OR topic LIKE ?)
         ORDER BY id DESC LIMIT ?`
      )
      .all(`%${search}%`, `%${search}%`, `%${search}%`, limit) as unknown as Post[];
  }
  return db.prepare(`SELECT * FROM posts WHERE status = 'published' ORDER BY id DESC LIMIT ?`).all(limit) as unknown as Post[];
}

export function getTagsForPost(id: number, lang: string): string[] {
  return (db.prepare(`SELECT tag FROM post_tags WHERE post_id = ? AND lang = ?`).all(id, lang) as { tag: string }[]).map(
    (r) => r.tag
  );
}

export function listPostsByTag(lang: string, tag: string): Post[] {
  return db
    .prepare(
      `SELECT p.* FROM posts p JOIN post_tags t ON t.post_id = p.id
       WHERE p.status = 'published' AND t.lang = ? AND t.tag = ? ORDER BY p.id DESC LIMIT 60`
    )
    .all(lang, tag) as unknown as Post[];
}

export function distinctTags(): { lang: string; tag: string }[] {
  return db.prepare(`SELECT DISTINCT lang, tag FROM post_tags`).all() as { lang: string; tag: string }[];
}

export function listAll(limit = 100): Post[] {
  return db.prepare(`SELECT * FROM posts ORDER BY id DESC LIMIT ?`).all(limit) as unknown as Post[];
}

export function retryPost(id: number) {
  db.prepare(`UPDATE posts SET attempts = 0, error = NULL, status = CASE WHEN status = 'failed' THEN 'pending' ELSE status END WHERE id = ?`).run(id);
}

export function deletePost(id: number) {
  db.prepare(`DELETE FROM post_tags WHERE post_id = ?`).run(id);
  db.prepare(`DELETE FROM posts WHERE id = ?`).run(id);
}

export interface LLMLog {
  id: number;
  ts: string;
  post_id: number | null;
  step: string;
  model: string;
  prompt: string | null;
  duration_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  result: string | null;
  error: string | null;
}

export function insertLog(e: Omit<LLMLog, 'id' | 'ts'>) {
  db.prepare(
    `INSERT INTO llm_logs (post_id, step, model, prompt, duration_ms, prompt_tokens, completion_tokens, result, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    e.post_id ?? null,
    e.step,
    e.model,
    e.prompt?.slice(0, 4000) ?? null,
    e.duration_ms ?? null,
    e.prompt_tokens ?? null,
    e.completion_tokens ?? null,
    e.result?.slice(0, 4000) ?? null,
    e.error?.slice(0, 2000) ?? null
  );
}

export function listLogs(limit = 50): LLMLog[] {
  return db.prepare(`SELECT * FROM llm_logs ORDER BY id DESC LIMIT ?`).all(limit) as unknown as LLMLog[];
}

export type LogWithTopic = LLMLog & { topic: string | null };

export function listLogsWithTopic(limit = 300): LogWithTopic[] {
  return db
    .prepare(
      `SELECT l.*, p.topic FROM llm_logs l LEFT JOIN posts p ON p.id = l.post_id
       ORDER BY l.id DESC LIMIT ?`
    )
    .all(limit) as unknown as LogWithTopic[];
}

export function tagStats(limit = 60): { kind: string; tag: string; c: number }[] {
  return db
    .prepare(
      `SELECT kind, tag, COUNT(*) AS c FROM post_tags WHERE lang = 'zh'
       GROUP BY kind, tag ORDER BY c DESC, tag LIMIT ?`
    )
    .all(limit) as { kind: string; tag: string; c: number }[];
}

export function logTotals(): { calls: number; prompt_tokens: number; completion_tokens: number } {
  return db
    .prepare(
      `SELECT COUNT(*) AS calls,
              COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
              COALESCE(SUM(completion_tokens), 0) AS completion_tokens
       FROM llm_logs WHERE error IS NULL`
    )
    .get() as { calls: number; prompt_tokens: number; completion_tokens: number };
}

export interface ModelUsage {
  model: string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  images: number;
}

export function usageByModel(): ModelUsage[] {
  return db
    .prepare(
      `SELECT model,
              COUNT(*) AS calls,
              COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
              COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
              SUM(CASE WHEN step = 'image' AND error IS NULL THEN 1 ELSE 0 END) AS images
       FROM llm_logs WHERE error IS NULL GROUP BY model`
    )
    .all() as unknown as ModelUsage[];
}

export function logCost(l: LLMLog): number | null {
  if (l.error) return null;
  if (l.step === 'image') {
    const ip = IMAGE_PRICES[l.model];
    if (typeof ip === 'number') return ip;
    if (ip && l.prompt_tokens != null && l.completion_tokens != null) {
      return (l.prompt_tokens * ip.input + l.completion_tokens * ip.output) / 1e6;
    }
    return null;
  }
  const p = TEXT_PRICES[l.model];
  if (!p) return null;
  return ((l.prompt_tokens ?? 0) * p.input + (l.completion_tokens ?? 0) * p.output) / 1e6;
}
