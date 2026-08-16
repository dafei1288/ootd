import Script from 'next/script';
import { listEnabledSnippets } from '@/lib/db';

/**
 * Injects admin-managed third-party snippets (analytics / ads) into public pages.
 * Snippets live in the `site_snippets` table and are edited from the admin UI,
 * so swapping Baidu Tongji / AdSense / etc. never touches code.
 *
 * Vendor snippets are virtually all `<script src>` or inline `<script>`. Per HTML
 * spec, a `<script>` inserted via innerHTML does NOT execute, so we extract scripts
 * and hand them to next/script (which does execute); any leftover markup (e.g. an
 * AdSense `<ins>`) is rendered as inert HTML.
 */
type Segment = { type: 'src' | 'inline' | 'html'; value: string };

function parseSnippet(raw: string): Segment[] {
  const segs: Segment[] = [];
  let rest = '';
  let last = 0;
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) rest += raw.slice(last, m.index);
    last = m.index + m[0].length;
    const srcMatch = (m[1] || '').match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (srcMatch) {
      segs.push({ type: 'src', value: srcMatch[1] });
    } else if ((m[2] || '').trim()) {
      segs.push({ type: 'inline', value: m[2] });
    }
  }
  if (last < raw.length) rest += raw.slice(last);
  if (rest.trim()) segs.push({ type: 'html', value: rest });
  return segs;
}

export default function SiteSnippets() {
  const snippets = listEnabledSnippets();
  if (snippets.length === 0) return null;

  const nodes: React.ReactNode[] = [];
  for (const s of snippets) {
    parseSnippet(s.content).forEach((seg, i) => {
      const key = `snippet-${s.id}-${i}`;
      if (seg.type === 'src') {
        nodes.push(<Script key={key} src={seg.value} strategy="afterInteractive" />);
      } else if (seg.type === 'inline') {
        nodes.push(
          <Script key={key} id={key} strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: seg.value }} />
        );
      } else {
        nodes.push(<div key={key} dangerouslySetInnerHTML={{ __html: seg.value }} />);
      }
    });
  }
  return <>{nodes}</>;
}
