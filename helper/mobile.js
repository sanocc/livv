// Runs only in the extension's isolated world on its own managed Ctrip tab.
export function pageStep(task,phase){
 const norm=s=>String(s??'').replace(/\s+/g,' ').trim(),visible=e=>!!e&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;
 const txt=e=>norm(e?.textContent),u=new URL(location.href);const body=document.body?.innerText??'';
 if(document.querySelector('[class*="captcha"],iframe[src*="captcha"]')&&/验证|滑块/.test(body))return {error:'CAPTCHA_REQUIRED'};
 if(/登录/.test(document.title)&&!body.includes('酒店'))return {error:'LOGIN_REQUIRED'};
 const pick=(selector)=>Array.from(document.querySelectorAll(selector)).find(visible);
 const fill=(input,value)=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));};
 if(phase==='CITY_OPEN'){const e=pick('[class*="dest-keyword-column"]');if(!e)return {wait:true};e.click();return {phase:'CITY_INPUT'};}
 if(phase==='CITY_INPUT'){
  if(!u.pathname.includes('citySearch'))return {wait:true};const e=pick('input[type="text"]');if(!e)return {wait:true};if(e.value!==task.city){fill(e,task.city);return {wait:true};}
  const candidate=Array.from(document.querySelectorAll('[class*="keywordItemMainContainer"]')).find(e=>visible(e)&&txt(e).includes(task.city)&&txt(e).includes('城市'));
  if(!candidate)return {wait:true};candidate.click();return {phase:task.keyword?'KEYWORD_OPEN':'SEARCH'};
 }
 if(phase==='KEYWORD_OPEN'){
  if(!u.pathname.endsWith('/search'))return {wait:true};const city=pick('[class*="dest-keyword-column"]');if(!txt(city).includes(task.city))return {error:'CITY_NOT_CONFIRMED'};
  const e=pick('[class*="keyword-hint-container"],[class*="keyword-row"]');if(!e)return {wait:true};e.click();return {phase:'KEYWORD_INPUT'};
 }
 if(phase==='KEYWORD_INPUT'){
  if(!u.pathname.includes('citySearch'))return {wait:true};const input=pick('input[type="text"]');if(!input)return {wait:true};if(input.value!==task.keyword){fill(input,task.keyword);return {wait:true};}
  const candidates=Array.from(document.querySelectorAll('[class*="keywordItemMainContainer"]')).filter(e=>visible(e)&&txt(e).includes(task.keyword));if(!candidates.length)return {wait:true};
  const exact=candidates.filter(e=>Array.from(e.querySelectorAll('span')).some(n=>txt(n)===task.keyword));if(exact.length!==1)return {error:'KEYWORD_AMBIGUOUS'};exact[0].click();return {phase:'SEARCH'};
 }
 if(phase==='SEARCH'){
  if(!u.pathname.endsWith('/search'))return {wait:true};const city=pick('[class*="dest-keyword-column"]'),keyword=pick('[class*="keyword-hint-container"],[class*="keyword-row"]');if(!txt(city).includes(task.city)||task.keyword&&!txt(keyword).includes(task.keyword))return {error:'SEARCH_CONTEXT_NOT_CONFIRMED'};
  const e=Array.from(document.querySelectorAll('span,div')).filter(visible).find(e=>norm(e.textContent).replace(/\s/g,'')==='查询'&&e.childElementCount===0);if(!e)return {wait:true};e.click();return {phase:'SET_DATES'};
 }
 if(phase==='SET_DATES'){
  if(!u.pathname.includes('listPage'))return {wait:true};u.searchParams.set('c-in',task.checkin);u.searchParams.set('c-out',task.checkout);for(const key of ['cache-key','cacheKey','page-token','dplinktracelogid'])u.searchParams.delete(key);u.searchParams.set('notCacheControl','1');return {navigate:u.href,phase:'LIST'};
 }
 return {wait:true};
}
export function inspectList(){
 const norm=s=>s==null?null:String(s).replace(/\s+/g,' ').trim()||null,u=new URL(location.href),param=k=>u.searchParams.get(k);let city=null,keyword=null;try{city=JSON.parse(param('d-name'))?.[0]??null;keyword=JSON.parse(param('s-keyword'))?.[0]??'';}catch{}
 const text=(e,selector)=>norm(e.querySelector(selector)?.textContent),price=s=>{if(!s)return null;const m=s.replace(/,/g,'').match(/(?:¥|￥)\s*(\d+(?:\.\d+)?)/);return m?Number(m[1]):null;};
 // Exact list card selector will be verified against the live mobile DOM before Gate F.
 const all=Array.from(document.querySelectorAll('[data-hotelid],[data-hotel-id],[class*="hotelCard"],[class*="hotel-card"],[class*="hotelItem"]'));
 const candidates=all.filter(e=>e.querySelector('img[src*="_ubt_hotelId="]')||e.hasAttribute('data-hotelid')||e.hasAttribute('data-hotel-id'));
 const cards=candidates.filter(e=>!candidates.some(o=>o!==e&&e.contains(o)));
 const hotels=cards.map((e,i)=>{const image=e.querySelector('img[src*="_ubt_hotelId="]');const id=e.getAttribute('data-hotelid')??e.getAttribute('data-hotel-id')??image?.getAttribute('src')?.match(/_ubt_hotelId=(\d+)/)?.[1]??null;
  const name=text(e,'[class*="hotelName"],[class*="hotel-name"],[class*="nameText"],[class*="name_text"]');const priceRoot=e.querySelector('[class*="price"]');const priceText=norm(priceRoot?.textContent);const prices=priceText?Array.from(priceText.matchAll(/(?:¥|￥)\s*(\d+(?:\.\d+)?)/g)).map(m=>Number(m[1])):[];
  const leaf=Array.from(e.querySelectorAll('span,div')).filter(n=>n.childElementCount===0).map(n=>norm(n.textContent));
  return {hotel_id:id,hotel_name:name,rank:i+1,is_ad:leaf.includes('广告'),score:(()=>{const s=text(e,'[class*="score"]');return s&&/^\d(?:\.\d)?$/.test(s)?Number(s):null;})(),dynamic:leaf.find(s=>s&&/有人预订|热卖！|连续\d+位/.test(s))??null,activity_tags:(()=>{const t=Array.from(e.querySelectorAll('[class*="promotion"],[class*="activity"],[class*="discountTag"]')).map(n=>norm(n.textContent)).filter(Boolean);return t.length?[...new Set(t)]:null;})(),original_price:prices.length===2?prices[0]:price(text(e,'[class*="originalPrice"],[class*="origin-price"]')),display_price:prices.length===1?prices[0]:prices.length===2?prices[1]:null};});
 const exhausted=Array.from(document.querySelectorAll('span,div')).some(e=>e.childElementCount===0&&/^(没有更多了|已加载全部|没有更多酒店|到底了)$/.test(norm(e.textContent)??''));
 return {url:u.href,context:{platform:'ctrip',city,keyword,checkin:param('c-in'),checkout:param('c-out')},hotels:hotels.filter(x=>x.hotel_id&&x.hotel_name),unparsed_cards:hotels.filter(x=>!x.hotel_id||!x.hotel_name).length,exhausted,observed_at:new Date().toISOString(),captcha:!!document.querySelector('[class*="captcha"]')&&/验证/.test(document.body.innerText)};
}
export function scrollList(){const scrollables=Array.from(document.querySelectorAll('div')).filter(e=>e.scrollHeight>e.clientHeight+100&&/(auto|scroll)/.test(getComputedStyle(e).overflowY));const e=scrollables.sort((a,b)=>b.clientHeight-a.clientHeight)[0]??document.scrollingElement;const before=e.scrollTop;e.scrollTop+=Math.max(500,e.clientHeight*0.8);return {before,after:e.scrollTop};}
export function inspectDetail(hotel){
 const norm=s=>String(s??'').replace(/\s+/g,' ').trim(),leaf=Array.from(document.querySelectorAll('span,div')).filter(e=>e.childElementCount===0),evidence=leaf.map(e=>norm(e.textContent)).find(s=>/^(该酒店已订完|酒店已订完|当前日期无可售房间|满房|无可售房间)$/.test(s));
 if(evidence)return {rooms:[{hotel_id:hotel.hotel_id,hotel_name:hotel.hotel_name,room_name:'酒店整体售罄',original_price:null,display_price:null,activity_tags:null,availability_status:'sold_out',sold_out_evidence:evidence}]};
 const nodes=Array.from(document.querySelectorAll('[class*="roomItem"],[class*="room-item"],[class*="roomCard"]'));const cards=nodes.filter(e=>!nodes.some(o=>o!==e&&e.contains(o)));
 const rooms=cards.map(e=>{const name=norm(e.querySelector('[class*="roomName"],[class*="room-name"]')?.textContent);const prices=Array.from(norm(e.querySelector('[class*="price"]')?.textContent).matchAll(/[¥￥]\s*(\d+(?:\.\d+)?)/g)).map(x=>Number(x[1]));const sold=Array.from(e.querySelectorAll('span,div')).filter(x=>x.childElementCount===0).map(x=>norm(x.textContent)).find(x=>/^(已订完|满房|无可售|售罄)$/.test(x));return {hotel_id:hotel.hotel_id,hotel_name:hotel.hotel_name,room_name:name,original_price:prices.length===2?prices[0]:null,display_price:sold?null:prices.at(-1)??null,activity_tags:null,availability_status:sold?'sold_out':'available',sold_out_evidence:sold??null};}).filter(r=>r.room_name&&(r.display_price!==null||r.sold_out_evidence));return {rooms};
}
export function detailLink(hotelId){const nodes=Array.from(document.querySelectorAll('[data-hotelid],[data-hotel-id],[class*="hotelCard"],[class*="hotel-card"],[class*="hotelItem"]'));const card=nodes.find(e=>(e.getAttribute('data-hotelid')??e.getAttribute('data-hotel-id'))===hotelId||e.querySelector(`img[src*="_ubt_hotelId=${hotelId}&"]`));if(!card)return {error:'DETAIL_CARD_NOT_FOUND'};card.click();return {ok:true};}
