import { getIpGeo, saveIpGeo } from '@/lib/db';

export interface IpGeo {
  country: string;
  region: string;
}

/** Localhost / private / link-local / ULA ranges — not worth a lookup, shown as 本地. */
const PRIVATE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|fe80:|f[cd][0-9a-f]{2}:)/i;

export function isPrivateIp(ip: string): boolean {
  return !ip || PRIVATE.test(ip);
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
 * Resolve one IP to {country, region}. Primary: ip-api.com (Chinese via lang=zh-CN,
 * HTTP-only on free tier). Fallback: ipwho.is (HTTPS, English) for egress that blocks HTTP.
 * Returns null if neither resolves.
 */
async function resolveGeo(ip: string): Promise<IpGeo | null> {
  const a = await fetchJson(
    `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName&lang=zh-CN`,
    3000
  );
  if (a && a.status === 'success' && a.country) {
    return { country: String(a.country), region: String(a.regionName ?? '') };
  }
  const b = await fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}`, 3000);
  if (b && b.success && b.country) {
    return { country: String(b.country), region: String(b.region ?? '') };
  }
  return null;
}

/**
 * Cache-first geolocation for a set of IPs. Never throws. Unique non-private IPs not in
 * the ip_geo cache are resolved (concurrency capped, capped per call to stay friendly to
 * the free API) and persisted on success. Failed lookups are not cached (retried next call).
 */
export async function geoForIps(ips: string[]): Promise<Map<string, IpGeo>> {
  const out = new Map<string, IpGeo>();
  const unique = [...new Set(ips)].filter((ip) => !isPrivateIp(ip));
  if (unique.length === 0) return out;

  const cached = getIpGeo(unique);
  for (const [ip, g] of cached) out.set(ip, { country: g.country, region: g.region });

  const todo = unique.filter((ip) => !cached.has(ip)).slice(0, 60);
  for (let i = 0; i < todo.length; i += 8) {
    const batch = todo.slice(i, i + 8);
    const settled = await Promise.all(
      batch.map(async (ip): Promise<[string, IpGeo] | null> => {
        const g = await resolveGeo(ip);
        if (!g) return null;
        try {
          saveIpGeo(ip, g.country, g.region);
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
