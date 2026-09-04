/* 模拟回归：素材深挖 v2（逐卡调用 + 题名纠偏）
   jsdom 手动按序 eval 页面真实 JS（data.js → common.js → materials.js），
   stub 掉 window.callRelay，模拟 AI 返回【含变体题名/幻觉题名】的响应，
   验证：1) 逐卡调用 2) max_tokens 传参 3) 变体题名落回真实题库题名 4) 幻觉题名被丢弃
        5) 矩阵芯片正确变色 6) 单卡失败不影响其他卡 7) 点题句黑体「临场加」+ note 不再被藏 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, failCnt = 0;
function ok(cond, name, extra){
  if(cond){ pass++; console.log('  PASS ' + name); }
  else { failCnt++; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')); }
}

(async () => {
  // 去掉外链 script（手动 eval）与 ?v= 查询串
  const html = fs.readFileSync(path.join(ROOT, 'materials.html'), 'utf8')
    .replace(/<script defer src="js\/[^"]+"><\/script>/g, '');
  const dom = new JSDOM(html, {
    url: 'http://localhost/materials.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window){
      const store = {
        persona: { city: '杭州', identity: '大三学生', values: [], traits: [] },
        materials: [
          { id: 'm1', title: '厦门之旅', storyEn: 'Last month I took a trip to Xiamen with my boyfriend. On the way I saw someone littering on the beach, which made me sad. We stayed in a tall hotel with a sea view, watched people playing volleyball, and ate a big seafood dinner.', logicZh: '去厦门—路上见人丢垃圾—难过—高楼酒店—排球—海鲜', coverage: [ { topic: '推荐旅行过的地方', fit: 'natural', bridgeEn: '', note: '' } ] },
          { id: 'm2', title: '学英语', storyEn: 'I study computer science and I prepare for IELTS every day.', logicZh: '学CS—备考雅思', coverage: [ { topic: '近期改变', fit: 'natural', bridgeEn: '', note: '' } ] }
        ],
        answers: { A: '杭州大三学生', B1: '和男朋友去厦门玩了三天，路上看到有人破坏环境' },
        bankVersion: 'v4_old'
      };
      window.localStorage.setItem('ielts_materials_v1', JSON.stringify(store));
    }
  });

  const { window } = dom;
  // 按浏览器行为把页面真实脚本拼成同作用域一段执行（eval 的顶层 const 不跨次持久化）
  const code = ['js/data.js', 'js/common.js', 'js/materials.js']
    .map(f => '// ==== ' + f + ' ====\n' + fs.readFileSync(path.join(ROOT, f), 'utf8'))
    .join('\n;\n');
  try{ window.eval(code + '\n;window.__dbg = { hasDATA: (typeof DATA !== "undefined"), p2: (typeof DATA !== "undefined" && Array.isArray(DATA.speaking) ? DATA.speaking.filter(function(s){return s && s.type === "P2";}).map(function(s){return s.titleZh || s.titleEn;}) : null) };'); }
  catch(e){ console.error('EVAL_FAIL', e.message); process.exit(2); }
  console.log('  DEBUG P2 题库前 12 题 = ' + JSON.stringify((window.__dbg.p2 || []).slice(0, 12)));
  console.log('  DEBUG P2 总数 = ' + (window.__dbg.p2 || []).length);
  await new Promise(r => setTimeout(r, 200));

  // ---- stub callRelay：记录调用；卡1返回含变体+幻觉题名，卡2直接失败 ----
  const calls = [];
  window.callRelay = async function(service, messages, temperature, opts){
    calls.push({ service, temperature, opts, user: messages[1].content });
    const isCard1 = messages[1].content.includes('厦门之旅');
    if(!isCard1){ throw new Error('AI 接口返回 429：rate limit'); }
    return JSON.stringify({ coverage: [
      { topic: '推荐旅行过的地方', fit: 'natural', bridgeEn: 'I went to Xiamen last month.', note: '' },
      { topic: '喜欢或不喜欢的高建筑', fit: 'loose', bridgeEn: 'My hotel in Xiamen was very tall.', note: '即兴补：住的酒店楼层很高' },
      { topic: '喜欢的现场体育赛事', fit: 'loose', bridgeEn: 'I watched a volleyball game on the beach.', note: '即兴补：沙滩排球' },
      { topic: '想颁布的新法律', fit: 'loose', bridgeEn: 'I want a law to protect the environment.', note: '路上见人破坏环境→想颁布环保法' },
      { topic: '想颁布的环保法律', fit: 'loose', bridgeEn: 'I want a law to protect the environment.', note: '变体题名，应纠偏到「想要颁布的环保法律」' },
      { topic: '保护环境的法律', fit: 'loose', bridgeEn: 'I want an environmental law.', note: '三道法律近似题都要分别列出' },
      { topic: '想颁布的网络隐私法', fit: 'loose', bridgeEn: '', note: '幻觉题名，应被丢弃' }
    ] });
  };

  const doc = window.document;
  const matRoot = doc.querySelector('#matRoot');
  ok(!matRoot.innerHTML.includes('当季覆盖') && !matRoot.innerHTML.includes('深挖覆盖'), '覆盖率矩阵/深挖按钮已从结果页移除（素材出来直接练）');
  ok(typeof window.matGen.deepDig === 'function', 'matGen.deepDig 程序化入口可用');
  await window.matGen.deepDig();
  await new Promise(r => setTimeout(r, 800));

  await new Promise(r => setTimeout(r, 1200));

  // ---- 断言 ----
  ok(calls.length === 2, '逐卡调用：共调用 2 次（每张素材卡 1 次）', '实际 ' + calls.length);
  ok(calls.every(c => c.opts && c.opts.max_tokens === 8192), '每次调用都带 max_tokens:8192（防长输出截断）');
  ok(calls.every(c => c.service === 'material_remap'), 'service=material_remap');
  ok(calls[0].user.includes('题库清单') && calls[0].user.includes('想要颁布的环保法律'), 'prompt 内嵌当季真实题库清单');

  // loadStore 首次保存后数据迁入 HUB_KEY（ielts_study_hub_v1），STORE_KEY 是旧迁移残留——断言要读 HUB_KEY
  const hubRaw = JSON.parse(window.localStorage.getItem('ielts_study_hub_v1') || '{}');
  const saved = (hubRaw.materials && hubRaw.materials.materials) ? hubRaw.materials : JSON.parse(window.localStorage.getItem('ielts_materials_v1'));
  const cov1 = saved.materials[0].coverage.map(c => c.topic);
  console.log('  卡1落库 coverage = ' + JSON.stringify(cov1));
  ok(cov1.includes('想要颁布的环保法律'), '变体题名「想颁布的环保法律」纠偏为题库题名「想要颁布的环保法律」');
  ok(cov1.includes('想颁布的新法律') && cov1.includes('保护环境的法律'), '三道法律近似题分别挂上（不合并）');
  ok(!cov1.includes('想颁布的网络隐私法'), '幻觉题名「想颁布的网络隐私法」被丢弃');
  ok(cov1.includes('喜欢或不喜欢的高建筑') && cov1.includes('喜欢的现场体育赛事'), '场景辐射题正常入库');
  ok(saved.materials[0].coverage.find(c => c.topic === '想要颁布的环保法律').fit === 'loose', '法律题为 loose 搭边');
  ok(saved.bankVersion !== 'v4_old', '完成后 bankVersion 更新');

  // 卡2 失败但卡1 已落库（逐卡容错）
  ok(saved.materials[1].coverage.length === 1 && saved.materials[1].coverage[0].topic === '近期改变', '卡2 调用失败，但原 coverage 未被破坏（逐卡容错）');

  // 点题句黑体「临场加」+ note 同显（素材卡 coverage 展示区）
  const mx = matRoot.innerHTML;
  ok(mx.includes('<div class="mat-bridge">临场加：I want a law to protect the environment.</div>'), '点题句以「临场加：」黑体前缀显示');
  ok(mx.includes('即兴补：住的酒店楼层很高'), 'note 与点题句同显（不再被藏）');

  console.log('\n==== 结果: ' + pass + ' PASS / ' + failCnt + ' FAIL ====');
  process.exit(failCnt ? 1 : 0);
})().catch(e => { console.error('HARNESS_ERROR', e && (e.stack || e.message || e)); process.exit(2); });
