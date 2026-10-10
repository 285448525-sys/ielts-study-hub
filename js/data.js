/* 数据层：localStorage 读写与默认数据 */
const HUB_KEY = 'ielts_study_hub_v1';

/* ⚠️ 登录凭证隔离存储（根治「登录状态/Key/手机号频繁丢失」）：
   账号凭证（手机号 syncCode / AI Key relayToken / 发音分 pronunciationScore / 自动同步 autoSync）
   与 _fieldTs 单独镜像到独立的 localStorage 键，与 HUB_KEY 主数据 blob 完全解耦。
   - 绝不参与 cloud 合并（mergeData 只动 DATA，不碰本键）；
   - 绝不参与 autoCleanOldBank（该函数只处理 HUB_KEY，不引用本键）；
   - 主 blob 被任何历史/未来 bug 抹掉时，本键仍完好，加载时自动回填 → 账号永不失联。
   写入点：hubSave()（覆盖所有保存路径）+ mergeData()（云端合并后）；读取点：hubLoad() + ready 早恢复。 */
const CREDS_KEY = 'ielts_hub_credentials_v1';
const CREDS_FIELDS = ['syncCode', 'relayToken', 'pronunciationScore', 'fluencyScore', 'autoSync'];
function saveCredsMirror(){
  try{
    const s = DATA.settings || {};
    const m = {
      syncCode: s.syncCode || '',
      relayToken: s.relayToken || '',
      pronunciationScore: (s.pronunciationScore != null ? s.pronunciationScore : ''),
      fluencyScore: (s.fluencyScore != null ? s.fluencyScore : ''),
      autoSync: !!s.autoSync,
      _fieldTs: (s._fieldTs && typeof s._fieldTs === 'object') ? s._fieldTs : {},
      ts: Date.now()
    };
    localStorage.setItem(CREDS_KEY, JSON.stringify(m));
  }catch(e){}
}
function restoreCredsIfMissing(){
  try{
    const raw = localStorage.getItem(CREDS_KEY);
    if(!raw) return;
    const m = JSON.parse(raw);
    if(!m || typeof m !== 'object') return;
    const s = (DATA.settings && typeof DATA.settings === 'object') ? DATA.settings : (DATA.settings = {});
    let restored = false;
    for(const f of CREDS_FIELDS){
      const cur = s[f];
      const isEmpty = (cur == null || cur === '' || (f === 'pronunciationScore' && cur === ''));
      if(isEmpty && m[f] != null && m[f] !== ''){ s[f] = m[f]; restored = true; }
    }
    if(restored){
      s._fieldTs = Object.assign({}, (s._fieldTs || {}), (m._fieldTs || {}));
      hubSave();
    }
  }catch(e){}
}

const MODULES = [
  { id:'vocab', name:'背单词', icon:'📚', color:'#5f86a8', children:[
    { id:'vocab_review', name:'复习单词', icon:'🔁', practice:'flashcard' },
    { id:'vocab_read',   name:'阅读词汇·看词选义', icon:'👁', practice:'seeWord' },
    { id:'vocab_listen', name:'听力词汇·听义选义', icon:'👂', practice:'hearMeaning' },
    { id:'vocab_corpus', name:'听力词汇语料库', icon:'📋', practice:'corpus' },
    { id:'vocab_dict',   name:'默写单词·听读音', icon:'✍️', practice:'dictation' },
  ]},
  /* ⚠️ 9/30 她拍板：听力 / 阅读站内没有题目，「点了开始只是个秒表」= 名不副实。
     这两组的任务名统一加「真题网站 ·」前缀 —— 它们是**记账项**，记你在站外（真题网站）练的时间，
     站内不会给你出题。id 一律不动（历史 sessions 记录按 id 引用）。 */
  { id:'listening', name:'听力', icon:'🎧', color:'#4f9fc0', children:[
    { id:'listening_set',     name:'真题网站 · 听力 1 套', icon:'📝' },
    { id:'listening_corpus',  name:'语料库听写 1 组', icon:'📋' },   // 站内唯一真有内容的听力项（corpus.html）
    { id:'listening_shadow',  name:'真题网站 · 精听跟读 1 段', icon:'🎯' },
  ]},
  { id:'reading', name:'阅读', icon:'📖', color:'#46a883', children:[
    { id:'reading_p1',    name:'真题网站 · 阅读 1 篇（20min）', icon:'⏱️' },
    { id:'reading_tfng',  name:'真题网站 · 判断 T/F/NG 10 题', icon:'🔍' },
    { id:'reading_rev',   name:'真题网站 · 复盘阅读错题', icon:'🧠' },
  ]},
  { id:'writing', name:'写作', icon:'✍️', color:'#d99a4e', children:[
    { id:'writing_t2',      name:'Task2 四段式练 1 篇', icon:'📝' },
    { id:'writing_tpl',     name:'背 / 默写作模板 1 段', icon:'📚' },
    { id:'writing_outline', name:'审题：5 题列提纲', icon:'🧩' },
  ]},
  { id:'speaking', name:'口语', icon:'🗣️', color:'#d97877', children:[
    { id:'speaking_gpt', name:'AI 口语对话 15min（P1）', icon:'💬' },
    { id:'speaking_p2',  name:'串题素材复述 1 个 P2 说满 2min', icon:'🎤' },
    { id:'speaking_rec', name:'录音自查流利度', icon:'🎙️' },
    { id:'speaking_drill', name:'句型闯关', icon:'🔨' },
  ]},
];

/* 口语题库频次四档→中文标签（全站唯一定义；progress.js / speaking.js 都读这份，勿在各文件另建副本）。
   注：const 在经典脚本里是全局词法绑定，后续脚本可直接使用。 */
const FREQ_LABEL = { ultra: '必考题', high: '高频', medium: '中频', low: '低频' };

/* ===== 9-12 月口语题库（2026-10-05 基于9月考生回忆重排，大陆考区；P1 27 / P2 32 = 59 题；P1四档：必考题/高频/中频/低频，P2三档：高频/中频/低频） ===== */
const SPEAKING_BANK = [
    /* ===== P1 · 必考题（3 题） ===== */
{
    id: "sb_p1_work",
    type: "P1",
    period: "2026-09-20",
    isNew: false,
    frequency: "ultra",
    category: "日常",
    titleEn: "Work or studies",
    titleZh: "工作/学习",
    questions: [
        "What subjects are you studying?",
        "Do you like your subject?",
        "Why did you choose to study that subject?",
        "Do you think that your subject is popular in your country?",
        "Do you have any plans for your studies in the next five years?",
        "Do you want to change your major?",
        "Are you looking forward to working?",
        "What work do you do?",
        "Why did you choose to do that type of work (or that job)?",
        "Do you want to change to another job?"
    ],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "必考题",
    proficiency: "没练"
},
{
    id: "sb_p1_home",
    type: "P1",
    period: "2026-09-20",
    isNew: false,
    frequency: "ultra",
    category: "地点",
    titleEn: "Home/accommodation",
    titleZh: "住所",
    questions: [
        "What kind of house or apartment do you want to live in in the future?",
        "Are the transport facilities to your home very good?",
        "Do you prefer living in a house or an apartment?",
        "What part of your home do you like the most?",
        "How long have you lived there?",
        "Do you plan to live there for a long time?",
        "Can you describe the place where you live?",
        "Do you live in an apartment or a house?",
        "Who do you live with?"
    ],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "必考题",
    proficiency: "没练"
},
{
    id: "sb_p1_hometown",
    type: "P1",
    period: "2026-09-20",
    isNew: false,
    frequency: "ultra",
    category: "地点",
    titleEn: "Hometown",
    titleZh: "家乡",
    questions: [
        "Where is your hometown?",
        "Is that a big city or a small place?",
        "How long have you been living there?",
        "Do you think you will continue living there for a long time?",
        "Do you like your hometown?",
        "What do you like (most) about your hometown?",
        "Is there anything you dislike about it?",
        "What's your hometown famous for？",
        "Is your hometown a good place for young people to pursue their careers?",
        "Have you learned anything about the history of your hometown?"
    ],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "可套框架②",
    proficiency: "没练"
},
    /* ===== P1 · 高频（7 题） ===== */
{
    id: "sb_p1_area",
    type: "P1",
    period: "2026-09-20",
    isNew: false,
    frequency: "high",
    category: "地点",
    titleEn: "The area you live in",
    titleZh: "居住的地方",
    questions: [
        "Do you like the area that you live in?",
        "Do you live in a noisy or a quiet area?",
        "What are some changes in the area recently?",
        "Where do you like to go in that area?",
        "Do you know any of your neighbors?",
        "Are the people in your neighborhood nice and friendly?"
    ],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "必考题",
    proficiency: "没练"
},
{
    id: "sb_p1_city",
    type: "P1",
    period: "2026-09-20",
    isNew: false,
    frequency: "high",
    category: "地点",
    titleEn: "The city you live in",
    titleZh: "所在城市",
    questions: [
        "What city do you live in?",
        "How long have you lived in this city?",
        "What's the weather like where you live?",
        "What do you like most about your city?",
        "Has your city changed much in recent years?",
        "Would you recommend your city to others?"
    ],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "必考题",
    proficiency: "没练"
},
{
    id: "sb_p1_travelling",
    type: "P1",
    period: "2026-09-20",
    isNew: true,
    frequency: "high",
    category: "日常",
    titleEn: "Travelling",
    titleZh: "旅行",
    questions: [
        "What transport do you often use when travelling?",
        "Do you often ride a bicycle?",
        "Do you prefer to sit by the window when travelling?",
        "Did you have a long journey with your family as a child?"
    ],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p1_teachers",
    type: "P1",
    period: "2026-09-20",
    isNew: false,
    frequency: "high",
    category: "人物",
    titleEn: "Teachers",
    titleZh: "老师",
    questions: [
        "Do you have a favorite teacher?",
        "Do you want to be a teacher in the future?",
        "Do you have a teacher from your past that you still remember?",
        "Are you still in touch with your primary school teachers?",
        "In what way has your favourite teacher helped you?",
        "Do you like your primary school teachers more than your high school teachers?"
    ],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "可套框架⑤",
    proficiency: "没练"
},
{
    id: "sb_p1_socialmedia",
    type: "P1",
    period: "2026-09-20",
    isNew: false,
    frequency: "high",
    category: "日常",
    titleEn: "Social media",
    titleZh: "社交媒体",
    questions: [
        "Have you ever posted anything on social media?",
        "When did you start using social media?",
        "Do you think you spend too much time on social media?",
        "Do your friends use social media?",
        "What do people often do on social media?"
    ],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "可套框架④",
    proficiency: "没练"
},
{
    id: "sb_p1_rubbish",
    type: "P1",
    period: "2026-09-20",
    isNew: true,
    frequency: "high",
    category: "日常",
    titleEn: "Rubbish and recycling",
    titleZh: "垃圾与回收",
    questions: [
        "Did you recycle when you were a kid?",
        "Is waste sorting common in your country?",
        "How do you recycle things like paper and plastic?",
        "What do you do when you see rubbish on the street?"
    ],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p1_politeness",
    type: "P1",
    period: "2026-09-20",
    isNew: true,
    frequency: "high",
    category: "日常",
    titleEn: "Politeness",
    titleZh: "礼貌",
    questions: [
        "What did you do to show your politeness as a child?",
        "Do you think being polite is very important?",
        "How did you learn to be polite as a child?"
    ],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
    /* ===== P1 · 中频（11 题） ===== */
{
    id: "sb_p1_tiredness",
    type: "P1",
    period: "2026-09-20",
    isNew: true,
    frequency: "medium",
    category: "日常",
    titleEn: "Tiredness",
    titleZh: "疲劳",
    questions: [
        "What do you do when you feel tired?",
        "When would you feel tired?",
        "Do you often feel tired?",
        "When you feel tired, do you still go out with your friends?"
    ],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p1_shoes",
    type: "P1",
    period: "2026-09-20",
    isNew: true,
    frequency: "medium",
    category: "事物",
    titleEn: "Shoes",
    titleZh: "鞋子",
    questions: [
        "Which do you prefer, fashionable shoes or comfortable shoes?",
        "How much money do you usually spend on shoes?",
        "Have you ever bought shoes online?",
        "Do you like buying shoes? How often?"
    ],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p1_fruitveg",
    type: "P1",
    period: "2026-09-20",
    isNew: true,
    frequency: "medium",
    category: "日常",
    titleEn: "Fruit and vegetables",
    titleZh: "果蔬",
    questions: [
        "Do people in your country like planting vegetables?",
        "Were there any kind of fruits and vegetables you disliked as a child?",
        "What kind of fruits and vegetables do you dislike?",
        "Where do you usually buy fruit and vegetables?",
        "How often do you eat fruit and vegetables?"
    ],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p1_advertisement",
    type: "P1",
    period: "2026-09-20",
    isNew: true,
    frequency: "medium",
    category: "日常",
    titleEn: "Advertisement",
    titleZh: "广告",
    questions: [
        "Do you often see advertisements when you are on your phone or computer?",
        "What kind of advertising do you like?",
        "Do you like advertisements?",
        "Do you see a lot of advertising on trains or other transport?",
        "Is there an advertisement that made an impression on you when you were a child?",
        "Have you ever bought something because of an advertisement?"
    ],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p1_name",
    type: "P1",
    period: "2026-09-20",
    isNew: true,
    frequency: "medium",
    category: "日常",
    titleEn: "Name",
    titleZh: "名字",
    questions: [
        "Do you often forget people's names?",
        "How do you feel when people can't remember your name?",
        "How do you remember people's names?",
        "Is it easy for you to remember people's names?"
    ],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p1_secondaryschool",
    type: "P1",
    period: "2026-09-20",
    isNew: true,
    frequency: "medium",
    category: "日常",
    titleEn: "Secondary school",
    titleZh: "中学",
    questions: [
        "Is there anything you miss about your secondary school?",
        "What was your favourite subject at secondary school?",
        "Were there any subjects that you found difficult at secondary school?",
        "Do you remember your first day at secondary school?"
    ],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p1_punctuality",
    type: "P1",
    period: "2026-09-20",
    isNew: true,
    frequency: "medium",
    category: "日常",
    titleEn: "Punctuality",
    titleZh: "准时",
    questions: [
        "Are you a punctual person?",
        "Do you think being on time is important?",
        "How do you feel when others are late?",
        "How do you remind yourself to be on time?",
        "Why are some people always late?"
    ],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p1_collecting",
    type: "P1",
    period: "2026-09-20",
    isNew: true,
    frequency: "medium",
    category: "事物",
    titleEn: "Collecting things",
    titleZh: "收集",
    questions: [
        "Do you collect things?",
        "Are there any things you have kept from your childhood?",
        "Where do you usually keep the things you collect?",
        "Would you keep old things for a long time? Why?",
        "Did you collect anything when you were a child?"
    ],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p1_computers",
    type: "P1",
    period: "2026-09-20",
    isNew: true,
    frequency: "medium",
    category: "事物",
    titleEn: "Computers or tablets",
    titleZh: "电脑/平板",
    questions: [
        "Do you often use a computer or a tablet?",
        "Which do you prefer, a computer or a tablet?",
        "Did you use a computer when you were a child?",
        "How has technology changed the way you study?",
        "Do you think computers will replace tablets in the future?"
    ],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p1_streetmarket",
    type: "P1",
    period: "2026-09-20",
    isNew: true,
    frequency: "medium",
    category: "地点",
    titleEn: "Street market",
    titleZh: "街市",
    questions: [
        "Do you like going to street markets?",
        "Are there many street markets in your city?",
        "What do people usually buy at street markets?",
        "Did you go to street markets when you were a child?",
        "Do you prefer street markets or supermarkets?"
    ],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p1_emails",
    type: "P1",
    period: "2026-09-20",
    isNew: true,
    frequency: "medium",
    category: "日常",
    titleEn: "Emails",
    titleZh: "邮件",
    questions: [
        "Do you often send emails?",
        "Do you prefer emails or text messages?",
        "Did you write emails when you were a child?",
        "What kind of emails do you usually receive?",
        "Do you think emails will be replaced by messaging apps?"
    ],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
    /* ===== P1 · 低频（6 题） ===== */
{
    id: "sb_p1_cars",
    type: "P1",
    period: "2026-09-20",
    isNew: false,
    frequency: "low",
    category: "事物",
    titleEn: "Cars",
    titleZh: "汽车",
    questions: [
        "Did you enjoy traveling by car when you were a kid?",
        "What types of cars do you like?",
        "Do you prefer to be a driver or a passenger?",
        "What do you usually do when there is a traffic jam?",
        "Do you think car colours are important?",
        "Will you buy an expensive car in the future?"
    ],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "可套框架④",
    proficiency: "没练"
},
{
    id: "sb_p1_websites",
    type: "P1",
    period: "2026-09-20",
    isNew: false,
    frequency: "low",
    category: "事物",
    titleEn: "Websites",
    titleZh: "网页",
    questions: [
        "What kinds of websites do you often visit?",
        "What is your favourite website?",
        "Are there any changes to the websites you often visit?",
        "What kinds of websites are popular in your country?",
        "Do you prefer getting information from websites or books?",
        "Would you like to have your own website?",
        "What have you learned from websites that help with your life or studies?"
    ],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "可套框架④",
    proficiency: "没练"
},
{
    id: "sb_p1_watch",
    type: "P1",
    period: "2026-09-20",
    isNew: false,
    frequency: "low",
    category: "事物",
    titleEn: "Watch",
    titleZh: "手表",
    questions: [
        "Do you wear a watch?",
        "Have you ever got a watch as a gift?",
        "Why do some people wear expensive watches?",
        "Do you think it is important to wear a watch? Why?"
    ],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "可套框架④",
    proficiency: "没练"
},
{
    id: "sb_p1_paper",
    type: "P1",
    period: "2026-09-20",
    isNew: true,
    frequency: "low",
    category: "日常",
    titleEn: "Paper",
    titleZh: "纸与手写",
    questions: [
        "Do you carry paper and pens with you when you go out?",
        "Do people still keep handwritten letters today?",
        "Do you still write physical letters?",
        "What did you like to do with paper as a child?",
        "Have you made any crafts with paper?"
    ],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p1_lostfound",
    type: "P1",
    period: "2026-09-20",
    isNew: true,
    frequency: "low",
    category: "日常",
    titleEn: "Lost and found",
    titleZh: "失物招领",
    questions: [
        "Have you ever lost something?",
        "What did you do when you lost it?",
        "Did you get it back?",
        "Have you ever found something that belonged to someone else?",
        "Do you think people are careful with their belongings?"
    ],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p1_relatives",
    type: "P1",
    period: "2026-09-20",
    isNew: true,
    frequency: "low",
    category: "人物",
    titleEn: "Relatives",
    titleZh: "亲戚",
    questions: [
        "How often do you visit your relatives?",
        "What do you usually do when you visit them?",
        "When was the last time you visited your relatives?",
        "Do you enjoy spending time with your relatives?",
        "Do you prefer visiting relatives or friends?"
    ],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
    /* ===== P2 · 高频（9 题） ===== */
{
    id: "sb_p2_happydecision",
    type: "P2",
    period: "2026-09-20",
    isNew: true,
    frequency: "high",
    category: "事件",
    titleEn: "An important decision you were happy with",
    titleZh: "对结果开心的重要决定",
    promptEn: "Describe a time you made an important decision and were happy with the result",
    promptZh: "描述一次你做出重要决定并对结果很满意的经历。",
    youShouldSay: [
        "What the decision was",
        "Why you made the decision",
        "How easy it was for you to make the decision",
        "And explain why you were happy with the result"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p2_difficultsuccess",
    type: "P2",
    period: "2026-09-20",
    isNew: true,
    frequency: "high",
    category: "人物",
    titleEn: "A person who did something difficult and succeeded",
    titleZh: "做困难事情并成功的人",
    promptEn: "Describe a person you know who did something difficult and was successful",
    promptZh: "描述一个你认识的做了困难的事并成功的人。",
    youShouldSay: [
        "Who this person is",
        "What difficult thing this person did",
        "Why this person was successful",
        "And explain how you feel about this person"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p2_happyperson",
    type: "P2",
    period: "2026-09-20",
    isNew: true,
    frequency: "high",
    category: "人物",
    titleEn: "A happy person you know",
    titleZh: "快乐人士",
    promptEn: "Describe a happy person you know",
    promptZh: "描述一个你认识的快乐的人。",
    youShouldSay: [
        "Who this person is",
        "What he/she is like",
        "How he/she shows happiness",
        "And explain why you think he/she is a happy person"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p2_photoperson",
    type: "P2",
    period: "2026-09-20",
    isNew: true,
    frequency: "high",
    category: "人物",
    titleEn: "A person who likes taking photos",
    titleZh: "喜欢拍照的人",
    promptEn: "Describe a person you know who really likes taking photos",
    promptZh: "描述一个你认识的非常喜欢拍照的人。",
    youShouldSay: [
        "Who the person is",
        "When and how you got to know him/her",
        "Where he/she takes photos",
        "And explain how you feel about him/her"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p2_eldersadmire",
    type: "P2",
    period: "2026-09-20",
    isNew: true,
    frequency: "high",
    category: "人物",
    titleEn: "An older person you admire",
    titleZh: "尊敬的比你年长的人",
    promptEn: "Describe someone who is older than you that you admire",
    promptZh: "描述一个你敬佩的比你年长的人。",
    youShouldSay: [
        "Who this person is",
        "How you knew this person",
        "What kinds of things you like to do together",
        "And explain how you feel about this person"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p2_handmade",
    type: "P2",
    period: "2026-09-20",
    isNew: true,
    frequency: "high",
    category: "人物",
    titleEn: "A person who is good at making things by hand",
    titleZh: "擅长做手工的人",
    promptEn: "Describe a person who is good at making things by hand",
    promptZh: "描述一个擅长手工制作的人。",
    youShouldSay: [
        "Who this person is",
        "What he/she makes",
        "What materials or technologies he/she uses",
        "And why you think this person is good at making things by hand"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p2_historyperson",
    type: "P2",
    period: "2026-09-20",
    isNew: true,
    frequency: "high",
    category: "人物",
    titleEn: "A person who loves learning history",
    titleZh: "学习并喜欢历史的人",
    promptEn: "Describe a person who learns history and loves history",
    promptZh: "描述一个学习历史并热爱历史的人。",
    youShouldSay: [
        "Who this person is",
        "How he/she learns history",
        "Why he/she loves history",
        "And explain how you feel about him/her"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p2_teamwork",
    type: "P2",
    period: "2026-09-20",
    isNew: false,
    frequency: "high",
    category: "事件",
    titleEn: "Working in a team",
    titleZh: "在团队中工作",
    promptEn: "Describe a time when you worked in a group",
    promptZh: "描述一次你在团队中工作的经历。",
    youShouldSay: [
        "What you did",
        "Who you worked with",
        "What problems you faced",
        "And explain why you worked in the group"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p2_metonce",
    type: "P2",
    period: "2026-09-20",
    isNew: true,
    frequency: "high",
    category: "人物",
    titleEn: "A person you only met once",
    titleZh: "只见过一次想了解的人",
    promptEn: "Describe a person you only met once recently and want to know more about",
    promptZh: "描述一个你最近只见过一次、但想更多了解的人。",
    youShouldSay: [
        "Who this person is",
        "When and where you met him or her",
        "What you talked about",
        "And explain why you want to know more about him or her"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
    /* ===== P2 · 中频（12 题） ===== */
{
    id: "sb_p2_naturalplace",
    type: "P2",
    period: "2026-09-20",
    isNew: true,
    frequency: "medium",
    category: "地点",
    titleEn: "A natural place in your city you enjoy",
    titleZh: "喜欢的城市自然之地",
    promptEn: "Describe a natural place in your city that you enjoy visiting",
    promptZh: "描述一个你所在城市里你喜欢去的自然之地。",
    youShouldSay: [
        "Where it is",
        "What it is like",
        "How often you go there",
        "Who you often go there with",
        "And explain why you enjoy visiting there"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p2_tallbuilding",
    type: "P2",
    period: "2026-09-20",
    isNew: false,
    frequency: "medium",
    category: "地点",
    titleEn: "A tall building you like or dislike",
    titleZh: "喜欢或不喜欢的高建筑",
    promptEn: "Describe a tall building you like or dislike",
    promptZh: "描述一栋你喜欢或不喜欢的高建筑。",
    youShouldSay: [
        "What it is used for",
        "Where it is",
        "What it looks like",
        "And explain why you like/dislike it"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p2_decision",
    type: "P2",
    period: "2026-09-20",
    isNew: false,
    frequency: "medium",
    category: "事件",
    titleEn: "An important decision you made",
    titleZh: "重要决定",
    promptEn: "Describe an important decision that you made",
    promptZh: "描述你做出的一个重要决定。",
    youShouldSay: [
        "What the decision was",
        "How you made your decision",
        "What the results of the decision were",
        "And explain why it was important"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p2_interviewceleb",
    type: "P2",
    period: "2026-09-20",
    isNew: true,
    frequency: "medium",
    category: "事件",
    titleEn: "A time you watched a famous person being interviewed",
    titleZh: "看过的名人采访",
    promptEn: "Describe a time you watched a famous person being interviewed",
    promptZh: "描述一次你观看名人接受采访的经历。",
    youShouldSay: [
        "Who the famous person was",
        "What the interview was about",
        "When and where you watched the interview",
        "And explain how you felt about the interview"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p2_childskill",
    type: "P2",
    period: "2026-09-20",
    isNew: true,
    frequency: "medium",
    category: "事件",
    titleEn: "A new skill you learned as a child",
    titleZh: "小时候学到的新技能",
    promptEn: "Describe a new skill you learned when you were a child",
    promptZh: "描述一项你小时候学到的新技能。",
    youShouldSay: [
        "What the skill was",
        "Who taught you this skill",
        "How you learned it",
        "And explain how you felt about learning the skill"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p2_wastetime",
    type: "P2",
    period: "2026-09-20",
    isNew: true,
    frequency: "medium",
    category: "事件",
    titleEn: "An activity that is a waste of time",
    titleZh: "浪费时间的活动",
    promptEn: "Describe an activity you do regularly that you think is a waste of time",
    promptZh: "描述一项你经常做但觉得浪费时间的活动。",
    youShouldSay: [
        "What it is",
        "When you usually do it",
        "Why you do it",
        "And explain why you think it is a waste of time"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p2_medperson",
    type: "P2",
    period: "2026-09-20",
    isNew: false,
    frequency: "medium",
    category: "人物",
    titleEn: "A person who wants a career in medicine",
    titleZh: "想从事医疗行业的人",
    promptEn: "Describe a person you know who would like to choose a career in the medical field (e.g. a doctor, a nurse)",
    promptZh: "描述一个你认识的想从事医疗行业（如医生、护士）的人。",
    youShouldSay: [
        "When you knew him/her",
        "When he/she started to think about that",
        "What he/she would like to do",
        "And explain why he/she would like to choose this career"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "可套Leo母本(想从医)",
    proficiency: "没练"
},
{
    id: "sb_p2_planchange",
    type: "P2",
    period: "2026-09-20",
    isNew: false,
    frequency: "medium",
    category: "事件",
    titleEn: "A plan you had to change recently",
    titleZh: "近期改变的计划",
    promptEn: "Describe a plan that you had to change recently",
    promptZh: "描述一个你最近不得不改变的计划。",
    youShouldSay: [
        "When this happened",
        "What made you change the plan",
        "What the new plan was",
        "And how you felt about the change"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p2_changemind",
    type: "P2",
    period: "2026-09-20",
    isNew: false,
    frequency: "medium",
    category: "事件",
    titleEn: "A time you changed an important opinion",
    titleZh: "改变重要想法",
    promptEn: "Describe a time when you changed an important opinion of yours",
    promptZh: "描述一次你改变重要想法的经历。",
    youShouldSay: [
        "When you changed your opinion",
        "What the original opinion was",
        "Why you changed it",
        "And explain how you felt about the experience"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p2_localnews",
    type: "P2",
    period: "2026-09-20",
    isNew: false,
    frequency: "medium",
    category: "事件",
    titleEn: "A piece of local news",
    titleZh: "当地新闻",
    promptEn: "Describe a piece of local news that people are interested in",
    promptZh: "描述一则人们感兴趣的当地新闻。",
    youShouldSay: [
        "What it was about",
        "Where you saw/heard it",
        "Who was involved",
        "And explain why people were interested in it"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p2_brokenrepaired",
    type: "P2",
    period: "2026-09-20",
    isNew: true,
    frequency: "medium",
    category: "事物",
    titleEn: "Something broken and repaired",
    titleZh: "家里坏了修好的东西",
    promptEn: "Describe something that was broken in your home and then repaired",
    promptZh: "描述一个你家里坏了然后修好的东西。",
    youShouldSay: [
        "What it is",
        "How it was broken",
        "How you got it repaired",
        "And explain how you felt about it"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p2_traditionalcelebration",
    type: "P2",
    period: "2026-09-20",
    isNew: true,
    frequency: "medium",
    category: "事件",
    titleEn: "A traditional celebration",
    titleZh: "传统庆祝",
    promptEn: "Describe a traditional celebration in your country",
    promptZh: "描述你国家的一个传统庆祝活动。",
    youShouldSay: [
        "What it is",
        "When it is held",
        "How people celebrate it",
        "And explain how you feel about it"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
    /* ===== P2 · 低频（11 题） ===== */
{
    id: "sb_p2_organized",
    type: "P2",
    period: "2026-09-20",
    isNew: true,
    frequency: "low",
    category: "人物",
    titleEn: "A person you know who is very organized",
    titleZh: "有条理的人",
    promptEn: "Describe a person you know who is very organized",
    promptZh: "描述一个你认识的非常有条理的人。",
    youShouldSay: [
        "Who this person is",
        "What this person usually does to stay organized",
        "In what situations you have noticed this quality",
        "And explain why you think being organized is important to him/her"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p2_noisyplace",
    type: "P2",
    period: "2026-09-20",
    isNew: true,
    frequency: "low",
    category: "地点",
    titleEn: "A noisy place you have been to",
    titleZh: "嘈杂地",
    promptEn: "Describe a noisy place you have been to",
    promptZh: "描述一个你去过的嘈杂的地方。",
    youShouldSay: [
        "Where it is",
        "When you went there",
        "What you did there",
        "And explain why you feel it’s a noisy place"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p2_savingmoney",
    type: "P2",
    period: "2026-09-20",
    isNew: true,
    frequency: "low",
    category: "事件",
    titleEn: "A time you saved money to buy something special",
    titleZh: "攒钱买特别物品",
    promptEn: "Describe a time when you saved money to buy something special",
    promptZh: "描述一次你攒钱买特别物品的经历。",
    youShouldSay: [
        "What the special thing was",
        "Why you wanted to buy it",
        "How you saved money for it",
        "And explain how you felt after buying it"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p2_eveningfriends",
    type: "P2",
    period: "2026-09-20",
    isNew: true,
    frequency: "low",
    category: "事件",
    titleEn: "An enjoyable evening with friends",
    titleZh: "和朋友度过的愉快夜晚",
    promptEn: "Describe an enjoyable evening you had with your friends",
    promptZh: "描述一个你和朋友一起度过的愉快夜晚。",
    youShouldSay: [
        "When and where it was",
        "What you did",
        "Who you spent the evening with",
        "And explain why it was enjoyable"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p2_video",
    type: "P2",
    period: "2026-09-20",
    isNew: false,
    frequency: "low",
    category: "事物",
    titleEn: "An interesting video",
    titleZh: "有趣视频",
    promptEn: "Describe an interesting video",
    promptZh: "描述一个有趣的视频。",
    youShouldSay: [
        "When and where you watched it",
        "What it is about",
        "Why you watched it",
        "And explain how you feel about it"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p2_earlyrise",
    type: "P2",
    period: "2026-09-20",
    isNew: false,
    frequency: "low",
    category: "事件",
    titleEn: "A time when you got up early",
    titleZh: "早起经历",
    promptEn: "Describe a time when you got up early",
    promptZh: "描述一次你早起的经历。",
    youShouldSay: [
        "When it was",
        "What you did",
        "Why you got up early",
        "And how you felt about it"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p2_newlaw",
    type: "P2",
    period: "2026-09-20",
    isNew: false,
    frequency: "low",
    category: "事件",
    titleEn: "A new law you would like to introduce",
    titleZh: "想颁布的新法律",
    promptEn: "Describe a new law you would like to introduce in your country",
    promptZh: "描述一项你想在国家颁布的新法律。",
    youShouldSay: [
        "What law it is",
        "What changes this law brings",
        "Whether this new law will be popular",
        "How you came up with the new law",
        "And explain how you feel about this new law"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "可套舅舅母本",
    proficiency: "没练"
},
{
    id: "sb_p2_childhoodfriend",
    type: "P2",
    period: "2026-09-20",
    isNew: false,
    frequency: "low",
    category: "人物",
    titleEn: "A friend from your childhood",
    titleZh: "发小",
    promptEn: "Describe a friend from your childhood",
    promptZh: "描述一个你童年时的朋友。",
    youShouldSay: [
        "Who he/she is",
        "Where and how you met each other",
        "What you often did together",
        "And explain what made you like him/her"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "可套妹妹母本(发小)",
    proficiency: "没练"
},
{
    id: "sb_p2_recommendplace",
    type: "P2",
    period: "2026-09-20",
    isNew: false,
    frequency: "low",
    category: "地点",
    titleEn: "A place you travelled and would recommend",
    titleZh: "推荐旅行过的地方",
    promptEn: "Describe a place you have travelled to that you would like to recommend to others",
    promptZh: "描述一个你去旅行过并想推荐给别人的地方。",
    youShouldSay: [
        "What it is",
        "Where it is",
        "What you saw and did there",
        "And explain why you would like to recommend it to others"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p2_animalstory",
    type: "P2",
    period: "2026-09-20",
    isNew: false,
    frequency: "low",
    category: "事件",
    titleEn: "A story/book with animals in it",
    titleZh: "包含动物的故事或书",
    promptEn: "Describe a story/book with animals in it",
    promptZh: "描述一个包含动物的故事或一本书。",
    youShouldSay: [
        "What animals are in it",
        "What the story/book is about",
        "Why you read the story/book",
        "And explain what you think of this story/book"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
{
    id: "sb_p2_uninterested",
    type: "P2",
    period: "2026-09-20",
    isNew: true,
    frequency: "low",
    category: "事件",
    titleEn: "Listening to something not interesting",
    titleZh: "听不感兴趣的话",
    promptEn: "Describe a time when someone talked about something you were not interested in but you kept listening",
    promptZh: "描述一次别人谈论你不感兴趣的话题但你继续听的经历。",
    youShouldSay: [
        "Who the person was",
        "What he/she talked about",
        "Why you kept listening",
        "And explain how you felt about the experience"
    ],
    questions: [],
    cue: "",
    content: "",
    keywords: "",
    linkedTo: "",
    proficiency: "没练"
},
];

/* 口语题库版本号：每次题库大改（删题/建题/调档位）递增。
 * hubLoad 检测到本地 DATA.speakingVersion 落后于此值，则整体用最新库替换本地旧库，
 * 根治「旧 localStorage 累积 100+ 题 / 档位错乱清不掉」的问题（用户刷新即生效，无需手动清缓存）。 */
/* 9/15：v10 已被部分浏览器以旧 frequency 污染（merge 曾回填本地档位），bump 11 强制全量重迁移。
 * 9/19：bump 12 修复「刷新永久丢 1 题」——12 个页面顶部 autoCleanOldBank 把 sb_p1_home 写进脏 id 剔除名单，
 *       而它已是官方题库的合法 P1 题（Home/accommodation，9 小问），每次刷新被删一次（83→82）且版本未变不重迁移。
 *       bump 后强制跑一次 mergeSpeakingKeepAnswers：官方题全量补回，用户答案/串题按 id 保留。
 * 9/23：bump 14 取消口语「删除黑名单」——官方题一律不隐藏（她拍板：题库里的题都要练），
 *       并一次性清掉本地 sb_ 开头的旧墓碑；被拉黑过的题本版本重跑合并后全量回归（100 题）。 */
const SPEAKING_BANK_VERSION = 16;
/* 🔴 10/6 她反馈：「我每次好像更新题库都会看到那个黄色框…题库不是一年更新 4 次吗？不是说每次小更新它都要出现。
   小更新（只改频次、只加几道题）不用出现，只有整季换题库（5-8 月 → 9-12 月）才出现。」
   根因：横幅判断只看 SPEAKING_BANK_VERSION，而它**每次改题库都会 +1**（含频次调整、加几道题）。
   它本身没错——它管的是「题库进度要不要自愈」；错在拿它当「素材映射是否失效」的判据。
   所以另立这个季节常量：**只有换季才改它**，换季提示只看它。
   取值 = 当季起始月（5-8 月季 = '2026-05'，9-12 月季 = '2026-09'）。换季时改这一行即可。 */
const SPEAKING_BANK_SEASON = '2026-09';

/* 口语题库元信息（design/81）：换库时只改 VERSION + META 两处，页面 banner 与题数全部现算，
   不再在 speaking.html 里硬编码季度/日期/题数（硬编码必然随换库过期）。 */
const SPEAKING_BANK_META = {
  season: '2026 年 9–12 月',
  region: '大陆考区',
  updated: '2026-10-05',
  note: '1005 版：基于9月考生回忆重排，删39道零出现题、增10道新题，P1 27 / P2 32 = 59 题；P1四档（必考题/高频/中频/低频），P2三档（高频/中频/低频）。'
};

/* 口语合并：以官方 SPEAKING_BANK 为基准，保留用户个人内容、丢弃非官方题。
   入参 localSpeaking = 用户本地/导入的口语数组（可能含旧 100+ 题、框架母本、已填 answers）。
   返回 = 与官方题库一一对应的新数组，仅回填用户同 id 题的个人内容（answers/串题答案/练习 records），
   绝不新增官方库以外的题、绝不覆盖官方题干。供 hubLoad 版本合并与 importData 导入共用。 */
/* 9/15 v9：万年老题 P1 小问题精简去重后，旧 answers 键（小题序号）会错位。
   这里按「题干文本」把旧 answers 重映射到新序号：题干在新库的，答案跟着题干走；
   被合并掉的问题，其答案一并丢弃。P2 的 answers.p2（无小题概念）原样保留。
   本地缺 questions 数组（异常旧数据）时退化为按原索引兜底（仍在官方范围内的才保留）。 */
function remapP1AnswersByQuestion(official, local){
  const a = local.answers || {};
  const out = {};
  const oldQs = Array.isArray(local.questions) ? local.questions : null;
  const newTextToIdx = {};
  (official.questions || []).forEach((q, i) => { if(newTextToIdx[q] == null) newTextToIdx[q] = i; });
  Object.keys(a).forEach(k => {
    if(k === 'p2'){ out.p2 = a[k]; return; }
    const idx = Number(k);
    if(isNaN(idx) || idx < 0) return;
    let target = -1;
    const oldText = oldQs ? oldQs[idx] : ((official.questions || [])[idx]);
    if(oldText != null && newTextToIdx[oldText] != null) target = newTextToIdx[oldText];
    else if(!oldQs && official.questions && idx < official.questions.length) target = idx;
    if(target >= 0) out[target] = a[k];
  });
  return out;
}

function mergeSpeakingKeepAnswers(localSpeaking){
  if(!SPEAKING_BANK || !SPEAKING_BANK.length) return localSpeaking || [];
  /* 9/23 她拍板：口语官方题不设黑名单——「题库里的题肯定都是要练的」。
     原先这里用 deletedIds + settings.deletedSpeakingIds 过滤官方题（历史遗留：旧版本有「删除本题」按钮，
     删过的题记为墓碑，换季不再复活），结果官方库 100 题在她浏览器只显示 99（P1 被拉黑 1 题）。
     官方题库是考试范围，题本身不该被隐藏；个人不想练的题靠频次排序/自己跳过即可。
     ⚠️ deletedIds 仍服务于单词墓碑(en:)、素材/写作模板墓碑，只不再作用于口语题。 */
  const localById = {};
  (localSpeaking || []).forEach(s => { if(s && s.id) localById[s.id] = s; });
  return SPEAKING_BANK
    .map(official => {
      const local = localById[official.id];
      if(!local) return Object.assign({}, official);
      const keep = Object.assign({}, official);
      if(local.answers) keep.answers = remapP1AnswersByQuestion(official, local);
      if(local.speakingStories) keep.speakingStories = local.speakingStories;
      if(local.titleZh) keep.titleZh = local.titleZh;
      // 9/15 之之实锤：本地旧 frequency 绝不能回填——频次是题库官方属性，不是用户个人内容。
      // 旧这行让 localStorage 旧档位永远压掉官方新档位（表现=线上改了频次、她浏览器死活不变，
      // 且 speakingVersion 已同步写 10 后门控不再触发迁移，刷新永远无效）。个人内容仅限
      // answers / speakingStories / titleZh；category 同理以官方库为准。
      return keep;
    });
}

/* 强制清旧题库（autoCleanOldSpeakingBank）已于 2026-08-24 退役。
 * 原逻辑会 localStorage.removeItem(HUB_KEY) 整锅清空用户全部学习数据 + location.reload()，
 * 既导致「登录/学习数据频繁丢失」（见用户多轮反馈），又在口语/写作页打开时触发整页重载（表现为卡顿/跳一下）。
 * 题库更新现由 hubLoad 内的 mergeSpeakingKeepAnswers() 安全处理：
 *   以官方 SPEAKING_BANK 为唯一基准，旧脏 id 自然被丢弃、用户已填答案按 id 保留，绝不整锅清数据、绝不 reload。
 * 故此处不再有任何清空/重载逻辑。 */




const MED_DURATION_MS = 12 * 3600 * 1000;

let DATA = {
  sessions: [],
  notes: [],
  meds: [],
  words: [],
  plans: [],
  materials: null,   // 万能素材 store：null=未迁移；迁移后 {persona, materials:[], gaps:[], answers:{}}
  corpus: [],
  activeTimer: null,   // 进行中计时的跨设备镜像：{moduleId,...,startTs,paused,pauseStart,pauseAccum,targetSec,mode,updatedAt}；结束后为 {ended:true,updatedAt}
  scores: [],
  settings: {
    name: '',
    examDate: '',
    examDates: [],
    theme: 'light',
    dailyGoalHours: 0,
    targets: { overall: 0, listening: 0, reading: 0, writing: 0, speaking: 0 },
    relayToken: '',
    syncCode: '',
    autoSync: true,
    diagnosis: null,   // 10/2 备考诊断（第三十三批）：诊断问卷+评定结果+时段容量，整体子对象；合并走 SYNC_SETTINGS_FIELDS 字段级较新者胜
    planLastOpen: '',  // 10/2 commit4：最近一次打开「今日计划」的日期（YYYY-MM-DD），3 天未回来提示重排；字段级同步
    // 10/3 头像选择：只存 img/avatars/ 下的文件名（不是图片本身），云同步只带几十字节。
    // 用户头像 8 个（open-peeps 女 4 / 男 4，DiceBear CC0 免署名）；考官头像 2 个（avataaars，更精细）。
    avatar: 'user-f1',
    examAvatar: 'exam-f',
    _fieldTs: {}
  },
  errorbook: [],
  longSent: [],           // 长难句拆解记录（合并进「词句」页，由 corpus.js 读写；errorbook.js 已撤并为跳转页）
  energy: [],
  checkins: [],
  mockRecords: [],
  deletedIds: [],   // 全局墓碑：所有删除操作的 raw id 集合，跨同步传播删除
  revivedIds: [],   // 反向墓碑（9/17）：单词被「加回来」的 key（'en:'+小写），随同步 union 传播；合并时 deleted \ revived
  deletedWrongKeys: [],   // 错句级墓碑：已删「标准句+错误写法」组合 key（sourceId|right|wrong），跨同步传播错句本/默写详情的单处删除
  coachMem: [],     // 10/3 AI 陪练长期记忆：[{t:时间戳, text:中文短句}]（她的常错点/喜好/长期要求）；mergeData 按 text 跨设备并集；她可在陪练里「全部忘记」
  speaking: SPEAKING_BANK,   // 纯官方题库（题目），框架母本(sp_p1_*/sp_p2_*)已移除，不再混入任何框架类内容
  speakingStories: [],
  writingScores: [],
  dictationSources: [],   // 默写本：[{id,title,text,createdAt}]
  dictationLogs: [],      // 错处记录：[{id,sourceId,sourceTitle,date,userText,correctText,mistakes,weakThisTime,parsed}]
  writing: [
    { id:'wt_a', level:'5.5', category:'动态图', title:'动态图（线/柱带年份）', skeleton:'The 【chart / graph / table】 illustrates 【图内容+时间范围】. The data is measured in 【percent / millions / thousands】, providing a clear overview of the changes that took place over the given period.\n\nOverall, it is clear that 【总体趋势 1】. Additionally, 【总体趋势 2·名词短语】 stood out throughout the period as the most striking feature. It is also noticeable that the figures changed clearly over the period, rather than remaining steady.\n\nLooking at the details, 【数据 1】 started at 【数值】 in 【年份】 and then 【趋势变化 + 趋势词】. This represents a considerable increase compared to its starting point, and the upward momentum remained consistent across most of the timeframe.\n\nIn contrast, 【数据 2】 showed a different pattern. It 【趋势变化】, from 【数值】 in 【年份】 to 【数值】 in 【年份】. Meanwhile, 【其他数据点】 remained relatively stable, showing little variation. Taken together, the data reveals a clear divergence between the two groups.', tips:'结构：开头改写｜概述(2个总体)｜细节1(写一组)｜细节2(对比另一组)。必背趋势词：rose steadily / declined gradually / remained stable at / reached a peak of / accounted for / compared to。填空直接抄题干改写与数值，不自己造。' },
    { id:'wt_b', level:'5.5', category:'静态图', title:'静态图（饼/表/静态柱）', skeleton:'The 【pie chart / table / charts】 illustrates 【图内容+时间(若有)】. The data is measured in 【percent / number of people】, giving a clear picture of the distribution of 【总类】.\n\nOverall, it is clear that 【最大类·名词短语】 accounted for the largest share, at 【数值】%. Additionally, the contrast between the top and bottom categories stood out as the most striking feature. It is also noticeable that the remaining categories were considerably smaller, showing a clear gap rather than an even spread.\n\nLooking at the details, 【最大类】 represented 【数值】%, which was the most significant. 【类 2】 followed at 【数值】%, while 【类 3】 made up 【数值】%.\n\nMeanwhile, 【类 4】 remained relatively minor, at 【数值】%. 【类 5】 showed a different pattern, reaching 【数值】%. Taken together, the data reveals a clear gap between the top and bottom categories.', tips:'用于饼图/表格/无时间轴柱图/混合图。必背占比词：accounted for the largest share / made up the smallest proportion / followed at / compared to。与§六时间轴模板不混用。' },
    { id:'wt_c', level:'5.5', category:'地图题', title:'地图题（改造前后对比）', skeleton:'The two maps illustrate the changes made to 【地方】 before and after 【事件 / redesign】. Overall, the area has been significantly reorganized, with new facilities added and some original areas removed or repurposed.\n\nPreviously, 【原布局·填短语】 was located in the 【方位·填短语】. This has been divided into 【新分区·填短语】, and the 【消失的部分·填短语】 has been removed completely.\n\nSeveral new features have been added. 【新增 1·填短语】 has been introduced along the 【方位】, and 【新增 2·填短语】 has been built at the 【方位】. Meanwhile, 【不变的部分·填短语】 remains in the same position.', tips:'被动语态 + 方位词两套逻辑。必背被动8个(was located / has been replaced by / removed / added / divided into / relocated / remains / extended) + 方位10个(north/south/east/west/corner/centre/left/right/next to/between)。' },
    { id:'wt_d', level:'5.5', category:'流程图', title:'流程图（自然过程/工序/循环）', skeleton:'The diagram illustrates how 【过程是什么·填短语】 is formed through 【关键条件·填短语】. Overall, the process consists of several key stages, starting from 【起点】 and ending with 【终点 / 结果】.\n\nFirst, 【原材料/起始物·填短语】 approaches 【地点】. Then, as it hits 【阻碍物·填短语】, it is pushed upwards and rises. When the air rises, it cools and 【结果 1·填短语】 forms above.\n\nOnce 【条件·填短语】, 【动作·填短语】 falls on 【位置·填短语】. After this, 【后续物·填短语】 continues over 【地点】 and moves down. Finally, these 【终点物·填短语】 reach 【终点】, where 【最终结果·填短语】, creating 【产物·填短语】.', tips:'顺序连接词(First/Then/Once/Finally) + 被动主动混合。必背动词8个(approaches/reaches/is pushed upwards/rises and cools/forms/falls/continues/results in)。' },
    { id:'wt_ba', level:'5.5', category:'观点型', title:'观点型（第一优先背）', skeleton:'These days, 【话题】 has become a common topic. I strongly agree that 【观点】. This is an important issue, because its effects reach far beyond the situation we see now.\n\nFirst of all, 【核心主题】 undoubtedly brings substantial benefits. A clear advantage is that it improves 【普适领域】 and helps build a solid base for 【进阶目标】. This means we can get quick results and long-term value at the same time. Another good point is that it solves the root of the problem by getting rid of 【潜在原因】. For example, this has helped many people and improved life satisfaction. This then creates a ripple effect that helps a wide range of people in their daily lives.\n\nHowever, opponents may argue that 【反方观点】. Still, this benefit may not last long, because the effect fades away once 【简单条件】. More importantly, these short-term gains often hide deeper problems that quick fixes cannot solve. In the end, the problems caused by ignoring the real issue are much bigger than any short-term comfort it gives.\n\nIn summary, for all the reasons above, I totally agree with 【话题】. On the one hand, it brings benefits; on the other hand, its downsides are limited. Therefore, the overall impact should be viewed as largely positive.', tips:'选一边站(agree固定)。【话题】题干词换进去；动词开头加 -ing。结尾【话题】= 开头 -ing 短语原样再抄。填空直接抄：普适领域/进阶目标用万能短语(people\'s well-being / quality of life / living standards)。' },
    { id:'wt_bb', level:'5.5', category:'讨论型', title:'讨论型（第二优先背）', skeleton:'People have different opinions about 【话题】. Some think 【观点 A】, while others believe 【观点 B】. After thinking about both sides, I agree more with the latter one.\n\nOn the one hand, the first view has some truth. People who support it believe it brings real benefits to 【普适领域】. A clear advantage is that it improves 【普适领域】 and helps build a solid base for 【进阶目标】. This means we can get quick results and long-term value at the same time. For example, this has helped many people and improved life satisfaction. This then creates a ripple effect that helps a wide range of people in their daily lives.\n\nOn the other hand, I support the second view. In my opinion, 【观点 B 核心理由】 matters more in the long run. This is because if we do not fix this basic problem first, the good results will not last. More importantly, these short-term gains often hide deeper problems that quick fixes cannot solve. In the end, the problems caused by ignoring the real issue are much bigger than any short-term comfort it gives.\n\nIn conclusion, I believe 【立场】 is the better choice. On the one hand, it brings benefits; on the other hand, its downsides are limited. Therefore, the overall impact should be viewed as largely positive.', tips:'支持第二方(latter固定)。正文1客观讲对方道理(题目要求 discuss both views 必须写)，正文2驳论式。观点 A/B/立场填名词短语或 -ing 短语。' },
    // === 5.0 目标万能版（新增）===
    { id:'wt_a5', level:'5.5', category:'动态图', title:'动态图（线图/柱状图/变化图）完整背诵版', skeleton:'The 【chart / graph / table】 illustrates 【图内容+时间范围】. The data is measured in 【percent / millions / thousands】, providing a clear overview.\n\nOverall, it is clear that 【总体趋势 1】. Additionally, 【总体趋势 2】 stood out as the most striking feature. It is also noticeable that the figures changed clearly.\n\nLooking at the details, 【数据 1】 started at 【数值】 in 【年份】 and then 【趋势变化】. This was a big change. The number kept going up.\n\nIn contrast, 【数据 2】 showed a different pattern. It 【趋势变化】, from 【数值】 in 【年份】 to 【数值】 in 【年份】. Meanwhile, 【其他数据点】 remained relatively stable. There was little change.\n\nIn conclusion, the two groups were very different.', tips:'完整背诵版（动态图：线图/柱状图/变化图）。Overview 写两条总体趋势；Details 第一段写一个数据的起止变化，第二段用 In contrast 写另一数据的不同走向，Meanwhile 写稳定项。只填名词/数值，不自己造语法。' },
    { id:'wt_b5', level:'5.5', category:'静态图', title:'静态图（饼图/表格）完整背诵版', skeleton:'The 【pie chart / table / charts】 illustrates 【图内容+时间(若有)】. The data is measured in 【percent / number of people】, giving a clear overview.\n\nOverall, it is clear that 【最大类】 accounted for the largest share, at 【数值】%. Additionally, the biggest and smallest were very different. The others were much smaller.\n\nLooking at the details, 【最大类】 was 【数值】%. 【类 2】 was 【数值】%, and 【类 3】 was 【数值】%.\n\nMeanwhile, 【类 4】 was 【数值】%. 【类 5】 was 【数值】%.\n\nIn conclusion, the biggest and smallest were very different.', tips:'完整背诵版（静态图：饼图/表格）。Overview 写最大类占比+最大最小差异；Details 逐类列百分比，类别不够5个时写几类。只填名词/数值，不自己造语法。' },
    { id:'wt_c5a', level:'5.5', category:'地图题', title:'地图题（对比两个图）万能版', skeleton:'The two diagrams show 【图 A】 and 【图 B】. This gives a clear overview.\n\nOverall, it is clear that they are different. 【图 B】 is bigger and has more things.\n\nLooking at the details, 【图 A】 has 【物品 1】 and 【物品 2】. It is simple and small. In contrast, 【图 B】 has 【物品 3】 and 【物品 4】. There is also 【物品 5】 in 【图 B】, but 【图 A】 does not have it.\n\nIn conclusion, this is easy to understand. 【图 B】 is more comfortable, but 【图 A】 is cheaper.', tips:'对比两个图（房间A vs B / Plan A vs B / 两个设计图）。【图A/B】填图名（Plan A / the old room）；【物品1-5】填具体物件（a bed / a TV / a balcony）。约90词。只填名词短语，不自己造语法。' },
    { id:'wt_c5b', level:'5.5', category:'地图题', title:'地图题（before & after）万能版', skeleton:'The two maps show 【地方】 in 【年份 A】 and 【年份 B】. This gives a clear overview.\n\nOverall, it is clear that the area changed a lot. Some old things went away and many new things came.\n\nIn the past, there was 【旧 A】 in the north. Now it is 【新 A】. People took away the 【旧 B】 in the west. They built 【新 B】 there instead. This was a big change. 【新 C】 was built in the east, and 【新 D】 appeared in the south. However, the 【不变】 in the center did not change.\n\nIn conclusion, this is easy to understand. 【地方】 is very different now.', tips:'地图变化（before & after / 过去现在对比）。【地方】填公园/城镇/校园（the park / the town）；【年份】填 1990 / 2020；【旧A-新D】填方位+物件（a forest→a hotel / a playground）。约110词。只填名词短语，不自己造语法。' },
    { id:'wt_d5', level:'5.5', category:'流程图', title:'流程图（怎么做/怎么形成）万能版', skeleton:'The diagram shows how 【过程】 works. This gives a clear overview.\n\nOverall, it is clear that there are several steps. It starts from 【起点】 and ends with 【终点】.\n\nFirst, 【东西 A】 goes into 【地点 A】. Then it becomes 【东西 B】. Next, 【东西 B】 moves to 【地点 B】. After that, 【东西 C】 appears. It changes into 【东西 D】. This is very important. Finally, 【最终结果】 is finished. The process is complete.\n\nIn conclusion, this is easy to understand. It is very useful for people.', tips:'流程图（怎么做/怎么形成）。【过程】填主题（rainwater collection / making cheese）；【起点/终点】填原材料→产物（rain→clean water）；【东西A-结果】填各步骤物件（raw material / a machine / the product）。只填名词短语，不自己造语法。' },
    // === 大作文C Report 题型（2026-08-23 用户自制骨架，替换原 4 条 Report 模板）===
    /* 先亮立场 + 让步反驳（Body2 写反方观点再回击）；【】内为可选项：题干问“如何解决”时保留 However, I think the government should take action. */
    { id:'wt_cr3', level:'5.5', category:'观点型', title:'先表态再分析（万能版）', skeleton:'【话题】 is a problem that many people care about. From my perspective, 【话题】 is a serious problem, and this essay will discuss why it happens.\n\nFirst of all, there are several clear reasons why this happens. A clear advantage is that it improves 【普适领域】 and helps build a solid base for 【进阶目标】. This means we can get quick results and long-term value at the same time. Another good point is that it solves the root of the problem by getting rid of 【潜在原因】. For example, this has helped many people and improved life satisfaction. This then creates a ripple effect that helps a wide range of people in their daily lives. 【题目问解决时才加这句：However, I think the government should take action.】\n\nHowever, opponents may argue that 【反方观点】. Still, this benefit may not last long, because the effect fades away once 【简单条件】. More importantly, these short-term gains often hide deeper problems that quick fixes cannot solve. In the end, the problems caused by ignoring the real issue are much bigger than any short-term comfort it gives.\n\nIn conclusion, 【话题】 is a complex problem. On the one hand, it brings benefits; on the other hand, its downsides are limited. Therefore, the overall impact should be viewed as largely positive.', tips:'Report 题型（用户自制「先亮立场 + 让步反驳」万能骨架）。开头直接表态【话题】is a serious problem 并点明 discuss why it happens；Body1 写原因（strength / advantage 措辞，填【普适领域】【进阶目标】【潜在原因】）；Body2 先让步写【反方观点】再回击（【简单条件】让短期优势失效）。中间【题目问解决时才加这句：However, I think the government should take action.】只在题干问 how / what to do / solutions 时保留，否则整行删掉。只填名词短语，不自己造语法。' },
    /* ===== 6.0 档（10/10 批⑨）：比 5.5 档多一层从句与衔接，但**不堆砌**。
       全部为本项目自写文字（参照的第三方课程资料明确声明禁止传播、已在用律所维权，
       故只借「题型分类 + 每段功能」这类不受保护的方法，句子一律重写、不与原文对应）。 ===== */
    /* ===== 5.5 分档补缺（2026-10-11 新增）=====
       之前 5.5 档只有「观点型 / 讨论型 + 小作文」三类，优缺点型、双问题型、Report 全是空的。
       ⚠️ 顺带修正一处分类错误：wt_cr3「先表态再分析（万能版）」原本挂在 category:'Report' 下，
       但它开头就是 "From my perspective ..." —— **Report 题严禁表态**，挂在 Report 下会误导
       （尤其下面新加了真正的 Report 模板后，同一类下会出现两种互相矛盾的写法）。已改回「观点型」。 */
    { id:'wt_ad5', level:'5.5', category:'优缺点型', title:'优缺点型 · 5.5 分档', skeleton:'【话题】 is becoming more and more common in our daily life. Like most things, it has both good and bad sides. This essay will look at both of them.\n\nFirst, there are some clear advantages. The main one is that 【好处1】. Because of this, people can 【结果1】. Another good point is 【好处2】. This is helpful for 【受益人群】.\n\nHowever, there are also some problems. The biggest one is 【坏处1】. If we do not pay attention, it may cause 【后果】. Also, 【坏处2】 can bring trouble to 【受影响人群】.\n\nIn my opinion, the good points are more important than the bad ones. We should use 【话题】 in a good way, so that 【总结】.', tips:'五分半档：全篇用简单句，能背下来就行，别加从句。\n结构固定为「优点两条 → 缺点两条 → 我的判断」。【好处】和【坏处】都填名词短语，不要写完整句子 —— 自己硬造句子是最容易出错的地方。\n结尾一定要表态（In my opinion ... more important than ...），只列利弊不表态会扣分。' },
    { id:'wt_dq5', level:'5.5', category:'双问题型', title:'双问题型 · 5.5 分档（原因 + 对策）', skeleton:'Nowadays, 【现象】 is a common problem in many places. There are two questions to answer: why does it happen, and what can we do about it?\n\nThere are two main reasons. First, 【原因1】. This is because 【解释1】. Second, 【原因2】. Many people face this problem every day.\n\nTo solve it, we can take two steps. First, 【措施1】. This would help because 【作用1】. Second, 【措施2】. This is also useful for 【效果2】.\n\nIn conclusion, 【现象】 happens for clear reasons, and we can do something about it. If everyone takes action, the situation will get better.', tips:'五分半档：题干问两问就**必须两段各答一问**，漏答一问直接扣分。\n原因段用 First / Second 两条，对策段也用 First / Second 两条 —— 四条都按「一句结论 + 一句解释」写，最短最稳。\n【措施】填具体动作（如 build more parks、provide free classes），别写 people should try their best 这种空话。' },
    { id:'wt_rp5', level:'5.5', category:'Report', title:'Report · 5.5 分档（原因 + 影响）', skeleton:'In recent years, 【现象】 has become more common. This report will look at the causes of this problem and its effects on people.\n\nThere are two main causes. The first one is 【原因1】. For example, 【例子1】. The second one is 【原因2】. This makes the problem worse.\n\nThis situation has different effects. On one hand, it can 【正面影响】. On the other hand, it may also 【负面影响】. This is a problem for 【受影响人群】.\n\nIn conclusion, 【现象】 has several causes and different effects. We need to understand it better and find a way to deal with it.', tips:'五分半档：Report 题**不能表态**，全文别出现 I think / I agree，只做客观分析（6.5 档那篇的提示里也强调了这点，两篇要一致）。\n结构是「两条原因 → 一正一负两个影响 → 一句总结」，用 On one hand / On the other hand 对照写最清楚。\n【例子1】填一个具体场景（某个城市、某一类人），一句话就够，不用展开。' },
    { id:'wt6_op', level:'6.0', category:'观点型', title:'观点型 · 6 分档', skeleton:'Nowadays, the issue of 【话题】 has attracted considerable attention. Although some people disagree, I am strongly convinced that 【观点】. In the following paragraphs, I will explain why.\n\nTo begin with, there is no doubt that 【核心主题】 brings clear benefits. The most obvious one is its ability to improve 【普适领域】, which in turn helps people achieve 【进阶目标】. For example, when individuals are given the chance to 【具体做法】, they usually end up with better 【结果】. This pattern can be seen in many aspects of daily life.\n\nAdmittedly, some may argue that 【反方观点】. This concern is understandable. However, it can be largely solved if 【解决条件】. In other words, the problem lies not in 【核心主题】 itself but in how we manage it.\n\nIn conclusion, although 【话题】 is not perfect, its advantages clearly outweigh the possible risks. Therefore, I firmly support 【观点重申】.', tips:'六分档：比 5.5 版多加「which 定语从句」和「when 时间状语从句」各一处，别堆。开头【话题】原样抄题干、【观点】写简单句（I am convinced that + 主谓宾）。举例那句按「谁 + 做了什么 + 结果」三步填，不要只写空泛的 people。' },
    { id:'wt6_ds', level:'6.0', category:'讨论型', title:'讨论型 · 6 分档', skeleton:'People hold different views on 【话题】. Some believe that 【观点A】, while others argue that 【观点B】. In this essay, I will examine both sides before stating my own position.\n\nThose who support the first view point out that 【支持A的理由】. According to them, 【展开A一句】. This argument makes sense, especially when we consider 【具体情境】.\n\nOn the other hand, supporters of the second view claim that 【支持B的理由】. They believe that 【展开B一句】. For instance, 【例子】. This view also has its own logic.\n\nHaving considered both sides, I am more convinced by 【我的立场】. The main reason is that 【核心理由】. Although the opposite view is not entirely wrong, it does not outweigh the points above.', tips:'六分档：两边都要写实（题干要求 discuss both views，漏一边直接扣 TA）。结构是「A 的理由 → B 的理由 → 我选谁 + 为什么」。【我的立场】选一边写死，别骑墙；【核心理由】只写一句，多用简单句，避免自己造句出错。' },
    { id:'wt6_ad', level:'6.0', category:'优缺点型', title:'优缺点型 · 6 分档', skeleton:'In recent years, 【现象】 has become increasingly common. Like most changes, it brings both advantages and disadvantages. This essay will discuss them in turn.\n\nThe benefits are easy to see. First, 【话题】 allows people to 【好处1】, which is particularly valuable for 【受益人群】. Second, it helps to 【好处2】. Together, these advantages can greatly improve 【影响领域】.\n\nHowever, the drawbacks should not be ignored. One major concern is that 【坏处1】. If it is not handled properly, it may lead to 【后果】. In addition, 【坏处2】 could create further difficulties for 【受影响方】.\n\nTo sum up, 【话题】 is a double-edged sword. In my view, its advantages outweigh the disadvantages, as long as 【前提条件】.', tips:'六分档：利弊各写一段，每段两条、用 First / Second、One major concern / In addition 拉开层次。**最后必须给判断**（outweigh 哪边），只列利弊不表态会扣 TA。好处用名词短语、坏处用一句完整句子，避免全篇同一个句式。' },
    { id:'wt6_dq', level:'6.0', category:'双问题型', title:'双问题型 · 6 分档（原因 + 对策）', skeleton:'Nowadays, 【现象】 has drawn widespread attention. This essay will first look at the reasons behind it, and then suggest some practical solutions.\n\nThere are several reasons for this trend. The most important one is that 【原因1】, because 【解释1】. Another factor worth mentioning is 【原因2】, which is closely related to 【相关因素】.\n\nTo deal with this problem, action should be taken at different levels. One practical solution is to 【措施1】. This would work because 【作用1】. In addition, 【措施2】 should be encouraged so that 【效果2】.\n\nIn conclusion, 【现象】 results from a combination of factors, and it can be improved if 【总结条件】.', tips:'六分档：题干问两个问题就**必须两段各答一个**（漏一个直接扣 TA）。原因段用「最重要的 + 另一个」两条即可，不要罗列五条。对策要具体到能做（如 provide training / raise awareness），别写 people should try their best 这种空话。' },
    { id:'wt6_rp', level:'6.0', category:'Report', title:'Report · 6 分档（原因 + 影响）', skeleton:'【现象】 has become a subject of growing interest in recent years. This report will examine the main causes of this situation and discuss its possible effects.\n\nThe primary cause is 【原因1】. In many cases, 【解释1】. A second contributing factor is 【原因2】. For instance, 【举例】.\n\nThe effects are far-reaching. On the positive side, it may 【正面影响】. On the negative side, however, it could lead to 【负面影响】, which deserves our attention.\n\nIn summary, 【现象】 is driven by several factors and has mixed consequences. It is therefore important to 【建议】.', tips:'六分档：Report 题**不需要站队**，只客观分析。结构＝原因（两条）→ 影响（一正一负）→ 一句概括建议。注意全篇别出现 I strongly agree 这类表态，那是观点型才能用的。影响段用 On the positive side / On the negative side 对照写，层次最清楚。' },

    /* ===== 6.5 分档（2026-10-11 新增）=====
       档位升级逻辑（延续 6.0 的设计）：6.0 靠「句式变化」，6.5 靠「论证层次」——
       每段必须是「论点 → 为什么 → 具体例子 → 一句收口」四步，只给论点不解释就还是 6.0。
       另外两处：① 用词升级（important→crucial、good→beneficial、bad→counterproductive）
       ② 衔接升级（不再通篇 Firstly/Secondly，改用 This is largely because / which in turn / it follows that）
       全部本项目自写，与第三方资料原文做 8-gram 重合扫描为 0%。 */
    { id:'wt65_op', level:'6.5', category:'观点型', title:'观点型 · 6.5 分档', skeleton:'Over the past decade, 【话题】 has moved from a marginal concern to a mainstream one. Critics frequently warn that 【反方观点】, yet in my view this worry sidesteps the larger picture: 【你的立场】. Two arguments support my position.\n\nThe first is that 【理由1】. Behind this lies a simple mechanism — 【机理】 — which in turn enables 【结果】. A concrete illustration would be 【举例对象】: when 【具体情况】, it commonly results in 【具体结果】. The benefit, in other words, shows up in ordinary daily life rather than remaining on paper.\n\nThe second argument is more substantial. Because 【理由2】, it follows that 【推论】, and this effect is especially visible among 【受影响人群】. Opponents are right to note that 【反方的合理之处】; even so, that limitation tends to fade once 【前提条件】 is met.\n\nIn conclusion, the objections deserve attention but do not overturn the case. I therefore believe 【观点重申】, provided that we 【落地建议】 rather than merely 【回避做法】.', tips:'六分半档的关键是「每段四步」：论点 → 为什么 → 具体例子 → 一句收口。只给论点不解释，还停在六分水平。\n把基础词换掉：important → crucial / significant；good → beneficial；bad → damaging 或 counterproductive。\n衔接升级：别再通篇 Firstly / Secondly，用 This is largely because、which in turn、Because ... it follows that 替换几处。\n例子必须具体到某类人、某个场景或某个年份，避免 many people in the world 这种空例子。' },
    { id:'wt65_ds', level:'6.5', category:'讨论型', title:'讨论型 · 6.5 分档', skeleton:'Opinion remains divided over 【话题】. Those favouring the change argue that 【观点A】, whereas sceptics insist that 【观点B】. Both positions contain a measure of truth, and this essay will weigh each before reaching a conclusion.\n\nAdvocates rest their case on the claim that 【支持A的理由】. In practice this means that 【展开A】, as can be seen when 【具体情境】. To this extent their reasoning is sound.\n\nThe opposing camp, however, is right to highlight 【支持B的理由】. When 【条件】, the outcome is often 【负面结果】, and this is difficult to ignore. A case in point is 【例子】.\n\nWeighing these arguments, I lean towards 【我的立场】. My point is not that the rival view is groundless, but that its force is limited to narrow circumstances, whereas the argument I support holds in far more situations.', tips:'讨论型最常见的扣分 = 只写一边。**两边都必须写实**，且各自要有「理由 + 展开 + 一句例子」三步。\n最后一段不要骑墙：用 I lean towards 明确选一边，再说明「为什么这一边适用范围更广」——比单纯说 both are reasonable 高一档。\n【条件】/【例子】要填具体情境（某个年龄段、某类城市、某种职业），越具体越有说服力。' },
    { id:'wt65_ad', level:'6.5', category:'优缺点型', title:'优缺点型 · 6.5 分档', skeleton:'The rapid spread of 【现象】 has reshaped how 【相关人群】 go about their daily lives. Reactions have naturally been mixed, since any change of this scale brings gains and losses together.\n\nOn the positive side, the most immediate gain is that 【好处1】. This matters most for 【受益人群】, who would otherwise be unable to 【原本的困难】. Beyond that, 【好处2】 can help to improve 【影响领域】 in ways that were unavailable a generation ago.\n\nSet against this are two genuine drawbacks. The more serious is 【坏处1】; left unchecked, it may well result in 【后果】. Closely related is 【坏处2】, which places an extra burden on 【受影响方】.\n\nOverall, I take the view that the benefits carry greater weight than the costs, but only where 【前提条件】. Where that condition is absent, the balance tips the other way.', tips:'这一档的加分点在结尾：**不要只说「利大于弊」就停**，要补一句限定条件（but only where ... / provided that ...），显示你在权衡而不是背结论。\n优缺点各写两条，每条都要有「展开句 + 后果」，只列名词短语会被判为没写充分。\n替换词：优点段用 On the positive side / Beyond that；缺点段用 Set against this / Closely related is。' },
    { id:'wt65_dq', level:'6.5', category:'双问题型', title:'双问题型 · 6.5 分档（原因 + 对策）', skeleton:'【现象】 is no longer an isolated problem confined to one country or one age group. Understanding what drives it, and how it might be eased, is therefore a task worth taking seriously.\n\nAs for the causes, two stand out. First and foremost, 【原因1】 has played a decisive role, largely because 【解释1】. Running alongside it is 【原因2】, which tends to reinforce the same pattern rather than counteract it.\n\nTurning to remedies, no single measure will suffice. A first step would be 【措施1】, since this would directly reduce 【问题点】. More importantly, longer-term change depends on 【措施2】, without which any improvement is likely to prove temporary.\n\nIn short, the trend can be traced to identifiable causes and is not beyond remedy. Whether it actually improves will depend less on the measures themselves than on whether the will exists to carry them through.', tips:'双问题型**漏答一问会直接扣分**，两段之间要有清晰过渡词：As for the causes / Turning to remedies。\n对策段写成「短期措施 + 长期措施」两层，比并列三条更有说服力；第二条用 More importantly 引出最关键那条。\n结尾不要只重述，加一句判断（will depend less on ... than on ...），比单纯的 In conclusion 多一分思考深度。' },
    { id:'wt65_rp', level:'6.5', category:'Report', title:'Report · 6.5 分档（原因 + 影响）', skeleton:'The growing tendency towards 【现象】 deserves more than passing comment, since its consequences now reach well beyond the individuals directly involved.\n\nSeveral factors help account for it. Chief among them is 【原因1】; because 【解释1】, the effect is both predictable and difficult to reverse. A further factor is 【原因2】, whose influence has grown steadily as 【相关变化】.\n\nThe consequences, meanwhile, are not uniform. In the short term, 【现象】 may deliver 【正面影响】, especially for 【受益人群】. Over time, however, the more likely outcome is 【负面影响】, particularly where 【触发条件】. This dual character is precisely what makes the issue hard to settle.\n\nAll things considered, this is a trend with identifiable roots and mixed effects. How it develops from here will depend largely on whether 【关键变量】.', tips:'Report 题**不能表态**，全文别出现 I believe / I strongly agree，保持客观分析。\n影响段写成「短期正面 + 长期负面」的对比结构，层次立刻拉开，比罗列三好三坏更有深度。\n用时间层次的连接词：in the short term / over time / how it develops from here。' },

  ],
  writingPhrases: [
    // ===== 万能词组：按雅思话题领域分类，填进模板「填短语」的空（模板之外真正要补的内容搭配）=====
    // —— 教育（5）——
    { id:'wp_g1',  type:'词组', en:'enhance educational fairness', cn:'促进教育公平', tag:'教育' },
    { id:'wp_g2',  type:'词组', en:'promote career development',  cn:'促进职业发展', tag:'教育' },
    { id:'wp_g3',  type:'词组', en:'cultivate independent thinking', cn:'培养独立思考', tag:'教育' },
    { id:'wp_g4',  type:'词组', en:'reduce academic pressure',    cn:'减轻学业压力', tag:'教育' },
    { id:'wp_g5',  type:'词组', en:'broaden one’s horizons',      cn:'开阔眼界',     tag:'教育' },
    // —— 科技（5）——
    { id:'wp_g6',  type:'词组', en:'improve work efficiency',     cn:'提高工作效率', tag:'科技' },
    { id:'wp_g7',  type:'词组', en:'boost economic growth',       cn:'促进经济增长', tag:'科技' },
    { id:'wp_g8',  type:'词组', en:'raise privacy concerns',      cn:'引发隐私担忧', tag:'科技' },
    { id:'wp_g9',  type:'词组', en:'create job opportunities',    cn:'创造就业机会', tag:'科技' },
    { id:'wp_g10', type:'词组', en:'improve the quality of life', cn:'提高生活质量', tag:'科技' },
    // —— 环境（5）——
    { id:'wp_g11', type:'词组', en:'reduce carbon emissions',     cn:'减少碳排放',   tag:'环境' },
    { id:'wp_g12', type:'词组', en:'protect the environment',     cn:'保护环境',     tag:'环境' },
    { id:'wp_g13', type:'词组', en:'promote sustainable development', cn:'促进可持续发展', tag:'环境' },
    { id:'wp_g14', type:'词组', en:'encourage the use of renewable energy', cn:'鼓励使用可再生能源', tag:'环境' },
    { id:'wp_g15', type:'词组', en:'reduce pollution and waste',  cn:'减少污染和浪费', tag:'环境' },
    // —— 政府与社会（5）——
    { id:'wp_g16', type:'词组', en:'narrow the wealth gap',       cn:'缩小贫富差距', tag:'政府与社会' },
    { id:'wp_g17', type:'词组', en:'ensure social stability',     cn:'确保社会稳定', tag:'政府与社会' },
    { id:'wp_g18', type:'词组', en:'invest in infrastructure',    cn:'投资基础设施', tag:'政府与社会' },
    { id:'wp_g19', type:'词组', en:'support vulnerable groups',   cn:'支持弱势群体', tag:'政府与社会' },
    { id:'wp_g20', type:'词组', en:'improve the welfare system',  cn:'改善福利体系', tag:'政府与社会' },
    // —— 健康（5）——
    { id:'wp_g21', type:'词组', en:'improve physical health',     cn:'改善身体健康', tag:'健康' },
    { id:'wp_g22', type:'词组', en:'promote mental health',       cn:'促进心理健康', tag:'健康' },
    { id:'wp_g23', type:'词组', en:'reduce stress and anxiety',   cn:'减轻压力和焦虑', tag:'健康' },
    { id:'wp_g24', type:'词组', en:'encourage a healthy lifestyle', cn:'鼓励健康生活方式', tag:'健康' },
    { id:'wp_g25', type:'词组', en:'prevent the spread of diseases', cn:'预防疾病传播', tag:'健康' },
    // —— 工作与经济（5）——
    { id:'wp_g26', type:'词组', en:'achieve work-life balance',   cn:'实现工作与生活平衡', tag:'工作与经济' },
    { id:'wp_g27', type:'词组', en:'reduce unemployment rates',   cn:'降低失业率',   tag:'工作与经济' },
    { id:'wp_g28', type:'词组', en:'enhance professional skills', cn:'提升专业技能', tag:'工作与经济' },
    { id:'wp_g29', type:'词组', en:'encourage entrepreneurship',  cn:'鼓励创业',     tag:'工作与经济' },
    { id:'wp_g30', type:'词组', en:'improve living standards',    cn:'提高生活水平', tag:'工作与经济' },
    // —— 通用（3）——
    { id:'wp_g31', type:'词组', en:'benefit society as a whole',  cn:'造福整个社会', tag:'通用' },
    { id:'wp_g32', type:'词组', en:'improve people’s well-being', cn:'改善民众福祉', tag:'通用' },
    { id:'wp_g33', type:'词组', en:'lead to a better future',     cn:'通向更美好的未来', tag:'通用' },
    // —— 交通（来自题干词替换库，补全领域覆盖）——
    { id:'wp_g34', type:'词组', en:'smoother daily travel',       cn:'更顺畅的日常出行', tag:'交通' },
    { id:'wp_g35', type:'词组', en:'less commuting stress',       cn:'更少的通勤压力', tag:'交通' },
    // —— 社区/社会（来自题干词替换库）——
    { id:'wp_g36', type:'词组', en:'stronger local communities',  cn:'更紧密的本地社区', tag:'社区社会' },
    { id:'wp_g37', type:'词组', en:'people’s sense of belonging', cn:'人们的归属感', tag:'社区社会' },
    // —— 文化/媒体（来自题干词替换库）——
    { id:'wp_g38', type:'词组', en:'a richer cultural life',      cn:'更丰富的文化生活', tag:'文化媒体' },
    { id:'wp_g39', type:'词组', en:'more choices for free time',  cn:'更多闲暇选择', tag:'文化媒体' },

    // ===== 万能句式：现成语法正确句，只填 [ ] 里的名词/数字，零新增语法错（= 大作文预制理由库 + 原因/方案/意义/影响 补充）=====
    // —— 支持类（"X 是好事"用）——
    { id:'wp_j1',  type:'句式', en:'This saves [people’s] time and lets them focus more on [work or family].', cn:'这节省了[人们]的时间，让他们更专注于[工作或家庭]', tag:'支持类', example:'This saves people’s time and lets them focus more on work or family.' },
    { id:'wp_j2',  type:'句式', en:'It cuts the [financial] cost for [ordinary families].', cn:'它削减了[普通家庭]的[经济]成本', tag:'支持类', example:'It cuts the financial cost for ordinary families.' },
    { id:'wp_j3',  type:'句式', en:'It improves the [daily] life of [local residents].', cn:'它改善了[当地居民]的[日常]生活', tag:'支持类', example:'It improves the daily life of local residents.' },
    { id:'wp_j4',  type:'句式', en:'It creates more [job] opportunities in the [local] area.', cn:'它在[当地]创造了更多[就业]机会', tag:'支持类', example:'It creates more job opportunities in the local area.' },
    { id:'wp_j5',  type:'句式', en:'It reduces [air] pollution and protects the [natural] environment.', cn:'它减少[空气]污染，保护[自然]环境', tag:'支持类', example:'It reduces air pollution and protects the natural environment.' },
    { id:'wp_j6',  type:'句式', en:'It makes [public services] more accessible to [ordinary people].', cn:'它让[普通民众]更易获得[公共服务]', tag:'支持类', example:'It makes public services more accessible to ordinary people.' },
    // —— 反对类（"对手理由 + 回击"用）——
    { id:'wp_j7',  type:'句式', en:'Opponents worry that this may hurt [living comfort] and increase [traffic] pressure.', cn:'反对者担心这会损害[居住舒适度]并增加[交通]压力', tag:'反对类', example:'Opponents worry that this may hurt living comfort and increase traffic pressure.' },
    { id:'wp_j8',  type:'句式', en:'However, these problems can be solved by [better design and stricter rules].', cn:'然而，这些问题可通过[更好的设计与更严的规则]解决', tag:'反对类', example:'However, these problems can be solved by better design and stricter rules.' },
    { id:'wp_j9',  type:'句式', en:'The long-term benefits are greater than the [short-term] disadvantages.', cn:'长期收益大于[短期]弊端', tag:'反对类', example:'The long-term benefits are greater than the short-term disadvantages.' },
    // —— 补充：原因 / 方案 / 意义 / 影响（同一"只填名词空"模型）——
    { id:'wp_j10', type:'句式', en:'This plays a vital role in [children’s education].', cn:'这在[儿童教育]中起着至关重要的作用', tag:'意义', example:'This plays a vital role in children’s education.' },
    { id:'wp_j11', type:'句式', en:'The main reason is a [lack of public awareness].', cn:'主要原因是[公众意识不足]', tag:'原因', example:'The main reason is a lack of public awareness.' },
    { id:'wp_j12', type:'句式', en:'A practical measure is to [invest more in public transport].', cn:'一个切实可行的措施是[加大对公共交通的投入]', tag:'方案', example:'A practical measure is to invest more in public transport.' },
    { id:'wp_j13', type:'句式', en:'These changes mainly affect [young people] and [low-income families].', cn:'这些变化主要影响[年轻人]和[低收入家庭]', tag:'影响', example:'These changes mainly affect young people and low-income families.' }
  ]
};

// 写作模板默认值快照，用于迁移时补齐新增模板/回写标题（用户手动删过的不再恢复，由 deletedIds 控制）
const DEFAULT_WRITING_TEMPLATES = JSON.parse(JSON.stringify(DATA.writing));

let _hubLoaded = false;
/* 深合并：默认值基准，用户数据覆盖。
   - 对象字段递归合并；
   - 数组字段整体替换（不合并元素，避免新旧数组合并出重复/脏数据）；
   - 顶层字段以默认值为准，旧用户缺的字段自动补上，不会 undefined。 */
function deepMergeDefaults(def, user){
  if(user == null || typeof user !== 'object') return def;
  const out = Array.isArray(def) ? def.slice() : Object.assign({}, def);
  for(const k of Object.keys(user)){
    const uv = user[k];
    if(uv == null) continue;
    if(typeof uv === 'object' && !Array.isArray(uv) && typeof def[k] === 'object' && def[k] !== null){
      out[k] = deepMergeDefaults(def[k], uv);
    } else {
      out[k] = uv;
    }
  }
  return out;
}

function hubLoad(){
  if(_hubLoaded) return;   // 幂等：每次真实页面加载只解析一次 localStorage（data.js 求值 + common.js ready 两处调用只生效一次）
  _hubLoaded = true;
  try{
    if(!DATA || typeof DATA !== 'object') DATA = {};
    const raw = localStorage.getItem(HUB_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      // 仅当存储是合法对象时才合并；若被写成 "null"/"[]"/标量（异常写入），
      // 保留内存中的默认 DATA，避免刷新后「所有资料消失」
      if(parsed && typeof parsed === 'object' && !Array.isArray(parsed)){
        // 深合并：默认值为基准，用户数据覆盖；数组字段整体替换，顶层缺字段自动补
        DATA = deepMergeDefaults(DATA, parsed);
      } else {
        console.warn('本地数据结构异常，已忽略损坏的存储，沿用默认数据');
      }
    }
    // 账号凭证自愈：若主 blob 被清空/丢失 syncCode/relayToken（历史 autoClean removeItem 等 bug），
    // 从隔离凭证键回填，保证「登录状态/Key/手机号」跨会话可靠保留、不被意外清除。
    // ⚠️ 必须在 if(raw) 之外调用：当 HUB_KEY 整体被 removeItem 时 raw 为 null，
    //    若放在 if(raw) 内则永远跳过、凭证丢失（正是用户「退出重进东西又不见了」的真因）。
    restoreCredsIfMissing();
    // 兜底：确保所有数组字段非 undefined（极端损坏数据时也不崩）
    const arrayFields = ['sessions','notes','meds','words','plans','corpus','scores','errorbook',
      'energy','checkins','speaking','writing','writingScores','speakingStories','writingPhrases','mockRecords',
      'dictationSources','dictationLogs','longSent','deletedIds','revivedIds'];
    for(const f of arrayFields){ if(!Array.isArray(DATA[f])) DATA[f] = []; }
    // 2026-08-29 修复：早期默写记录(dictationLogs)可能无 id，删除墓碑(整条删光依赖 log.id)
    // 与部分删除的 updatedAt(合并按 id 取本地优先)都会失效，导致错句本「删了又复活」。
    // 全局补 uid，并 hubSave 触发上传，让云端也拿到带 id 的 log，消除合并分叉。
    if(Array.isArray(DATA.dictationLogs)){
      let _dmig = false;
      DATA.dictationLogs.forEach(l => { if(l && l.id == null){ l.id = uid(); _dmig = true; } });
      if(_dmig) hubSave();
    }
    // 9/23 冗余日志去重：8/23-24 旧版模板默写 bug 留下 5169 条内容完全相同的复制品（约 2.8MB UTF-16），
    // 把 iPhone Safari 5MB 配额撑爆 → 手机端保存失败/无法同步。签名去重幂等，仅在确有重复时落盘；
    // 本机清完后经云同步上行，云端与其它设备自动瘦身。
    (function dedupeDictationLogsAtLoad(){
      if(trimDictationDupes()) hubSave();
    })();
    if(!DATA.settings || typeof DATA.settings !== 'object') DATA.settings = {};
    // 服药模块默认值翻转（9/21）：新人默认关闭；升级前已记录过服药的老用户（站长本人）一次性显式开启，
    // 防止升级后入口消失。只处理 adhd===undefined；用户显式 false（主动关过）必须尊重，不覆盖。
    (function migrateMedsDefault(){
      if(DATA.settings.adhd !== undefined) return;
      if(Array.isArray(DATA.meds) && DATA.meds.length > 0){
        DATA.settings.adhd = true;
        if(!DATA.settings._fieldTs || typeof DATA.settings._fieldTs !== 'object') DATA.settings._fieldTs = {};
        DATA.settings._fieldTs.adhd = Date.now();   // 与 settings.js 保存口径一致，防止云同步被旧值覆盖
        hubSave();
      }
    })();
    // 口语题库版本控制（2026-08-23 重构：根治「升版本吞用户答案」）：
    //   以官方 SPEAKING_BANK（官方题库纯题目，题数以数组实际为准）为唯一基准，绝不整锅替换。
    //   合并规则：官方题永远保留；用户本地同 id 题的「个人内容」(answers/串题答案/练习 records)
    //   回填进官方题；本地多出来的非官方题（旧 100+ 题、框架母本 sp_p*）直接丢弃——
    //   实现用户要求：无论题库怎么升版本、导入什么旧数据，都只导「练过/填过的题的内容」，
    //   不新增官方库以外的题、不覆盖官方题。
    // 优化：仅在口语题库版本变化时才重跑合并 + 落盘；否则跳过，
    // 避免每次加载都做一次整库写盘（数据越大越卡）。
    // 9/23 一次性自愈：清掉历史残留的「口语题墓碑」（sb_ 开头）。
    //   合并已不再读它们，但 deletedIds 会随云同步 union 传播——不清理的话，
    //   另一台设备上传旧墓碑，本机合并后 deletedIds 里又出现 sb_* 条目（脏数据），
    //   且体积只增不减。只清 sb_ 前缀：单词墓碑(en:)、素材/写作模板墓碑一律不动。
    (function clearSpeakingTombstones(){
      let dirty = false;
      if(Array.isArray(DATA.deletedIds)){
        const before = DATA.deletedIds.length;
        DATA.deletedIds = DATA.deletedIds.filter(id => !(typeof id === 'string' && id.indexOf('sb_') === 0));
        if(DATA.deletedIds.length !== before) dirty = true;
      }
      if(DATA.settings && Array.isArray(DATA.settings.deletedSpeakingIds)){
        delete DATA.settings.deletedSpeakingIds;
        dirty = true;
      }
      if(dirty) hubSave();
    })();
    if(SPEAKING_BANK && SPEAKING_BANK.length && DATA.speakingVersion !== SPEAKING_BANK_VERSION){
      DATA.speaking = mergeSpeakingKeepAnswers(DATA.speaking);
      DATA.speakingVersion = SPEAKING_BANK_VERSION;
      hubSave();
    }
    // 写作模板迁移（2026-08-22）：补齐新增 5.0 万能版，并同步旧模板标题；手动删过的 id 记入 deletedIds，不再恢复。
    (function migrateWritingTemplates(){
      const titleUpdates = {
        wt_a: '动态图（线/柱带年份）',
        wt_b: '静态图（饼/表/静态柱）',
        wt_c: '地图题（改造前后对比）',
        wt_d: '流程图（自然过程/工序/循环）',
        wt_ba: '观点型（第一优先背）',
        wt_bb: '讨论型（第二优先背）',
        wt_a5: '动态图（线图/柱状图/变化图）完整背诵版',
        wt_b5: '静态图（饼图/表格）完整背诵版',
        wt_c5a: '地图题万能版·对比两个图（5分目标）',
        wt_c5b: '地图题万能版·before & after（5分目标）',
        wt_d5: '流程图万能版（5分目标）',
        wt_cr1: '原因+解决/结果（万能版）',
        wt_cr2: '只问原因（万能版）'
      };
      const categoryUpdates = {
        wt_a: '动态图', wt_b: '静态图', wt_c: '地图题', wt_d: '流程图',
        wt_ba: '观点型', wt_bb: '讨论型',
        wt_a5: '动态图', wt_b5: '静态图', wt_c5a: '地图题', wt_c5b: '地图题', wt_d5: '流程图',
        wt_cr1: 'Report', wt_cr2: 'Report'
      };
      const oldCategoryMap = {
        '大作文观点型': '观点型', '大作文讨论型': '讨论型', '大作文Report': 'Report',
        '小作文动态图': '动态图', '小作文静态图': '静态图', '小作文地图题': '地图题', '小作文流程图': '流程图',
        '小作文A': '动态图', '小作文B': '静态图', '小作文C': '地图题', '小作文D': '流程图',
        '大作文A': '观点型', '大作文B': '讨论型'
      };
      if(Array.isArray(DATA.writing)){
        var wdirty = false;
        DATA.writing.forEach(t => {
          if(t && titleUpdates[t.id]){ t.title = titleUpdates[t.id]; wdirty = true; }
          if(t && categoryUpdates[t.id]){ t.category = categoryUpdates[t.id]; wdirty = true; }
          if(t && oldCategoryMap[t.category]){ t.category = oldCategoryMap[t.category]; wdirty = true; }
        });
        const deletedIds = new Set(DATA.deletedIds || []);
        // 2026-08-23：Report 模板收敛为单一「先表态再分析」骨架（用户自制），旧 4 条 Report 默认不再保留
        ['wt_cr1','wt_cr2','wt_cr4'].forEach(id => deletedIds.add(id));
        // 若用户浏览器里仍有这些旧 Report 模板，强制移除；并检查已存在的 wt_cr3 是否需要刷新为新骨架
        const beforeLen = DATA.writing.length;
        DATA.writing = DATA.writing.filter(t => !(t && t.category === 'Report' && ['wt_cr1','wt_cr2','wt_cr4'].includes(t.id)));
        if(DATA.writing.length !== beforeLen) wdirty = true;
        const cr3Default = DATA.writing.find(t => t.id === 'wt_cr3');
        if(cr3Default){
          const seed = DEFAULT_WRITING_TEMPLATES.find(t => t.id === 'wt_cr3');
          if(seed){ cr3Default.skeleton = seed.skeleton; cr3Default.title = seed.title; cr3Default.tips = seed.tips; wdirty = true; }
        }
        // 2026-08-23：动态图/静态图/地图对比/地图变化/流程图万能版替换为用户「完整背诵版」骨架，老用户本地已存的也要同步刷新
        ['wt_a5','wt_b5','wt_c5a','wt_c5b','wt_d5','wt_ba','wt_bb','wt_cr3'].forEach(id => {
          const local = DATA.writing.find(t => t.id === id);
          const seed = DEFAULT_WRITING_TEMPLATES.find(t => t.id === id);
          if(local && seed){ local.skeleton = seed.skeleton; local.title = seed.title; local.tips = seed.tips; wdirty = true; }
        });
        /* 10/10：写作模板分档——老用户 localStorage 里已存的模板补 level 字段（**缺才补**，
           不覆盖用户自建的；与上面 skeleton/title/tips 的刷新同一次落盘）。 */
        DATA.writing.forEach(t => {
          if(!t || t.level) return;
          const seed = DEFAULT_WRITING_TEMPLATES.find(x => x.id === t.id);
          if(seed && seed.level){ t.level = seed.level; wdirty = true; }
        });
        const existingIds = new Set(DATA.writing.map(t => t.id));
        const missing = DEFAULT_WRITING_TEMPLATES.filter(t => !existingIds.has(t.id) && !deletedIds.has(t.id));
        if(missing.length){ DATA.writing = DATA.writing.concat(missing); wdirty = true; }
        // 模板迁移（标题/分类/骨架刷新）必须落盘，否则仅内存生效、刷新后旧 localStorage 仍显示旧模板。
        // 优化：仅当确有改动才写盘，避免每次加载都做一次整库写盘（数据越大越卡）。
        if(wdirty) hubSave();
      }
    })();
    // 注意：口语档位体系已废弃 migrateSpeakingTiers 重映射——版本号机制整体替换 DATA.speaking 为 SPEAKING_BANK，
    // 档位以 SPEAKING_BANK 定义为准，无需再回写旧映射（旧映射会把 tallbuilding 等 ultra 题错改回 high）。
    // 考试倒计时迁移：仅当用户已有 examDate 且已过时，才从已知档期找未来日期修正。
    // 新用户/已清空用户 examDate 为空时，不自动填充任何固定日期，避免无痕浏览器看到他人档期。
    const curExam = DATA.settings.examDate;
    const curExamDt = curExam ? new Date(curExam + 'T00:00:00') : null;
    const today0 = new Date(); today0.setHours(0,0,0,0);
    if(curExam && !isNaN(curExamDt) && curExamDt < today0){
      const KNOWN_EXAMS = ['2026-08-25', '2026-09-13']; // 二场、三场(目标分)
      const future = KNOWN_EXAMS.filter(d => {
        const dt = new Date(d + 'T00:00:00');
        return !isNaN(dt) && dt >= today0;
      });
      if(future.length){
        DATA.settings.examDate = future[0];
        DATA.settings.examDates = future;
      }
    }
    // 自愈：清洗词库中 en 非「非空字符串」的脏词（发音评测红词曾写入 undefined/null，导致练习页崩溃）
    if(Array.isArray(DATA.words)){
      const before = DATA.words.length;
      DATA.words = DATA.words.filter(w => w && typeof w.en === 'string' && w.en.trim() !== '');
      if(DATA.words.length !== before){ console.warn('已清洗 ' + (before - DATA.words.length) + ' 个脏词'); hubSave(); }
      // v1.2 字段默认补全：仅给「非旧格式」词补默认字段，旧格式词（含 mc*）交给 practice.js 的 ensureWordV12 迁移，
      // 这里不动，避免覆盖 level 导致迁移被跳过。
      let wdirty = false;
      DATA.words.forEach(w => {
        if(!w || typeof w.en !== 'string') return;
        const isOld = (w.mcInterval != null || w.mcDue != null || w.mcStreak != null || w.mcLapses != null || w.mcLast != null);
        if(isOld) return;
        if(w.level == null){ w.level = 0; wdirty = true; }
        if(w.nextReview == null){ w.nextReview = todayKey(); wdirty = true; }
        if(w.errTotal == null){ w.errTotal = 0; wdirty = true; }
        if(w.errStreak == null){ w.errStreak = 0; wdirty = true; }
        if(w.fuzzyStreak == null){ w.fuzzyStreak = 0; wdirty = true; }
        if(w.hardWord == null){ w.hardWord = false; wdirty = true; }
        if(w.okStreak == null){ w.okStreak = 0; wdirty = true; }
        if(w.keyWord == null){ w.keyWord = false; wdirty = true; }
        if(w.ts == null){ w.ts = Date.now(); wdirty = true; }
      });
      if(wdirty) hubSave();
    }
    // 2026-09-06 清洗：Excel/老词库工具导入时混进 cn 的元数据噪声（音标、错误数、词频区间、
    // 日期时间戳、例句等），表现为释义尾部「; səˈpɔːt; 2; serport; 120~149次; 2026-07-27 ...」一长串。
    // 抢救式清洗：音标段提进 ipa 字段（背词卡显示位），cn 只留词性+中文义项，其余噪声丢弃。
    // 标记门控 + 仅确有改动才 hubSave（迁移铁律）；salvageWordCn/isNoiseSeg 定义见下方函数声明。
    if(!DATA._cnCleanV1){
      DATA._cnCleanV1 = true;
      if(Array.isArray(DATA.words)){
        let cdirty = false;
        for(const w of DATA.words){
          if(!w || typeof w.cn !== 'string' || !w.cn) continue;
          const r = salvageWordCn(w.cn, w.ipa);
          if(r.cn !== w.cn){ w.cn = r.cn; cdirty = true; }
          if(r.ipa && r.ipa !== String(w.ipa || '').trim()){ w.ipa = r.ipa; cdirty = true; }
        }
        if(cdirty) hubSave();
      }
    }
    // 2026-09-06 晚 · v2 补扫：词组词条漏网修复——老工具词组表用异体分号（U+037E/﹔，肉眼与 ; 无异）
    // 时 v1 分段正则不认 → 整条 cn 原样保留；且「词组11~19次」词频、「phrase.」前缀均非 v1 模式所覆盖。
    // 新标记门控：已跑过 v1 的浏览器也会执行本补扫（清洗函数已升级为全分号变体 + 新模式，重复跑幂等）。
    if(!DATA._cnCleanV2){
      DATA._cnCleanV2 = true;
      if(Array.isArray(DATA.words)){
        let cdirty = false;
        for(const w of DATA.words){
          if(!w) continue;
          const cn0 = typeof w.cn === 'string' ? w.cn : '';
          const isPhrase = /\s/.test(String(w.en || ''));
          const r = salvageWordCn(cn0, w.ipa, isPhrase);
          if(r.cn !== cn0){ w.cn = r.cn; cdirty = true; }
          if(r.ipa && r.ipa !== String(w.ipa || '').trim()){ w.ipa = r.ipa; cdirty = true; }
          if(isPhrase && /^(?:phrase|phr|短语)/i.test(String(w.pos || ''))){ w.pos = ''; cdirty = true; }
        }
        if(cdirty) hubSave();
      }
    }
    // 2026-09-06 晚 · v3 补扫：①词组词性统一为 phrase.（之之要求；v2 口径是清空，本迁移改口径重设，
    //   列表/背词卡随 pos 显示 phrase. 标签）；②isNoiseSeg 升级版清洗补扫——删中英例句（英文放宽标点、
    //   中文以句号收尾）、剥首尾杂标点（"phrase. ，眼下" 式开头），已干净的词幂等零改动。
    // 一次性标记门控 + 确有改动才 hubSave（迁移铁律）；云同步合并出口同口径清洗，双路自愈。
    if(!DATA._cnCleanV3){
      DATA._cnCleanV3 = true;
      if(Array.isArray(DATA.words)){
        let v3dirty = false;
        for(const w of DATA.words){
          if(!w) continue;
          const isPhrase = /\s/.test(String(w.en || ''));
          if(isPhrase && w.pos !== 'phrase.'){ w.pos = 'phrase.'; v3dirty = true; }
          const cn0 = typeof w.cn === 'string' ? w.cn : '';
          const r = salvageWordCn(cn0, w.ipa, isPhrase);
          if(r.cn !== cn0){ w.cn = r.cn; v3dirty = true; }
          if(r.ipa && r.ipa !== String(w.ipa || '').trim()){ w.ipa = r.ipa; v3dirty = true; }
        }
        if(v3dirty) hubSave();
      }
    }
    // 2026-09-07 晨 · v4 补扫：isNoiseSeg 再升级——删「11次②」式带圈号词频、「"descend"的过去式和过去分词」
    // 式屈折变化说明（之之 9/7 背词卡截图）。与 v3 同一轮循环、幂等；已跑过 v3 的浏览器由本新标记触发重扫。
    if(!DATA._cnCleanV4){
      DATA._cnCleanV4 = true;
      if(Array.isArray(DATA.words)){
        let v4dirty = false;
        for(const w of DATA.words){
          if(!w) continue;
          const cn0 = typeof w.cn === 'string' ? w.cn : '';
          const r = salvageWordCn(cn0, w.ipa, /\s/.test(String(w.en || '')));
          if(r.cn !== cn0){ w.cn = r.cn; v4dirty = true; }
          if(r.ipa && r.ipa !== String(w.ipa || '').trim()){ w.ipa = r.ipa; v4dirty = true; }
        }
        if(v4dirty) hubSave();
      }
    }
    // 2026-09-07 晨 · v5 补扫：salvageWordCn 预洗升级——剥括号内屈折说明（「开始(initiate的过去式和过去分词)」
    // 挂在义项尾部、非独立段，isNoiseSeg 接不住，改在段级清洗前对整条 cn 预剥）。幂等；新标记触发重扫。
    if(!DATA._cnCleanV5){
      DATA._cnCleanV5 = true;
      if(Array.isArray(DATA.words)){
        let v5dirty = false;
        for(const w of DATA.words){
          if(!w) continue;
          const cn0 = typeof w.cn === 'string' ? w.cn : '';
          const r = salvageWordCn(cn0, w.ipa, /\s/.test(String(w.en || '')));
          if(r.cn !== cn0){ w.cn = r.cn; v5dirty = true; }
          if(r.ipa && r.ipa !== String(w.ipa || '').trim()){ w.ipa = r.ipa; v5dirty = true; }
        }
        if(v5dirty) hubSave();
      }
    }
    // 2026-09-07 晨 · v6 补扫：屈折关键词表扩充——「名词复数/动词复数/名词单数/单数」（之之 9/7 晨三报：
    // 「君主的统治( reign的名词复数 )」）。括号内有空格本就兼容；幂等；新标记触发重扫。
    if(!DATA._cnCleanV6){
      DATA._cnCleanV6 = true;
      if(Array.isArray(DATA.words)){
        let v6dirty = false;
        for(const w of DATA.words){
          if(!w) continue;
          const cn0 = typeof w.cn === 'string' ? w.cn : '';
          const r = salvageWordCn(cn0, w.ipa, /\s/.test(String(w.en || '')));
          if(r.cn !== cn0){ w.cn = r.cn; v6dirty = true; }
          if(r.ipa && r.ipa !== String(w.ipa || '').trim()){ w.ipa = r.ipa; v6dirty = true; }
        }
        if(v6dirty) hubSave();
      }
    }
    // 2026-09-07 晨 · v7 补扫：①引号类改 \uXXXX 转义——弯引号字面量曾被编码损坏成 ASCII（od 实锤），
    // 「"tide"的复数」式弯引号屈折段从未匹配过；②新增混合语言段删除（英文开头+含中文=双语例句残片）。
    // 幂等；新标记触发重扫。
    if(!DATA._cnCleanV7){
      DATA._cnCleanV7 = true;
      if(Array.isArray(DATA.words)){
        let v7dirty = false;
        for(const w of DATA.words){
          if(!w) continue;
          const cn0 = typeof w.cn === 'string' ? w.cn : '';
          const r = salvageWordCn(cn0, w.ipa, /\s/.test(String(w.en || '')));
          if(r.cn !== cn0){ w.cn = r.cn; v7dirty = true; }
          if(r.ipa && r.ipa !== String(w.ipa || '').trim()){ w.ipa = r.ipa; v7dirty = true; }
        }
        if(v7dirty) hubSave();
      }
    }
    // 2026-09-07 午 · v8 补扫：salvageWordCn 预洗升级——剥「（名词，动词为recover」式括号内语法标注
    // （含未闭合括号形态，之之 9/7 截图）。幂等；新标记触发重扫（用户设备 _cnCleanV7 已置位，必须新门）。
    if(!DATA._cnCleanV8){
      DATA._cnCleanV8 = true;
      if(Array.isArray(DATA.words)){
        let v8dirty = false;
        for(const w of DATA.words){
          if(!w) continue;
          const cn0 = typeof w.cn === 'string' ? w.cn : '';
          const r = salvageWordCn(cn0, w.ipa, /\s/.test(String(w.en || '')));
          if(r.cn !== cn0){ w.cn = r.cn; v8dirty = true; }
          if(r.ipa && r.ipa !== String(w.ipa || '').trim()){ w.ipa = r.ipa; v8dirty = true; }
        }
        if(v8dirty) hubSave();
      }
    }
    // 2026-09-07 午 · v9 补扫：①纯英文句子（无中文+≥3 英文词，含数字/$）删除；②屈折表扩「变形/原形」；
    // ③预洗剥尾部裸英文残片（「落下；drpt」）。幂等；新标记触发重扫。
    if(!DATA._cnCleanV9){
      DATA._cnCleanV9 = true;
      if(Array.isArray(DATA.words)){
        let v9dirty = false;
        for(const w of DATA.words){
          if(!w) continue;
          const cn0 = typeof w.cn === 'string' ? w.cn : '';
          const r = salvageWordCn(cn0, w.ipa, /\s/.test(String(w.en || '')));
          if(r.cn !== cn0){ w.cn = r.cn; v9dirty = true; }
          if(r.ipa && r.ipa !== String(w.ipa || '').trim()){ w.ipa = r.ipa; v9dirty = true; }
        }
        if(v9dirty) hubSave();
      }
    }
    // 2026-09-08 晚 · v10 补扫：尾部裸英文残片规则升级（之之 9/8 截图「青铜；青铜色；bronz」仍漏网）——
    // ①分隔符扩到逗号；②token 允许尾随标点（「bronze.」）；③允许连续多 token（「drpt dropped」）。
    // 幂等；新标记触发重扫（老设备 _cnCleanV9 已置位，必须新门）。
    if(!DATA._cnCleanV10){
      DATA._cnCleanV10 = true;
      if(Array.isArray(DATA.words)){
        let v10dirty = false;
        for(const w of DATA.words){
          if(!w) continue;
          const cn0 = typeof w.cn === 'string' ? w.cn : '';
          const r = salvageWordCn(cn0, w.ipa, /\s/.test(String(w.en || '')));
          if(r.cn !== cn0){ w.cn = r.cn; v10dirty = true; }
          if(r.ipa && r.ipa !== String(w.ipa || '').trim()){ w.ipa = r.ipa; v10dirty = true; }
        }
        if(v10dirty) hubSave();
      }
    }
    // 2026-08-30 修复：旧代码残留的「已掌握(cleared=true)但 nextReview<=今天」词，
    // 会被 buildQueue 重新入队、且被「待学习」的 OR 口径算入，导致「已掌握词又出现 + 待学习虚高」。
    // 这些词本应已排到未来复习，这里一次性把它们推到明天，退出今日待学习与队列（后续 Leitner 正常回炉）。
    // 仅跑一次（DATA._repairMasteredDueV 标记），避免每天把所有到期复习词永久后推、破坏记忆曲线。
    // ⚠️ 标记只 set 不主动落盘、仅在确有修复时才 hubSave（标记随 DATA 一起写入）：
    //    无条件写盘会让每次加载/清空后都多一次整库写入（迁移禁无条件 hubSave）；
    //    若无修复且标记未落盘，下次加载重跑本循环也只是空转，无副作用。
    // ⚠️ 不能用 common.js 的 addDays：data.js 先于 common.js 执行（defer 顺序），
    //    顶层 hubLoad 跑到这里时 addDays 还是 undefined → TypeError 被 catch 静默吞掉，
    //    导致本段修复 2026-08-30 上线以来从未生效（2026-09-04 实测发现）。改用自有 todayKey 算明天。
    if(!DATA._repairMasteredDueV){
      DATA._repairMasteredDueV = true;
      if(Array.isArray(DATA.words)){
        const tk = todayKey();
        const _d = new Date(); _d.setHours(0,0,0,0); _d.setDate(_d.getDate()+1);
        const tomorrow = todayKey(_d);   // 本地零点起算 +1 天，无 DST 漂移
        let changed = false;
        for(const w of DATA.words){
          if(w && w.cleared === true && (w.nextReview || '') <= tk){
            w.nextReview = tomorrow;   // 推到明天，今日不再出现
            changed = true;
          }
        }
        if(changed) hubSave();
      }
    }
  }catch(e){ console.warn('读取本地数据失败', e); }
}

/* 9/23：dictationLogs 内容签名去重（幂等，返回是否有清理）。
   背景：8/23-24 旧版模板默写代码曾把同一次核对结果以新 id 重复写入 5169 条（内容完全相同、仅 id 不同），
   占掉约 2.8MB（UTF-16 口径），把 iPhone Safari 约 5MB 的 localStorage 配额撑爆
   → 手机端每次保存都抛 QuotaExceededError，表现为「保存失败：浏览器存储不可用 / 无法同步」。
   （桌面 Chrome/Edge 配额 10MB，所以一直没炸。）
   同一天同内容重复练习会被误并为一条——错句本按「标准句+错误写法」聚合、不受影响，可接受。 */
function trimDictationDupes(){
  if(!Array.isArray(DATA.dictationLogs) || DATA.dictationLogs.length < 2) return false;
  const seen = new Set(); const kept = [];
  for(const l of DATA.dictationLogs){
    if(!l) continue;
    const sig = JSON.stringify([l.sourceId || '', l.title || '', l.date || '', l.userText || '', l.correctText || '', l.mistakes || [], l.weakThisTime || null]);
    if(seen.has(sig)) continue;
    seen.add(sig); kept.push(l);
  }
  if(kept.length === DATA.dictationLogs.length) return false;
  DATA.dictationLogs = kept;
  return true;
}

function hubSave(){
  try{
    DATA._lastSaved = Date.now();   // 记录本机保存时间，供云端下载比对新旧（Bug17）
    localStorage.setItem(HUB_KEY, JSON.stringify(DATA));
    saveCredsMirror();              // 同步镜像账号凭证到隔离键，确保 Key/手机号永不因主 blob 被清而丢失
  }
  catch(e){
    // 9/23：区分「配额满」与「存储被禁」。iPhone Safari 配额按 UTF-16 算只有 ~5MB（桌面 Chrome/Edge 10MB），
    // 数据膨胀超限时 setItem 抛 QuotaExceededError——先做一次冗余日志去重再重试；仍失败才告警，且每次会话最多弹一次
    //（此前每次失败都 alert，一次合并触发几十次保存会连环弹窗）。
    const quota = !!(e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014));
    let saved = false;
    if(quota){
      try{
        trimDictationDupes();
        DATA._lastSaved = Date.now();
        localStorage.setItem(HUB_KEY, JSON.stringify(DATA));
        saveCredsMirror();
        saved = true;
      }catch(_e2){ saved = false; }
    }
    if(!saved && !window.__hubSaveAlerted){
      window.__hubSaveAlerted = true;
      alert(quota
        ? '保存失败：本地存储空间已满（iPhone Safari 上限约 5MB），自动清理后仍放不下。请在「设置」导出备份，并把此提示截图反馈。'
        : '保存失败：浏览器存储不可用（' + ((e && e.name) || '未知错误') + '）。若在 iPhone Safari：请检查是否开了无痕浏览，或设置里关闭了 Cookie。请用「历史/设置」导出备份。');
    }
  }
  // 云端自动同步（防抖）：仅当开启且已生成登录码；失败静默，不弹 toast
  if(typeof scheduleCloudUpload === 'function') scheduleCloudUpload();
}

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

/* ── 释义噪声清洗（2026-09-06，配套 _cnCleanV1/V2 迁移与 Excel 导入过滤）──
   老词库工具导出表的元数据会被拼进 cn，按「段」（各类分号变体分隔）剔除高置信噪声：
   空段 / IPA 音标 / 纯数字符号 / 日期时间戳 / 词频区间（含「词组/单词」前缀如 词组11~19次）/ 纯英文段。
   音标段不丢弃——抢救进 ipa 字段（背词卡 /ipa/ 显示位），cn 只留词性与中文义项。
   安全铁律：含中文的段一律不当噪声删（防异体分号导致整条释义成一段时被一锅端）。
   只删有把握的，拿不准的段不动。 */
var _RE_IPA = /[ˈˌːəɪʊɛɔæʃŋθðɑʌɜˑʒʤ]/;                    // IPA 音标特征符（含 ʒ ʤ）
var _RE_SEP = /([；;;﹔])/;                                 // 分号变体：全角/半角/希腊问号U+037E/小分号U+FE54
function isNoiseSeg(seg){
  const s = String(seg || '').trim();
  if(!s) return true;
  if(/^(?:词组|单词)?\d+(?:\s*[~～]\s*\d+)?\s*次(?:\s*(?:及以上|以上|\+))?(?:\s*[①②③④⑤⑥⑦⑧⑨⑩])?$/.test(s)) return true;  // 词频（120~149次 / 词组11~19次 / 词组20次及以上 / 11次②）
  // 屈折变化说明（之之 9/7 截图：「"descend"的过去式和过去分词」）——语法标注不是义项，整段删。
  // 引号类用 \uXXXX 转义（弯引号字面量曾被编码损坏成 ASCII，导致 "tide"的复数 永远匹配不上——9/7 od 实锤）。
  if(/^[（(]?[\u0022\u201C\u201D\u2018\u2019']?\s*[A-Za-z][A-Za-z\s'’.\-]*[\u0022\u201C\u201D\u2018\u2019']?\s*的(?:过去式|过去分词|现在分词|第三人称单数|名词复数|动词复数|名词单数|复数|单数|比较级|最高级|变形|原形)/.test(s)) return true;
  // 纯英文句子（无中文 + ≥3 个英文单词，可含数字/$等符号）：老库例句残片
  // （之之 9/7 截图："The country gained independence in 1960." / "The net profit after taxes is $500."）
  {
    const _enSent = s.match(/[A-Za-z]{2,}/g);
    if(_enSent && _enSent.length >= 3 && !/[一-鿿]/.test(s)) return true;
  }
  // 混合语言段（含中文且含 ≥3 个英文单词 = 双语例句残片，如「Therapists help people feel better after伤心的」）删；
  // 「phrase. 眼下」「v. 得到」「U.S. 价格」式标签/词性/缩写开头段英文 token 不足 3 个，不受影响。
  {
    const _enToks = s.match(/[A-Za-z]{2,}/g);
    if(/[一-鿿]/.test(s) && _enToks && _enToks.length >= 3) return true;
  }
  // 中文例句（≥4 个汉字且以句号/叹号/问号收尾）：义项从不带句末标点，老工具导出的双语例句整段删
  // （之之 9/6 晚截图：在这个阶段，他正在学习阅读。/ 下雨是延误的原因。）。长度门槛防误删「好啊！」类短感叹义项。
  if(/[一-鿿].*[一-鿿].*[一-鿿].*[一-鿿]/.test(s) && /[。！？]$/.test(s)) return true;
  if(/[一-鿿]/.test(s)) return false;                        // 其余含中文 = 释义，永不当噪声（安全优先）
  if(_RE_IPA.test(s)) return true;                          // 含 IPA 音标特征符
  if(/^[\d\s.,;:～~\-—()（）]+$/.test(s)) return true;      // 纯数字/符号
  if(/\d{4}-\d{1,2}-\d{1,2}/.test(s)) return true;          // 日期时间戳
  if(/^\d{1,2}:\d{2}/.test(s)) return true;                 // 时间片段
  if(/^[A-Za-z][A-Za-z\s'’.,!?;:"()\-]*$/.test(s)) return true;  // 纯英文段（放宽标点：带逗号/问号的例句 "At this stage, he is..." 也整段删）
  return false;
}
function salvageWordCn(cn, curIpa, isPhrase){
  // 预洗：剥「开始(initiate的过去式和过去分词)」式括号内屈折说明（之之 9/7 晨截图）——
  // 只删括号内容含屈折关键词的括号对，正常注释括号（如「（数量或比例上）占」）不动。
  cn = String(cn || '').replace(/[（(][^（）()]*的(?:过去式|过去分词|现在分词|第三人称单数|名词复数|动词复数|名词单数|复数|单数|比较级|最高级|变形|原形)[^（）()]*[）)]/g, '');
  // 尾部裸英文残片（之之 9/7 截图：「落下；drpt」——过去式缩写等元数据挂在释义尾）：
  // 分隔符后跟纯英文字母 token 直到结尾 → 删（合法释义尾是中文，带点的词性标签 "v. 更新" 不受影响）。
  // v10 扩（之之 9/8 截图：「青铜；青铜色；bronz…」截断残片仍漏网）：分隔符扩到逗号；
  // token 允许尾随标点（「bronze.」「drpt,」）；允许连续多 token（「drpt dropped」式屈折残片）。
  cn = cn.replace(/[，,；;;﹔]\s*(?:[A-Za-z][A-Za-z\-']{0,15}\s*(?:[.。:：,，、;；!！?？]\s*)?){1,3}$/g, '');
  // 括号内语法标注（之之 9/7 晨：「恢复、康复（名词，动词为recover」）——「（名词/动词/形容词…」开头的
  // 括号对整对删；未闭合括号（老数据缺右括号）从（截到尾。正常注释括号（如「（数量或比例上）」）不受影响。
  cn = cn.replace(/[（(]\s*(?:名词|动词|形容词)[^（）()]*[）)]/g, '');
  cn = cn.replace(/[（(]\s*(?:名词|动词|形容词)[^（）()]*$/g, '');
  const parts = cn.split(_RE_SEP);
  const kept = [];
  let ipa = String(curIpa || '').trim();
  for(let i = 0; i < parts.length; i += 2){
    if(isNoiseSeg(parts[i])){
      if(!ipa && _RE_IPA.test(parts[i])){                    // 噪声段含真音标 → 抢救（去首尾斜杠/空白）
        ipa = parts[i].trim().replace(/^[/\s]+|[/\s]+$/g, '');
      }
      continue;                                              // 丢噪声段连同其后的分隔符
    }
    kept.push(parts[i] + (parts[i+1] || ''));
  }
  let out = kept.join('').replace(/^[；;;﹔，,]+/, '').replace(/[；;;﹔，,]\s*$/, '').trim();  // 首尾杂标点一并剥（老数据有 "phrase. ，眼下" 式开头）
  if(isPhrase) out = out.replace(/^(?:phrase|phr|短语)\s*[.、:：]?\s*/i, '');  // 词组格式=音标+意思，剥 phrase. 标签
  out = out.replace(/[;﹔]/g, '；');                         // 异体分号归一化为全角（防释义里留怪符号）
  return { cn: out, ipa };
}

function todayKey(d){
  if(d == null) d = new Date();
  if(typeof d === 'number') d = new Date(d);
  const p = n => String(n).padStart(2,'0');
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
}

function fmtHMS(sec){
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
  return [h,m,s].map(n => String(n).padStart(2,'0')).join(':');
}

function fmtHM(sec){
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60);
  if(h && m) return h + 'h' + m + 'm';
  if(h) return h + 'h';
  if(m) return m + 'm';
  return (sec%60) + 's';
}

/* 容错：AI 返回的字段可能是数字/undefined，统一转字符串再转义，避免整页渲染崩掉 */
function escapeHtml(s){ return String(s == null ? '' : s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;'); }

function findSub(subId){
  for(const m of MODULES){ const c = m.children.find(c => c.id === subId); if(c) return {m,c}; }
  return null;
}

function subName(subId){ const f=findSub(subId); return f ? f.c.name : subId; }
function moduleName(modId){ const m=MODULES.find(x=>x.id===modId); return m ? m.name : modId; }

const ACTIVE_KEY = 'ielts_study_hub_active';
function saveActive(a){ try{ localStorage.setItem(ACTIVE_KEY, JSON.stringify(a)); }catch(e){} }
function loadActive(){ try{ const r=localStorage.getItem(ACTIVE_KEY); return r ? JSON.parse(r) : null; }catch(e){ return null; } }
function clearActive(){ try{ localStorage.removeItem(ACTIVE_KEY); }catch(e){} }

hubLoad();
