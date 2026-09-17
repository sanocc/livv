window.__livvScrapeCtripList = async function livvScrapeCtripList() {
  const LIMIT = 30;
  const seen = new Set();
  const hotels = [];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function norm(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  function yenNumbers(text) {
    return [...String(text || "").matchAll(/¥\s*([0-9]{2,6})/g)].map((m) => Number(m[1]));
  }

  function hotelIdFromNode(el) {
    if (!el) return "";
    const keys = [
      "data-offline-hotelid",
      "data-hotel-id",
      "data-hotelid",
      "data-hotelId",
      "hotelid",
    ];
    let cur = el;
    for (let i = 0; i < 8 && cur; i++) {
      for (const key of keys) {
        const val = cur.getAttribute && cur.getAttribute(key);
        if (val && /^\d{5,}$/.test(val)) return val;
      }
      const hit = cur.querySelector && cur.querySelector("[data-offline-hotelid], [data-hotel-id], [data-hotelid]");
      if (hit) {
        const val = hit.getAttribute("data-offline-hotelid") || hit.getAttribute("data-hotel-id") || hit.getAttribute("data-hotelid");
        if (val && /^\d{5,}$/.test(val)) return val;
      }
      cur = cur.parentElement;
    }
    return "";
  }

  function isHotelName(name) {

    if (!name || name.length < 4 || name.length > 80) return false;
    if (name === "酒店") return false;
    if (/上榜酒店|广告酒店|携程酒店|预订查询|找到\d+家|在地图上|查看详情|查看地图|热门筛选/.test(name)) return false;
    if (/^(高级|豪华|商务|精选|舒适)?(大床房|双床房|单人房|套房|标准房|景观房)/.test(name)) return false;
    return /酒店|饭店|宾馆|旅馆|民宿|客栈|度假村|公寓|Hostel|Hotel|Inn/i.test(name);
  }

  function parseCard(text, href) {
    const t = norm(text);
    if (!t.includes("¥")) return null;

    const lines = String(text || "")
      .split("\n")
      .map(norm)
      .filter(Boolean);

    const nameLine = lines.find((line) => isHotelName(line.replace(/广告/g, "").trim()));
    if (!nameLine) return null;
    const hotel_name = nameLine.replace(/广告/g, "").replace(/[●▪·]+/g, "·").trim();
    const is_ad = /广告/.test(nameLine) || /广告/.test(lines.slice(0, 4).join(" "));

    const ratingMatch = t.match(/\b([1-5]\.\d)\b/);
    const reviewMatch = t.match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{2,6})\s*条点评/);
    const roomLine = lines.find((line) =>
      /(大床房|双床房|单人房|套房|标准房|家庭房|客房|床房)/.test(line) &&
      !/点评|好评|取消/.test(line) &&
      line.length < 60,
    );

    const promoCatalog = [
      "早鸟优惠",
      "门店首单",
      "折扣券",
      "十亿豪补",
      "特惠一口价",
      "新客体验钻石",
      "新客专享",
      "会员优惠",
      "今夜特价",
    ];
    const promoBits = promoCatalog
      .map((name) => ({ name, i: t.indexOf(name) }))
      .filter((x) => x.i >= 0)
      .sort((a, b) => a.i - b.i)
      .map((x) => x.name);

    let sale_price = null;
    const startMatch = t.match(/¥\s*([0-9]{2,6})\s*起/);
    if (startMatch) sale_price = Number(startMatch[1]);
    const prices = yenNumbers(t).filter((n) => n >= 50 && n <= 99999);
    if (sale_price == null && prices.length) sale_price = Math.min(...prices);
    const list_price =
      prices.find((n) => sale_price != null && n > sale_price) ||
      (prices.length > 1 ? Math.max(...prices) : null);

    return {
      hotel_name,
      is_ad,
      rating: ratingMatch ? Number(ratingMatch[1]) : null,
      review_count: reviewMatch ? Number(reviewMatch[1].replace(/,/g, "")) : null,
      room_name: roomLine || null,
      promotions: promoBits,
      list_price,
      sale_price,
      source_url: href || location.href,
      preview: t.slice(0, 220),
    };
  }

  function harvest() {
    const nodes = [...document.querySelectorAll("div, li, article, section")];
    for (const el of nodes) {
      if (hotels.length >= LIMIT) break;
      if (el.children.length > 60) continue;
      const t = el.innerText || "";
      if (t.length < 20 || t.length > 900) continue;
      if (!t.includes("¥")) continue;
      if (!/酒店|饭店|宾馆|民宿/.test(t)) continue;
      if (/在地图上展示|热门筛选|星级\/钻级/.test(t) && !/查看详情/.test(t)) continue;
      const href = el.querySelector("a[href*='hotel']")?.href || location.href;
      const parsed = parseCard(t, href);
      if (!parsed) continue;
      const hotelId = hotelIdFromNode(el);
      const key = hotelId || parsed.hotel_name;
      if (seen.has(key)) continue;
      seen.add(key);
      hotels.push({
        platform_hotel_id: hotelId || parsed.hotel_name,
        hotel_name: parsed.hotel_name,
        rank: hotels.length + 1,
        price: parsed.sale_price,
        sold_out: parsed.sale_price == null,
        source_url: parsed.source_url,
        raw: {
          is_ad: parsed.is_ad,
          rating: parsed.rating,
          review_count: parsed.review_count,
          room_name: parsed.room_name,
          promotions: parsed.promotions,
          list_price: parsed.list_price,
          sale_price: parsed.sale_price,
          hotel_id: hotelId || null,
          preview: parsed.preview,
        },
      });
    }
  }

  function scroller() {
    const hit = [...document.querySelectorAll("div")].find((el) => {
      const t = el.innerText || "";
      return el.scrollHeight > el.clientHeight + 120 && (t.match(/查看详情/g) || []).length >= 3;
    });
    return hit || document.scrollingElement || document.documentElement;
  }

  const LOADS = 6;
  harvest();
  for (let i = 0; i < LOADS && hotels.length < LIMIT; i++) {
    window.scrollBy(0, Math.round(window.innerHeight * 1.1));
    document.documentElement.scrollTop += Math.round(window.innerHeight * 1.1);
    const box = scroller();
    if (box && box.scrollHeight > box.clientHeight + 80) {
      box.scrollTop += Math.max(700, Math.round(box.clientHeight * 1.05));
    }
    await sleep(1000);
    harvest();
  }

  return {
    host: location.hostname,
    href: location.href,
    title: document.title,
    count: hotels.length,
    hotels,
  };
};
