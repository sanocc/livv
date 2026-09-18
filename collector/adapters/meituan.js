import { createAdapter } from "./base.js";

/**
 * LIVV Collector M04
 * Meituan Adapter V1 / First Page
 *
 * 已验证页面：
 * i.meituan.com/awp/h5/hotel/list/list.html
 *
 * 原则：
 * 1. 只解析标准 div.cell 酒店卡片。
 * 2. DOM 负责展示字段。
 * 3. HotelSearch 负责官方身份。
 * 4. 只允许标准化名称唯一精确匹配。
 * 5. 禁止 includes() 模糊匹配。
 * 6. 禁止酒店名称冒充 platform_hotel_id。
 * 7. 第一阶段只验收当前首屏结果，不处理前30懒加载。
 */

const PLATFORM = "meituan";
const CARD_SELECTOR = "div.cell";

function norm(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactName(value) {
  return norm(value)
    .replace(/[()（）·・\-—_.\s]/g, "")
    .toLowerCase();
}

function validOfficialId(value) {
  return /^\d{4,}$/.test(
    String(value || "")
  );
}

function numberFromText(value) {
  const text = String(value || "")
    .replace(/,/g, "");

  const match = text.match(
    /-?\d+(?:\.\d+)?/
  );

  if (!match) {
    return null;
  }

  const valueNumber =
    Number(match[0]);

  return Number.isFinite(valueNumber)
    ? valueNumber
    : null;
}


/* =========================================================
 * DOM FIELD READERS
 * ========================================================= */

function readHotelName(card) {
  const value = norm(
    card.querySelector(
      ".poi-title"
    )?.textContent || ""
  );

  return {
    value: value || null,
    source:
      value
        ? ".poi-title"
        : null
  };
}

function readRating(card) {
  const text = norm(
    card.querySelector(
      ".poi-score"
    )?.textContent || ""
  );

  const match = text.match(
    /([0-5](?:\.\d+)?)\s*分/
  );

  const value =
    match
      ? Number(match[1])
      : numberFromText(text);

  return {
    value:
      Number.isFinite(value)
        ? value
        : null,

    text:
      text || null,

    source:
      text
        ? ".poi-score"
        : null
  };
}

function readFeedback(card) {
  const value = norm(
    card.querySelector(
      ".poi-feedback"
    )?.textContent || ""
  );

  /*
   * 美团当前字段是：
   * 3万+消费 / 5000+消费
   *
   * 这不是点评数，所以不塞进 review_count。
   */

  return {
    value: value || null,
    source:
      value
        ? ".poi-feedback"
        : null
  };
}

function readDisplayPrice(card) {
  const node =
    card.querySelector(
      ".poi-price-num"
    );

  const value =
    numberFromText(
      node?.textContent
    );

  return {
    value,

    source:
      value != null
        ? ".poi-price-num"
        : null,

    ambiguous: false
  };
}

function readListPrice(card) {
  const text = norm(
    card.querySelector(
      ".poi-origin"
    )?.textContent || ""
  );

  const value =
    numberFromText(text);

  return {
    value,

    source:
      value != null
        ? ".poi-origin"
        : null
  };
}

function readAddress(card) {
  const value = norm(
    card.querySelector(
      ".poi-address"
    )?.textContent || ""
  );

  return {
    value: value || null,
    source:
      value
        ? ".poi-address"
        : null
  };
}

function readBooking(card) {
  const value = norm(
    card.querySelector(
      ".poi-bought"
    )?.textContent || ""
  );

  return {
    value: value || null,
    source:
      value
        ? ".poi-bought"
        : null
  };
}

function readCampaigns(card) {
  const values = [
    ...card.querySelectorAll(
      ".poi-campaign"
    )
  ]
    .map((node) =>
      norm(node.textContent)
    )
    .filter(Boolean)
    .filter((value) =>
      value !== "订" &&
      value !== "预订"
    );

  return {
    value:
      [...new Set(values)],

    source:
      values.length
        ? ".poi-campaign"
        : null
  };
}

function readAd(card) {
  /*
   * 当前暂未冻结美团广告专用 selector。
   * 只保存明确出现的“广告”文字证据。
   */

  const text =
    norm(card.innerText || "");

  const value =
    /(^|\s)广告($|\s)/.test(text);

  return {
    value,

    source:
      value
        ? "card:text:广告"
        : null
  };
}

function readSoldOut(card) {
  const text =
    norm(card.innerText || "");

  const value =
    /售罄|满房|暂无可订|无房/.test(
      text
    );

  return {
    value,

    source:
      value
        ? "card:text:sold-out"
        : null
  };
}


/* =========================================================
 * HOTELSEARCH IDENTITY
 * ========================================================= */

function findHotelSearchUrls() {
  return (
    performance
      .getEntriesByType(
        "resource"
      ) || []
  )
    .map((entry) =>
      entry.name
    )
    .filter((url) =>
      /ihotel\.meituan\.com\/hbsearch\/HotelSearch/i.test(
        url
      )
    );
}

function selectFirstPageHotelSearchUrl() {
  const urls =
    findHotelSearchUrls();

  /*
   * 优先选择最近一个 offset=0 请求。
   */

  const firstPage =
    [...urls]
      .reverse()
      .find((url) => {
        try {
          const u =
            new URL(url);

          return (
            u.searchParams.get(
              "offset"
            ) === "0"
          );
        } catch {
          return false;
        }
      });

  return (
    firstPage ||
    urls[urls.length - 1] ||
    null
  );
}

function simplifyApiRow(row) {
  const name =
    norm(
      row?.name ??
      row?.hotelName ??
      ""
    );

  const poi =
    row?.poiid ??
    row?.poiId ??
    null;

  const real =
    row?.realPoiId ??
    null;

  return {
    name,

    compact_name:
      compactName(name),

    poiid:
      validOfficialId(poi)
        ? String(poi)
        : null,

    realPoiId:
      validOfficialId(real)
        ? String(real)
        : null
  };
}

async function readAllObservedHotelSearchIdentity() {
  const urls =
    findHotelSearchUrls();

  const rows = [];
  const requests = [];
  const seen = new Set();

  /*
   * 只读取页面自己真实产生过的 HotelSearch。
   * 不人工构造 offset。
   */

  for (const url of urls) {
    try {
      const u =
        new URL(url);

      const offset =
        u.searchParams.get(
          "offset"
        );

      const limit =
        u.searchParams.get(
          "limit"
        );

      const response =
        await fetch(
          url,
          {
            credentials:
              "include"
          }
        );

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        );
      }

      const json =
        await response.json();

      const rawRows =
        json?.data?.searchresult ??
        json?.searchresult ??
        [];

      const pageRows =
        Array.isArray(rawRows)
          ? rawRows.map(
              simplifyApiRow
            )
          : [];

      requests.push({
        url,
        offset,
        limit,
        row_count:
          pageRows.length,
        error:
          null
      });

      for (const row of pageRows) {
        const key =
          `${row.compact_name}|${row.poiid || ""}|${row.realPoiId || ""}`;

        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        rows.push(row);
      }
    } catch (error) {
      requests.push({
        url,
        offset:
          null,
        limit:
          null,
        row_count:
          0,
        error:
          String(
            error?.message ||
            error
          )
      });
    }
  }

  return {
    rows,
    requests
  };
}

function buildIdentityIndex(rows) {
  const map =
    new Map();

  for (const row of rows) {
    if (!row.compact_name) {
      continue;
    }

    if (
      !map.has(
        row.compact_name
      )
    ) {
      map.set(
        row.compact_name,
        []
      );
    }

    map
      .get(row.compact_name)
      .push(row);
  }

  return map;
}

function resolveIdentity(
  hotelName,
  identityIndex
) {
  const key =
    compactName(hotelName);

  const matches =
    identityIndex.get(key) || [];

  /*
   * 必须唯一精确匹配。
   *
   * 0个：missing
   * 1个：exact
   * >1个：conflict
   */

  if (matches.length !== 1) {
    return {
      status:
        matches.length === 0
          ? "missing"
          : "conflict",

      platform_hotel_id:
        null,

      poiid:
        null,

      realPoiId:
        null,

      match_count:
        matches.length
    };
  }

  const row =
    matches[0];

  const officialId =
    validOfficialId(
      row.poiid
    )
      ? row.poiid
      : null;

  return {
    status:
      officialId
        ? "exact"
        : "missing_id",

    platform_hotel_id:
      officialId,

    poiid:
      row.poiid,

    realPoiId:
      row.realPoiId,

    match_count:
      1
  };
}


/* =========================================================
 * FACT
 * ========================================================= */

function parseCard(
  card,
  position,
  identityIndex
) {
  const name =
    readHotelName(card);

  if (!name.value) {
    return null;
  }

  const identity =
    resolveIdentity(
      name.value,
      identityIndex
    );

  const rating =
    readRating(card);

  const feedback =
    readFeedback(card);

  const displayPrice =
    readDisplayPrice(card);

  const listPrice =
    readListPrice(card);

  const address =
    readAddress(card);

  const booking =
    readBooking(card);

  const campaigns =
    readCampaigns(card);

  const ad =
    readAd(card);

  const sold =
    readSoldOut(card);

  const officialId =
    validOfficialId(
      identity.platform_hotel_id
    );

  const priceOk =
    sold.value ||
    (
      displayPrice.value != null &&
      Number.isFinite(
        Number(
          displayPrice.value
        )
      )
    );

  return {
    platform:
      PLATFORM,

    platform_hotel_id:
      officialId
        ? identity.platform_hotel_id
        : null,

    hotel_name:
      name.value,

    display_position:
      position,

    display_price:
      displayPrice.value,

    list_price:
      listPrice.value,

    currency:
      "CNY",

    sold_out:
      sold.value,

    is_ad:
      ad.value,

    rating:
      rating.value,

    /*
     * 美团 DOM 当前提供的是消费量，
     * 不是点评数量。
     */
    review_count:
      null,

    room_name:
      null,

    promotions:
      campaigns.value,

    source_url:
      location.href,

    quality: {
      card:
        true,

      name:
        Boolean(name.value),

      official_id:
        officialId,

      price:
        priceOk,

      ambiguous_price:
        displayPrice.ambiguous,

      identity_status:
        identity.status,

      identity_conflict:
        identity.status ===
        "conflict"
    },

    evidence: {
      card_selector:
        CARD_SELECTOR,

      id_source:
        officialId
          ? "HotelSearch.poiid"
          : null,

      identity_match:
        "normalized-name-exact",

      real_poi_id:
        identity.realPoiId,

      name_source:
        name.source,

      price_source:
        displayPrice.source,

      list_price_source:
        listPrice.source,

      rating_source:
        rating.source,

      feedback_source:
        feedback.source,

      address_source:
        address.source,

      booking_source:
        booking.source,

      promotion_source:
        campaigns.source,

      ad_source:
        ad.source
    },

    raw: {
      poiid:
        identity.poiid,

      realPoiId:
        identity.realPoiId,

      identity_status:
        identity.status,

      identity_match_count:
        identity.match_count,

      rating_text:
        rating.text,

      feedback_text:
        feedback.value,

      address:
        address.value,

      booking_text:
        booking.value,

      preview:
        norm(
          card.innerText || ""
        ).slice(0, 400)
    }
  };
}


/* =========================================================
 * COLLECT / FIRST PAGE ONLY
 * ========================================================= */

async function collect() {
  const LIMIT = 30;
  const MAX_ROUNDS = 12;
  const CHANGE_TIMEOUT = 3000;

  function sleep(ms) {
    return new Promise(
      (resolve) =>
        setTimeout(resolve, ms)
    );
  }

  function cards() {
    return [
      ...document.querySelectorAll(
        CARD_SELECTOR
      )
    ];
  }

  function currentHotelNames() {
    return cards()
      .map((card) =>
        compactName(
          card.querySelector(
            ".poi-title"
          )?.textContent || ""
        )
      )
      .filter(Boolean);
  }

  function currentRequestCount() {
    return findHotelSearchUrls()
      .length;
  }

  function waitForListGrowth(
    beforeCardCount,
    beforeRequestCount
  ) {
    return new Promise(
      (resolve) => {
        let finished = false;

        const finish =
          (reason) => {
            if (finished) {
              return;
            }

            finished = true;

            observer.disconnect();
            clearInterval(poll);
            clearTimeout(timer);

            resolve(reason);
          };

        const check = () => {
          if (
            cards().length >
            beforeCardCount
          ) {
            return "new_dom_hotel";
          }

          if (
            currentRequestCount() >
            beforeRequestCount
          ) {
            return "new_hotelsearch";
          }

          return null;
        };

        const observer =
          new MutationObserver(
            () => {
              const reason =
                check();

              if (reason) {
                finish(reason);
              }
            }
          );

        observer.observe(
          document.body,
          {
            subtree: true,
            childList: true
          }
        );

        const poll =
          setInterval(
            () => {
              const reason =
                check();

              if (reason) {
                finish(reason);
              }
            },
            100
          );

        const timer =
          setTimeout(
            () =>
              finish("timeout"),
            CHANGE_TIMEOUT
          );
      }
    );
  }

  /*
   * 美团实测：
   * offset=0 → 20
   * 下滑后 offset=20 → DOM追加至40
   *
   * 我们不自己构造第二页接口，
   * 只通过页面自然滚动触发。
   */

  let rounds = 0;
  let noGrowthRounds = 0;

  console.info(
    "[酒店助手] 美团 Rank Monitor Round 0",
    {
      cards:
        cards().length,

      hotel_search_requests:
        currentRequestCount()
    }
  );

  while (
    cards().length < LIMIT &&
    rounds < MAX_ROUNDS
  ) {
    rounds += 1;

    const beforeCards =
      cards().length;

    const beforeRequests =
      currentRequestCount();

    window.scrollBy({
      top:
        Math.max(
          650,
          Math.round(
            window.innerHeight *
              0.85
          )
        ),

      behavior:
        "smooth"
    });

    const reason =
      await waitForListGrowth(
        beforeCards,
        beforeRequests
      );

    if (
      reason !== "timeout"
    ) {
      await sleep(180);
    }

    const afterCards =
      cards().length;

    if (
      afterCards >
      beforeCards
    ) {
      noGrowthRounds = 0;
    } else {
      noGrowthRounds += 1;
    }

    console.info(
      `[酒店助手] 美团 Rank Monitor Round ${rounds}`,
      {
        before_cards:
          beforeCards,

        after_cards:
          afterCards,

        hotel_search_requests:
          currentRequestCount(),

        change_reason:
          reason
      }
    );

    if (
      afterCards >= LIMIT
    ) {
      break;
    }

    if (
      noGrowthRounds >= 8
    ) {
      break;
    }
  }

  /*
   * 页面加载完成以后，再读取页面自己
   * 已经产生的所有 HotelSearch 请求。
   */

  const identity =
    await readAllObservedHotelSearchIdentity();

  const identityIndex =
    buildIdentityIndex(
      identity.rows
    );

  const allCards =
    cards();

  const facts = [];
  const seen = new Set();

  for (
    let index = 0;
    index < allCards.length;
    index += 1
  ) {
    if (
      facts.length >= LIMIT
    ) {
      break;
    }

    const fact =
      parseCard(
        allCards[index],
        facts.length + 1,
        identityIndex
      );

    if (!fact) {
      continue;
    }

    const key =
      fact.platform_hotel_id
        ? `id:${fact.platform_hotel_id}`
        : `name:${fact.hotel_name}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    fact.display_position =
      facts.length + 1;

    facts.push(fact);
  }

  const exactIdentities =
    facts.filter(
      (fact) =>
        fact.quality
          ?.identity_status ===
        "exact"
    ).length;

  const identityConflicts =
    facts.filter(
      (fact) =>
        fact.quality
          ?.identity_conflict ===
        true
    ).length;

  const offsets =
    [
      ...new Set(
        identity.requests
          .map(
            (request) =>
              request.offset
          )
          .filter(
            (value) =>
              value != null
          )
      )
    ];

  const reachedTarget =
    facts.length >= LIMIT;

  const stopReason =
    reachedTarget
      ? "rank_limit"
      : noGrowthRounds >= 8
        ? "no_more_standard_hotels"
        : rounds >= MAX_ROUNDS
          ? "max_rounds"
          : "completed";

  console.info(
    "[酒店助手] 美团 Rank Monitor 完成",
    {
      facts:
        facts.length,

      target:
        LIMIT,

      offsets,

      exact_identities:
        exactIdentities,

      identity_conflicts:
        identityConflicts,

      stop_reason:
        stopReason
    }
  );

  return {
    facts:
      facts.slice(
        0,
        LIMIT
      ),

    meta: {
      adapter:
        "meituan-v1",

      strategy:
        "append-lazyload-hotelsearch-exact",

      card_selector:
        CARD_SELECTOR,

      card_count:
        allCards.length,

      fact_count:
        Math.min(
          facts.length,
          LIMIT
        ),

      target_limit:
        LIMIT,

      reached_target:
        reachedTarget,

      rounds,

      stop_reason:
        stopReason,

      hotel_search_request_count:
        identity.requests.length,

      hotel_search_offsets:
        offsets,

      hotel_search_row_count:
        identity.rows.length,

      exact_identity_count:
        exactIdentities,

      identity_conflict_count:
        identityConflicts,

      hotel_search_requests:
        identity.requests
    }
  };
}

/* =========================================================
 * ADAPTER
 * ========================================================= */

export const meituanAdapter =
  createAdapter({
    platform:
      PLATFORM,

    match(
      loc = location
    ) {
      return (
        /(i\.meituan\.com|hotel\.meituan\.com|ihotel\.meituan\.com|hotel\.dianping\.com)$/i
          .test(
            loc.hostname
          ) &&
        /hotel|\/awp\/h5\/hotel/i
          .test(
            `${loc.hostname}${loc.pathname}`
          )
      );
    },

    collect
  });

export default meituanAdapter;
