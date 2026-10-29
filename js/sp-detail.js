/* === js/sp-detail.js · 口语页 F 区：详情页与保存 ===
 *
 * 10-24 T-009 S-5：从 js/speaking.js 原样搬来，函数体一个字没改。
 * 本文件取自 speaking.js 的 12 段 / 761 行。
 *
 * 内容清单：
 *   addLogicSteps / updateWordCount / appendStoryTools / tdSpeakRate   详情页展示层小工具
 *   openDetail                                                        **515 行**，只换住址绝不拆函数体
 *   spGoPracticeCat / gotoNextTopic / spBackToListWithFeedback         详情页内跳转
 *   saveDetail / deleteSpeaking                                        保存与删除
 *   matLoadStore / matAddDetailBits                                    素材库读写（被 G 区串题调用）
 *
 * 🔴 红线一：只换文件住址，函数体一字未改（T-009 唯一要求）。
 * 🔴 红线二：所有顶层声明一律 var / function —— 软导航用 window.eval 逐文件重跑，
 *   const 只活在那一次 eval 的词法作用域，到隔壁文件里就是 undefined。
 *   （函数体内部的 const/let 不受影响，本文件保留原样。）
 * 🔴 红线三：不带 BOM。
 *
 * 依赖（全局 function，defer 全部执行完才调用，顺序不影响）：
 *   F → A ×4 · F → I ×4 · F → G ×2 · F → J ×2 · F → H ×2 · F → E ×2 · F → K ×1
 *   （有环 F↔E / F↔G / F↔I / F↔J / I↔J / G↔F，不阻塞 —— 全靠 defer 全载完才调用）
 *
 * 加载位置：speaking.html 里排在 sp-diag.js 之后、speaking.js 之前（F 是最顶层的域）。
 */
/* T-017d：串题逻辑在数据里是一整段文本（j.logicChain / j.mappingZh），不是数组。
   设计稿要求编号步骤块 → 这里按句末标点/换行/分号切成若干行，包成 .td-step，
   外层加 .td-plain 让 CSS 走「逐行编号」那条分支。
   切不出 2 行就原样保留一整块 —— 绝不硬拆，免得把一句话拆断。
   纯展示层：只读 DOM 文本再重建，不动任何数据字段。 */
function addLogicSteps(root){
  if(!root) return;
  root.querySelectorAll('.mat-logic').forEach(box => {
    if(box.dataset.tdSteps === '1') return;
    if(box.querySelector('li, .td-step')) { box.dataset.tdSteps = '1'; return; }
    const raw = (box.textContent || '').trim();
    if(!raw) return;
    let parts = raw.split(/\n+/).map(x => x.trim()).filter(Boolean);
    if(parts.length < 2){
      parts = raw.split(/(?<=[。；;！!？?])\s*/).map(x => x.trim()).filter(Boolean);
    }
    if(parts.length < 2) return;   // 一句话就够，不硬拆
    box.classList.add('td-plain');
    box.innerHTML = parts.map(x => '<div class="td-step">' + escapeHtml(x) + '</div>').join('');
    box.dataset.tdSteps = '1';
  });
}

/* T-017d：作答词数。现算，不引依赖。 */
function updateWordCount(){
  const ta = document.getElementById('p2Ans');
  const out = document.getElementById('p2WordCount');
  if(!out) return;
  const t = ta ? String(ta.value || '').trim() : '';
  const n = t ? t.split(/\s+/).filter(Boolean).length : 0;
  out.innerHTML = '已写 <b>' + n + '</b> 词 · 目标 220';
}

/* T-017d：串题原文底部的四枚工具条（设计稿 ⑤）。
   现有渲染已经给了「复制 / 朗读 / 关键词」，这里**只补缺的两枚**：
     · 调整语速 —— 0.7 → 1.0 三档循环，状态挂 el.dataset.tdRate（只影响朗读，不改数据）
     · 看中文对照 —— 折叠显示 mappingZh（串题思路，本来就是给中文看的）；没有就整枚不渲染
   不动任何已有按钮与 id。 */
function appendStoryTools(root, s, j){
  if(!root) return;
  const story = root.querySelector('.mat-story-en');
  if(!story) return;
  if(root.querySelector('.td-story-tools')) return;   // 已经加过
  const bar = document.createElement('div');
  bar.className = 'td-story-tools';

  /* 设计稿 ⑤ 的四枚：朗读全文 / 复制英文 / 调整语速 / 看中文对照。
     前两枚在现有渲染里已经有了（在卡头的 mp-actions 里，id 是 storySpeakBtn / storyCopyBtn），
     但设计稿要求它们落在**原文下方**那条工具条里 → 这里做两枚**转发按钮**，
     点了去点原按钮，朗读/复制的逻辑一行没改、原 id 一个没动。 */
  const mkForward = (id, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'td-tbtn';
    b.id = id;
    b.textContent = label;
    b.addEventListener('click', () => {
      const src = document.getElementById(id === 'tdCopyBtn' ? 'storyCopyBtn' : 'storySpeakBtn');
      if (src) src.click();
      else toast('这版稿子没有可朗读/复制的英文');
    });
    return b;
  };
  bar.appendChild(mkForward('tdSpeakBtn', '▶ 朗读全文'));
  bar.appendChild(mkForward('tdCopyBtn', '📋 复制英文'));

  // 语速：三档循环
  const rates = [0.7, 0.85, 1];
  const rateBtn = document.createElement('button');
  rateBtn.type = 'button';
  rateBtn.className = 'td-tbtn ghost';
  rateBtn.id = 'tdRateBtn';
  const paint = () => {
    const r = Number(root.dataset.tdRate || 0.85);
    rateBtn.textContent = '语速 ' + r.toFixed(2) + '×';
  };
  paint();
  rateBtn.addEventListener('click', () => {
    const cur = Number(root.dataset.tdRate || 0.85);
    const i = rates.indexOf(cur);
    const next = rates[(i + 1 + rates.length) % rates.length];
    root.dataset.tdRate = String(next);
    paint();
    toast('朗读语速 ' + next.toFixed(2) + '×');
  });
  bar.appendChild(rateBtn);

  // 中文对照：有 mappingZh 才出现
  const zh = j && (j.mappingZh || (j.logicChain ? j.logicChain : ''));
  if(zh){
    const zhBtn = document.createElement('button');
    zhBtn.type = 'button';
    zhBtn.className = 'td-tbtn ghost';
    zhBtn.id = 'tdZhBtn';
    zhBtn.textContent = '看中文对照';
    const box = document.createElement('div');
    box.className = 'td-zhbox';
    box.hidden = true;
    box.innerHTML = String(zh).split(/\n+/).filter(Boolean).map(x => '<p>' + escapeHtml(x) + '</p>').join('');
    zhBtn.addEventListener('click', () => {
      box.hidden = !box.hidden;
      zhBtn.textContent = box.hidden ? '看中文对照' : '收起中文';
    });
    bar.appendChild(zhBtn);
    story.insertAdjacentElement('afterend', bar);
    bar.insertAdjacentElement('afterend', box);
    return;
  }
  story.insertAdjacentElement('afterend', bar);
}

/* 朗读时把语速传给 TTS（默认 0.95，与全站一致；用户改过才用他的） */
function tdSpeakRate(){
  const root = document.getElementById('aiResult');
  const v = root ? Number(root.dataset.tdRate || 0) : 0;
  return (v >= 0.5 && v <= 1.5) ? v : 0.95;
}

function openDetail(id){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  __clearP2Timer();   // 修(f)：切话题/重进详情页先停掉上一题残留的 2 分钟倒计时
  curDetailId = id;
  $('#listView').hidden = true;
  $('#detailView').hidden = false;

  const title = s.titleEn || s.title || '';
  /* 10/2（她拍板）：详情头部只留总标题——kicker（SPEAKING·PART x）/ 中文副标 / 标签行 / 平均分行全部删掉
     10-23 T-017d：设计稿把它请回来了一部分 —— 三枚小标签（P2 / 人物 / 高频）+ 23px 标题，
     中文副标留在题头里。标签只渲染**数据里真有的**，没有就不渲染，绝不编。 */
  const __chips = [];
  if(s.type) __chips.push('<span class="td-chip part">' + escapeHtml(s.type) + '</span>');
  if(s.category) __chips.push('<span class="td-chip cat">' + escapeHtml(s.category) + '</span>');
  if(s.frequency) __chips.push('<span class="td-chip freq">' + escapeHtml(s.frequency) + '</span>');
  let html = '<div class="sp-topic-block">'
    + (__chips.length ? '<div class="td-chips">' + __chips.join('') + '</div>' : '')
    + '<div class="sp-detail-title">' + escapeHtml(title) + '</div>'
    + (s.promptZh ? '<div class="sp-detail-zh">' + escapeHtml(s.promptZh) + '</div>' : '')
    + '</div>';

  // P1 问题列表（逐题可点开 + 录 + 诊断）；9/15 之之：删「Part 1 小问题…」说明行
  if(s.type === 'P1' && s.questions && s.questions.length){
    html += '<ol class="sp-q-list">';
    s.questions.forEach((q, i) => { html += questionItemHtml(q, i, s); });
    html += '</ol>';
  }

  // P2 单窗口答题（不分小问题，一次性作答 2 分钟）
  if(s.type === 'P2'){
    // P2 提示卡：题目 + You should say: 子提示统一合并到同一个 sp-prompt 白底黑字块（与官方题卡一致）
    /* T-017d：题目 + You should say 合并成一张卡；四条子提示改编号圆圈列表。
       中文副标已经提到题头卡里了，这里不再重复一遍。 */
    if(s.promptEn || (s.youShouldSay && s.youShouldSay.length)){
      html += '<div class="sp-prompt">';
      if(s.promptEn) html += '<div class="td-ysay-t">题目</div><div style="margin-bottom:12px">' + escapeHtml(s.promptEn) + '</div>';
      if(s.youShouldSay && s.youShouldSay.length){
        html += '<div class="td-ysay-t">You should say</div>'
          + '<div class="sp-ysay-list">'
          + s.youShouldSay.map(b => '<div>' + escapeHtml(b) + '</div>').join('')
          + '</div>';
      }
      html += '</div>';
    }

    /* T-017d：作答卡视觉抬起来（浅品牌底卡头 + 更重阴影），与上面"参考用的"串题卡一眼分开。
       🔴 卡头是新加的装饰层，不承担任何逻辑；下面所有业务 id 原样保留、顺序不变。 */
    html += '<div class="sp-p2-answer">';
    html += '<div class="td-anshead">'
      +   '<span class="ic">✍️</span>'
      +   '<h2>你的作答</h2>'
      +   '<span class="sub">照着上面串题原文讲一遍，或者用自己的话</span>'
      + '</div>';
    html += '<div class="td-ansbody">';
    // design/17 3.3：一句话备注（存 answers.p2.note，防抖 600ms 云同步）
    html += '<input class="pd-input sp-note-input" id="p2Note" placeholder="一句话备注（提醒自己怎么答、用什么例子）" autocomplete="off">';
    html += '<textarea class="sp-ans" id="p2Ans" placeholder="在这里写下你的 Part 2 回答，目标讲满 2 分钟（约 220–260 词）…"></textarea>';
    html += '<div class="sp-q-btns">';
    html += '<button class="sp-diag" id="p2Diag" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:15px;height:15px;flex:none"><path d="M12 2l2.4 5.1 5.6.8-4 4.1 1 5.6-5-2.7-5 2.7 1-5.6-4-4.1 5.6-.8z"/></svg>AI 纠错</button>';
    html += '<button class="sp-ans-clear" id="p2Clear" type="button">清空</button>';
    html += '<button class="sp-timer-btn" id="p2TimerBtn" type="button" title="开始 2 分钟倒计时，逼自己讲满 2 分钟">⏱ 2分钟</button>';
    html += '<span class="sp-timer-display" id="p2TimerDisplay" hidden>02:00</span>';
    // T-017d：词数（现算，不引新依赖；textarea.value.trim().split(/\s+/).length）
    html += '<span class="td-wordcount" id="p2WordCount">已写 <b>0</b> 词 · 目标 220</span>';
    html += '</div>';
    html += '<div class="sp-q-result" id="p2Result"></div>';
    html += '<div class="sp-rec-list" id="p2Records"></div>';
    html += '</div>';
    html += '</div>';
  }

  // P2 串题素材（逻辑 + 原文）：来自 AI 串题方案，自动回填；design/82 起整体收进「更多工具」折叠区
  if(s.type === 'P2'){
    // design/82：折叠分组默认态按数据算（不持久化，每次进详情重算）——
    // 已有串题稿 → 分组 A 默认 open；已有 P3 题 → 分组 B 默认 open；分组 C 永远默认收起
    const __p2a = (s.answers && s.answers.p2) || {};
    const storyHas = !!__p2a.aiStoryLink;
    const p3Has = !!(__p2a.p3 && Array.isArray(__p2a.p3.questions) && __p2a.p3.questions.length);
    const linkLabel = storyHas ? '重新生成串题思路' : 'AI 串题思路';
    /*10/3 B 版（她 21:23 拍板）：「更多工具」灰盒整个拆掉，两个工具做成**并排两张常驻卡**。
       ① 删「句型参考」整组（她说用不上；数据文件 patterns.json 不删，将来想恢复再加回来）
       ② 「AI 串题思路」不再折叠 —— 它是写 P2 时最常用的功能，藏起来最亏
       ③ 「P3 深度追问」不再折叠，提为常驻紫色卡（#p3Area 本来就在详情页容器内，与折叠无关）
       所有业务 id 一律保留：aiStoryLinkBtn / aiResult / p3GenBtn / p3Area / p3List / p3NextWrap / p3NextBtn / p3SaveWrap / p3SaveBtn */
    html += '<div class="sp-tools-wrap" id="p2ToolsWrap">';
    // 卡 A「AI 串题思路」：常驻，不再是 <details>
    html += '<section class="sp-tool-card sp-tool-card-a" id="p2ToolA">';
    html +=   '<div class="sp-tc-head">'
      +     '<span class="sp-tc-ic">🌿</span>'
      +     '<b>AI 串题思路</b>'
      +     '<button class="btn btn-sm" id="aiStoryLinkBtn" type="button">'
      +       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:14px;height:14px;margin-right:5px"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>'
      +       escapeHtml(linkLabel)
      +     '</button>'
      +   '</div>';
    html +=   '<div class="sp-tc-hint">把素材卡改写成这道题能用的版本；点一次重新换一个素材角度。</div>';
    html +=   '<div class="sp-story-head"><span class="sp-story-title">串题素材（逻辑 + 原文）</span></div>';
    html +=   '<div class="sp-ai-result" id="aiResult"></div>';
    html += '</section>';
    // 卡 B「P3 深度追问」：常驻，紫色系（与上方绿色卡区分），逐题追问
    html += '<section class="sp-tool-card sp-tool-card-p3" id="p2ToolB"' + (p3Has ? ' data-has-p3="1"' : '') + '>';
    html +=   '<div class="sp-tc-head">'
      +     '<span class="sp-tc-badge">P3 追问</span>'
      +     '<span class="sp-tc-sub" id="p3Hint">AI 读你刚讲的故事，一题一题追问</span>'
      +     '<button class="btn btn-sm btn-p3" id="p3GenBtn" type="button">开始追问</button>'
      +   '</div>';
    html +=   '<div class="sp-p3-area" id="p3Area" data-p3-state="idle" hidden>';
    html +=     '<div class="sp-p3-list" id="p3List"></div>';
    html +=     '<div class="sp-p3-next" id="p3NextWrap" hidden><button class="btn btn-med" id="p3NextBtn" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:14px;height:14px;vertical-align:-2px;margin-right:5px"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>再追问一题</button></div>';
    html +=     '<div class="sp-p3-save" id="p3SaveWrap" hidden><button class="btn btn-primary" id="p3SaveBtn" type="button">保存本题</button></div>';
    html +=     '<div class="sp-p3-exit" id="p3ExitWrap" hidden>不想再追问了？<button class="btn btn-sm" id="p3ExitBtn" type="button">练下一大题 →</button></div>';
    html +=   '</div>';
    html += '</section>';
    html += '</div>';

    /* 🔴 SPK-BTN-DUP-1（10-29）：页内这对「完成 / 下一大题」整对移除。
       原因（她 20:4x 截图报「两对按钮」）：底部粘条 .td-dock 里已经有一对
       「标为已练 / 下一大题」，且粘条是 position:fixed 常驻 —— 用户往下滚时两对同时可见。
       保留粘条那对（滚到哪都能点，是她点名要的形态），页内这对不再渲染。
       ⚠️ id p2FinishBtn / p2NextBtn 仍要留在 DOM 里：下面的绑定段与 #p2BottomBar 的旧逻辑、
          P3 提示文案都按这两个 id 找节点；这里是**不渲染可见按钮**，但留一对 hidden 占位节点，
          保证 getElementById 永不返回 null（历史上就是因为拿不到节点才出的死按钮）。
       注：真正给用户用的是 #tdDockDone / #tdDockNext，它们的事件在 innerHTML 赋值之后绑（见下）。 */
    html += '<div class="sp-action-row" id="p2ActionRow" hidden>';
    html += '<div class="sp-action-row-right">';
    html += '<button class="btn btn-med" id="p2FinishBtn" type="button">完成</button>';
    html += '<button class="btn btn-primary" id="p2NextBtn" type="button">下一大题 →</button>';
    html += '</div>';
    html += '</div>';

    /* 🔴 SPK-BTN-DUP-1（10-29）：原来这里有两行「给 tdDockDone / tdDockNext 绑 click」的代码，
       但它们**写在 $('#detailBody').innerHTML = html 之前**（那次赋值在本函数第 ~296 行），
       此刻 DOM 里还没有这两个元素 → getElementById 一律返回 null → 两个按钮从上线起就一个监听都没有。
       她报的「标为已练点了没反应」就是这个，不是花瓶样式问题。
       修法：绑定挪到 innerHTML 赋值**之后**的统一绑定段（见下方 P2 动作绑定块），
       并且**不再需要转发**——底部粘条现在是页面上唯一的动作行，直接绑真实逻辑。 */

    // 底部动作栏：next/finish（P3 展示完后出现在最底）—— 保留 id，兼容旧引用
    html += '<div class="sp-bottom-bar" id="p2BottomBar" hidden>';
    html += '<button class="btn btn-med" id="p2FinishBtn2" type="button">完成</button>';
    html += '<button class="btn btn-primary" id="p2NextBtn2" type="button">下一大题 →</button>';
    html += '</div>';

    /* T-017d：底部粘条 —— 滚到哪都够得着「标为已练 / 下一大题」。
       按钮是**新建的兄弟节点**（tdDockDone / tdDockNext），点击时转发给原来的
       p2FinishBtn / p2NextBtn，老按钮与其点击逻辑一行没改。 */
    html += '<div class="td-dock" id="detailDock">'
      +   '<div class="td-dock-in">'
      +     '<span class="hint">这道题还没标熟练度</span>'
      +     '<span class="sp"></span>'
      +     '<button class="btn btn-med" id="tdDockDone" type="button">标为已练</button>'
      +     '<button class="btn btn-primary" id="tdDockNext" type="button">下一大题 →</button>'
      +   '</div>'
      + '</div>';
  }

  // 底部动作区：9/15 之之 — P1 删除「保存/删除此题/下一个话题」三按钮（草稿自动落库，无需保存）；
  // P2 的动作已合并到上方 AI 串题思路同一行，此处仅 P2 占位
  html += '<div class="sp-detail-actions">';
  html += '</div>';

  $('#detailBody').innerHTML = html;
  /* T-017d：设计稿的区块顺序是「题头 → 串题素材（主角）→ 你的作答 → P3 追问」，
     而原代码是「作答 → 串题 → P3」。这里只调 DOM 顺序，不重排任何生成逻辑、不动任何 id：
     把作答卡挪到串题卡后面，再把 P3 条挪到作答卡后面。 */
  if(s.type === 'P2'){
    const __wrap = $('#p2ToolsWrap'), __ans = document.querySelector('#detailBody .sp-p2-answer'), __p3 = $('#p2ToolB');
    if(__wrap && __ans && __p3 && __wrap.parentNode){
      __wrap.insertAdjacentElement('afterend', __ans);
      __ans.insertAdjacentElement('afterend', __p3);
    }
  }
  addLogicSteps($('#aiResult'));   // T-017d：串题逻辑整段 → 编号步骤块（纯展示层）
  appendStoryTools($('#aiResult'), s, null);   // T-017d：工具条补「语速 / 中文对照」
  updateWordCount();               // T-017d：词数初值
  spAutoGrowAll();   // 9/15：已存草稿的输入框初始渲染即按内容增高

  // 绑定事件（9/15 之之：P1 保存/删除/下一话题三按钮已删，草稿输入即自动落库）
  if(s.type === 'P2'){
    // 9/22 之之：完成 = 回题库列表 + 明确反馈（toast/定位/高亮，spBackToListWithFeedback）；
    // 下一大题 = 按当前筛选列表顺序直接进下一题（gotoNextTopic 同 Part 内轮转）
    const fin = $('#p2FinishBtn');
    if(fin) fin.addEventListener('click', () => spBackToListWithFeedback(curDetailId));
    const nx = $('#p2NextBtn');
    if(nx) nx.addEventListener('click', () => gotoNextTopic());
    // 底部动作栏的「完成/下一大题」复用同一逻辑
    const fin2 = $('#p2FinishBtn2');
    if(fin2) fin2.addEventListener('click', () => spBackToListWithFeedback(curDetailId));
    const nx2 = $('#p2NextBtn2');
    if(nx2) nx2.addEventListener('click', () => gotoNextTopic());

    /* 🔴 SPK-BTN-DUP-1（10-29）：底部粘条 .td-dock 的两个按钮——**页面上唯一给用户点的那一对**。
       原来它们的绑定写在本函数上面（innerHTML 赋值之前），那时节点还不存在 → 永久死按钮，
       她点的「标为已练」「下一大题」都没反应。现在挪到这里（innerHTML 已赋值、节点已就位），
       直接绑真实逻辑，不再走「转发给 p2FinishBtn」那一层（转发目标自己也是死的）。
       「标为已练」= 完成本题并回列表（与「完成」同一语义：草稿自动落库 + toast + 定位回卡片）。 */
    const tdDone = document.getElementById('tdDockDone');
    if(tdDone) tdDone.addEventListener('click', () => spBackToListWithFeedback(curDetailId));
    const tdNext = document.getElementById('tdDockNext');
    if(tdNext) tdNext.addEventListener('click', () => gotoNextTopic());
  }
  if(s.type === 'P2'){
    /* 10/3 B 版（她 21:23 拍板）：「更多工具」灰盒拆掉，两个工具改成**并排常驻卡**（<section> 不是 <details>），
       「句型参考」整组删除（data/patterns.json 数据文件保留，将来想恢复再加回来）。
       —— 所以下面不再需要 toolA.open / toolB.open 的「展开分组」兜底，只保留「结果自动滚到可见」。 */
    const aiStoryLinkBtn = document.getElementById('aiStoryLinkBtn');
    if(aiStoryLinkBtn) aiStoryLinkBtn.addEventListener('click', () => { aiStoryLink(id); });
    // 串题结果渲染出内容（成稿 / 无 Key 引导 / 无素材引导 / 失败提示）→ 自动滚到可见（卡常驻，不存在"还收着"的情况）
    const aiRes = document.getElementById('aiResult');
    if(aiRes){
      let __lastChildN = 0;
      new MutationObserver(() => {
        if(!aiRes.childNodes.length) return;
        if(aiRes.childNodes.length !== __lastChildN){
          __lastChildN = aiRes.childNodes.length;
          aiRes.scrollIntoView({ behavior:'smooth', block:'nearest' });
        }
      }).observe(aiRes, { childList: true });
    }
    // 新 P3 题 / 引导卡渲染进 #p3List → 自动滚到 P3 区
    const p3AreaEl = document.getElementById('p3Area');
    const p3ListEl = document.getElementById('p3List');
    if(p3AreaEl && p3ListEl){
      new MutationObserver(() => {
        if(!p3ListEl.childNodes.length) return;
        p3AreaEl.scrollIntoView({ behavior:'smooth', block:'nearest' });
      }).observe(p3ListEl, { childList: true });
    }
    /* 10/3 B 版：P3 卡底部「不想再追问了？→ 练下一大题」出口（她 21:26 拍板要的第二个动作） */
    const p3ExitBtn = document.getElementById('p3ExitBtn');
    if(p3ExitBtn) p3ExitBtn.addEventListener('click', () => { gotoNextTopic(); });
    // 备注框防抖保存（600ms → hubSave）
    const note = document.getElementById('p2Note');
    if(note){
      let __nt = null;
      note.addEventListener('input', () => {
        clearTimeout(__nt);
        __nt = setTimeout(() => {
          s.answers = s.answers || {};
          s.answers.p2 = s.answers.p2 || {};
          s.answers.p2.note = note.value.trim();
          s.answers.p2.noteTs = Date.now();
          hubSave();
        }, 600);
      });
    }
  }

  // 逐题展开 + 语音 + AI 诊断 事件绑定（含 localStorage 回填）
  bindQuestionEvents(id);

  // 26 · P1 问答流：一题一卡 + 进度 + 步进（只影响 P1 详情显示，不动数据）
  if(s.type === 'P1') p1FlowInit(s);

  // P2 单窗口事件绑定（仅手写 + AI 纠错 + 提交记录；无录音）
  if(s.type === 'P2'){
    const p2Diag = document.getElementById('p2Diag');
    if(p2Diag) p2Diag.addEventListener('click', e => { e.stopPropagation(); diagnoseP2(id); });
    // 9/13 修：P2 大答案框同样输入即存草稿（原只能靠点「保存」或 AI 诊断）
    const p2AnsEl = document.getElementById('p2Ans');
    if(p2AnsEl) p2AnsEl.addEventListener('input', () => {
      spDraftSave(id, 'p2', p2AnsEl.value);
      updateWordCount();   // T-017d：词数随输入实时变
    });
    // 9/22 之之：回车即 AI 纠错（Shift+Enter 换行；纠错中按钮 disabled 天然防连击）
    bindEnterSubmit(p2AnsEl, p2Diag);
    const p2Clear = document.getElementById('p2Clear');
    if(p2Clear) p2Clear.addEventListener('click', e => {
      e.stopPropagation();
      const ta = $('#p2Ans');
      if(ta){ ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true })); }   // 9/13：同上，清空即落库
      const res = $('#p2Result'); if(res){ res.innerHTML = ''; res.style.display = 'none'; }
      // 仅清空当前编辑框与诊断结果，不删历史提交记录
    });

    // P2 倒计时按钮：点一下开始 2 分钟倒计时，到 0 停；再点重置重来
    const p2TimerBtn = document.getElementById('p2TimerBtn');
    const p2TimerDisp = document.getElementById('p2TimerDisplay');
    if(p2TimerBtn && p2TimerDisp){
      const TOTAL = 120; // 2 分钟
      const fmt = s => { const m = Math.floor(s / 60), sec = s % 60; return String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0'); };
      p2TimerBtn.addEventListener('click', e => {
        e.stopPropagation();
        // 9/16 修：按钮文案写的是「停止」，原来再点却是从 02:00 重来——文案与行为对不上。
        // 现在：正在跑 → 真的停（收起计时显示、按钮回到「⏱ 2分钟」）；没在跑 → 重新开始。
        if(window.__p2TimerId){
          __clearP2Timer();
          p2TimerDisp.hidden = true;
          p2TimerDisp.classList.remove('sp-timer-end');
          p2TimerBtn.textContent = '⏱ 2分钟';
          p2TimerBtn.classList.remove('sp-timer-running');
          return;
        }
        __clearP2Timer();   // 修(f)：改用可跨页清理的句柄，原 p2TimerBtn._timer 随节点丢弃后无人清理
        let left = TOTAL;
        p2TimerDisp.hidden = false;
        p2TimerDisp.textContent = fmt(left);
        p2TimerDisp.classList.remove('sp-timer-end');
        p2TimerBtn.textContent = '⏱ 停止';
        p2TimerBtn.classList.add('sp-timer-running');
        // 自动聚焦输入框，方便语音输入转文字
        const ta = $('#p2Ans'); if(ta) ta.focus();
        window.__p2TimerId = setInterval(() => {
          // 修(f)：详情页被重建（切话题/完成）或软导航离开口语页后，这两个节点会脱离文档。
          // 检测到脱离就立刻自停，避免心跳在别的页面继续跑、2 分钟后弹出无关的「⏰ 2 分钟到」。
          if(!p2TimerDisp.isConnected){ __clearP2Timer(); return; }
          left--;
          if(left <= 0){
            __clearP2Timer();
            p2TimerDisp.textContent = '00:00';
            p2TimerDisp.classList.add('sp-timer-end');
            p2TimerBtn.textContent = '⏱ 2分钟';
            p2TimerBtn.classList.remove('sp-timer-running');
            toast('⏰ 2 分钟到！讲满啦');
            return;
          }
          p2TimerDisp.textContent = fmt(left);
        }, 1000);
      });
    }

    // P3 逐题追问：先出第 1 题，考生答完后点「下一道追问」基于上一题回答继续出题
    const MAX_P3 = 3;
    function getP2TextForP3(){
      const ta = $('#p2Ans');
      return (ta && ta.value.trim()) || (s.answers && s.answers.p2 && s.answers.p2.text) || '';
    }
    function ensureP3(){
      s.answers = s.answers || {}; s.answers.p2 = s.answers.p2 || {};
      s.answers.p2.p3 = s.answers.p2.p3 || {};
      if(!Array.isArray(s.answers.p2.p3.questions)) s.answers.p2.p3.questions = [];
      if(!Array.isArray(s.answers.p2.p3.answers)) s.answers.p2.p3.answers = [];
      if(!Array.isArray(s.answers.p2.p3.aiHelper)) s.answers.p2.p3.aiHelper = [];
      return s.answers.p2.p3;
    }
    function showP3Area(){
      const area = $('#p3Area'); if(area){ area.hidden = false; area.dataset.p3State = 'generated'; }
      const saveWrap = $('#p3SaveWrap'); if(saveWrap) saveWrap.hidden = false;
      const bottom = $('#p2BottomBar'); if(bottom) bottom.hidden = false;
      /* 10/3 B 版：底部「练下一大题」出口（她 21:26 拍板：「也可以选择直接练下一题」）。
         每出一题都常驻可见 —— 答完当前题后两个出口并排：再追问一题 / 练下一大题。 */
      const exitWrap = $('#p3ExitWrap'); if(exitWrap) exitWrap.hidden = false;
      // 已生成过题：按钮变「重新生成 P3」，提示可重出
      const genBtn = $('#p3GenBtn');
      if(genBtn && area && area.dataset.p3State === 'generated'){
        genBtn.textContent = '重新生成';
      }
      // 顶栏提示更新为「已答 N 题」（她要能知道 AI 准备了几个、还剩几个）
      /* ⚠️ p3.questions / p3.answers 的真实格式是【字符串数组】（见保存处 answers.push(ta.value)），
         这里必须按字符串读；早先误按对象 a.text / q.q 统计，真实数据下恒为 0，提示永远退回默认文案。 */
      const hint = $('#p3Hint');
      if(hint){
        const p3 = ensureP3();
        const txtOf = v => (typeof v === 'string' ? v : (v && (v.text || v.q)) ) || '';
        const answered = p3.answers.filter(a => String(txtOf(a)).trim()).length;
        const total = p3.questions.filter(q => String(txtOf(q)).trim()).length;
        hint.textContent = answered
          ? ('已答 ' + answered + ' 题' + (total > answered ? '，这次共 ' + total + ' 题' : ''))
          : 'AI 读你刚讲的故事，一题一题追问';
      }
    }
    function updateP3NextBtn(){
      const p3 = ensureP3();
      const wrap = $('#p3NextWrap');
      if(wrap) wrap.hidden = (p3.questions.length >= MAX_P3);
    }
    async function genP3Step(step, prevQ, prevA){
      const p2Text = getP2TextForP3();
      const q = await window.MockGenP3.genNext(s, p2Text, step, prevQ, prevA);
      const p3 = ensureP3();
      p3.questions[step] = q;
      renderP3Step(s, $('#p3List'), step);
      updateP3NextBtn();
      showP3Area();
      hubSave();
    }
    async function genP3StepSafe(step, prevQ, prevA, btn, orig){
      if(btn){ btn.disabled = true; btn.textContent = '⏳ 生成中…'; }
      try{
        await genP3Step(step, prevQ, prevA);
      }catch(err){
        toast('P3 生成失败：' + err.message + '（已尝试兜底）');
        try{
          const q = window.MockGenP3.presetNext(step);
          const p3 = ensureP3();
          p3.questions[step] = q;
          renderP3Step(s, $('#p3List'), step);
          updateP3NextBtn();
          showP3Area();
          hubSave();
        }catch(_){}
      }finally{
        if(btn){ btn.disabled = false; if(orig) btn.innerHTML = orig; }
      }
    }

    const p3GenBtn = document.getElementById('p3GenBtn');
    if(p3GenBtn) p3GenBtn.addEventListener('click', e => {
      e.stopPropagation();
      // design/82：点按钮即展开分组 B（首次生成 / 内联二次确认 / 重新生成都适用）
      const toolB2 = document.getElementById('p2ToolB'); if(toolB2) toolB2.open = true;
      const p2Text = getP2TextForP3();
      if(!p2Text){ toast('请先在 P2 答题框写点东西，再生成 P3 追问'); return; }
      const p3 = ensureP3();
      // 已有题：内联两步确认（design/81，替代原生 confirm）——第一次点变「再点一次确认清空」，
      // 3 秒内未再点自动还原；第二次点才真正清空重出。点「取消」或超时零数据变化。
      if(p3.questions.length && !p3GenBtn.dataset.confirming){
        const orig = p3GenBtn.innerHTML;
        clearTimeout(p3GenBtn._confirmT);
        p3GenBtn.dataset.confirming = '1';
        p3GenBtn.classList.add('confirming');
        p3GenBtn.innerHTML = '<span class="sp-confirm-txt">再点一次确认清空</span>';
        const cancel = document.createElement('button');
        cancel.className = 'btn btn-sm sp-confirm-cancel';
        cancel.type = 'button';
        cancel.textContent = '取消';
        cancel.addEventListener('click', ev => {
          ev.stopPropagation();
          clearTimeout(p3GenBtn._confirmT);
          p3GenBtn.innerHTML = orig;
          delete p3GenBtn.dataset.confirming;
          p3GenBtn.classList.remove('confirming');
          if(cancel.parentNode) cancel.parentNode.removeChild(cancel);
        });
        p3GenBtn.parentNode.insertBefore(cancel, p3GenBtn.nextSibling);
        p3GenBtn._confirmT = setTimeout(() => {
          if(cancel.parentNode) cancel.parentNode.removeChild(cancel);
          p3GenBtn.innerHTML = orig;
          delete p3GenBtn.dataset.confirming;
          p3GenBtn.classList.remove('confirming');
        }, 3000);
        return;
      }
      // 第二次点击（确认）或首次无旧题：清理确认态后走原有生成流程
      if(p3GenBtn.dataset.confirming){
        clearTimeout(p3GenBtn._confirmT);
        delete p3GenBtn.dataset.confirming;
        p3GenBtn.classList.remove('confirming');
        const cc = p3GenBtn.parentNode && p3GenBtn.parentNode.querySelector('.sp-confirm-cancel');
        if(cc) cc.parentNode.removeChild(cc);
      }
      if(p3.questions.length){
        // 清空旧数据，从第 0 题重新出
        p3.questions = []; p3.answers = []; p3.aiHelper = [];
        const list = $('#p3List'); if(list) list.innerHTML = '';
        updateP3NextBtn();
      }
      const orig = p3GenBtn.innerHTML;
      genP3StepSafe(0, null, null, p3GenBtn, orig);
    });

    const p3NextBtn = document.getElementById('p3NextBtn');
    if(p3NextBtn) p3NextBtn.addEventListener('click', e => {
      e.stopPropagation();
      const p3 = ensureP3();
      const step = p3.questions.length;
      if(step >= MAX_P3) return;
      const prevQ = p3.questions[step - 1] || null;
      const prevTa = document.querySelector('#p3List .sp-p3-q[data-i="' + (step - 1) + '"] .sp-p3-textarea');
      const prevA = prevTa ? prevTa.value.trim() : '';
      const orig = p3NextBtn.innerHTML;
      genP3StepSafe(step, prevQ, prevA, p3NextBtn, orig);
    });
    const p3SaveBtn = document.getElementById('p3SaveBtn');
    if(p3SaveBtn) p3SaveBtn.addEventListener('click', e => {
      e.stopPropagation();
      const p3 = s.answers && s.answers.p2 && s.answers.p2.p3;
      if(!p3 || !Array.isArray(p3.questions)){ toast('还没有 P3 题目，先点上面的按钮生成'); return; }
      const answers = [];
      p3.questions.forEach((q, i) => {
        const ta = document.querySelector('#p3List .sp-p3-q[data-i="'+i+'"] .sp-p3-textarea');
        answers.push((ta && ta.value) || '');
      });
      p3.answers = answers;
      p3.tsSave = Date.now();
      s.updatedAt = Date.now();
      hubSave();
      toast('已保存 P3 答案');
    });

    // P2 答案回填
    if(s.answers && s.answers.p2){
      const ta = $('#p2Ans');
      if(ta && s.answers.p2.text) ta.value = s.answers.p2.text;
      const noteEl = $('#p2Note');
      if(noteEl && s.answers.p2.note) noteEl.value = s.answers.p2.note;   // design/17：备注回显
      const res = $('#p2Result');
      if(res && s.answers.p2.result){
        try{
          const j = JSON.parse(s.answers.p2.result);
          if(renderP2Diag(res, j, s.answers.p2.text)){ res.style.display = 'block'; }
          else { throw 0; }
        }catch(_){
          res.innerHTML = '<pre>' + escapeHtml(s.answers.p2.result) + '</pre>';
          res.style.display = 'block';
        }
      }
      // 回填 AI 串题方案（design/87：新结构走 V2 渲染，旧结构在 V2 内部兜底走旧渲染原样保留）
      if(s.answers.p2.aiStoryLink){
        renderStoryLinkV2($('#aiResult'), s.answers.p2.aiStoryLink, s);
        addLogicSteps($('#aiResult'));   // T-017d：回填的稿子同样要切编号块
        appendStoryTools($('#aiResult'), s, s.answers.p2.aiStoryLink);
      }
      /* 回填已生成的 P3 追问列表 + 答案。
         10/3 B 版：统一走 showP3Area()（原先这里手抄了一份显示逻辑，漏掉了「已答 N 题」提示
         和「练下一大题」出口 —— 有存量 P3 数据时这两个不显示，是同一根因）。 */
      if(s.answers.p2.p3 && Array.isArray(s.answers.p2.p3.questions) && s.answers.p2.p3.questions.length){
        renderP3All(s, $('#p3List'));
        updateP3NextBtn();
        showP3Area();
      }
    }
    // design/87 草稿恢复：阶段一已跑（补槽中/成稿前）→ 打开详情即恢复草稿态，不重复调 AI。
    // ⚠️ 不做「开题自动跑 AI」：doc 假设的抽题自动联动在历史版本中从未存在（68027df 起就是按钮触发，
    // 原 1156 行注释只是 matLoadStore 段落壳），且自动触发会破坏 design/82 的干净收起态、每次开新题都烧 token。
    if(s.type === 'P2' && $('#aiResult')){
      const p2now = (s.answers && s.answers.p2) || {};
      if(p2now.linkDraft && p2now.linkDraft.plan){
        renderStoryLinkV2($('#aiResult'), p2now.linkDraft.plan, s);
      }
    }
    // 渲染 P2 提交历史记录
    renderSubmitRecords((s.answers.p2 && s.answers.p2.records) || [], $('#p2Records'), (rec) => {
      const ta = $('#p2Ans'); if(ta && rec.text != null){ ta.value = rec.text; ta.dispatchEvent(new Event('input', { bubbles: true })); }
      const res = $('#p2Result');
      if(res && rec.result){
        try{ const j = JSON.parse(rec.result); if(renderP2Diag(res, j, rec.text)){ res.style.display = 'block'; return; } }catch(_){}
        res.innerHTML = '<pre>' + escapeHtml(rec.result) + '</pre>'; res.style.display = 'block';
      }
    }, (i) => removeSubmitRecord(s, 'p2', i));
  }
}

function spGoPracticeCat(catId){
  // 显隐对齐 PRACTICE tab 逻辑（speaking.js ready 里同款），并展开该类重渲染
  spActivateTab('PRACTICE');
  $('#listView').hidden = true; $('#detailView').hidden = true; $('#mockView').hidden = true; $('#matView').hidden = true;
  // 10/2：coach 接管后，题库详情「去练该类」统一进 AI 陪练（catId 是句型类别，coach 用不上忽略）
  if(window.__COACH_ON){
    $('#sentView').hidden = true; $('#coachView').hidden = false;
    try{ window.__coachShow && window.__coachShow(); }catch(_){}
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  $('#sentView').hidden = false;
  window.__SENT_OPEN = window.__SENT_OPEN || {};
  window.__SENT_OPEN[catId] = true;
  window.__SENT_CUR = null;
  if(typeof sentRender === 'function') sentRender();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* === P1 详情页「下一题」：跳到当前筛选列表里的下一道 P1 话题 ===
   沿用用户刚筛选的条件（curFreq/curCat/curSearch），到末尾循环回第一道，方便连续练。 */
function gotoNextTopic(){
  let list = getFiltered();
  // 9/16 修：「下一题」只在同 Part 内轮（题库 tab 是 P1+P2 合并列表，
  // 原来从 P2 一路点下去迟早会串到 P1 话题上，答 P2 的节奏被打断）
  const cur = DATA.speaking.find(x => x.id === curDetailId);
  if(cur && cur.type){
    const same = list.filter(x => x.type === cur.type);
    if(same.length) list = same;
  }
  if(!list.length) return;
  const idx = list.findIndex(s => s.id === curDetailId);
  if(idx === -1){ openDetail(list[0].id); return; }   // 当前题不在筛选结果里（如刚改了筛选）→ 打开第一条
  const nextIdx = (idx + 1) % list.length;
  openDetail(list[nextIdx].id);
}

/* 「完成」统一出口（9/22 之之：原 P1 流程「完成 ✓」只弹 toast、P2 完成静默切视图，反馈感为零）：
   回题库列表 + 三层反馈——toast 练过题数、列表定位刚练的那张卡、1.5s 高亮闪烁。 */
function spBackToListWithFeedback(id){
  $('#listView').hidden = false;
  $('#detailView').hidden = true;
  renderList();
  try{
    const s = DATA.speaking.find(x => x.id === id);
    let n = 0;
    if(s && s.answers){
      Object.keys(s.answers).forEach(k => {
        const a = s.answers[k];
        if(a && ((a.records && a.records.length) || (a.text && String(a.text).trim()) || a.result)) n++;
      });
    }
    toast(n > 0 ? ('已保存 ✓ 本话题练过 ' + n + ' 题') : '已保存 ✓');
    const card = document.querySelector('.sp-card[data-id="' + id + '"]');
    if(card){
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('sp-card-flash');
      setTimeout(() => card.classList.remove('sp-card-flash'), 1600);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }catch(e){
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function saveDetail(id){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  // P2 单窗口答案回存（仅写 text，不覆盖已存的诊断结果/时长）
  if(s.type === 'P2'){
    const ans = $('#p2Ans');
    if(ans && ans.value.trim()){
      s.answers = s.answers || {};
      s.answers.p2 = s.answers.p2 || {};
      s.answers.p2.text = ans.value.trim();
      s.answers.p2.ts = Date.now();
    }
  } else {
    // 9/13 修：P1 原来点「保存」什么都没存（只有 AI 诊断会写库），toast 却说「已保存」→ 假反馈丢数据。
    // 现在把当前所有小题输入框的值同步写回；只补 text/ts，保留 records 与 result。
    document.querySelectorAll('.sp-ans[data-qi]').forEach(ta => {
      const qi = ta.getAttribute('data-qi');
      const v = (ta.value || '').trim();
      if(!v) return;
      s.answers = s.answers || {};
      s.answers[qi] = { ...(s.answers[qi] || {}), text: v, ts: Date.now() };
    });
  }
  s.updatedAt = Date.now();
  hubSave();
  toast('已保存');
}

/* === 删除口语题（9/23：不再记黑名单，官方题一律可恢复）===
   旧逻辑把被删 id 写进 DATA.deletedIds「墓碑」，换季升级也不复活——她拍板取消：
   题库里的官方题都是要练的范围，不该被永久隐藏（历史结果就是 100 题只显示 99）。
   现在删除只影响当前会话的数组；升级/换设备同步后官方题全量回来（个人答案仍按 id 保留）。 */
function deleteSpeaking(id){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  DATA.speaking = DATA.speaking.filter(x => x.id !== id);
  hubSave();
  $('#detailView').hidden = true;
  $('#listView').hidden = false;
  curDetailId = null;
  renderList();
  toast('已隐藏该口语题（下次题库升级会自动回来）');
}

  /* === 素材生成器联动：P2 抽题命中个人素材 → AI 自动匹配串题方案 === */
function matLoadStore(){
  if(DATA.materials && Array.isArray(DATA.materials.materials)) return DATA.materials;
  try{ const s = JSON.parse(localStorage.getItem('ielts_materials_v1')); if(s && Array.isArray(s.materials)) return s; }catch(_){}
  return null;
}

/* v7.2 细节碎片库：串题时考生自己补的细节 / AI 代补的细节，沉淀进素材库（DATA.materials.detailBits）。
   她背过的每个细节都进池子，之后任何题串题时都注入给 AI 当真实事实用——记一次，处处复用，不浪费记忆。
   按 (en|zh) 文本去重防重复入库；成功返回新增条数。 */
function matAddDetailBits(bits){
  if(!Array.isArray(bits) || !bits.length) return 0;
  const store = matLoadStore();
  if(!store) return 0;
  if(!Array.isArray(store.detailBits)) store.detailBits = [];
  const norm = x => String(x || '').trim().toLowerCase();
  let added = 0;
  bits.forEach(b => {
    if(!b) return;
    const en = String(b.en || '').trim(), zh = String(b.zh || '').trim();
    if(!en && !zh) return;
    if(store.detailBits.some(x => norm(x.en) === norm(en) && norm(x.zh) === norm(zh))) return;
    store.detailBits.push({ id: 'db' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), en, zh, from: b.from || '', ts: Date.now() });
    added++;
  });
  if(added) hubSave();
  return added;
}
