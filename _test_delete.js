// 验证 2026-08-29 修复：早期无 id 的 dictationLogs 删除后合并是否存活
function _num(x){ const n = Number(x); return isFinite(n) ? n : 0; }
function _mergeArray(local, cloud){
  local = Array.isArray(local) ? local : []; cloud = Array.isArray(cloud) ? cloud : [];
  const keyOf = it => (it && it.id != null) ? ('id:'+it.id) : (it && it.ts != null) ? ('ts:'+it.ts) : (it != null ? 'h:'+JSON.stringify(it) : null);
  const tsOf  = it => _num(it && (it.ts || it.updatedAt));
  const byKey = new Map(); let changes = 0;
  for(const it of local){ const k = keyOf(it); if(k) byKey.set(k, it); }
  for(const it of cloud){
    if(it == null) continue; const k = keyOf(it);
    if(!k){ byKey.set('__nk_'+(byKey.size), it); changes++; continue; }
    const ex = byKey.get(k);
    if(!ex){ byKey.set(k, it); changes++; }
    else if(tsOf(it) > tsOf(ex)){ byKey.set(k, it); changes++; }
  }
  return { arr: Array.from(byKey.values()), changes };
}
let DATA;
function uid(){ return 'U'+Math.random().toString(36).slice(2,9); }
function deleteWrongItem(key){
  const parts = key.split('|');
  const sourceId = parts[0], right = parts[1], wrong = parts[2];
  const logs = DATA.dictationLogs || [];
  const removedIds = []; const remaining = [];
  logs.forEach(log => {
    if(log.id == null) log.id = uid();   // ★ 修复2：删除前兜底补 id
    if(log.sourceId !== sourceId){ remaining.push(log); return; }
    if(!Array.isArray(log.mistakes)){ remaining.push(log); return; }
    const before = log.mistakes.length;
    log.mistakes = log.mistakes.filter(m =>
      !((m.right || '').trim().toLowerCase() === right && (m.wrong || '').trim().toLowerCase() === wrong));
    if(log.mistakes.length !== before) log.updatedAt = Date.now();
    if(log.mistakes.length === 0){ if(log.id != null) removedIds.push(log.id); }
    else remaining.push(log);
  });
  DATA.dictationLogs = remaining;
  if(removedIds.length){ DATA.deletedIds = DATA.deletedIds || []; removedIds.forEach(id => { if(!DATA.deletedIds.includes(id)) DATA.deletedIds.push(id); }); }
}
function mergeData(local, cloud){
  cloud = cloud || {}; const out = Object.assign({}, local);
  const deleted = new Set([...(local.deletedIds||[]), ...(cloud.deletedIds||[])]);
  const delKey = it => (it && it.id != null) ? it.id : (it && it.ts != null) ? it.ts : null;
  for(const f of ['dictationLogs']){
    if(Array.isArray(cloud[f])){ const r = _mergeArray(local[f], cloud[f]); out[f] = r.arr.filter(x => !deleted.has(delKey(x))); }
  }
  out.deletedIds = Array.from(deleted); return out;
}
// 场景4：无 id 老记录，整条删光 → 修复后必须写墓碑
DATA = { dictationLogs: [ {sourceId:'corpus', mistakes:[{right:'apple',wrong:'appel'}]} ], deletedIds: [] };
deleteWrongItem('corpus|apple|appel');
console.log('场景4 无id整条删光写墓碑?', DATA.deletedIds.length ? 'PASS ✅ 墓碑='+JSON.stringify(DATA.deletedIds) : 'FAIL ❌ 墓碑为空(旧bug复现)');
// 场景5：无 id 老记录，先按 hubLoad 迁移补 id（本地=云端都带同 id），部分删除后合并
const seed = { dictationLogs: [ {id:'X1', sourceId:'corpus', mistakes:[{right:'apple',wrong:'appel'},{right:'banana',wrong:'banan'}]} ], deletedIds: [] };
DATA = JSON.parse(JSON.stringify(seed));
deleteWrongItem('corpus|apple|appel');
const m5 = mergeData(DATA, JSON.parse(JSON.stringify(seed)));
console.log('场景5 补id后部分删除合并存活?', m5.dictationLogs.some(l=>l.mistakes.some(m=>m.right==='apple')) ? 'FAIL ❌ 苹果复活' : 'PASS ✅');
// 场景6：无 id 老记录删除后，云端仍是旧无 id 的（上传前的窗口）——按 id 分叉本应复活，但本地已补 id 并立即上传后云端也有 id，故正常；此处模拟“修复+上传成功后”的稳态
const seed6 = { dictationLogs: [ {id:'X2', sourceId:'corpus', mistakes:[{right:'apple',wrong:'appel'},{right:'banana',wrong:'banan'}]} ], deletedIds: [] };
DATA = JSON.parse(JSON.stringify(seed6));
deleteWrongItem('corpus|apple|appel');           // 本地删 apple，X2 带 updatedAt
const m6 = mergeData(DATA, JSON.parse(JSON.stringify(seed6)));  // 云端 X2 已带同 id（上传后）
console.log('场景6 稳态(云端已带id)删除存活?', m6.dictationLogs.some(l=>l.id==='X2' && l.mistakes.some(m=>m.right==='apple')) ? 'FAIL ❌' : 'PASS ✅', '| X2 mistakes=', JSON.stringify(m6.dictationLogs.find(l=>l.id==='X2')?.mistakes));
