import { ctripNavigationProfiles } from "./ctrip-navigation-profiles.js";
// Navigation metadata comes only from a successfully inspected, native Ctrip search.
// Keep opaque platform fields intact: the reduced URL failed real context checks.
export function contextMatches(result, task) {
  return (
    result?.context_verified === true &&
    ["platform", "city", "checkin", "checkout", "keyword"].every(
      (k) => result.context?.[k] === task[k],
    )
  );
}
export function navigationProfile(result, task, now = Date.now()) {
  if (
    task.platform !== "ctrip" ||
    !contextMatches(result, task) ||
    result.unparsed_cards > 0
  )
    return null;
  try {
    const u = new URL(result.url),
      p = u.searchParams;
    if (
      u.origin !== "https://m.ctrip.com" ||
      u.pathname !== "/webapp/hotels/hotelsearch/listPage" ||
      u.username ||
      u.password ||
      u.hash ||
      p.has("cache-key") ||
      p.has("cacheKey")
    )
      return null;
    if (
      JSON.parse(p.get("d-name"))[0] !== task.city ||
      !/^\d+$/.test(p.get("d-city")) ||
      result.platform_city_id !== p.get("d-city") ||
      JSON.parse(p.get("s-keyword"))[0] !== task.keyword ||
      ["c-in", "c-out"].some((k) => p.getAll(k).length !== 1)
    )
      return null;
    const keyword = JSON.parse(p.get("s-keyword"));
    const filters = JSON.parse(p.get("s-filters"));
    if (!filters.some((f) => f[0] === task.keyword && f[1] === keyword[1]))
      return null;
    return {
      platform: task.platform,
      city_name: task.city,
      platform_city_id: p.get("d-city"),
      keyword: task.keyword,
      keyword_type: keyword[2],
      keyword_id: keyword[1],
      url: result.url,
      verified_at: now,
    };
  } catch {
    return null;
  }
}
export function fastNavigation(task, profiles = [], now = Date.now()) {
  const profile = profiles.find(
    (p) =>
      p.platform === task.platform &&
      p.city_name === task.city &&
      p.keyword === task.keyword,
  );
  if (
    !profile ||
    !Number.isFinite(profile.verified_at) ||
    now - profile.verified_at < 0 ||
    now - profile.verified_at > 86400000
  )
    return null;
  return navigationUrl(task, profile, now);
}
function navigationUrl(task, profile, now) {
  // Revalidate storage and context metadata, rather than trusting a cached URL string.
  const original = new URL(profile.url);
  const base = {
    ...task,
    checkin: original.searchParams.get("c-in"),
    checkout: original.searchParams.get("c-out"),
  };
  if (
    !navigationProfile(
      {
        url: profile.url,
        context_verified: true,
        context: base,
        platform_city_id: profile.platform_city_id,
      },
      base,
      now,
    )
  )
    return null;
  if (
    ![task.checkin, task.checkout].every((d) =>
      /^\d{4}-\d{2}-\d{2}$/.test(d),
    ) ||
    task.checkout <= task.checkin
  )
    return null;
  // Do not reserialize opaque nested platform JSON or replay date-bound cache keys.
  return profile.url
    .replace(/([?&]c-in=)[^&]*/, `$1${task.checkin}`)
    .replace(/([?&]c-out=)[^&]*/, `$1${task.checkout}`);
}
// Cold-start devices use the same observed native template, without requiring UI search first.
// Its source timestamp is evidence, not a claim that today's page has already been verified.
export function marketNavigation(task, profiles = [], now = Date.now()) {
  if (task.task_type !== "MARKET_LIST") return null;
  let cached;
  try {
    cached = fastNavigation(task, profiles, now);
  } catch {
    // A corrupt local candidate must not hide the independently verified bundled one.
  }
  if (cached) return cached;
  const bundled = ctripNavigationProfiles.find(
    (p) =>
      p.platform === task.platform &&
      p.city_name === task.city &&
      p.keyword === task.keyword,
  );
  return bundled ? navigationUrl(task, bundled, now) : null;
}
export function rememberNavigation(profiles, profile) {
  if (!profile) return profiles;
  return [
    ...profiles.filter(
      (p) =>
        !(
          p.platform === profile.platform &&
          p.city_name === profile.city_name &&
          p.keyword === profile.keyword
        ),
    ),
    profile,
  ].slice(-30);
}
