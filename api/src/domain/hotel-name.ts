export interface HotelNameAnalysis {
  original: string;
  normalized: string;
  core: string;
  tokens: string[];
}

const GENERIC = new Set([
  "酒店",
  "宾馆",
  "旅店",
  "旅馆",
  "民宿",
  "公寓",
  "连锁",
  "咸宁",
  "咸宁市"
]);

function normalizeBasic(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/echarm hotel/gi, "")
    .replace(/boya hotel[^)]*/gi, "")
    .replace(/[()（）【】[\]·・▪•_\-—.,，。'"]/g, "")
    .replace(/\s+/g, "")
    .replace(/の/g, "")
    .trim();
}

function stripGeneric(value: string): string {
  let out = value;

  for (const word of GENERIC) {
    out = out.replaceAll(word, "");
  }

  return out;
}

export function analyzeHotelName(
  value: string
): HotelNameAnalysis {
  const normalized =
    normalizeBasic(value);

  const parts =
    normalized
      .split(
        /店|广场|学院|公园|沃尔玛|中心花坛|温泉路|温泉|大道|第一街/
      )
      .filter(Boolean);

  const tokens = [
    ...new Set(
      parts
        .map(stripGeneric)
        .filter(
          (x) => x.length >= 2
        )
    )
  ];

  const first =
    normalized
      .split(
        /咸宁|温泉|中心花坛|沃尔玛|广场|学院|公园|大道|第一街/
      )[0];

  const core =
    stripGeneric(first || normalized);

  return {
    original:
      value,

    normalized,

    core,

    tokens
  };
}

export interface HotelNameScore {
  score: number;
  level:
    | "exact"
    | "strong"
    | "none";
  reasons: string[];
}

export function scoreHotelNames(
  leftName: string,
  rightName: string
): HotelNameScore {
  const left =
    analyzeHotelName(leftName);

  const right =
    analyzeHotelName(rightName);

  if (
    !left.normalized ||
    !right.normalized
  ) {
    return {
      score: 0,
      level: "none",
      reasons: []
    };
  }

  if (
    left.normalized ===
    right.normalized
  ) {
    return {
      score: 100,
      level: "exact",
      reasons: [
        "normalized_name_exact"
      ]
    };
  }

  let score = 0;
  const reasons: string[] = [];

  if (
    left.core.length >= 2 &&
    left.core === right.core
  ) {
    score += 55;
    reasons.push(
      "core_name_exact"
    );
  }

  const locationWords = [
    "中心花坛",
    "沃尔玛",
    "同惠广场",
    "职业技术学院",
    "湖北科技学院",
    "岔路口",
    "第一街",
    "财富广场",
    "万达广场",
    "光谷广场",
    "温泉路",
    "银泉大道"
  ];

  let sharedLocation = 0;
  let conflictingLocation = false;

  for (const word of locationWords) {
    const l =
      leftName.includes(word);

    const r =
      rightName.includes(word);

    if (l && r) {
      sharedLocation += 1;
    } else if (l !== r) {
      /*
       * 不立即判冲突。
       * 某个平台可能省略地点描述。
       */
    }
  }

  if (sharedLocation > 0) {
    score += Math.min(
      35,
      sharedLocation * 15
    );

    reasons.push(
      `shared_location:${sharedLocation}`
    );
  }

  /*
   * 同品牌但明确出现不同强门店词时，
   * 不允许形成 strong candidate。
   */
  const strongPlaces = [
    "中心花坛",
    "同惠广场",
    "职业技术学院",
    "岔路口",
    "财富广场",
    "万达广场",
    "光谷广场"
  ];

  const leftPlaces =
    strongPlaces.filter(
      (x) => leftName.includes(x)
    );

  const rightPlaces =
    strongPlaces.filter(
      (x) => rightName.includes(x)
    );

  if (
    leftPlaces.length &&
    rightPlaces.length &&
    !leftPlaces.some(
      (x) => rightPlaces.includes(x)
    )
  ) {
    conflictingLocation = true;

    reasons.push(
      "location_conflict"
    );
  }

  if (conflictingLocation) {
    return {
      score:
        Math.min(score, 40),
      level: "none",
      reasons
    };
  }

  if (score >= 70) {
    return {
      score,
      level: "strong",
      reasons
    };
  }

  return {
    score,
    level: "none",
    reasons
  };
}

export interface GroupingHotel {
  platform_hotel_row_id: string;
  platform: string;
  platform_hotel_id: string;
  hotel_name: string;
}

export interface HotelCandidateMember {
  platform_hotel_row_id: string;
  platform: string;
  platform_hotel_id: string;
  hotel_name: string;
  score: number;
  level: "exact" | "strong";
  reasons: string[];
}

export interface HotelCandidateGroup {
  suggestion_id: string;
  suggested_name: string;
  confidence: "exact" | "strong";
  members: HotelCandidateMember[];
}

function suggestionId(
  ids: string[]
): string {
  return ids
    .slice()
    .sort()
    .join("|");
}

export function groupHotelCandidates(
  hotels: GroupingHotel[]
): HotelCandidateGroup[] {
  const groups =
    new Map<
      string,
      HotelCandidateGroup
    >();

  for (const anchor of hotels) {
    const members:
      HotelCandidateMember[] = [
        {
          ...anchor,
          score: 100,
          level: "exact",
          reasons: [
            "anchor"
          ]
        }
      ];

    for (
      const platform of
      [
        ...new Set(
          hotels.map(
            (hotel) =>
              hotel.platform
          )
        )
      ]
    ) {
      if (
        platform ===
        anchor.platform
      ) {
        continue;
      }

      const scored =
        hotels
          .filter(
            (hotel) =>
              hotel.platform ===
              platform
          )
          .map((hotel) => ({
            hotel,
            result:
              scoreHotelNames(
                anchor.hotel_name,
                hotel.hotel_name
              )
          }))
          .filter(
            ({ result }) =>
              result.level ===
                "exact" ||
              result.level ===
                "strong"
          )
          .sort(
            (a, b) =>
              b.result.score -
              a.result.score
          );

      if (!scored.length) {
        continue;
      }

      const best =
        scored[0];

      const second =
        scored[1];

      /*
       * 若同一个平台出现并列最高候选，
       * 视为歧义，不自动放进建议组。
       */
      if (
        second &&
        second.result.score ===
          best.result.score
      ) {
        continue;
      }

      members.push({
        ...best.hotel,
        score:
          best.result.score,
        level:
          best.result.level as
            | "exact"
            | "strong",
        reasons:
          best.result.reasons
      });
    }

    if (members.length < 2) {
      continue;
    }

    /*
     * 每个建议组最多一个平台一个酒店。
     */
    const ids =
      members.map(
        (member) =>
          member.platform_hotel_row_id
      );

    const id =
      suggestionId(ids);

    const confidence =
      members
        .slice(1)
        .every(
          (member) =>
            member.level ===
            "exact"
        )
        ? "exact"
        : "strong";

    const suggestedName =
      members
        .map(
          (member) =>
            member.hotel_name
        )
        .sort(
          (a, b) =>
            b.length - a.length
        )[0] ||
      anchor.hotel_name;

    groups.set(id, {
      suggestion_id: id,
      suggested_name:
        suggestedName,
      confidence,
      members
    });
  }

  return [
    ...groups.values()
  ].sort((a, b) => {
    if (
      b.members.length !==
      a.members.length
    ) {
      return (
        b.members.length -
        a.members.length
      );
    }

    return a.suggested_name
      .localeCompare(
        b.suggested_name,
        "zh-CN"
      );
  });
}
