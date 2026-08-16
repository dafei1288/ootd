import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { TEXT_PRICES, IMAGE_PRICES, SITE_NAME, type TypedTags } from './config';

const dataDir = path.join(process.cwd(), 'data');
export const IMAGES_DIR = path.join(dataDir, 'images');

// survive Next dev HMR reloads
const g = globalThis as unknown as { __alibbDb?: DatabaseSync };

/**
 * Lazy-open the SQLite database. Opening is deferred until first query so that
 * Next.js build workers (which import this module in parallel) never contend
 * for the same DB file — multiple processes writing WAL at once causes
 * `database is locked` during `next build`.
 */
export function getDb(): DatabaseSync {
  if (!g.__alibbDb) {
    fs.mkdirSync(path.join(dataDir, 'images'), { recursive: true });
    g.__alibbDb = init();
  }
  return g.__alibbDb;
}

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
  likes: number;
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
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS search_queries (
      term     TEXT NOT NULL,
      lang     TEXT NOT NULL,
      hits     INTEGER NOT NULL DEFAULT 0,
      found    INTEGER NOT NULL DEFAULT 0,
      first_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      last_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      PRIMARY KEY (term, lang)
    );
    CREATE TABLE IF NOT EXISTS comments (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id    INTEGER NOT NULL REFERENCES posts(id),
      author     TEXT NOT NULL DEFAULT '',
      body       TEXT NOT NULL,
      lang       TEXT NOT NULL DEFAULT 'en',
      ip         TEXT NOT NULL DEFAULT '',
      status     TEXT NOT NULL DEFAULT 'approved',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
    CREATE TABLE IF NOT EXISTS ip_geo (
      ip         TEXT PRIMARY KEY,
      country    TEXT NOT NULL DEFAULT '',
      region     TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS wishes (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      content      TEXT NOT NULL,
      nickname     TEXT NOT NULL DEFAULT '',
      lang         TEXT NOT NULL DEFAULT 'en',
      ip           TEXT NOT NULL DEFAULT '',
      status       TEXT NOT NULL DEFAULT 'pending',
      post_id      INTEGER,
      created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_wishes_status ON wishes(status);
    CREATE TABLE IF NOT EXISTS site_snippets (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      content    TEXT NOT NULL,
      enabled    INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
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
  try {
    d.exec(`ALTER TABLE posts ADD COLUMN likes INTEGER NOT NULL DEFAULT 0`);
  } catch {
    /* column already exists */
  }
  try {
    d.exec(`ALTER TABLE comments ADD COLUMN ip TEXT NOT NULL DEFAULT ''`);
  } catch {
    /* column already exists */
  }
  return d;
}

// survive Next dev HMR reloads (see getDb() above)

export function insertTopic(topic: string, source: 'manual' | 'auto'): number {
  const r = getDb().prepare(`INSERT INTO posts (topic, source) VALUES (?, ?)`).run(topic, source);
  return Number(r.lastInsertRowid);
}

export function getPost(id: number): Post | undefined {
  return getDb().prepare(`SELECT * FROM posts WHERE id = ?`).get(id) as Post | undefined;
}

export function listQueue(limit: number): Post[] {
  return getDb()
    .prepare(`SELECT * FROM posts WHERE status NOT IN ('published','failed') AND attempts < 3 ORDER BY id LIMIT ?`)
    .all(limit) as unknown as Post[];
}

export function updateStep(id: number, col: string, value: string, nextStatus: string) {
  getDb().prepare(`UPDATE posts SET ${col} = ?, status = ? WHERE id = ?`).run(value, nextStatus, id);
}

export function failPost(id: number, error: string) {
  getDb().prepare(
    `UPDATE posts SET attempts = attempts + 1, error = ?,
     status = CASE WHEN attempts + 1 >= 3 THEN 'failed' ELSE status END
     WHERE id = ?`
  ).run(error.slice(0, 2000), id);
}

export function publishPost(id: number, slug: string) {
  getDb().prepare(
    `UPDATE posts SET slug = ?, status = 'published', published_at = datetime('now','localtime'), error = NULL WHERE id = ?`
  ).run(slug, id);
}

export function replaceTags(id: number, typed: TypedTags) {
  getDb().prepare(`DELETE FROM post_tags WHERE post_id = ?`).run(id);
  const ins = getDb().prepare(`INSERT OR IGNORE INTO post_tags (post_id, lang, tag, kind) VALUES (?, ?, ?, ?)`);
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
  return getDb().prepare(`SELECT * FROM posts WHERE slug = ? AND status = 'published'`).get(slug) as Post | undefined;
}

export function listPublished(search?: string, limit = 60): Post[] {
  if (search) {
    return getDb()
      .prepare(
        `SELECT * FROM posts WHERE status = 'published' AND (title_json LIKE ? OR tags_json LIKE ? OR topic LIKE ?)
         ORDER BY id DESC LIMIT ?`
      )
      .all(`%${search}%`, `%${search}%`, `%${search}%`, limit) as unknown as Post[];
  }
  return getDb().prepare(`SELECT * FROM posts WHERE status = 'published' ORDER BY id DESC LIMIT ?`).all(limit) as unknown as Post[];
}

export function getTagsForPost(id: number, lang: string): string[] {
  return (getDb().prepare(`SELECT tag FROM post_tags WHERE post_id = ? AND lang = ?`).all(id, lang) as { tag: string }[]).map(
    (r) => r.tag
  );
}

export function listPostsByTag(lang: string, tag: string): Post[] {
  return getDb()
    .prepare(
      `SELECT p.* FROM posts p JOIN post_tags t ON t.post_id = p.id
       WHERE p.status = 'published' AND t.lang = ? AND t.tag = ? ORDER BY p.id DESC LIMIT 60`
    )
    .all(lang, tag) as unknown as Post[];
}

export function distinctTags(): { lang: string; tag: string }[] {
  return getDb().prepare(`SELECT DISTINCT lang, tag FROM post_tags`).all() as { lang: string; tag: string }[];
}

export function listAll(limit = 100): Post[] {
  return getDb().prepare(`SELECT * FROM posts ORDER BY id DESC LIMIT ?`).all(limit) as unknown as Post[];
}

export function retryPost(id: number) {
  getDb().prepare(`UPDATE posts SET attempts = 0, error = NULL, status = CASE WHEN status = 'failed' THEN 'pending' ELSE status END WHERE id = ?`).run(id);
}

export function deletePost(id: number) {
  getDb().prepare(`DELETE FROM post_tags WHERE post_id = ?`).run(id);
  getDb().prepare(`DELETE FROM comments WHERE post_id = ?`).run(id);
  // A deleted post no longer fulfills its wish → return the wish to the pool.
  getDb()
    .prepare(`UPDATE wishes SET status = 'pending', post_id = NULL, completed_at = NULL WHERE post_id = ?`)
    .run(id);
  getDb().prepare(`DELETE FROM posts WHERE id = ?`).run(id);
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
  getDb().prepare(
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
  return getDb().prepare(`SELECT * FROM llm_logs ORDER BY id DESC LIMIT ?`).all(limit) as unknown as LLMLog[];
}

export type LogWithTopic = LLMLog & { topic: string | null };

export function listLogsWithTopic(limit = 300): LogWithTopic[] {
  return getDb()
    .prepare(
      `SELECT l.*, p.topic FROM llm_logs l LEFT JOIN posts p ON p.id = l.post_id
       ORDER BY l.id DESC LIMIT ?`
    )
    .all(limit) as unknown as LogWithTopic[];
}

export function tagStats(limit = 60): { kind: string; tag: string; c: number }[] {
  return getDb()
    .prepare(
      `SELECT kind, tag, COUNT(*) AS c FROM post_tags WHERE lang = 'zh'
       GROUP BY kind, tag ORDER BY c DESC, tag LIMIT ?`
    )
    .all(limit) as { kind: string; tag: string; c: number }[];
}

export function logTotals(): { calls: number; prompt_tokens: number; completion_tokens: number } {
  return getDb()
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
  return getDb()
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

// --- settings (runtime-configurable site name, etc.) ---

export function getSetting(key: string): string | null {
  const r = getDb().prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string | null } | undefined;
  return r?.value ?? null;
}

export function setSetting(key: string, value: string) {
  getDb().prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
}

export function siteName(): string {
  return getSetting('site_name') ?? SITE_NAME;
}

// --- site snippets (admin-managed analytics / ad code, injected on public pages) ---

export interface SiteSnippet {
  id: number;
  name: string;
  content: string;
  enabled: number; // 0 | 1
  sort_order: number;
}

export function listSnippets(): SiteSnippet[] {
  return getDb()
    .prepare(`SELECT id, name, content, enabled, sort_order FROM site_snippets ORDER BY sort_order, id`)
    .all() as unknown as SiteSnippet[];
}

export function listEnabledSnippets(): SiteSnippet[] {
  return getDb()
    .prepare(`SELECT id, name, content, enabled, sort_order FROM site_snippets WHERE enabled = 1 ORDER BY sort_order, id`)
    .all() as unknown as SiteSnippet[];
}

export function saveSnippet(id: number | null, name: string, content: string): number {
  const n = name.trim().slice(0, 80) || '未命名';
  const c = content.slice(0, 20000);
  if (id) {
    getDb().prepare(`UPDATE site_snippets SET name = ?, content = ? WHERE id = ?`).run(n, c, id);
    return id;
  }
  const r = getDb().prepare(`INSERT INTO site_snippets (name, content) VALUES (?, ?)`).run(n, c);
  return Number(r.lastInsertRowid);
}

export function setSnippetEnabled(id: number, enabled: boolean) {
  getDb().prepare(`UPDATE site_snippets SET enabled = ? WHERE id = ?`).run(enabled ? 1 : 0, id);
}

export function deleteSnippet(id: number) {
  getDb().prepare(`DELETE FROM site_snippets WHERE id = ?`).run(id);
}

export function clearLogs() {
  getDb().prepare(`DELETE FROM llm_logs`).run();
}

// --- likes ---

export function likePost(id: number) {
  getDb().prepare(`UPDATE posts SET likes = likes + 1 WHERE id = ?`).run(id);
}

// --- search term tracking (feeds admin "what to create next") ---

export interface SearchTerm {
  term: string;
  lang: string;
  hits: number;
  found: number;
  last_at: string;
}

export function recordSearch(lang: string, term: string, found: boolean) {
  getDb()
    .prepare(
      `INSERT INTO search_queries (term, lang, hits, found)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(term, lang) DO UPDATE SET
         hits = hits + 1,
         found = found + excluded.found,
         last_at = datetime('now','localtime')`
    )
    .run(term, lang, found ? 1 : 0);
}

export function listSearchTerms(limit = 60): SearchTerm[] {
  return getDb()
    .prepare(`SELECT term, lang, hits, found, last_at FROM search_queries ORDER BY hits DESC, last_at DESC LIMIT ?`)
    .all(limit) as unknown as SearchTerm[];
}

export function deleteSearchTerm(term: string, lang: string) {
  getDb().prepare(`DELETE FROM search_queries WHERE term = ? AND lang = ?`).run(term, lang);
}

// --- batched tags lookup for list pages ---

export function getTagsForPosts(ids: number[], lang: string): Map<number, string[]> {
  const out = new Map<number, string[]>();
  if (ids.length === 0) return out;
  const placeholders = ids.map(() => '?').join(',');
  const rows = getDb()
    .prepare(`SELECT post_id, tag FROM post_tags WHERE lang = ? AND post_id IN (${placeholders}) ORDER BY post_id, tag`)
    .all(lang, ...ids) as { post_id: number; tag: string }[];
  for (const r of rows) {
    const arr = out.get(r.post_id);
    if (arr) arr.push(r.tag);
    else out.set(r.post_id, [r.tag]);
  }
  return out;
}

// --- comments (per-card 留言) ---

export interface Comment {
  id: number;
  post_id: number;
  author: string;
  body: string;
  lang: string;
  ip: string;
  status: string;
  created_at: string;
}

export type CommentWithPost = Comment & { topic: string | null; slug: string | null };

export function insertComment(postId: number, author: string, body: string, lang: string, ip: string): number {
  const a = author.trim().slice(0, 50);
  const b = body.trim().slice(0, 1000);
  const r = getDb()
    .prepare(`INSERT INTO comments (post_id, author, body, lang, ip, status) VALUES (?, ?, ?, ?, ?, 'approved')`)
    .run(postId, a, b, lang || 'en', ip.slice(0, 64));
  return Number(r.lastInsertRowid);
}

export function listComments(postId: number): Comment[] {
  return getDb()
    .prepare(`SELECT * FROM comments WHERE post_id = ? AND status = 'approved' ORDER BY created_at ASC, id ASC`)
    .all(postId) as unknown as Comment[];
}

export function getCommentCounts(postIds: number[]): Map<number, number> {
  const out = new Map<number, number>();
  if (postIds.length === 0) return out;
  const placeholders = postIds.map(() => '?').join(',');
  const rows = getDb()
    .prepare(
      `SELECT post_id, COUNT(*) AS c FROM comments
       WHERE status = 'approved' AND post_id IN (${placeholders}) GROUP BY post_id`
    )
    .all(...postIds) as { post_id: number; c: number }[];
  for (const r of rows) out.set(r.post_id, r.c);
  return out;
}

export function listAllComments(limit = 200, status?: string): CommentWithPost[] {
  const where = status && status !== 'all' ? `WHERE c.status = ?` : '';
  const params = status && status !== 'all' ? [status, limit] : [limit];
  return getDb()
    .prepare(
      `SELECT c.*, p.topic, p.slug FROM comments c
       LEFT JOIN posts p ON p.id = c.post_id
       ${where} ORDER BY c.created_at DESC, c.id DESC LIMIT ?`
    )
    .all(...params) as unknown as CommentWithPost[];
}

export function commentStats(): { total: number; approved: number; hidden: number } {
  return getDb()
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END), 0) AS approved,
              COALESCE(SUM(CASE WHEN status = 'hidden' THEN 1 ELSE 0 END), 0) AS hidden
       FROM comments`
    )
    .get() as { total: number; approved: number; hidden: number };
}

export function setCommentStatus(id: number, status: 'approved' | 'hidden') {
  getDb().prepare(`UPDATE comments SET status = ? WHERE id = ?`).run(status, id);
}

export function deleteComment(id: number) {
  getDb().prepare(`DELETE FROM comments WHERE id = ?`).run(id);
}

// --- IP geolocation cache (admin moderation only) ---

export interface IpGeoRow {
  ip: string;
  country: string;
  region: string;
}

export function getIpGeo(ips: string[]): Map<string, IpGeoRow> {
  const out = new Map<string, IpGeoRow>();
  if (ips.length === 0) return out;
  const placeholders = ips.map(() => '?').join(',');
  const rows = getDb()
    .prepare(`SELECT ip, country, region FROM ip_geo WHERE ip IN (${placeholders})`)
    .all(...ips) as unknown as IpGeoRow[];
  for (const r of rows) out.set(r.ip, r);
  return out;
}

export function saveIpGeo(ip: string, country: string, region: string) {
  getDb()
    .prepare(
      `INSERT INTO ip_geo (ip, country, region) VALUES (?, ?, ?)
       ON CONFLICT(ip) DO UPDATE SET country = excluded.country, region = excluded.region, updated_at = datetime('now','localtime')`
    )
    .run(ip, country, region);
}

// --- wishes (许愿池) ---

export interface Wish {
  id: number;
  content: string;
  nickname: string;
  lang: string;
  ip: string;
  status: string; // 'pending' | 'done'
  post_id: number | null;
  created_at: string;
  completed_at: string | null;
}

export type WishWithPost = Wish & { slug: string | null; post_status: string | null };

export function insertWish(content: string, nickname: string, lang: string, ip: string): number {
  const r = getDb()
    .prepare(`INSERT INTO wishes (content, nickname, lang, ip, status) VALUES (?, ?, ?, ?, 'pending')`)
    .run(content.trim().slice(0, 200), nickname.trim().slice(0, 50), lang || 'en', ip.slice(0, 64));
  return Number(r.lastInsertRowid);
}

export function listPendingWishes(limit = 50): Wish[] {
  return getDb()
    .prepare(`SELECT * FROM wishes WHERE status = 'pending' ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as unknown as Wish[];
}

export function listDoneWishes(limit = 50): WishWithPost[] {
  return getDb()
    .prepare(
      `SELECT w.*, p.slug, p.status AS post_status FROM wishes w
       LEFT JOIN posts p ON p.id = w.post_id
       WHERE w.status = 'done' ORDER BY w.completed_at DESC LIMIT ?`
    )
    .all(limit) as unknown as WishWithPost[];
}

export function listAllWishes(limit = 200): WishWithPost[] {
  return getDb()
    .prepare(
      `SELECT w.*, p.slug, p.status AS post_status FROM wishes w
       LEFT JOIN posts p ON p.id = w.post_id
       ORDER BY CASE w.status WHEN 'pending' THEN 0 ELSE 1 END, w.created_at DESC LIMIT ?`
    )
    .all(limit) as unknown as WishWithPost[];
}

export function countWishes(): { total: number; pending: number; done: number } {
  return getDb()
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
              COALESCE(SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END), 0) AS done
       FROM wishes`
    )
    .get() as { total: number; pending: number; done: number };
}

export function getWishes(ids: number[]): Wish[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  return getDb().prepare(`SELECT * FROM wishes WHERE id IN (${placeholders})`).all(...ids) as unknown as Wish[];
}

/** Mark wishes fulfilled and link each to its generated post. */
export function markWishesDone(items: { id: number; postId: number }[]) {
  const stmt = getDb()
    .prepare(`UPDATE wishes SET status = 'done', post_id = ?, completed_at = datetime('now','localtime') WHERE id = ?`);
  for (const it of items) stmt.run(it.postId, it.id);
}

export function deleteWish(id: number) {
  getDb().prepare(`DELETE FROM wishes WHERE id = ?`).run(id);
}



