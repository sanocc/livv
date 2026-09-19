export function createChromeAlarms(chromeApi) {
  return {
    async ensure(name, info) {
      const existing = await chromeApi.alarms.get(name);
      if (!existing) await chromeApi.alarms.create(name, info);
    },
    create(name, info) { return chromeApi.alarms.create(name, info); },
    clear(name) { return chromeApi.alarms.clear(name); },
  };
}
