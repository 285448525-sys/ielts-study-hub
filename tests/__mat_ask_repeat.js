/* 模拟回归：追问不重复问已答过的题 + 回答按题目归档不丢失
   场景：用户之前答过【拥挤的地方】的追问 → 重新生成后：
   1) AI 缺口清单里虽然又给了【拥挤的地方】，但应被排除（答过=已补上）
   2) 已被新素材覆盖的题也被过滤
   3) 旧的回答仍在 answers.gaps 里（不被覆写冲掉）
   4) 真缺的新题正常保留 */
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
  const html = fs.readFileSync(path.join(ROOT, 'materials.html'), 'utf8')
    .replace(/<script defer src="js\/[^"]+"><\/script>/g, '');
  const longAns = '这是一段超过四十个字的真实经历描述，用来绕过短答案软门槛，让生成流程直接往下走，不需要点直接生成按钮。';
  const dom = new JSDOM(html, {
    url: 'http://localhost/materials.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window){
      const store = {
        persona: { city: '杭州', identity: '大三学生', values: [], traits: [] },
        materials: [ { id: 'old1', title: '旧卡', storyEn: 'old', logicZh: '旧', coverage: [] } ],
        answers: {
          A: '杭州大三计算机学生，喜欢做网站',
          B1: longAns, B2: longAns, B3: longAns, B4: longAns, B5: longAns,
          // 之前答过的缺题追问（按题目归档）
          gaps: [ { topic: '拥挤的地方', question: '你有没有去过特别挤的地方？', a: '我去过上海地铁，人特别多，挤得动不了，感觉很不舒服，后来我宁愿多走路也避开高峰期。' } ],
          followups: [ { q: '你最近有没有看过什么当地的新闻？', a: '看过杭州亚运会场馆开放的新闻，还去打卡了。' } ]
        },
        followups: [], gaps: [], uncovered: [], bankVersion: 'v5'
      };
      window.localStorage.setItem('ielts_materials_v1', JSON.stringify(store));
      window.Element.prototype.scrollIntoView = function(){};
    }
  });

  const { window } = dom;
  const code = ['js/data.js', 'js/common.js', 'js/materials.js']
    .map(f => '// ==== ' + f + ' ====\n' + fs.readFileSync(path.join(ROOT, f), 'utf8'))
    .join('\n;\n');
  try{ window.eval(code); }
  catch(e){ console.error('EVAL_FAIL', e.message); process.exit(2); }
  await new Promise(r => setTimeout(r, 200));

  const doc = window.document;
  window.callRelay = async function(service, messages, temperature){
    if(service === 'material_persona'){
      return JSON.stringify({ persona: { city: '杭州', identity: '大三学生', values: [], traits: [] } });
    }
    if(service === 'material'){
      return JSON.stringify({ stories: [
        { title: '上海地铁', storyEn: 'I took the subway in Shanghai. It was very crowded.', logicZh: '地铁—人多—挤', coverage: [
          { topic: '拥挤的地方', fit: 'natural', bridgeEn: 'The subway was crowded.', note: '' }
        ] },
        { title: '做网站', storyEn: 'I built study websites. It was amazing.', logicZh: '建站—成就', coverage: [
          { topic: '机智解决问题的人', fit: 'natural', bridgeEn: 'I solved problems.', note: '' }
        ] }
      ], uncovered: [], followups: ['新追1', '新追2'] });
    }
    if(service === 'material_gap'){
      // 故意把【拥挤的地方】再问一遍（AI 不知道用户已答过）+ 一个已覆盖题 + 一个真新题
      return JSON.stringify([
        { topic: '拥挤的地方', question: '重复问：你有没有去过特别挤的地方？' },
        { topic: '机智解决问题的人', question: '已覆盖题，应被过滤' },
        { topic: '包含动物的故事或书', question: '你喜欢什么动物故事？' }
      ]);
    }
    throw new Error('unexpected service ' + service);
  };

  const regenBtn = doc.querySelector('[data-regen-all]');
  regenBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 1500));

  const hubRaw = JSON.parse(window.localStorage.getItem('ielts_study_hub_v1') || '{}');
  const saved = (hubRaw.materials && hubRaw.materials.materials) ? hubRaw.materials : JSON.parse(window.localStorage.getItem('ielts_materials_v1'));

  const gapTopics = (saved.gaps || []).map(g => g.topic);
  ok(!gapTopics.includes('拥挤的地方'), '答过的【拥挤的地方】不再重复问（即使 AI 又列了它）', '实际 ' + JSON.stringify(gapTopics));
  ok(!gapTopics.includes('机智解决问题的人'), '已被素材覆盖的题被过滤');
  ok(gapTopics.includes('包含动物的故事或书'), '真缺的新题正常保留');

  const arch = (saved.answers.gaps || []).find(p => p.topic === '拥挤的地方');
  ok(!!arch && arch.a.includes('上海地铁'), '之前答过的内容仍归档在 answers.gaps（不被覆写冲掉，且继续喂给生成）');

  ok((saved.materials || []).length === 2, '素材整库替换为新 2 张');
  ok((saved.followups || []).length === 2 && saved.followups[0] === '新追1', '有缺题时新 followups 保留（旧追问列表被新列表替换）');
  ok(!(saved.followups || []).includes('你最近有没有看过什么当地的新闻？'), '答过的 followup 问题不出现在新追问区');

  console.log('\n==== 结果: ' + pass + ' PASS / ' + failCnt + ' FAIL ====');
  process.exit(failCnt ? 1 : 0);
})().catch(e => { console.error('HARNESS_ERROR', e && (e.stack || e.message || e)); process.exit(2); });
