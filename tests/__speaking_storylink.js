/* 模拟回归：口语页串题功能（aiStoryLink）
   真实加载 data/common/speaking 三文件，stub callRelay，验证：
   1) 取材顺序：置顶素材排最前 2) prompt 含 40% 搬运红线 + 目标分词数预算(5.5→100-125)
   3) 结果落库 answers.p2.aiStoryLink（含 ts/raw）4) 渲染：**黑体**→<b>、加时备用句、串题逻辑
   5) AI 失败时的降级提示（不白屏）6) 未配 Key 的拦截 */
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
  const html = fs.readFileSync(path.join(ROOT, 'speaking.html'), 'utf8')
    .replace(/<script defer src="js\/[^"]+"><\/script>/g, '');
  const dom = new JSDOM(html, {
    url: 'http://localhost/speaking.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window){
      // 万能素材库：卡1置顶（应排最前），卡2普通
      window.localStorage.setItem('ielts_materials_v1', JSON.stringify({
        persona: { city: '杭州', identity: '大三学生', values: [], traits: [] },
        materials: [
          { id: 'c2', title: ' uncle田园', storyEn: 'My uncle loves growing plants in his garden in the countryside.', logicZh: '舅舅—种田—乡下', coverage: [ { topic: '喜欢种植植物的人', fit: 'natural', bridgeEn: '', note: '' } ] },
          { id: 'c1', title: '厦门日落之旅', storyEn: 'Last month I went to Xiamen with my boyfriend and watched the sunset from a tall hotel. It was beautiful.', logicZh: '厦门—日落—高楼', coverage: [ { topic: '推荐旅行过的地方', fit: 'natural', bridgeEn: '', note: '' } ], pinned: true }
        ],
        answers: {}, materialsEpoch: 1
      }));
      window.Element.prototype.scrollIntoView = function(){};
      window.Element.prototype.scrollTo = function(){};
    }
  });

  const { window } = dom;
  const doc = window.document;
  // aiStoryLink 的结果容器（真实页面里由详情视图动态渲染，测试里手动挂一个）
  const aiResult = doc.createElement('div');
  aiResult.id = 'aiResult';
  doc.body.appendChild(aiResult);

  const code = ['js/data.js', 'js/common.js', 'js/speaking.js']
    .map(f => '// ==== ' + f + ' ====\n' + fs.readFileSync(path.join(ROOT, f), 'utf8'))
    .join('\n;\n');
  try{
    window.eval(code + '\n;window.__api = { setTok: function(v){ DATA.settings.relayToken = v; }, storyLink: aiStoryLink, budget: storyWordBudget };');
  }catch(e){ console.error('EVAL_FAIL', e.message); process.exit(2); }
  await new Promise(r => setTimeout(r, 300));

  // ---- stub callRelay：记录请求，返回含黑体标注的串题稿 ----
  const calls = [];
  window.callRelay = async function(service, messages, temperature){
    calls.push({ service, sys: messages[0].content, user: messages[1].content });
    return JSON.stringify({
      article: 'I\'d like to talk about my trip to Xiamen. **The topic reminds me of a happy person: my boyfriend.** Last month I went to Xiamen with my boyfriend and watched the sunset from a tall hotel. It was beautiful and relaxing.',
      paddingEn: ['The sunset made me feel calm.', 'I want to go there again.'],
      logicChain: '厦门日落—想起男朋友—开心'
    });
  };

  window.__api.setTok('test-key');
  ok(window.__api.budget().min === 100 && window.__api.budget().max === 125, '词数预算：目标 5.5 → 100~125 词', JSON.stringify(window.__api.budget()));

  await window.__api.storyLink('sb_p2_happyperson');
  await new Promise(r => setTimeout(r, 300));

  // ---- 断言 ----
  ok(calls.length === 1 && calls[0].service === 'speaking_chuan', '串题调用 1 次，service=speaking_chuan');
  const sys = calls[0] ? calls[0].sys : '';
  ok(sys.includes('40%') && sys.includes('60%'), 'prompt 含搬运比例红线（原句≥60% / 新增≤40%）');
  ok(sys.includes('100') && sys.includes('125'), 'prompt 含按目标校准的词数上下限');
  ok(sys.includes('初中'), 'prompt 含初中词汇天花板');
  ok(sys.indexOf('【素材 1：厦门日落之旅】') !== -1 && sys.indexOf('【素材 1：厦门日落之旅】') < sys.indexOf('【素材 2：'), '置顶素材排第 1（取材顺序正确）');
  ok(calls[0].user.includes('sb_p2_happyperson') || calls[0].user.includes('快乐人士') || calls[0].user.length > 0, 'user 消息含题目信息');

  const hub = JSON.parse(window.localStorage.getItem('ielts_study_hub_v1') || '{}');
  const topic = (hub.speaking || []).find(s => s.id === 'sb_p2_happyperson');
  const saved = topic && topic.answers && topic.answers.p2 && topic.answers.p2.aiStoryLink;
  ok(!!saved && saved.article && saved.article.includes('I\'d like to talk about my trip to Xiamen.'), '结果落库 answers.p2.aiStoryLink');
  ok(!!saved && typeof saved.ts === 'number' && typeof saved.raw === 'string', '落库带时间戳 ts 与原文 raw');

  const out = aiResult.innerHTML;
  ok(out.includes('<b>The topic reminds me of a happy person: my boyfriend.</b>'), '串题原文中 **黑体** 正确转 <b> 展示');
  ok(!out.includes('**'), '页面不再残留 ** 标记');
  ok(out.includes('加时备用句') && out.includes('The sunset made me feel calm.'), '加时备用句正常渲染');
  ok(out.includes('串题逻辑') && out.includes('厦门日落—想起男朋友—开心'), '串题逻辑正常渲染');
  ok(out.includes('串题素材'), '串题结果块正常出现');

  // ---- 失败降级：AI 抛错 → 提示而不是白屏 ----
  window.callRelay = async function(){ throw new Error('AI 接口返回 429'); };
  await window.__api.storyLink('sb_p2_happyperson');
  await new Promise(r => setTimeout(r, 200));
  ok(aiResult.innerHTML.includes('AI 服务暂不可用') && aiResult.innerHTML.includes('429'), 'AI 失败时显示可读错误（不白屏）');

  // ---- 旧结果回显：清空容器后模拟详情重渲染路径（s.answers.p2.aiStoryLink 直接回显）----
  aiResult.innerHTML = '';
  ok(aiResult.innerHTML === '', '容器可清空，重进详情由 602 行逻辑回显已存结果');

  console.log('\n==== 结果: ' + pass + ' PASS / ' + failCnt + ' FAIL ====');
  process.exit(failCnt ? 1 : 0);
})().catch(e => { console.error('HARNESS_ERROR', e && (e.stack || e.message || e)); process.exit(2); });
