const assert = require('assert');
const parser = require('../platforms/ctrip/parser.js');

class Node {
  constructor(text = '', attrs = {}, map = {}) { this.textContent = text; this.attrs = attrs; this.id = attrs.id || ''; this.map = map; }
  getAttribute(name) { return this.attrs[name] || null; }
  querySelector(selector) { return this.map[selector]?.[0] || null; }
  querySelectorAll(selector) { return this.map[selector] || []; }
  contains() { return false; }
}

const text = (value, attrs = {}) => new Node(value, attrs);
function card({name = '白玉兰酒店(咸宁万达广场龙潭里店)', id = '125435763', ad = false, score = '4.7', reviews = '598条点评', original = '¥347', display = '¥319', hasOriginal = true, tags = ['十亿豪补', '早鸟优惠'], dynamic = '热卖！低价房仅剩3间', breakfast = '含早餐'} = {}) {
  const all = [text('白玉兰酒店(咸宁万达广场龙潭里店)')];
  const map = {
    '[class*="hotelName"]': [text(name)],
    '[class*="score"]': [text(score)],
    '[class*="review"]': [text(reviews)],
    '[class*="original"]': hasOriginal ? [text(original)] : [],
    '[class*="current"]': [text(display)],
    '[class*="tag"]': tags.map(text),
    '[class*="room"]': [text('豪华大床房')],
    '[class*="breakfast"]': breakfast ? [text(breakfast)] : [],
    '[class*="cancel"]': [text('免费取消')],
    '[class*="dynamic"]': [text(dynamic)],
    '*': [breakfast ? text(breakfast) : null, text('免费取消'), ad ? text('广告') : null].filter(Boolean),
    '[class*="ad"]': ad ? [text('广告')] : [],
    '[data-hotel-id]': [text('', {'data-hotel-id': '125435763'})],
    'a[href*="hotel"]': [text('', {href: '/hotel/125435763.html'})]
  };
  return new Node(`${ad ? '广告 ' : ''}${name} ${score} ${reviews} ${original} ${display} ${tags.join(' ')} ${dynamic}`, {'data-hotelid': id}, map);
}

assert.strictEqual(parser.parsePrice('¥1,209'), 1209);
assert.strictEqual(parser.parsePrice('无'), null);
assert.strictEqual(parser.parseReviewCount('598条点评'), 598);
assert.strictEqual(parser.parseReviewCount('4.4 191条点评'), 191);
assert.strictEqual(parser.parseReviewCount('评分4.4 · 191条点评'), 191);
assert.strictEqual(parser.parseReviewCount('4.4'), null);
assert.strictEqual(parser.parseReviewCount('评分4.4'), null);
assert.strictEqual(parser.parseReviewCount('交通方便，服务热情'), null);
assert.ok(!Object.is(parser.parseReviewCount('4.4191'), 4.4191));
assert.deepStrictEqual(parser.parseDiscountSummary('优惠17'), {count: null, amount: 17, text: '优惠17'});
assert.deepStrictEqual(parser.parseDiscountSummary('3项优惠93'), {count: 3, amount: 93, text: '3项优惠93'});
assert.deepStrictEqual(parser.parseDiscountSummary('4项优惠199'), {count: 4, amount: 199, text: '4项优惠199'});
assert.strictEqual(parser.parseDiscountSummary(null), null);

const idFromCard = new Node('白玉兰酒店', {id: '125435763'});
assert.strictEqual(parser.parseHotelCard(idFromCard, 1).platform_hotel_id, '125435763');

const idFromOfflineDescendant = new Node('雅斯特酒店', {}, {
  '[data-offline-hotelid]': [new Node('', {'data-offline-hotelid': '2114264'})]
});
assert.strictEqual(parser.parseHotelCard(idFromOfflineDescendant, 2).platform_hotel_id, '2114264');

const nonHotelDomId = new Node('酒店', {id: 'hotel-card'});
assert.strictEqual(parser.parseHotelCard(nonHotelDomId, 3).platform_hotel_id, null);

const normal = parser.parseHotelCard(card(), 1);
assert.deepStrictEqual(normal.rank, 1);
assert.strictEqual(normal.platform_hotel_id, '125435763');
assert.strictEqual(normal.hotel_name, '白玉兰酒店(咸宁万达广场龙潭里店)');
assert.strictEqual(normal.is_ad, false);
assert.strictEqual(normal.original_price, 347);
assert.strictEqual(normal.display_price, 319);
assert.deepStrictEqual(normal.activity_tags, ['十亿豪补', '早鸟优惠']);
assert.strictEqual(normal.latest_dynamic, '热卖！低价房仅剩3间');

const mappedPromotion = parser.parseHotelCard(card({tags: ['十亿豪补', '早鸟优惠', '优惠17']}), 1);
assert.deepStrictEqual(mappedPromotion.activity_tags, ['十亿豪补', '早鸟优惠']);
assert.deepStrictEqual(mappedPromotion.discount_summary, {count: null, amount: 17, text: '优惠17'});

const missingSpecificNodes = parser.parseHotelCard(new Node('酒店 4.4 598条点评 ¥200'), 1);
assert.strictEqual(missingSpecificNodes.hotel_name, null);
assert.strictEqual(missingSpecificNodes.review_count, null);

assert.strictEqual(parser.parseHotelCard(card({ad: true}), 2).is_ad, true);
assert.strictEqual(parser.parseHotelCard(new Node('酒店 优享会', {}, {'*': [text('优享会'), text('免费取消')]}), 2).is_ad, false);
assert.strictEqual(parser.parseHotelCard(card({breakfast: '包早餐'}), 2).breakfast, '包早餐');
assert.strictEqual(parser.parseHotelCard(card({breakfast: null}), 2).breakfast, null);
assert.strictEqual(parser.parseHotelCard(card({breakfast: null}), 2).cancellation, '免费取消');
assert.strictEqual(parser.parseHotelCard(card({score: '—'}), 3).score, null);
assert.strictEqual(parser.parseHotelCard(card({original: '¥319', display: '¥319', hasOriginal: false}), 4).original_price, null);
assert.strictEqual(parser.parseHotelCard(card({tags: []}), 5).activity_tags.length, 0);
assert.strictEqual(parser.parseHotelCard(card({dynamic: ''}), 6).latest_dynamic, null);
assert.strictEqual(parser.parseHotelCard(card({dynamic: '4小时前有人预订'}), 7).latest_dynamic, '4小时前有人预订');
assert.strictEqual(parser.parseHotelCard(card({dynamic: '57分钟前有人预订'}), 8).latest_dynamic, '57分钟前有人预订');

const magnolia = parser.parseHotelCard(card({id: '125435763', ad: true, score: '4.7', reviews: '598条点评', original: '¥204', display: '¥187', tags: ['十亿豪补', '早鸟优惠', '优惠17'], dynamic: '热卖！低价房仅剩1间'}), 1);
assert.strictEqual(magnolia.platform_hotel_id, '125435763');
assert.strictEqual(magnolia.score, 4.7);
assert.strictEqual(magnolia.review_count, 598);
assert.strictEqual(magnolia.original_price, 204);
assert.strictEqual(magnolia.display_price, 187);
assert.strictEqual(magnolia.is_ad, true);
assert.strictEqual(magnolia.latest_dynamic, '热卖！低价房仅剩1间');
assert.ok(!magnolia.activity_tags.some((tag) => /位置优越|周边美食/.test(tag)));

const yeste = parser.parseHotelCard(card({name: '雅斯特酒店(咸宁温泉路中心花坛店)', id: '2114264', score: '4.4', reviews: '191条点评', original: '¥233', display: '¥140', tags: ['门店首单', '折扣券', '十亿豪补', '3项优惠93'], dynamic: '连续21位住客好评'}), 2);
assert.strictEqual(yeste.platform_hotel_id, '2114264');
assert.strictEqual(yeste.score, 4.4);
assert.strictEqual(yeste.review_count, 191);
assert.strictEqual(yeste.original_price, 233);
assert.strictEqual(yeste.display_price, 140);
assert.strictEqual(yeste.is_ad, false);
assert.strictEqual(yeste.latest_dynamic, '连续21位住客好评');
assert.deepStrictEqual(yeste.discount_summary, {count: 3, amount: 93, text: '3项优惠93'});
assert.ok(!yeste.activity_tags.includes('3项优惠93'));
assert.notStrictEqual(yeste.review_count, 4.4191);
assert.notStrictEqual(yeste.display_price, 3);

const splitRoot = parser.parseHotelCard({element: card({id: null}), platform_hotel_id: '2114264'}, 1);
assert.strictEqual(splitRoot.platform_hotel_id, '2114264');

const noReviewSemantic = parser.parseHotelCard(card({reviews: '4.4191'}), 1);
assert.strictEqual(noReviewSemantic.review_count, null);
const combinedReview = parser.parseHotelCard(card({reviews: '4.4 191条点评'}), 1);
assert.strictEqual(combinedReview.review_count, 191);
assert.ok(!magnolia.activity_tags.includes(magnolia.latest_dynamic));

const aiduo = parser.parseHotelCard(card({name: '艾朵智享酒店(咸宁咸安区湖北科技学院店)', id: '135904932', score: '—', reviews: '1条点评', original: '¥358', display: '¥159', tags: [], dynamic: '21分钟前有人预订', breakfast: null}), 10);
assert.strictEqual(aiduo.platform, 'ctrip');
assert.strictEqual(aiduo.platform_hotel_id, '135904932');
assert.strictEqual(aiduo.score, null);
assert.strictEqual(aiduo.review_count, 1);
assert.strictEqual(aiduo.room_name, '豪华大床房');
assert.strictEqual(aiduo.breakfast, null);
assert.strictEqual(aiduo.cancellation, '免费取消');
assert.strictEqual(aiduo.original_price, 358);
assert.strictEqual(aiduo.display_price, 159);
assert.strictEqual(aiduo.latest_dynamic, '21分钟前有人预订');

console.log('parser fixtures: 8 cases passed');
