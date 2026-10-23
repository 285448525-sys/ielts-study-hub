/* === js/sp-diag.js · 口语页 J 区：AI 诊断 / 纠错 / 评分净化（design/76） ===
 *
 * 10-23 T-009 S-3：从 js/speaking.js 原样搬来，函数体一个字没改。
 * 基线 = a2-pages 的 speaking.js（3453 行），本文件取自其中 19 段 / 683 行。
 *
 * 内容清单：
 *   var SYS_DIAG / SYS_DIAG_P2                      两个诊断提示词模板
 *   diagnoseAnswer / diagnoseP2                     两个 AI 调用入口
 *   renderP2Diag / renderDiag                       渲染外壳
 *   normalizeErrors / cleanErrors                   错误条目清洗（剔除误报与风格建议）
 *   wordDiff / trimCommonAffixes / diffSentenceHtml 逐词差异与原句高亮
 *   adaptDiag / findObviousGrammarIssue / hasObviousGrammarIssues
 *   inlineErrorsHtml / diagScoreHtml / highlightRewriteHtml
 *   generateAIHelper / buildPersonaContext / renderAIHelper
 *
 * 🔴 红线一：只换文件住址，函数体一字未改（T-009 唯一要求）。
 * 🔴 红线二：所有顶层声明一律 var / function —— 软导航用 window.eval 逐文件重跑，
 *   const 只活在那一次 eval 的词法作用域，到隔壁文件里就是 undefined。
 *   （函数体内部的 const/let 不受影响，本文件保留原样。）
 * 🔴 红线三：不带 BOM。
 *
 * 依赖（全局 function，defer 全部执行完才调用，顺序不影响）：
 *   J → G  spDiagTierHead / spPersonaLine
 *   J → E  refreshScoreAfterDiag
 *   J → I  renderSubmitRecords / removeSubmitRecord
 *   另用 sp-core 的 $ / escapeHtml，sp-stats 的 parseScore / scoreLabel / aiJson / callRelay
 *
 * 加载位置：speaking.html 里排在 sp-core / sp-stats / sp-list 之后、speaking.js 之前。
 */
/* 顶部常量一律用 var —— 两条实测约束（10-23 T-009 取证）：
   ① speaking.js 会被软导航 window.eval 重跑，顶层 const 在重跑时是 SyntaxError「已声明」；
   ② window.eval 里声明的 const **只存在于那一次 eval 的词法作用域**（实测：
      eval('const CC=1') 之后另一段 eval('typeof CC') === 'undefined'，而 var/function 都是全局可见）
      → 一旦把 speaking.js 拆成多个文件，任何 const 常量都会在隔壁文件里变成 undefined。
   所以 T-009 把原先 5 个 const（SYS_CHUAN_PLAN / SYS_CHUAN_FINAL / CHUAN_AIFILL_SUFFIX /
   SPK_TIMER_MODULE / SPK_TIMER_NAME）全部降级为 var，值一个字没改。 */
var SYS_DIAG = `你是一位雅思口语考官助手。你的任务有两件：
1）找出回答里真正的「语法错误」和「用词错误」，并给出正确写法；
2）按 IELTS 官方口语评分标准，给「语法范围与准确性」和「词汇资源」两个维度打分。

【重要：只评这两项】
流利度与连贯、发音 必须听音频才能评。你只看到文本，所以这两项一律不评、不给分、不要猜、不要在 JSON 里输出。

【评分方法：正向匹配，不是扣分制】
雅思官方是"看答案达到哪一档的描述就给哪一档"，不是"数错误往下扣"。这是最容易搞错的地方：
- 有语法错误不等于低分。6 分的官方描述明确允许"复杂结构会出错"，只要整体意思清楚就是 6。
- 只有"错误造成理解困难"才降到 5；"几乎只用简单句且基本用错"才是 4。
- 用简单句把意思说清楚 = 6 分，不是 5 分。不许因为句型简单、表达不够高级、不够地道而扣分。
- 零错误但全篇简单句 = 语法 6（7 分要求"灵活使用多种复杂结构"）。

【Grammatical Range & Accuracy 档位】
7：灵活使用多种复杂结构，多数句子无错，个别错误不影响理解
6：简单句与复杂句混用；复杂句比简单句更容易出错，但整体意思清楚
5：以简单句为主，偶尔尝试复杂句但常出错，错误有时造成理解困难
4：几乎只用简单句，复杂句罕见且基本用错

【Lexical Resource 档位】
7：词汇有范围和多样性，能换词说，偶有搭配不当
6：词汇量够讨论熟悉话题，会尝试换词说但不总成功，错误不影响理解
5：词汇量有限、重复较多，换词尝试常失败，偶尔造成理解困难
4：只会用基本词，话题相关词匮乏，重复严重

【校准锚点 - 你的打分必须对齐这几个例子】
例A "I think it is good because it help me relax. I usually do it on weekend."（2 处小语法错，意思完全清楚）→ grammar 6, vocabulary 6
例B "I very like read books. It make me happy. I read books every day."（词性误用、重复严重，但意思能懂）→ grammar 5, vocabulary 5
例C "Although the internet has brought unprecedented convenience to our daily routines, there is a growing concern that excessive reliance on it may undermine our capacity for deep concentration."（复杂结构准确、词汇多样）→ grammar 7, vocabulary 7
例D "I like reading books. I read books every day. It makes me happy."（全简单句、零错误、意思清楚、用词重复）→ grammar 6, vocabulary 5

【半档判定规则（官方口径，必须遵守）】
雅思半档（x.5）的官方定义：**完全达到 x 档的全部描述，并且部分达到 x+1 档的描述 → 给 x.5**。
- 稳定符合 5 档、且部分表现够到 6 档（如复杂句尝试有一定成功率、错误基本不影响理解）→ 5.5
- 稳定符合 6 档、且部分表现够到 7 档（如频繁出现无错句、能较灵活换词）→ 6.5
- 表现介于两档之间时**必须用半档表达，禁止四舍五入成整数**。

【半档校准锚点 - 与上面锚点同等效力】
例E（5.5）"I very like play badminton because it make me healthy and I can made some friends who also very like sport."（词性/时态错误频繁但意思能懂；有连接尝试；词汇重复但能小幅换述）→ grammar 5.5, vocabulary 5.5
例F（6.5）"Although many people believe that reading is boring, but for me it is a way to reduce stress. When I was young, my father gave me a book which changed my mind, and since then I have read almost every day."（多数句子无错、复杂结构用得起来，偶有 believe...but 连用等小错）→ grammar 6.5, vocabulary 6.5

【100% 不算错误、也不扣分】
- 大小写（句首小写、And/But/So 大写等）
- 标点符号（缺逗号句号、逗号变句号等语音转写瑕疵）
- 口语填充词（well, you know, like, actually）
- 自然口语省略（如 "Think it's good" 在口语中可接受）
- 简单句本身（用简单句不是错）
- 发音/口音相关问题

【输出格式 - 严格 JSON，不要 markdown 代码块，不要任何解释文字】
{
  "errors": [
    {
      "original": "错误原文片段",
      "corrected": "正确写法",
      "type": "grammar 或 vocabulary",
      "explanation": "中文一句话说明为什么错、怎么改"
    }
  ],
  "improved": "整体改写成一个更通顺、更地道的版本",
  "score": {
    "grammar": 6,
    "grammar_basis": "一句话说明为什么是这个档：引用上面某条档位描述 + 具体证据（如「3 处时态错误但整体意思清楚」）",
    "vocabulary": 6,
    "vocabulary_basis": "同上"
  }
}
没有错误时 errors 返回 []。分数必须是 4~8 之间、以 0.5 为最小步长的数字（合法值仅限：4 / 4.5 / 5 / 5.5 / 6 / 6.5 / 7 / 7.5 / 8）；表现介于两档之间时必须给半档，禁止只输出整数。

【错误条目一致性铁律】grammar_basis / 评语里点名的每一处问题（时态、缺 be 动词、搭配、副词顺序等），必须在 errors 数组里有对应条目：只要评语说了存在语法/用词问题，errors 就绝不允许是空数组——宁可多给一条，也严禁「说有问题却不给条目」。original 必须逐字引用考生原文里的出错片段（前端要靠它在原句中定位标出），corrected 给出具体改法。

【improved 要求】把考生回答整体改写成一个更通顺、更地道的版本（保留原意与口语风格，长度与原文相近，只优化表达，不添加新内容；纯符号 "/" 表示对应处直接删除）。
【注意】corrected 里若某处只是删除（无替换词），用 "/" 表示；不要用省略号或其他写法。
【最小片段铁律】original 和 corrected 只写「真正出错的那个词/短语」本身，前后没错的词一律不要带进来（例：错在 is → original 写 "is"，corrected 写 "has been"；绝不要把没错的 "artificial intelligence" 等上下文复述进 corrected）。

【示例】
输入: "We are got a big mirror. I leave in my house every day."
输出: {"errors":[{"original":"We are got","corrected":"We have got / We've got","type":"grammar","explanation":"没有 are got 结构，拥有用 have got"},{"original":"leave in my house","corrected":"leave my house","type":"grammar","explanation":"leave 是及物动词，不需要介词 in"}],"improved":"We've got a big mirror. I leave my house every day.","score":{"grammar":6,"grammar_basis":"简单句与复杂句混用，两处搭配错误但意思清楚，符合 6 分档","vocabulary":6,"vocabulary_basis":"用词够表达熟悉话题，无生造词"}}`;

// P2 专用诊断提示词（语法纠错 + 串题素材连接；复用 SYS_DIAG 通用规则，追加 P2 专属要求）
var SYS_DIAG_P2 = SYS_DIAG
  + `

【Part 2 要求】考生做约 2 分钟连续陈述，允许更多从句和连接词。评分仍只给 grammar / vocabulary 两项（流利度/发音需音频，不评）。

`
  + `【串题素材连接(storyLink)】考生会提供已准备的万能素材（见用户消息末尾）。若本题可套用其中某个素材，请在 JSON 末尾额外返回 "storyLink" 字段（中文，2-4 行，说明可怎么把素材嵌入本题回答）。无合适素材则不返回该字段。

`
  + `【输出格式补充】上述 JSON 的 "errors" 数组外，可额外包含可选字段："storyLink": "可套用的万能素材连接建议（中文；无合适素材则省略）"。`;

/* 激活指定 tab（只切高亮，不切视图——视图由调用方控制） */
function spActivateTab(type){
  $('#tabs').querySelectorAll('[data-type]').forEach(x => x.classList.toggle('active', x.dataset.type === type));
}

async function diagnoseAnswer(id, qi, questionText, answerText){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  const resultEl = document.querySelector('.sp-q-result[data-qi="' + qi + '"]');
  const btn = document.querySelector('.sp-diag[data-qi="' + qi + '"]');
  const btnHtml = btn ? btn.innerHTML : '';   // B2：缓存原 SVG
  if(btn){ btn.disabled = true; btn.textContent = '诊断中…'; }
  try{
    const messages = [
      { role:'system', content: spDiagTierHead() + SYS_DIAG },
      { role:'user', content: '题目：' + questionText + '\n\n我的回答：\n' + answerText }
    ];
    const content = await callRelay('speaking_diagnose', messages, 0.3);
    const j = aiJson(content);
    adaptDiag(j);
    normalizeScore(j, answerText);
    renderDiag(resultEl, j, content, answerText);
    s.answers = s.answers || {};
    const oldAns = s.answers[qi] || {};
    // 9/20 评分恢复：把真实分数落库（AI 失败会走 catch 不落库；非 JSON 时 j 为 null → newScore 为 null，
    // 列表继续显示「练过N次」，绝不编造分数）
    const newScore = j ? parseScore(j.score) : null;
    s.answers[qi] = { ...oldAns, text: answerText, result: (j ? JSON.stringify(j) : content), ts: Date.now(), score: newScore };
    s.answers[qi].records = s.answers[qi].records || [];
    s.answers[qi].records.push({ text: answerText, ts: Date.now(), score: newScore, result: (j ? JSON.stringify(j) : content), raw: content });
    s.updatedAt = Date.now();
    hubSave();
    refreshScoreAfterDiag(s);
  }catch(e){
    if(resultEl){
      resultEl.innerHTML = '<div class="diag-note">AI 服务暂不可用：' + escapeHtml(e.message) + '\n\n请稍后再试。</div>';
      resultEl.style.display = 'block';
    }
    toast('AI 诊断失败：' + e.message);
  }finally{
    if(btn){ btn.disabled = false; btn.innerHTML = btnHtml; }   // B2：恢复 SVG
  }
}

function renderP2Diag(el, j, answer){
  normalizeScore(j, answer);
  if(!j || !Array.isArray(j.errors)){ el.innerHTML = ''; return false; }
  const errs = cleanErrors(j.errors);
  let h = diagScoreHtml(j)
    + '<div class="diag-sec"><b>语法/用词纠错</b>' + diffSentenceHtml(answer, errs) + '</div>';
  if(j.rewrite) h += '<div class="diag-sec"><b>改进版表达</b><div class="diag-rewrite">' + highlightRewriteHtml(j.rewrite, errs) + '</div></div>';
  if(j.storyLink) h += '<div class="diag-sec"><b>📌 串题素材连接</b><div class="diag-note">可以用你已准备的这些万能素材来回答这道题：</div>' + escapeHtml(j.storyLink) + '</div>';
  el.innerHTML = h;
  return true;
}

async function diagnoseP2(id){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  // 修(h 空数据降级)：原 ($('#p2Ans') || {}).value.trim() 只兜住了元素本身，
  // 元素缺失时 {}.value 是 undefined，再 .trim() 直接 TypeError —— 应当走下面的空值提示而非崩溃。
  const __p2ta = $('#p2Ans');
  const answer = __p2ta ? __p2ta.value.trim() : '';
  if(!answer){ toast('先说出或写下你的回答'); return; }

  const btn = $('#p2Diag');
  const btnHtml = btn ? btn.innerHTML : '';   // B2：缓存原 SVG
  const resultEl = $('#p2Result');
  if(btn){ btn.disabled = true; btn.textContent = '纠错中…'; }

  try{
    // 读已有串题故事作为素材参考（speakingStories 每条含 stories[]，每条有 name/keyPoints/outline）
    const stories = (DATA.speakingStories || []).map(scheme =>
      (scheme.stories || []).map(st =>
        '【' + (st.name || '') + '】' + (st.keyPoints || '') + '\n' + (st.outline || '').slice(0, 300)
      ).join('\n---\n')
    ).join('\n===\n');

    const messages = [
      { role:'system', content: spDiagTierHead() + SYS_DIAG_P2 },
      { role:'user', content:
        'P2 题目：' + (s.promptEn || s.title || '') +
        '\n中文描述：' + (s.promptZh || '') +
        '\n\n考生的完整回答：\n' + answer +
        '\n\n考生已有的串题万能素材（用于给出串题建议）：\n' +
        (stories || '（暂无串题素材）')
      }
    ];
    const content = await callRelay('speaking_diagnose', messages, 0.3);
    const j = aiJson(content);
    adaptDiag(j);
    normalizeScore(j, answer);

    // 渲染结果
    if(!renderP2Diag(resultEl, j, answer)){
      resultEl.innerHTML = '<div class="diag-note">（AI 没按格式回，已贴原文）</div><pre>' + escapeHtml(content || '') + '</pre>';
    }
    resultEl.style.display = 'block';

    // 存结果 + 追加一条提交历史记录
    s.answers = s.answers || {};
    // 9/20 评分恢复：真实分数落库（同上，AI 失败不落库；非 JSON 时保持 null 不编造）
    const newScore = j ? parseScore(j.score) : null;
    // 修(b/g)：原写法整体替换 answers.p2，会把 p3（P3 追问题目/答案/AI辅助）、
    // aiStoryLink（串题素材）和已有 records 全部抹掉，导致每次「AI 纠错」后 P3 与串题消失、
    // 历史只剩 1 条。改为展开合并保留旧字段，与 diagnoseAnswer 的 { ...oldAns } 口径一致。
    s.answers.p2 = { ...(s.answers.p2 || {}), text: answer, result: (j ? JSON.stringify(j) : content), ts: Date.now(), score: newScore };
    s.answers.p2.records = s.answers.p2.records || [];
    s.answers.p2.records.push({ text: answer, ts: Date.now(), score: newScore, result: (j ? JSON.stringify(j) : content), raw: content });
    s.updatedAt = Date.now();
    hubSave();
    refreshScoreAfterDiag(s);
    // 刷新 P2 提交历史列表
    renderSubmitRecords(s.answers.p2.records, $('#p2Records'), (rec) => {
      const ta = $('#p2Ans'); if(ta && rec.text != null){ ta.value = rec.text; ta.dispatchEvent(new Event('input', { bubbles: true })); }
      const res = $('#p2Result');
      if(res && rec.result){
        try{ const j2 = JSON.parse(rec.result); if(renderP2Diag(res, j2, rec.text)){ res.style.display = 'block'; return; } }catch(_){}
        res.innerHTML = '<pre>' + escapeHtml(rec.result) + '</pre>'; res.style.display = 'block';
      }
    }, (i) => removeSubmitRecord(s, 'p2', i));

  }catch(e){
    resultEl.innerHTML = '<div class="diag-note">AI 服务暂不可用：' + escapeHtml(e.message) + '</div>';
    resultEl.style.display = 'block';
    toast('AI 纠错失败：' + e.message);
  }finally{
    if(btn){ btn.disabled = false; btn.innerHTML = btnHtml; }   // B2：恢复 SVG
  }
}

function normalizeErrors(errors){
  if(!Array.isArray(errors)) return [];
  return errors.map(e => {
    if(e && typeof e === 'object') return e;
    if(typeof e !== 'string') return null;
    const s = e.trim();
    if(!s) return null;
    // 常见模式："xxx" 中 "yyy" 多余，应为 "zzz" / "xxx" 应为 "yyy"
    let m = s.match(/^[""]([^""]+)[""]\s*中\s*[""]([^""]+)[""]\s*(?:多余|错误|不对|有误)[，,;；]?\s*应为\s*[""]([^""]+)[""](.*)$/);
    if(m) return { original: m[1].trim(), issue: '「' + m[2].trim() + '」' + (m[0].includes('多余') ? '多余' : '错误'), fix: m[3].trim() };
    m = s.match(/^[""]([^""]+)[""]\s*(?:中\s*)?[""]([^""]+)[""]\s*应为\s*[""]([^""]+)[""](.*)$/);
    if(m) return { original: m[1].trim(), issue: '「' + m[2].trim() + '」错误', fix: m[3].trim() };
    m = s.match(/^[""]([^""]+)[""]\s*应为\s*[""]([^""]+)[""](.*)$/);
    if(m) return { original: m[1].trim(), issue: '应为「' + m[2].trim() + '」', fix: m[2].trim() };
    m = s.match(/^([^应为改为→\n]{2,60})\s*(?:应为|应改为|改成|→|->)\s*(.+)$/);
    if(m) return { original: m[1].trim(), issue: '语法/用词问题', fix: m[2].trim() };
    // 兜底：把整个字符串当 issue
    return { original: s, issue: s, fix: '' };
  }).filter(Boolean);
}

function cleanErrors(errors){
  if(!Array.isArray(errors)) return [];
  errors = normalizeErrors(errors);
  if(!Array.isArray(errors)) return [];
  // 自我否定/自相矛盾的话
  const BAD = /原句没错|原句正确|不应列为|不是错误|不算错误|也正确|可接受|没问题|不存在|没有错误|并不错|其实没错|实际上没错|可保留|不必修改|无需修改|无需改动|没有语法错误|没有明显|不过.*也可以|虽然.*但.*正确|此条不列为|不列为错误/i;
  // 口语中永远不算错误的点：标点、大小写、空格、断句
  const PUNCT_CAP = /大小写|首字母|大写|小写|标点|逗号|句号|问号|感叹号|引号|空格|断句|缺少.*标点|应加标点|加标点/i;
  // 风格/同义替换/改写建议类：不是真错误
  const STYLE = /更地道|更自然|更常见|更口语|更正式|更好|建议|可替换|可改为|可改成|可换成|用.*更好|显得|不够地道|不够自然|不够正式|不够口语|同义词|同义|替换|替换成|换成|改写成|改写为|重写为|换一种|更.*表达|表达.*更好|意思.*一样|意思.*相同|更简洁|更清楚|更流畅/i;
  return errors.filter(e => {
    if(!e || typeof e !== 'object') return false;
    const orig = String(e.original || '').trim();
    const fix = String(e.fix || '').trim();
    if(!orig || !fix) return false;
    if(orig.toLowerCase() === fix.toLowerCase()) return false;
    if(BAD.test(String(e.issue || ''))) return false;
    if(PUNCT_CAP.test(String(e.issue || ''))) return false;
    if(STYLE.test(String(e.issue || ''))) return false;
    // 常见意义改变/同义替换硬过滤（original/fix 同时命中）
    const origLower = orig.toLowerCase();
    const fixLower = fix.toLowerCase();
    if((origLower.includes("don't know") && fixLower.includes("don't think so")) ||
       (origLower.includes("don't think so") && fixLower.includes("don't know"))) return false;
    if((origLower.includes('unwind') && fixLower.includes('relaxed')) ||
       (origLower.includes('relaxed') && fixLower.includes('unwind'))) return false;
    if((origLower.includes('adhder') || origLower.includes('adhd')) &&
       (fixLower.includes('bad driver') || fixLower.includes('driver'))) return false;
    return true;
  });
}

function wordDiff(a, b){
  const wa = String(a || '').trim().split(/\s+/).filter(Boolean);
  const wb = String(b || '').trim().split(/\s+/).filter(Boolean);
  const dp = Array(wa.length + 1).fill(null).map(() => Array(wb.length + 1).fill(0));
  for(let i = wa.length - 1; i >= 0; i--){
    for(let j = wb.length - 1; j >= 0; j--){
      if(wa[i].toLowerCase() === wb[j].toLowerCase()) dp[i][j] = dp[i+1][j+1] + 1;
      else dp[i][j] = Math.max(dp[i+1][j], dp[i][j+1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while(i < wa.length || j < wb.length){
    if(i < wa.length && j < wb.length && wa[i].toLowerCase() === wb[j].toLowerCase()){
      out.push({type:'same', text: wa[i]}); i++; j++;
    } else if(j < wb.length && (i === wa.length || dp[i][j+1] > dp[i+1][j])){   // 9/15：相等时优先 del——「先划原文、后见替换」之之定版语序
      out.push({type:'ins', text: wb[j]}); j++;
    } else if(i < wa.length){
      out.push({type:'del', text: wa[i]}); i++;
    }
  }
  return out;
}

function trimCommonAffixes(orig, fix){
  const norm = t => String(t).toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '');
  const wa = String(orig || '').trim().split(/\s+/).filter(Boolean);
  const wb = String(fix || '').trim().split(/\s+/).filter(Boolean);
  const pre = [], post = [];
  while(wa.length && wb.length && norm(wa[0]) === norm(wb[0]) && norm(wa[0]) !== ''){ pre.push(wa.shift()); wb.shift(); }
  while(wa.length && wb.length && norm(wa[wa.length-1]) === norm(wb[wb.length-1]) && norm(wa[wa.length-1]) !== ''){ post.unshift(wa.pop()); wb.pop(); }
  return { pre: pre.join(' '), a: wa.join(' '), b: wb.join(' '), post: post.join(' ') };
}

function diffSentenceHtml(answer, errs){
  const ans = String(answer || '').trim();
  const clean = cleanErrors(errs);
  const broken = hasObviousGrammarIssues(answer);
  if(!clean.length && !broken) return '<div class="diag-ok">没发现明显错误，继续保持～</div>';
  if(!clean.length && broken){
    // 9/26（她报 bug）：AI 没给出具体位置时，用本地规则把「哪一段、什么问题」直接指出来
    const f = findObviousGrammarIssue(answer);
    if(f) return '<div class="diag-warn">检测到疑似问题：<span class="diag-hl">' + escapeHtml(f.hit) + '</span> —— ' + escapeHtml(f.msg)
      + '。<div class="muted" style="margin-top:6px;font-size:12.5px">（AI 这次没给出具体位置，以上是站内规则兜底检测，仅供参考）</div></div>';
    return '<div class="diag-warn">句子有明显语法问题（如缺 be 动词/时态/成分残缺），但 AI 未具体指出。建议重读原句或手动检查。</div>';
  }
  if(!ans) return inlineErrorsHtml(clean);
  const isPlaceholderFix = t => /^[\s\/\-–—|,.;!?、；。]*$/.test(String(t || ''));

  // 按 original 在原句中出现位置排序，从后往前替换，避免偏移
  const reps = [];
  clean.forEach(e => {
    const orig = String(e.original || '');
    const fix = String(e.fix || '');
    if(!orig || !fix) return;
    // 9/15：词边界匹配（"is" 不得命中 "this" 内部），失败再退回普通 indexOf
    let idx = -1, len = orig.length;
    try {
      const esc = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = ans.match(new RegExp('(?<![A-Za-z])' + esc + '(?![A-Za-z])', 'i'));
      if(m){ idx = m.index; len = m[0].length; }
    } catch(_) {}
    if(idx === -1){
      idx = ans.toLowerCase().indexOf(orig.toLowerCase());
      if(idx === -1) return;
    }
    const t = trimCommonAffixes(orig, fix);
    if(!t.a && !t.b) return;
    const parts = wordDiff(t.a, t.b);
    // 连续同类型 token 合并成一个标记（ins "has"+"been" → 一个绿块），词间就是一个普通空格
    const seg = [];
    parts.forEach(p => {
      const lastSeg = seg[seg.length - 1];
      if(lastSeg && lastSeg.type === p.type) lastSeg.text += ' ' + p.text;
      else seg.push({ type: p.type, text: p.text });
    });
    let html = t.pre ? escapeHtml(t.pre) + ' ' : '';   // 裁掉的前缀原样补回（本来就是对的）
    seg.forEach(s => {
      if(s.type === 'same') html += (html ? ' ' : '') + escapeHtml(s.text);
      if(s.type === 'del') html += (html ? ' ' : '') + '<s class="diag-wrong">' + escapeHtml(s.text) + '</s>';
      if(s.type === 'ins' && !isPlaceholderFix(s.text)) html += (html ? ' ' : '') + '<span class="diag-right">' + escapeHtml(s.text) + '</span>';
    });
    if(t.post) html += ' ' + escapeHtml(t.post);   // 裁掉的后缀原样补回
    reps.push({idx, len, html});
  });

  if(!reps.length) return inlineErrorsHtml(clean);
  // 修(e 转义纪律)：原写法把未转义的用户原文 ans 直接拼进 innerHTML，只有命中的错误片段过了
  // escapeHtml —— 回答里出现 < > & 会破坏结构甚至注入标签。改为升序遍历，未命中的段落逐段转义。
  reps.sort((a, b) => a.idx - b.idx);
  let html = '';
  let last = 0;
  reps.forEach(r => {
    if(r.idx < last) return;   // 9/15：重叠的纠错只渲染第一条，防同段文本重复出现
    html += escapeHtml(ans.slice(last, r.idx)) + r.html;   // r.html 内部已各自 escapeHtml
    last = r.idx + r.len;
  });
  html += escapeHtml(ans.slice(last));
  return '<div class="diag-sentence-diff">' + html + '</div>';
}

function adaptDiag(j){
  if(!j || typeof j !== 'object') return j;
  // 新格式评分维度在顶层（overall/fluency/lexical/grammar/pronunciation），旧后端统一读 j.score.*
  if(j.score == null) j.score = {};
  ['fluency','grammar','overall','pronunciation'].forEach(k => {
    if(j[k] != null && j.score[k] == null) j.score[k] = j[k];
  });
  /* 10/3 补齐：AI 可能把词汇维度叫 lexical / vocab / lex（三种都见过），全映射进 score.vocabulary */
  ['lexical', 'vocab', 'lex'].forEach(k => {
    if(j[k] != null && j.score.vocabulary == null) j.score.vocabulary = j[k];
    if(j[k] != null && j.score[k] == null) j.score[k] = j[k];
  });
  if(j.vocabulary != null && j.score.vocabulary == null) j.score.vocabulary = j.vocabulary;
  /* 同样在 score 内换名的（AI 直接把 vocabulary 写成 vocab/lexical） */
  if(j.score.vocab != null && j.score.vocabulary == null) j.score.vocabulary = j.score.vocab;
  if(j.score.lexical != null && j.score.vocabulary == null) j.score.vocabulary = j.score.lexical;
  if(j.vocabulary_basis != null && j.score.vocabulary_basis == null) j.score.vocabulary_basis = j.vocabulary_basis;
  if(j.lexical_basis != null && j.score.vocabulary_basis == null) j.score.vocabulary_basis = j.lexical_basis;
  if(j.vocab_basis != null && j.score.vocabulary_basis == null) j.score.vocabulary_basis = j.vocab_basis;
  /* 10/3 补齐缺失的另一半：grammar 同理（AI 也可能只返 vocabulary 漏 grammar） */
  if(j.grammar_basis != null && j.score.grammar_basis == null) j.score.grammar_basis = j.grammar_basis;
  /* 10/3 分数区间钳制：IELTS band 只有 4~8、0.5 步长；AI 偶发越界值（实测见过 12）。
     越界值**钳到最近合法档**而不是丢弃 —— 丢弃会退回「—」，钳制至少给出可解释的分。 */
  const clampBand = v => {
    if(v == null) return null;
    const x = parseFloat(v);
    if(isNaN(x)) return null;
    const c = Math.max(4, Math.min(8, x));
    return Math.round(c * 2) / 2;      // 对齐 0.5 步长
  };
  ['grammar', 'vocabulary'].forEach(k => {
    if(j.score[k] != null) j.score[k] = clampBand(j.score[k]);
  });
  // 错误数组：grammar_errors → errors；字段 corrected→fix、explanation→issue
  if(Array.isArray(j.grammar_errors) && j.errors == null) j.errors = j.grammar_errors;
  if(Array.isArray(j.errors)){
    j.errors = j.errors.map(e => {
      if(e && typeof e === 'object'){
        return {
          original: e.original != null ? String(e.original) : '',
          fix: e.corrected != null ? String(e.corrected) : (e.fix != null ? String(e.fix) : ''),
          issue: e.explanation != null ? String(e.explanation) : (e.issue != null ? String(e.issue) : ''),
          type: e.type != null ? String(e.type) : ''
        };
      }
      return e; // 字符串型交给 normalizeErrors 处理
    });
  }
  // 建议：suggestions → rewrite（渲染层作为"改进建议"显示）
  if(j.suggestions != null && j.rewrite == null) j.rewrite = j.suggestions;
  // 9/15：improved（更通顺地道的改进版）→ rewrite，与旧字段共用渲染；improved 优先
  if(j.improved != null && String(j.improved).trim()) j.rewrite = String(j.improved).trim();
  // 发音由前端用设置值接管：删掉 pronunciation（顶层或 score 内），避免与设置值混淆
  if(j.score && j.score.pronunciation != null) delete j.score.pronunciation;
  if(j.pronunciation != null) delete j.pronunciation;
  return j;
}

function findObviousGrammarIssue(text){
  const raw = String(text || '').trim();
  const rules = [
    { re: /\bi\s+(?:never|always|often|sometimes|usually|just|already|also|still)\s+[a-z]+ing\b/i,
      msg: '进行时缺 be 动词（如 I never creating → I am never creating）' },
    { re: /\bi\s+(?:just|also|always|never|still)\s+it\s*is\b/i, msg: '句子缺谓语动词' },
    { re: /\b(?:i|we|they|he|she)\s+it'?s\b/i, msg: '主语后直接跟 it\'s，缺谓语' },
    { re: /\bi\s+would\s+say\s*$/i, msg: 'I would say 后面话没说完，成分残缺' },
    { re: /\b(?:in the past|last year|last month|last week|yesterday|when i was young)\b[\s\S]*?\b(?:i|you|we|they|he|she)\s+(?:prefer|like|love|hate|want|need|go|do|have|watch|listen|play|eat|read)\b/i,
      msg: '过去时间状语配了现在时动词，时态不一致' },
    { re: /\babout\s+[A-Z][a-z]+\b/, msg: 'about 后接了大写开头的词，疑似词性误用（应为动词/动名词）' },
    { re: /\bfeel\s+\w+(?:\s+\w+)?\s+and\s+\w+\s+down\b/i, msg: 'feel … and … 结构疑似成分残缺' },
    { re: /\b(?:i|you|we|they|he|she)\s+\w+(?:\s+\w+){1,5}\s+is\s+\w+\b/i, msg: '主谓之间多了 is，疑似中文式双谓语结构' }
  ];
  for(const r of rules){
    const m = raw.match(r.re);
    if(m) return { msg: r.msg, hit: m[0] };
  }
  return null;
}
function hasObviousGrammarIssues(text){
  return !!findObviousGrammarIssue(text);
}

function inlineErrorsHtml(errs){
  if(!errs.length) return '<div class="diag-ok">没发现明显错误，继续保持～</div>';
  const isPlaceholderFix = t => /^[\s\/\-–—|,.;!?、；。]*$/.test(String(t || ''));
  return '<div class="diag-inline-list">' + errs.map((e, i) => {
    const issue = String(e.issue || '').trim();
    return (i > 0 ? '<span class="diag-sep">·</span>' : '')
      + '<span class="diag-inline-item">'
      + '<s class="diag-wrong">' + escapeHtml(e.original || '') + '</s>'
      + (isPlaceholderFix(e.fix) ? '' : '<span class="diag-right">' + escapeHtml(e.fix || '') + '</span>')
      + (issue ? '<span class="diag-inline-note">' + escapeHtml(issue) + '</span>' : '')
      + '</span>';
  }).join('') + '</div>';
}

function diagScoreHtml(j){
  if(!j || !j.score) return '';
  if(!j.score.grammar_basis && !j.score.vocabulary_basis) return '';
  const sc = parseScore(j.score);
  if(!sc || (sc.grammar == null && sc.vocabulary == null)) return '';
  /* 10/3：AI 偶尔漏给某一维（实测「只返 grammar + grammar_basis」→ 词汇显示「—」，
     她 21:04 报「有的时候词汇的分评不出来」）。原来一律打「—」，看不出是「没评」还是「评了0」。
     改法：缺的那一维**明说原因**「这次 AI 没给出词汇分（可重试）」，与「待录音」区分开。 */
  const item = (v, lab, tail) => {
    const missing = (v == null && tail !== '（待录音）');
    const shown = (v == null && !missing) ? '—' : (v == null ? '未给分' : scoreLabel(v));
    const cls = 'diag-score-item' + (tail === '（待录音）' ? ' pending' : '') + (missing ? ' missing' : '');
    return '<div class="' + cls + '">'
      + '<span class="diag-score-num">' + shown + '</span>'
      + '<span class="diag-score-lab">' + lab + (tail || '') + (missing ? ' · AI 未给出' : '') + '</span></div>';
  };
  // 9/22：流利度/发音取设置里她自填的固定分——填了就显示数字并标「自填」，没填才「待录音」
  const fSelf = (sc.fluency != null), pSelf = (sc.pronunciation != null);
  let h = '<div class="diag-sec"><b>官方标准评分</b><div class="diag-score">';
  h += item(sc.grammar, '语法');
  h += item(sc.vocabulary, '词汇');
  h += item(fSelf ? sc.fluency : null, '流利度', fSelf ? '（自填）' : '（待录音）');
  h += item(pSelf ? sc.pronunciation : null, '发音', pSelf ? '（自填）' : '（待录音）');
  h += '</div>';
  const b = sc.basis || {};
  if(b.grammar || b.vocabulary){
    h += '<div class="diag-score-basis">';
    if(b.grammar) h += '<div><b>语法</b>：' + escapeHtml(b.grammar) + '</div>';
    if(b.vocabulary) h += '<div><b>词汇</b>：' + escapeHtml(b.vocabulary) + '</div>';
    h += '</div>';
  }
  const noVocab = (sc.vocabulary == null), noGram = (sc.grammar == null);
  h += '<div class="diag-note">分数按 IELTS 官方 band 描述正向匹配给出（有错不等于低分，意思清楚就是 6 分档）。流利度与发音要听录音才评得准，纯文本评不了，所以这两项不给分。'
    + ((noVocab || noGram) ? '<br><b>标「未给分」的那一项是AI 这次漏给了</b>（模型偶发），可以重新评一次；它不计入总分。' : '')
    + '</div>';
  h += '</div>';
  return h;
}

function highlightRewriteHtml(rewrite, errs){
  const text = String(rewrite || '');
  if(!text) return '';
  const cands = [];
  (cleanErrors(errs) || []).forEach(e => {
    String(e.fix || '').split('/').forEach(part => {
      const t = String(part || '').trim();
      if(t && !/^[\s\-–—|,.;!?、；。]*$/.test(t)) cands.push(t);
    });
  });
  if(!cands.length) return escapeHtml(text);
  const low = text.toLowerCase();
  cands.sort((a, b) => b.length - a.length);
  const ranges = [];
  cands.forEach(c => {
    const cl = c.toLowerCase();
    let from = 0, idx;
    while((idx = low.indexOf(cl, from)) !== -1){
      const before = idx > 0 ? text[idx - 1] : ' ';
      const end = idx + c.length;
      const after = end < text.length ? text[end] : ' ';
      const okEdge = !/[A-Za-z]/.test(before) && !/[A-Za-z]/.test(after);
      const overlap = ranges.some(r => idx < r[1] && end > r[0]);
      if(okEdge && !overlap) ranges.push([idx, end]);
      from = idx + Math.max(1, c.length);
    }
  });
  if(!ranges.length) return escapeHtml(text);
  ranges.sort((a, b) => a[0] - b[0]);
  let out = '', pos = 0;
  ranges.forEach(r => {
    out += escapeHtml(text.slice(pos, r[0]));
    out += '<span class="diag-hl">' + escapeHtml(text.slice(r[0], r[1])) + '</span>';
    pos = r[1];
  });
  return out + escapeHtml(text.slice(pos));
}

function renderDiag(el, j, raw, answer){
  normalizeScore(j, answer);
  const scoreHtml = diagScoreHtml(j);
  if(j && Array.isArray(j.errors)){
    const errs = cleanErrors(j.errors);
    let h = '<div class="diag-sec"><b>语法/用词纠错</b>' + diffSentenceHtml(answer, errs) + '</div>';
    if(j.rewrite) h += '<div class="diag-sec"><b>改进版表达</b><div class="diag-rewrite">' + highlightRewriteHtml(j.rewrite, errs) + '</div></div>';
  el.innerHTML = scoreHtml + h;
  } else {
    el.innerHTML = scoreHtml + '<div class="diag-note">（AI 没按格式回，已贴原文）</div><pre>' + escapeHtml(raw || '') + '</pre>';
  }
  el.style.display = 'block';
}

async function generateAIHelper(id, qi){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;

  const li = document.querySelector('.sp-q[data-qi="' + qi + '"]');
  if(!li) return;
  const ta = li.querySelector('.sp-ans[data-qi="' + qi + '"]');
  const resultEl = li.querySelector('.sp-q-result[data-qi="' + qi + '"]');
  const btn = li.querySelector('.sp-ai-helper[data-qi="' + qi + '"]');
  const questionText = (s.questions || [])[+qi] || '';
  if(!questionText){ toast('题目为空'); return; }
  const persona = buildPersonaContext();
  const btnHtml = btn ? btn.innerHTML : '';   // 修：缓存原 SVG 图标，finally 还原（与 diagnoseAnswer 同口径）

  if(btn){ btn.disabled = true; btn.textContent = '生成中…'; }
  if(resultEl){ resultEl.innerHTML = '<div class="diag-note">正在按你的人设生成思路和参考回答…</div>'; resultEl.style.display = 'block'; }

  try{
    const sys = '你是雅思口语陪练。' + spPersonaLine() + '\n'
      + '考生会给你一个 Part 1 问题和考生的个人素材（人设/经历）。\n'
      + '【取材优先级】① 优先用「人设」信息（城市/身份/性格）组织回答；② 人设覆盖不到的细节，用「可参考的小故事」（P2 素材）里的真实经历补；③ 两者都没有时，用最常见的考生生活场景自由发挥，不编造离谱经历。\n'
      + '【铁律：紧扣题目】先判断题目问的核心是什么（What kind of clothes=穿的衣服种类/风格/材质；How often=频率；Where=地点；Why=原因；Do you like=喜欢与否…）。逻辑链第一环、英文第 1 句都必须直接回答这个核心；后面的展开只能围绕这个核心补原因/细节。考生素材只是给理由加细节用的，绝不能把素材里的其他话题（如购物习惯、刷视频、打游戏）变成回答主体，更不能拿它们开头，否则就是答非所问。\n'
      + '请完成两件事：\n'
      + '1. 给一条中文「逻辑链」：只给 4-6 个简短的中文关键词组/短语，用中文横杠"—"串连。每个关键词组最多 6 个汉字，严禁写成完整句子，严禁加"表态：""原因1：""原因2：""细节：""感受："等任何前缀标签，严禁输出"[横杠]"这几个字。逻辑链第一环必须是题目所问的直接答案（如问穿什么衣服，第一环就写衣服类型，如「简单舒服—T恤牛仔裤—…」），严禁用别的行为（如「喜欢买衣服」）开头。\n'
      + '正确示例（题目：Is this city your permanent residence?）：杭州人—出生成长—家人朋友都在—杭州读大学—生活方便—熟悉每条街—归属感\n'
      + '错误示例（必须避免）：表态：是的，这里是…—原因1：我在这里出生…—原因2：我在杭州读大学…—细节：我熟悉…—感受：虽然…\n'
      + '逻辑链是给你自己提示思路的，不是写出来念给考官的，越短越好。\n'
      + '2. 按题目类型生成英文参考回答，一共 2-3 句，不要多：\n'
      + '   - 如果题目是一般疑问句（以 Do / Does / Are / Can / Have / Did / Would 等开头），第 1 句才用 Yes, I do. / No, not really. / Definitely. / To be honest, ... 这类表态开头。\n'
      + '   - 如果题目是特殊疑问句（以 What / Where / When / Why / Who / How long / How often / How many 等开头），**不要回答 Yes/No**，第 1 句直接给出事实答案（如 "I\'ve lived here for about 18 years." / "It\'s usually in the evening."），不要绕弯子。\n'
      + '   - 剩下的 1-2 句给原因或自然展开，把考生人设细节（身份/城市/爱好等）自然揉进回答，像真人聊天；但展开必须扣回题目核心，不能讲成另一个话题。\n'
      + '   - 答非所问反例（题目：What kind of clothes do you like to wear?）：把回答写成 "I\'m really into shopping, so I often buy new clothes when I watch short videos."——这是购物习惯，不是穿衣偏好，严禁这样写。正例："I usually wear simple and comfortable clothes, like T-shirts and jeans. I\'m a computer science student, so I sit in front of the computer a lot, and soft clothes help me relax."\n'
      + '「稍高级」示例（整段最多 1-2 处，仍须是高中常见词/句型）：可加一个 because/when 从句或 who/which 定语从句（如 the doctor who gave me medicine / a book which helps me relax）；可用 to be honest / actually / I\'d say 过渡。\n'
      /* 10/2 她刷到的高频题型框架（DPF/DWC/DCF/OREO）——只当「结构骨架」用，**不生成整段模板给她背**。
         考场上她不会去看框架名，所以框架名严禁出现在输出里；只用它决定回答先铺什么后铺什么。 */
      + '【题型骨架：先判题型，再按对应骨架组织（严禁把骨架字母或名称写进输出）】\n'
      + '- 喜好类（do you like / prefer A or B / favorite / what kind of）：先直答（用同义替换，别只说 yes/no）→ 补一个贴合人设的理由或细节 → 可补感受/频率/从什么时候起。\n'
      + '- 频率与习惯类（how often / how many times）：**必须短答**，第一句直接给频率（如 almost every day / three times a week），后面最多补1 句原因或场合就收，**严禁展开成3 句**——把空间留给后面的 why 类追问。\n'
      + '- 童年与过去类（did you…when you were a child / have you ever）：用过去式直答→ 补 5W1H 细节（和谁 / 在哪 / 什么时候 / 为什么）→ 说一句现在变了没有（but now I don\'t…as much as I used to）。\n'
      + '- 事实与背景类（when / where / who / what）：直接给事实答案，再按上面相应骨架补 1-2 句即可。\n'
      + '- 未来打算与愿望类（would you like to… / do you want to be）：表态（yes I\'d love to / no not really）→ 补条件（if I have a chance / if I have enough money）→ 补一句感受（it sounds amazing / it would be unforgettable）。\n'
      + '- 细节描述与感受类（what is…like / how do you feel about）：先给观点或感受 → 补原因（because…）→ 补一个具体例子或场景（for example / such as / like when I…）→ 可选收尾。\n'
      + '【直答句的同义替换：第 1 句别用裸yes/no，也别用裸 I like，按下表换说法】\n'
      + '- yes → Absolutely. / Definitely. / Yes, definitely. / I\'d say so.\n'
      + '- no → Not really. / Definitely not. / I don\'t think so. / Not at all.\n'
      + '- I like it → I\'m really into it. / I\'m a big fan of it. / I\'m quite fond of it.\n'
      + '- I don\'t like it → I\'m not that into it. / It\'s not really my thing. / I\'m not a big fan of it.\n'
      + '- good → enjoyable. / lovely. / great.\n'
      + '【频率四档：判到 how often 时只从这四档里挑一档，别自造】\n'
      + '- 高频：almost every day. / It\'s part of my daily routine.\n'
      + '- 中频：from time to time. / I do it three times a week.\n'
      + '- 低频：I rarely do it. / once in a blue moon.\n'
      + '- 零频：I never do it. / It\'s not my thing.\n'
      /* 框架表结束。以下为考生自己填的「想法」——她懒得多填、只在有思路时填一句，此时以她的想法为准。 */
      + '【考生填了「想法」时的处理规则（最高优先级，压倒上面所有骨架与替换表）】\n'
      + '如果题目后面附了「考生想法」，说明考生已经有思路、只是不知道怎么用英文表达。此时：\n'
      + '  a. **必须严格按考生的想法组织回答，不得另起炉灶、不得改成你自己的思路**；考生想法里没有的信息不要自己编。\n'
      + '  b. 想法是中文或中英混杂的，直接翻成地道自然的高中词汇英文；考生写了英文的，沿用原词不必改。\n'
      + '  c. 想法里没写全的部分（只写了「想说我很喜欢跑步」这种），允许按上面骨架补一两句把它说完整，但**不得偏离考生想表达的意思**。\n'
      + '  d. 中文逻辑链的第一环必须直接对应考生想法的核心，不要换成别的说法。\n'
      + '如果考生想法为空（没填），就完全按上面【题型骨架】自己组织。\n'
      + '【词汇难度红线】整段回答里每个词都必须是高中（含初中）学过的常见词；拿不准算不算超纲，就换成更简单的词。宁可朴素，绝不炫技。\n'
      + '要求：不要写复杂长句；参考回答不要超过 3 句；只使用素材里有的信息，不编造；输出严格 JSON：{"logicChain":"中文逻辑链","answer":"英文参考回答"}，不要任何解释文字。';
    /* 10/2：读同题「想法」选填框（她在这一题有思路时填一句中文/碎片英文）。空 = AI 自己全想。 */
    const ideaEl = li.querySelector('.sp-idea[data-qi="' + qi + '"]');
    const idea = ideaEl ? String(ideaEl.value || '').trim() : '';
    const content = await callRelay('speaking_aihelper', [
      { role:'system', content: sys },
      { role:'user', content:'P1 题目：' + questionText
        + (idea ? '\n\n考生想法（考生自己填的，可能不完整，请严格按此组织回答）：' + idea : '')
        + '\n\n考生个人素材：\n' + (persona || '（暂无素材，请用通用回答）') }
    ], 0.7);
    const j = aiJson(content);
    if(j && (j.answer || j.logicChain)){
      s.answers = s.answers || {};
      s.answers[qi] = s.answers[qi] || {};
      s.answers[qi].aiHelper = { answer: j.answer || '', logicChain: j.logicChain || '', idea: idea, ts: Date.now(), result: content };
      s.updatedAt = Date.now();
      hubSave();
      if(resultEl) renderAIHelper(resultEl, s.answers[qi].aiHelper);
    } else {
      if(resultEl) resultEl.innerHTML = '<div class="diag-note">AI 这次没按格式回，先把它说的原样贴在这儿：</div><pre>' + escapeHtml(content || '') + '</pre>';
    }
  }catch(e){
    if(resultEl) resultEl.innerHTML = '<div class="diag-note">生成失败：' + escapeHtml(e.message) + '</div>';
  }finally{
    // 修：原用 textContent 写回 '✨ AI 辅助'，把按钮原有的 SVG 图标永久抹成表情文本；
    // 改为还原缓存的 innerHTML，与 diagnoseAnswer / reviewP3Answer 保持一致。
    if(btn){ btn.disabled = false; btn.innerHTML = btnHtml; }
  }
}

// 组装万能素材人设上下文（读 DATA.materials）
function buildPersonaContext(){
  const m = DATA.materials;
  if(!m) return '';
  const parts = [];
  const ansA = (m.answers && m.answers.A) ? String(m.answers.A).trim() : '';
  if(ansA) parts.push('人设（一句话介绍）：' + ansA);
  const p = m.persona;
  if(p){
    if(p.city) parts.push('城市：' + p.city);
    if(p.identity) parts.push('身份：' + p.identity);
    if(Array.isArray(p.values) && p.values.length) parts.push('价值观：' + p.values.join('、'));
    if(Array.isArray(p.traits) && p.traits.length) parts.push('性格：' + p.traits.join('、'));
  }
  const st = (m.materials || [])
    .map(x => (x.storyEn || '').slice(0, 500))
    .filter(Boolean);
  if(st.length) parts.push('可参考的小故事（素材英文，含从句，可直接引用）：\n' + st.join('\n---\n'));
  return parts.join('\n');
}

function renderAIHelper(el, ai){
  if(!el || !ai) return;
  let h = '';
  /* 10/2：她填了「想法」时标一句，让她一眼看出这次 AI 是按她的话答的（框架名绝不显示）。 */
  if(ai.idea) h += '<div class="sp-ref-note">已按你填的想法生成</div>';
  // 英文参考回答：直接展开显示（不再折叠），默认可朗读/可复制
  if(ai.answer){
    h += '<div class="sp-ref-answer open">' + escapeHtml(ai.answer) + '</div>';
  }
  // 逻辑链：浅浅标注在参考英文下方（浅蓝底卡片，不抢眼）
  if(ai.logicChain){
    h += '<div class="sp-logic"><b><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10.5c-.8.7-1 1.5-1 2.5h-6c0-1-.2-1.8-1-2.5A6 6 0 0 1 12 3z"/></svg>逻辑链</b><span class="sp-logic-text">' + escapeHtml(ai.logicChain) + '</span></div>';
  }
  if(!h) h = '<div class="diag-note">（该题暂无 AI 辅助结果）</div>';
  el.innerHTML = h;
  el.style.display = 'block';
}
