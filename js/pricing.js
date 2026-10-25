/* === 定价数据唯一前端来源（10/12 全站设计改造批1 建立）===
   改价只动这一个文件：VIP_PLANS 改数字 → 全站价格卡 / 锁态按钮 / 额度提示 / 定价页全部自动跟着变。
   🔴 其他任何文件禁止再出现价格字面量（¥19/¥69/¥129）；批3 收编的 3 处 guard 回退字面量除外，
      且那 3 处被 tests/_probe_price_ref_1012.cjs 钉住「加载了 Pricing 时必须来自这里」。
   配套：服务端 functions/api/ai.js 有 7 处文案写死价格（改价 checklist 在该文件 L240 附近注释）。

   档位结构 = 原 js/vip.js L17-21 三档原样搬入（她的商业决定，10/2 拍板：7 天 29→新人 19 / 30 天主推 69 /
   90 天锚 129；年卡已砍——考生需求随考试日消失）。perDay/save 是展示字段，改价记得同步。 */
const VIP_PLANS = [
  { id:'week',    name:'7 天卡',  price:'19',  orig:'39', unit:'7 天',  perDay:'≈ 2.7 元/天', save:'', tag:'新人首购 ¥19' },
  { id:'month',   name:'30 天卡', price:'69',  orig:'',   unit:'30 天', perDay:'≈ 2.3 元/天', save:'', tag:'主推 · 冲刺首选' },
  { id:'quarter', name:'90 天卡', price:'129', orig:'',   unit:'90 天', perDay:'≈ 1.4 元/天', save:'', tag:'' },
];

/* 免费额度口径（与 js/vip.js 原 FREE_AI_DESC、functions/api/ai.js 三处同源）：
   口语模考每月 1 次 · 写作批改每月 3 次 · 串题素材会员专属 · 其他 AI 每周 5 次 · 云同步与导出永久免费 */
const FREE_AI_DESC = '口语模考每月 1 次 · 写作批改每月 3 次 · 其他 AI 每周 5 次（串题素材为会员专属）';

/* 对比矩阵（17 条目 = 原型 会员定价页_ielts.html L446-549 全表逐条搬入）。
   结构：cat 分类 + rows[{label, sub?, free, vip}]。
   free/vip 取值语义（renderMatrix 负责转 DOM）：
     'yes'    = ✓ 完整可用
     'lock'   = 🔒 会员专属
     'text:x' = 直接显示文本 x（如「每月 1 次」「无限次」）
     'dash'   = —（不适用）
   🔴 口径红线（违反=返工）：不得出现「Band」「雅思官方保证」；价格数字一律来自 VIP_PLANS 字段。 */
const VIP_MATRIX = [
  { cat:'学习功能（会员不独占）', rows:[
    { label:'全部学习功能', sub:'单词 · 句子 · 口语题库 · 写作 · 回顾', free:'yes', vip:'yes' },
    { label:'每日清单与备考计划', sub:'手动排 + 手动打勾', free:'yes', vip:'yes' },
    { label:'计时与学习时长统计', sub:'番茄钟、暂停续记、模块归属', free:'yes', vip:'yes' },
    { label:'语料听写 / 长难句', free:'yes', vip:'yes' },
  ]},
  { cat:'AI 能力（这里才是会员的核心）', rows:[
    { label:'口语模考', sub:'AI 出题 + 评分 + 四维报告', free:'text:每月 <b>1</b> 次', vip:'text:<b>无限次</b>' },
    /* W-FREE-4（10-25）：她拍板「作文页免费给所有人用」—— 免费列从 🔒 改「每月 3 次」。
       🔴 这个 3 必须与 functions/api/ai.js 的 AI_FREE_WRITING_TOTAL 默认值一致（那里也是 3）；
          她以后改环境变量，这里要跟着改，否则页面说 3 次实际给别的数。 */
    { label:'写作批改', sub:'四项评分 + 逐句点评', free:'text:每月 <b>3</b> 次', vip:'text:<b>无限次</b>' },
    /* W-FREE-4：模板库已全免费（W-FREE-3 摘锁）→ 免费列与会员列都是绿对勾，不再写「解锁」。 */
    { label:'作文模板库', sub:'全部模板', free:'yes', vip:'yes' },
    { label:'串题素材生成', sub:'P2 一稿串多题 · AI 定制', free:'lock', vip:'text:<b>无限生成</b>' },
    { label:'完整备考计划生成', sub:'AI 排周，落地到每日清单', free:'lock', vip:'yes' },
    { label:'其他 AI 辅助', sub:'翻译 · 长难句解析 · 智能分配 · 口语诊断 · 听写检查', free:'text:每周共享 <b>5</b> 次', vip:'text:<b>无限次</b>' },
  ]},
  { cat:'数据与设备', rows:[
    { label:'多设备云同步', sub:'全部学习数据，不限量、不收费', free:'text:✓ 永久免费', vip:'yes' },
    { label:'学习数据导出', free:'yes', vip:'yes' },
    { label:'会员身份跟账号走', sub:'换设备登录自动生效', free:'dash', vip:'yes' },
  ]},
  { cat:'体验与支持', rows:[
    { label:'新功能抢先体验', free:'dash', vip:'text:<b>会员优先</b>' },
    { label:'专属主题 / 深度专注 / 效率报告', free:'dash', vip:'text:<span class="muted">持续更新中</span>' },
    { label:'额度用完时的提示', sub:'不弹窗、不自动跳页，不打断你手上那题', free:'yes', vip:'yes' },
    { label:'联系站长', sub:'微信直接发，问什么都回', free:'yes', vip:'yes' },
  ]},
];

/* ---------- 取文案（动态拼接用，禁止调用方再写字面量）----------
   week 系列是特殊口径词（她 10/2 拍板的营销措辞）；其他档位直接给「名称 ¥价格」。 */
function priceText(key){
  const p = VIP_PLANS.find(x => x.id === 'week') || VIP_PLANS[0];
  switch(key){
    case 'week':         return '¥' + p.price;                          // ¥19
    case 'weekOrig':     return '¥' + (p.orig || p.price);              // ¥39
    case 'weekFirst':    return '首购 ¥' + p.price + ' 起';              // 首购 ¥19 起
    case 'weekBtn':      return '周卡 ¥' + p.price;                     // 周卡 ¥19
    case 'weekUnlimited':return '周卡首购 ¥' + p.price + ' 立享无限用';   // 周卡首购 ¥19 立享无限用
    case 'month':        return '30 天卡 ¥' + (VIP_PLANS[1] || p).price;
    case 'quarter':      return '90 天卡 ¥' + (VIP_PLANS[2] || p).price;
    default:             return '¥' + p.price;
  }
}
/* 小组件：「首购 ¥19 · 原价 ¥39」（无 orig 时只显示现价）。用于 vip 开通方式等动态文案位。 */
function priceChip(id){
  const p = VIP_PLANS.find(x => x.id === id);
  if(!p) return '';
  return escapeHtml('¥' + p.price) + (p.orig ? ' <span class="muted">· 原价 ¥' + escapeHtml(p.orig) + '</span>' : '');
}

/* ---------- 价格卡（vip.html 与 pricing.html 共用；class 化，禁内联样式）----------
   输出 DOM 与原 vip.js 内联版等价：卡片数/文案/角标/按钮 data-vbuy 全不变（零视觉变化验收点）。
   opts.featured 指定主推卡 id（默认 month）；opts.freeCard=true 时额外渲染免费版卡（定价页用）。
   opts.recId/opts.recDays 控制「距考试还有 N 天，X 刚好覆盖」推荐行（无则不渲染）。 */
function renderPlanCards(box, opts){
  if(!box) return;
  opts = opts || {};
  const featuredId = opts.featured || 'month';
  const recId = opts.recId || '', recDays = opts.recDays || 0;
  const cards = [];
  if(opts.freeCard){
    cards.push('<div class="plan-card plan-card--free">'
      + '<div class="plan-name">免费版</div>'
      + '<div class="plan-price"><span class="plan-price-num">¥0</span><span class="plan-price-unit">/ 永久</span></div>'
      + '<div class="plan-perday muted">不设试用期 · 不绑卡</div>'
      + '<ul class="plan-list muted">'
      + '<li>全部学习功能（单词/句子/口语/写作/回顾）</li>'
      + '<li>每日清单 + 手动打勾</li>'
      + '<li>多设备云同步与导出，永久免费</li>'
      + '<li>AI 免费体验：' + escapeHtml(FREE_AI_DESC) + '</li>'
      + '</ul>'
      + '<a class="btn plan-buy" href="' + (opts.freeHref || 'home.html') + '">先按免费版用</a>'
      + '</div>');
  }
  VIP_PLANS.forEach(p => {
    const featured = p.id === featuredId;
    const isRec = p.id === recId && recDays > 0;
    const recTxt = isRec ? '距你的考试还有 ' + recDays + ' 天，' + p.name + '刚好覆盖 →' : '';
    cards.push('<div class="plan-card' + (featured ? ' plan-card--featured' : '') + '">'
      + (p.tag ? '<span class="plan-badge">' + escapeHtml(p.tag) + '</span>' : '')
      + '<div class="plan-name">' + escapeHtml(p.name) + '</div>'
      + '<div class="plan-price"><span class="plan-price-num">¥' + escapeHtml(p.price) + '</span>'
      + '<span class="plan-price-unit">/ ' + escapeHtml(p.unit) + '</span>'
      + (p.orig ? '<span class="plan-price-orig muted">¥' + escapeHtml(p.orig) + '</span>' : '')
      + '</div>'
      + '<div class="plan-perday muted">' + escapeHtml(p.perDay)
      + (p.save ? ' · <b class="plan-save">' + escapeHtml(p.save) + '</b>' : '') + '</div>'
      + '<ul class="plan-list muted">'
      + '<li>AI 功能无限次</li>'
      + '<li>会员专属功能（上线即用）</li>'
      + '<li>跟账号走，多设备通用</li>'
      + '</ul>'
      + (recTxt ? '<div class="plan-rec">' + escapeHtml(recTxt) + '</div>' : '')
      + '<button class="btn' + (featured ? ' btn-primary' : '') + ' plan-buy" data-vbuy="' + p.id + '">立即开通</button>'
      + '</div>');
  });
  box.innerHTML = cards.join('');
  box.querySelectorAll('button[data-vbuy]').forEach(b =>
    b.addEventListener('click', () => {
      const how = document.getElementById('vipHowto');
      if(how) how.scrollIntoView({ behavior:'smooth', block:'start' });
    }));
}

/* ---------- 对比矩阵（vip.html 口径 vs pricing.html 口径）----------
   opts.legacy=true：精确复现 vip.html 原静态表的 9 个内容行（学习功能 1 + AI 5 + 数据与设备 3，
   体验与支持类不渲染）——老页面内容不凭空变多、也不凭空变少。
   默认全量 17 行（定价页用）。free/vip 语义见 VIP_MATRIX 注释。
   ⚠️ legacy 的 free/vip 值以原静态表为准，不等同于全量版同行（原表把「作文模板库」并进了 AI 5 行里，
   故 legacy 模式 AI 类取前 5 条 = 口语模考/写作批改/串题素材/完整备考计划/其他辅助，与原表一致）。
   ⚠️ W-FREE-4（10-25）：她拍板「作文页免费给所有人用」→ 写作批改 free 从 lock 改每月 3 次、
      作文模板库 free 从 lock 改 yes。legacy 那五条**不动**（它是历史对照口径）。 */
function _cellHtml(v, col){
  if(v === 'yes')  return '<td class="' + col + ' yes"><svg aria-label="支持"><use href="#i-check"/></svg></td>';
  if(v === 'lock') return '<td class="' + col + ' no"><svg aria-hidden="true"><use href="#i-lock"/></svg>会员专属</td>';
  if(v === 'dash') return '<td class="' + col + ' dash">—</td>';
  if(typeof v === 'string' && v.indexOf('text:') === 0) return '<td class="' + col + '">' + v.slice(5) + '</td>';
  return '<td class="' + col + ' dash">—</td>';
}
function renderMatrix(box, opts){
  if(!box) return;
  opts = opts || {};
  let rows = [];
  VIP_MATRIX.forEach(sec => {
    let list = sec.rows;
    if(opts.legacy){
      // vip.html 原表口径：学习功能类只第 1 条（原表把 4 条并成 1 行「全部学习功能」）、
      // AI 类前 5 条、数据与设备类前 3 条、体验与支持类不渲染
      if(sec.cat.indexOf('学习功能') === 0) list = sec.rows.slice(0, 1);
      else if(sec.cat.indexOf('AI') === 0) list = sec.rows.slice(0, 5);
      else if(sec.cat.indexOf('数据与设备') === 0) list = sec.rows.slice(0, 3);
      else return;
    }
    rows.push('<tr class="cat"><th colspan="3" scope="colgroup">' + escapeHtml(sec.cat) + '</th></tr>');
    list.forEach(r => {
      rows.push('<tr><th scope="row">' + escapeHtml(r.label)
        + (r.sub ? '<small>' + escapeHtml(r.sub) + '</small>' : '') + '</th>'
        + _cellHtml(r.free, 'free') + _cellHtml(r.vip, 'c3') + '</tr>');
    });
  });
  box.innerHTML = '<div class="mx-scroll" tabindex="0" role="region" aria-label="功能对比表，可横向滚动">'
    + '<table><caption class="sr">免费版与会员功能对比矩阵</caption>'
    + '<thead><tr><th scope="col">功能</th><th scope="col">免费版</th><th scope="col" class="c3">会员</th></tr></thead>'
    + '<tbody>' + rows.join('') + '</tbody></table></div>'
    + '<div class="mx-foot">'
    + '<span><svg aria-hidden="true"><use href="#i-check"/></svg>勾 = 完整可用</span>'
    + '<span><svg aria-hidden="true"><use href="#i-lock"/></svg>锁 = 会员专属</span>'
    + '<span>小屏可左右滑动表格，首列固定</span>'
    + '</div>';
}

window.Pricing = { VIP_PLANS, VIP_MATRIX, FREE_AI_DESC, priceChip, priceText, renderPlanCards, renderMatrix };
