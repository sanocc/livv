import { createAdapter } from "./base.js";

/**
 * LIVV Collector M04
 * Fliggy Adapter V1 / First Page
 *
 * 已确认：
 * - 标准卡：div.list-row.J_ListRow[data-shid]
 * - 官方ID：data-shid
 * - 酒店名称：data-name
 * - 页面排名：data-idx
 *
 * 身份原则：
 * - platform_hotel_id 只允许来自 data-shid
 * - 禁止酒店名称冒充 ID
 * - 禁止模糊名称匹配
 */

const PLATFORM = "fliggy";

const CARD_SELECTOR =
  "div.list-row.J_ListRow[data-shid]";

function norm(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function validOfficialId(value) {
  return /^\d{4,}$/.test(
    String(value || "")
  );
}

function numberFromText(value) {
  const match =
    String(value || "")
      .replace(/,/g, "")
      .match(/\d+(?:\.\d+)?/);

  if (!match) {
    return null;
  }

  const number =
    Number(match[0]);

  return Number.isFinite(number)
    ? number
    : null;
}

function readOfficialId(card) {
  const value =
    norm(
      card.getAttribute(
        "data-shid"
      )
    );

  return {
    value:
      validOfficialId(value)
        ? value
        : null,

    source:
      validOfficialId(value)
        ? "data-shid"
        : null
  };
}

function readHotelName(card) {
  const attr =
    norm(
      card.getAttribute(
        "data-name"
      )
    );

  if (attr) {
    return {
      value: attr,
      source: "data-name"
    };
  }

  /*
   * 仅作为名称字段 fallback，
   * 绝不参与官方 ID。
   */
  const links = [
    ...card.querySelectorAll(
      'a[href*="hotel_detail"]'
    )
  ];

  const candidate =
    links
      .map((a) =>
        norm(a.textContent)
      )
      .find((text) =>
        text &&
        text !== "查看详情" &&
        !/\/5分|用户评价/.test(text)
      ) || "";

  return {
    value:
      candidate || null,

    source:
      candidate
        ? "detail-link-text"
        : null
  };
}

function readRank(card, fallback) {
  const raw =
    norm(
      card.getAttribute(
        "data-idx"
      )
    );

  const value =
    Number(raw);

  return {
    value:
      Number.isInteger(value) &&
      value > 0
        ? value
        : fallback,

    source:
      Number.isInteger(value) &&
      value > 0
        ? "data-idx"
        : "dom-order"
  };
}

function readDisplayPrice(card) {
  const text =
    norm(card.innerText);

  const match =
    text.match(
      /¥\s*([0-9]{1,6}(?:\.\d+)?)\s*起/
    );

  return {
    value:
      match
        ? Number(match[1])
        : null,

    source:
      match
        ? "card:text:¥起"
        : null,

    ambiguous:
      false
  };
}

function readRating(card) {
  const text =
    norm(card.innerText);

  /*
   * “暂无评分”必须允许 rating=null。
   */
  if (/暂无评分/.test(text)) {
    return {
      value: null,
      text: "暂无评分",
      source:
        "card:text:暂无评分"
    };
  }

  const match =
    text.match(
      /([0-5](?:\.\d+)?)\s*\/\s*5\s*分?/
    );

  return {
    value:
      match
        ? Number(match[1])
        : null,

    text:
      match
        ? match[0]
        : null,

    source:
      match
        ? "card:text:/5"
        : null
  };
}

function readReviewCount(card) {
  const text =
    norm(card.innerText);

  const match =
    text.match(
      /用户评价\s*([0-9]{1,9})\s*条/
    );

  return {
    value:
      match
        ? Number(match[1])
        : null,

    source:
      match
        ? "card:text:用户评价"
        : null
  };
}

function readPromotions(card) {
  const text =
    norm(card.innerText);

  const known = [
    "会员价",
    "立减",
    "全人群运营活动",
    "首住特惠",
    "F4会员专享",
    "信用住"
  ];

  const values =
    known.filter(
      (value) =>
        text.includes(value)
    );

  return {
    value:
      [...new Set(values)],

    source:
      values.length
        ? "card:text:promotion"
        : null
  };
}

function readLatestBooking(card) {
  const text =
    norm(card.innerText);

  const match =
    text.match(
      /((?:\d+\s*(?:分钟|小时|天)|刚刚)前有人预订了该酒店)/
    );

  return {
    value:
      match
        ? norm(match[1])
        : null,

    source:
      match
        ? "card:text:latest-booking"
        : null
  };
}

function readDetailShid(card) {
  const link =
    card.querySelector(
      'a[href*="hotel_detail2.htm"][href*="shid="]'
    );

  if (!link?.href) {
    return null;
  }

  try {
    const value =
      new URL(link.href)
        .searchParams
        .get("shid");

    return validOfficialId(value)
      ? String(value)
      : null;
  } catch {
    return null;
  }
}

function readSoldOut(card) {
  const text =
    norm(card.innerText);

  return (
    /售罄|满房|暂无可订|无房/.test(
      text
    )
  );
}

function parseCard(
  card,
  fallbackPosition
) {
  const officialId =
    readOfficialId(card);

  const name =
    readHotelName(card);

  const rank =
    readRank(
      card,
      fallbackPosition
    );

  const price =
    readDisplayPrice(card);

  const rating =
    readRating(card);

  const reviews =
    readReviewCount(card);

  const promotions =
    readPromotions(card);

  const booking =
    readLatestBooking(card);

  const detailShid =
    readDetailShid(card);

  const soldOut =
    readSoldOut(card);

  const idEvidenceMatch =
    Boolean(
      officialId.value &&
      detailShid &&
      officialId.value ===
        detailShid
    );

  const priceOk =
    soldOut ||
    price.value != null;

  return {
    platform:
      PLATFORM,

    platform_hotel_id:
      officialId.value,

    hotel_name:
      name.value,

    display_position:
      rank.value,

    display_price:
      price.value,

    list_price:
      null,

    currency:
      "CNY",

    sold_out:
      soldOut,

    is_ad:
      false,

    rating:
      rating.value,

    review_count:
      reviews.value,

    room_name:
      null,

    promotions:
      promotions.value,

    source_url:
      location.href,

    quality: {
      card: true,

      name:
        Boolean(name.value),

      official_id:
        Boolean(
          officialId.value
        ),

      price:
        priceOk,

      ambiguous_price:
        price.ambiguous,

      identity_status:
        officialId.value
          ? "exact"
          : "missing",

      identity_conflict:
        Boolean(
          officialId.value &&
          detailShid &&
          officialId.value !==
            detailShid
        )
    },

    evidence: {
      card_selector:
        CARD_SELECTOR,

      id_source:
        officialId.source,

      name_source:
        name.source,

      rank_source:
        rank.source,

      price_source:
        price.source,

      rating_source:
        rating.source,

      review_source:
        reviews.source,

      promotion_source:
        promotions.source,

      booking_source:
        booking.source,

      detail_shid:
        detailShid,

      detail_shid_matches:
        idEvidenceMatch
    },

    raw: {
      shid:
        officialId.value,

      detail_shid:
        detailShid,

      data_idx:
        card.getAttribute(
          "data-idx"
        ),

      data_name:
        card.getAttribute(
          "data-name"
        ),

      lat:
        card.getAttribute(
          "data-lat"
        ),

      lng:
        card.getAttribute(
          "data-lng"
        ),

      rating_text:
        rating.text,

      latest_booking:
        booking.value,

      preview:
        norm(card.innerText)
          .slice(0, 500)
    }
  };
}

async function collect() {
  const LIMIT = 30;
  const PAGE_SIZE = 10;

  /*
   * 飞猪分页结果可能跨页重复酒店。
   *
   * 因此不能假定：
   * 3页 × 10张 = 30个唯一酒店。
   *
   * 正式停止条件是累计30个唯一官方酒店ID。
   * MAX_PAGES 只是安全上限。
   */
  const MAX_PAGES = 8;
  const CHANGE_TIMEOUT = 6000;

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

  function pageSignature() {
    return cards()
      .map((card) =>
        String(
          card.getAttribute(
            "data-shid"
          ) || ""
        )
      )
      .filter(Boolean)
      .join(",");
  }

  function waitForPageChange(
    beforeSignature
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
          const signature =
            pageSignature();

          if (
            signature &&
            signature !==
              beforeSignature
          ) {
            return "page_changed";
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
            childList: true,
            attributes: true,
            attributeFilter: [
              "data-shid",
              "data-idx",
              "data-name"
            ]
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

  function nextButton() {
    return document.querySelector(
      "a.pi-pagination-next"
    );
  }

  const facts = [];
  const seen = new Set();
  const pages = [];

  let stopReason =
    "completed";

  for (
    let page = 1;
    page <= MAX_PAGES;
    page += 1
  ) {
    /*
     * 等当前页稳定。
     */
    await sleep(180);

    const currentCards =
      cards();

    const signature =
      pageSignature();

    const pageFacts = [];

    for (
      let index = 0;
      index < currentCards.length;
      index += 1
    ) {
      if (
        facts.length >= LIMIT
      ) {
        break;
      }

      const fact =
        parseCard(
          currentCards[index],
          index + 1
        );

      if (
        !fact ||
        !fact.hotel_name
      ) {
        continue;
      }

      /*
       * 飞猪每页 data-idx 都重新从 1～10。
       *
       * 所以正式全局排名绝不能使用
       * data-idx。
       *
       * global rank =
       * 已累计酒店数量 + 1
       */
      const globalRank =
        facts.length + 1;

      fact.display_position =
        globalRank;

      fact.evidence = {
        ...(fact.evidence || {}),

        page_number:
          page,

        page_data_idx:
          currentCards[index]
            .getAttribute(
              "data-idx"
            ),

        global_rank_source:
          "pagination-accumulated-dom-order"
      };

      const key =
        fact.platform_hotel_id
          ? `id:${fact.platform_hotel_id}`
          : null;

      /*
       * 没有官方 ID 的事实仍交给
       * Quality Gate 判定，但绝不能
       * 使用酒店名称充当 ID。
       */
      if (
        key &&
        seen.has(key)
      ) {
        continue;
      }

      if (key) {
        seen.add(key);
      }

      facts.push(fact);
      pageFacts.push(fact);
    }

    pages.push({
      page,

      dom_card_count:
        currentCards.length,

      collected_count:
        pageFacts.length,

      duplicate_count:
        Math.max(
          0,
          currentCards.length -
            pageFacts.length
        ),

      cumulative_unique_count:
        facts.length,

      first_global_rank:
        pageFacts[0]
          ?.display_position ??
        null,

      last_global_rank:
        pageFacts[
          pageFacts.length - 1
        ]?.display_position ??
        null,

      signature,

      ids:
        pageFacts.map(
          (fact) =>
            fact.platform_hotel_id
        )
    });

    console.info(
      `[酒店助手] 飞猪 Pagination Rank Monitor Page ${page}`,
      pages[
        pages.length - 1
      ]
    );

    if (
      facts.length >= LIMIT
    ) {
      stopReason =
        "rank_limit";
      break;
    }

    if (
      page >= MAX_PAGES
    ) {
      stopReason =
        "max_pages";
      break;
    }

    const next =
      nextButton();

    if (!next) {
      stopReason =
        "no_next_page";
      break;
    }

    const disabled =
      next.classList.contains(
        "pi-pagination-disabled"
      ) ||
      next.getAttribute(
        "aria-disabled"
      ) === "true";

    if (disabled) {
      stopReason =
        "no_next_page";
      break;
    }

    const beforeSignature =
      signature;

    next.click();

    const changeReason =
      await waitForPageChange(
        beforeSignature
      );

    console.info(
      `[酒店助手] 飞猪翻页 ${page} → ${page + 1}`,
      {
        change_reason:
          changeReason
      }
    );

    if (
      changeReason ===
      "timeout"
    ) {
      stopReason =
        "page_change_timeout";
      break;
    }

    /*
     * 页面刚替换时再给一点稳定时间，
     * 防止读到过渡 DOM。
     */
    await sleep(220);
  }

  const official =
    facts.filter(
      (fact) =>
        fact.quality
          ?.official_id
    ).length;

  const conflicts =
    facts.filter(
      (fact) =>
        fact.quality
          ?.identity_conflict
    ).length;

  const reachedTarget =
    facts.length >= LIMIT;

  if (
    reachedTarget
  ) {
    stopReason =
      "rank_limit";
  }

  console.info(
    "[酒店助手] 飞猪 Pagination Rank Monitor 完成",
    {
      facts:
        facts.length,

      official_ids:
        official,

      conflicts,

      reached_target:
        reachedTarget,

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
        "fliggy-v1",

      strategy:
        "pagination-unique-data-shid",

      card_selector:
        CARD_SELECTOR,

      page_size:
        PAGE_SIZE,

      pages_visited:
        pages.length,

      pages,

      card_count:
        pages.reduce(
          (
            total,
            item
          ) =>
            total +
            item.dom_card_count,
          0
        ),

      fact_count:
        Math.min(
          facts.length,
          LIMIT
        ),

      target_limit:
        LIMIT,

      official_id_count:
        official,

      identity_conflict_count:
        conflicts,

      reached_target:
        reachedTarget,

      stop_reason:
        stopReason
    }
  };
}

export const fliggyAdapter =
  createAdapter({
    platform:
      PLATFORM,

    match(
      loc = location
    ) {
      return (
        /(^|\.)fliggy\.com$/i
          .test(
            loc.hostname
          ) ||
        /(^|\.)alitrip\.com$/i
          .test(
            loc.hostname
          ) ||
        /(^|\.)taobao\.com$/i
          .test(
            loc.hostname
          )
      ) &&
      /hotel/i.test(
        `${loc.hostname}${loc.pathname}`
      );
    },

    collect
  });

export default fliggyAdapter;
