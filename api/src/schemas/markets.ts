import { assertNoUnknownKeys, requiredString } from "./common";

export interface CreateMarketInput {
  name: string;
  city: string;
  keyword: string;
  timezone: string;
}

export function parseCreateMarket(body: Record<string, unknown>): CreateMarketInput {
  assertNoUnknownKeys(body, ["name", "city", "keyword", "timezone"]);
  return {
    name: requiredString(body, "name", { max: 120 }),
    city: requiredString(body, "city", { max: 80 }),
    keyword: requiredString(body, "keyword", { max: 120 }),
    timezone: requiredString(body, "timezone", { max: 64 })
  };
}
