import {CONFIG,businessDate,addDays,nowIso} from './config.js';
export function hash(s){let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
export function schedule(plans,now=Date.now(),onlineDevices=1,estimatedSeconds=CONFIG.estimatedTaskSeconds){
 const today=businessDate(now);const tasks=[];
 for(const plan of plans){if(!plan.enabled)continue;for(let offset=0;offset<plan.horizon;offset++){
 const tier=CONFIG.frequencies.find(x=>offset>=x.from&&offset<=x.to);const checkin=addDays(today,offset);
 if(tier.everyDays&&Math.floor(Date.parse(today)/86400000)%tier.everyDays!==hash(plan.id)%tier.everyDays)continue;
 for(const w of tier.windows){const [start,end]=CONFIG.windows[w];const a=Date.parse(today+'T00:00:00+08:00')+start*3600000,b=Date.parse(today+'T00:00:00+08:00')+end*3600000;if(b<=now)continue;
 tasks.push({...plan,id:undefined,plan_id:plan.id,schedule_key:`${plan.id}/${today}/${checkin}/${w}`,checkin,checkout:addDays(checkin,1),window_start:nowIso(a),window_end:nowIso(b)});
 }}}
 const groups=Map.groupBy(tasks,t=>t.window_start);
 for(const group of groups.values()){group.sort((a,b)=>hash(a.schedule_key)-hash(b.schedule_key));const a=Date.parse(group[0].window_start),b=Date.parse(group[0].window_end);const reserve=Math.min(estimatedSeconds*1000,(b-a)/4);const usable=b-a-reserve;const spacing=usable/group.length;
 group.forEach((t,i)=>{const jitter=(hash(t.schedule_key+'jitter')%1000)/1000; t.due_at=nowIso(a+Math.floor(spacing*(i+0.2+jitter*0.6)));t.capacity_warning=group.length*estimatedSeconds>(b-a)/1000*Math.max(onlineDevices,1);});}
 return tasks;
}
export async function generatePlans(db,now=Date.now()){
 const plans=(await db.prepare('SELECT * FROM plans WHERE enabled=1').bind().all()).results;const devices=await db.prepare("SELECT COUNT(*) n FROM devices WHERE status='approved' AND last_seen_at>?").bind(nowIso(now-CONFIG.offlineSeconds*1000)).first();
 const generated=schedule(plans,now,devices.n);if(!generated.length)return 0;
 // JSON bulk insert keeps even a 30-day plan below D1 per-invocation query limits.
 const r=await db.prepare(`INSERT OR IGNORE INTO tasks(id,plan_id,schedule_key,platform,city,keyword,scope,collection_limit,checkin,checkout,status,created_at,due_at,window_start,window_end,capacity_warning)
 SELECT lower(hex(randomblob(16))),json_extract(value,'$.plan_id'),json_extract(value,'$.schedule_key'),json_extract(value,'$.platform'),json_extract(value,'$.city'),json_extract(value,'$.keyword'),json_extract(value,'$.scope'),json_extract(value,'$.collection_limit'),json_extract(value,'$.checkin'),json_extract(value,'$.checkout'),'PENDING',?,json_extract(value,'$.due_at'),json_extract(value,'$.window_start'),json_extract(value,'$.window_end'),json_extract(value,'$.capacity_warning') FROM json_each(?)`).bind(nowIso(now),JSON.stringify(generated)).run();return r.meta.changes;
}
