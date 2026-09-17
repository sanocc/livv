import { auditHotelFacts } from "./quality.js";
import * as debug from "../debug/logger.js";

/**
 * M04 Adapter Engine
 *
 * 当前只建立骨架。
 * 尚未接管 popup.js 的现有采集流程。
 */

export async function runAdapter(adapter) {
  debug.log(`开始采集平台：${adapter.platform}`);

  const result = await adapter.collect();

  const facts = Array.isArray(result?.facts)
    ? result.facts
    : [];

  facts.forEach((fact, index) => {
    debug.hotel(index + 1, fact);
  });

  const audit = auditHotelFacts(facts);

  debug.log("采集完成", {
    platform: adapter.platform,
    count: facts.length,
    audit
  });

  return {
    platform: adapter.platform,
    collected_at: new Date().toISOString(),
    facts,
    audit,
    meta: result?.meta || {}
  };
}
