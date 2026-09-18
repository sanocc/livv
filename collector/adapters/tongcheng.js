import { createAdapter } from "./base.js";

const PLATFORM = "tongcheng";
const TARGET = 30;
const MAX_ROUNDS = 10;
const CHANGE_TIMEOUT = 4500;

const norm = (v) =>
  String(v || "").replace(/\s+/g, " ").trim();

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function normalizeId(value) {
  const raw = String(value || "").trim();

  if (!/^\d{4,}$/.test(raw)) {
    return null;
  }

  return raw.replace(/^0+(?=\d)/, "");
}

function isHotelCard(card) {
  if (!card || card.tagName !== "LI") {
    return false;
  }

  const text = norm(card.innerText);

  return (
    /酒店|宾馆|旅店|民宿|客栈|公寓/i.test(text) &&
    /¥\s*\d+/.test(text) &&
    /条点评/.test(text) &&
    /查看详情/.test(text)
  );
}

function findCards() {
  return [
    ...document.querySelectorAll("li")
  ].filter(isHotelCard);
}

function findLink(card) {
  if (card.parentElement?.matches("a[href]")) {
    return card.parentElement;
  }

  return card.closest("a[href]");
}

function decodedHref(href) {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
}

function traceField(href, field) {
  const decoded = decodedHref(href);

  const escaped = field.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

  return (
    decoded.match(
      new RegExp(`\\b${escaped}:([0-9]+)`, "i")
    ) || []
  )[1] || null;
}

function readIdentity(card) {
  const link = findLink(card);
  const href = link?.href || "";

  let hotelIdRaw = null;

  try {
    hotelIdRaw =
      new URL(href).searchParams.get("hotelId");
  } catch {}

  const hidRaw = traceField(href, "hId");

  const hotelId = normalizeId(hotelIdRaw);
  const hid = normalizeId(hidRaw);

  const conflict = Boolean(
    hotelId &&
    hid &&
    hotelId !== hid
  );

  return {
    value:
      conflict
        ? null
        : (hid || hotelId || null),

    source:
      conflict
        ? null
        : (
            hid
              ? "traceToken.hId"
              : hotelId
                ? "href.hotelId"
                : null
          ),

    hotelId,
    hotelIdRaw,
    hid,
    hidRaw,
    conflict,
    href
  };
}

function readName(card) {
  const alt = norm(
    card.querySelector("img[alt]")
      ?.getAttribute("alt")
  );

  if (alt) {
    return {
      value: alt,
      source: "img[alt]"
    };
  }

  const value = [
    ...card.querySelectorAll("dd")
  ]
    .map((node) => norm(node.textContent))
    .find(Boolean);

  return {
    value: value || null,
    source: value ? "dd:text" : null
  };
}

function readPrice(card) {
  const text = norm(card.innerText);

  const display = text.match(
    /¥\s*([0-9]{1,6}(?:\.\d+)?)\s*起/
  );

  const list = text.match(
    /¥\s*([0-9]{1,6}(?:\.\d+)?)\s+¥\s*[0-9]{1,6}(?:\.\d+)?\s*起/
  );

  return {
    display:
      display ? Number(display[1]) : null,

    list:
      list ? Number(list[1]) : null
  };
}

function readRating(card) {
  const match = norm(card.innerText).match(
    /(?:^|\s)([1-5](?:\.\d)?)\s+(?:超棒|很好|不错|一般|较差)(?=\s|$)/
  );

  return match ? Number(match[1]) : null;
}

function readReviews(card) {
  const match = norm(card.innerText).match(
    /(\d+)\s*条点评/
  );

  return match ? Number(match[1]) : null;
}

function readPromotions(card) {
  const text = norm(card.innerText);
  const values = [];

  for (const pattern of [
    /特惠红包等\d+项/g,
    /平台优惠等\d+项/g,
    /优惠\d+元/g,
    /集团旗舰店/g
  ]) {
    for (const match of text.matchAll(pattern)) {
      values.push(norm(match[0]));
    }
  }

  return [...new Set(values)];
}

function parseCard(card) {
  const identity = readIdentity(card);
  const name = readName(card);
  const price = readPrice(card);

  const soldOut =
    /售罄|满房|暂无可订|无房/
      .test(norm(card.innerText));

  return {
    platform: PLATFORM,

    platform_hotel_id:
      identity.value,

    hotel_name:
      name.value,

    display_position:
      null,

    display_price:
      price.display,

    list_price:
      price.list,

    currency: "CNY",

    sold_out: soldOut,

    is_ad: false,

    rating:
      readRating(card),

    review_count:
      readReviews(card),

    room_name: null,

    promotions:
      readPromotions(card),

    source_url:
      location.href,

    quality: {
      card: true,

      name:
        Boolean(name.value),

      official_id:
        Boolean(identity.value),

      price:
        soldOut ||
        price.display != null,

      ambiguous_price: false,

      identity_status:
        identity.conflict
          ? "conflict"
          : identity.value
            ? "exact"
            : "missing",

      identity_conflict:
        identity.conflict
    },

    evidence: {
      card_selector:
        "LI hotel-result",

      id_source:
        identity.source,

      hotel_id:
        identity.hotelId,

      hotel_id_raw:
        identity.hotelIdRaw,

      hid:
        identity.hid,

      hid_raw:
        identity.hidRaw,

      hotel_id_matches_hid:
        Boolean(
          identity.hotelId &&
          identity.hid &&
          identity.hotelId === identity.hid
        ),

      name_source:
        name.source,

      page_index:
        traceField(
          identity.href,
          "page_index"
        ),

      page_size:
        traceField(
          identity.href,
          "page_size"
        ),

      page_pos:
        traceField(
          identity.href,
          "pos"
        ),

      global_rank_source:
        "append-unique-official-id-order"
    },

    raw: {
      href:
        identity.href,

      preview:
        norm(card.innerText).slice(0, 500)
    }
  };
}

function currentSignature() {
  return findCards()
    .map((card) =>
      readIdentity(card).value || "missing"
    )
    .join(",");
}

function appendFacts(facts, seen) {
  const cards = findCards();

  let added = 0;
  let duplicates = 0;
  let missing = 0;

  for (const card of cards) {
    if (facts.length >= TARGET) {
      break;
    }

    const fact = parseCard(card);
    const id = fact.platform_hotel_id;

    if (!fact.hotel_name) {
      continue;
    }

    if (!id) {
      /*
       * 不允许名称冒充ID。
       * 保留异常事实给 Quality Gate。
       */
      fact.display_position =
        facts.length + 1;

      facts.push(fact);
      missing += 1;
      continue;
    }

    if (seen.has(id)) {
      duplicates += 1;
      continue;
    }

    seen.add(id);

    fact.display_position =
      facts.length + 1;

    facts.push(fact);
    added += 1;
  }

  return {
    dom_card_count:
      cards.length,

    added,

    duplicates,

    missing,

    cumulative:
      facts.length
  };
}

function waitForAppend(
  beforeCount,
  beforeSignature
) {
  return new Promise((resolve) => {
    let done = false;

    const finish = (reason) => {
      if (done) return;

      done = true;

      observer.disconnect();
      clearInterval(poll);
      clearTimeout(timer);

      resolve(reason);
    };

    const check = () => {
      const cards = findCards();
      const signature =
        currentSignature();

      if (cards.length > beforeCount) {
        return "card_count_increased";
      }

      if (
        signature &&
        signature !== beforeSignature
      ) {
        return "signature_changed";
      }

      return null;
    };

    const observer =
      new MutationObserver(() => {
        const reason = check();

        if (reason) {
          finish(reason);
        }
      });

    observer.observe(
      document.body,
      {
        subtree: true,
        childList: true
      }
    );

    const poll =
      setInterval(() => {
        const reason = check();

        if (reason) {
          finish(reason);
        }
      }, 150);

    const timer =
      setTimeout(
        () => finish("timeout"),
        CHANGE_TIMEOUT
      );
  });
}

async function requestMore() {
  /*
   * 正常向下浏览。
   * 加载成功由 DOM 变化判断，
   * 不是由固定 sleep 判断。
   */
  const maxY =
    Math.max(
      0,
      document.documentElement.scrollHeight -
      window.innerHeight
    );

  const targetY =
    Math.min(
      maxY,
      window.scrollY +
      Math.max(
        Math.round(
          window.innerHeight * 0.9
        ),
        850
      )
    );

  window.scrollTo({
    top: targetY,
    behavior: "smooth"
  });

  await sleep(500);
}

export async function collectTongcheng() {
  const facts = [];
  const seen = new Set();
  const rounds = [];

  let stopReason = "unknown";

  const first =
    appendFacts(
      facts,
      seen
    );

  rounds.push({
    round: 0,
    change_reason: "initial_dom",
    ...first
  });

  console.info(
    "[酒店助手] 同程 Rank Monitor Round 0",
    rounds[0]
  );

  for (
    let round = 1;
    round <= MAX_ROUNDS &&
    facts.length < TARGET;
    round += 1
  ) {
    const beforeCount =
      findCards().length;

    const beforeSignature =
      currentSignature();

    /*
     * 先建立监听，再滚动。
     */
    const wait =
      waitForAppend(
        beforeCount,
        beforeSignature
      );

    await requestMore();

    const changeReason =
      await wait;

    /*
     * 新卡刚出现时留一个短稳定窗口。
     */
    if (changeReason !== "timeout") {
      await sleep(350);
    }

    const result =
      appendFacts(
        facts,
        seen
      );

    rounds.push({
      round,
      change_reason:
        changeReason,
      ...result
    });

    console.info(
      `[酒店助手] 同程 Rank Monitor Round ${round}`,
      rounds[
        rounds.length - 1
      ]
    );

    if (facts.length >= TARGET) {
      stopReason = "rank_limit";
      break;
    }

    if (
      changeReason === "timeout" &&
      result.added === 0
    ) {
      /*
       * 可能还没滚到列表触发区。
       * 允许下一 Round 继续向下，
       * 不在第一次 timeout 就退出。
       */
      stopReason =
        "waiting_more";
    }
  }

  if (facts.length >= TARGET) {
    stopReason = "rank_limit";
  } else if (
    stopReason === "unknown" ||
    stopReason === "waiting_more"
  ) {
    stopReason = "max_rounds";
  }

  const finalFacts =
    facts.slice(0, TARGET);

  const official =
    finalFacts.filter(
      (fact) =>
        fact.quality
          ?.official_id
    ).length;

  const conflicts =
    finalFacts.filter(
      (fact) =>
        fact.quality
          ?.identity_conflict
    ).length;

  console.info(
    "[酒店助手] 同程 Rank Monitor 完成",
    {
      facts:
        finalFacts.length,

      official_ids:
        official,

      conflicts,

      reached_target:
        finalFacts.length >= TARGET,

      stop_reason:
        stopReason
    }
  );

  return {
    facts:
      finalFacts,

    meta: {
      adapter:
        "tongcheng-v1",

      strategy:
        "append-unique-official-id",

      target_limit:
        TARGET,

      rounds,

      rounds_run:
        rounds.length,

      card_count:
        findCards().length,

      fact_count:
        finalFacts.length,

      official_id_count:
        official,

      identity_conflict_count:
        conflicts,

      reached_target:
        finalFacts.length >= TARGET,

      stop_reason:
        stopReason
    }
  };
}

export const tongchengAdapter =
  createAdapter({
    platform:
      PLATFORM,

    match(loc = location) {
      const host =
        loc.hostname;

      return (
        (
          /(^|\.)ly\.com$/i
            .test(host) ||
          /(^|\.)tongcheng\.com$/i
            .test(host)
        ) &&
        /hotel/i.test(
          `${host}${loc.pathname}`
        )
      );
    },

    collect:
      collectTongcheng
  });

export default tongchengAdapter;
