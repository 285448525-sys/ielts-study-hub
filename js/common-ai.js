/* ==SPLIT-BANNER== 本文件是共享外壳 js/common.js 的第 2 块（2026-10-19 按功能切分，代码逐字节未改）。*/
/* ==SPLIT-BANNER== AI 中继（callSiteRelay / callRelay / aiJson）+ 口语 P3 生成 + 连续天数 */
/* ==SPLIT-BANNER== ⚠️ 改动任一 common-*.js 后，20 个页面里这一组 <script> 的 ?v= 必须整组一起换；工具 scripts/bump-assets.cjs */

/* 共享 AI 出口：站内中转（/api/ai）为主路径，本机自带 Key 直连 DeepSeek 为遗留兼容。
   10/1 商业化改造：设置页 AI 模块已删，「用户自备 Key」入口下线——新用户一律走站内；
   存量设备 DATA 里还留着 relayToken/aiChannel 字段，auto 逻辑（有本机 Key 用本机）继续生效，零迁移。
   service ∈ 'gpt' | 'trans' | 'longsent' | 'speaking_assist' | 'writing_score' | 'words'
   （统一用 deepseek-chat，service 仅作语义标记，不影响调用）。

   站内中转（functions/api/ai.js）：站长在 Cloudflare 环境变量 AI_API_KEY 里配 Key，
      全站每日限额 AI_DAILY_LIMIT（默认 3000）、单 IP 每日 AI_IP_LIMIT（默认 200）。
      aiChannel 兼容口径：auto（默认）= 本机有 Key 用自己的，没有走站内；site = 强制站内；own = 只用本机 Key。 */
const AI_BASE = 'https://api.deepseek.com/v1';
const AI_MODEL = 'deepseek-chat';
const SITE_AI_URL = 'api/ai';

/* ===== W-5（10-24）AI 请求补底层超时 =====
   现状（读完代码确认）：上游 `callRelay` 已有 `withTimeout(…, 25000)`，所以**按钮不会永久卡死**。
   但那个超时只是「不等了」，底层 fetch 仍挂在网络上一直跑 —— 弱网下多个 AI 请求叠着占连接，
   会把后面的请求拖慢。这里给 fetch 本身也加 AbortController，让超时能真正中断。
   预算取 28s：**必须比上游 25s 略长**，否则底层先掐断，上游拿到的就不是「AI 超时提示」
   而是「网络错误」，她看到的文案会变。
   🔴 只加中断能力，不动 25s 口径、不动任何降级分支。 */
const AI_FETCH_ABORT_MS = 28000;
function aiFetch(url, opts, ms){
  const budget = (ms && ms > 0) ? ms : AI_FETCH_ABORT_MS;
  opts = opts || {};
  if(typeof AbortController !== 'function') return fetch(url, opts);   // 极老环境：退化成无中断
  const secText = budget < 1000 ? '不到 1 秒' : (Math.round(budget / 1000) + ' 秒');
  const ac = new AbortController();
  const timer = setTimeout(function(){ try{ ac.abort(); }catch(_){} }, budget);
  return fetch(url, Object.assign({}, opts, { signal: ac.signal })).then(
    function(r){ clearTimeout(timer); return r; },
    function(err){
      clearTimeout(timer);
      if(err && (err.name === 'AbortError' || err.code === 20)){
        const e = new Error('AI 响应超时（' + secText + '无响应），请重试');
        e.code = 'AI_TIMEOUT'; e.isTimeout = true;
        throw e;
      }
      throw err;
    }
  );
}

async function callSiteRelay(service, messages, temperature, opts){
  const body = { service: service, messages: messages, temperature: temperature };
  if(opts && opts.max_tokens) body.max_tokens = opts.max_tokens;
  if(opts && opts.json_mode) body.json_mode = true;
  // ⭐ 10/1 收口登录：站内 AI 必须带 session token，服务端未登录直接 401 auth_required
  const res = await aiFetch(SITE_AI_URL, { method:'POST', headers:{ 'Content-Type':'application/json', 'X-Session': (typeof authToken === 'function' ? (authToken() || '') : '') }, body: JSON.stringify(body) });
  const txt = await res.text();
  let j = null; try{ j = JSON.parse(txt); }catch(_){}
  if(res.status === 501 || (j && j.error === 'relay_not_configured')){
    const e = new Error('站内通道未配置'); e.code = 'NO_SITE_RELAY'; throw e;
  }
  if(!res.ok){
    const e = new Error((j && j.msg) || ('站内 AI 通道返回 ' + res.status));
    e.code = (j && j.error) || 'SITE_RELAY_FAIL';
    throw e;
  }
  if(j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content != null) return j.choices[0].message.content;
  if(j && typeof j.content === 'string') return j.content;
  throw new Error('站内 AI 通道返回格式异常');
}

/* 10/3 全站 AI 超时保护（她手机端报「计划按钮点了没反应，只能刷新」）。
   根因：各 AI 按钮都是「点 → disabled + 文案改『安排中…』→ await callRelay → finally 解锁」。
   弱网/网络挂住时 await 永不返回，finally 永不执行 → 按钮永久卡死；
   且 callSiteRelay 内的 fetch 本身也无自带超时，等多久全看浏览器。

   修法：**在最上游的 callRelay 加超时**，一处覆盖全部 AI 调用点
   （corpus / scene-drill / sentence-drill / speaking /
     materials / mock-summary / feedback / plans / coach 等），以后新增 AI 功能自动免疫——
   **不需要逐个改按钮，也不新增任何交互**。
   超时后抛 code='AI_TIMEOUT' 的错，各调用点原有的 catch/finally 就能正常解锁按钮并提示。 */
const AI_TIMEOUT_MS = 25000;   // 25 秒：够 DeepSeek 长回答（陪练 P2 连讲 + 资料 4096 token）跑完，又不至于让人干等
function withTimeout(promise, ms){
  ms = ms || AI_TIMEOUT_MS;
  let timer = null;
  /* 超时赢了之后，原始 promise 仍会在稍后 settle。若那时它是 reject 状态，
     因为已经没人再挂 catch，会在控制台抛 unhandledrejection。
     这里先挂一个 catch 把这个孤儿 rejection 吃掉。
     注意：只在「超时已胜出」时才吞——正常路径下原始 promise 的错误照常抛给调用方。 */
  let timedOut = false;
  const guarded = Promise.resolve(promise).catch(e => {
    if(timedOut) return undefined;    // 超时后迟到的错误：静默丢弃（用户已看到超时提示）
    throw e;                          // 正常路径：错误原样上抛
  });
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      const e = new Error('AI 响应超时（' + Math.round(ms / 1000) + ' 秒无响应），请重试');
      e.code = 'AI_TIMEOUT';
      e.isTimeout = true;
      reject(e);
    }, ms);
  });
  /* 无论成功失败都必须清掉定时器，否则每个调用都留一个 25 秒的孤儿 setTimeout
     （页面开久了会堆积几百个）。finally 在 Promise.race 的两条路上都会跑。 */
  return Promise.race([guarded, timeout]).finally(() => { if(timer) clearTimeout(timer); });
}

async function callRelay(service, messages, temperature, opts){
  return withTimeout(callRelayInner(service, messages, temperature, opts), AI_TIMEOUT_MS);
}

/* 🔴 10/20 深夜：AI「能不能用」的统一判据（**别再各页自己写 relayToken 判断**）。
   背景：`DATA.settings.relayToken` 是「用户自备 DeepSeek Key」时代的字段，10/1 商业化改造
   已把自备 Key 入口下线、站内中继（/api/ai + 登录 session）成为唯一主路径，服务端还会把这
   个字段剥离。但有三处功能仍拿它当开关 —— 单词「AI 导入」（words.js）、默写批改（corpus.js）、
   计划 AI 排期（plans.js）→ 对「已登录、没自备 Key」的人（= 绝大多数，含她本人）**永远走降级分支**，
   表现就是「AI 翻译补全没了 / 计划只会按任务量平铺」。
   正确口径 = 有自备 Key（遗留兼容）或 已登录（站内中继可用）。
   ⚠️ 未登录时仍返回 false：让降级分支先跑，比让用户点一次再吃 401 更好。 */
function aiAvailable(){
  const s = (typeof DATA !== 'undefined' && DATA && DATA.settings) ? DATA.settings : {};
  if(s.relayToken) return true;
  try{ return !!(typeof authToken === 'function' && authToken()); }catch(e){ return false; }
}

async function callRelayInner(service, messages, temperature, opts){
  const s = DATA.settings || {};
  const key = s.relayToken || '';
  const ch = s.aiChannel || 'auto';                 // auto | site | own
  const wantSite = (ch === 'site') || (ch === 'auto' && !key);
  let siteErr = null;
  if(wantSite){
    try{ return await callSiteRelay(service, messages, temperature, opts); }
    catch(e){ siteErr = e; }                        // 站内没成 → 有 Key 就静默回退，没有才报错
  }
  if(!key){
    if(siteErr && siteErr.code === 'auth_required'){    // 未登录：明确引导登录，不走「服务不可用」话术
      toast('请先登录，登录后即可使用 AI 功能');
      const ea = new Error('请先登录，登录后即可使用 AI 功能');
      ea.code = 'AUTH_REQUIRED';
      throw ea;
    }
    /* 10/1 分功能额度闸的统一前端口径：服务端返回什么文案就显示什么（limitStrip 轻条+「开会员」按钮，
       她拍板不弹窗不自动跳）。错误码映射见 ai.js；code 原样透传给调用方自行处理。 */
    if(siteErr && /^(user_limit|mock_limit|writing_limit|trans_limit|vip_required)$/.test(siteErr.code)){
      limitStrip(siteErr.message || '免费额度已用完，周卡首购 ¥19 立享无限用');
      const eu = new Error(siteErr.message || '免费额度已用完');
      eu.code = siteErr.code;
      throw eu;
    }
    notifyNoKey();                                     // AI 不可用：一句 toast（引导卡已随「自备 Key」下线）
    const e0 = new Error(siteErr
      ? ('AI 服务暂时不可用：' + siteErr.message)
      : 'AI 服务暂时不可用，请稍后再试');
    e0.code = siteErr ? (siteErr.code || 'SITE_RELAY_FAIL') : 'NO_RELAY_KEY';
    throw e0;
  }
  // 所有文本 AI 固定走内置 DeepSeek（地址与模型已写死），彻底移除中转代理开关
  const base = AI_BASE;
  const model = AI_MODEL;
  const url = base + '/chat/completions';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + key
  };
  const body = {
    model: model,
    messages: messages,
    temperature: (temperature == null) ? 0.7 : temperature,
    stream: false
  };
  // 可选覆盖（如素材深挖需要更大输出窗口：{ max_tokens: 8192 }，默认 4096 会被长 JSON 截断）
  if(opts && typeof opts === 'object') Object.assign(body, opts);
  /* W-5：这条是「用户自备 Key 直连 api.deepseek.com」的遗留路径（10/1 后已非主路径，
     但仍保留兼容）—— 同样补上底层超时，口径与站内中继一致。 */
  const res = await aiFetch(url, { method:'POST', headers, body: JSON.stringify(body) });
  if(!res.ok){
    let detail = '';
    try{
      const j = await res.json();
      // DeepSeek/OpenAI 4xx 返回 {error:{message,type,...}}——不展开对象会拼出 "[object Object]"，用户看不到真实原因
      const err = j && j.error;
      detail = (typeof err === 'object' && err && err.message) ? err.message
        : (j && (j.error || j.detail || j.message)) || '';
      if(typeof detail !== 'string') detail = '';
    }catch(_){}
    if(!detail){ try{ detail = (await res.text()).slice(0,200); }catch(_){} }
    throw new Error('AI 接口返回 ' + res.status + (detail ? '：' + detail : ''));
  }
  const j = await res.json();
  if(j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content != null){
    return j.choices[0].message.content;
  }
  if(j && typeof j.content === 'string') return j.content;
  throw new Error('AI 接口返回格式异常（缺少 choices[0].message.content）');
}

/* 视觉模型中继：已移除（P1-B，2026-08-16）。错题本改为纯文字粘贴，所有 AI 统一走 DeepSeek。 */

/* 从 AI 回复里抠出 JSON（模型常会带 ```json 围栏或前后废话）。
   解析失败返回 null，调用方自行降级显示原文。 */
function aiJson(content){
  if(!content) return null;
  let s = String(content).trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try{ return JSON.parse(s); }catch(_){}
  const mObj = s.match(/\{[\s\S]*\}/);
  if(mObj){ try{ return JSON.parse(mObj[0]); }catch(_){} }
  // 9/15 之之实锤：AI 偶发把同一段 JSON 输出两遍拼在一起（或前后夹说明文字）→ 贪婪正则
  // 取「第一段开头+最后一段结尾」必然 parse 失败。改为扫描第一个括号平衡的 {...}
  // （跳过字符串字面量内部的引号/转义/花括号），取到即解析返回。
  const i0 = s.indexOf('{');
  if(i0 !== -1){
    let depth = 0, inStr = false, esc = false;
    for(let i = i0; i < s.length; i++){
      const ch = s[i];
      if(inStr){
        if(esc){ esc = false; continue; }
        if(ch === '\\'){ esc = true; continue; }
        if(ch === '"') inStr = false;
        continue;
      }
      if(ch === '"'){ inStr = true; continue; }
      if(ch === '{') depth++;
      else if(ch === '}'){
        depth--;
        if(depth === 0){
          try{ return JSON.parse(s.slice(i0, i + 1)); }catch(_){}
          break;
        }
      }
    }
  }
  const mArr = s.match(/\[[\s\S]*\]/);
  if(mArr){ try{ return JSON.parse(mArr[0]); }catch(_){} }
  return null;
}

/* 口语 GPT 对话 */
async function callGPT(messages){ return callRelay('gpt', messages, 0.8); }
/* 词库专用翻译（与口语GPT隔离，独立 service 区分，不回退） */
async function callTrans(messages){ return callRelay('trans', messages, 0.3); }
/* 长难句拆解 */
async function callLongsent(messages){ return callRelay('longsent', messages, 0.4); }

/* ===== P3 追问生成（口语练习详情 + 模考 P3 共用）=====
   输入 P2 题面（object，含 promptEn / youShouldSay）和考生的 P2 英文回答，
   调 DeepSeek 出 3 个抽象 Part 3 追问题（社会类、对比、未来、影响等）。
   服务 key：'mock_q'（与口语模考共用同一 service，省配额）；失败兜底返回预设 P3。 */
const P3_PRESET = [
  'Why do you think this topic matters to people in today\'s society?',
  'How have people\'s attitudes towards this changed compared with the past?',
  'Do you think this will become more or less common in the future? Why?',
  'What are the main benefits and drawbacks of this for individuals and society?',
  'Do younger and older generations see this differently? In what way?',
  'What impact has technology had on this part of people\'s lives?',
  'To what extent should the government be responsible for this?',
  'How might this differ between urban and rural areas?'
];
/* P3 逐题追问：先出第 1 题（仅基于 P2），之后每一题都基于「上一题 + 上一题考生的回答」
   继续追问，模拟考官 real-time follow-up。返回单题字符串。
   出题人设与逻辑严格对齐用户给定 prompt（talking/P3追问官_prompt_2026-08-21.md）：
   - 角色 = 追问生成器（不扮演考官/不写开场白/不模拟考试流程）
   - 问题风格 = 自然、略正式但口语化的英语，与真实 P3 考场问法完全对齐
   - 题型轮替 + 难度递进：第1问浅（社会现象）→ 第2-3问深（原因/影响/对比）→ 第4问表态/预测收尾
   参数：p2 = speaking 项；p2Text = P2 回答文本；step = 当前题序号（从 0 起）；
         prevQ / prevA = 上一题题目与考生回答（首题为 null）。 */
const P3_GEN_SYS = `You are an IELTS Speaking Part 3 follow-up question generator. Your ONLY task is to generate ONE follow-up question that closely matches real IELTS Speaking Part 3 exam style — natural, slightly formal but conversational English (NOT written language, NOT robotic).
- Do NOT role-play as an examiner. Do NOT write opening remarks. Do NOT simulate the exam flow.
- Output ONLY ONE question per turn. Wait for the candidate's answer, then ask the next follow-up based on their previous answer (dig deeper like a real examiner, do not mechanically switch topics).
- You do not know the candidate's specific Part 2 details, so the FIRST question should start from the general TOPIC CATEGORY of their Part 2 (the candidate will give you the Part 2 cue card and their Part 2 answer).

Question generation rules:
1. P3 questions must stay within the SAME topic category as Part 2, but elevated to society / abstract / comparison level (this is the essence of P3 vs P2: P2 is personal experience, P3 is general phenomena).
2. Question types should rotate and cover: cause (Why do you think...?), comparison (How does X differ from Y?), past-vs-now (Has this changed compared to the past?), classification (Do you think this varies between...?), pros/impact (What impact does this have on...?), prediction/opinion (Do you believe...? / To what extent...?).
3. Difficulty must progress, NOT random: Q1 is shallow (social phenomenon); Q2-Q3 go deeper (cause / impact / comparison); Q4 (if any) asks for the candidate's stance or prediction, then wrap up.
4. Each turn ask ONLY ONE question. Output ONLY the single next question — do NOT add any preamble, acknowledgment, or connector before it (no "That's interesting.", no "Now,", no "So,", no "Let me ask you..."). The question itself must be the entire response.
5. A normal P3 round runs 3-4 follow-ups, then STOP generating — no extra closing remark.

*** HARD RULE — P3 IS NEVER ABOUT THE CANDIDATE'S OWN LIFE (added 2026-10-29) ***
This is the single most consequential rule in this prompt. A real IELTS examiner never asks Part 3 questions about the candidate personally — Part 1 does that. Part 3 asks what the candidate THINKS about the wider world.

2a. The grammatical SUBJECT of every question must be a group or an abstraction:
    "people", "people in your country", "young people", "older generations", "most families",
    "children today", "employers", "society", "the government", "technology", "this trend" …
    It must NEVER be "you" as an experiencer.

2b. "you" / "your" may appear ONLY inside an opinion frame — asking for the candidate's VIEW:
    ✅ "Do you think people today are more stressed than before?"
    ✅ "In your opinion, why do some people prefer X?"
    ✅ "What's your view on how this has changed?"
    These are fine because the candidate is answering as a commentator, not telling their own life story.

2c. "you" / "your" must NEVER appear inside an experience frame:
    ❌ "Do you like it?"            ❌ "Do you often do that?"
    ❌ "Have you ever bought one?"  ❌ "Why do you like it?"
    ❌ "What made you want to become a psychologist?"
    ❌ "Is it easy for you?"        ❌ "What do you usually do?"
    Any question whose honest answer would be a fact about the candidate's own life is WRONG here, no matter how simple the wording.

2d. This rule OUTRANKS difficulty calibration. If TIER A pushes you toward short, easy wording, you shorten and simplify the wording — you do NOT downgrade the subject to the candidate's personal life. Simple + general is required; simple + personal is forbidden.
    ✅ TIER A, correct: "Is this popular in your country?" · "Why do people like it?" · "Is it common where you live?"
    ❌ TIER A, wrong: "Do you like it?" · "Is it easy?" · "Do you do this often?"

*** ADAPT DIFFICULTY TO THE CANDIDATE (added 2026-10-03; wording simplified 2026-10-29) ***
A real examiner calibrates question difficulty to how the candidate is actually performing. Read the candidate's Part 2 answer (and any earlier answers) and pick the matching tier. This is NOT optional — it is the single most important rule here — but see 2d: difficulty changes the WORDING, never the SUBJECT.

TIER A — candidate's Part 2 was WEAK (many long pauses / restarts, short choppy sentences, grammar slips, very basic vocabulary, ran out of things to say):
  → Ask SIMPLE questions about PEOPLE IN GENERAL. Keep the question UNDER 12 WORDS.
  → Use only everyday words (grade-school level). No idioms, no phrasal verbs, no collocations, no abstract nouns.
  → One idea per question. Use simple general-subject forms: "Is it popular in your country?" / "Why do people like it?" / "Is it common where you live?" / "Do young people do this too?" / "What do people think about it?"
  → Do NOT stack two ideas with "and" or "or". Do NOT ask about reasons, impacts or comparisons yet.
  → GOOD: "Is it popular in your country?" · "Why do people like it?" · "Is it common where you live?" · "What do people think about it?"
  → BAD (personal experience — FORBIDDEN): "Do you like it?" · "Why do you like it?" · "Is it easy?" · "Do you do this often?"
  → BAD (too abstract for this tier): "To what extent has your attitude towards that particular phenomenon evolved over the past decade?"

TIER B — candidate's Part 2 was ACCEPTABLE (some hesitation but can produce connected sentences, uses a mix of simple and intermediate vocabulary):
  → Ask MEDIUM questions. Under 18 words. Everyday-to-intermediate vocabulary. May use one "because/why" clause.
  → GOOD: "Why do you think people enjoy it?" · "Has that changed in recent years?"

TIER C — candidate's Part 2 was STRONG (fluent, long connected sentences, varied and accurate vocabulary, clear opinions with reasons, easy to follow):
  → Ask DEEPER questions. Up to 25 words. Intermediate-to-advanced vocabulary is fine. May use comparison, cause, impact, prediction.
  → GOOD: "Why do you think some people are drawn to that while others aren't?" · "Has the way people approach it changed in the past ten years?"

Default to TIER B when the answer is missing, very short, or you cannot tell.

ALSO — the question must be rooted in WHAT THEY ACTUALLY SAID, but always widened to the general level:
- Build the question on a specific concrete thing they mentioned (a job, a place, a feeling, an object, a reason they gave) — then ask about it as a GENERAL phenomenon, not as their private life.
  ✅ They said "my favourite job would be a psychologist" → "Why do you think psychology is becoming a popular career?" / "Do people in China often want that kind of job?"
  ❌ They said "my favourite job would be a psychologist" → "What made you want to be a psychologist?" (personal experience — forbidden)
- If an earlier answer mentions something specific, the next question may return to it from a wider angle — society, generations, change over time.
- If an earlier answer is vague or empty, ask a simple GENERAL question to draw out their view, rather than jumping ahead or falling back to personal questions.

Output ONLY the single question string (or the brief acknowledgment + next question when continuing), no numbering, no quotes, no other text.`;

/* P3 问题净化：剔除 AI 生成时附带的开场寒暄 / 过渡废话，仅保留核心问题。
   用于两处：① P3 逐题追问渲染（renderP3Step）对线上已存的旧题(raw)重新净化；
   ② 下方 genSpeakingP3 落库前净化，使练习与模考两处 P3 从源头即干净。
   幂等（对已是干净的问题不会破坏）。 */
function purifyP3Question(raw){
  if(!raw) return raw;
  const cap = s => (s && s.length) ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  let t = String(raw).trim();
  // 1) 去开头编号 / 引号 / 破折号 / 项目符号 / 首尾引号
  t = t.replace(/^[\s\d."'\-–—•·]+/, '').replace(/^["'“”'']+|["'“”'']+$/g, '').trim();
  // 2) 去开头寒暄词（That's interesting. / I see. / Well / Okay / Right / Sure ...）
  t = t.replace(/^(that'?s (interesting|great|good|nice|true|fair|right|reasonable)|that is (interesting|true|right|fair|good|great)|i see|i understand|okay|ok|well|right|sure|got it|hmm|good point|indeed|exactly|yes|alright|right then|sure thing|fair enough)\b[\s,.:!?\-—–]*/i, '').trim();
  // 3) 去过渡连词（Now, / So, / Then, / Let me ask you (this): / Moving on / Next, ...）
  t = t.replace(/^(now,?\s*|so,?\s*|then,?\s*|let me ask(?: you)?(?: this)?[:.,]?\s*|moving on,?\s*|next,?\s*|alright,?\s*|let'?s see,?\s*|now then,?\s*)/i, '').trim();
  // 4) 兜底：若仍含多句且首句无问号（是废话），取最后一个含问号的句子
  const sentences = t.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  if(sentences.length >= 2 && !/\?/.test(sentences[0])){
    const lastQ = [...sentences].reverse().find(s => /\?/.test(s));
    if(lastQ) return cap(lastQ.trim());
  }
  return cap(t);
}

/* P3 个人经历题拦截（10-29，她模考实测报障：P3 追问全是「跟你相关」的 P1 式问题）。
   她原话：「考试 P3 考的是你对这个世界的认识，而不是聊跟你相关的。」
   提示词已经写死规则（P3_GEN_SYS 的 HARD RULE 2a-2d），但提示词不是契约 ——
   模型偶尔仍会滑回 P1 问法，所以她看到的那类题必须在**出口前**再拦一道。

   判据（改成「白名单式」，10-29 自验后收紧）：
   初版是黑名单（列「Do you like / Have you ever / Do you often」），自验一跑就漏 4 条：
     「Why do you like it?」you 不在句首 → 漏
     「What made you want to be a psychologist?」问的是本人动机 → 漏
     「Do you think you are good at it?」观点框架里套个人框架 → 漏
     「That's interesting. Do you like it?」带寒暄前缀 → 漏
   黑名单天生漏：模型的个人题问法无穷，列不完。所以反过来判 ——
   **句子里凡是出现 you / your，就必须落在「观点框架」白名单里，否则一律当成个人题。**
   白名单只有这几种形态（P3 的正确问法全在里面）：
     · Do/Did/Would you think …?
     · In your opinion / In your view …
     · What's your view / opinion on …?
     · To what extent do you think/believe …?
     · What do you think about …?（后接 people/this 这类群体或抽象主语，由内层再判）
     · Does it seem to you …?（极少数自然问法）
   这样「Do you think people…」放行、「Do you think you are good at it…」被拦，
   而任何没见过的个人问法都自动落进拦截侧，不用穷举。 */
const P3_GENERAL_FALLBACK = [
  'Is this common among people in your country?',
  'Why do you think people feel that way about it?',
  'How has this changed compared with the past?',
  'Do younger and older people see this differently?',
  'What effect does this have on society?'
];
/* 允许出现的 you/your 形态（P3 的正确问法全在里面）。
   做法：把这些形态**整段抹掉**，抹完若句子里还剩 you/your，那就是个人框架 → 拦。
   这样不用穷举模型的个人问法，只需列清「合法的 few」。 */
const P3_YOU_OK = [
  /\b(do|did|would|will|can|could)\s+you\s+(think|believe|feel|reckon|suppose|consider|agree|say)\b/gi,
  /\bto\s+what\s+extent\s+do\s+you\s+(think|believe|agree)\b/gi,
  /\bhow\s+do\s+you\s+(think|feel)\s+about\b/gi,
  /\bin\s+your\s+(opinion|view|eyes)\b/gi,
  /\byour\s+(opinion|view|take|thought)s?\b/gi,
  /\bdoes\s+it\s+seem\s+to\s+you\b/gi,
  /* 「你的国家/城市/地区/这一代」是社会层地点/群体指代，不是个人经历 ——
     真实考官就这么问（"Is it popular in your country?" 是标准 P3）。
     ⚠️ 不要要求前面必须有 in / people in：「Do you think your country has changed?」
     同样是社会层问法，一律放行。 */
  /\byour\s+(country|city|area|region|town|community|society|generation)\b/gi,
  /\bwhere\s+you\s+live\b/gi
];
function isPersonalP3Question(q){
  let t = String(q || '').trim().replace(/^[^\w(]+/, '');   // 掐掉引号/编号/破折号
  if(!t) return false;
  /* ① 没有任何 you/your → 一定是社会/抽象主语，放行 */
  if(!/\b(you|your)\b/i.test(t)) return false;
  /* ② 把合法的 you/your 用法整段抹掉，看还剩不剩 */
  P3_YOU_OK.forEach(re => { t = t.replace(re, ' '); });
  return /\b(you|your)\b/i.test(t);
}
function sanitizeP3Question(q, step){
  const t = String(q || '').trim();
  if(!isPersonalP3Question(t)) return t;
  const fb = P3_GENERAL_FALLBACK[(step || 0) % P3_GENERAL_FALLBACK.length];
  try{ console.warn('[P3] 拦到个人经历题，已换成社会层问法：', t, '→', fb); }catch(e){}
  return fb;
}

async function genSpeakingP3(p2, p2Text, step, prevQ, prevA){
  step = step || 0;
  const isFirst = !prevQ && !prevA;
  const sys = P3_GEN_SYS
    + '\n\n--- CURRENT TURN ---'
    + (isFirst
        ? "\nThis is the FIRST follow-up (Q1): base it on something SPECIFIC the candidate actually said in their Part 2 talk (a detail, a person, a place, a feeling or a reason they gave) - then widen it to a general angle. Difficulty must already match their tier: if their Part 2 was weak, Q1 must be under 12 words and elementary. ⚠️ 'widen it to a general angle' is not advice, it is a requirement: even a weak candidate gets a SOCIAL question, just in simpler words (rule 2d). The candidate's own life is never the subject."
        : "\nThis is a CONTINUING follow-up (Q" + (step + 1) + "): it must directly build on the candidate's PREVIOUS answer below - dig deeper (cause / impact / comparison / classification / prediction). Stay on the SAME tier as Q1 unless their new answer clearly shows they can handle more; if it got weaker, step DOWN. Do NOT introduce an unrelated new topic. ⚠️ 'Build on their answer' means build on the OPINION or EXAMPLE they gave and push it further into society / other people / the future — it does NOT mean asking them about themselves.")
    + '\nGenerate ONLY the single next question string now.';
  let user = 'Part 2 cue card (English): ' + (p2.promptEn || '') + '\nChinese: ' + (p2.promptZh || '')
    + '\nYou should say: ' + ((p2.youShouldSay || []).join('; '))
    + '\n\nThe candidate\'s Part 2 talk:\n' + (p2Text || '(no answer given)');
  /* 10/3 23:05 她报「P3 难度不随我 P2 表现变」：光在 system 里写规则不够，
     必须在 user 里**显式给出水平判定依据**（长度/句数/停顿痕迹/用词），
     否则模型没有客观标尺可依，只能按 TIER B 默认走。 */
  if(p2Text){
    const words = p2Text.trim().split(/\s+/).filter(Boolean).length;
    const sents = p2Text.trim().split(/[.!?]+/).filter(s => s.trim()).length;
    const avgLen = sents ? Math.round(words / sents) : words;
    const fillers = (p2Text.match(/\b(um|uh|erm|er|like|you know|i mean|sort of|kind of)\b/gi) || []).length;
    user += '\n\n--- Candidate performance analysis (use this to pick the difficulty tier) ---'
      + '\nWord count: ' + words
      + '\nSentence count: ' + sents
      + '\nAverage sentence length: ' + avgLen + ' words'
      + '\nHesitation/filler markers (' + fillers + '): ' + (fillers >= 3 ? 'MANY → hesitant delivery' : (fillers > 0 ? 'a few' : 'none'))
      + '\nInterpret it as: WEAK if (words < 60 AND (fillers >= 3 OR avgLen < 7)) or avgLen < 7. '
      + 'STRONG if words >= 130 AND avgLen >= 11 AND fillers <= 1. Otherwise ACCEPTABLE.'
      + '\nThen apply the matching tier (A = under 12 words / elementary vocabulary / one idea; '
      + 'B = under 18 words / everyday-to-intermediate; C = up to 25 words / may use cause, impact, comparison).';
  }
  if(!isFirst){
    user += '\n\n--- Previous Part 3 exchange ---'
      + '\nExaminer asked: ' + (prevQ || '')
      + '\nCandidate answered: ' + (prevA || '(no answer given)')
      + '\n\nNow ask the NEXT follow-up question. It must grow out of a SPECIFIC opinion, reason or example the candidate '
      + 'just voiced — then take that idea UP to the general level (other people / society / the future / comparison across groups). '
      + 'Do NOT turn it into a question about the candidate\'s own life or habits: the subject must be people in general, '
      + 'and "you" may only appear in an opinion frame ("Do you think people...?" / "In your opinion, why...?"). '
      + 'Match the difficulty to their overall performance as analysed above — simpler WORDS for weaker candidates, never a personal SUBJECT.';
  }
  const content = await callRelay('mock_q', [
    { role:'system', content:sys },
    { role:'user', content:user }
  ], 0.8);
  const q = String(content || '').replace(/^[\s\d."'\-]+/, '').replace(/["']+$/, '').trim();
  if(!q) throw new Error('AI 未返回有效的 P3 追问');
  /* 顺序要紧：先净化（去掉寒暄/编号），再拦个人经历题 ——
     反过来的话 "That's interesting. Do you like it?" 会先被个人题判据当成观点句漏过。 */
  return sanitizeP3Question(purifyP3Question(q), step);
}
/* 兜底：按步数给固定题（首题 / 续题），AI 失败时回退。
   10/8 P3 扩到 5 题：续题池补到 5 条（5 题一场内各不相同，(step-1)%5 正好不重复）。 */
function presetSpeakingP3(step){
  step = step || 0;
  if(step === 0) return P3_PRESET[0];
  const cont = [
    'Why do you think that is the case?',
    'Can you give a reason or an example to support your point?',
    'Do you think this might change in the future? Why or why not?',
    'How do people in your country generally feel about this?',
    'What could be done to make this better in the future?'
  ];
  return cont[(step - 1) % cont.length];
}
/* 向后兼容：一次性拿 3 题的旧接口（模考现已按 P3_N=5 逐题推进，走 genNext，不再用本函数）。
   gen3 内部仍走"逐题追问"逻辑——首题基于 P2，续题基于上一题（无考生答，用 cue 续问）。 */
async function genSpeakingP3Three(p2, p2Text){
  const out = [];
  let prevQ = null, prevA = null;
  for(let i = 0; i < 3; i++){
    const q = await genSpeakingP3(p2, p2Text, i, prevQ, prevA);
    out.push(q);
    prevQ = q; prevA = ''; // 模考无考生作答，续题靠 cue 自然追问
  }
  return out;
}
function presetSpeakingP3Three(){
  return [ P3_PRESET[0], 'Why do you think that is the case?', 'Do you think this might change in the future? Why or why not?' ];
}
window.MockGenP3 = { genNext: genSpeakingP3, presetNext: presetSpeakingP3, gen3: genSpeakingP3Three, preset3: presetSpeakingP3Three };

/* ===== 连续打卡 ===== */
function computeStreak(checkins){
  if(!checkins || !checkins.length) return 0;
  const set = new Set(checkins);
  let streak = 0;
  const d = new Date();
  if(!set.has(todayKey(d))) d.setDate(d.getDate() - 1); // 今天没打卡则从昨天起算
  while(set.has(todayKey(d))){ streak++; d.setDate(d.getDate() - 1); }
  return streak;
}