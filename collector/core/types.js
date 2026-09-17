/**
 * LIVV Collector M04
 *
 * 统一 OTA 酒店事实结构。
 *
 * Adapter 负责：
 * OTA 页面 -> HotelFact
 *
 * API/D1 不属于 Adapter 职责。
 */

/**
 * HotelFact
 *
 * {
 *   platform: "ctrip" | "meituan" | "fliggy" | "tongcheng",
 *
 *   platform_hotel_id: string | null,
 *   hotel_name: string,
 *
 *   display_position: number | null,
 *
 *   display_price: number | null,
 *   list_price: number | null,
 *   currency: "CNY",
 *
 *   sold_out: boolean,
 *   is_ad: boolean,
 *
 *   rating: number | null,
 *   review_count: number | null,
 *
 *   room_name: string | null,
 *   promotions: string[],
 *
 *   source_url: string,
 *
 *   quality: {
 *     card: boolean,
 *     name: boolean,
 *     official_id: boolean,
 *     price: boolean,
 *     ambiguous_price: boolean
 *   },
 *
 *   evidence: {
 *     card_selector: string | null,
 *     id_source: string | null,
 *     price_source: string | null,
 *     name_source: string | null
 *   },
 *
 *   raw: {}
 * }
 */

export const LIVV_HOTEL_FACT_VERSION = "1.0";
