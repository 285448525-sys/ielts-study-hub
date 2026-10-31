/* 公告条（W-UI-1 10-25）测试夹具：把「未读公告」这个变量关掉。
   ------------------------------------------------------------------
   为什么要它：全站顶栏壳那五支探针（shell / shell2 / shell3 / shell4 / shell5）里都有一条
   「手机内容贴顶（顶栏 44px 让位归零，main.top < 20）」。公告条上线后这条开始红：
   条是 sticky、在文档流里真实占 34px，而手机端顶栏整条不渲染（10-23 她定的口径），
   于是内容被**公告条**顶下 34px —— 跟「顶栏有没有让位」根本不是一件事。
   混在一起判，以后谁改谁分不清。所以测顶栏让位时先把公告预标已读。

   🔴 两个必须（踩过）：
     ① 必须标**真实的最新那条 id** —— 公告条只推 items[0]（读完就收，不连推下一条），
        塞一个假 id 等于没标。所以得先开一页把 json 读出来。
     ② 断言前要等条收干净 —— 公告条是异步挂的（先按缓存同步一次、再拉 json），
        不等就会测到「被顶 34px」的旧形态。用返回的 waitAncGone() 等。
     ③ 想测「有未读时条长什么样」请**另起一个不播种的 context**：
        addInitScript 每次导航都重跑，在播种过的 context 里 removeItem + reload
        = 刚清掉又被播种写回去（shell_1022 的 ②b 就是这么写的）。

   用法：
     const { seedAncRead, waitAncGone } = require('./_anc_seed.cjs');
     await mockRoutes(ctx);                       // 先挂 mock：临时页会打 /api/roles
     const topId = await seedAncRead(ctx, BASE);  // 播种已读，返回最新那条 id
     ...
     await waitAncGone(page);                     // 每条断言前等条收干净 */
const ANC_JSON = '/data/announce.json';

async function ancTopId(ctx, BASE){
  let tp;
  try{
    tp = await ctx.newPage();
    await tp.goto(BASE + '/announce.html', { waitUntil: 'domcontentloaded' }).catch(() => {});
    return await tp.evaluate(async (u) => {
      try{
        const j = await fetch(u).then(r => r.json());
        return (j && j.items && j.items[0]) ? j.items[0].id : '';
      }catch(e){ return ''; }
    }, ANC_JSON).catch(() => '');
  }catch(e){ return ''; }
  finally{ if(tp) await tp.close().catch(() => {}); }
}

async function seedAncRead(ctx, BASE){
  const id = await ancTopId(ctx, BASE);
  await ctx.addInitScript(ancId => {
    try{ localStorage.setItem('hub_anc_read', JSON.stringify(ancId ? [ancId] : [])); }catch(e){}
  }, id);
  return id;
}

async function waitAncGone(page, timeout){
  return page.waitForFunction(() => !document.getElementById('hubAncBar'), null,
    { timeout: timeout || 8000 }).catch(() => {});
}

module.exports = { seedAncRead, waitAncGone, ancTopId };
