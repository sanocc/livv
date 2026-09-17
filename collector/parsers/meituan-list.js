window.__livvScrapeMeituanList = async function livvScrapeMeituanList() {
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
    const keys = ["data-poi-id", "data-poiid", "data-shopid", "data-shop-id", "poiid", "shopid"];
    let cur = el;
    for (let i = 0; i < 8 && cur; i++) {
      for (const key of keys) {
        const val = cur.getAttribute && cur.getAttribute(key);
        if (val && /^\d{4,}$/.test(val)) return val;
      }
      const a = cur.querySelector && cur.querySelector("a[href]");
      const href = a?.getAttribute("href") || "";
      const m = href.match(/\/(?:hotel|poi|shop)\/(\d{4,})/i) || href.match(/[?&]poiId=(\d{4,})/i);
      if (m) return m[1];
      cur = cur.parentElement;
    }
    return "";
  }


  function extractId(s) {
    const t = String(s || "");
    const m = t.match(/[?&#/](?:poiId|shopId|shopid|hotelId|hotelid|shid|hid)=?(\d{4,})/i)
      || t.match(/\/(?:hotel|poi|shop|detail)\/(\d{4,})/i)
      || t.match(/hotel[_-]?(\d{5,})/i);
    return m ? m[1] : "";
  }
  function pageIdIndex() {
    const map = [];
    for (const a of document.querySelectorAll("a[href], [data-poi-id], [data-hotel-id], [data-shopid]")) {
      const id = extractId(a.getAttribute && (a.getAttribute("href") || a.getAttribute("data-poi-id") || a.getAttribute("data-hotel-id") || a.getAttribute("data-shopid") || ""))
        || extractId(a.outerHTML || "");
      const name = (a.textContent || a.getAttribute("title") || "").replace(/\s+/g, " ").trim();
      if (id) map.push({ id, name });
    }
    return map;
  }
  function idForName(name, index) {
    if (!name) return "";
    const hit = index.find((x) => x.name && (x.name.includes(name) || name.includes(x.name)));
    return hit ? hit.id : "";
  }


  function jsonIdIndex() {
    const html = document.documentElement.innerHTML || "";
    const out = [];
    const re1 = /"name"\s*:\s*"([^"]{2,80})"[\s\S]{0,240}"(?:poiid|poiId|realPoiId)"\s*:\s*(\d{4,})/g;
    const re2 = /"(?:poiid|poiId|realPoiId)"\s*:\s*(\d{4,})[\s\S]{0,240}"name"\s*:\s*"([^"]{2,80})"/g;
    let m;
    while ((m = re1.exec(html))) out.push({ name: m[1], id: m[2] });
    while ((m = re2.exec(html))) out.push({ name: m[2], id: m[1] });
    return out;
  }


  function vuePoiId(el) {
    let cur = el;
    for (let i = 0; i < 10 && cur; i++) {
      const raw = cur.getAttribute && cur.getAttribute("hotel-i-poi");
      if (raw && /^\d{4,}$/.test(raw)) return raw;
      const inst = cur.__vue__ || cur.__vueParentComponent || cur._vei || null;
      const bag = inst?.ctx || inst?.setupState || inst?.props || inst?.data || inst?._data || inst || {};
      const walk = [bag, bag.poi, bag.item, bag.hotel, bag.props];
      for (const obj of walk) {
        if (!obj || typeof obj !== "object") continue;
        for (const key of ["poiId", "poiid", "realPoiId", "shopId", "id"]) {
          const val = obj[key];
          if (val && /^\d{4,}$/.test(String(val))) return String(val);
        }
      }
      cur = cur.parentElement;
    }
    return "";
  }

  function isHotelName(name) {
    if (!name || name.length < 4 || name.length > 80) return false;
    if (name === "酒店") return false;
    if (/美团酒店|热门商圈|价格星级|查看地图|找到\d+家|筛选/.test(name)) return false;
    if (/^(高级|豪华|商务|精选|舒适)?(大床房|双床房|单人房|套房|标准房)/.test(name)) return false;
    return /酒店|饭店|宾馆|旅馆|民宿|客栈|度假村|公寓|Hostel|Hotel|Inn/i.test(name);
  }

  function parseCard(text, href) {
    const t = norm(text);
    if (!t.includes("¥")) return null;
    const lines = String(text || "").split("\n").map(norm).filter(Boolean);
    const nameLine = lines.find((line) => isHotelName(line.replace(/广告/g, "").trim()));
    if (!nameLine) return null;
    const hotel_name = nameLine.replace(/广告/g, "").replace(/[●▪·]+/g, "·").trim();
    const is_ad = /广告/.test(nameLine) || /广告/.test(lines.slice(0, 4).join(" "));
    const ratingMatch = t.match(/\b([1-5]\.\d)\b/);
    const reviewMatch = t.match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{2,6})\s*条/);
    const roomLine = lines.find((line) =>
      /(大床房|双床房|单人房|套房|标准房|家庭房|客房|床房|单间)/.test(line) &&
      !/点评|好评|取消/.test(line) &&
      line.length < 60
    );
    const promoCatalog = ["神券", "折扣券", "门店首单", "早鸟优惠", "红包", "满减", "新客", "会员优惠"];
    const promotions = promoCatalog
      .map((name) => ({ name, i: t.indexOf(name) }))
      .filter((x) => x.i >= 0)
      .sort((a, b) => a.i - b.i)
      .map((x) => x.name);
    const bookHit = t.match(/((?:\d+(?:\.\d+)?\s*(?:分钟|小时|天)|刚刚)前有人[预預]订)/);
    if (bookHit) promotions.unshift(bookHit[1].replace(/\s+/g, ""));
    let sale_price = null;
    const startMatch = t.match(/¥\s*([0-9]{2,6})\s*起/);
    if (startMatch) sale_price = Number(startMatch[1]);
    const prices = yenNumbers(t).filter((n) => n >= 30 && n <= 99999);
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
      promotions,
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
      if (el.children.length > 80) continue;
      const t = el.innerText || "";
      if (t.length < 20 || t.length > 1200) continue;
      if (!t.includes("¥")) continue;
      if (!/酒店|饭店|宾馆|民宿/.test(t)) continue;
      if (/热门商圈|价格星级|在地图上/.test(t) && !/查看详情|预订/.test(t)) continue;
      const href = el.querySelector("a[href*='hotel'], a[href*='poi']")?.href || location.href;
      const parsed = parseCard(t, href);
      if (!parsed) continue;
      const hotelId = hotelIdFromNode(el) || vuePoiId(el) || idForName(parsed.hotel_name, pageIdIndex()) || idForName(parsed.hotel_name, jsonIdIndex());
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

  harvest();
  for (let i = 0; i < 6 && hotels.length < LIMIT; i++) {
    window.scrollBy(0, Math.round(window.innerHeight * 1.1));
    document.documentElement.scrollTop += Math.round(window.innerHeight * 1.1);
    await sleep(1000);
    harvest();
  }

  async function attachPoiIds() {
    const u = new URL(location.href);
    const cityId = u.searchParams.get("cityId") || "";
    const checkIn = (u.searchParams.get("checkIn") || "").replaceAll("-", "");
    const checkOut = (u.searchParams.get("checkOut") || "").replaceAll("-", "") || checkIn;
    const keyword = u.searchParams.get("keyword") || "";
    if (!cityId || !checkIn) return;
    const compact = (s) => String(s || "").replace(/\s+/g, "").replace(/[()（）·・\-—_.]/g, "");
    const entries = [];
    for (const offset of [0, 20, 40]) {
      const api = "https://ihotel.meituan.com/hbsearch/HotelSearch?utm_medium=touch&version_name=999.9&platformid=1&cateId=20&newcate=1&limit=20&offset="
        + offset + "&cityId=" + cityId + "&ci=" + cityId
        + "&startendday=" + checkIn + "~" + checkOut
        + "&startDay=" + checkIn + "&endDay=" + checkOut
        + "&q=" + encodeURIComponent(keyword)
        + "&keyword=" + encodeURIComponent(keyword)
        + "&accommodationType=1&sort=defaults";
      try {
        const res = await fetch(api, { credentials: "include" });
        const json = await res.json();
        const rows = (json && json.data && json.data.searchresult) || json.searchresult || [];
        for (const row of rows) {
          const poi = String(row.poiid || row.poiId || "");
          const real = String(row.realPoiId || "");
          const id = (poi && poi.length <= 12 ? poi : "") || real || poi;
          const name = row.name || "";
          if (id && name) entries.push({ n: compact(name), id });
        }
      } catch (e) {}
    }
    for (const h of hotels) {
      if (h.raw && h.raw.hotel_id) continue;
      const n = compact(h.hotel_name);
      let hit = entries.find((e) => e.n === n);
      if (!hit) hit = entries.find((e) => e.n.includes(n) || n.includes(e.n));
      if (!hit) continue;
      h.raw.hotel_id = hit.id;
      h.platform_hotel_id = hit.id;
    }
  }

  await attachPoiIds();

  return {
    host: location.hostname,
    href: location.href,
    title: document.title,
    count: hotels.length,
    hotels,
  };
};
