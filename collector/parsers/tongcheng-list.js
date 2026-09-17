window.__livvScrapeTongchengList = async function livvScrapeTongchengList() {
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
    const href = (el.querySelector && el.querySelector("a[href]")?.getAttribute("href")) || "";
    const m = href.match(/hotel[\/_-](\d{4,})/i) || href.match(/[?&]hotelId=(\d{4,})/i);
    if (m) return m[1];
    for (const key of ["data-hotel-id", "data-hotelid", "hotelid"]) {
      const val = el.getAttribute && el.getAttribute(key);
      if (val && /^\d{4,}$/.test(val)) return val;
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

  function isHotelName(name) {
    if (!name || name.length < 4 || name.length > 80) return false;
    if (/同程|艺龙|热门筛选|查看详情|地图找房|条点评/.test(name)) return false;
    if (/^(高级|豪华|商务|舒适|经济)?(大床房|双床房|套房)/.test(name)) return false;
    return /酒店|饭店|宾馆|旅馆|民宿|客栈|度假村|公寓|Hostel|Hotel|Inn/i.test(name);
  }

  function parseCard(text, href) {
    const t = norm(text);
    if (!t.includes("¥")) return null;
    const lines = String(text || "").split("\n").map(norm).filter(Boolean);
    const nameLine = lines.find((line) => isHotelName(line.replace(/广告|舒适|经济|豪华/g, "").trim()));
    if (!nameLine) return null;
    const hotel_name = nameLine.replace(/广告/g, "").replace(/(舒适|经济|豪华)$/g, "").trim();
    const is_ad = /广告/.test(nameLine) || /广告/.test(lines.slice(0, 3).join(" "));
    const ratingMatch = t.match(/\b([1-5]\.\d)\b/);
    const reviewMatch = t.match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{2,6})\s*条点评/);
    const roomLine = lines.find((line) =>
      /(大床房|双床房|单人房|套房|标准房)/.test(line) && line.length < 50
    );
    const promotions = [];
    const promoHit = t.match(/(平台优惠[^。\n]{0,12}|门店新客[^。\n]{0,12}|优惠\d+元)/);
    if (promoHit) promotions.push(promoHit[0].replace(/\s+/g, ""));
    const extra = t.match(/低价房仅剩\d+间/);
    if (extra) promotions.push(extra[0]);
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
      const t = el.innerText || "";
      if (!/条点评/.test(t) || !t.includes("¥") || !/酒店|饭店|宾馆|民宿/.test(t)) continue;
      if (t.length < 24 || t.length > 900) continue;
      if ((t.match(/条点评/g) || []).length !== 1) continue;
      const href = el.querySelector("a[href*='hotel']")?.href || location.href;
      const parsed = parseCard(t, href);
      if (!parsed) continue;
      const hotelId = hotelIdFromNode(el) || idForName(parsed.hotel_name, pageIdIndex());
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

  function harvestFromText() {
    const chunks = (document.body.innerText || "").split(/查看详情/);
    for (const chunk of chunks) {
      if (hotels.length >= LIMIT) break;
      const parsed = parseCard(chunk, location.href);
      if (!parsed) continue;
      const key = parsed.hotel_name;
      if (seen.has(key)) continue;
      seen.add(key);
      hotels.push({
        platform_hotel_id: idForName(parsed.hotel_name, pageIdIndex()) || parsed.hotel_name,
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
          hotel_id: idForName(parsed.hotel_name, pageIdIndex()) || null,
          preview: parsed.preview,
        },
      });
    }
  }

  harvest();
  harvestFromText();
  for (let i = 0; i < 6 && hotels.length < LIMIT; i++) {
    window.scrollBy(0, Math.round(window.innerHeight * 1.1));
    document.documentElement.scrollTop += Math.round(window.innerHeight * 1.1);
    await sleep(1000);
    harvest();
    harvestFromText();
  }

  return {
    host: location.hostname,
    href: location.href,
    title: document.title,
    count: hotels.length,
    hotels,
  };
};
