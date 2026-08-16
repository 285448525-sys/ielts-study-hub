/* =========================================================================
 * 雅思站 AI 指令框架运行时（零 API 依赖）
 * -------------------------------------------------------------------------
 * 功能：把「通用指令头 + 场景指令体 + 页面上下文参数」拼成完整指令，
 *       一键复制到剪贴板，用户粘贴给 DeepSeek 即可用。
 * 设计（见《雅思站AI指令框架》方案）：
 *   - 指令集中存放在 AI_PROMPTS（通用头 header + 9 个场景 scenes）
 *   - 每页按文件名自动挂载「📋 复制AI指令」按钮（多场景页用面板）
 *   - 参数尽量从页面上下文自动带出；带不出的留 {占位} 让用户补
 *   - 指令体可编辑并存 localStorage（不改代码也能微调措辞）
 *   - 剪贴板被拒时降级为弹出 textarea 全选
 * ========================================================================= */
'use strict';

/* ---------- 1. 指令数据 ---------- */
window.AI_PROMPTS = {
  // 通用指令头（所有场景共用，固定不变）
  header:
`你是我的雅思备考教练。我的画像：大三计算机学生，机考，目标总分 6.0（听5.5/读6.5/写5.5/口5.5），听力和口语最弱，有 ADHD（已服药，接受大块任务+弹性节奏）。现在距考试约 10 天。

三条铁律，任何回答都要遵守：
1. 诚实 > 鼓励：不编分数、不编进步、不夸大。我做得差就直说差在哪。
2. 结论先行：事实类问题直接给答案；讲解类才展开，且必须"举例 + 说清为什么"。
3. 中文讲解、英文素材：解释用中文，练习内容（题目/句子/范文）用英文。

下面是本次的具体任务：`,

  // 9 条场景指令体
  scenes: {
    p1: {
      title: '口语 P1 对练',
      params: ['n', '话题1', '话题2', '话题3'],
      body:
`【P1 模拟考】你扮演雅思考官，进行 {n} 个话题的 Part 1 问答，话题从：{话题1}、{话题2}、{话题3} 中各问 3-4 个问题。

规则：
- 一次只问一个问题，等我回答后再问下一个，不要一口气列出一串问题。
- 我卡壳超过 10 秒时，给我一个词提示而不是替我说。
- 全部问完后才进入点评，中途不打断纠错（保持考试真实感）。

点评格式（问完后输出）：
1. 每个话题：我答案的流利度（说满了吗/有没有大段停顿）+ 1 个说得好的点 + 1 个最该改的点
2. 语法错误清单：原句 → 错在哪 → 正确说法（只列实际说错的，不凑数）
3. 最后给一个 P1 预估分数段（4.5-6 区间）和一条今天就能练的改进动作`
    },
    p2: {
      title: '口语 P2 说满 2 分钟',
      params: ['题卡', '素材'],
      body:
`【P2 训练】题卡：{题卡}
我的串题素材：{素材}

第一轮：我把素材按题卡复述一遍（打字发你，同时口头计时 2 分钟）。你只记录：
1. 我漏掉了题卡里的哪几个小问（逐条对照题卡的 3-4 个提示点）
2. 哪里明显是背书腔（句子和素材一字不差的地方）
3. 按题卡提示点重新组织的话，素材哪段放前面更好

第二轮：给我 5 个"连接救命句"（英文），帮我从卡住的地方自然接下去，而不是重启。
⚠️ 铁律：不许改写我的素材本身，不许建议我换故事——只做"套题卡"的调整。`
    },
    errorbook: {
      title: '错题归因分析',
      params: ['题目', '我的答案', '正确答案', '原文相关句'],
      body:
`【错题分析】
题目：{题目}
我的答案：{我的答案}　正确答案：{正确答案}
原文相关句：{原文相关句}

输出格式：
1. 错因归类（单选一）：词汇不认识 / 定位错段 / 句子没读懂 / FALSE与NOT GIVEN混淆 / 陷阱词(绝对词/偷换) / 粗心
2. 一句话讲清：正确答案是怎么从原文推出来的（引用原文词）
3. 我的答案错在哪一步（具体到"你把X当成了Y"）
4. 规避动作：下次见到同类题先做什么（一句话，可执行）

特别规则（判断题专用）：
- FALSE = 原文明确矛盾（原文直接说了反话）
- NOT GIVEN = 原文没提/没回应（找不到对应信息，也找不到矛盾）
- 我若是把"没提"判成 FALSE，请在第 3 步明确指出："这个信息原文压根没提，不构成矛盾"。`
    },
    longsent: {
      title: '长难句解码训练',
      params: ['句子'],
      body:
`【长难句解码】句子：{句子}

按以下顺序处理：
1. 我先打字给你我的翻译（可能不完整，拿不准的词我会标 ?? 或留英文）。
2. 你按"复盘对比区"格式回复：
   | 我的译法 | 正确理解 | 错点类型 | 规避 |
   每行一个点，错点类型限：形近词混淆 / 义近词混淆 / 高频词不识 / 句法结构 / 语序
3. 句中阅读高频词（阅读题干和正文反复出现的），单独列一栏：词 | 正确中文 | 高频程度(高/中/低)
4. 最后给这句话的"括号法拆解"：主干用【】，修饰成分一层层套()，我下次自己拆同类句照这个格式。

规则：我翻错成音近/形近错词时（比如把 symptom 翻成"标本"），必须当场点破并给规避法，不许放过。`
    },
    writing: {
      title: '写作批改',
      params: ['题目', '模板名', '我的作文'],
      body:
`【写作批改】题目：{题目}
我用的模板：{模板名}（模板本身是我的既定策略，不许评价模板好坏、不许建议换模板）

我的作文：
{我的作文}

输出格式：
1. 四项打分（TR/CC/LR/G，各按 0-9 给整数或半分）+ 一句总评
2. 逐段问题清单：段落 | 问题 | 改法（只挑真问题，最多 5 条，不凑数）
3. 语法错误 Top3：原句 → 错因 → 改法（同类错误合并算 1 条）
4. 模板填充检查：模板句之间我填的内容，有没有"填空填崩"的地方（语法接不上/逻辑断层），指出来
5. 按目标 5.5，这篇最优先要修的 1 件事

⚠️ 铁律：只改我填的内容，模板框架一个词都不动。`
    },
    words: {
      title: '单词出题',
      params: ['题型', '词表'],
      body:
`【单词测试】题型：{题型}
词表：{词表}

出题规则：
- 每词 1 题，共出全部词。
- 选择题的 3 个干扰项必须满足：和正确答案同类别、易混淆（比如考"洋流 currents"，干扰项用"现金流/电流/水流"这种同领域近形义，不用一眼假选项）。
- 不要按词表顺序出题，打乱。
- 一次只出 1 题，等我答完再出下一题。
- 全部答完后输出：错词清单 | 每个错词的正确义 + 它属于我哪种老毛病（形近混淆/义近混淆/单纯没背过）+ 建议归入的复习组。

⚠️ 判定标准：意思对即算对，拼写忽略（考试策略如此）。`
    },
    listening: {
      title: '听力精听复盘',
      params: ['错误清单'],
      body:
`【听力复盘】本次错误清单：{错误清单}

输出：
1. 归因：每个错点属于——发音不熟(认识词但没听出) / 连读吞音 / 词汇根本不认识 / 拼写错(听到没写对) / 单复数
2. 发音类错点：给出该词的正确音标 + 一个"连读拆解"（把那段连读按实际发音慢速拼写出来，如 /wɔtʃə/ ← what do you）
3. 从中挑 5 个最高频的，生成 3 句包含这些词的听写口述稿（你打字给我，我来做听写）
4. 结论：本次正确率 X%，距离 S1/S4 填空目标(正确率 80%)还差多少，下一组优先练哪类

⚠️ 规则：归因宁严勿松——"我其实知道这个词"不算数，没听出来就是发音不熟。`
    },
    dailyplan: {
      title: '每日计划',
      params: ['今天状态', '昨天遗留', 'n1', 'n2'],
      body:
`【今日安排】今天状态：{今天状态}
昨天遗留：{昨天遗留}
剩余天数：距 8/25 考试 {n1} 天（距 9/13 主目标 {n2} 天）

给我今天的安排，格式：
1. 今日大事（3-5 件，按优先级）：每件一句话说清"做什么+做多少算完"（如"阅读 P1 一篇，20 分钟计时，做完对答案"）
2. 今日底线（1 件，再崩也要完成的事）
3. 一句提醒（和我当前最弱项相关的，本周重点：听口优先）

规则：
- 不排具体时间点，我按状态自己定顺序（大块轮换：背单词/听力/阅读/口语混着来）
- 口语开口练习必须占至少 1 件（距考 10 天，口语最弱）
- 别贪多，宁可 3 件全做完，不要 6 件做一半`
    },
    weekly: {
      title: '模考/周复盘',
      params: ['成绩', '本周记录', 'n2'],
      body:
`【复盘】本次成绩：{成绩}（目标：听5.5 读6.5 写5.5 口5.5，总分6.0）
本周学习记录：{本周记录}

输出：
1. 结论先行：距 9/13 目标，当前最大风险是哪一科（用差距数据说话，别客气）
2. 对比上次：哪些是真进步（有记录支撑才算）、哪些是波动（单次不可靠）
3. 本周记录里的"没做完"逐项判断：属于"意愿在但时间/精力没跟上"还是"做了没吸收"？两种的处理方式不同，分开列。
4. 下周侧重：最多 2 个科目优先级调整建议 + 为什么

⚠️ 铁律：AI 代写的材料不算我的战果；"没做完"≠"没吸收"，不许混为一谈；没有记录支撑的进步不许写。`
    }
  }
};

/* ---------- 2. 页面 → 场景映射（自动挂载） ---------- */
const PAGE_SCENES = {
  'index.html':     ['dailyplan'],
  'timer.html':     ['p1', 'p2', 'writing', 'listening', 'dailyplan'],
  'speaking.html':  ['p1', 'p2'],
  'errorbook.html': ['errorbook'],
  'longsent.html':  ['longsent'],
  'writing.html':   ['writing'],
  'words.html':     ['words'],
  'practice.html':  ['words'],
  'corpus.html':    ['listening'],
  'plans.html':     ['dailyplan'],
  'scores.html':    ['weekly']
};

/* ---------- 3. 参数自动带出（最佳努力） ---------- */
/* daysUntil / toast 已由 common.js 定义为全局函数，此处不重复声明，避免覆盖 */
function collectParams(sceneId) {
  const p = Object.assign({}, window.AI_CONTEXT || {});
  // 天数自动算（dailyplan / weekly）
  if (sceneId === 'dailyplan' || sceneId === 'weekly') {
    if (p.n1 == null) p.n1 = daysUntil('2026-08-25');
    if (p.n2 == null) p.n2 = daysUntil('2026-09-13');
  }
  // 口语页：当前打开的题卡/话题
  if (sceneId === 'p1' || sceneId === 'p2') {
    const t = document.querySelector('#detailBody .sp-detail-title');
    const title = t ? t.textContent.trim() : '';
    if (title) {
      if (!p['题卡']) p['题卡'] = title;
      if (sceneId === 'p1' && !p['话题1']) p['话题1'] = title;
    }
  }
  // 长难句：句子输入框
  if (sceneId === 'longsent') {
    const el = document.querySelector('#sentInput');
    if (el && el.value.trim() && !p['句子']) p['句子'] = el.value.trim();
  }
  // 词库/练习：勾选的词
  if (sceneId === 'words') {
    if (!p['词表']) {
      const checked = document.querySelectorAll('#wordList input:checked, #practiceList input:checked, .word-item input:checked');
      const words = [];
      checked.forEach(cb => {
        const row = cb.closest('.word-item, li, tr');
        const en = row ? row.querySelector('.word-en, .w-en, [data-en]') : null;
        const txt = (en && en.textContent.trim()) || (cb.dataset && cb.dataset.word) || (cb.parentElement && cb.parentElement.textContent.trim().split('\n')[0]);
        if (txt) words.push(txt.trim());
      });
      if (words.length) p['词表'] = words.join(', ');
    }
    if (!p['题型']) p['题型'] = '看词选义';
  }
  return p;
}

/* ---------- 4. 拼装 + 可编辑（localStorage 覆盖） ---------- */
function getOverride(key) {
  try { return localStorage.getItem('ai_override_' + key); } catch (_) { return null; }
}
function saveOverride(key, text) {
  try { localStorage.setItem('ai_override_' + key, text); return true; } catch (_) { return false; }
}
function buildPrompt(sceneId, params) {
  const P = window.AI_PROMPTS;
  const scene = P.scenes[sceneId];
  if (!scene) return '';
  const header = getOverride('header') || P.header;
  const body = getOverride(sceneId) || scene.body;
  // 把 {key} 替换为参数（参数缺失则保留占位，让用户补）
  const filled = body.replace(/\{([^}]+)\}/g, (m, k) => {
    const val = params[k];
    return (val != null && String(val).trim() !== '') ? String(val) : m;
  });
  return header + '\n\n' + filled;
}

/* ---------- 5. 剪贴板复制 + 降级兜底 ---------- */
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}
function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok) return true;
  } catch (_) {}
  // 仍失败 → 弹窗让用户手动复制
  const w = window.open('', '_blank', 'width=600,height=500');
  if (w) {
    w.document.write('<title>复制 AI 指令</title><body style="margin:0"><textarea style="width:100%;height:100%;border:0;padding:12px;font:14px/1.6 monospace;box-sizing:border-box">' + text.replace(/</g, '&lt;') + '</textarea></body>');
    w.document.close();
    setTimeout(() => { const t = w.document.querySelector('textarea'); if (t) { t.focus(); t.select(); } }, 100);
  }
  return true; // 已尽力，不阻断
}

/* ---------- 6. toast 直接复用 common.js 全局版本，不再重复定义 ---------- */

/* ---------- 7. 编辑弹窗（可编辑并存 localStorage） ---------- */
function openEditModal(sceneId) {
  const P = window.AI_PROMPTS;
  const isHeader = sceneId === '__header__';
  const key = isHeader ? 'header' : sceneId;
  const title = isHeader ? '编辑通用指令头' : ('编辑：' + P.scenes[sceneId].title);
  const current = getOverride(key) || (isHeader ? P.header : P.scenes[sceneId].body);

  const mask = document.createElement('div');
  mask.style.cssText = 'position:fixed;inset:0;background:rgba(15,27,45,.45);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px';
  mask.innerHTML =
    '<div style="background:#fff;border-radius:16px;width:min(720px,100%);max-height:86vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 18px 48px rgba(15,27,45,.2)">' +
      '<div style="padding:14px 18px;font-weight:700;font-size:16px;border-bottom:1px solid #e8edf4">' + title + '</div>' +
      '<textarea style="flex:1;min-height:300px;border:0;padding:14px 18px;font:13px/1.7 monospace;resize:none;outline:none;box-sizing:border-box">' + current.replace(/</g, '&lt;') + '</textarea>' +
      '<div style="padding:12px 18px;display:flex;gap:8px;justify-content:flex-end;border-top:1px solid #e8edf4">' +
        '<button data-act="reset" style="padding:8px 14px;border:1px solid #e8edf4;border-radius:10px;background:#f8fafc;cursor:pointer">恢复默认</button>' +
        '<button data-act="cancel" style="padding:8px 14px;border:1px solid #e8edf4;border-radius:10px;background:#f8fafc;cursor:pointer">取消</button>' +
        '<button data-act="save" style="padding:8px 14px;border:0;border-radius:10px;background:#1d4ed8;color:#fff;cursor:pointer">保存</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(mask);
  const ta = mask.querySelector('textarea');
  mask.addEventListener('click', e => {
    const act = e.target.getAttribute && e.target.getAttribute('data-act');
    if (e.target === mask) { mask.remove(); return; }
    if (act === 'cancel') mask.remove();
    else if (act === 'reset') { if (confirm('恢复为默认指令？')) { localStorage.removeItem('ai_override_' + key); mask.remove(); toast('已恢复默认'); } }
    else if (act === 'save') {
      if (saveOverride(key, ta.value)) { toast('已保存（本机生效）'); mask.remove(); }
      else toast('保存失败：浏览器存储不可用');
    }
  });
}

/* ---------- 8. 挂载按钮 ---------- */
function makeBtn(label, onClick) {
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText = 'padding:9px 14px;border:0;border-radius:12px;background:#1d4ed8;color:#fff;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 8px 24px rgba(29,78,216,.25)';
  b.addEventListener('click', onClick);
  return b;
}
function mountAICopyUI() {
  const file = (location.pathname.split('/').pop() || 'index.html').split('?')[0];
  const scenes = PAGE_SCENES[file];
  if (!scenes || !scenes.length) return;

  const P = window.AI_PROMPTS;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:9000;display:flex;flex-direction:column;align-items:flex-end;gap:8px';

  // 编辑通用头的入口（小字）
  const editHeader = document.createElement('button');
  editHeader.textContent = '✏️ 改通用头';
  editHeader.title = '编辑通用指令头（本机保存）';
  editHeader.style.cssText = 'padding:4px 10px;border:1px solid #e8edf4;border-radius:10px;background:#fff;color:#64748b;font-size:11px;cursor:pointer';
  editHeader.addEventListener('click', () => openEditModal('__header__'));

  if (scenes.length === 1) {
    const id = scenes[0];
    const btn = makeBtn('📋 复制AI指令（' + P.scenes[id].title + '）', () => doCopy(id));
    wrap.appendChild(btn);
    wrap.appendChild(editHeader);
  } else {
    // 多场景：先一个主按钮展开面板
    const panel = document.createElement('div');
    panel.style.cssText = 'display:none;flex-direction:column;gap:6px;background:#fff;padding:10px;border-radius:14px;box-shadow:0 8px 24px rgba(15,27,45,.12);min-width:200px';
    scenes.forEach(id => {
      const b = makeBtn('📋 ' + P.scenes[id].title, () => { doCopy(id); panel.style.display = 'none'; });
      b.style.background = '#f1f5f9'; b.style.color = '#0f1b2d'; b.style.boxShadow = 'none';
      b.style.textAlign = 'left';
      panel.appendChild(b);
    });
    const toggle = makeBtn('📋 AI 指令', () => {
      panel.style.display = (panel.style.display === 'none' ? 'flex' : 'none');
    });
    wrap.appendChild(panel);
    wrap.appendChild(toggle);
    wrap.appendChild(editHeader);
  }
  document.body.appendChild(wrap);
}
function doCopy(sceneId) {
  const params = collectParams(sceneId);
  const text = buildPrompt(sceneId, params);
  copyText(text).then(() => toast('已复制 AI 指令，粘贴给 DeepSeek 即可'));
}

/* ---------- 9. 启动 ---------- */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountAICopyUI);
} else {
  mountAICopyUI();
}
