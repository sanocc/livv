import { unzipSync, strFromU8 } from "./vendor/fflate.js";
export function workbookTable(buffer, Parser = DOMParser) {
  let total = 0;
  const files = unzipSync(new Uint8Array(buffer), {
    filter(info) {
      if (
        !/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/sheet[^/]*\.xml)$/.test(
          info.name,
        )
      )
        return false;
      total += info.originalSize;
      if (total > 20 * 1024 * 1024) throw Error("Excel 解压内容过大");
      return true;
    },
  });
  const xml = (name) => {
    if (!files[name]) throw Error("Excel 工作表结构不完整");
    const text = strFromU8(files[name]);
    if (/<!DOCTYPE|<!ENTITY/i.test(text))
      throw Error("Excel 包含不支持的 XML 声明");
    const doc = new Parser().parseFromString(text, "application/xml");
    if (doc.getElementsByTagName("parsererror").length)
      throw Error("Excel XML 解析失败");
    return doc;
  };
  const workbook = xml("xl/workbook.xml"),
    first = workbook.getElementsByTagName("sheet")[0];
  if (!first) throw Error("Excel 没有工作表");
  const rid = first.getAttribute("r:id"),
    relations = xml("xl/_rels/workbook.xml.rels");
  const rel = Array.from(relations.getElementsByTagName("Relationship")).find(
    (r) => r.getAttribute("Id") === rid,
  );
  if (!rel || rel.getAttribute("TargetMode") === "External")
    throw Error("Excel 工作表关系无效");
  const target = rel
    .getAttribute("Target")
    .replace(/^\//, "")
    .replace(/^xl\//, "");
  if (!/^worksheets\/sheet[^/]*\.xml$/.test(target))
    throw Error("Excel 工作表路径无效");
  const strings = files["xl/sharedStrings.xml"]
    ? Array.from(xml("xl/sharedStrings.xml").getElementsByTagName("si")).map(
        (si) =>
          Array.from(si.getElementsByTagName("t"))
            .map((t) => t.textContent)
            .join(""),
      )
    : [];
  const rows = Array.from(xml("xl/" + target).getElementsByTagName("row"));
  if (rows.length > 10001) throw Error("Excel 最多支持 10000 行数据");
  let cells = 0;
  const table = rows.map((row) => {
    const result = [];
    for (const cell of row.getElementsByTagName("c")) {
      if (++cells > 80000) throw Error("Excel 单元格过多");
      const ref = cell.getAttribute("r")?.match(/^([A-Z]+)\d+$/)?.[1];
      if (!ref) throw Error("Excel 单元格位置无效");
      let index = 0;
      for (const c of ref) index = index * 26 + c.charCodeAt(0) - 64;
      index--;
      if (index > 63) throw Error("Excel 最多支持 64 列");
      if (cell.getElementsByTagName("f").length)
        throw Error("Excel 含公式，请先转换为值再导入");
      const type = cell.getAttribute("t"),
        value = cell.getElementsByTagName("v")[0]?.textContent ?? "";
      result[index] =
        type === "s"
          ? strings[Number(value)]
          : type === "inlineStr"
            ? Array.from(cell.getElementsByTagName("t"))
                .map((t) => t.textContent)
                .join("")
            : value;
    }
    return result;
  });
  const dateColumn = table[0]?.findIndex((v) =>
      ["营业日", "date"].includes(String(v).trim()),
    ),
    date1904 = workbook
      .getElementsByTagName("workbookPr")[0]
      ?.getAttribute("date1904");
  if (dateColumn >= 0)
    for (const row of table.slice(1)) {
      const v = row[dateColumn];
      if (/^\d+(\.\d+)?$/.test(v ?? "")) {
        const serial = Number(v);
        if (!Number.isInteger(serial) || serial < 1 || serial > 100000)
          throw Error("Excel 营业日序号无效");
        const epoch =
          date1904 === "1" || date1904 === "true"
            ? Date.UTC(1904, 0, 1)
            : Date.UTC(1899, 11, 30);
        row[dateColumn] = new Date(epoch + serial * 86400000)
          .toISOString()
          .slice(0, 10);
      }
    }
  return table;
}
