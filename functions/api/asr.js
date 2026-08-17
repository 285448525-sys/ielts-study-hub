// Cloudflare Pages Function: /api/asr
// 腾讯云「录音文件识别」（ASR Long）：前端 POST 一段 WAV base64 →
//   1) CreateRecTask 提交识别任务（SourceType=1，Data 直接传 base64）
//   2) 轮询 DescribeTaskStatus 直到 Status=2（成功）→ 取 Result.Text
// 返回 { text }。
//
// 密钥只在 env（CF 控制台「设置 > Functions > 环境变量」或 wrangler pages secret）：
//   TC_SECRET_ID / TC_SECRET_KEY —— 绝不进前端 / git。
// 未配置 → 503，前端据此降级到 Web Speech / 手打，主流程不崩。
//
// CORS：前端用自定义请求头，浏览器会先发 OPTIONS 预检，本函数显式处理。

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'Content-Type',
  'access-control-max-age': '86400',
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    }, CORS),
  });
}

const _crypto = (typeof globalThis.crypto !== 'undefined') ? globalThis.crypto : null;
const _enc = new TextEncoder();

async function sha256(buf) {
  const d = await _crypto.subtle.digest('SHA-256', buf);
  return new Uint8Array(d);
}
function hex(arr) {
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function hmac(keyBuf, msgBuf) {
  const key = await _crypto.subtle.importKey('raw', keyBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await _crypto.subtle.sign('HMAC', key, msgBuf);
  return new Uint8Array(sig);
}

// TC3-HMAC-SHA256 签名 + 调用腾讯云 API（POST JSON）
async function tc3Request(secretId, secretKey, service, action, version, region, payloadObj) {
  const host = service + '.tencentcloudapi.com';
  const actionL = action.toLowerCase();
  const payload = JSON.stringify(payloadObj);
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10); // YYYY-MM-DD

  const httpMethod = 'POST';
  const canonicalUri = '/';
  const canonicalQuery = '';
  const contentType = 'application/json; charset=utf-8';
  const canonicalHeaders = 'content-type:' + contentType + '\nhost:' + host + '\nx-tc-action:' + actionL + '\n';
  const signedHeaders = 'content-type;host;x-tc-action';
  const hashedPayload = hex(await sha256(_enc.encode(payload)));
  const canonicalRequest = httpMethod + '\n' + canonicalUri + '\n' + canonicalQuery + '\n' +
    canonicalHeaders + '\n' + signedHeaders + '\n' + hashedPayload;

  const credentialScope = date + '/' + service + '/tc3_request';
  const stringToSign = 'TC3-HMAC-SHA256\n' + timestamp + '\n' + credentialScope + '\n' +
    hex(await sha256(_enc.encode(canonicalRequest)));

  const secretDate = await hmac(_enc.encode('TC3' + secretKey), _enc.encode(date));
  const secretService = await hmac(secretDate, _enc.encode(service));
  const secretSigning = await hmac(secretService, _enc.encode('tc3_request'));
  const signatureBuf = await hmac(secretSigning, _enc.encode(stringToSign));
  const signature = hex(signatureBuf);

  const authorization = 'TC3-HMAC-SHA256 Credential=' + secretId + '/' + credentialScope +
    ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;

  const headers = {
    'Authorization': authorization,
    'Content-Type': contentType,
    'Host': host,
    'X-TC-Action': action,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Version': version,
  };
  if (region) headers['X-TC-Region'] = region;

  const res = await fetch('https://' + host, { method: 'POST', headers, body: payload });
  const j = await res.json();
  if (j && j.Response && j.Response.Error) {
    throw new Error(j.Response.Error.Code + ': ' + j.Response.Error.Message);
  }
  return j;
}

function parseResult(result) {
  if (!result) return '';
  let p = result;
  if (typeof result === 'string') {
    try { p = JSON.parse(result); } catch (_) { return result; }
  }
  if (p && Array.isArray(p.Result)) return p.Result.map(x => x.Text || '').join(' ').trim();
  if (p && p.Text) return p.Text;
  return '';
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: '请求体不是合法 JSON' }, 400); }
  const audio = body && body.audio;
  const engine = (body && body.engine) || '16k_en';
  if (!audio) return json({ error: '缺少 audio 字段' }, 400);

  const sid = env && env.TC_SECRET_ID;
  const skey = env && env.TC_SECRET_KEY;
  if (!sid || !skey) return json({ error: '未配置云端识别（请在 Cloudflare 绑定 TC_SECRET_ID / TC_SECRET_KEY）' }, 503);

  try {
    // 算 base64 解码后的字节长度（腾讯云要求 DataLen 为音频字节数）
    const dataLen = atob(audio).length;

    const create = await tc3Request(sid, skey, 'asr', 'CreateRecTask', 'asr.v20190614', 'ap-guangzhou', {
      EngineModelType: engine,
      ChannelNum: 1,
      ResTextFormat: 0,
      SourceType: 1,
      Data: audio,
      DataLen: dataLen,
    });
    const taskId = create && create.Response && create.Response.TaskId;
    if (!taskId) throw new Error('创建识别任务失败');

    // 轮询（短回答通常几秒出结果；上限 20 次 × 1.5s ≈ 30s，贴合 CF 请求时限）
    let text = '';
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const desc = await tc3Request(sid, skey, 'asr', 'DescribeTaskStatus', 'asr.v20190614', 'ap-guangzhou', { TaskId: taskId });
      const d = desc && desc.Response && desc.Response.Data;
      if (!d) throw new Error('查询任务状态失败');
      if (d.Status === 2) { text = parseResult(d.Result); break; }
      if (d.Status === 3) throw new Error('识别失败：' + (d.ErrorMsg || 'unknown'));
    }
    if (!text) throw new Error('识别超时（任务未完成）');
    return json({ text: text });
  } catch (e) {
    return json({ error: e.message || '识别失败' }, 502);
  }
}
