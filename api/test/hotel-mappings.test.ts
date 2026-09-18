import {
  beforeEach,
  describe,
  expect,
  it
} from "vitest";

import {
  env
} from "cloudflare:test";

import {
  resetDatabase
} from "./helpers/db";

import {
  parseConfirmHotelMapping
} from "../src/schemas/hotel-mappings";

import {
  HotelMappingService
} from "../src/services/hotel-mappings";

import {
  HotelMappingWriteRepository
} from "../src/repositories/hotel-mappings";

import type {
  AccessIdentity
} from "../src/env";

const actor: AccessIdentity = {
  type: "access_user",
  sub: "mapping-manager",
  email: "manager@livv.test",
  role: "manager"
};

const now =
  "2026-09-18T10:00:00.000Z";

async function seedAccessUser() {
  await env.DB.prepare(`
    INSERT INTO livv_users (
      sub,
      email,
      display_name,
      role,
      status,
      created_at,
      updated_at
    )
    VALUES (
      ?,
      ?,
      ?,
      ?,
      'active',
      ?,
      ?
    )
  `)
    .bind(
      actor.sub,
      actor.email,
      "Mapping Test Manager",
      actor.role,
      now,
      now
    )
    .run();
}

async function seedMarket(
  id = "xn-center-huatan"
) {
  const isDefault =
    id === "xn-center-huatan";

  await env.DB.prepare(`
    INSERT INTO markets (
      id,
      name,
      city,
      keyword,
      status,
      timezone,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      id,
      isDefault
        ? "咸宁 · 中心花坛"
        : "咸宁 · 其它测试市场",
      "咸宁",
      isDefault
        ? "中心花坛"
        : "其它测试区域",
      "active",
      "Asia/Shanghai",
      now,
      now
    )
    .run();
}

async function ensureTestDevice() {
  const existing =
    await env.DB.prepare(
      "SELECT id FROM devices WHERE id = ?"
    )
      .bind("device-test")
      .first<{ id: string }>();

  if (existing) {
    return;
  }

  await env.DB.prepare(`
    INSERT INTO devices (
      id,
      device_id,
      name,
      status,
      collector_version,
      protocol_version,
      os,
      arch,
      browser,
      browser_version,
      first_seen_at,
      last_seen_at,
      current_state,
      created_at,
      updated_at
    )
    VALUES (
      ?,
      ?,
      ?,
      'pending',
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?
    )
  `)
    .bind(
      "device-test",
      "device-test",
      "Hotel Mapping Test Device",
      "test",
      "2026-09",
      "macOS",
      "arm64",
      "Chrome",
      "test",
      now,
      now,
      "registered",
      now,
      now
    )
    .run();
}

async function seedObservedHotel(input: {
  rowId: string;
  platform: string;
  platformHotelId: string;
  hotelName: string;
  marketId?: string;
}) {
  const marketId =
    input.marketId ||
    "xn-center-huatan";

  await ensureTestDevice();

  const collectionId =
    `collection-${input.rowId}`;

  const factId =
    `fact-${input.rowId}`;

  await env.DB.prepare(`
    INSERT INTO platform_hotels (
      id,
      market_id,
      platform,
      platform_hotel_id,
      hotel_name,
      city,
      status,
      first_seen_at,
      last_seen_at,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      input.rowId,
      marketId,
      input.platform,
      input.platformHotelId,
      input.hotelName,
      "咸宁",
      "active",
      now,
      now,
      now,
      now
    )
    .run();

  await env.DB.prepare(`
    INSERT INTO collections (
      id,
      idempotency_key,
      device_id,
      platform,
      task_type,
      market_id,
      business_date,
      check_in,
      check_out,
      started_at,
      finished_at,
      quality,
      status,
      policy_version,
      collector_version,
      source,
      created_at
    )
    VALUES (
      ?,
      ?,
      ?,
      ?,
      'list',
      ?,
      '2026-09-18',
      '2026-09-18',
      '2026-09-19',
      ?,
      ?,
      'complete',
      'completed',
      'test-policy',
      'test',
      'test',
      ?
    )
  `)
    .bind(
      collectionId,
      `idem-${input.rowId}`,
      "device-test",
      input.platform,
      marketId,
      now,
      now,
      now
    )
    .run();

  await env.DB.prepare(`
    INSERT INTO price_facts (
      id,
      collection_id,
      market_id,
      platform_hotel_id,
      business_date,
      check_in,
      check_out,
      rank_position,
      display_price,
      availability,
      collected_at,
      payload_hash
    )
    VALUES (
      ?,
      ?,
      ?,
      ?,
      '2026-09-18',
      '2026-09-18',
      '2026-09-19',
      1,
      100,
      'available',
      ?,
      ?
    )
  `)
    .bind(
      factId,
      collectionId,
      marketId,
      input.rowId,
      now,
      `payload-${input.rowId}`
    )
    .run();
}

function service() {
  return new HotelMappingService(
    new HotelMappingWriteRepository(
      env.DB
    )
  );
}

describe(
  "hotel mapping confirmation",
  () => {
    beforeEach(async () => {
      await resetDatabase(
        env.DB
      );

      await seedAccessUser();
      await seedMarket();
    });

    it(
      "strict schema rejects unknown field",
      () => {
        expect(() =>
          parseConfirmHotelMapping({
            market_id:
              "xn-center-huatan",

            hotel_name:
              "测试酒店",

            platform_hotel_row_ids:
              ["a", "b"],

            unexpected:
              true
          })
        ).toThrow(
          /Unknown field/
        );
      }
    );

    it(
      "strict schema rejects non-string row id",
      () => {
        expect(() =>
          parseConfirmHotelMapping({
            market_id:
              "xn-center-huatan",

            hotel_name:
              "测试酒店",

            platform_hotel_row_ids:
              ["a", 123]
          })
        ).toThrow(
          /only non-empty strings/
        );
      }
    );

    it(
      "rejects one platform hotel",
      async () => {
        await seedObservedHotel({
          rowId: "ctrip-1",
          platform: "ctrip",
          platformHotelId:
            "10001",
          hotelName: "测试酒店"
        });

        await expect(
          service().confirm(
            {
              market_id:
                "xn-center-huatan",

              hotel_name:
                "测试酒店",

              platform_hotel_row_ids:
                ["ctrip-1"]
            },
            actor
          )
        ).rejects.toMatchObject({
          status: 400
        });
      }
    );

    it(
      "rejects two hotels from same platform",
      async () => {
        await seedObservedHotel({
          rowId: "ctrip-1",
          platform: "ctrip",
          platformHotelId:
            "10001",
          hotelName: "测试酒店A"
        });

        await seedObservedHotel({
          rowId: "ctrip-2",
          platform: "ctrip",
          platformHotelId:
            "10002",
          hotelName: "测试酒店B"
        });

        await expect(
          service().confirm(
            {
              market_id:
                "xn-center-huatan",

              hotel_name:
                "测试酒店",

              platform_hotel_row_ids:
                [
                  "ctrip-1",
                  "ctrip-2"
                ]
            },
            actor
          )
        ).rejects.toMatchObject({
          status: 400
        });
      }
    );

    it(
      "rejects hotel not observed in market",
      async () => {
        await seedMarket(
          "other-market"
        );

        await seedObservedHotel({
          rowId: "ctrip-1",
          platform: "ctrip",
          platformHotelId:
            "10001",
          hotelName: "测试酒店",
          marketId:
            "xn-center-huatan"
        });

        await seedObservedHotel({
          rowId: "meituan-1",
          platform: "meituan",
          platformHotelId:
            "20001",
          hotelName: "测试酒店",
          marketId:
            "other-market"
        });

        await expect(
          service().confirm(
            {
              market_id:
                "xn-center-huatan",

              hotel_name:
                "测试酒店",

              platform_hotel_row_ids:
                [
                  "ctrip-1",
                  "meituan-1"
                ]
            },
            actor
          )
        ).rejects.toMatchObject({
          status: 400
        });
      }
    );

    it(
      "rejects fallback platform identity",
      async () => {
        await seedObservedHotel({
          rowId: "ctrip-1",
          platform: "ctrip",
          platformHotelId:
            "10001",
          hotelName: "测试酒店"
        });

        await seedObservedHotel({
          rowId: "meituan-1",
          platform: "meituan",
          platformHotelId:
            "meituan:manual:test",
          hotelName: "测试酒店"
        });

        await expect(
          service().confirm(
            {
              market_id:
                "xn-center-huatan",

              hotel_name:
                "测试酒店",

              platform_hotel_row_ids:
                [
                  "ctrip-1",
                  "meituan-1"
                ]
            },
            actor
          )
        ).rejects.toMatchObject({
          status: 400
        });
      }
    );

    it(
      "creates hotel mappings and audit atomically",
      async () => {
        await seedObservedHotel({
          rowId: "ctrip-1",
          platform: "ctrip",
          platformHotelId:
            "10001",
          hotelName: "测试酒店"
        });

        await seedObservedHotel({
          rowId: "meituan-1",
          platform: "meituan",
          platformHotelId:
            "20001",
          hotelName: "测试酒店"
        });

        await seedObservedHotel({
          rowId: "fliggy-1",
          platform: "fliggy",
          platformHotelId:
            "30001",
          hotelName: "测试酒店"
        });

        const result =
          await service().confirm(
            {
              market_id:
                "xn-center-huatan",

              hotel_name:
                "测试酒店",

              platform_hotel_row_ids:
                [
                  "ctrip-1",
                  "meituan-1",
                  "fliggy-1"
                ]
            },
            actor
          );

        expect(
          result.mapping_count
        ).toBe(3);

        const hotels =
          await env.DB.prepare(
            "SELECT * FROM hotels"
          ).all();

        expect(
          hotels.results
        ).toHaveLength(1);

        const mappings =
          await env.DB.prepare(`
            SELECT
              platform,
              status,
              source,
              confirmed_by
            FROM hotel_mappings
            ORDER BY platform
          `).all<{
            platform: string;
            status: string;
            source: string;
            confirmed_by: string;
          }>();

        expect(
          mappings.results
        ).toHaveLength(3);

        expect(
          mappings.results?.every(
            (row) =>
              row.status ===
                "confirmed" &&
              row.source ===
                "manual" &&
              row.confirmed_by ===
                actor.sub
          )
        ).toBe(true);

        const audits =
          await env.DB.prepare(`
            SELECT action
            FROM audit_events
            WHERE action =
              'hotel_mapping.confirm'
          `).all<{
            action: string;
          }>();

        expect(
          audits.results
        ).toHaveLength(1);
      }
    );

    it(
      "rejects an already confirmed identity without creating orphan hotel",
      async () => {
        await seedObservedHotel({
          rowId: "ctrip-1",
          platform: "ctrip",
          platformHotelId:
            "10001",
          hotelName: "测试酒店"
        });

        await seedObservedHotel({
          rowId: "meituan-1",
          platform: "meituan",
          platformHotelId:
            "20001",
          hotelName: "测试酒店"
        });

        await seedObservedHotel({
          rowId: "fliggy-1",
          platform: "fliggy",
          platformHotelId:
            "30001",
          hotelName: "测试酒店"
        });

        await service().confirm(
          {
            market_id:
              "xn-center-huatan",

            hotel_name:
              "第一次确认",

            platform_hotel_row_ids:
              [
                "ctrip-1",
                "meituan-1"
              ]
          },
          actor
        );

        await expect(
          service().confirm(
            {
              market_id:
                "xn-center-huatan",

              hotel_name:
                "第二次确认",

              platform_hotel_row_ids:
                [
                  "ctrip-1",
                  "fliggy-1"
                ]
            },
            actor
          )
        ).rejects.toMatchObject({
          status: 409
        });

        const hotels =
          await env.DB.prepare(
            "SELECT id FROM hotels"
          ).all();

        expect(
          hotels.results
        ).toHaveLength(1);
      }
    );
  }
);

describe(
  "hotel mapping authorization and atomicity",
  () => {
    it(
      "viewer cannot satisfy manager requirement",
      async () => {
        const {
          requireRole
        } =
          await import(
            "../src/middleware/rbac"
          );

        expect(() =>
          requireRole(
            "viewer",
            "manager"
          )
        ).toThrow();
      }
    );

    it(
      "manager satisfies manager requirement",
      async () => {
        const {
          requireRole
        } =
          await import(
            "../src/middleware/rbac"
          );

        expect(() =>
          requireRole(
            "manager",
            "manager"
          )
        ).not.toThrow();
      }
    );

    it(
      "batch conflict rolls back hotel mappings and audit",
      async () => {
        await resetDatabase(
          env.DB
        );

        await seedAccessUser();
        await seedMarket();

        await seedObservedHotel({
          rowId: "ctrip-atomic",
          platform: "ctrip",
          platformHotelId:
            "91001",
          hotelName:
            "原子测试酒店"
        });

        await seedObservedHotel({
          rowId: "meituan-atomic",
          platform: "meituan",
          platformHotelId:
            "92001",
          hotelName:
            "原子测试酒店"
        });

        /*
         * 预先制造一个 confirmed mapping，
         * 让 Repository batch 中 mapping INSERT
         * 触发唯一约束。
         */
        await env.DB.prepare(`
          INSERT INTO hotels (
            id,
            name,
            city,
            status,
            created_at,
            updated_at
          )
          VALUES (
            'existing-hotel',
            'Existing',
            '咸宁',
            'active',
            ?,
            ?
          )
        `)
          .bind(
            now,
            now
          )
          .run();

        await env.DB.prepare(`
          INSERT INTO hotel_mappings (
            id,
            hotel_id,
            platform_hotel_row_id,
            platform,
            status,
            source,
            is_primary,
            confirmed_by,
            confirmed_at,
            created_at,
            updated_at
          )
          VALUES (
            'existing-map',
            'existing-hotel',
            'ctrip-atomic',
            'ctrip',
            'confirmed',
            'manual',
            1,
            ?,
            ?,
            ?,
            ?
          )
        `)
          .bind(
            actor.sub,
            now,
            now,
            now
          )
          .run();

        const beforeHotels =
          await env.DB.prepare(
            "SELECT COUNT(*) AS n FROM hotels"
          ).first<{
            n: number;
          }>();

        const beforeMappings =
          await env.DB.prepare(
            "SELECT COUNT(*) AS n FROM hotel_mappings"
          ).first<{
            n: number;
          }>();

        const beforeAudits =
          await env.DB.prepare(
            "SELECT COUNT(*) AS n FROM audit_events"
          ).first<{
            n: number;
          }>();

        /*
         * 这里直接调用 Write Repository，
         * 故意绕过 Service 的冲突预检，
         * 专门验证 db.batch 原子性。
         */
        const repo =
          new HotelMappingWriteRepository(
            env.DB
          );

        await expect(
          repo.confirm({
            hotelId:
              "should-rollback",

            hotelName:
              "Should Rollback",

            city:
              "咸宁",

            marketId:
              "xn-center-huatan",

            platformHotels: [
              {
                id:
                  "ctrip-atomic",
                platform:
                  "ctrip",
                platform_hotel_id:
                  "91001",
                hotel_name:
                  "原子测试酒店"
              },
              {
                id:
                  "meituan-atomic",
                platform:
                  "meituan",
                platform_hotel_id:
                  "92001",
                hotel_name:
                  "原子测试酒店"
              }
            ],

            actorId:
              actor.sub,

            auditId:
              "audit-rollback",

            mappingIds: [
              "map-conflict",
              "map-second"
            ],

            now
          })
        ).rejects.toThrow();

        const afterHotels =
          await env.DB.prepare(
            "SELECT COUNT(*) AS n FROM hotels"
          ).first<{
            n: number;
          }>();

        const afterMappings =
          await env.DB.prepare(
            "SELECT COUNT(*) AS n FROM hotel_mappings"
          ).first<{
            n: number;
          }>();

        const afterAudits =
          await env.DB.prepare(
            "SELECT COUNT(*) AS n FROM audit_events"
          ).first<{
            n: number;
          }>();

        expect(
          afterHotels?.n
        ).toBe(
          beforeHotels?.n
        );

        expect(
          afterMappings?.n
        ).toBe(
          beforeMappings?.n
        );

        expect(
          afterAudits?.n
        ).toBe(
          beforeAudits?.n
        );

        const orphan =
          await env.DB.prepare(
            "SELECT id FROM hotels WHERE id = 'should-rollback'"
          ).first();

        expect(
          orphan
        ).toBeNull();
      }
    );
  }
);
