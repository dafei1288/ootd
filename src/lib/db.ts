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
  tryon_job_id: number | null;
}

function init(): DatabaseSync {
  const d = new DatabaseSync(path.join(dataDir, 'app.db'));
  d.exec(`
    -- WAL 在 Docker bind mount（Windows）上重启容器时会丢未合并数据，改用 TRUNCATE：
    -- 事务提交即写主库文件，重启容器数据必定还在（低并发场景足够）
    PRAGMA journal_mode = TRUNCATE;
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
      ip           TEXT PRIMARY KEY,
      country      TEXT NOT NULL DEFAULT '',
      country_code TEXT NOT NULL DEFAULT '',
      region       TEXT NOT NULL DEFAULT '',
      city         TEXT NOT NULL DEFAULT '',
      updated_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
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
    CREATE TABLE IF NOT EXISTS tryon_items (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      type             TEXT NOT NULL,
      name             TEXT NOT NULL,
      emoji            TEXT NOT NULL DEFAULT '',
      prompt           TEXT NOT NULL,
      image_path       TEXT,
      image_path_anime TEXT,
      image_path_real  TEXT,
      sort_order       INTEGER NOT NULL DEFAULT 0,
      enabled          INTEGER NOT NULL DEFAULT 1,
      created_at       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_tryon_items_type ON tryon_items(type, enabled);
    CREATE TABLE IF NOT EXISTS tryon_jobs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      uid        TEXT NOT NULL DEFAULT '',
      items_json TEXT NOT NULL,
      prompt     TEXT NOT NULL,
      image_path TEXT,
      status     TEXT NOT NULL DEFAULT 'pending',
      error      TEXT,
      cost       REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      done_at    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tryon_jobs_uid ON tryon_jobs(uid, id);
    CREATE TABLE IF NOT EXISTS tryon_quota (
      uid   TEXT NOT NULL,
      date  TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (uid, date)
    );
  `)
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
  try {
    d.exec(`ALTER TABLE tryon_items ADD COLUMN names_json TEXT`);
  } catch {
    /* column already exists */
  }
  // 素材图：素材可视化（admin 上传 / 后续批量生成），生成时可作参考
  try {
    d.exec(`ALTER TABLE tryon_items ADD COLUMN image_path TEXT`);
  } catch {
    /* column already exists */
  }
  // 按画风拆分的参考图：动漫风 / 真人风各一张，生成时按选中画风取用
  try {
    d.exec(`ALTER TABLE tryon_items ADD COLUMN image_path_anime TEXT`);
  } catch {
    /* column already exists */
  }
  try {
    d.exec(`ALTER TABLE tryon_items ADD COLUMN image_path_real TEXT`);
  } catch {
    /* column already exists */
  }
  try {
    d.exec(`ALTER TABLE posts ADD COLUMN tryon_job_id INTEGER`);
  } catch {
    /* column already exists */
  }
  // ip_geo 老库迁移：补充 country_code / city 列（国旗与城市展示用）
  try {
    d.exec(`ALTER TABLE ip_geo ADD COLUMN country_code TEXT NOT NULL DEFAULT ''`);
  } catch {
    /* column already exists */
  }
  try {
    d.exec(`ALTER TABLE ip_geo ADD COLUMN city TEXT NOT NULL DEFAULT ''`);
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

/** 创建试衣间卡片（用户发布或管理员代发）。status: 'review' | 'published'。 */
export function insertTryonPost(opts: {
  jobId: number;
  topic: string;
  imagePath: string;
  titleJson: string;
  tagsJson: string;
  descJson: string | null;
  bodyJson: string | null;
  status: 'review' | 'published';
  slug?: string;
}): number {
  const r = getDb()
    .prepare(
      `INSERT INTO posts (topic, source, status, slug, image_path, title_json, tags_json, desc_json, body_json, tryon_job_id, published_at)
       VALUES (?, 'tryon', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      opts.topic.slice(0, 500),
      opts.status,
      opts.slug ?? null,
      opts.imagePath,
      opts.titleJson,
      opts.tagsJson,
      opts.descJson,
      opts.bodyJson,
      opts.jobId,
      opts.status === 'published' ? new Date().toISOString() : null
    );
  return Number(r.lastInsertRowid);
}

/** 待审核卡片（试衣间用户发布）。 */
export function listReviewPosts(): Post[] {
  return getDb()
    .prepare(`SELECT * FROM posts WHERE status = 'review' ORDER BY id DESC LIMIT 100`)
    .all() as unknown as Post[];
}

/** 已拒绝（不发布但保留）的试衣间卡片。 */
export function listRejectedPosts(): Post[] {
  return getDb()
    .prepare(`SELECT * FROM posts WHERE status = 'rejected' ORDER BY id DESC LIMIT 100`)
    .all() as unknown as Post[];
}

/** 更新卡片内容（重新提交时替换标题/标签/正文等）。 */
export function updatePostContent(
  id: number,
  fields: Partial<Pick<Post, 'title_json' | 'tags_json' | 'desc_json' | 'body_json' | 'topic' | 'slug' | 'published_at'>>
) {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  for (const [col, val] of Object.entries(fields)) {
    sets.push(`${col} = ?`);
    params.push(val === undefined ? null : String(val).slice(0, 4000));
  }
  if (sets.length === 0) return;
  params.push(id);
  getDb().prepare(`UPDATE posts SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

/** 该试衣间任务是否已发布过卡片（防止重复发布）。 */
export function tryonJobPublished(jobId: number): boolean {
  const r = getDb().prepare(`SELECT id FROM posts WHERE tryon_job_id = ? LIMIT 1`).get(jobId) as
    | { id: number }
    | undefined;
  return !!r;
}

export function setPostStatus(id: number, status: string) {
  getDb().prepare(`UPDATE posts SET status = ? WHERE id = ?`).run(status, id);
}

export function getTryonPostByJob(jobId: number): Post | undefined {
  return getDb().prepare(`SELECT * FROM posts WHERE tryon_job_id = ? LIMIT 1`).get(jobId) as Post | undefined;
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

/** 给卡片追加一个标签（不覆盖现有标签），用于给试衣间卡片打统一标记。 */
export function addPostTag(id: number, lang: string, tag: string, kind = 'other') {
  const t = tag.trim();
  if (!t) return;
  getDb().prepare(`INSERT OR IGNORE INTO post_tags (post_id, lang, tag, kind) VALUES (?, ?, ?, ?)`).run(id, lang, t.slice(0, 60), kind);
}

/** 试衣间统一可见标签（方便以后按标签迁移/筛选）。 */
export function addTryonSourceTag(id: number) {
  addPostTag(id, 'en', 'Fitting Room', 'other');
  addPostTag(id, 'zh', '试衣间', 'other');
  addPostTag(id, 'jp', '試着室', 'other');
  addPostTag(id, 'kr', '피팅룸', 'other');
  addPostTag(id, 'es', 'Probador', 'other');
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

export function insertLog(e: Omit<LLMLog, 'id' | 'ts'>): number {
  const r = getDb().prepare(
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
  return Number(r.lastInsertRowid);
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
              SUM(CASE WHEN (step = 'image' OR step = 'tryon_image') AND error IS NULL THEN 1 ELSE 0 END) AS images
       FROM llm_logs WHERE error IS NULL GROUP BY model`
    )
    .all() as unknown as ModelUsage[];
}

export function logCost(l: LLMLog): number | null {
  if (l.error) return null;
  if (l.step === 'image' || l.step === 'tryon_image') {
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
  country_code: string;
  region: string;
  city: string;
}

export function getIpGeo(ips: string[]): Map<string, IpGeoRow> {
  const out = new Map<string, IpGeoRow>();
  if (ips.length === 0) return out;
  const placeholders = ips.map(() => '?').join(',');
  const rows = getDb()
    .prepare(`SELECT ip, country, country_code, region, city FROM ip_geo WHERE ip IN (${placeholders})`)
    .all(...ips) as unknown as IpGeoRow[];
  for (const r of rows) out.set(r.ip, r);
  return out;
}

export function saveIpGeo(ip: string, country: string, region: string, city = '', countryCode = '') {
  getDb()
    .prepare(
      `INSERT INTO ip_geo (ip, country, country_code, region, city) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(ip) DO UPDATE SET country = excluded.country, country_code = excluded.country_code,
         region = excluded.region, city = excluded.city, updated_at = datetime('now','localtime')`
    )
    .run(ip, country, countryCode, region, city);
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

// --- try-on room (试衣间) ---

export type TryonItemType = 'model' | 'top' | 'bottom' | 'dress' | 'accessory' | 'scene' | 'style';

export const TRYON_ITEM_TYPES: TryonItemType[] = ['model', 'top', 'bottom', 'dress', 'accessory', 'scene', 'style'];

export interface TryonItem {
  id: number;
  type: TryonItemType;
  name: string;
  emoji: string;
  prompt: string;
  image_path: string | null;
  image_path_anime: string | null;
  image_path_real: string | null;
  sort_order: number;
  enabled: number; // 0 | 1
  names_json: string | null; // MultiLang JSON, e.g. {"en":"White Shirt","zh":"白衬衫",...}
  created_at: string;
}

export interface TryonJob {
  id: number;
  uid: string;
  items_json: string;
  prompt: string;
  image_path: string | null;
  status: string; // 'pending' | 'done' | 'failed'
  error: string | null;
  cost: number | null;
  created_at: string;
  done_at: string | null;
}

export function listTryonItems(type?: TryonItemType | 'all'): TryonItem[] {
  const where = type && type !== 'all' ? `WHERE type = ?` : '';
  const params = type && type !== 'all' ? [type] : [];
  return getDb()
    .prepare(`SELECT * FROM tryon_items ${where} ORDER BY type, sort_order, id`)
    .all(...params) as unknown as TryonItem[];
}

export function listEnabledTryonItems(type?: TryonItemType): TryonItem[] {
  const where = type ? `WHERE type = ? AND enabled = 1` : `WHERE enabled = 1`;
  const params = type ? [type] : [];
  return getDb()
    .prepare(`SELECT * FROM tryon_items ${where} ORDER BY type, sort_order, id`)
    .all(...params) as unknown as TryonItem[];
}

export function getTryonItem(id: number): TryonItem | undefined {
  return getDb().prepare(`SELECT * FROM tryon_items WHERE id = ?`).get(id) as TryonItem | undefined;
}

/** Only returns items that still exist and are enabled — never trusts client ids. */
export function getEnabledTryonItems(ids: number[]): TryonItem[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  return getDb()
    .prepare(`SELECT * FROM tryon_items WHERE enabled = 1 AND id IN (${placeholders})`)
    .all(...ids) as unknown as TryonItem[];
}

export function countTryonItems(): number {
  return (getDb().prepare(`SELECT COUNT(*) AS c FROM tryon_items`).get() as { c: number }).c;
}

export function insertTryonItem(
  type: TryonItemType,
  name: string,
  prompt: string,
  emoji = '',
  sortOrder = 0,
  namesJson: string | null = null,
  imagePath: string | null = null
): number {
  const r = getDb()
    .prepare(
      `INSERT INTO tryon_items (type, name, emoji, prompt, sort_order, names_json, image_path) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      type,
      name.trim().slice(0, 60),
      emoji.trim().slice(0, 8),
      prompt.trim().slice(0, 500),
      sortOrder,
      namesJson ? namesJson.slice(0, 2000) : null,
      imagePath
    );
  return Number(r.lastInsertRowid);
}

export function updateTryonItem(id: number, fields: Partial<Pick<TryonItem, 'name' | 'prompt' | 'emoji' | 'sort_order' | 'enabled' | 'names_json' | 'image_path' | 'image_path_anime' | 'image_path_real'>>) {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if (fields.name !== undefined) {
    sets.push(`name = ?`);
    params.push(fields.name.trim().slice(0, 60));
  }
  if (fields.prompt !== undefined) {
    sets.push(`prompt = ?`);
    params.push(fields.prompt.trim().slice(0, 500));
  }
  if (fields.emoji !== undefined) {
    sets.push(`emoji = ?`);
    params.push(fields.emoji.trim().slice(0, 8));
  }
  if (fields.sort_order !== undefined) {
    sets.push(`sort_order = ?`);
    params.push(fields.sort_order);
  }
  if (fields.names_json !== undefined) {
    sets.push(`names_json = ?`);
    params.push(fields.names_json ? fields.names_json.slice(0, 2000) : null);
  }
  if (fields.enabled !== undefined) {
    sets.push(`enabled = ?`);
    params.push(fields.enabled ? 1 : 0);
  }
  if (fields.image_path !== undefined) {
    sets.push(`image_path = ?`);
    params.push(fields.image_path);
  }
  if (fields.image_path_anime !== undefined) {
    sets.push(`image_path_anime = ?`);
    params.push(fields.image_path_anime);
  }
  if (fields.image_path_real !== undefined) {
    sets.push(`image_path_real = ?`);
    params.push(fields.image_path_real);
  }
  if (sets.length === 0) return;
  params.push(id);
  getDb().prepare(`UPDATE tryon_items SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

export function setTryonItemEnabled(id: number, enabled: boolean) {
  getDb().prepare(`UPDATE tryon_items SET enabled = ? WHERE id = ?`).run(enabled ? 1 : 0, id);
}

export function deleteTryonItem(id: number) {
  getDb().prepare(`DELETE FROM tryon_items WHERE id = ?`).run(id);
}

export function insertTryonJob(uid: string, itemsJson: string, prompt: string): number {
  const r = getDb()
    .prepare(`INSERT INTO tryon_jobs (uid, items_json, prompt, status) VALUES (?, ?, ?, 'pending')`)
    .run(uid.slice(0, 128), itemsJson.slice(0, 2000), prompt.slice(0, 4000));
  return Number(r.lastInsertRowid);
}

export function getTryonJob(id: number): TryonJob | undefined {
  return getDb().prepare(`SELECT * FROM tryon_jobs WHERE id = ?`).get(id) as TryonJob | undefined;
}

export function updateTryonJob(
  id: number,
  patch: Partial<Pick<TryonJob, 'status' | 'image_path' | 'error' | 'cost' | 'done_at'>>
) {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if (patch.status !== undefined) {
    sets.push(`status = ?`);
    params.push(patch.status);
  }
  if (patch.image_path !== undefined) {
    sets.push(`image_path = ?`);
    params.push(patch.image_path);
  }
  if (patch.error !== undefined) {
    sets.push(`error = ?`);
    params.push(patch.error);
  }
  if (patch.cost !== undefined) {
    sets.push(`cost = ?`);
    params.push(patch.cost);
  }
  if (patch.done_at !== undefined) {
    sets.push(`done_at = ?`);
    params.push(patch.done_at);
  }
  if (sets.length === 0) return;
  params.push(id);
  getDb().prepare(`UPDATE tryon_jobs SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

export function listTryonJobs(uid?: string, limit = 30): TryonJob[] {
  const where = uid ? `WHERE uid = ?` : '';
  const params = uid ? [uid, limit] : [limit];
  return getDb()
    .prepare(`SELECT * FROM tryon_jobs ${where} ORDER BY id DESC LIMIT ?`)
    .all(...params) as unknown as TryonJob[];
}

export function countPendingTryon(uid: string): number {
  return (getDb().prepare(`SELECT COUNT(*) AS c FROM tryon_jobs WHERE uid = ? AND status = 'pending'`).get(uid) as { c: number }).c;
}

export function deleteTryonJob(id: number) {
  getDb().prepare(`DELETE FROM tryon_jobs WHERE id = ?`).run(id);
}

/** Local date key YYYY-MM-DD used for per-user daily quota. */
export function todayStr(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function getTryonQuota(uid: string, date: string): number {
  const r = getDb().prepare(`SELECT count FROM tryon_quota WHERE uid = ? AND date = ?`).get(uid, date) as
    | { count: number }
    | undefined;
  return r?.count ?? 0;
}

export function bumpTryonQuota(uid: string, date: string) {
  getDb()
    .prepare(
      `INSERT INTO tryon_quota (uid, date, count) VALUES (?, ?, 1)
       ON CONFLICT(uid, date) DO UPDATE SET count = count + 1`
    )
    .run(uid, date);
}

/** Today's tryon cost (done jobs only) — feeds the global daily budget check. */
export function todayTryonStats(date = todayStr()): { jobs: number; cost: number } {
  return getDb()
    .prepare(
      `SELECT COUNT(*) AS jobs, COALESCE(SUM(CASE WHEN status = 'done' THEN cost ELSE 0 END), 0) AS cost
       FROM tryon_jobs WHERE date(created_at) = ?`
    )
    .get(date) as { jobs: number; cost: number };
}



