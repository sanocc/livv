import {
  analyzeHotelName,
  scoreHotelNames
} from "./hotel-name";

type Case = {
  name: string;
  left: string;
  right: string;
  expected:
    | "exact"
    | "strong"
    | "none";
};

const cases: Case[] = [
  /*
   * 正例：名称完全一致
   */
  {
    name: "雅斯特中心花坛 exact",
    left:
      "雅斯特酒店(咸宁温泉路中心花坛店)",
    right:
      "雅斯特酒店(咸宁温泉路中心花坛店)",
    expected: "exact"
  },

  /*
   * 正例：平台名称格式差异
   */
  {
    name: "安好民潮特殊符号",
    left:
      "安好民潮酒店(咸宁中心花坛店)",
    right:
      "安好の民潮酒店(咸宁中心花坛店)",
    expected: "exact"
  },

  {
    name: "白玉兰全半角括号",
    left:
      "白玉兰酒店(咸宁万达广场龙潭里店)",
    right:
      "白玉兰酒店（咸宁万达广场龙潭里店）",
    expected: "exact"
  },

  {
    name: "城市便捷平台命名差异",
    left:
      "城市便捷酒店(咸宁温泉路沃尔玛广场店)",
    right:
      "城市便捷咸宁温泉沃尔玛广场店",
    expected: "strong"
  },

  {
    name: "麗枫中心花坛简写",
    left:
      "麗枫酒店(咸宁温泉中心花坛店)",
    right:
      "麗枫酒店(咸宁中心花坛店)",
    expected: "strong"
  },

  /*
   * 反例：同品牌不同门店
   */
  {
    name: "雅斯特不同门店",
    left:
      "雅斯特酒店(咸宁温泉财富广场店)",
    right:
      "雅斯特酒店(咸宁温泉路中心花坛店)",
    expected: "none"
  },

  {
    name: "麗枫不同门店",
    left:
      "麗枫酒店(咸宁同惠广场店)",
    right:
      "麗枫酒店(咸宁温泉中心花坛店)",
    expected: "none"
  },

  {
    name: "七喜不同门店",
    left:
      "七喜城市酒店(咸宁岔路口店)",
    right:
      "七喜城市酒店(湖北科技学院店)",
    expected: "none"
  },

  {
    name: "柏雅不同门店",
    left:
      "柏雅酒店(咸宁职业技术学院店)",
    right:
      "柏雅酒店(咸宁温泉金诚沃尔玛购物广场店)",
    expected: "none"
  }
];

let failed = 0;

for (const item of cases) {
  const result =
    scoreHotelNames(
      item.left,
      item.right
    );

  const ok =
    result.level ===
    item.expected;

  if (!ok) {
    failed += 1;
  }

  console.log(
    ok ? "PASS" : "FAIL",
    item.name,
    {
      expected:
        item.expected,
      actual:
        result.level,
      score:
        result.score,
      reasons:
        result.reasons
    }
  );

  if (!ok) {
    console.log(
      " LEFT ",
      analyzeHotelName(
        item.left
      )
    );

    console.log(
      " RIGHT",
      analyzeHotelName(
        item.right
      )
    );
  }
}

console.log(
  `RESULT: ${
    cases.length - failed
  }/${cases.length} passed`
);

if (failed > 0) {
  process.exitCode = 1;
}
