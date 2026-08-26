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
  'nav.tryon': { en: 'Fitting Room', zh: '试衣间', jp: '試着室', kr: '피팅룸', es: 'Probador' },

  // try-on room
  'tryon.tagline': {
    en: 'Pick a model, outfit, accessories and scene — generate your own fashion look.',
    zh: '选模特、选穿搭、选配饰、选场景，一键生成你的专属穿搭图。',
    jp: 'モデル・コーデ・小物・背景を選んで、あなただけのコーデを生成。',
    kr: '모델, 코디, 액세서리, 배경을 골라 나만의 코디를 생성하세요.',
    es: 'Elige modelo, conjunto, accesorios y escenario — genera tu propio look.',
  },
  'tryon.group.model': { en: 'Model', zh: '模特', jp: 'モデル', kr: '모델', es: 'Modelo' },
  'tryon.group.top': { en: 'Top', zh: '上衣', jp: 'トップス', kr: '상의', es: 'Parte superior' },
  'tryon.group.bottom': { en: 'Bottom', zh: '下装', jp: 'ボトムス', kr: '하의', es: 'Parte inferior' },
  'tryon.group.dress': { en: 'Dress', zh: '连衣裙', jp: 'ワンピース', kr: '원피스', es: 'Vestido' },
  'tryon.group.accessory': { en: 'Accessories', zh: '配饰', jp: '小物', kr: '액세서리', es: 'Accesorios' },
  'tryon.group.scene': { en: 'Scene', zh: '场景', jp: '背景', kr: '배경', es: 'Escenario' },
  'tryon.group.style': { en: 'Style', zh: '画风', jp: 'スタイル', kr: '스타일', es: 'Estilo' },
  'tryon.selectHint': {
    en: 'Pick a style and at least one piece of clothing, then generate.',
    zh: '选好画风和至少一件衣服，点“生成”即可。',
    jp: 'スタイルと服を選んで「生成」を押すだけ。',
    kr: '스타일과 옷을 고르고 "생성"을 누르세요.',
    es: 'Elige un estilo y al menos una prenda, luego genera.',
  },
  'tryon.accessoryHint': { en: 'Up to 3', zh: '最多 3 件', jp: '最大3つ', kr: '최대 3개', es: 'Máx. 3' },
  'tryon.generate': { en: 'Generate Look', zh: '生成穿搭图', jp: 'コーデ生成', kr: '코디 생성', es: 'Generar look' },
  'tryon.generating': { en: 'Generating…', zh: '生成中…', jp: '生成中…', kr: '생성 중…', es: 'Generando…' },
  'tryon.remaining': {
    en: 'Remaining today: {n}',
    zh: '今日剩余：{n} 次',
    jp: '今日の残り：{n}回',
    kr: '오늘 남은 횟수: {n}회',
    es: 'Quedan hoy: {n}',
  },
  'tryon.download': { en: 'Download', zh: '下载原图', jp: 'ダウンロード', kr: '다운로드', es: 'Descargar' },
  'tryon.history': { en: 'My looks', zh: '我的穿搭', jp: 'マイコーデ', kr: '내 코디', es: 'Mis looks' },
  'tryon.historyEmpty': {
    en: 'No looks yet — generate your first one!',
    zh: '还没有生成过，快去生成第一张吧。',
    jp: 'まだ生成していません。最初の一枚を！',
    kr: '아직 생성한 코디가 없어요. 첫 번째를 만들어보세요!',
    es: 'Aún sin looks — ¡genera el primero!',
  },
  'tryon.err.quota': {
    en: 'You have reached today’s free limit. Come back tomorrow!',
    zh: '今日免费次数已用完，明天再来吧。',
    jp: '今日の無料回数を使い切りました。また明日！',
    kr: '오늘 무료 횟수를 모두 사용했어요. 내일 다시 오세요!',
    es: 'Has alcanzado el límite gratuito de hoy. ¡Vuelve mañana!',
  },
  'tryon.err.budget': {
    en: 'Too many requests right now, please try again later.',
    zh: '当前生成量较大，请稍后再试。',
    jp: '混雑しています。しばらくしてからお試しください。',
    kr: '지금은 요청이 많아요. 잠시 후 다시 시도해 주세요.',
    es: 'Demasiadas peticiones ahora mismo, inténtalo más tarde.',
  },
  'tryon.err.busy': {
    en: 'You have a look generating — wait for it to finish.',
    zh: '你有一张图正在生成中，请稍等。',
    jp: '生成中のコーデがあります。お待ちください。',
    kr: '생성 중인 코디가 있어요. 잠시 기다려 주세요.',
    es: 'Tienes un look generándose — espera a que termine.',
  },
  'tryon.err.disabled': {
    en: 'The fitting room is temporarily closed.',
    zh: '试衣间暂时关闭，请稍后再来。',
    jp: '試着室は一時的にクローズ中です。',
    kr: '피팅룸이 일시적으로 닫혔어요.',
    es: 'El probador está temporalmente cerrado.',
  },
  'tryon.err.invalid': {
    en: 'Please select a style and at least one piece of clothing.',
    zh: '请先选择画风和至少一件衣服。',
    jp: 'スタイルと服を選んでください。',
    kr: '스타일과 옷을 선택해 주세요.',
    es: 'Selecciona un estilo y al menos una prenda.',
  },
  'tryon.failed': {
    en: 'Generation failed, please try again.',
    zh: '生成失败，请重试。',
    jp: '生成に失敗しました。もう一度お試しください。',
    kr: '생성에 실패했어요. 다시 시도해 주세요.',
    es: 'Error al generar, inténtalo de nuevo.',
  },
  'tryon.retry': { en: 'Try again', zh: '再试一次', jp: 'もう一度', kr: '다시 시도', es: 'Reintentar' },
  'tryon.publish': { en: 'Publish as card', zh: '发布为卡片', jp: 'コーデを公開', kr: '코디로 게시', es: 'Publicar como tarjeta' },
  'tryon.publishing': { en: 'Publishing…', zh: '发布中…', jp: '公開中…', kr: '게시 중…', es: 'Publicando…' },
  'tryon.publishTitle': {
    en: 'Title for this look (optional)',
    zh: '给这套穿搭起个标题（选填）',
    jp: 'このコーデのタイトル（任意）',
    kr: '코디 제목 (선택)',
    es: 'Título para este look (opcional)',
  },
  'tryon.publishSubmitted': {
    en: 'Saved! Your look is now waiting for review.',
    zh: '已经收录，等待审核通过',
    jp: '受理しました。審査待ちです',
    kr: '접수되었습니다. 검토 대기 중입니다',
    es: '¡Recibido! Tu look está pendiente de revisión.',
  },
  'tryon.err.publish': { en: 'Publish failed, please try again.', zh: '发布失败，请稍后再试。', jp: '公開に失敗しました。もう一度お試しください。', kr: '게시에 실패했어요. 다시 시도해 주세요.', es: 'Error al publicar, inténtalo de nuevo.' },
  'tryon.err.alreadyPublished': { en: 'This look is already published.', zh: '这套穿搭已经发布过了。', jp: 'このコーデはすでに公開済みです。', kr: '이 코디는 이미 게시되었어요.', es: 'Este look ya está publicado.' },
  'tryon.err.notReady': { en: 'Wait for the image to finish generating.', zh: '图片还在生成中，请稍等。', jp: '画像の生成が終わるまでお待ちください。', kr: '이미지 생성이 끝날 때까지 기다려 주세요.', es: 'Espera a que termine de generarse la imagen.' },
  'tryon.err.notYours': { en: 'You can only publish looks you generated.', zh: '只能发布自己生成的穿搭。', jp: '自分で生成したコーデのみ公開できます。', kr: '직접 생성한 코디만 게시할 수 있어요.', es: 'Solo puedes publicar looks que hayas generado.' },

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
