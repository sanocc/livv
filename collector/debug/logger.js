/**
 * LIVV Collector M04 Debug Logger
 *
 * 恢复旧 Codex 版本中非常实用的：
 * [酒店助手] ...
 */

const PREFIX = "[酒店助手]";

export function log(...args) {
  console.info(PREFIX, ...args);
}

export function warn(...args) {
  console.warn(PREFIX, ...args);
}

export function error(...args) {
  console.error(PREFIX, ...args);
}

export function hotel(index, fact) {
  console.groupCollapsed(
    `${PREFIX} 酒店${index}: ${fact?.hotel_name || "未识别名称"}`
  );

  console.log("platform_hotel_id:", fact?.platform_hotel_id ?? null);
  console.log("display_position:", fact?.display_position ?? null);
  console.log("display_price:", fact?.display_price ?? null);
  console.log("list_price:", fact?.list_price ?? null);
  console.log("rating:", fact?.rating ?? null);
  console.log("review_count:", fact?.review_count ?? null);
  console.log("room_name:", fact?.room_name ?? null);
  console.log("promotions:", fact?.promotions ?? []);
  console.log("quality:", fact?.quality ?? {});
  console.log("evidence:", fact?.evidence ?? {});

  console.groupEnd();
}
