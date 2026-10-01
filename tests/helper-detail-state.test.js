import test from "node:test";
import assert from "node:assert/strict";
import { failRemainingDetails } from "../helper/detail-state.js";

test("detail browser failure retains locked market and completed rooms", () => {
  const market = [{ hotel_id: "1" }, { hotel_id: "2" }, { hotel_id: "3" }];
  const rooms = [{ hotel_id: "1", room_name: "真实房型" }];
  const active = {
    phase: "DETAIL_RETURN",
    stop_reason: "TARGET_REACHED",
    market,
    rooms,
    details: market,
    detail_results: [
      { hotel_id: "1", status: "SUCCESS" },
      { hotel_id: "2", status: "FAILED", error_code: "DETAIL_PARSE_TIMEOUT" },
    ],
  };
  assert.equal(failRemainingDetails(active, "MANAGED_TAB_NAVIGATED"), true);
  assert.strictEqual(active.market, market);
  assert.strictEqual(active.rooms, rooms);
  assert.deepEqual(active.detail_results, [
    { hotel_id: "1", status: "SUCCESS" },
    { hotel_id: "2", status: "FAILED", error_code: "DETAIL_PARSE_TIMEOUT" },
    { hotel_id: "3", status: "FAILED", error_code: "MANAGED_TAB_NAVIGATED" },
  ]);
  failRemainingDetails(active, "INPUT_PERMISSION_REQUIRED");
  assert.equal(active.detail_results.length, 3);
});

test("only locked stage-two results qualify for preservation", () => {
  for (const phase of ["LIST", "SEARCH", "CITY_OPEN"])
    assert.equal(
      failRemainingDetails({ phase, market: [{ hotel_id: "1" }] }, "ERROR"),
      false,
    );
  assert.equal(
    failRemainingDetails(
      { phase: "DETAIL_OPEN", market: [], stop_reason: "TARGET_REACHED" },
      "ERROR",
    ),
    false,
  );
  assert.equal(
    failRemainingDetails(
      {
        phase: "DETAIL_OPEN",
        market: [{ hotel_id: "1" }],
        stop_reason: "STALLED",
      },
      "ERROR",
    ),
    false,
  );
});
