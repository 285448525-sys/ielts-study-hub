#!/usr/bin/env node
/**
 * AI 接口连接测试脚本（雅思备考 Hub · 口语 GPT / 词库翻译 / 长难句拆解 共用）
 * ------------------------------------------------------------------
 * 用途：验证「设置 → AI 接口」配置是否可用，自动发起一次真实调用，
 *       明确输出 ✅ 成功 / ❌ 失败 及失败原因。
 *
 * 设计目标（按需求）：
 *   1) 降低接入门槛 —— 默认连 DeepSeek，用户【只填 API Key】即可跑，
 *      无需配置 Base URL / 模型等任何前置步骤。
 *   2) 自动执行 —— 运行即测，无需交互菜单。
 *   3) 明确结果 —— 成功/失败 + 原因 + 退出码（0 成功 / 1 失败）。
 *
 * 用法：
 *   node scripts/test-ai-connection.cjs --key sk-xxxxxx
 *   node scripts/test-ai-connection.cjs                # 从环境变量 DEEPSEEK_API_KEY 读取
 *   DEEPSEEK_API_KEY=sk-xxxxxx node scripts/test-ai-connection.cjs
 *
 * 可选参数：
 *   --key <key>        API Key（也可走环境变量 DEEPSEEK_API_KEY / AI_API_KEY）
 *   --base <url>       覆盖 Base URL（默认 https://api.deepseek.com/v1）
 *   --model <model>    覆盖模型（默认 deepseek-chat）
 *   --timeout <ms>     超时毫秒（默认 30000）
 *
 * 注：「复读功能复现」经确认是优化提示词时误加的指令，本脚本不实现，
 *     仅做标准的「接口是否真能返回有效回答」的功能性验证。
 */

'use strict';

const readline = require('readline');

// ---------- 1. 解析参数 ----------
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--key') out.key = argv[++i];
    else if (a === '--base') out.base = argv[++i];
    else if (a === '--model') out.model = argv[++i];
    else if (a === '--timeout') out.timeout = parseInt(argv[++i], 10);
  }
  return out;
}

// ---------- 2. 解析配置（优先级：参数 > 环境变量 > 交互输入） ----------
const args = parseArgs(process.argv.slice(2));

const DEFAULT_BASE = 'https://api.deepseek.com/v1';
const DEFAULT_MODEL = 'deepseek-chat';
const DEFAULT_TIMEOUT = 30000;

async function resolveConfig() {
  let key = args.key || process.env.DEEPSEEK_API_KEY || process.env.AI_API_KEY || '';
  const base = (args.base || process.env.AI_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
  const model = args.model || process.env.AI_MODEL || DEFAULT_MODEL;
  const timeout = args.timeout || DEFAULT_TIMEOUT;

  // Key 仍未拿到：
  // - 交互终端（TTY）→ 询问用户粘贴
  // - 非交互（管道/CI 等无 TTY）→ 直接返回空 Key，交由失败分支给出清晰指引，
  //   避免 readline 在 EOF 下永不 resolve 导致「静默退出」
  if (!key) {
    if (process.stdin.isTTY) {
      key = await new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question('请输入 API Key（DeepSeek 等，形如 sk-...）：', (ans) => {
          rl.close();
          resolve((ans || '').trim());
        });
      });
    } else {
      key = '';
    }
  }
  return { key: key.trim(), base, model, timeout };
}

// ---------- 3. 输出辅助 ----------
function maskKey(k) {
  if (!k) return '(空)';
  if (k.length <= 8) return '****';
  return k.slice(0, 4) + '****' + k.slice(-4);
}
function line(s) { process.stdout.write(s + '\n'); }

// ---------- 4. 主测试 ----------
async function runTest(cfg) {
  line('');
  line('════════════════════════════════════════════');
  line('  AI 接口连接测试');
  line('════════════════════════════════════════════');
  line('  Base URL : ' + cfg.base + '/chat/completions');
  line('  Model    : ' + cfg.model);
  line('  API Key  : ' + maskKey(cfg.key));
  line('  Timeout  : ' + cfg.timeout + ' ms');
  line('════════════════════════════════════════════');

  // 4.1 Key 缺失 → 直接失败（清晰的接入指引）
  if (!cfg.key) {
    line('');
    line('❌ 连接失败：未提供 API Key。');
    line('');
    line('   接入方式（任选其一，只需 Key，无需其他配置）：');
    line('   ① node scripts/test-ai-connection.cjs --key sk-你的key');
    line('   ② 设置环境变量 DEEPSEEK_API_KEY=sk-你的key 后直接运行');
    line('   ③ 直接运行脚本，按提示粘贴 Key');
    line('');
    line('   获取 DeepSeek Key：https://platform.deepseek.com （注册送免费额度，国内直连免翻墙）');
    return false;
  }

  // 4.2 发起一次确定性调用：要求模型只回一个词 PONG
  //     → 既能验证「接口通、Key 有效、模型存在」，又能验证「真在按要求回答」
  const url = cfg.base + '/chat/completions';
  const payload = {
    model: cfg.model,
    messages: [
      { role: 'system', content: 'You are a concise test responder.' },
      { role: 'user', content: 'Reply with exactly one word: PONG' }
    ],
    temperature: 0,
    stream: false
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeout);

  let res, text;
  try {
    line('');
    line('⏳ 正在发起测试调用…');
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.key
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    text = await res.text();
  } catch (e) {
    clearTimeout(timer);
    line('');
    if (e.name === 'AbortError') {
      line('❌ 连接失败：请求超时（' + cfg.timeout + 'ms 无响应）。');
      line('   可能原因：网络不通 / Base URL 写错 / 需要翻墙。');
    } else {
      line('❌ 连接失败：' + (e.message || e));
      line('   可能原因：网络不可达 / DNS 失败 / 本地无外网权限。');
    }
    return false;
  } finally {
    clearTimeout(timer);
  }

  // 4.3 解析返回
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* 非 JSON，下面按状态码处理 */ }

  line('  HTTP 状态：' + res.status);

  if (!res.ok) {
    line('');
    line('❌ 连接失败：接口返回 ' + res.status + '。');
    if (json && (json.error || json.detail || json.message)) {
      const d = json.error && json.error.message ? json.error.message : (json.detail || json.message);
      line('   服务端消息：' + d);
    } else if (text) {
      line('   原始返回：' + text.slice(0, 300));
    }
    if (res.status === 401) line('   → 401 通常是 Key 无效或未授权，请检查 Key。');
    if (res.status === 404) line('   → 404 通常是 Base URL 或模型名不对。');
    if (res.status === 429) line('   → 429 是触发限流，稍后重试或换模型。');
    return false;
  }

  // 4.4 校验 OpenAI 兼容结构
  const content = json && json.choices && json.choices[0] && json.choices[0].message
    ? json.choices[0].message.content
    : (json && typeof json.content === 'string' ? json.content : null);

  if (content == null) {
    line('');
    line('❌ 连接失败：返回格式异常，缺少 choices[0].message.content。');
    line('   原始返回：' + text.slice(0, 300));
    return false;
  }

  // 4.5 功能性校验：模型确实按要求回答了 PONG（而非报错/空/复读）
  line('   模型返回：' + JSON.stringify(content.trim().slice(0, 80)));
  const ok = /pong/i.test(content);
  line('');
  if (ok) {
    line('✅ 连接成功：AI 接口可用，Key 有效，模型正常返回。');
    line('   雅思站「口语 GPT / 词库翻译 / 长难句拆解」均可正常调用。');
    return true;
  } else {
    line('⚠️  接口已连通，但返回内容未通过功能性校验（期望含 PONG）。');
    line('   返回内容：' + content.trim().slice(0, 200));
    line('   建议：检查模型是否为对话模型；或换 --model 重试。');
    // 接口其实通了，但回答不符合预期 → 视为“连通但不可用”，退出码 1
    return false;
  }
}

// ---------- 5. 入口 ----------
(async () => {
  let cfg;
  try {
    cfg = await resolveConfig();
  } catch (e) {
    line('❌ 配置解析失败：' + (e.message || e));
    process.exit(1);
  }
  const passed = await runTest(cfg);
  line('');
  line(passed ? '测试结果：PASS' : '测试结果：FAIL');
  line('════════════════════════════════════════════');
  process.exit(passed ? 0 : 1);
})();
