/* 场景闯关 v2（design/07）：一关 = 一段迷你对话
   —— 看/听对话 → 逐句说 → 立刻反馈 → 同句型换词连练 → 整段无提示复现 → 通关小结。

   【阶段 1 只落骨架 + 上线开关】window.__SCENE_V2_ON 默认 false → 本文件不接管 #pdView，
   老的 pattern-drill.js 引擎照常工作（pdLegacy 兜底）。阶段 6 才切 true。

   顶层一律 var：本文件被 speaking.html 软导航重跑（window.eval），let/const 顶层声明重跑会崩。
   缓存一律挂 window 且顶层只读不重置：重跑时把缓存清成 null 会让每次进口语页都重新 fetch
   （同 pattern-drill.js __pdPatternsCache 的教训）。 */

/* 上线开关：阶段 6 切 true。改回 false 即可整体回滚到老形态
   （pattern-drill.js 的 ready 里有同一开关的让位判断，两边必须一致）。 */
var SD_V2_ON = false;
window.__SCENE_V2_ON = SD_V2_ON;

/* 数据句柄：顶层只做「有缓存就恢复」，绝不重置为 null */
var SD_SCENES = (typeof window !== 'undefined' && window.__pdScenesCache) || null;
var SD_WEAKNESS = (typeof window !== 'undefined' && window.__pdWeaknessCache) || null;

var SD_SCENE_PER_DAY = 1;   // design/07 §十三：每日一关
var SD_CUR = null;          // 当前关上下文 { scene, lineIdx, ... }（阶段 2+ 填充）
var SD_BUSY = false;        // 判定进行中，防连点
var SD_AUTO_NEXT = null;    // 自动流转定时器

/* 本地判定（design/07 §六）：归一化后比对，命中即对、不命中才问 AI。
   阶段 1 先给兜底实现（严格相等）；阶段 2 补齐 token 序列比对
   （去 a/the、单复数、三单、大小写、标点、拼写）+ callRelay 兜底。 */
function sdNormalize(s){
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[^a-z' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function sdLocalJudge(user, right){
  return sdNormalize(user) === sdNormalize(right);
}

/* 场景库加载：走 window 级缓存，软导航重跑不重复 fetch */
async function sdLoadScenes(){
  if(window.__pdScenesCache){ SD_SCENES = window.__pdScenesCache; return SD_SCENES; }
  try{
    var res = await fetch('data/scenes.json?v=20260909a');
    SD_SCENES = await res.json();
    window.__pdScenesCache = SD_SCENES;
    return SD_SCENES;
  }catch(e){
    console.warn('[scene-drill] 场景库加载失败', (e && e.message) || e);
    return null;
  }
}

/* weakness 句柄（design/07 §5.2）：读 DATA.patternDrill.weakness，缺则建空。
   落盘交给 pattern-drill.js 的 _sceneV1 迁移门，本处不 hubSave（禁无条件保存）。 */
function sdWeakness(){
  if(window.__pdWeaknessCache) return window.__pdWeaknessCache;
  if(typeof DATA === 'undefined' || !DATA.patternDrill) return {};
  if(!DATA.patternDrill.weakness) DATA.patternDrill.weakness = {};
  window.__pdWeaknessCache = DATA.patternDrill.weakness;
  return window.__pdWeaknessCache;
}

/* 启动入口：阶段 1-5 开关关闭 → 立即返回，零副作用、不碰任何 DOM */
async function sdBoot(){
  if(!window.__SCENE_V2_ON) return;
  // TODO 阶段 2：本地判定 + 立刻反馈（提示分层 L0/L1/L2）
  // TODO 阶段 3：换词连练（variants）
  // TODO 阶段 4：错/卡住自动回写 custom + weakness 聚合
  // TODO 阶段 5：完成页「这周哪类在变好」排行
  // TODO 阶段 6：整段复现 + TTS + 切 __SCENE_V2_ON = true
}

ready(function(){ sdBoot(); });
