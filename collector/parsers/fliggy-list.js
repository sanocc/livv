window.__livvScrapeFliggyList = async function livvScrapeFliggyList() {
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

  function isHotelName(name) {
    if (!name || name.length < 4 || name.length > 80) return false;
    if (name === "酒店") return false;
    if (/飞猪|查看详情|用户评价|信用住|排序|前有人预订|预订了该酒店|获取您的位置|一律不允许|搜索酒店|国内机票|热门推荐/.test(name)) return false;
    return /酒店|饭店|宾馆|旅馆|民宿|客栈|度假村|公寓|旅店|Hostel|Hotel|Inn/i.test(name);
  }

  function parseCard(text, href) {
    const t = norm(text);
    if (!t.includes("¥")) return null;
    const lines = String(text || "").split("\n").map(norm).filter(Boolean);
    const nameLine = lines.find((line) => isHotelName(line.replace(/立减|信用住|全人群运营活动/g, "").trim()));
    if (!nameLine) return null;
    const hotel_name = nameLine.replace(/立减|信用住|全人群运营活动/g, "").replace(/^\d+\s*/, "").trim();
    const is_ad = /广告/.test(t);
    const ratingMatch = t.match(/\b([1-5]\.\d)\s*\/\s*5/) || t.match(/\b([1-5]\.\d)\b/);
    const reviewMatch = t.match(/用户评价\s*([0-9]{1,6})\s*条/) || t.match(/([0-9]{1,6})\s*条/);
    const promotions = [];
    if (t.includes("立减")) promotions.push("立减");
    if (t.includes("全人群运营活动")) promotions.push("全人群运营活动");
    const bookHit = t.match(/((?:\d+\s*(?:分钟|小时|天)|刚刚)前有人预订了该酒店)/);
    if (bookHit) promotions.unshift(bookHit[1].replace(/\s+/g, ""));
    let sale_price = null;
    const startMatch = t.match(/¥\s*([0-9]{2,6})\s*起/);
    if (startMatch) sale_price = Number(startMatch[1]);
    const prices = yenNumbers(t).filter((n) => n >= 30 && n <= 99999);
    if (sale_price == null && prices.length) sale_price = Math.min(...prices);
    const list_price = prices.find((n) => sale_price != null && n > sale_price) || null;
    return {
      hotel_name,
      is_ad,
      rating: ratingMatch ? Number(ratingMatch[1]) : null,
      review_count: reviewMatch ? Number(reviewMatch[1]) : null,
      room_name: null,
      promotions,
      list_price,
      sale_price,
      source_url: href || location.href,
      preview: t.slice(0, 220),
    };
  }

  function pushHotel(parsed, hotelId) {
    const key = hotelId || parsed.hotel_name;
    if (seen.has(key)) return;
    seen.add(key);
    hotels.push({
      platform_hotel_id: key,
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

  function harvest() {
    for (const el of document.querySelectorAll("div, li, article, section")) {
      if (hotels.length >= LIMIT) break;
      const t = el.innerText || "";
      if (!t.includes("¥") || !/用户评价|条/.test(t)) continue;
      if (t.length < 20 || t.length > 800) continue;
      if ((t.match(/查看详情/g) || []).length > 1) continue;
      const parsed = parseCard(t, el.querySelector("a[href]")?.href || location.href);
      if (parsed) pushHotel(parsed, extractId(el.innerHTML) || idForName(parsed.hotel_name, pageIdIndex()));
    }
  }

  function harvestFromText() {
    for (const chunk of (document.body.innerText || "").split(/查看详情/)) {
      if (hotels.length >= LIMIT) break;
      const parsed = parseCard(chunk, location.href);
      if (parsed) pushHotel(parsed, idForName(parsed.hotel_name, pageIdIndex()));
    }
  }

  async function nextPage() {
    const btn = [...document.querySelectorAll("a, button, span, li")].find((el) => {
      const t = (el.textContent || "").trim();
      return t === "下一页" || t === "下一页 ►" || t.includes("下一页");
    });
    if (!btn) return false;
    btn.click();
    await sleep(1500);
    return true;
  }

  harvest();
  harvestFromText();
  for (let i = 0; i < 2 && hotels.length < LIMIT; i++) {
    const moved = await nextPage();
    if (!moved) break;
    harvest();
    harvestFromText();
  }

  return { host: location.hostname, href: location.href, title: document.title, count: hotels.length, hotels };
};
