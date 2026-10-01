// DOM readers return public element coordinates; background sends browser input.
// Both are restricted to the extension's own managed Ctrip hotel tab.
export function pageStep(task, phase) {
  const norm = (s) =>
      String(s ?? "")
        .replace(/\s+/g, " ")
        .trim(),
    visible = (e) =>
      !!e &&
      e.getBoundingClientRect().width > 0 &&
      e.getBoundingClientRect().height > 0;
  const txt = (e) => norm(e?.textContent),
    u = new URL(location.href);
  const body = document.body?.innerText ?? "";
  if (
    document.querySelector('[class*="captcha"],iframe[src*="captcha"]') &&
    /验证|滑块/.test(body)
  )
    return { error: "CAPTCHA_REQUIRED" };
  if (/登录/.test(document.title) && !body.includes("酒店"))
    return { error: "LOGIN_REQUIRED" };
  const pick = (selector) =>
    Array.from(document.querySelectorAll(selector)).find(visible);
  const tap = (element, text) => {
    element.scrollIntoView({ block: "center", inline: "nearest" });
    const rect = element.getBoundingClientRect();
    const path = [];
    for (let node = element; node?.nodeType === 1; node = node.parentElement) {
      const siblings = Array.from(node.parentElement?.children ?? []).filter(
        (s) => s.tagName === node.tagName,
      );
      path.unshift(
        `${node.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(node) + 1 || 1})`,
      );
    }
    return {
      type: text === undefined ? "click" : "text",
      selector: path.join(" > "),
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
      ...(text === undefined ? {} : { text }),
    };
  };
  if (phase === "CITY_OPEN") {
    if (u.pathname.includes("citySearch")) return { phase: "CITY_INPUT" };
    const e = pick('[class*="dest-keyword-column"]');
    if (!e) return { wait: true };
    return { action: tap(e), phase: "CITY_INPUT" };
  }
  if (phase === "CITY_INPUT") {
    if (u.pathname.endsWith("/search")) return { phase: "SEARCH" };
    if (!u.pathname.includes("citySearch")) return { wait: true };
    const e = pick('input[type="text"]');
    if (!e) return { wait: true };
    if (e.value !== task.city) {
      return { action: tap(e, task.city), wait: true };
    }
    const candidate = Array.from(
      document.querySelectorAll('[class*="keywordItemMainContainer"]'),
    ).find(
      (e) =>
        visible(e) && txt(e).includes(task.city) && txt(e).includes("城市"),
    );
    if (!candidate)
      return { wait: true, diagnostic: "CITY_CANDIDATE_NOT_VISIBLE" };
    return {
      action: tap(candidate),
      wait: true,
      diagnostic: "CITY_CANDIDATE_TAPPED: " + txt(candidate),
    };
  }
  if (phase === "KEYWORD_OPEN") {
    if (!u.pathname.endsWith("/search")) return { wait: true };
    const city = pick('[class*="dest-keyword-column"]');
    if (!txt(city).includes(task.city)) return { error: "CITY_NOT_CONFIRMED" };
    const e = pick('[class*="keyword-hint-container"],[class*="keyword-row"]');
    if (!e) return { wait: true };
    return { action: tap(e), phase: "KEYWORD_INPUT" };
  }
  if (phase === "KEYWORD_INPUT" || phase === "LIST_KEYWORD_INPUT") {
    if (phase === "LIST_KEYWORD_INPUT" && u.pathname.includes("listPage"))
      return { phase: "LIST_KEYWORD_OPEN" };
    if (!u.pathname.includes("citySearch")) return { wait: true };
    const input = pick('input[type="text"]');
    if (!input) return { wait: true };
    if (input.value !== task.keyword) {
      return { action: tap(input, task.keyword), wait: true };
    }
    const candidates = Array.from(
      document.querySelectorAll('[class*="keywordItemMainContainer"]'),
    ).filter((e) => visible(e) && txt(e).includes(task.keyword));
    if (!candidates.length) return { wait: true };
    const exact = candidates.filter(
      (e) =>
        txt(e.querySelector('[class*="keywordTitleContainer"]')) ===
        task.keyword,
    );
    if (exact.length !== 1) return { error: "KEYWORD_AMBIGUOUS" };
    return {
      action: tap(exact[0]),
      phase: phase === "LIST_KEYWORD_INPUT" ? "LIST" : "SEARCH",
    };
  }
  if (phase === "SEARCH") {
    if (u.pathname.includes("listPage")) return { phase: "SET_DATES" };
    if (u.pathname.includes("citySearch")) return { phase: "CITY_INPUT" };
    if (!u.pathname.endsWith("/search")) return { wait: true };
    const city = pick('[class*="dest-keyword-column"]');
    if (!txt(city).includes(task.city))
      return { error: "SEARCH_CONTEXT_NOT_CONFIRMED" };
    const e = Array.from(document.querySelectorAll("span,div"))
      .filter(visible)
      .find(
        (e) =>
          norm(e.textContent).replace(/\s/g, "") === "查询" &&
          e.childElementCount === 0,
      );
    if (!e) return { wait: true };
    return { action: tap(e), phase: "SET_DATES" };
  }
  if (phase === "LIST_KEYWORD_OPEN") {
    if (!u.pathname.includes("listPage")) return { wait: true };
    if (
      u.searchParams.get("c-in") !== task.checkin ||
      u.searchParams.get("c-out") !== task.checkout
    )
      return { phase: "SET_DATES" };
    const entry = Array.from(document.querySelectorAll("span,div")).find(
      (e) =>
        visible(e) &&
        e.children.length === 0 &&
        !e.closest(".hotel-card") &&
        (txt(e) === "位置/品牌/酒店" || txt(e) === task.keyword),
    );
    if (!entry) return { wait: true };
    return { action: tap(entry), phase: "LIST_KEYWORD_INPUT" };
  }
  if (phase === "SET_DATES") {
    if (u.pathname.endsWith("/search")) return { phase: "SEARCH" };
    if (!u.pathname.includes("listPage")) return { wait: true };
    const current = u.searchParams.get("c-in")?.slice(5);
    const entry = Array.from(document.querySelectorAll("span")).find(
      (e) => visible(e) && !e.closest(".hotel-card") && txt(e) === current,
    );
    if (!entry) return { wait: true };
    return { action: tap(entry), phase: "DATE_CHECKIN" };
  }
  if (phase === "DATE_CHECKIN" || phase === "DATE_CHECKOUT") {
    const date = phase === "DATE_CHECKIN" ? task.checkin : task.checkout;
    const month = document.querySelector(
      `.calendarComponent-month[ymfullnumber="${date.slice(0, 7).replace("-", "")}"]`,
    );
    if (!month) return { wait: true };
    const cells = Array.from(
      month.parentElement.querySelectorAll('li[role="button"]'),
    );
    const cell = cells.find(
      (e) =>
        txt(e.querySelector(".calendarDay")) ===
          String(Number(date.slice(8))) && !e.className.includes("disable"),
    );
    if (!cell) return { error: "DATE_UNAVAILABLE" };
    cell.scrollIntoView({ block: "center" });
    return {
      action: tap(cell),
      phase: phase === "DATE_CHECKIN" ? "DATE_CHECKOUT" : "LIST_KEYWORD_OPEN",
    };
  }
  return { wait: true };
}
export function inspectList() {
  const norm = (s) =>
      s == null ? null : String(s).replace(/\s+/g, " ").trim() || null,
    u = new URL(location.href),
    format = (d) =>
      /^\d{8}$/.test(d ?? "")
        ? d.slice(0, 4) + "-" + d.slice(4, 6) + "-" + d.slice(6, 8)
        : null;
  const cards = Array.from(
    document.querySelectorAll(".hotel-card[data-exposure]"),
  );
  const exposures = cards.map((e) => {
    try {
      return JSON.parse(e.getAttribute("data-exposure")).data ?? {};
    } catch {
      return {};
    }
  });
  const first = exposures[0] ?? {},
    params = u.searchParams;
  let urlCity = null,
    urlKeyword = null;
  try {
    urlCity = JSON.parse(params.get("d-name"))?.[0] ?? null;
    urlKeyword = JSON.parse(params.get("s-keyword"))?.[0] ?? "";
  } catch {}
  const outside = Array.from(document.querySelectorAll("span,div"))
    .filter((n) => n.children.length === 0 && !n.closest(".hotel-card"))
    .map((n) => norm(n.textContent));
  const actualKeyword =
    urlKeyword === "" ? "" : outside.includes(urlKeyword) ? urlKeyword : null;
  const context = {
    platform: "ctrip",
    city: first.cityname ?? null,
    keyword: actualKeyword,
    checkin: format(first.checkin),
    checkout: format(first.checkout),
  };
  const contextVerified =
    cards.length > 0 &&
    context.city === urlCity &&
    context.checkin === params.get("c-in") &&
    context.checkout === params.get("c-out") &&
    actualKeyword !== null &&
    exposures.every(
      (x) =>
        x.cityname === first.cityname &&
        x.checkin === first.checkin &&
        x.checkout === first.checkout,
    );
  const hotels = cards.map((e, i) => {
    const data = exposures[i],
      leaf = Array.from(e.querySelectorAll("span,div")).filter(
        (n) => n.children.length === 0,
      ),
      texts = leaf.map((n) => norm(n.textContent));
    const name = norm(data.hotelName ?? data.hotelname);
    const hotel_name = texts.includes(name) ? name : null;
    const id = norm(data.masterhotelid);
    const rank = Number(data.masterhotelid_rank);
    let original_price = null,
      display_price = null;
    for (const currency of leaf.filter((n) =>
      /^[¥￥]$/.test(norm(n.textContent) ?? ""),
    )) {
      const value = norm(currency.nextElementSibling?.textContent)?.replace(
        /,/g,
        "",
      );
      if (!/^\d+(?:\.\d+)?$/.test(value ?? "")) continue;
      const number = Number(value);
      if (
        getComputedStyle(currency).textDecorationLine.includes("line-through")
      )
        original_price = number;
      else if (norm(currency.parentElement?.textContent)?.includes("起"))
        display_price = number;
    }
    const scoreNode = leaf.find(
      (n) =>
        /^[0-5]\.\d$/.test(norm(n.textContent) ?? "") &&
        norm(n.parentElement?.textContent)?.includes("点评"),
    );
    const marketing = (data.htl_taglist ?? [])
      .filter(
        (x) => String(x.tagposition) === "5" && texts.includes(norm(x.tagname)),
      )
      .map((x) => norm(x.tagname));
    return {
      hotel_id: id,
      hotel_name,
      rank:
        data.masterhotelid_rank != null && Number.isInteger(rank) && rank >= 0
          ? rank + 1
          : null,
      is_ad: texts.includes("广告"),
      score: scoreNode ? Number(norm(scoreNode.textContent)) : null,
      dynamic:
        texts.find((t) => t && /有人预订|热卖！|连续\d+位/.test(t)) ?? null,
      activity_tags: marketing.length ? [...new Set(marketing)] : null,
      original_price,
      display_price,
    };
  });
  const exhausted = outside.some((t) =>
    /^(没有更多了|已加载全部|没有更多酒店|到底了)$/.test(t ?? ""),
  );
  return {
    url: u.href,
    context,
    context_verified: contextVerified,
    hotels: hotels.filter((x) => x.hotel_id && x.hotel_name),
    unparsed_cards: hotels.filter(
      (x) => !x.hotel_id || !x.hotel_name || x.rank === null,
    ).length,
    exhausted,
    observed_at: new Date().toISOString(),
    captcha:
      !!document.querySelector('[class*="captcha"]') &&
      /验证/.test(document.body.innerText),
  };
}
export function scrollList() {
  const scrollables = Array.from(document.querySelectorAll("div")).filter(
    (e) =>
      e.scrollHeight > e.clientHeight + 100 &&
      /(auto|scroll)/.test(getComputedStyle(e).overflowY),
  );
  const e =
    scrollables.sort((a, b) => b.clientHeight - a.clientHeight)[0] ??
    document.scrollingElement;
  const before = e.scrollTop;
  e.scrollTop += Math.max(500, e.clientHeight * 0.8);
  return { before, after: e.scrollTop };
}
export function inspectDetail(hotel, task) {
  const norm = (s) =>
    String(s ?? "")
      .replace(/\s+/g, " ")
      .trim();
  const leaf = (e) =>
    Array.from(e.querySelectorAll("span,div")).filter(
      (n) => n.children.length === 0,
    );
  const exposures = Array.from(
    document.querySelectorAll("[data-exposure]"),
  ).map((e) => {
    try {
      return JSON.parse(e.getAttribute("data-exposure"));
    } catch {
      return null;
    }
  });
  const ctx = exposures.find(
    (x) => x?.ubtKey === "htl_x_dtl_header_tab_exposure",
  )?.data;
  const nameConfirmed = leaf(document).some(
    (e) => norm(e.textContent) === hotel.hotel_name,
  );
  if (
    !ctx ||
    String(ctx.masterhotelid) !== hotel.hotel_id ||
    ctx.checkin !== task.checkin ||
    ctx.checkout !== task.checkout ||
    !nameConfirmed
  )
    return {
      rooms: [],
      context_verified: false,
      diagnostic: {
        hotel_id: ctx?.masterhotelid ?? null,
        checkin: ctx?.checkin ?? null,
        checkout: ctx?.checkout ?? null,
        name_confirmed: nameConfirmed,
      },
    };
  const full = leaf(document)
    .map((e) => norm(e.textContent))
    .find((t) => /^(该酒店已订完|酒店已订完|当前日期无可售房间)$/.test(t));
  if (full)
    return {
      context_verified: true,
      rooms: [
        {
          ...hotel,
          room_name: "酒店整体售罄",
          original_price: null,
          display_price: null,
          activity_tags: null,
          availability_status: "sold_out",
          sold_out_evidence: full,
        },
      ],
    };
  const cards = Array.from(
    document.querySelectorAll(
      '#htl_room_list_content_filterRooms [id^="BASE_ROOM_CARD_"], #htl_room_list_content_filterRooms [id^="RECOMMEND_ROOM_CARD_"]',
    ),
  );
  const rooms = cards
    .map((card) => {
      const directText = (e) =>
        norm(
          Array.from(e.childNodes)
            .filter((n) => n.nodeType === 3)
            .map((n) => n.textContent)
            .join(" "),
        );
      const nameNode = Array.from(card.querySelectorAll("span,div")).find(
        (e) =>
          Number.parseInt(getComputedStyle(e).fontWeight, 10) >= 600 &&
          /房|套|别墅|床/.test(directText(e)) &&
          !/¥|￥/.test(directText(e)),
      );
      if (!nameNode) return null;
      const room_name = directText(nameNode),
        group =
          card.closest('[id^="BASE_"]:not([id^="BASE_ROOM_CARD_"])') ?? card;
      const sold = leaf(card)
        .map((e) => norm(e.textContent))
        .find((t) => /^(已订完|满房|无可售|售罄)$/.test(t));
      if (sold)
        return {
          hotel_id: hotel.hotel_id,
          hotel_name: hotel.hotel_name,
          room_name,
          original_price: null,
          display_price: null,
          activity_tags: null,
          availability_status: "sold_out",
          sold_out_evidence: sold,
        };
      const numeric = leaf(group).filter(
        (e) =>
          /^\d+(?:\.\d+)?$/.test(norm(e.textContent)) &&
          /[¥￥]/.test(e.parentElement.textContent) &&
          Number.parseInt(getComputedStyle(e).fontWeight, 10) >= 600,
      );
      const choices = numeric
        .map((e) => {
          let block = e.parentElement;
          for (
            let i = 0;
            i < 5 && block.parentElement && group.contains(block.parentElement);
            i++
          ) {
            const parent = block.parentElement;
            if (numeric.filter((n) => parent.contains(n)).length > 1) break;
            block = parent;
          }
          const original = leaf(block).find(
            (n) =>
              /^\d+(?:\.\d+)?$/.test(norm(n.textContent)) &&
              /[¥￥]/.test(n.parentElement.textContent) &&
              Array.from(n.parentElement.children).some((line) => {
                const st = getComputedStyle(line);
                return (
                  st.position === "absolute" &&
                  Number.parseFloat(st.height) > 0 &&
                  Number.parseFloat(st.height) <= 2 &&
                  st.backgroundColor !== "rgba(0, 0, 0, 0)"
                );
              }),
          );
          const tags = leaf(block)
            .map((n) => norm(n.textContent))
            .filter(
              (t) =>
                /优惠|折扣|特惠|豪补|券/.test(t) &&
                t.length < 40 &&
                !/取消|早餐|不可|说明/.test(t),
            );
          return {
            display_price: Number(norm(e.textContent)),
            original_price: original
              ? Number(norm(original.textContent))
              : null,
            activity_tags: tags.length ? [...new Set(tags)] : null,
          };
        })
        .sort((a, b) => a.display_price - b.display_price);
      if (!choices.length) return null;
      return {
        hotel_id: hotel.hotel_id,
        hotel_name: hotel.hotel_name,
        room_name,
        ...choices[0],
        availability_status: "available",
        sold_out_evidence: null,
      };
    })
    .filter(Boolean);
  return {
    rooms,
    context_verified: true,
    diagnostic: { cards: cards.length, rooms: rooms.length },
  };
}
export function scrollDetail() {
  document
    .querySelector("#htl_room_list_content_filterRooms")
    ?.scrollIntoView({ block: "end" });
}
export function detailLink(hotelId) {
  const nodes = Array.from(
    document.querySelectorAll(
      '[data-hotelid],[data-hotel-id],[class*="hotelCard"],[class*="hotel-card"],[class*="hotelItem"]',
    ),
  );
  const card = nodes.find((e) => {
    try {
      if (
        String(
          JSON.parse(e.getAttribute("data-exposure"))?.data?.masterhotelid,
        ) === hotelId
      )
        return true;
    } catch {}
    return (
      (e.getAttribute("data-hotelid") ?? e.getAttribute("data-hotel-id")) ===
        hotelId || e.querySelector(`img[src*="_ubt_hotelId=${hotelId}&"]`)
    );
  });
  if (!card) return { error: "DETAIL_CARD_NOT_FOUND" };
  card.scrollIntoView({ block: "center" });
  const rect = card.getBoundingClientRect();
  const path = [];
  for (let node = card; node?.nodeType === 1; node = node.parentElement) {
    const siblings = Array.from(node.parentElement?.children ?? []).filter(
      (s) => s.tagName === node.tagName,
    );
    path.unshift(
      `${node.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(node) + 1 || 1})`,
    );
  }
  return {
    action: {
      type: "click",
      selector: path.join(" > "),
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    },
  };
}
