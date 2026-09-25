export function createDeviceRepository(db) {
  return {
    async find(deviceId) {
      return db.prepare('SELECT * FROM devices WHERE device_id = ?1').bind(deviceId).first();
    },
    async insert(device) {
      await db.prepare(`INSERT INTO devices (device_id, device_name, device_secret_hash, status, extension_version, platform, browser, os, created_at)
        VALUES (?1, ?2, ?3, 'pending', ?4, ?5, ?6, ?7, ?8)`).bind(
        device.device_id, device.device_name, device.device_secret_hash, device.extension_version,
        device.platform, device.browser, device.os, device.created_at
      ).run();
      return this.find(device.device_id);
    },
    async updateHeartbeat(deviceId, extensionVersion, lastSeenAt) {
      await db.prepare('UPDATE devices SET extension_version = ?1, last_seen_at = ?2 WHERE device_id = ?3')
        .bind(extensionVersion, lastSeenAt, deviceId).run();
      return this.find(deviceId);
    },
    async cleanupExpiredNonces(expiresBefore) {
      await db.prepare('DELETE FROM device_nonces WHERE expires_at <= ?1').bind(expiresBefore).run();
    },
    async claimNonce(deviceId, nonce, createdAt, expiresAt) {
      try {
        await db.prepare(`INSERT INTO device_nonces (device_id, nonce, created_at, expires_at)
          VALUES (?1, ?2, ?3, ?4)`).bind(deviceId, nonce, createdAt, expiresAt).run();
        return true;
      } catch (error) {
        if (/UNIQUE constraint failed.*device_nonces/i.test(String(error?.message || error))) return false;
        throw error;
      }
    },
    async list() { return (await db.prepare('SELECT * FROM devices ORDER BY created_at DESC').all()).results || []; },
    async listPublic() {
      return (await db.prepare(`SELECT device_id, device_name, status, extension_version, platform, browser, os,
        created_at, approved_at, last_seen_at FROM devices ORDER BY created_at DESC`).all()).results || [];
    },
    async setStatus(deviceId, status, timestamp) {
      await db.prepare(`UPDATE devices SET status = ?1,
        approved_at = CASE WHEN ?1 = 'approved' THEN ?3 ELSE approved_at END,
        disabled_at = CASE WHEN ?1 = 'disabled' THEN ?3 ELSE disabled_at END,
        revoked_at = CASE WHEN ?1 = 'revoked' THEN ?3 ELSE revoked_at END
        WHERE device_id = ?2`).bind(status, deviceId, timestamp).run();
      return this.find(deviceId);
    }
  };
}
