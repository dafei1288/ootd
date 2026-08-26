import { cookies, headers } from 'next/headers';
import {
  countPendingTryon,
  getSetting,
  getTryonQuota,
  todayStr,
  todayTryonStats,
} from '../db';
import { TRYON_DEFAULTS } from '../config';
import { validateSelection } from './catalog';
import { isPrivateIp } from '../geo';

export interface TryonSettings {
  enabled: boolean;
  perUserDaily: number;
  dailyBudgetCny: number;
  maxPendingPerUser: number;
}

/** Read runtime settings with admin-overridable defaults (settings table). */
export function getTryonSettings(): TryonSettings {
  const num = (key: string, fallback: number) => {
    const v = getSetting(key);
    if (v === null || v === '') return fallback;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    enabled: (getSetting('tryon_enabled') ?? (TRYON_DEFAULTS.enabled ? '1' : '0')) !== '0',
    perUserDaily: num('tryon_per_user_daily', TRYON_DEFAULTS.perUserDaily),
    dailyBudgetCny: num('tryon_daily_budget_cny', TRYON_DEFAULTS.dailyBudgetCny),
    maxPendingPerUser: num('tryon_max_pending_per_user', TRYON_DEFAULTS.maxPendingPerUser),
  };
}

export type TryonRejectReason = 'disabled' | 'invalid' | 'quota' | 'budget' | 'busy';

export type TryonGuardResult =
  | { ok: true; settings: TryonSettings; uid: string; todayQuota: number; isDev: boolean }
  | { ok: false; reason: TryonRejectReason; settings: TryonSettings; todayQuota: number };

/**
 * Visitor identity: IP is the anti-abuse key (survives cookie clearing); when
 * no IP header is present (rare, e.g. no proxy in front), fall back to the
 * tryon_uid cookie. For localhost/private IPs (dev machine) quota is not
 * enforced so the owner can test freely — a public deployment never sees
 * private IPs.
 *
 * Note: `preCookie` is for the submit path — cookies().set() in a Server
 * Action is not visible to cookies().get() later in the SAME request, so the
 * freshly-created cookie value must be passed in explicitly.
 */
export async function clientIdentity(preCookie?: string): Promise<{ uid: string; isDev: boolean }> {
  const h = await headers();
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip')?.trim() ||
    '';
  const c = await cookies();
  const cookie = preCookie ?? c.get('tryon_uid')?.value ?? '';
  const dev = !ip || isPrivateIp(ip);
  const uid = ip ? ip : cookie || 'anon';
  return { uid, isDev: dev };
}

/** Ensure the visitor has a fingerprint cookie; returns its value (fresh or existing). */
export async function ensureTryonCookie(): Promise<string> {
  const c = await cookies();
  const existing = c.get('tryon_uid')?.value;
  if (existing) return existing;
  const fresh = crypto.randomUUID();
  c.set('tryon_uid', fresh, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return fresh;
}

/**
 * 防刷三层校验：全局开关 → 选择合法性 → 单人每日配额/并发（生产 IP 才限）
 * → 全局每日成本熔断。全部通过返回 ok，由调用方落库并异步出图。
 */
export async function checkTryonSubmit(itemIds: number[], preCookie?: string): Promise<TryonGuardResult> {
  const settings = getTryonSettings();
  const { uid, isDev } = await clientIdentity(preCookie);
  const date = todayStr();
  const todayQuota = getTryonQuota(uid, date);

  if (!settings.enabled) return { ok: false, reason: 'disabled', settings, todayQuota };
  const v = validateSelection(itemIds);
  if (!v.ok) return { ok: false, reason: 'invalid', settings, todayQuota };

  if (!isDev) {
    if (todayQuota >= settings.perUserDaily) return { ok: false, reason: 'quota', settings, todayQuota };
    if (countPendingTryon(uid) >= settings.maxPendingPerUser) return { ok: false, reason: 'busy', settings, todayQuota };
  }

  const today = todayTryonStats(date);
  if (today.cost + TRYON_DEFAULTS.estimateCnyPerImage > settings.dailyBudgetCny) {
    return { ok: false, reason: 'budget', settings, todayQuota };
  }

  return { ok: true, settings, uid, todayQuota, isDev };
}
