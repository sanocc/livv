import {CONFIG,nowIso} from './config.js';
import {requireThat,text,marketRows,roomRows,analyze} from './domain.js';
import {first,rows,stmt,event} from './db.js';
import {sha256} from './auth.js';
export async function upload(db,device,a,input,now=Date.now()){
 const hash=await sha256(JSON.stringify(input)),existing=await first(db,'SELECT * FROM snapshots WHERE attempt_id=?',a.id);
 if(existing){requireThat(existing.payload_hash===hash,'IDEMPOTENCY_CONFLICT',409);return {snapshot_id:existing.id,idempotent:true};}
 const t=await first(db,'SELECT * FROM tasks WHERE id=?',a.task_id),at=nowIso(now);
 requireThat(a.status==='RUNNING'&&a.started_at&&a.timeout_at>at&&a.lease_until>at&&t.window_end>at,'ATTEMPT_EXPIRED',409);
 requireThat(input.source==='ctrip-dom'&&input.platform===t.platform&&input.city===t.city&&input.keyword===t.keyword&&input.checkin===t.checkin&&input.checkout===t.checkout,'PAGE_CONTEXT_MISMATCH');
 const observed=new Date(input.observed_at).toISOString();requireThat(observed>=a.started_at&&observed<=at&&observed<t.window_end,'OBSERVATION_OUTSIDE_ATTEMPT');
 requireThat(typeof input.exhausted==='boolean','EXHAUSTION_FLAG_REQUIRED');const stop=text(input.stop_reason,80);requireThat(['TARGET_REACHED','NATURAL_END','TIMEOUT','SAFETY_LIMIT','STALLED'].includes(stop),'INVALID_STOP_REASON');if(input.exhausted)requireThat(stop==='NATURAL_END','EXHAUSTION_EVIDENCE_MISMATCH');
 const market=marketRows(input.hotels,t.collection_limit);requireThat(t.scope!=='all'||input.exhausted,'ALL_MARKET_NOT_EXHAUSTED');
 const expected=new Set(JSON.parse(a.core_hotels).map(x=>x.hotel_id).filter(id=>market.some(h=>h.hotel_id===id)));
 const detail=input.detail_results??[];requireThat(Array.isArray(detail)&&detail.length===expected.size&&new Set(detail.map(x=>x.hotel_id)).size===detail.length&&detail.every(x=>expected.has(x.hotel_id)&&['SUCCESS','FAILED'].includes(x.status)),'INVALID_DETAIL_RESULTS');
 const rooms=roomRows(input.rooms??[],market,expected);for(const d of detail){if(d.status==='SUCCESS')requireThat(rooms.some(r=>r.hotel_id===d.hotel_id),'DETAIL_SUCCESS_WITHOUT_ROOMS');else requireThat(!rooms.some(r=>r.hotel_id===d.hotel_id),'FAILED_DETAIL_WITH_ROOMS');}
 const detailSuccess=detail.filter(x=>x.status==='SUCCESS').length,marketStatus=market.length>=(t.collection_limit??0)||input.exhausted?'SUCCESS':'PARTIAL';
 const status=marketStatus==='SUCCESS'&&detailSuccess===detail.length?'COMPLETED':'PARTIAL';const id=crypto.randomUUID();
 const labels=await rows(db,'SELECT m.hotel_id,h.category FROM hotel_mappings m JOIN livv_hotels h ON h.id=m.livv_hotel_id WHERE m.platform=?',t.platform);const categories=new Map(labels.map(x=>[x.hotel_id,x.category]));
 const previous=await first(db,`SELECT s.id FROM snapshots s JOIN tasks t ON t.id=s.task_id WHERE t.platform=? AND t.city=? AND t.keyword=? AND t.checkin=? AND t.checkout=? AND t.scope=? AND t.collection_limit IS ? ORDER BY s.observed_at DESC LIMIT 1`,t.platform,t.city,t.keyword,t.checkin,t.checkout,t.scope,t.collection_limit);
 const prev=previous?await rows(db,'SELECT * FROM market_observations WHERE snapshot_id=?',previous.id):[];
 const history=await rows(db,`SELECT a.recommendation FROM market_analyses a JOIN snapshots s ON s.id=a.snapshot_id JOIN tasks t ON t.id=s.task_id WHERE t.platform=? AND t.city=? AND t.keyword=? AND t.checkin=? AND t.scope=? AND t.collection_limit IS ? ORDER BY a.created_at DESC LIMIT 3`,t.platform,t.city,t.keyword,t.checkin,t.scope,t.collection_limit);
 const analysis=analyze(market.map(h=>({...h,category:categories.get(h.hotel_id)??'other'})),prev,rooms,history);
 await db.batch([
 stmt(db,'INSERT INTO snapshots VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,t.id,a.id,device.id,observed,at,input.exhausted?1:0,stop,hash,market.length,marketStatus,detailSuccess,detail.length,JSON.stringify(detail.map(x=>({hotel_id:x.hotel_id,status:x.status,error_code:x.status==='FAILED'?text(x.error_code??'DETAIL_FAILED',80):null})))),
 stmt(db,`INSERT INTO platform_hotels(platform,hotel_id,original_name,first_seen_at,last_seen_at) SELECT ?,json_extract(value,'$.hotel_id'),json_extract(value,'$.hotel_name'),?,? FROM json_each(?) WHERE true ON CONFLICT(platform,hotel_id) DO UPDATE SET original_name=excluded.original_name,last_seen_at=excluded.last_seen_at`,t.platform,observed,observed,JSON.stringify(market)),
 stmt(db,`INSERT INTO market_observations SELECT ?,?,json_extract(value,'$.hotel_id'),json_extract(value,'$.hotel_name'),json_extract(value,'$.rank'),json_extract(value,'$.is_ad'),json_extract(value,'$.score'),json_extract(value,'$.dynamic'),json_extract(value,'$.activity_tags'),json_extract(value,'$.original_price'),json_extract(value,'$.display_price') FROM json_each(?)`,id,t.platform,JSON.stringify(market)),
 stmt(db,`INSERT INTO room_observations(snapshot_id,platform,hotel_id,hotel_name,room_name,original_price,display_price,activity_tags,availability_status,sold_out_evidence) SELECT ?,?,json_extract(value,'$.hotel_id'),json_extract(value,'$.hotel_name'),json_extract(value,'$.room_name'),json_extract(value,'$.original_price'),json_extract(value,'$.display_price'),json_extract(value,'$.activity_tags'),json_extract(value,'$.availability_status'),json_extract(value,'$.sold_out_evidence') FROM json_each(?)`,id,t.platform,JSON.stringify(rooms)),
 stmt(db,'INSERT INTO market_analyses VALUES(?,?,?,?,?,?,?,?,?,?,?)',crypto.randomUUID(),id,at,t.checkin,t.scope,analysis.algorithm_version,analysis.recommendation,analysis.reason,analysis.score,JSON.stringify(analysis.facts),analysis.facts.myPrice),
 stmt(db,`UPDATE attempts SET status=?,finished_at=? WHERE id=?`,status,at,a.id),
 stmt(db,`UPDATE tasks SET status=?,finished_at=?,market_status=?,detail_success=?,detail_total=?,error_code=? WHERE id=?`,status,at,marketStatus,detailSuccess,detail.length,status==='PARTIAL'?'PARTIAL_COLLECTION':null,t.id),
 event(db,a,status,at,status==='PARTIAL'?'PARTIAL_COLLECTION':null,`Market ${market.length}; details ${detailSuccess}/${detail.length}`)
 ]);
 return {snapshot_id:id,status,market_count:market.length,detail_success:detailSuccess,detail_total:detail.length,analysis};
}
