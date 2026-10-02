import { AdapterError } from "./contract.js";
export function unavailableAdapter(platform) {
  const blocked = () => {
    throw new AdapterError("PLATFORM_LIVE_EVIDENCE_REQUIRED");
  };
  return Object.freeze({
    platform,
    collection_enabled: false,
    parseObservation: blocked,
    navigate: blocked,
    inspectList: blocked,
    inspectDetail: blocked,
  });
}
