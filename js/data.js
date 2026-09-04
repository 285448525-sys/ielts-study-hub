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
const CREDS_FIELDS = ['syncCode', 'relayToken', 'pronunciationScore', 'autoSync'];
function saveCredsMirror(){
  try{
    const s = DATA.settings || {};
    const m = {
      syncCode: s.syncCode || '',
      relayToken: s.relayToken || '',
      pronunciationScore: (s.pronunciationScore != null ? s.pronunciationScore : ''),
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
  { id:'listening', name:'听力', icon:'🎧', color:'#4f9fc0', children:[
    { id:'listening_set',     name:'听力 S1+S4 填空 1 套', icon:'📝' },
    { id:'listening_corpus',  name:'语料库听写 1 组', icon:'📋' },
    { id:'listening_shadow',  name:'精听 + 跟读模仿 1 段', icon:'🎯' },
  ]},
  { id:'reading', name:'阅读', icon:'📖', color:'#46a883', children:[
    { id:'reading_p1',    name:'阅读 1 篇 P1（计时 20min）', icon:'⏱️' },
    { id:'reading_tfng',  name:'FALSE / NOT GIVEN 专项 10 题', icon:'🔍' },
    { id:'reading_rev',   name:'复盘错题：矛盾 vs 没提', icon:'🧠' },
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
  ]},
];

/* ===== 9-12 月口语题库（2026-09-04 雅思哥换题季，大陆考区：新题 + 保留题 + 万年老题） ===== */
const FREQ_LABEL = { ultra:'超高频', high:'高频', medium:'中频', low:'低频' };
const SPEAKING_BANK = [
/* ---------- Part 1 · 9 月新题（10） ---------- */
{ id:"sb_p1_travelling", type:"P1", period:"2026-09-04", isNew:true, frequency:"high", category:"日常",
    titleEn:"Travelling", titleZh:"旅行",
    questions:["Do you prefer to sit by the window when travelling?","Did you have a long journey with your family as a child?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p1_rubbish", type:"P1", period:"2026-09-04", isNew:true, frequency:"high", category:"日常",
    titleEn:"Rubbish and recycling", titleZh:"垃圾与回收",
    questions:["How do you recycle things like paper and plastic?","What do you do when you see rubbish on the street?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p1_tiredness", type:"P1", period:"2026-09-04", isNew:true, frequency:"high", category:"日常",
    titleEn:"Tiredness", titleZh:"疲劳",
    questions:["What do you do when you feel tired?","When would you feel tired?","Do you often feel tired?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p1_shoes", type:"P1", period:"2026-09-04", isNew:true, frequency:"high", category:"物品",
    titleEn:"Shoes", titleZh:"鞋子",
    questions:["Which do you prefer, fashionable shoes or comfortable shoes?","How much money do you usually spend on shoes?","Have you ever bought shoes online?","Do you like buying shoes? How often?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p1_politeness", type:"P1", period:"2026-09-04", isNew:true, frequency:"high", category:"日常",
    titleEn:"Politeness", titleZh:"礼貌",
    questions:["Do you think being polite is very important?","How did you learn to be polite as a child?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p1_fruitveg", type:"P1", period:"2026-09-04", isNew:true, frequency:"high", category:"日常",
    titleEn:"Fruit and vegetables", titleZh:"果蔬",
    questions:["Do people in your country like planting vegetables?","Were there any kind of fruits and vegetables you disliked as a child?","What kind of fruits and vegetables do you dislike?","Where do you usually buy fruit and vegetables?","How often do you eat fruit and vegetables?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p1_advertisement", type:"P1", period:"2026-09-04", isNew:true, frequency:"high", category:"日常",
    titleEn:"Advertisement", titleZh:"广告",
    questions:["Do you often see advertisements when you are on your phone or computer?","What kind of advertising do you like?","Do you like advertisements?","Do you see a lot of advertising on trains or other transport?","Is there an advertisement that made an impression on you when you were a child?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p1_paper", type:"P1", period:"2026-09-04", isNew:true, frequency:"high", category:"日常",
    titleEn:"Paper", titleZh:"纸与手写",
    questions:["Do you carry paper and pens with you when you go out?","Do people still keep handwritten letters today?","Do you still write physical letters?","What did you like to do with paper as a child?","Have you made any crafts with paper?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p1_secondaryschool", type:"P1", period:"2026-09-04", isNew:true, frequency:"high", category:"日常",
    titleEn:"Secondary school", titleZh:"中学",
    questions:["Is there anything you miss about your secondary school?","What was your favourite subject at secondary school?","Were there any subjects that you found difficult at secondary school?","Do you remember your first day at secondary school?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p1_name", type:"P1", period:"2026-09-04", isNew:true, frequency:"high", category:"日常",
    titleEn:"Name", titleZh:"名字",
    questions:["Do you often forget people's names?","How do you feel when people can't remember your name?","How do you remember people's names?","Is it easy for you to remember people's names?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
/* ---------- Part 1 · 保留题（16） ---------- */
{ id:"sb_p1_music", type:"P1", period:"2026-09-04", isNew:false, frequency:"high", category:"日常",
    titleEn:"Music", titleZh:"音乐",
    questions:["Do you prefer sad or happy music?","Does happy music make you feel more excited?","Have you taken any music classes?","Do you listen to music while doing other things?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架①", proficiency:"没练" },
{ id:"sb_p1_teachers", type:"P1", period:"2026-09-04", isNew:false, frequency:"high", category:"人物",
    titleEn:"Teachers", titleZh:"老师",
    questions:["Do you have a favorite teacher?","Do you want to be a teacher in the future?","Do you have a teacher from your past that you still remember?","Are you still in touch with your primary school teachers?","In what way has your favourite teacher helped you?","Do you like your primary school teachers more than your high school teachers?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架⑤", proficiency:"没练" },
{ id:"sb_p1_socialmedia", type:"P1", period:"2026-09-04", isNew:false, frequency:"high", category:"日常",
    titleEn:"Social media", titleZh:"社交媒体",
    questions:["Have you ever posted anything on social media?","When did you start using social media?","Do you think you spend too much time on social media?","Do your friends use social media?","What do people often do on social media?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架④", proficiency:"没练" },
{ id:"sb_p1_tidiness", type:"P1", period:"2026-09-04", isNew:false, frequency:"high", category:"日常",
    titleEn:"Tidiness", titleZh:"整洁",
    questions:["Do you like to keep things tidy?","Did you keep your room tidy as a child?","How do you keep your work or study space tidy?","Do you think that it is necessary to be tidy?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架③", proficiency:"没练" },
{ id:"sb_p1_websites", type:"P1", period:"2026-09-04", isNew:false, frequency:"high", category:"物品",
    titleEn:"Websites", titleZh:"网页",
    questions:["What kinds of websites do you often visit?","What is your favourite website?","Are there any changes to the websites you often visit?","What kinds of websites are popular in your country?","Do you prefer getting information from websites or books?","Would you like to have your own website?","What have you learned from websites that help with your life or studies?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架④", proficiency:"没练" },
{ id:"sb_p1_watch", type:"P1", period:"2026-09-04", isNew:false, frequency:"medium", category:"物品",
    titleEn:"Watch", titleZh:"手表",
    questions:["Do you wear a watch?","Have you ever got a watch as a gift?","Why do some people wear expensive watches?","Do you think it is important to wear a watch? Why?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架④", proficiency:"没练" },
{ id:"sb_p1_shopping", type:"P1", period:"2026-09-04", isNew:false, frequency:"medium", category:"日常",
    titleEn:"Shopping", titleZh:"购物",
    questions:["Do you like shopping?","How often do you go shopping?","Do you prefer online shopping or in-store shopping?","Have you ever returned anything you bought online?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架③", proficiency:"没练" },
{ id:"sb_p1_cars", type:"P1", period:"2026-09-04", isNew:false, frequency:"low", category:"物品",
    titleEn:"Cars", titleZh:"汽车",
    questions:["Did you enjoy traveling by car when you were a kid?","What types of cars do you like?","Do you prefer to be a driver or a passenger?","What do you usually do when there is a traffic jam?","Do you think car colours are important?","Will you buy an expensive car in the future?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架④", proficiency:"没练" },
{ id:"sb_p1_parks", type:"P1", period:"2026-09-04", isNew:false, frequency:"low", category:"日常",
    titleEn:"Public gardens and parks", titleZh:"公园",
    questions:["Did you like going to parks as a child?","Do you still like going to parks now?","Would you like to see more parks in your city?","Are there any parks you want to go to in the future?","Would you prefer to play in a personal garden or public garden?","How are the parks today different from those you visited as a kid?","What do you like to do when visiting a park?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p1_science", type:"P1", period:"2026-09-04", isNew:false, frequency:"medium", category:"抽象",
    titleEn:"Science", titleZh:"科学",
    questions:["Do you like science?","When did you start to learn about science?","Which science subject is interesting to you?","What kinds of interesting things have you done with science?","Do you like watching science TV programs?","Do Chinese people often visit science museums?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架⑥", proficiency:"没练" },
{ id:"sb_p1_mirrors", type:"P1", period:"2026-09-04", isNew:false, frequency:"high", category:"物品",
    titleEn:"Mirrors", titleZh:"镜子",
    questions:["Do you like looking at yourself in the mirror? How often?","Have you ever bought mirrors?","Do you usually take a mirror with you?","Would you use mirrors to decorate your room?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架④", proficiency:"没练" },
{ id:"sb_p1_space", type:"P1", period:"2026-09-04", isNew:false, frequency:"medium", category:"抽象",
    titleEn:"Outer space and stars", titleZh:"太空与星空",
    questions:["Have you ever learnt about outer space and stars?","Do you like science fiction movies? Why?","Do you want to know more about outer space?","Do you want to go into outer space in the future?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架⑥", proficiency:"没练" },
{ id:"sb_p1_singing", type:"P1", period:"2026-09-04", isNew:false, frequency:"low", category:"日常",
    titleEn:"Singing", titleZh:"唱歌",
    questions:["Do you like singing? Why?","Have you ever learnt how to sing?","Who do you want to sing for?","Do you think singing can bring happiness to people?","Do you like listening to others singing?","Have you ever taken a singing class?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架①", proficiency:"没练" },
{ id:"sb_p1_clothing", type:"P1", period:"2026-09-04", isNew:false, frequency:"medium", category:"物品",
    titleEn:"Clothing", titleZh:"衣服",
    questions:["What kind of clothes do you like to wear?","Do you prefer to wear comfortable and casual clothes or smart clothes?","Do you like wearing T-shirts?","Do you spend a lot of time choosing clothes?","Do you wear different styles of clothes on weekdays and weekends?","What colour clothes do you like?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架④", proficiency:"没练" },
{ id:"sb_p1_jokes", type:"P1", period:"2026-09-04", isNew:false, frequency:"medium", category:"日常",
    titleEn:"Jokes & Comedies", titleZh:"笑话与喜剧",
    questions:["Are you good at telling jokes?","Do your friends like to tell jokes?","Do you like to watch comedies?","Have you ever watched a live show?","Are comedy shows popular in your country?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p1_headphones", type:"P1", period:"2026-09-04", isNew:false, frequency:"high", category:"物品",
    titleEn:"Headphones", titleZh:"耳机",
    questions:["Do you use headphones?","What type of headphones do you use?","When would you use headphones?","In what conditions would you not use headphones?","Is wearing headphones comfortable?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架④", proficiency:"没练" },
/* ---------- Part 1 · 万年老题（5） ---------- */
{ id:"sb_p1_work", type:"P1", period:"2026-09-04", isNew:false, frequency:"ultra", category:"日常",
    titleEn:"Work or studies", titleZh:"工作/学习",
    questions:["What subjects are you studying?","Do you like your subject?","Why did you choose to study that subject?","Do you think that your subject is popular in your country?","Do you have any plans for your studies in the next five years?","What are the benefits of being your age?","Do you want to change your major?","Do you prefer to study in the mornings or in the afternoons?","How much time do you spend on your studies each week?","Are you looking forward to working?","What technology do you use when you study?","What changes would you like to see in your school?"],
    cue:'', content:'', keywords:'', linkedTo:"必考题", proficiency:"没练" },
{ id:"sb_p1_home", type:"P1", period:"2026-09-04", isNew:false, frequency:"ultra", category:"地点",
    titleEn:"Home/accommodation", titleZh:"住所",
    questions:["What kind of house or apartment do you want to live in in the future?","Are the transport facilities to your home very good?","Do you prefer living in a house or an apartment?","Please describe the room you live in.","What part of your home do you like the most?","How long have you lived there?","Do you plan to live there for a long time?","What's the difference between where you are living now and where you have lived in the past?","Can you describe the place where you live?","What room does your family spend most of the time in?","What's your favorite room in your apartment or house?","What makes you feel pleasant in your home?","Do you think it is important to live in a comfortable environment?","Do you live in an apartment or a house?","Who do you live with?","What do you usually do in your apartment?","What kinds of accommodation do you live in?"],
    cue:'', content:'', keywords:'', linkedTo:"必考题", proficiency:"没练" },
{ id:"sb_p1_hometown", type:"P1", period:"2026-09-04", isNew:false, frequency:"ultra", category:"地点",
    titleEn:"Hometown", titleZh:"家乡",
    questions:["Where is your hometown?","Is that a big city or a small place?","Please describe your hometown a little.","How long have you been living there?","Do you think you will continue living there for a long time?","Do you like your hometown?","Do you like living there?","What do you like (most) about your hometown?","Is there anything you dislike about it?","What's your hometown famous for?","Did you learn about the history of your hometown at school?","Are there many young people in your hometown?","Is your hometown a good place for young people to pursue their careers?","Have you learned anything about the history of your hometown?","Did you learn about the culture of your hometown in your childhood?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架②", proficiency:"没练" },
{ id:"sb_p1_area", type:"P1", period:"2026-09-04", isNew:false, frequency:"ultra", category:"地点",
    titleEn:"The area you live in", titleZh:"居住的地方",
    questions:["Do you like the area that you live in?","Where do you like to go in that area?","Do you know any famous people in your area?","What are some changes in the area recently?","Do you know any of your neighbors?","Are the people in your neighborhood nice and friendly?","Do you live in a noisy or a quiet area?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架②", proficiency:"没练" },
{ id:"sb_p1_city", type:"P1", period:"2026-09-04", isNew:false, frequency:"ultra", category:"地点",
    titleEn:"The city you live in", titleZh:"所在城市",
    questions:["What city do you live in?","Do you like this city? Why?","How long have you lived in this city?","Are there big changes in this city?","Is this city your permanent residence?","Are there people of different ages living in this city?","Are the people friendly in the city?","Is the city friendly to children and old people?","Do you often see your neighbors?","What's the weather like where you live?","Would you recommend your city to others?"],
    cue:'', content:'', keywords:'', linkedTo:"必考题", proficiency:"没练" },
/* ---------- Part 2&3 · 9 月新题（20） ---------- */
{ id:"sb_p2_happydecision", type:"P2", period:"2026-09-04", isNew:true, frequency:"medium", category:"事件",
    titleEn:"An important decision you were happy with", titleZh:"对结果开心的重要决定",
    promptEn:"Describe a time you made an important decision and were happy with the result.", promptZh:"描述一次你做出重要决定并对结果很满意的经历。",
    youShouldSay:["What the decision was","Why you made the decision","How easy it was for you to make the decision","And explain why you were happy with the result"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_difficultsuccess", type:"P2", period:"2026-09-04", isNew:true, frequency:"medium", category:"人物",
    titleEn:"A person who did something difficult and succeeded", titleZh:"做困难事情并成功的人",
    promptEn:"Describe a person you know who did something difficult and was successful.", promptZh:"描述一个你认识的做了困难的事并成功的人。",
    youShouldSay:["Who this person is","What difficult thing this person did","Why this person was successful","And explain how you feel about this person"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_happyperson", type:"P2", period:"2026-09-04", isNew:true, frequency:"medium", category:"人物",
    titleEn:"A happy person you know", titleZh:"快乐人士",
    promptEn:"Describe a happy person you know.", promptZh:"描述一个你认识的快乐的人。",
    youShouldSay:["Who this person is","What he/she is like","How he/she shows happiness","And explain why you think he/she is a happy person"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_interviewceleb", type:"P2", period:"2026-09-04", isNew:true, frequency:"medium", category:"事件",
    titleEn:"A time you interviewed a famous person", titleZh:"采访名人",
    promptEn:"Describe a time when you interviewed a famous person.", promptZh:"描述一次你采访名人的经历。",
    youShouldSay:["Who the famous person was","When and where you interviewed this person","What you talked about during the interview","And explain how you feel about the experience"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_organized", type:"P2", period:"2026-09-04", isNew:true, frequency:"medium", category:"人物",
    titleEn:"A person who is very organized", titleZh:"有条理的人",
    promptEn:"Describe a person you know who is very organized.", promptZh:"描述一个你认识的非常有条理的人。",
    youShouldSay:["Who this person is","What this person usually does to stay organized","In what situations you have noticed this quality","And explain why you think being organized is important to him/her"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_noisyplace", type:"P2", period:"2026-09-04", isNew:true, frequency:"medium", category:"地点",
    titleEn:"A noisy place you have been to", titleZh:"嘈杂的地方",
    promptEn:"Describe a noisy place you have been to.", promptZh:"描述一个你去过的嘈杂的地方。",
    youShouldSay:["Where it is","When you went there","What you did there","And explain why you feel it's a noisy place"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_naturalplace", type:"P2", period:"2026-09-04", isNew:true, frequency:"medium", category:"地点",
    titleEn:"A natural place in your city you enjoy", titleZh:"喜欢的城市自然之地",
    promptEn:"Describe a natural place in your city that you enjoy visiting.", promptZh:"描述一个你所在城市里你喜欢去的自然之地。",
    youShouldSay:["Where it is","What it is like","How often you go there","Who you often go there with","And explain why you enjoy visiting there"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_savingmoney", type:"P2", period:"2026-09-04", isNew:true, frequency:"medium", category:"事件",
    titleEn:"A time you saved money to buy something", titleZh:"攒钱买想要物品",
    promptEn:"Describe a time when you saved money to buy something you wanted.", promptZh:"描述一次你攒钱买想要的东西的经历。",
    youShouldSay:["What you wanted to buy","Why you wanted to buy it","How you saved money for it","And explain how you felt after buying it"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_childskill", type:"P2", period:"2026-09-04", isNew:true, frequency:"medium", category:"事件",
    titleEn:"A new skill you learned as a child", titleZh:"小时候学到的新技能",
    promptEn:"Describe a new skill you learned when you were a child.", promptZh:"描述一项你小时候学到的新技能。",
    youShouldSay:["What the skill was","Who taught you this skill","How you learned it","And explain how you felt about learning the skill"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_photoperson", type:"P2", period:"2026-09-04", isNew:true, frequency:"medium", category:"人物",
    titleEn:"A person who likes taking photos", titleZh:"喜欢拍照的人",
    promptEn:"Describe a person you know who really likes taking photos.", promptZh:"描述一个你认识的非常喜欢拍照的人。",
    youShouldSay:["Who the person is","When and how you got to know him/her","Where he/she takes photos","And explain how you feel about him/her"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_eldersadmire", type:"P2", period:"2026-09-04", isNew:true, frequency:"medium", category:"人物",
    titleEn:"An older person you admire", titleZh:"尊敬的比你年长的人",
    promptEn:"Describe someone who is older than you that you admire.", promptZh:"描述一个你敬佩的比你年长的人。",
    youShouldSay:["Who this person is","How you knew this person","What kinds of things you like to do together","And explain how you feel about this person"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_uninterested", type:"P2", period:"2026-09-04", isNew:true, frequency:"medium", category:"事件",
    titleEn:"Listening to something not interesting", titleZh:"听不感兴趣的话",
    promptEn:"Describe a time when someone talked about something you were not interested in but you kept listening.", promptZh:"描述一次别人谈论你不感兴趣的话题但你继续听的经历。",
    youShouldSay:["Who the person was","What he/she talked about","Why you kept listening","And explain how you felt about the experience"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_goodservice", type:"P2", period:"2026-09-04", isNew:true, frequency:"medium", category:"事件",
    titleEn:"Good service in a shop", titleZh:"好的购物服务",
    promptEn:"Describe a time when you received good service in a shop/store.", promptZh:"描述一次你在商店获得良好服务的经历。",
    youShouldSay:["Where the shop is","When you went to the shop","What service you received from the staff","And explain how you felt about the service"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_handmade", type:"P2", period:"2026-09-04", isNew:true, frequency:"medium", category:"人物",
    titleEn:"A person good at making things by hand", titleZh:"擅长做手工的人",
    promptEn:"Describe a person who is good at making things by hand.", promptZh:"描述一个擅长手工制作的人。",
    youShouldSay:["Who this person is","What he/she makes","What materials or technologies he/she uses","And why you think this person is good at making things by hand"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_eveningfriends", type:"P2", period:"2026-09-04", isNew:true, frequency:"medium", category:"事件",
    titleEn:"An enjoyable evening with friends", titleZh:"和朋友度过的愉快夜晚",
    promptEn:"Describe an enjoyable evening you had with your friends.", promptZh:"描述一个你和朋友一起度过的愉快夜晚。",
    youShouldSay:["When and where it was","What you did","Who you spent the evening with","And explain why it was enjoyable"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_wastetime", type:"P2", period:"2026-09-04", isNew:true, frequency:"medium", category:"事件",
    titleEn:"An activity that is a waste of time", titleZh:"浪费时间的活动",
    promptEn:"Describe an activity you do regularly that you think is a waste of time.", promptZh:"描述一项你经常做但觉得浪费时间的活动。",
    youShouldSay:["What it is","When you usually do it","Why you do it","And explain why you think it is a waste of time"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_crowdedplace", type:"P2", period:"2026-09-04", isNew:true, frequency:"medium", category:"地点",
    titleEn:"A crowded place you went to", titleZh:"拥挤的地方",
    promptEn:"Describe a crowded place you went to.", promptZh:"描述一个你去过的拥挤的地方。",
    youShouldSay:["Where it was","When you went there","Who you went there with","What you did there"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_historyperson", type:"P2", period:"2026-09-04", isNew:true, frequency:"medium", category:"人物",
    titleEn:"A person who loves learning history", titleZh:"学习并喜欢历史的人",
    promptEn:"Describe a person who learns history and loves history.", promptZh:"描述一个学习历史并热爱历史的人。",
    youShouldSay:["Who this person is","How he/she learns history","Why he/she loves history","And explain how you feel about him/her"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_teachskill", type:"P2", period:"2026-09-04", isNew:true, frequency:"medium", category:"人物",
    titleEn:"A person who taught you a new skill", titleZh:"教你新技能的人",
    promptEn:"Describe a person who taught you a new skill.", promptZh:"描述一个教你新技能的人。",
    youShouldSay:["Who this person was","What the skill was","How you learned it","And explain how you felt about this person"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_leastfilm", type:"P2", period:"2026-09-04", isNew:true, frequency:"medium", category:"物品",
    titleEn:"Your least favourite movie", titleZh:"最不喜欢的电影",
    promptEn:"Describe your least favourite movie.", promptZh:"描述一部你最不喜欢的电影。",
    youShouldSay:["When you watched it","Where you watched it","What it was about","And explain why it's your least favourite movie"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
/* ---------- Part 2&3 · 保留题（28） ---------- */
{ id:"sb_p2_tallbuilding", type:"P2", period:"2026-09-04", isNew:false, frequency:"ultra", category:"地点",
    titleEn:"A tall building you like or dislike", titleZh:"喜欢或不喜欢的高建筑",
    promptEn:"Describe a tall building you like or dislike.", promptZh:"描述一栋你喜欢或不喜欢的高建筑。",
    youShouldSay:["What it is used for","Where it is","What it looks like","And explain why you like or dislike it"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_video", type:"P2", period:"2026-09-04", isNew:false, frequency:"medium", category:"物品",
    titleEn:"An interesting video", titleZh:"有趣视频",
    promptEn:"Describe an interesting video.", promptZh:"描述一个有趣的视频。",
    youShouldSay:["When and where you watched it","What it is about","Why you watched it","And explain how you feel about it"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_earlyrise", type:"P2", period:"2026-09-04", isNew:false, frequency:"medium", category:"事件",
    titleEn:"A time when you got up early", titleZh:"早起经历",
    promptEn:"Describe a time when you got up early.", promptZh:"描述一次你早起的经历。",
    youShouldSay:["When it was","What you did","Why you got up early","And how you felt about it"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_boringplace", type:"P2", period:"2026-09-04", isNew:false, frequency:"medium", category:"地点",
    titleEn:"A boring place", titleZh:"去过的无聊地方",
    promptEn:"Describe a boring place.", promptZh:"描述一个无聊的地方。",
    youShouldSay:["Where it is","Who you went there with","What you did there","And explain why you think it is a boring place"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_plantsperson", type:"P2", period:"2026-09-04", isNew:false, frequency:"medium", category:"人物",
    titleEn:"A person who loves to grow plants", titleZh:"喜欢在家/花园种菜的人",
    promptEn:"Describe a person who loves to grow plants (e.g. vegetables, flowers) at home or in the garden.", promptZh:"描述一个喜欢在家/花园种菜（植物）的人。",
    youShouldSay:["Who this person is","What plants he/she grows","How he/she grows the plants","And explain why he/she loves growing plants"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"可套舅舅母本(种植物)", proficiency:"没练" },
{ id:"sb_p2_newlaw", type:"P2", period:"2026-09-04", isNew:false, frequency:"medium", category:"抽象",
    titleEn:"A new law you would like to introduce", titleZh:"想颁布的新法律",
    promptEn:"Describe a new law you would like to introduce in your country.", promptZh:"描述一项你想在国家颁布的新法律。",
    youShouldSay:["What law it is","What changes this law brings","Whether this new law will be popular","How you came up with the new law","And explain how you feel about this new law"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"可套舅舅母本", proficiency:"没练" },
{ id:"sb_p2_childhoodfriend", type:"P2", period:"2026-09-04", isNew:false, frequency:"medium", category:"人物",
    titleEn:"A friend from your childhood", titleZh:"发小",
    promptEn:"Describe a friend from your childhood.", promptZh:"描述一个你童年时的朋友。",
    youShouldSay:["Who he/she is","Where and how you met each other","What you often did together","And explain what made you like him/her"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"可套妹妹母本(发小)", proficiency:"没练" },
{ id:"sb_p2_medperson", type:"P2", period:"2026-09-04", isNew:false, frequency:"low", category:"人物",
    titleEn:"A person who wants a career in medicine", titleZh:"想从事医疗行业的人",
    promptEn:"Describe a person you know who would like to choose a career in the medical field (e.g. a doctor, a nurse).", promptZh:"描述一个你认识的想从事医疗行业（如医生、护士）的人。",
    youShouldSay:["When you knew him/her","When he/she started to think about that","What he/she would like to do","And explain why he/she would like to choose this career"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"可套Leo母本(想从医)", proficiency:"没练" },
{ id:"sb_p2_bizowner", type:"P2", period:"2026-09-04", isNew:false, frequency:"medium", category:"人物",
    titleEn:"A person who has a successful business", titleZh:"拥有成功商业的人",
    promptEn:"Describe a person you know who has a successful business.", promptZh:"描述一个你认识的拥有成功生意的人。",
    youShouldSay:["Who this person is","How you got to know him/her","Why and how he/she started the business","What business he/she does","And explain why you think the business is successful"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_planchange", type:"P2", period:"2026-09-04", isNew:false, frequency:"medium", category:"事件",
    titleEn:"A plan you had to change recently", titleZh:"近期改变的计划",
    promptEn:"Describe a plan that you had to change recently.", promptZh:"描述一个你最近不得不改变的计划。",
    youShouldSay:["When this happened","What made you change the plan","What the new plan was","And how you felt about the change"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_teamwork", type:"P2", period:"2026-09-04", isNew:false, frequency:"high", category:"事件",
    titleEn:"Working in a team", titleZh:"在团队中工作",
    promptEn:"Describe a time when you worked in a group.", promptZh:"描述一次你在团队中工作的经历。",
    youShouldSay:["What you did","Who you worked with","What problems you faced","And explain why you worked in the group"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_decision", type:"P2", period:"2026-09-04", isNew:false, frequency:"medium", category:"事件",
    titleEn:"An important decision you made", titleZh:"重要决定",
    promptEn:"Describe an important decision that you made.", promptZh:"描述你做出的一个重要决定。",
    youShouldSay:["What the decision was","How you made your decision","What the results of the decision were","And explain why it was important"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_describe_a_live_sports_event_you_watched29", type:"P2", period:"2026-09-04", isNew:false, frequency:"high", category:"事件",
    titleEn:"A live sports event you watched and liked", titleZh:"喜欢的现场体育赛事",
    promptEn:"Describe a live sports event you watched and liked.", promptZh:"描述一场你喜欢看的现场体育赛事。",
    youShouldSay:["What it was","When and where you watched it","Who you watched it with","And explain why you liked it"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_specialfood", type:"P2", period:"2026-09-04", isNew:false, frequency:"high", category:"物品",
    titleEn:"Food for special occasions", titleZh:"特别场合的食物",
    promptEn:"Describe a food that people eat on special occasions/events.", promptZh:"描述一种人们在特殊场合吃的食物。",
    youShouldSay:["What it is","What the special event/occasion is","How it is cooked/made","And explain why people eat it on that special occasion/event"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_langperson", type:"P2", period:"2026-09-04", isNew:false, frequency:"medium", category:"人物",
    titleEn:"A person good at learning languages", titleZh:"擅长学习和说语言的人",
    promptEn:"Describe a person who is good at learning and speaking new languages.", promptZh:"描述一个擅长学习和说新语言的人。",
    youShouldSay:["How you got to know him/her","How he/she learns a new language","What languages he/she can speak","And explain how you feel about him/her"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_techprob", type:"P2", period:"2026-09-04", isNew:false, frequency:"high", category:"事件",
    titleEn:"A technological problem you faced", titleZh:"遇到的科技问题",
    promptEn:"Describe a challenging technological problem you faced.", promptZh:"描述一个你遇到的有挑战性的科技问题。",
    youShouldSay:["What the problem was","When and where you faced it","How challenging it was","And explain how you solved it"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"可套Leo母本(机智解决)", proficiency:"没练" },
{ id:"sb_p2_adceleb", type:"P2", period:"2026-09-04", isNew:false, frequency:"high", category:"物品",
    titleEn:"An advertisement with a famous person", titleZh:"名人出演的广告",
    promptEn:"Describe an advertisement with a famous person in it.", promptZh:"描述一个有名人出演的广告。",
    youShouldSay:["Who the person is","Where you can see it","What the advertisement is about","And explain how you feel about the advertisement"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_recommendplace", type:"P2", period:"2026-09-04", isNew:false, frequency:"medium", category:"地点",
    titleEn:"A place you travelled and would recommend", titleZh:"推荐旅行过的地方",
    promptEn:"Describe a place you have travelled to that you would like to recommend to others.", promptZh:"描述一个你去旅行过并想推荐给别人的地方。",
    youShouldSay:["What it is","Where it is","What you saw and did there","And explain why you would like to recommend it to others"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_visitnotlive", type:"P2", period:"2026-09-04", isNew:false, frequency:"high", category:"地点",
    titleEn:"A home you like to visit but not live in", titleZh:"喜欢拜访但不想住的家",
    promptEn:"Describe a home that you like to visit but do not want to live in.", promptZh:"描述一个你喜欢拜访但不想住的家。",
    youShouldSay:["Where it is","What it is like","Why you like to visit it","And explain why you would not like to live there"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_animalstory", type:"P2", period:"2026-09-04", isNew:false, frequency:"medium", category:"抽象",
    titleEn:"A story/book with animals", titleZh:"包含动物的故事或书",
    promptEn:"Describe a story/book with animals in it.", promptZh:"描述一个包含动物的故事或一本书。",
    youShouldSay:["What animals are in it","What the story/book is about","Why you read the story/book","And explain what you think of this story/book"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_smartproblem", type:"P2", period:"2026-09-04", isNew:false, frequency:"medium", category:"人物",
    titleEn:"A person who solved a problem in a smart way", titleZh:"机智解决问题的人",
    promptEn:"Describe a person who solved a problem in a smart way.", promptZh:"描述一个机智解决问题的人。",
    youShouldSay:["Who this person is","What the problem was","How he/she solved it","And explain why you think he/she did it in a smart way"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_lawenv", type:"P2", period:"2026-09-04", isNew:false, frequency:"low", category:"抽象",
    titleEn:"A law on environmental protection", titleZh:"保护环境的法律",
    promptEn:"Describe a law on environmental protection.", promptZh:"描述一项保护环境的法律。",
    youShouldSay:["What it is","How you first learned about it","Who benefits from it","And explain how you feel about this law"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"可套舅舅母本", proficiency:"没练" },
{ id:"sb_p2_waitmsg", type:"P2", period:"2026-09-04", isNew:false, frequency:"low", category:"事件",
    titleEn:"A message that got no reply for long", titleZh:"很久没收到回复的信息",
    promptEn:"Describe a time when you sent a message or an email to someone but received no reply for a long time.", promptZh:"描述一次你发信息/邮件给某人但很久没收到回复的经历。",
    youShouldSay:["Who you sent it to","What the message/email was about","Whether you finally received the reply","And explain how you felt about the experience"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_ambition", type:"P2", period:"2026-09-04", isNew:false, frequency:"low", category:"抽象",
    titleEn:"A long-term goal/ambition", titleZh:"长久目标/抱负",
    promptEn:"Describe a long-term goal/ambition you would like to achieve.", promptZh:"描述一个你想实现的长期目标/抱负。",
    youShouldSay:["How long you have had this goal/ambition","What it is","How you will achieve it","And explain why you set it"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_changemind", type:"P2", period:"2026-09-04", isNew:false, frequency:"low", category:"事件",
    titleEn:"A time you changed an important opinion", titleZh:"改变重要想法",
    promptEn:"Describe a time when you changed an important opinion of yours.", promptZh:"描述一次你改变重要想法的经历。",
    youShouldSay:["When you changed your opinion","What the original opinion was","Why you changed it","And explain how you felt about the experience"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_ecolaw", type:"P2", period:"2026-09-04", isNew:false, frequency:"medium", category:"抽象",
    titleEn:"An environmental law you would like to introduce", titleZh:"想要颁布的环保法律",
    promptEn:"Describe an environmental law you would like your country to introduce.", promptZh:"描述一项你想让国家颁布的环保法律。",
    youShouldSay:["What law it should be","Why people should follow the law","Whether the law will be popular","And explain how you feel about this law"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"可套舅舅母本", proficiency:"没练" },
{ id:"sb_p2_localnews", type:"P2", period:"2026-09-04", isNew:false, frequency:"medium", category:"事件",
    titleEn:"A piece of local news", titleZh:"当地新闻",
    promptEn:"Describe a piece of local news that people are interested in.", promptZh:"描述一则人们感兴趣的当地新闻。",
    youShouldSay:["What it was about","Where you saw/heard it","Who was involved","And explain why people were interested in it"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
{ id:"sb_p2_change", type:"P2", period:"2026-09-04", isNew:false, frequency:"low", category:"事件",
    titleEn:"A change you made recently", titleZh:"近期改变",
    promptEn:"Describe a change that you made recently.", promptZh:"描述你最近做出的一个改变。",
    youShouldSay:["What the change was","What caused the change","What you did for the change","And explain how you feel about the change"],
    questions:[], cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
];

/* 口语题库版本号：每次题库大改（删题/建题/调档位）递增。
 * hubLoad 检测到本地 DATA.speakingVersion 落后于此值，则整体用最新库替换本地旧库，
 * 根治「旧 localStorage 累积 100+ 题 / 档位错乱清不掉」的问题（用户刷新即生效，无需手动清缓存）。 */
const SPEAKING_BANK_VERSION = 5;

/* 口语合并：以官方 SPEAKING_BANK 为基准，保留用户个人内容、丢弃非官方题。
   入参 localSpeaking = 用户本地/导入的口语数组（可能含旧 100+ 题、框架母本、已填 answers）。
   返回 = 与官方题库一一对应的新数组，仅回填用户同 id 题的个人内容（answers/串题答案/练习 records），
   绝不新增官方库以外的题、绝不覆盖官方题干。供 hubLoad 版本合并与 importData 导入共用。 */
function mergeSpeakingKeepAnswers(localSpeaking){
  if(!SPEAKING_BANK || !SPEAKING_BANK.length) return localSpeaking || [];
  const legacyDel = (DATA.settings && Array.isArray(DATA.settings.deletedSpeakingIds)) ? DATA.settings.deletedSpeakingIds : [];
  const deletedIds = new Set([...(DATA.deletedIds||[]), ...legacyDel]);
  const localById = {};
  (localSpeaking || []).forEach(s => { if(s && s.id) localById[s.id] = s; });
  return SPEAKING_BANK
    .filter(official => !deletedIds.has(official.id))
    .map(official => {
      const local = localById[official.id];
      if(!local) return Object.assign({}, official);
      const keep = Object.assign({}, official);
      if(local.answers) keep.answers = local.answers;
      if(local.speakingStories) keep.speakingStories = local.speakingStories;
      if(local.titleZh) keep.titleZh = local.titleZh;
      if(local.category) keep.category = local.category;
      if(local.frequency) keep.frequency = local.frequency;
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
    _fieldTs: {}
  },
  errorbook: [],
  longSent: [],           // 长难句拆解记录（合并进「词句」页，由 errorbook.js 读写）
  energy: [],
  checkins: [],
  mockRecords: [],
  deletedIds: [],   // 全局墓碑：所有删除操作的 raw id 集合，跨同步传播删除
  deletedWrongKeys: [],   // 错句级墓碑：已删「标准句+错误写法」组合 key（sourceId|right|wrong），跨同步传播错句本/默写详情的单处删除
  speaking: SPEAKING_BANK,   // 纯官方题库（题目），框架母本(sp_p1_*/sp_p2_*)已移除，不再混入任何框架类内容
  speakingStories: [],
  writingScores: [],
  dictationSources: [],   // 默写本：[{id,title,text,createdAt}]
  dictationLogs: [],      // 错处记录：[{id,sourceId,sourceTitle,date,userText,correctText,mistakes,weakThisTime,parsed}]
  writing: [
    { id:'wt_a', category:'动态图', title:'动态图（线/柱带年份）', skeleton:'The 【chart / graph / table】 illustrates 【图内容+时间范围】. The data is measured in 【percent / millions / thousands】, providing a clear overview of the changes that took place over the given period.\n\nOverall, it is clear that 【总体趋势 1】. Additionally, 【总体趋势 2·名词短语】 stood out throughout the period as the most striking feature. It is also noticeable that the figures changed clearly over the period, rather than remaining steady.\n\nLooking at the details, 【数据 1】 started at 【数值】 in 【年份】 and then 【趋势变化 + 趋势词】. This represents a considerable increase compared to its starting point, and the upward momentum remained consistent across most of the timeframe.\n\nIn contrast, 【数据 2】 showed a different pattern. It 【趋势变化】, from 【数值】 in 【年份】 to 【数值】 in 【年份】. Meanwhile, 【其他数据点】 remained relatively stable, showing little variation. Taken together, the data reveals a clear divergence between the two groups.', tips:'结构：开头改写｜概述(2个总体)｜细节1(写一组)｜细节2(对比另一组)。必背趋势词：rose steadily / declined gradually / remained stable at / reached a peak of / accounted for / compared to。填空直接抄题干改写与数值，不自己造。' },
    { id:'wt_b', category:'静态图', title:'静态图（饼/表/静态柱）', skeleton:'The 【pie chart / table / charts】 illustrates 【图内容+时间(若有)】. The data is measured in 【percent / number of people】, giving a clear picture of the distribution of 【总类】.\n\nOverall, it is clear that 【最大类·名词短语】 accounted for the largest share, at 【数值】%. Additionally, the contrast between the top and bottom categories stood out as the most striking feature. It is also noticeable that the remaining categories were considerably smaller, showing a clear gap rather than an even spread.\n\nLooking at the details, 【最大类】 represented 【数值】%, which was the most significant. 【类 2】 followed at 【数值】%, while 【类 3】 made up 【数值】%.\n\nMeanwhile, 【类 4】 remained relatively minor, at 【数值】%. 【类 5】 showed a different pattern, reaching 【数值】%. Taken together, the data reveals a clear gap between the top and bottom categories.', tips:'用于饼图/表格/无时间轴柱图/混合图。必背占比词：accounted for the largest share / made up the smallest proportion / followed at / compared to。与§六时间轴模板不混用。' },
    { id:'wt_c', category:'地图题', title:'地图题（改造前后对比）', skeleton:'The two maps illustrate the changes made to 【地方】 before and after 【事件 / redesign】. Overall, the area has been significantly reorganized, with new facilities added and some original areas removed or repurposed.\n\nPreviously, 【原布局·填短语】 was located in the 【方位·填短语】. This has been divided into 【新分区·填短语】, and the 【消失的部分·填短语】 has been removed completely.\n\nSeveral new features have been added. 【新增 1·填短语】 has been introduced along the 【方位】, and 【新增 2·填短语】 has been built at the 【方位】. Meanwhile, 【不变的部分·填短语】 remains in the same position.', tips:'被动语态 + 方位词两套逻辑。必背被动8个(was located / has been replaced by / removed / added / divided into / relocated / remains / extended) + 方位10个(north/south/east/west/corner/centre/left/right/next to/between)。' },
    { id:'wt_d', category:'流程图', title:'流程图（自然过程/工序/循环）', skeleton:'The diagram illustrates how 【过程是什么·填短语】 is formed through 【关键条件·填短语】. Overall, the process consists of several key stages, starting from 【起点】 and ending with 【终点 / 结果】.\n\nFirst, 【原材料/起始物·填短语】 approaches 【地点】. Then, as it hits 【阻碍物·填短语】, it is pushed upwards and rises. When the air rises, it cools and 【结果 1·填短语】 forms above.\n\nOnce 【条件·填短语】, 【动作·填短语】 falls on 【位置·填短语】. After this, 【后续物·填短语】 continues over 【地点】 and moves down. Finally, these 【终点物·填短语】 reach 【终点】, where 【最终结果·填短语】, creating 【产物·填短语】.', tips:'顺序连接词(First/Then/Once/Finally) + 被动主动混合。必背动词8个(approaches/reaches/is pushed upwards/rises and cools/forms/falls/continues/results in)。' },
    { id:'wt_ba', category:'观点型', title:'观点型（第一优先背）', skeleton:'The debate surrounding 【话题】 has engaged a broad audience recently. From my perspective, I totally agree that 【观点】. This is an important issue, because its effects reach far beyond the situation we see now.\n\nFirst of all, 【核心主题】 undoubtedly brings substantial benefits. One key strength is its ability to improve 【普适领域】, thereby building a firm basis for 【进阶目标】. As a result, this practice not only generates short-term benefits but also contributes to long-term outcomes. Another significant advantage is that it addresses problems from the ground up by removing 【潜在原因】. For example, this has helped many people and improved life satisfaction. This then creates a ripple effect that helps a wide range of people in their daily lives.\n\nHowever, opponents may argue that 【反方观点】. Nevertheless, this advantage is short-lived, as the initial effect quickly fades once 【简单条件】. More importantly, these short-term gains often hide deeper problems that quick fixes cannot solve. In the end, the problems caused by ignoring the real issue are much bigger than any short-term comfort it gives.\n\nIn summary, for all the reasons above, I totally agree with 【话题】. On the one hand, it brings benefits; on the other hand, its downsides are limited. Therefore, the overall impact should be viewed as largely positive.', tips:'选一边站(agree固定)。【话题】题干词换进去；动词开头加 -ing。结尾【话题】= 开头 -ing 短语原样再抄。填空直接抄：普适领域/进阶目标用万能短语(people\'s well-being / quality of life / living standards)。' },
    { id:'wt_bb', category:'讨论型', title:'讨论型（第二优先背）', skeleton:'The debate surrounding 【话题】 has engaged a broad audience recently. Some people think 【观点 A】, while others believe 【观点 B】. After thinking about both sides, I agree more with the latter one.\n\nOn the one hand, the first view has some truth. People who support it believe it brings real benefits to 【普适领域】. One key strength is its ability to improve 【普适领域】, thereby building a firm basis for 【进阶目标】. As a result, this practice not only generates short-term benefits but also contributes to long-term outcomes. For example, this has helped many people and improved life satisfaction. This then creates a ripple effect that helps a wide range of people in their daily lives.\n\nOn the other hand, I support the second view. In my opinion, 【观点 B 核心理由】 matters more in the long run. This is because if we do not fix this basic problem first, the good results will not last. More importantly, these short-term gains often hide deeper problems that quick fixes cannot solve. In the end, the problems caused by ignoring the real issue are much bigger than any short-term comfort it gives.\n\nIn conclusion, I believe 【立场】 is the better choice. On the one hand, it brings benefits; on the other hand, its downsides are limited. Therefore, the overall impact should be viewed as largely positive.', tips:'支持第二方(latter固定)。正文1客观讲对方道理(题目要求 discuss both views 必须写)，正文2驳论式。观点 A/B/立场填名词短语或 -ing 短语。' },
    // === 5.0 目标万能版（新增）===
    { id:'wt_a5', category:'动态图', title:'动态图（线图/柱状图/变化图）完整背诵版', skeleton:'The 【chart / graph / table】 illustrates 【图内容+时间范围】. The data is measured in 【percent / millions / thousands】, providing a clear overview.\n\nOverall, it is clear that 【总体趋势 1】. Additionally, 【总体趋势 2】 stood out as the most striking feature. It is also noticeable that the figures changed clearly.\n\nLooking at the details, 【数据 1】 started at 【数值】 in 【年份】 and then 【趋势变化】. This was a big change. The number kept going up.\n\nIn contrast, 【数据 2】 showed a different pattern. It 【趋势变化】, from 【数值】 in 【年份】 to 【数值】 in 【年份】. Meanwhile, 【其他数据点】 remained relatively stable. There was little change.\n\nIn conclusion, the two groups were very different.', tips:'完整背诵版（动态图：线图/柱状图/变化图）。Overview 写两条总体趋势；Details 第一段写一个数据的起止变化，第二段用 In contrast 写另一数据的不同走向，Meanwhile 写稳定项。只填名词/数值，不自己造语法。' },
    { id:'wt_b5', category:'静态图', title:'静态图（饼图/表格）完整背诵版', skeleton:'The 【pie chart / table / charts】 illustrates 【图内容+时间(若有)】. The data is measured in 【percent / number of people】, giving a clear overview.\n\nOverall, it is clear that 【最大类】 accounted for the largest share, at 【数值】%. Additionally, the biggest and smallest were very different. The others were much smaller.\n\nLooking at the details, 【最大类】 was 【数值】%. 【类 2】 was 【数值】%, and 【类 3】 was 【数值】%.\n\nMeanwhile, 【类 4】 was 【数值】%. 【类 5】 was 【数值】%.\n\nIn conclusion, the biggest and smallest were very different.', tips:'完整背诵版（静态图：饼图/表格）。Overview 写最大类占比+最大最小差异；Details 逐类列百分比，类别不够5个时写几类。只填名词/数值，不自己造语法。' },
    { id:'wt_c5a', category:'地图题', title:'地图题（对比两个图）万能版', skeleton:'The two diagrams show 【图 A】 and 【图 B】. This gives a clear overview.\n\nOverall, it is clear that they are different. 【图 B】 is bigger and has more things.\n\nLooking at the details, 【图 A】 has 【物品 1】 and 【物品 2】. It is simple and small. In contrast, 【图 B】 has 【物品 3】 and 【物品 4】. There is also 【物品 5】 in 【图 B】, but 【图 A】 does not have it.\n\nIn conclusion, this is easy to understand. 【图 B】 is more comfortable, but 【图 A】 is cheaper.', tips:'对比两个图（房间A vs B / Plan A vs B / 两个设计图）。【图A/B】填图名（Plan A / the old room）；【物品1-5】填具体物件（a bed / a TV / a balcony）。约90词。只填名词短语，不自己造语法。' },
    { id:'wt_c5b', category:'地图题', title:'地图题（before & after）万能版', skeleton:'The two maps show 【地方】 in 【年份 A】 and 【年份 B】. This gives a clear overview.\n\nOverall, it is clear that the area changed a lot. Some old things went away and many new things came.\n\nIn the past, there was 【旧 A】 in the north. Now it is 【新 A】. People took away the 【旧 B】 in the west. They built 【新 B】 there instead. This was a big change. 【新 C】 was built in the east, and 【新 D】 appeared in the south. However, the 【不变】 in the center did not change.\n\nIn conclusion, this is easy to understand. 【地方】 is very different now.', tips:'地图变化（before & after / 过去现在对比）。【地方】填公园/城镇/校园（the park / the town）；【年份】填 1990 / 2020；【旧A-新D】填方位+物件（a forest→a hotel / a playground）。约110词。只填名词短语，不自己造语法。' },
    { id:'wt_d5', category:'流程图', title:'流程图（怎么做/怎么形成）万能版', skeleton:'The diagram shows how 【过程】 works. This gives a clear overview.\n\nOverall, it is clear that there are several steps. It starts from 【起点】 and ends with 【终点】.\n\nFirst, 【东西 A】 goes into 【地点 A】. Then it becomes 【东西 B】. Next, 【东西 B】 moves to 【地点 B】. After that, 【东西 C】 appears. It changes into 【东西 D】. This is very important. Finally, 【最终结果】 is finished. The process is complete.\n\nIn conclusion, this is easy to understand. It is very useful for people.', tips:'流程图（怎么做/怎么形成）。【过程】填主题（rainwater collection / making cheese）；【起点/终点】填原材料→产物（rain→clean water）；【东西A-结果】填各步骤物件（raw material / a machine / the product）。只填名词短语，不自己造语法。' },
    // === 大作文C Report 题型（2026-08-23 用户自制骨架，替换原 4 条 Report 模板）===
    /* 先亮立场 + 让步反驳（Body2 写反方观点再回击）；【】内为可选项：题干问“如何解决”时保留 However, I think the government should take action. */
    { id:'wt_cr3', category:'Report', title:'先表态再分析（万能版）', skeleton:'The debate surrounding 【话题】 has engaged a broad audience recently. From my perspective, 【话题】 is a serious problem, and this essay will discuss why it happens.\n\nFirst of all, there are several clear reasons why this happens. One key strength is its ability to improve 【普适领域】, thereby building a firm basis for 【进阶目标】. As a result, this practice not only generates short-term benefits but also contributes to long-term outcomes. Another significant advantage is that it addresses problems from the ground up by removing 【潜在原因】. For example, this has helped many people and improved life satisfaction. This then creates a ripple effect that helps a wide range of people in their daily lives. 【题目问解决时才加这句：However, I think the government should take action.】\n\nHowever, opponents may argue that 【反方观点】. Nevertheless, this advantage is short-lived, as the initial effect quickly fades once 【简单条件】. More importantly, these short-term gains often hide deeper problems that quick fixes cannot solve. In the end, the problems caused by ignoring the real issue are much bigger than any short-term comfort it gives.\n\nIn conclusion, 【话题】 is a complex problem. On the one hand, it brings benefits; on the other hand, its downsides are limited. Therefore, the overall impact should be viewed as largely positive.', tips:'Report 题型（用户自制「先亮立场 + 让步反驳」万能骨架）。开头直接表态【话题】is a serious problem 并点明 discuss why it happens；Body1 写原因（strength / advantage 措辞，填【普适领域】【进阶目标】【潜在原因】）；Body2 先让步写【反方观点】再回击（【简单条件】让短期优势失效）。中间【题目问解决时才加这句：However, I think the government should take action.】只在题干问 how / what to do / solutions 时保留，否则整行删掉。只填名词短语，不自己造语法。' }
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
      'dictationSources','dictationLogs','longSent','deletedIds'];
    for(const f of arrayFields){ if(!Array.isArray(DATA[f])) DATA[f] = []; }
    // 2026-08-29 修复：早期默写记录(dictationLogs)可能无 id，删除墓碑(整条删光依赖 log.id)
    // 与部分删除的 updatedAt(合并按 id 取本地优先)都会失效，导致错句本「删了又复活」。
    // 全局补 uid，并 hubSave 触发上传，让云端也拿到带 id 的 log，消除合并分叉。
    if(Array.isArray(DATA.dictationLogs)){
      let _dmig = false;
      DATA.dictationLogs.forEach(l => { if(l && l.id == null){ l.id = uid(); _dmig = true; } });
      if(_dmig) hubSave();
    }
    if(!DATA.settings || typeof DATA.settings !== 'object') DATA.settings = {};
    // 口语题库版本控制（2026-08-23 重构：根治「升版本吞用户答案」）：
    //   以官方 SPEAKING_BANK（官方题库纯题目，题数以数组实际为准）为唯一基准，绝不整锅替换。
    //   合并规则：官方题永远保留；用户本地同 id 题的「个人内容」(answers/串题答案/练习 records)
    //   回填进官方题；本地多出来的非官方题（旧 100+ 题、框架母本 sp_p*）直接丢弃——
    //   实现用户要求：无论题库怎么升版本、导入什么旧数据，都只导「练过/填过的题的内容」，
    //   不新增官方库以外的题、不覆盖官方题。
    // 优化：仅在口语题库版本变化时才重跑合并 + 落盘；否则跳过，
    // 避免每次加载都做一次整库写盘（数据越大越卡）。
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
        ['wt_a5','wt_b5','wt_c5a','wt_c5b','wt_d5'].forEach(id => {
          const local = DATA.writing.find(t => t.id === id);
          const seed = DEFAULT_WRITING_TEMPLATES.find(t => t.id === id);
          if(local && seed){ local.skeleton = seed.skeleton; local.title = seed.title; local.tips = seed.tips; wdirty = true; }
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

function hubSave(){
  try{
    DATA._lastSaved = Date.now();   // 记录本机保存时间，供云端下载比对新旧（Bug17）
    localStorage.setItem(HUB_KEY, JSON.stringify(DATA));
    saveCredsMirror();              // 同步镜像账号凭证到隔离键，确保 Key/手机号永不因主 blob 被清而丢失
  }
  catch(e){ alert('保存失败：浏览器存储不可用，请用「历史/设置」导出备份。'); }
  // 云端自动同步（防抖）：仅当开启且已生成登录码；失败静默，不弹 toast
  if(typeof scheduleCloudUpload === 'function') scheduleCloudUpload();
}

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

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
