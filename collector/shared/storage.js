export const LOCAL_KEYS = Object.freeze(["device_id", "device_credential", "api_base"]);
export const SESSION_KEY = "runtime_state";

export function createStorage(chromeApi) {
  const local = chromeApi.storage.local;
  const session = chromeApi.storage.session;
  return {
    async getLocal() { return local.get(LOCAL_KEYS); },
    async setLocal(values) { return local.set(values); },
    async getSession() {
      if (!session) return null;
      try { const result = await session.get(SESSION_KEY); return result[SESSION_KEY] ?? null; } catch { return null; }
    },
    async setSession(value) {
      if (!session) return;
      try { await session.set({ [SESSION_KEY]: value }); } catch { /* cloud current-task remains authoritative */ }
    },
    async clearSession() {
      if (!session) return;
      try { await session.remove(SESSION_KEY); } catch { /* cloud current-task remains authoritative */ }
    },
  };
}
