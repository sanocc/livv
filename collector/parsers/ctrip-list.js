window.__livvScrapeCtripList = async function livvScrapeCtripList() {
  const LIMIT = 30;
  const hotels = [];
  const seen = new Set();

  const sleep = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  function norm(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function numberFromText(value) {
    const m = String(value || "").match(/[\d,]+(?:\.\d+)?/);
    if (!m) return null;

    const n = Number(m[0].replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  function officialHotelId(card) {
    const right = card.querySelector(
      ".right-card[data-offline-hotelid]"
    );

    const direct = right?.getAttribute(
      "data-offline-hotelid"
    );

    if (direct && /^\d{4,}$/.test(direct)) {
      return direct;
    }

    /*
     * 第二证据：
     * list-item 的 data-exposure JSON 中目前包含
     * masterhotelid。
     */
    const exposure =
      card.getAttribute("data-exposure") || "";

    if (exposure) {
      try {
        const parsed = JSON.parse(exposure);
        const id =
          parsed?.data?.masterhotelid ??
          parsed?.masterhotelid;

        if (id && /^\d{4,}$/.test(String(id))) {
          return String(id);
        }
      } catch {
        const hit = exposure.match(
          /masterhotelid[^0-9]{0,10}(\d{4,})/i
        );

        if (hit) return hit[1];
      }
    }

    return "";
  }

  function salePrice(card) {
    const text = card.innerText || "";
    const normalized = norm(text);

    /*
     * 携程列表卡当前形式：
     *
     * ¥156
     * ¥115
     * 起
     *
     * 归一化后是：
     * ¥156 ¥115 起
     *
     * 因此直接取紧邻“起”的价格，
     * 避免把“降价¥9 / 优惠¥xx”等金额当房价。
     */
    const hit = normalized.match(
      /¥\s*([0-9]{2,6}(?:\.[0-9]{1,2})?)\s*起/
    );

    if (!hit) return null;

    const n = Number(hit[1]);

    return Number.isFinite(n) ? n : null;
  }

  function listPrice(card, sale) {
    if (sale == null) return null;

    const text = card.innerText || "";

    const prices = [
      ...text.matchAll(
        /¥\s*([0-9]{2,6}(?:\.[0-9]{1,2})?)/g
      )
    ]
      .map((m) => Number(m[1]))
      .filter(
        (n) =>
          Number.isFinite(n) &&
          n > sale &&
          n <= 99999
      );

    if (!prices.length) return null;

    /*
     * 划线价通常紧邻展示价且高于展示价。
     * 取最低的高价，避免抓到卡片中其它较大金额。
     */
    return Math.min(...prices);
  }

  function promotions(card) {
    const text = norm(card.innerText || "");

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

    const result = [];

    for (const item of catalog) {
      if (text.includes(item)) {
        result.push(item);
      }
    }

    const lowRooms = text.match(
      /低价房仅剩\d+间/
    );

    if (lowRooms) {
      result.push(lowRooms[0]);
    }

    const booking = text.match(
      /(?:刚刚|\d+(?:\.\d+)?(?:分钟|小时|天))前有人预订/
    );

    if (booking) {
      result.push(booking[0]);
    }

    const priceDrop = text.match(
      /(?:比收藏时)?降价¥\s*\d+/
    );

    if (priceDrop) {
      result.push(priceDrop[0].replace(/\s+/g, ""));
    }

    return result;
  }

  function parseCard(card, position) {
    const nameEl = card.querySelector(".hotelName");

    const hotel_name = norm(
      nameEl?.textContent || ""
    );

    if (!hotel_name) return null;

    const platform_hotel_id =
      officialHotelId(card);

    const rating = numberFromText(
      card.querySelector(".score")?.textContent
    );

    const review_count = numberFromText(
      card.querySelector(".comment-num")?.textContent
    );

    const room_name = norm(
      card.querySelector(".room-name")?.textContent
    ) || null;

    const price = salePrice(card);

    const list_price =
      listPrice(card, price);

    const is_ad =
      Boolean(card.querySelector(".ad-info")) ||
      /(^|\s)广告($|\s)/.test(
        norm(card.innerText || "")
      );

    return {
      /*
       * 非常重要：
       * 没拿到携程官方 ID 时，不再使用酒店名称冒充 ID。
       */
      ...(platform_hotel_id
        ? { platform_hotel_id }
        : {}),

      hotel_name,

      /*
       * 当前取页面卡片实际 DOM 顺序，
       * 而不是“成功解析的第几个酒店”。
       */
      rank: position,

      price,

      sold_out: price == null,

      source_url: location.href,

      raw: {
        hotel_id:
          platform_hotel_id || null,

        id_source:
          platform_hotel_id
            ? "data-offline-hotelid"
            : null,

        is_ad,

        rating,

        review_count,

        room_name,

        promotions:
          promotions(card),

        list_price,

        sale_price: price,

        preview:
          norm(card.innerText || "").slice(
            0,
            300
          )
      }
    };
  }

  function harvest() {
    const cards = [
      ...document.querySelectorAll(
        "div.list-item"
      )
    ];

    cards.forEach((card, index) => {
      if (hotels.length >= LIMIT) return;

      const parsed =
        parseCard(card, index + 1);

      if (!parsed) return;

      const key =
        parsed.platform_hotel_id ||
        `name:${parsed.hotel_name}`;

      if (seen.has(key)) return;

      seen.add(key);
      hotels.push(parsed);
    });
  }

  function scrollContainer() {
    const card =
      document.querySelector("div.list-item");

    let parent = card?.parentElement;

    while (parent) {
      if (
        parent.scrollHeight >
        parent.clientHeight + 150
      ) {
        return parent;
      }

      parent = parent.parentElement;
    }

    return (
      document.scrollingElement ||
      document.documentElement
    );
  }

  harvest();

  for (
    let i = 0;
    i < 6 && hotels.length < LIMIT;
    i += 1
  ) {
    const box = scrollContainer();

    if (box === document.scrollingElement ||
        box === document.documentElement) {
      window.scrollBy(
        0,
        Math.round(window.innerHeight * 1.1)
      );
    } else {
      box.scrollTop += Math.max(
        700,
        Math.round(box.clientHeight * 1.05)
      );
    }

    await sleep(1000);
    harvest();
  }

  return {
    host: location.hostname,
    href: location.href,
    title: document.title,
    count: hotels.length,
    hotels
  };
};
