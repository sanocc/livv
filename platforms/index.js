import { ctripAdapter } from "./ctrip/index.js";
import { fliggyAdapter } from "./fliggy/index.js";
import { meituanAdapter } from "./meituan/index.js";
import { tongchengAdapter, elongAdapter } from "./tongcheng/index.js";
import { AdapterError } from "./contract.js";
const adapters = {
  ctrip: ctripAdapter,
  meituan: meituanAdapter,
  fliggy: fliggyAdapter,
  tongcheng: tongchengAdapter,
  elong: elongAdapter,
};
export function platformAdapter(platform) {
  if (!Object.hasOwn(adapters, platform))
    throw new AdapterError("UNKNOWN_PLATFORM");
  return adapters[platform];
}
