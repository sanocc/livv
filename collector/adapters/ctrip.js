import { createAdapter } from "./base.js";

/**
 * LIVV Collector M04
 * Ctrip Adapter V1
 *
 * 原则：
 * 1. 只从真实酒店卡片开始。
 * 2. 每个字段独立读取。
 * 3. 不扫描整个页面文本猜酒店。
 * 4. 不使用酒店名称冒充官方 ID。
 * 5. 不使用 Math.min(所有金额) 猜展示价。
 * 6. 保存字段来源 evidence。
 * 7. 无法确定价格时标记 ambiguous。
 */

const PLATFORM = "ctrip";
const CARD_SELECTOR = "div.list-item";

function norm(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function number(value) {
  const text = String(value || "").replace(/,/g, "");

  const match = text.match(
    /-?\d+(?:\.\d+)?/
  );

  if (!match) return null;

  const result = Number(match[0]);

  return Number.isFinite(result)
    ? result
    : null;
}

function validOfficialId(value) {
  return /^\d{4,}$/.test(
    String(value || "")
  );
}

/* =========================================================
 * HOTEL ID
 * ========================================================= */

function readHotelId(card) {
  /*
   * 当前携程真实页面已验证：
   *
   * div.list-item
   *   └── .right-card[data-offline-hotelid]
   */

  const right = card.querySelector(
    ".right-card[data-offline-hotelid]"
  );

  const direct = right?.getAttribute(
    "data-offline-hotelid"
  );

  if (validOfficialId(direct)) {
    return {
      value: String(direct),
      source:
        ".right-card[data-offline-hotelid]"
    };
  }

  /*
   * 第二证据：
   * list-item 的 data-exposure 当前包含
   * masterhotelid。
   */

  const exposure =
    card.getAttribute("data-exposure") || "";

  if (exposure) {
    try {
      const json = JSON.parse(exposure);

      const id =
        json?.data?.masterhotelid ??
        json?.masterhotelid;

      if (validOfficialId(id)) {
        return {
          value: String(id),
          source:
            "div.list-item[data-exposure].masterhotelid"
        };
      }
    } catch {
      const match = exposure.match(
        /masterhotelid[^0-9]{0,20}(\d{4,})/i
      );

      if (match) {
        return {
          value: match[1],
          source:
            "div.list-item[data-exposure]:regex"
        };
      }
    }
  }

  /*
   * 不允许：
   *
   * hotel_name -> platform_hotel_id
   */

  return {
    value: null,
    source: null
  };
}

/* =========================================================
 * HOTEL NAME
 * ========================================================= */

function readHotelName(card) {
  const node = card.querySelector(
    ".hotelName"
  );

  const value = norm(
    node?.textContent || ""
  );

  return {
    value: value || null,
    source: value
      ? ".hotelName"
      : null
  };
}

/* =========================================================
 * RATING
 * ========================================================= */

function readRating(card) {
  const node = card.querySelector(
    ".score"
  );

  const value = number(
    node?.textContent
  );

  return {
    value,
    source: value != null
      ? ".score"
      : null
  };
}

/* =========================================================
 * REVIEW COUNT
 * ========================================================= */

function readReviewCount(card) {
  const node = card.querySelector(
    ".comment-num"
  );

  const value = number(
    node?.textContent
  );

  return {
    value,
    source: value != null
      ? ".comment-num"
      : null
  };
}

/* =========================================================
 * ROOM
 * ========================================================= */

function readRoomName(card) {
  const node = card.querySelector(
    ".room-name"
  );

  const value = norm(
    node?.textContent || ""
  );

  return {
    value: value || null,
    source: value
      ? ".room-name"
      : null
  };
}

/* =========================================================
 * AD
 * ========================================================= */

function readAd(card) {
  const node = card.querySelector(
    ".ad-info"
  );

  return {
    value: Boolean(node),
    source: node
      ? ".ad-info"
      : null
  };
}

/* =========================================================
 * SOLD OUT
 * ========================================================= */

function readSoldOut(card) {
  const text = norm(
    card.innerText || ""
  );

  const sold =
    /售罄|满房|暂无可订|无房/.test(text);

  return {
    value: sold,
    source: sold
      ? "card:text:sold-out"
      : null
  };
}

/* =========================================================
 * PROMOTIONS
 * ========================================================= */

function readPromotions(card) {
  const text = norm(
    card.innerText || ""
  );

  const catalog = [
    "早鸟优惠",
    "门店首单",
    "折扣券",
    "十亿豪补",
    "特惠一口价",
    "新客体验钻石",
    "新客专享",
    "会员优惠",
    "今夜特价"
  ];

  const values = [];

  for (const item of catalog) {
    if (text.includes(item)) {
      values.push(item);
    }
  }

  const lowRooms = text.match(
    /低价房仅剩\d+间/
  );

  if (lowRooms) {
    values.push(lowRooms[0]);
  }

  const booking = text.match(
    /(?:刚刚|\d+(?:\.\d+)?(?:分钟|小时|天))前有人预订/
  );

  if (booking) {
    values.push(booking[0]);
  }

  const drop = text.match(
    /(?:比收藏时)?降价¥\s*\d+/
  );

  if (drop) {
    values.push(
      drop[0].replace(/\s+/g, "")
    );
  }

  return {
    value: [...new Set(values)],
    source: values.length
      ? "card:promotion-text"
      : null
  };
}

/* =========================================================
 * PRICE
 * ========================================================= */

function priceCandidates(card) {
  const text = norm(
    card.innerText || ""
  );

  /*
   * 关键规则：
   *
   * 只接受紧邻“起”的价格作为展示价候选。
   *
   * 例如：
   *
   * 比收藏时降价¥9
   * ¥129
   * ¥102
   * 起
   *
   * 只能得到 102。
   */

  const matches = [
    ...text.matchAll(
      /¥\s*([0-9]{2,6}(?:\.[0-9]{1,2})?)\s*起/g
    )
  ];

  return matches
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
}

function readDisplayPrice(card) {
  const candidates =
    priceCandidates(card);

  const unique = [
    ...new Set(candidates)
  ];

  if (unique.length === 1) {
    return {
      value: unique[0],
      source: "price-before-suffix:起",
      ambiguous: false,
      candidates: unique
    };
  }

  if (unique.length > 1) {
    /*
     * 旧 Codex 版本值得保留的原则：
     *
     * 无法确定时不硬猜。
     */

    return {
      value: null,
      source: null,
      ambiguous: true,
      candidates: unique
    };
  }

  return {
    value: null,
    source: null,
    ambiguous: false,
    candidates: []
  };
}

function readListPrice(card, displayPrice) {
  if (displayPrice == null) {
    return {
      value: null,
      source: null
    };
  }

  /*
   * 当前携程卡片通常：
   *
   * ¥156
   * ¥115
   * 起
   *
   * ¥156 是较高参考/划线价格，
   * ¥115 是展示价。
   *
   * 这里只从展示价之前的价格区域
   * 寻找高于展示价的候选。
   */

  const text = norm(
    card.innerText || ""
  );

  const suffixPattern =
    new RegExp(
      `¥\\s*${String(displayPrice).replace(".", "\\.")}\\s*起`
    );

  const match =
    suffixPattern.exec(text);

  if (!match) {
    return {
      value: null,
      source: null
    };
  }

  const before =
    text.slice(
      Math.max(0, match.index - 160),
      match.index
    );

  const candidates = [
    ...before.matchAll(
      /¥\s*([0-9]{2,6}(?:\.[0-9]{1,2})?)/g
    )
  ]
    .map((m) => Number(m[1]))
    .filter(
      (value) =>
        Number.isFinite(value) &&
        value > displayPrice
    );

  if (!candidates.length) {
    return {
      value: null,
      source: null
    };
  }

  /*
   * 选择离展示价最接近的较高价格。
   */

  const value =
    candidates[candidates.length - 1];

  return {
    value,
    source:
      "price-before-display-price"
  };
}

/* =========================================================
 * FACT
 * ========================================================= */

function parseCard(card, position) {
  const hotelId =
    readHotelId(card);

  const hotelName =
    readHotelName(card);

  const rating =
    readRating(card);

  const reviews =
    readReviewCount(card);

  const room =
    readRoomName(card);

  const ad =
    readAd(card);

  const sold =
    readSoldOut(card);

  const promotion =
    readPromotions(card);

  const displayPrice =
    readDisplayPrice(card);

  const listPrice =
    readListPrice(
      card,
      displayPrice.value
    );

  const officialId =
    validOfficialId(hotelId.value);

  const nameOk =
    Boolean(hotelName.value);

  const priceOk =
    sold.value ||
    (
      displayPrice.value != null &&
      Number.isFinite(
        Number(displayPrice.value)
      )
    );

  return {
    platform: PLATFORM,

    platform_hotel_id:
      officialId
        ? hotelId.value
        : null,

    hotel_name:
      hotelName.value || "",

    display_position:
      position,

    display_price:
      displayPrice.value,

    list_price:
      listPrice.value,

    currency: "CNY",

    sold_out:
      sold.value,

    is_ad:
      ad.value,

    rating:
      rating.value,

    review_count:
      reviews.value,

    room_name:
      room.value,

    promotions:
      promotion.value,

    source_url:
      location.href,

    quality: {
      card: true,
      name: nameOk,
      official_id: officialId,
      price: priceOk,
      ambiguous_price:
        displayPrice.ambiguous
    },

    evidence: {
      card_selector:
        CARD_SELECTOR,

      id_source:
        hotelId.source,

      name_source:
        hotelName.source,

      price_source:
        displayPrice.source,

      rating_source:
        rating.source,

      review_source:
        reviews.source,

      room_source:
        room.source,

      list_price_source:
        listPrice.source,

      promotion_source:
        promotion.source
    },

    raw: {
      price_candidates:
        displayPrice.candidates,

      preview:
        norm(
          card.innerText || ""
        ).slice(0, 400)
    }
  };
}

/* =========================================================
 * COLLECT
 * ========================================================= */

async function collect() {
  const LIMIT = 30;
  const MAX_ROUNDS = 20;
  const CHANGE_TIMEOUT = 2800;

  const facts = [];
  const seen = new Set();

  let rounds = 0;
  let skippedRecommendations = 0;
  let consecutiveNoNew = 0;

  function sleep(ms) {
    return new Promise((resolve) =>
      setTimeout(resolve, ms)
    );
  }

  function currentCards() {
    return [
      ...document.querySelectorAll(
        CARD_SELECTOR
      )
    ];
  }

  function factKey(fact) {
    if (fact.platform_hotel_id) {
      return `id:${fact.platform_hotel_id}`;
    }

    // 仅用于单次页面采集去重。
    // 不会写入 platform_hotel_id。
    return `name:${fact.hotel_name}`;
  }

  function cardSignature(card) {
    const id =
      card
        .querySelector(
          ".right-card[data-offline-hotelid]"
        )
        ?.getAttribute(
          "data-offline-hotelid"
        ) || "";

    const name =
      norm(
        card.querySelector(
          ".hotelName"
        )?.textContent || ""
      );

    return id
      ? `id:${id}`
      : `name:${name}`;
  }

  /**
   * 推荐模块防线。
   *
   * 普通搜索结果里的“广告”酒店不能跳过；
   * 这里只排除明显属于推荐模块的异形区域。
   */
  function isRecommendationCard(card) {
    const badWords = [
      "热门酒店",
      "达人推荐",
      "猜你喜欢",
      "您可能喜欢的酒店",
      "以下酒店满足您的部分要求",
      "推荐酒店",
      "广告推荐"
    ];

    let node = card.parentElement;

    // 只向上检查少量层级，避免误判整个页面。
    for (
      let depth = 0;
      node && depth < 4;
      depth += 1
    ) {
      const cls =
        String(node.className || "");

      const aria =
        String(
          node.getAttribute?.("aria-label") || ""
        );

      const marker =
        `${cls} ${aria}`;

      if (
        /recommend|guess|suggest|hot[-_]?hotel/i.test(
          marker
        )
      ) {
        const text =
          norm(node.innerText || "");

        if (
          badWords.some((word) =>
            text.includes(word)
          )
        ) {
          return true;
        }
      }

      node = node.parentElement;
    }

    return false;
  }

  function harvest() {
    const cards = currentCards();

    let added = 0;
    let skipped = 0;

    for (const card of cards) {
      if (facts.length >= LIMIT) {
        break;
      }

      if (isRecommendationCard(card)) {
        skipped += 1;
        skippedRecommendations += 1;
        continue;
      }

      const fact =
        parseCard(
          card,
          facts.length + 1
        );

      if (!fact.hotel_name) {
        continue;
      }

      const key =
        factKey(fact);

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      /**
       * 排名使用“首次发现顺序”。
       *
       * 携程是懒加载页面，当前 DOM index
       * 不能可靠代表整个列表的绝对排名。
       */
      fact.display_position =
        facts.length + 1;

      facts.push(fact);
      added += 1;
    }

    return {
      visible_cards:
        cards.length,

      added,

      total:
        facts.length,

      skipped_recommendations:
        skipped
    };
  }

  function currentSignatureSet() {
    return new Set(
      currentCards()
        .filter(
          (card) =>
            !isRecommendationCard(card)
        )
        .map(cardSignature)
        .filter(Boolean)
    );
  }

  /**
   * 等待携程真正加载/替换酒店卡片。
   *
   * 虚拟列表可能保持相同 DOM 数量，
   * 所以不能只比较 list-item 数量；
   * 必须比较酒店 ID / 名称签名是否出现变化。
   */
  function waitForListChange(
    previousSignatures,
    timeoutMs
  ) {
    return new Promise((resolve) => {
      let finished = false;

      const finish = (changed) => {
        if (finished) return;

        finished = true;
        observer.disconnect();
        clearTimeout(timer);

        resolve(changed);
      };

      const hasNewSignature = () => {
        const now =
          currentSignatureSet();

        for (const signature of now) {
          if (
            !previousSignatures.has(
              signature
            )
          ) {
            return true;
          }
        }

        return false;
      };

      const observer =
        new MutationObserver(() => {
          if (hasNewSignature()) {
            finish(true);
          }
        });

      observer.observe(
        document.body,
        {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: [
            "data-offline-hotelid",
            "data-exposure"
          ]
        }
      );

      const timer =
        setTimeout(
          () => finish(false),
          timeoutMs
        );

      // DOM 可能在 observer 创建前已经变化。
      if (hasNewSignature()) {
        finish(true);
      }
    });
  }

  function findScrollContainer() {
    const first =
      document.querySelector(
        CARD_SELECTOR
      );

    let node =
      first?.parentElement || null;

    while (node) {
      const style =
        getComputedStyle(node);

      const scrollable =
        /(auto|scroll)/.test(
          style.overflowY || ""
        );

      if (
        scrollable &&
        node.scrollHeight >
          node.clientHeight + 150
      ) {
        return node;
      }

      node =
        node.parentElement;
    }

    return (
      document.scrollingElement ||
      document.documentElement
    );
  }

  function smoothScroll(box) {
    const distance =
      Math.max(
        700,
        Math.round(
          window.innerHeight * 0.85
        )
      );

    if (
      box === document.scrollingElement ||
      box === document.documentElement ||
      box === document.body
    ) {
      window.scrollBy({
        top: distance,
        behavior: "smooth"
      });

      return;
    }

    box.scrollBy({
      top: Math.max(
        600,
        Math.round(
          box.clientHeight * 0.85
        )
      ),
      behavior: "smooth"
    });
  }

  // -------------------------------------------------------
  // 首屏
  // -------------------------------------------------------

  let state = harvest();

  console.info(
    "[酒店助手] 携程 Rank Monitor Round 0",
    state
  );

  // -------------------------------------------------------
  // 懒加载
  // -------------------------------------------------------

  while (
    facts.length < LIMIT &&
    rounds < MAX_ROUNDS
  ) {
    rounds += 1;

    const before =
      currentSignatureSet();

    const box =
      findScrollContainer();

    smoothScroll(box);

    const changed =
      await waitForListChange(
        before,
        CHANGE_TIMEOUT
      );

    /**
     * 给携程完成当前 DOM 渲染一个很短的稳定窗口。
     * 等待的主体仍然由 MutationObserver 驱动。
     */
    if (changed) {
      await sleep(180);
    }

    state = harvest();

    console.info(
      `[酒店助手] 携程 Rank Monitor Round ${rounds}`,
      {
        ...state,
        dom_changed:
          changed
      }
    );

    if (state.added > 0) {
      consecutiveNoNew = 0;
    } else {
      consecutiveNoNew += 1;
    }

    if (facts.length >= LIMIT) {
      break;
    }

    /**
     * 连续多轮没有发现任何新的标准酒店，
     * 才认为页面没有继续加载。
     */
    if (consecutiveNoNew >= 4) {
      break;
    }
  }

  const reachedTarget =
    facts.length >= LIMIT;

  const stopReason =
    reachedTarget
      ? "rank_limit"
      : consecutiveNoNew >= 4
        ? "no_more_standard_hotels"
        : rounds >= MAX_ROUNDS
          ? "max_rounds"
          : "completed";

  console.info(
    "[酒店助手] 携程 Rank Monitor 完成",
    {
      total:
        facts.length,

      target:
        LIMIT,

      stop_reason:
        stopReason,

      skipped_recommendations:
        skippedRecommendations
    }
  );

  return {
    facts:
      facts.slice(0, LIMIT),

    meta: {
      adapter:
        "ctrip-v1",

      strategy:
        "rank-monitor-mutation-observer",

      card_selector:
        CARD_SELECTOR,

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

      skipped_recommendations:
        skippedRecommendations
    }
  };
}

/* =========================================================
 * ADAPTER
 * ========================================================= */

export const ctripAdapter =
  createAdapter({
    platform: PLATFORM,

    match(loc = location) {
      return (
        /(^|\.)hotels\.ctrip\.com$/i.test(
          loc.hostname
        ) &&
        /\/hotels\/list/i.test(
          loc.pathname
        )
      );
    },

    collect
  });

export default ctripAdapter;
