import { getIpGeo, saveIpGeo } from '@/lib/db';

export interface IpGeo {
  country: string;
  region: string;
  city?: string;
  countryCode?: string;
}

/** Localhost / private / link-local / ULA ranges — not worth a lookup, shown as 本地. */
const PRIVATE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|fe80:|f[cd][0-9a-f]{2}:|::ffff:(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.))/i;

export function isPrivateIp(ip: string): boolean {
  return !ip || PRIVATE.test(ip);
}

/**
 * 失败负缓存（进程内）：解析失败的 IP 短期内不重试，避免每次打开后台都重复
 * 请求外部 API（免费额度有限，且失败的往往是无效/骚扰 IP）。1 小时后自动过期。
 */
const NEGATIVE_TTL_MS = 60 * 60 * 1000;
const failedAt = new Map<string, number>();

function isNegativelyCached(ip: string): boolean {
  const t = failedAt.get(ip);
  if (t === undefined) return false;
  if (Date.now() - t > NEGATIVE_TTL_MS) {
    failedAt.delete(ip);
    return false;
  }
  return true;
}

// 防止 Map 无限增长：超过阈值时清掉最老的一半
function pruneNegativeCache() {
  if (failedAt.size < 5000) return;
  const sorted = [...failedAt.entries()].sort((a, b) => a[1] - b[1]);
  for (const [ip] of sorted.slice(0, Math.floor(sorted.length / 2))) failedAt.delete(ip);
}

async function fetchJson(url: string, ms: number): Promise<Record<string, unknown> | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'ootd-admin/1.0' } });
    clearTimeout(t);
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null; // network error / timeout / bad json
  }
}

/**
 * Resolve one IP to {country, region, city?, countryCode?}.
 * Primary: ip-api.com (Chinese via lang=zh-CN, HTTP-only on free tier, 45 req/min).
 * Fallback: ipwho.is (HTTPS, English).
 * Both are fired in parallel and the first success wins — 某些部署环境屏蔽了 ip-api 的
 * HTTP 出口，串行重试会白白多等 2.5s；并行则两个里总有一个能快速返回。
 * Returns null if neither resolves.
 */
async function resolveGeo(ip: string): Promise<IpGeo | null> {
  const [aR, bR] = await Promise.all([
    fetchJson(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city&lang=zh-CN`,
      2500
    ),
    fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}`, 2500),
  ]);
  if (aR && aR.status === 'success' && aR.country) {
    return {
      country: String(aR.country),
      region: String(aR.regionName ?? ''),
      city: aR.city ? String(aR.city) : undefined,
      countryCode: aR.countryCode ? String(aR.countryCode) : undefined,
    };
  }
  if (bR && bR.success && bR.country) {
    return {
      country: String(bR.country),
      region: String(bR.region ?? ''),
      city: bR.city ? String(bR.city) : undefined,
      countryCode: bR.country_code ? String(bR.country_code) : undefined,
    };
  }
  return null;
}

/**
 * Cache-first geolocation for a set of IPs. Never throws. Unique non-private IPs not in
 * the ip_geo cache are resolved (concurrency capped; per-call cap 45 to stay under the
 * free API's 45 req/min limit) and persisted on success. Failures are remembered in a
 * short-lived in-memory negative cache (retried at most once per hour).
 */
export async function geoForIps(ips: string[]): Promise<Map<string, IpGeo>> {
  const out = new Map<string, IpGeo>();
  const unique = [...new Set(ips)].filter((ip) => !isPrivateIp(ip));
  if (unique.length === 0) return out;

  const cached = getIpGeo(unique);
  for (const [ip, g] of cached) {
    out.set(ip, { country: g.country, region: g.region, city: g.city || undefined, countryCode: g.country_code || undefined });
  }

  const todo = unique.filter((ip) => !cached.has(ip) && !isNegativelyCached(ip)).slice(0, 45);
  for (let i = 0; i < todo.length; i += 8) {
    const batch = todo.slice(i, i + 8);
    const settled = await Promise.all(
      batch.map(async (ip): Promise<[string, IpGeo] | null> => {
        const g = await resolveGeo(ip);
        if (!g) {
          pruneNegativeCache();
          failedAt.set(ip, Date.now());
          return null;
        }
        try {
          saveIpGeo(ip, g.country, g.region, g.city ?? '', g.countryCode ?? '');
        } catch {
          /* ignore cache write failure */
        }
        return [ip, g];
      })
    );
    for (const r of settled) if (r) out.set(r[0], r[1]);
  }
  return out;
}
