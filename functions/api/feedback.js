// Cloudflare Pages Function: /api/feedback —— 用户意见反馈（她 10/2 拍板：更多抽屉 + 设置页双入口）
//
// 定位：**单向只写服务端**的数据。绝不进 DATA、绝不进云同步 blob
//    （口径同 vip:<acct>：DATA 在客户端可改，且整份上云会撑爆 blob）。
//    前端只负责收集 + 提交，看/管理一律走 /api/admin（X-Admin-Key 鉴权）。
//
// KV 键（SYNC_KV，与 user/sess/inv/vip/ai* 前缀完全隔离）：
//   fb:<id>      反馈正文 JSON（含 ts/acct/anon/page/text/contact/imgs 张数/env/read）
//   fbimg:<id>   该条全部图片的 JSON 数组（[{"mime","b64"}]）—— 一次写完，
//                不一张一写（KV 写入配额 precious；且 admin 列表只读 fb: 不碰图片体）
//   fbr:<ip>:<YYYYMMDD>:<0-9>  限频计数（10 分钟桶 × 10 轮转 = 一天一个循环键，同 ai.js 口径）
//   fbseq        自增序号（给 id 用；KV 无原子自增，读-改-写，她的量级无并发风险）
//
// 硬校验链（任一不过即拒收，绝不「宽容收下」）：
//   1. SYNC_KV 未绑定            → 503
//   2. 同 IP 当日 ≥5 条           → 429
//   3. text 空或 >1000 字         → 400
//   4. 图片 >3 张 / mime 不在白名单 / 解码后 >150KB / base64 >200KB → 413
//   5. 全站 fbseq >5000           → 503（防刷爆 KV）
//
// ⚠️ 图片存 KV 的账（她已认可）：单张前端压到 ≤120KB、一条 ≤3 张 → 一条约 380KB。
//    免费版 KV 存储 1GB，1000 写/天；一条反馈只写 2 次（图片 1 + 正文 1），
//    就算收 100 条带图反馈也才 ~30MB / 3%。若日后要收紧，只动下面 MAX_IMG_KB / MAX_IMGS 常量。
//
// 登录态**可选**：带 X-Session 且有效 → 记 acct；没带/失效也能提交（给 anon 短 id 便于辨识同一人）。
// 绝不因「没登录」拒绝——反馈是低频善意的入口，把门关死只会让人转去微信。

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type, X-Session',
  'access-control-max-age': '86400',
};

const MAX_TEXT = 1000;          // 文字上限（她要能写清楚问题，但不许当留言板）
const MAX_IMGS = 3;             // 最多 3 张图
const MAX_IMG_KB = 150;         // 单张解码后上限（前端压到 120，留余量）
const MAX_B64_CHARS = 200 * 1024;   // base64 串长度上限（防超长串打爆 CPU，≈150KB 二进制）
const MAX_TOTAL_KB = 420;       // 一条反馈图片总体积上限（KV 单值 25MB，这里远低于）
const DAILY_LIMIT = 5;          // 同 IP 每日条数（她 10/2 认可的建议值）
const TOTAL_LIMIT = 5000;       // 全站总量保护：超了直接拒收，提示转微信
const IMG_MIME = ['image/jpeg', 'image/png'];   // 前端一律转 JPEG；PNG 白名单留着（1x1 探针/特殊图）

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    }, CORS),
  });
}

function dayKeyUTC(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate());
}

/* 10 分钟桶（0-9）——同 ai.js bucketOf 口径：一天 10 个桶轮转，sumBuckets 把当天全加起来 */
function bucketOf(d) { return Math.floor(d.getUTCMinutes() % 10); }

async function sumBuckets(kv, prefix, day) {
  let n = 0;
  for (let b = 0; b < 10; b++) {
    const v = parseInt((await kv.get(prefix + ':' + day + ':' + b)) || '0', 10) || 0;
    n += v;
  }
  return n;
}

/* base64 → 近似字节数（KV/Worker 里 atob 开销大，用长度估算即可，误差不影响限额判断） */
function approxBytes(b64) { return Math.floor(b64.length * 3 / 4); }

function clientIp(request) {
  return String(request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown')
    .split(',')[0].trim();
}

/* 匿名短 id：同一人的多条反馈可辨识（不含任何身份信息，纯随机） */
function anonId() {
  const b = new Uint8Array(4);
  crypto.getRandomValues(b);
  let s = '';
  for (let i = 0; i < 4; i++) s += ('0123456789abcdef')[b[i] % 16];
  return s;
}

function randId() {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  let s = '';
  for (let i = 0; i < 8; i++) s += ('0123456789abcdef')[b[i] % 16];
  return s;
}

/* env 只留 6 个白名单键，其余**丢弃**（防前端顺手把学习数据塞进来外传） */
function pickEnv(raw) {
  const e = (raw && typeof raw === 'object') ? raw : {};
  const out = {};
  const w = parseInt(e.w, 10), h = parseInt(e.h, 10), dpr = parseFloat(e.dpr);
  if (Number.isFinite(w) && w > 0 && w < 20000) out.w = w;
  if (Number.isFinite(h) && h > 0 && h < 20000) out.h = h;
  if (Number.isFinite(dpr) && dpr > 0 && dpr < 10) out.dpr = Math.round(dpr * 100) / 100;
  if (typeof e.ua === 'string' && e.ua.length) out.ua = e.ua.slice(0, 180);
  out.dark = !!e.dark;
  if (typeof e.tz === 'string' && e.tz.length) out.tz = e.tz.slice(0, 40);
  return out;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  /* 探活：GET —— 只报「KV 绑没绑」+ 当前限额，绝不写任何键
     （红线：生产 /api/sync 绝不用 curl 发 PUT，这里同源同纪律；探活必须放在 POST 拦截之前，否则不可达） */
  if (request.method === 'GET') {
    return json({ ok: true, bound: !!(env && env.SYNC_KV), limits: { maxText: MAX_TEXT, maxImgs: MAX_IMGS, daily: DAILY_LIMIT } });
  }
  if (request.method !== 'POST') return json({ ok: false, error: 'method', msg: '只支持 POST' }, 405);
  if (!env || !env.SYNC_KV) return json({ ok: false, error: 'kv_not_bound', msg: '云端存储未绑定（SYNC_KV），暂时收不到反馈' }, 503);
  const kv = env.SYNC_KV;

  let body = {};
  try { body = await request.json(); } catch (e) {}
  if (!body || typeof body !== 'object') return json({ ok: false, error: 'bad_body', msg: '请求格式不对' }, 400);

  /* ---- 2. 限频（先判，廉价且挡住刷子） ---- */
  const now = new Date();
  const day = dayKeyUTC(now);
  const ip = clientIp(request);
  if (await sumBuckets(kv, 'fbr:' + ip, day) >= DAILY_LIMIT) {
    return json({ ok: false, error: 'daily_limit', msg: '今天已经提交过 ' + DAILY_LIMIT + ' 条了，明天再来吧（或直接加微信找我）' }, 429);
  }

  /* ---- 3. 文字 ---- */
  const text = String(body.text == null ? '' : body.text).trim();
  if (!text) return json({ ok: false, error: 'empty_text', msg: '请写一下遇到的问题' }, 400);
  if (text.length > MAX_TEXT) return json({ ok: false, error: 'text_too_long', msg: '文字太长了，请精简到 ' + MAX_TEXT + ' 字以内' }, 400);

  /* ---- 4. 图片 ---- */
  const imgsIn = Array.isArray(body.imgs) ? body.imgs : [];
  if (imgsIn.length > MAX_IMGS) return json({ ok: false, error: 'too_many_imgs', msg: '最多 ' + MAX_IMGS + ' 张截图' }, 413);
  const imgs = [];
  let totalBytes = 0;
  for (let i = 0; i < imgsIn.length; i++) {
    const it = imgsIn[i] || {};
    const mime = String(it.mime || '');
    const b64 = String(it.b64 || '');
    if (IMG_MIME.indexOf(mime) < 0) return json({ ok: false, error: 'bad_mime', msg: '图片格式不支持（请用 JPG/PNG）' }, 413);
    if (!b64 || b64.length > MAX_B64_CHARS) return json({ ok: false, error: 'img_too_big', msg: '第 ' + (i + 1) + ' 张图太大了，换一张或先截图再传' }, 413);
    const bytes = approxBytes(b64);
    if (bytes > MAX_IMG_KB * 1024) return json({ ok: false, error: 'img_too_big', msg: '第 ' + (i + 1) + ' 张图太大了' }, 413);
    totalBytes += bytes;
    imgs.push({ mime: mime, b64: b64 });
  }
  if (totalBytes > MAX_TOTAL_KB * 1024) return json({ ok: false, error: 'total_too_big', msg: '图片加起来太大了，减一张试试' }, 413);

  /* ---- 5. 总量保护 ---- */
  let seq = parseInt((await kv.get('fbseq')) || '0', 10) || 0;
  if (seq >= TOTAL_LIMIT) {
    return json({ ok: false, error: 'full', msg: '反馈箱暂时满了，请直接加微信 g285448525 告诉我' }, 503);
  }

  /* ---- 登录态（可选） ---- */
  let acct = null;
  const tok = String(request.headers.get('X-Session') || '');
  if (tok) {
    try {
      const s = JSON.parse((await kv.get('sess:' + tok)) || 'null');
      if (s && s.acct) acct = String(s.acct).slice(0, 32);
    } catch (e) {}
  }

  /* ---- 落库 ---- */
  const id = String(seq + 1) + '-' + randId();
  const page = String(body.page == null ? '' : body.page).slice(0, 60);
  const contact = String(body.contact == null ? '' : body.contact).trim().slice(0, 60);
  const rec = {
    id: id,
    ts: Date.now(),
    acct: acct,
    anon: acct ? null : anonId(),
    page: page,
    text: text,
    contact: contact,
    imgs: imgs.length,
    env: pickEnv(body.env),
    read: 0,
  };
  /* 图片先写：正文里只存张数，admin 列表不碰图片体；正文写成功才算这条成立 */
  if (imgs.length) await kv.put('fbimg:' + id, JSON.stringify(imgs));
  await kv.put('fb:' + id, JSON.stringify(rec));
  await kv.put('fbseq', String(seq + 1));
  /* 限频计数：当前桶 +1（不是「当天总数」——那会指数膨胀；桶值单调递增，sumBuckets 才能正确累加） */
  const bKey = 'fbr:' + ip + ':' + day + ':' + bucketOf(now);
  const cur = parseInt((await kv.get(bKey)) || '0', 10) || 0;
  await kv.put(bKey, String(cur + 1));

  return json({ ok: true, id: id, ts: rec.ts });
}
