// One row per business date / room type / channel. No inferred prices or occupancy.
export function csv(text) {
  const out = [],
    row = [];
  let cell = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i <= text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else if (c === undefined) throw Error("CSV 引号未闭合");
      else cell += c;
    } else if (c === '"' && !cell) quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === undefined) {
      row.push(cell.replace(/\r$/, ""));
      cell = "";
      if (row.some((x) => x.trim())) out.push([...row]);
      row.length = 0;
    } else cell += c;
  }
  return out;
}
const fields = {
  date: ["营业日", "date"],
  revenue: ["营收", "revenue"],
  rooms: ["售卖房量", "rooms"],
  available: ["可售房量", "available"],
  room_type: ["房型", "room_type"],
  channel: ["渠道", "channel"],
};
export function normalize(table) {
  if (table.length < 2 || table.length > 10001)
    throw Error("请导入 1～10000 行经营数据");
  const headers = table[0].map((x) => String(x ?? "").trim()),
    positions = Object.fromEntries(
      Object.entries(fields).map(([k, names]) => [
        k,
        headers.findIndex((h) => names.includes(h)),
      ]),
    );
  for (const k of ["date", "revenue", "rooms"])
    if (positions[k] < 0) throw Error("缺少必填列：营业日、营收、售卖房量");
  const seen = new Set(),
    capacities = new Map();
  const records = table
    .slice(1)
    .filter((row) => row.some((v) => v != null && String(v).trim()))
    .map((row, i) => {
      const get = (k) => row[positions[k]];
      const date = String(get("date") ?? "")
        .trim()
        .replaceAll("/", "-");
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date
      )
        throw Error(`第 ${i + 2} 行营业日须为 YYYY-MM-DD`);
      const numeric = (k, optional = false) => {
        const raw = get(k);
        if (optional && (raw == null || String(raw).trim() === "")) return null;
        if (raw == null || String(raw).trim() === "")
          throw Error(`第 ${i + 2} 行数值缺失`);
        const n = Number(String(raw).replaceAll(",", "").replace(/^¥/, ""));
        if (
          !Number.isFinite(n) ||
          n < 0 ||
          (k !== "revenue" && !Number.isInteger(n))
        )
          throw Error(`第 ${i + 2} 行数值无效`);
        return n;
      };
      const r = {
        date,
        revenue: numeric("revenue"),
        rooms: numeric("rooms"),
        available: numeric("available", true),
        room_type: String(get("room_type") ?? "").trim() || "未分类",
        channel: String(get("channel") ?? "").trim() || "未分类",
      };
      const key = JSON.stringify([date, r.room_type, r.channel]);
      if (seen.has(key))
        throw Error(`第 ${i + 2} 行营业日 / 房型 / 渠道重复，请先合并`);
      seen.add(key);
      const capacityKey = JSON.stringify([date, r.room_type]);
      if (
        capacities.has(capacityKey) &&
        capacities.get(capacityKey) !== r.available
      )
        throw Error(`第 ${i + 2} 行同日同房型可售房量不一致`);
      capacities.set(capacityKey, r.available);
      return r;
    });
  if (!records.length) throw Error("文件没有可导入的数据行");
  return records;
}
export function summarize(rows) {
  if (!rows.length)
    return {
      revenue: null,
      rooms: null,
      adr: null,
      occ: null,
      available: null,
    };
  const capacity = new Map();
  let revenue = 0,
    rooms = 0;
  for (const r of rows) {
    revenue += r.revenue;
    rooms += r.rooms;
    capacity.set(JSON.stringify([r.date, r.room_type]), r.available);
  }
  const available = [...capacity.values()].some((x) => x == null)
    ? null
    : [...capacity.values()].reduce((a, b) => a + b, 0);
  return {
    revenue,
    rooms,
    available,
    adr: rooms ? revenue / rooms : null,
    occ: available ? rooms / available : null,
  };
}
export function group(rows, key) {
  const buckets = new Map();
  for (const r of rows) {
    if (!buckets.has(r[key])) buckets.set(r[key], []);
    buckets.get(r[key]).push(r);
  }
  return [...buckets]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, rs]) => ({ name, ...summarize(rs) }));
}
export function previous(date, kind) {
  const d = new Date(date + "T00:00:00Z");
  if (kind === "month") {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - 1);
    const end = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate();
    d.setUTCDate(Math.min(day, end));
  } else d.setUTCDate(d.getUTCDate() - (kind === "week" ? 7 : 1));
  return d.toISOString().slice(0, 10);
}
export function range(anchor, mode) {
  const d = new Date(anchor + "T00:00:00Z"),
    end = new Date(d);
  if (mode === "week") {
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    end.setTime(d.getTime());
    end.setUTCDate(end.getUTCDate() + 6);
  }
  if (mode === "month" || mode === "quarter") {
    d.setUTCDate(1);
    if (mode === "quarter") d.setUTCMonth(Math.floor(d.getUTCMonth() / 3) * 3);
    end.setTime(d.getTime());
    end.setUTCMonth(d.getUTCMonth() + (mode === "quarter" ? 3 : 1));
    end.setUTCDate(0);
  }
  return [d.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}
