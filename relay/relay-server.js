#!/usr/bin/env node
/* 雅思备考 Hub —— 后端中转服务（零依赖：仅用 Node 内置模块 + 全局 fetch）
 *
 * 为什么要有这一层？
 *   前端页面只持有「中转服务地址」，绝不在浏览器里保存任何第三方 API Key。
 *   真实密钥只存在你服务器上的 relay-config.json 里。本服务收到前端的请求后，
 *   在服务端按 service 选出对应的 base / key / model，附上 Key 转发给 OpenAI 兼容接口，
 *   再把响应原样回给前端。这样你把网页分享给别人，也不会泄露你的调用额度。
 *
 * 前端如何调用？
 *   POST <relayUrl>  （relayUrl 可填到域名根，也可填 /relay）
 *   body: { "service": "gpt" | "trans" | "longsent", "messages": [...], "temperature"?: number, "token"?: string }
 *   响应：直接透传上游 OpenAI 兼容结构 { "choices": [{ "message": { "content": "..." } }] }
 *
 * 配置（服务端，切勿把含真实密钥的文件提交到仓库）：
 *   relay-config.json  （可用 relay-config.example.json 当模板复制改名）
 *   {
 *     "token": "",                       // 可选：前端需在 body.token 里带上，空字符串=不校验
 *     "services": {
 *       "gpt":      { "base": "https://api.openai.com/v1", "key": "sk-...", "model": "gpt-4o-mini", "temperature": 0.8 },
 *       "trans":    { "base": "https://api.openai.com/v1", "key": "sk-...", "model": "gpt-4o-mini", "temperature": 0.3 },
 *       "longsent": { "base": "https://api.openai.com/v1", "key": "sk-...", "model": "gpt-4o-mini", "temperature": 0.4 }
 *     }
 *   }
 *   说明：service 对应前端的三种 AI 功能；每个 service 用各自的 base/key/model，天然隔离。
 *        前端不传 model 时，用这里配置的 model；前端传了则以其为准（方便临时切换）。
 *
 * 运行：
 *   node relay-server.js                 # 默认监听 3000
 *   PORT=8080 node relay-server.js       # 自定义端口
 *   RELAY_CONFIG=/path/to/relay-config.json node relay-server.js   # 自定义配置路径（测试用）
 *
 * 部署提示（任选其一，都是你自己的服务器，密钥不出服务端）：
 *   - 一台小云主机 + `node relay-server.js` 常驻（pm2 / systemd / nohup 都行）
 *   - 或塞进你已有的后端（Express / Nginx 反代 / Cloudflare Worker / Vercel 函数等），
 *     只要保持「按 service 选密钥并转发 /chat/completions」这一逻辑即可。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const CONFIG_PATH = process.env.RELAY_CONFIG || path.join(__dirname, 'relay-config.json');

function loadConfig(){
  if(!fs.existsSync(CONFIG_PATH)){
    console.error('[relay] 缺少配置文件：' + CONFIG_PATH);
    console.error('[relay] 请复制 relay-config.example.json 为 relay-config.json 并填入真实密钥（不要把真实密钥提交到仓库）。');
    process.exit(1);
  }
  try{
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if(!cfg.services || typeof cfg.services !== 'object'){
      console.error('[relay] 配置文件缺少 services 字段'); process.exit(1);
    }
    return cfg;
  }catch(e){
    console.error('[relay] 配置文件解析失败：', e.message); process.exit(1);
  }
}

const CONFIG = loadConfig();
const RELAY_TOKEN = (CONFIG.token && String(CONFIG.token)) || '';

const server = http.createServer(async (req, res) => {
  // 允许跨域（前端页面与中转服务不同源时放开）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if(req.method === 'OPTIONS'){ res.writeHead(204); res.end(); return; }

  const p = (req.url || '/').split('?')[0];
  if(req.method !== 'POST' || (p !== '/relay' && p !== '/')){
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found. 请用 POST 请求 /relay （或根路径 /）。' }));
    return;
  }

  let raw = '';
  try{
    for await (const chunk of req) {
      raw += chunk;
      if(raw.length > 2 * 1024 * 1024){ // 防过大请求：逐块判断，超限立即返回，不累积到内存
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '请求体过大' }));
        return;
      }
    }
    const r = JSON.parse(raw || '{}');
    const service = r.service;
    const messages = r.messages;

    if(!service || !Array.isArray(messages)){
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '缺少 service 或 messages 字段' })); return;
    }
    const cfg = CONFIG.services[service];
    if(!cfg || !cfg.key){
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '未知或未配置的服务：' + service })); return;
    }
    // 可选令牌校验（防止中转服务被白嫖）
    if(RELAY_TOKEN && String(r.token || '') !== RELAY_TOKEN){
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '访问令牌无效' })); return;
    }

    const upstream = (cfg.base || 'https://api.openai.com/v1').replace(/\/$/, '') + '/chat/completions';
    const model = r.model || cfg.model || 'gpt-4o-mini';
    const temperature = (typeof r.temperature === 'number') ? r.temperature
                      : (cfg.temperature != null ? cfg.temperature : 0.7);

    // 上游转发加超时，避免上游无响应时连接永久挂起、占用事件循环
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60s 超时
    try{
      const upstreamRes = await fetch(upstream, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
        body: JSON.stringify({ model: model, messages: messages, temperature: temperature }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      const text = await upstreamRes.text();
      res.writeHead(upstreamRes.status, { 'Content-Type': 'application/json' });
      res.end(text);
    }catch(e){
      clearTimeout(timeout);
      if(e && e.name === 'AbortError'){
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '上游接口超时' }));
      }else throw e;
    }
  }catch(e){
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '中转服务内部错误：' + (e && e.message ? e.message : e) }));
  }
});

server.listen(PORT, () => {
  console.log('[relay] 中转服务已启动： http://localhost:' + PORT + '/relay');
  console.log('[relay] 已配置服务： ' + Object.keys(CONFIG.services).join(', '));
});
