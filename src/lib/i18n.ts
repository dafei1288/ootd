import type { Lang, MultiLang } from './config';

/**
 * UI string dictionary for public-facing chrome (nav, buttons, labels, empty states).
 * Post *content* is localized separately via the MultiLang JSON columns (see parseMulti);
 * this is only for hand-written UI text. The admin panel is intentionally Chinese-only.
 *
 * Every entry must specify all 5 languages (enforced by `satisfies Record<string, MultiLang>`).
 * Translations for jp/kr/es are best-effort — refine as needed.
 */
const STRINGS = {
  // header / nav
  'nav.wish': { en: 'Wish Pool', zh: '许愿池', jp: 'リクエスト', kr: '리퀘스트', es: 'Deseos' },

  // generic UI bits reused across features
  'ui.anon': { en: 'Anonymous', zh: '匿名', jp: '匿名', kr: '익명', es: 'Anónimo' },
  'ui.nickname': { en: 'Nickname (optional)', zh: '昵称（选填）', jp: 'ニックネーム（任意）', kr: '닉네임 (선택)', es: 'Apodo (opcional)' },
  'ui.view': { en: 'View →', zh: '查看 →', jp: '見る →', kr: '보기 →', es: 'Ver →' },
  'ui.generating': { en: 'Generating…', zh: '生成中…', jp: '生成中…', kr: '생성 중…', es: 'Generando…' },

  // wish pool
  'wish.intro': {
    en: 'Wish for an outfit you want to see — which character, which style. We will pick and generate them.',
    zh: '许下你想看的穿搭——想看谁、什么风格，我们会挑选生成。',
    jp: '見たいコーデをリクエスト——誰の・どんなスタイルか。選んで生成します。',
    kr: '보고 싶은 코디를 리퀘스트하세요 — 누구의, 어떤 스타일인지. 골라서 생성해 드려요.',
    es: 'Pide el conjunto que quieres ver —qué personaje, qué estilo. Los elegiremos y generaremos.',
  },
  'wish.content': { en: 'Outfit you want to see', zh: '想看的穿搭', jp: '見たいコーデ', kr: '보고 싶은 코디', es: 'Conjunto que quieres ver' },
  'wish.placeholder': {
    en: 'e.g. Rei Ayanami in a kimono-style outfit',
    zh: '例：想看绫波丽的和风穿搭',
    jp: '例：綾波レイの和風コーデ',
    kr: '예: 아야나미 레이의 일본풍 코디',
    es: 'ej. Rei Ayanami con estilo kimono',
  },
  'wish.submit': { en: 'Make a wish', zh: '许愿', jp: 'リクエスト', kr: '리퀘스트', es: 'Pedir' },
  'wish.submitting': { en: 'Wishing…', zh: '许愿中…', jp: '送信中…', kr: '리퀘스트 중…', es: 'Enviando…' },
  'wish.done': { en: 'Granted wishes', zh: '已完成的许愿', jp: '叶ったリクエスト', kr: '완료된 리퀘스트', es: 'Deseos cumplidos' },
  'wish.doneEmpty': {
    en: 'No wishes granted yet.',
    zh: '还没有完成的许愿。',
    jp: 'まだ叶ったリクエストはありません。',
    kr: '완료된 리퀘스트가 아직 없어요.',
    es: 'Aún no hay deseos cumplidos.',
  },
  'wish.pending': { en: 'Pending wishes', zh: '尚未完成的许愿', jp: '未対応のリクエスト', kr: '대기 중인 리퀘스트', es: 'Deseos pendientes' },
  'wish.pendingEmpty': {
    en: 'No pending wishes — be the first to make one!',
    zh: '暂无待处理的许愿，快来许第一个吧。',
    jp: '未対応のリクエストはありません。最初のひとつを！',
    kr: '대기 중인 리퀘스트가 없어요. 첫 리퀘스트를 남겨보세요!',
    es: 'No hay deseos pendientes — ¡pide el primero!',
  },

  // comments
  'comments.title': { en: 'Comments', zh: '留言', jp: 'コメント', kr: '댓글', es: 'Comentarios' },
  'comments.empty': {
    en: 'No comments yet — be the first!',
    zh: '还没有留言，来抢沙发吧。',
    jp: 'まだコメントはありません。最初のひとつを！',
    kr: '아직 댓글이 없어요. 첫 댓글을 남겨보세요!',
    es: 'Aún sin comentarios — ¡se el primero!',
  },
  'comments.body': { en: 'Comment', zh: '留言', jp: 'コメント', kr: '댓글', es: 'Comentario' },
  'comments.placeholder': {
    en: 'Write a comment…',
    zh: '写下你的留言…',
    jp: 'コメントを書く…',
    kr: '댓글을 남겨보세요…',
    es: 'Escribe un comentario…',
  },
  'comments.submit': { en: 'Post comment', zh: '发布留言', jp: 'コメントする', kr: '댓글 달기', es: 'Publicar' },
  'comments.submitting': { en: 'Posting…', zh: '发布中…', jp: '送信中…', kr: '게시 중…', es: 'Publicando…' },

  // like / share (client buttons)
  'like.aria': { en: 'Like', zh: '点赞', jp: 'いいね', kr: '좋아요', es: 'Me gusta' },
  'share.label': { en: 'Share', zh: '分享', jp: '共有', kr: '공유', es: 'Compartir' },
  'share.copied': { en: 'Link copied', zh: '已复制链接', jp: 'リンクをコピーしました', kr: '링크 복사됨', es: 'Enlace copiado' },
  'share.failed': { en: 'Copy failed', zh: '复制失败', jp: 'コピー失敗', kr: '복사 실패', es: 'Error al copiar' },

  // home
  'home.search': { en: 'Search...', zh: '搜索…', jp: '検索…', kr: '검색…', es: 'Buscar...' },
  'home.empty': { en: 'No posts yet.', zh: '暂无内容。', jp: 'まだ投稿がありません。', kr: '아직 게시물이 없어요.', es: 'Aún no hay publicaciones.' },
} satisfies Record<string, MultiLang>;

export type UiKey = keyof typeof STRINGS;

/** Look up a UI string for the given language, falling back to English. */
export function t(key: UiKey, lang: Lang): string {
  const entry = STRINGS[key];
  return entry[lang] ?? entry.en;
}
