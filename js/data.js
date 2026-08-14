/* 数据层：localStorage 读写与默认数据 */
const HUB_KEY = 'ielts_study_hub_v1';

const MODULES = [
  { id:'vocab', name:'背单词', icon:'📚', color:'#6366f1', children:[
    { id:'vocab_review', name:'复习单词', icon:'🔁', practice:'flashcard' },
    { id:'vocab_read',   name:'阅读词汇·看词选义', icon:'👁', practice:'seeWord' },
    { id:'vocab_listen', name:'听力词汇·听义选义', icon:'👂', practice:'hearMeaning' },
    { id:'vocab_corpus', name:'听力词汇语料库', icon:'📋', practice:'corpus' },
    { id:'vocab_dict',   name:'默写单词·听读音', icon:'✍️', practice:'dictation' },
  ]},
  { id:'listening', name:'听力', icon:'🎧', color:'#0ea5e9', children:[
    { id:'listening_set',     name:'听力 S1+S4 填空 1 套', icon:'📝' },
    { id:'listening_corpus',  name:'语料库听写 1 组', icon:'📋' },
    { id:'listening_shadow',  name:'精听 + 跟读模仿 1 段', icon:'🎯' },
  ]},
  { id:'reading', name:'阅读', icon:'📖', color:'#10b981', children:[
    { id:'reading_p1',    name:'阅读 1 篇 P1（计时 20min）', icon:'⏱️' },
    { id:'reading_tfng',  name:'FALSE / NOT GIVEN 专项 10 题', icon:'🔍' },
    { id:'reading_rev',   name:'复盘错题：矛盾 vs 没提', icon:'🧠' },
  ]},
  { id:'writing', name:'写作', icon:'✍️', color:'#f59e0b', children:[
    { id:'writing_t2',      name:'Task2 四段式练 1 篇', icon:'📝' },
    { id:'writing_tpl',     name:'背 / 默写作模板 1 段', icon:'📚' },
    { id:'writing_outline', name:'审题：5 题列提纲', icon:'🧩' },
  ]},
  { id:'speaking', name:'口语', icon:'🗣️', color:'#ef4444', children:[
    { id:'speaking_gpt', name:'GPT 口语对话 15min（P1）', icon:'💬' },
    { id:'speaking_p2',  name:'串题素材复述 1 个 P2 说满 2min', icon:'🎤' },
    { id:'speaking_rec', name:'录音自查流利度', icon:'🎙️' },
  ]},
];

/* 默认常用网址（代码层种子，被清空时可一键恢复） */
const DEFAULT_LINKS = [
  { id:'l1', name:'九分学长·考雅机考平台', note:'本地软件，每天打开刷题', url:'', badge:'本地' },
  { id:'l2', name:'雅思官网', note:'报名 / 模考', url:'https://www.ielts.org/', badge:'打开' },
  { id:'l3', name:'爱听写·免费雅思考网', note:'', url:'https://www.idictation.cn/', badge:'打开' },
  { id:'l4', name:'ChatGPT（口语对话练习）', note:'', url:'https://chatgpt.com/', badge:'打开' }
];

/* 常用网址被清空时，一键写回默认种子 */
function restoreDefaultLinks(){
  DATA.settings.links = JSON.parse(JSON.stringify(DEFAULT_LINKS));
  hubSave();
  if(typeof renderFavLinks === 'function') renderFavLinks();
  if(typeof renderLinks === 'function') renderLinks();
  if(typeof toast === 'function') toast('已恢复默认常用网址');
}

/* ===== 5-8 月口语题库（高频顺序录入，完整题库待补） ===== */
const FREQ_LABEL = { ultra:'超高频', high:'高频', must:'必考题', medium:'中高频', normal:'普通' };
const SPEAKING_BANK = [
  /* ---- P1 超高频/高频/必考 ---- */
  { id:'sb_p1_watch', type:'P1', period:'2026-05-08', isNew:true, frequency:'ultra', category:'物品', titleEn:'Watch', titleZh:'手表',
    questions:['Do you usually wear a watch?','Do you think watches are important?','Have you ever received a watch as a gift?','Why do some people like wearing watches?'],
    cue:'', content:'', keywords:'', linkedTo:'可套框架④', proficiency:'没练' },
  { id:'sb_p1_cars', type:'P1', period:'2026-05-08', isNew:true, frequency:'ultra', category:'物品', titleEn:'Cars', titleZh:'汽车',
    questions:['Do you like cars?','Do you have a car?','Do you prefer to be a driver or a passenger?','Is it important to know how to drive?'],
    cue:'', content:'', keywords:'', linkedTo:'可套框架④', proficiency:'没练' },
  { id:'sb_p1_websites', type:'P1', period:'2026-05-08', isNew:true, frequency:'ultra', category:'物品', titleEn:'Websites', titleZh:'网页',
    questions:['What kind of websites do you often visit?','Do you think websites are reliable?','What is your favorite website?','Do you prefer using apps or websites?'],
    cue:'', content:'', keywords:'', linkedTo:'可套框架④', proficiency:'没练' },
  { id:'sb_p1_teachers', type:'P1', period:'2026-05-08', isNew:true, frequency:'ultra', category:'人物', titleEn:'Teachers', titleZh:'老师',
    questions:['Do you have a favorite teacher?','Do you want to be a teacher in the future?','Do you think teachers are important?','What qualities should a good teacher have?'],
    cue:'', content:'', keywords:'', linkedTo:'可套框架⑤', proficiency:'没练' },
  { id:'sb_p1_art', type:'P1', period:'2026-05-08', isNew:true, frequency:'ultra', category:'抽象', titleEn:'Art', titleZh:'艺术',
    questions:['Do you like art?','Do you enjoy visiting art galleries?','Have you ever tried creating art?','Do you think art is important for children?'],
    cue:'', content:'', keywords:'', linkedTo:'可套框架⑥', proficiency:'没练' },
  { id:'sb_p1_parks', type:'P1', period:'2026-05-08', isNew:true, frequency:'ultra', category:'地点', titleEn:'Public gardens and parks', titleZh:'公园',
    questions:['Do you often visit parks?','What do you usually do in parks?','Are there many parks near your home?','Do you think parks are important for cities?'],
    cue:'', content:'', keywords:'', linkedTo:'可套框架②', proficiency:'没练' },
  { id:'sb_p1_mirrors', type:'P1', period:'2026-05-08', isNew:true, frequency:'high', category:'物品', titleEn:'Mirrors', titleZh:'镜子',
    questions:['Do you often look in the mirror?','Do you have mirrors in your home?','Have you ever bought a mirror?','Do you think mirrors are necessary?'],
    cue:'', content:'', keywords:'', linkedTo:'可套框架④', proficiency:'没练' },
  { id:'sb_p1_socialmedia', type:'P1', period:'2026-05-08', isNew:true, frequency:'high', category:'日常', titleEn:'Social media', titleZh:'社交媒体',
    questions:['Do you use social media?','How much time do you spend on social media?','Do you think social media is good or bad?','What social media platforms do you use?'],
    cue:'', content:'', keywords:'', linkedTo:'可套框架④', proficiency:'没练' },
  { id:'sb_p1_clothing', type:'P1', period:'2026-05-08', isNew:true, frequency:'high', category:'物品', titleEn:'Clothing', titleZh:'衣服',
    questions:['What kind of clothes do you usually wear?','Do you prefer formal or casual clothes?','Have your clothing preferences changed?','Do you think clothes are important?'],
    cue:'', content:'', keywords:'', linkedTo:'可套框架④', proficiency:'没练' },
  { id:'sb_p1_headphones', type:'P1', period:'2026-05-08', isNew:true, frequency:'high', category:'物品', titleEn:'Headphones', titleZh:'耳机',
    questions:['Do you use headphones?','When do you use headphones?','What kind of headphones do you prefer?','Would you buy expensive headphones?'],
    cue:'', content:'', keywords:'', linkedTo:'可套框架④', proficiency:'没练' },
  { id:'sb_p1_tidiness', type:'P1', period:'2026-05-08', isNew:true, frequency:'high', category:'日常', titleEn:'Tidiness', titleZh:'整洁',
    questions:['Are you a tidy person?','Do you keep your room tidy?','Is it important to be tidy?','Do you think people should be tidy?'],
    cue:'', content:'', keywords:'', linkedTo:'可套框架③', proficiency:'没练' },
  { id:'sb_p1_shopping', type:'P1', period:'2026-05-08', isNew:true, frequency:'high', category:'日常', titleEn:'Shopping', titleZh:'购物',
    questions:['Do you like shopping?','How often do you go shopping?','Do you prefer online or in-store shopping?','What do you usually buy?'],
    cue:'', content:'', keywords:'', linkedTo:'可套框架③', proficiency:'没练' },
  { id:'sb_p1_music', type:'P1', period:'2026-05-08', isNew:false, frequency:'high', category:'日常', titleEn:'Music', titleZh:'音乐',
    questions:['Do you like listening to music?','What kind of music do you like?','Do you play any musical instruments?','Has your music taste changed?'],
    cue:'', content:'', keywords:'', linkedTo:'可套框架①', proficiency:'没练' },
  { id:'sb_p1_singing', type:'P1', period:'2026-05-08', isNew:true, frequency:'high', category:'日常', titleEn:'Singing', titleZh:'唱歌',
    questions:['Do you like singing?','Do you sing often?','Have you ever taken singing lessons?','Do you think singing is good for you?'],
    cue:'', content:'', keywords:'', linkedTo:'可套框架①', proficiency:'没练' },
  { id:'sb_p1_space', type:'P1', period:'2026-05-08', isNew:true, frequency:'high', category:'抽象', titleEn:'Outer space and stars', titleZh:'太空与星空',
    questions:['Are you interested in outer space?','Have you learned about stars?','Do you want to travel to space?','Is it important to study space?'],
    cue:'', content:'', keywords:'', linkedTo:'可套框架⑥', proficiency:'没练' },
  { id:'sb_p1_sports', type:'P1', period:'2026-05-08', isNew:true, frequency:'high', category:'日常', titleEn:'Sports programs', titleZh:'运动频道',
    questions:['Do you watch sports programs?','What sports do you like to watch?','Do you prefer watching or playing sports?','Have you watched a live sports event?'],
    cue:'', content:'', keywords:'', linkedTo:'可套框架①', proficiency:'没练' },
  { id:'sb_p1_science', type:'P1', period:'2026-05-08', isNew:true, frequency:'high', category:'抽象', titleEn:'Science', titleZh:'科学',
    questions:['Do you like science?','Did you enjoy science at school?','Is science important?','Would you like to learn more science?'],
    cue:'', content:'', keywords:'', linkedTo:'可套框架⑥', proficiency:'没练' },
  { id:'sb_p1_work', type:'P1', period:'2026-05-08', isNew:false, frequency:'must', category:'日常', titleEn:'Work or studies', titleZh:'工作/学习',
    questions:['What do you do?','Do you like your studies?','Is there anything you want to change about your studies?','What do you plan to do after graduation?'],
    cue:'', content:'', keywords:'', linkedTo:'必考题', proficiency:'没练' },
  { id:'sb_p1_area', type:'P1', period:'2026-05-08', isNew:false, frequency:'must', category:'地点', titleEn:'The area you live in', titleZh:'居住的地方',
    questions:['Do you like the area you live in?','What is your area like?','Has your area changed recently?','Would you recommend your area to others?'],
    cue:'', content:'', keywords:'', linkedTo:'可套框架②', proficiency:'没练' },
  { id:'sb_p1_home', type:'P1', period:'2026-05-08', isNew:false, frequency:'must', category:'地点', titleEn:'Home & Accommodation', titleZh:'家',
    questions:['Do you live in a house or an apartment?','Do you like where you live?','What is your favorite room?','Would you like to move?'],
    cue:'', content:'', keywords:'', linkedTo:'可套框架②', proficiency:'没练' },
  { id:'sb_p1_hometown', type:'P1', period:'2026-05-08', isNew:false, frequency:'must', category:'地点', titleEn:'Hometown', titleZh:'家乡',
    questions:['Where is your hometown?','Do you like your hometown?','Is your hometown a good place to live?','Has your hometown changed?'],
    cue:'', content:'', keywords:'', linkedTo:'可套框架②', proficiency:'没练' },

  /* ---- P2 超高频/高频 ---- */
  { id:'sb_p2_change', type:'P2', period:'2026-05-08', isNew:true, frequency:'ultra', category:'事件', titleEn:'A recent change', titleZh:'近期改变',
    promptEn:'Describe a recent change you made in your life.', promptZh:'描述你生活中近期做出的一个改变。',
    youShouldSay:['What the change was','Why you made the change','How you felt about it'],
    cue:'', content:'', keywords:'', linkedTo:'', proficiency:'没练' },
  { id:'sb_p2_changemind', type:'P2', period:'2026-05-08', isNew:true, frequency:'ultra', category:'事件', titleEn:'A time you changed your mind', titleZh:'改变重要想法',
    promptEn:'Describe a time when you changed your mind about something.', promptZh:'描述一次你改变想法的经历。',
    youShouldSay:['What you changed your mind about','Why you changed your mind','How you felt afterwards'],
    cue:'', content:'', keywords:'', linkedTo:'', proficiency:'没练' },
  { id:'sb_p2_lawenv', type:'P2', period:'2026-05-08', isNew:false, frequency:'ultra', category:'抽象', titleEn:'A law to protect the environment', titleZh:'保护环境的法律',
    promptEn:'Describe a law that helps protect the environment.', promptZh:'描述一项有助于保护环境的法律。',
    youShouldSay:['What the law is','How it helps the environment','Whether it is effective'],
    cue:'', content:'', keywords:'', linkedTo:'可套舅舅母本', proficiency:'没练' },
  { id:'sb_p2_ambition', type:'P2', period:'2026-05-08', isNew:true, frequency:'ultra', category:'抽象', titleEn:'A long-term ambition', titleZh:'长久目标/抱负',
    promptEn:'Describe a long-term ambition you have.', promptZh:'描述你的一个长期目标。',
    youShouldSay:['What the ambition is','When you started having it','What you plan to do to achieve it'],
    cue:'', content:'', keywords:'', linkedTo:'', proficiency:'没练' },
  { id:'sb_p2_waitmsg', type:'P2', period:'2026-05-08', isNew:true, frequency:'ultra', category:'事件', titleEn:'A message you waited long for', titleZh:'很久没收到回复的信息',
    promptEn:'Describe a message you waited a long time to receive.', promptZh:'描述一条你等了很久才收到的信息。',
    youShouldSay:['What the message was','Why you waited so long','How you felt when you received it'],
    cue:'', content:'', keywords:'', linkedTo:'', proficiency:'没练' },
  { id:'sb_p2_animals', type:'P2', period:'2026-05-08', isNew:true, frequency:'high', category:'物品', titleEn:'A story or book with animals', titleZh:'包含动物的故事或书',
    promptEn:'Describe a story or book that includes animals.', promptZh:'描述一个包含动物的故事或书。',
    youShouldSay:['What the story/book is','What animals are in it','Why you like it'],
    cue:'', content:'', keywords:'', linkedTo:'', proficiency:'没练' },
  { id:'sb_p2_adceleb', type:'P2', period:'2026-05-08', isNew:true, frequency:'high', category:'物品', titleEn:'An ad with a celebrity', titleZh:'名人出演的广告',
    promptEn:'Describe an advertisement that features a celebrity.', promptZh:'描述一个有名人出演的广告。',
    youShouldSay:['What the ad is about','Who the celebrity is','What you think of the ad'],
    cue:'', content:'', keywords:'', linkedTo:'', proficiency:'没练' },
  { id:'sb_p2_travel', type:'P2', period:'2026-05-08', isNew:true, frequency:'high', category:'地点', titleEn:'A place you recommend to travel', titleZh:'推荐旅行过的地方',
    promptEn:'Describe a place you would recommend people to travel to.', promptZh:'描述一个你推荐别人去旅行的地方。',
    youShouldSay:['Where it is','What people can do there','Why you recommend it'],
    cue:'', content:'', keywords:'', linkedTo:'', proficiency:'没练' },
  { id:'sb_p2_techprob', type:'P2', period:'2026-05-08', isNew:false, frequency:'high', category:'事件', titleEn:'A tech problem you encountered', titleZh:'遇到的科技问题',
    promptEn:'Describe a time you had a problem with a piece of technology.', promptZh:'描述一次你遇到科技问题的经历。',
    youShouldSay:['What the problem was','How you solved it','How you felt about it'],
    cue:'', content:'', keywords:'', linkedTo:'可套Leo母本(机智解决)', proficiency:'没练' },
  { id:'sb_p2_langperson', type:'P2', period:'2026-05-08', isNew:true, frequency:'high', category:'人物', titleEn:'A person good at languages', titleZh:'擅长学习和说语言的人',
    promptEn:'Describe a person you know who is good at learning and speaking languages.', promptZh:'描述一个你认识的擅长学习和说语言的人。',
    youShouldSay:['Who this person is','How they learned languages','Why you think they are good at it'],
    cue:'', content:'', keywords:'', linkedTo:'可套Leo母本(擅长语言)', proficiency:'没练' },
  { id:'sb_p2_specialfood', type:'P2', period:'2026-05-08', isNew:false, frequency:'high', category:'物品', titleEn:'Food for special occasions', titleZh:'特别场合的食物',
    promptEn:'Describe a food you eat on special occasions.', promptZh:'描述一种你在特别场合吃的食物。',
    youShouldSay:['What the food is','When you eat it','Why it is special'],
    cue:'', content:'', keywords:'', linkedTo:'', proficiency:'没练' },
  { id:'sb_p2_medperson', type:'P2', period:'2026-05-08', isNew:false, frequency:'high', category:'人物', titleEn:'A person who wants to work in medicine', titleZh:'想从事医疗行业的人',
    promptEn:'Describe a person you know who wants to work in medicine.', promptZh:'描述一个你认识想从事医疗行业的人。',
    youShouldSay:['Who this person is','Why they want to work in medicine','What they are doing to achieve it'],
    cue:'', content:'', keywords:'', linkedTo:'可套Leo母本(想从医)', proficiency:'没练' },
  { id:'sb_p2_bizperson', type:'P2', period:'2026-05-08', isNew:true, frequency:'high', category:'人物', titleEn:'A person with a successful business', titleZh:'拥有成功商业的人',
    promptEn:'Describe a person you know who has a successful business.', promptZh:'描述一个你认识的拥有成功商业的人。',
    youShouldSay:['Who this person is','What business they run','Why they are successful'],
    cue:'', content:'', keywords:'', linkedTo:'可套舅舅母本(成功商业)', proficiency:'没练' },
  { id:'sb_p2_plantsperson', type:'P2', period:'2026-05-08', isNew:false, frequency:'high', category:'人物', titleEn:'A person who enjoys growing plants', titleZh:'喜欢种植物的人',
    promptEn:'Describe a person you know who enjoys growing plants at home or in their garden.', promptZh:'描述一个你喜欢在家/花园种植物的人。',
    youShouldSay:['Who this person is','What plants they grow','Why they enjoy it'],
    cue:'', content:'', keywords:'', linkedTo:'可套舅舅母本(种植物)', proficiency:'没练' },
  { id:'sb_p2_tallbuilding', type:'P2', period:'2026-05-08', isNew:true, frequency:'high', category:'地点', titleEn:'A tall building you like or dislike', titleZh:'喜欢或不喜欢的高建筑',
    promptEn:'Describe a tall building you like or dislike.', promptZh:'描述一栋你喜欢或不喜欢的高建筑。',
    youShouldSay:['Where it is','What it looks like','Why you like or dislike it'],
    cue:'', content:'', keywords:'', linkedTo:'', proficiency:'没练' },
  { id:'sb_p2_video', type:'P2', period:'2026-05-08', isNew:false, frequency:'high', category:'物品', titleEn:'An interesting video', titleZh:'有趣视频',
    promptEn:'Describe an interesting video you saw recently.', promptZh:'描述一个你最近看到的有趣视频。',
    youShouldSay:['What the video was about','Where you saw it','Why it was interesting'],
    cue:'', content:'', keywords:'', linkedTo:'', proficiency:'没练' },
  { id:'sb_p2_boringplace', type:'P2', period:'2026-05-08', isNew:false, frequency:'high', category:'地点', titleEn:'A boring place you visited', titleZh:'去过无聊的地方',
    promptEn:'Describe a place you visited that was boring.', promptZh:'描述一个你去过的无聊的地方。',
    youShouldSay:['Where it was','Why it was boring','What you did there'],
    cue:'', content:'', keywords:'', linkedTo:'', proficiency:'没练' },

  /* ---- P2 中高频 ---- */
  { id:'sb_p2_teamwork', type:'P2', period:'2026-05-08', isNew:true, frequency:'medium', category:'事件', titleEn:'Working in a team', titleZh:'在团队中工作',
    promptEn:'Describe a time you worked in a team.', promptZh:'描述一次你在团队中工作的经历。',
    youShouldSay:['What the team did','What your role was','How you felt about it'],
    cue:'', content:'', keywords:'', linkedTo:'', proficiency:'没练' },
  { id:'sb_p2_newlaw', type:'P2', period:'2026-05-08', isNew:true, frequency:'medium', category:'抽象', titleEn:'A new law you would introduce', titleZh:'想颁布的新法律',
    promptEn:'Describe a new law you would like to see introduced.', promptZh:'描述一项你想看到颁布的新法律。',
    youShouldSay:['What the law would be','Why it is needed','How it would help'],
    cue:'', content:'', keywords:'', linkedTo:'', proficiency:'没练' },
  { id:'sb_p2_liveevent', type:'P2', period:'2026-05-08', isNew:true, frequency:'medium', category:'事件', titleEn:'A live sports event', titleZh:'喜欢的现场体育赛事',
    promptEn:'Describe a live sports event you enjoyed watching.', promptZh:'描述一个你喜欢的现场体育赛事。',
    youShouldSay:['What event it was','Where you watched it','Why you enjoyed it'],
    cue:'', content:'', keywords:'', linkedTo:'', proficiency:'没练' },
  { id:'sb_p2_visitnotlive', type:'P2', period:'2026-05-08', isNew:true, frequency:'medium', category:'地点', titleEn:'A home you like to visit but not live', titleZh:'喜欢拜访但不想住的家',
    promptEn:'Describe a home you like to visit but would not want to live in.', promptZh:'描述一个你喜欢拜访但不想住的家。',
    youShouldSay:['Whose home it is','What it is like','Why you would not want to live there'],
    cue:'', content:'', keywords:'', linkedTo:'', proficiency:'没练' },
  { id:'sb_p2_childhoodfriend', type:'P2', period:'2026-05-08', isNew:true, frequency:'medium', category:'人物', titleEn:'A childhood friend', titleZh:'发小',
    promptEn:'Describe a friend you have known since childhood.', promptZh:'描述一个你从小认识的朋友。',
    youShouldSay:['Who this person is','How you became friends','What you do together'],
    cue:'', content:'', keywords:'', linkedTo:'可套妹妹母本(发小)', proficiency:'没练' },
  { id:'sb_p2_citylike', type:'P2', period:'2026-05-08', isNew:false, frequency:'medium', category:'地点', titleEn:'A city you visited and liked', titleZh:'去过且喜欢的城市',
    promptEn:'Describe a city you visited and liked.', promptZh:'描述一个你去过且喜欢的城市。',
    youShouldSay:['Where it is','What you did there','Why you liked it'],
    cue:'', content:'', keywords:'', linkedTo:'', proficiency:'没练' },
  { id:'sb_p2_plansperson', type:'P2', period:'2026-05-08', isNew:true, frequency:'medium', category:'人物', titleEn:'A person good at making plans', titleZh:'擅长做计划的人',
    promptEn:'Describe a person you know who is good at making plans.', promptZh:'描述一个你认识的擅长做计划的人。',
    youShouldSay:['Who this person is','How they make plans','Why you think they are good at it'],
    cue:'', content:'', keywords:'', linkedTo:'可套Leo母本(常做计划)', proficiency:'没练' },
  { id:'sb_p2_earlymorning', type:'P2', period:'2026-05-08', isNew:true, frequency:'medium', category:'事件', titleEn:'An early morning experience', titleZh:'早起经历',
    promptEn:'Describe a time you got up early.', promptZh:'描述一次你早起的经历。',
    youShouldSay:['When it was','Why you got up early','How you felt'],
    cue:'', content:'', keywords:'', linkedTo:'', proficiency:'没练' },
  { id:'sb_p2_decision', type:'P2', period:'2026-05-08', isNew:true, frequency:'medium', category:'事件', titleEn:'An important decision', titleZh:'重要决定',
    promptEn:'Describe an important decision you made.', promptZh:'描述你做出的一个重要决定。',
    youShouldSay:['What the decision was','Why it was important','What happened afterwards'],
    cue:'', content:'', keywords:'', linkedTo:'', proficiency:'没练' },
  { id:'sb_p2_techproduct', type:'P2', period:'2026-05-08', isNew:false, frequency:'medium', category:'物品', titleEn:'A tech product you want to have', titleZh:'想拥有的科技产品',
    promptEn:'Describe a technology product you would like to have.', promptZh:'描述一个你想拥有的科技产品。',
    youShouldSay:['What it is','What it can do','Why you want it'],
    cue:'', content:'', keywords:'', linkedTo:'', proficiency:'没练' },
];

const MED_DURATION_MS = 12 * 3600 * 1000;

let DATA = {
  sessions: [],
  notes: [],
  meds: [],
  words: [],
  plans: [],
  corpus: [],
  scores: [
    { id:'seed_first', date:'2026-08-02', listening:4, reading:5, writing:5, speaking:4.5, note:'首考' }
  ],
  settings: {
    name: 'Camille',
    examDate: '2026-08-02',
    theme: 'light',
    dailyGoalHours: 8,
    targets: { overall: 6.0, listening: 5.5, reading: 6.5, writing: 5.5, speaking: 5.5 },
    relayUrl: '',
    relayToken: '',
    syncCode: '',
    autoSync: false,
    notifyEnabled: false,
    links: DEFAULT_LINKS
  },
  errorbook: [],
  energy: [],
  checkins: [],
  mockRecords: [],
  speaking: SPEAKING_BANK.concat([
    { id:'sp_p1_1', type:'P1', framework:'P1框架', title:'框架① 兴趣/活动喜好类', content:'', keywords:'Singing、Hobby、Reading、Music、Sports team、Walking、Food、Telling Jokes、Outer space and stars、Pets and Animals', cue:'1.直接表态(Yes, I am really into it) 2.给一个原因(1句) 3.习惯细节(频率/和谁/什么时候) 4.(可选)小时候 vs 现在', linkedTo:'', proficiency:'没练' },
    { id:'sp_p1_2', type:'P1', framework:'P1框架', title:'框架② 居住/地点描述类', content:'', keywords:'Hometown、Home/Accommodation、The city you live in、The area you live in、Parks、View、Scenery、Building', cue:'1.方位/类型 2.喜欢点(2个特征) 3.在那做什么 4.(可选)对比/变化', linkedTo:'', proficiency:'没练' },
    { id:'sp_p1_3', type:'P1', framework:'P1框架', title:'框架③ 日常作息/习惯类', content:'', keywords:'Daily routine、Morning time、Work/studies、Tidiness、Feeling bored、Shopping', cue:'1.日常动作(1-2个) 2.偏好/原因 3.变化/对比', linkedTo:'', proficiency:'没练' },
    { id:'sp_p1_4', type:'P1', framework:'P1框架', title:'框架④ 物品/科技使用类', content:'', keywords:'Watch、Headphone、Websites、Social media、Typing、Cars、Clothing、Mirrors、Gifts', cue:'1.拥有/使用 2.场景/频率 3.用处 4.(可选)变化', linkedTo:'', proficiency:'没练' },
    { id:'sp_p1_5', type:'P1', framework:'P1框架', title:'框架⑤ 人物/影响类', content:'', keywords:'Teachers（Pets 可套①或⑤）', cue:'1.点名+关系 2.特质 3.影响', linkedTo:'', proficiency:'没练' },
    { id:'sp_p1_6', type:'P1', framework:'P1框架', title:'框架⑥ 抽象观点/变化类', content:'', keywords:'Art、Science、Life stages、Childhood activities、Tidiness(观点面)', cue:'1.表态(重要/不重要) 2.理由 3.变化', linkedTo:'', proficiency:'没练' },
    { id:'sp_p2_1', type:'P2', framework:'P2人物母本', title:'男友 Leo（主·覆盖10题）', content:'', keywords:'boyfriend Leo / 同班坐旁 / 洛克王国 / reserved→talkative / cheerful / difficult assignment patiently / considerate reliable / count on', cue:'复述线：Leo → 同班坐旁 → 洛克王国熟 → 内敛变话多 → 开朗逗笑 → 帮难作业耐心 → 体贴可靠 → 同食 → 可依靠', linkedTo:'串题：①困难成功 / ②擅长语言 / ⑤想从医 / ⑨乐于助人 / ⑩朋友自学 / ⑪机智解决 / ⑬常做计划 / ⑭想见名人 / ⑮学好习惯 / 鼓励不愿做的事', proficiency:'没练' },
    { id:'sp_p2_2', type:'P2', framework:'P2人物母本', title:'舅舅（覆盖6题）', content:'', keywords:'uncle / grows vegetables / yard+rents field / successful CS business / hard but smart fix / hardworking interesting', cue:'复述线：舅舅 → 种菜院子+租田 → 但 CS 创业成功 → 创业难但机智解决 → 勤奋有趣', linkedTo:'串题：③成功商业 / ⑦种植物 / ⑧爱护自然 / ①困难成功 / ⑪机智解决 / 给别人建议', proficiency:'没练' },
    { id:'sp_p2_3', type:'P2', framework:'P2人物母本', title:'妹妹（覆盖6题）', content:'', keywords:'cousin + childhood friend / uncle\'s daughter / grew up together / lively naughty / takes me out / loves drawing / rely on', cue:'复述线：表妹=发小 → 一起长大 → 调皮我安静互补 → 带我玩逗笑 → 爱画画 → 像 Leo 有趣 → 依赖', linkedTo:'串题：⑥发小 / ⑫喜欢画画 / ⑨乐于助人 / ⑩朋友自学 / ⑮好习惯 / 为家人骄傲', proficiency:'没练' }
  ]),
  writingScores: [],
  writing: [
    { id:'wt_a', category:'小作文A', title:'数据图·时间轴（线/柱带年份）', skeleton:'The 【chart / graph / table】 illustrates 【图内容+时间范围】. The data is measured in 【percent / millions / thousands】, providing a clear overview of the changes that took place over the given period.\n\nOverall, it is clear that 【总体趋势 1】. Additionally, 【总体趋势 2·名词短语】 stood out throughout the period as the most striking feature. It is also noticeable that the figures changed clearly over the period, rather than remaining steady.\n\nLooking at the details, 【数据 1】 started at 【数值】 in 【年份】 and then 【趋势变化 + 趋势词】. This represents a considerable increase compared to its starting point, and the upward momentum remained consistent across most of the timeframe.\n\nIn contrast, 【数据 2】 showed a different pattern. It 【趋势变化】, from 【数值】 in 【年份】 to 【数值】 in 【年份】. Meanwhile, 【其他数据点】 remained relatively stable, showing little variation. Taken together, the data reveals a clear divergence between the two groups.', tips:'结构：开头改写｜概述(2个总体)｜细节1(写一组)｜细节2(对比另一组)。必背趋势词：rose steadily / declined gradually / remained stable at / reached a peak of / accounted for / compared to。填空直接抄题干改写与数值，不自己造。' },
    { id:'wt_b', category:'小作文B', title:'非时间轴图（饼/表/静态柱）', skeleton:'The 【pie chart / table / charts】 illustrates 【图内容+时间(若有)】. The data is measured in 【percent / number of people】, giving a clear picture of the distribution of 【总类】.\n\nOverall, it is clear that 【最大类·名词短语】 accounted for the largest share, at 【数值】%. Additionally, the contrast between the top and bottom categories stood out as the most striking feature. It is also noticeable that the remaining categories were considerably smaller, showing a clear gap rather than an even spread.\n\nLooking at the details, 【最大类】 represented 【数值】%, which was the most significant. 【类 2】 followed at 【数值】%, while 【类 3】 made up 【数值】%.\n\nMeanwhile, 【类 4】 remained relatively minor, at 【数值】%. 【类 5】 showed a different pattern, reaching 【数值】%. Taken together, the data reveals a clear gap between the top and bottom categories.', tips:'用于饼图/表格/无时间轴柱图/混合图。必背占比词：accounted for the largest share / made up the smallest proportion / followed at / compared to。与§六时间轴模板不混用。' },
    { id:'wt_c', category:'小作文C', title:'地图题（改造前后对比）', skeleton:'The two maps illustrate the changes made to 【地方】 before and after 【事件 / redesign】. Overall, the area has been significantly reorganized, with new facilities added and some original areas removed or repurposed.\n\nPreviously, 【原布局·填短语】 was located in the 【方位·填短语】. This has been divided into 【新分区·填短语】, and the 【消失的部分·填短语】 has been removed completely.\n\nSeveral new features have been added. 【新增 1·填短语】 has been introduced along the 【方位】, and 【新增 2·填短语】 has been built at the 【方位】. Meanwhile, 【不变的部分·填短语】 remains in the same position.', tips:'被动语态 + 方位词两套逻辑。必背被动8个(was located / has been replaced by / removed / added / divided into / relocated / remains / extended) + 方位10个(north/south/east/west/corner/centre/left/right/next to/between)。' },
    { id:'wt_d', category:'小作文D', title:'流程图（自然过程/工序/循环）', skeleton:'The diagram illustrates how 【过程是什么·填短语】 is formed through 【关键条件·填短语】. Overall, the process consists of several key stages, starting from 【起点】 and ending with 【终点 / 结果】.\n\nFirst, 【原材料/起始物·填短语】 approaches 【地点】. Then, as it hits 【阻碍物·填短语】, it is pushed upwards and rises. When the air rises, it cools and 【结果 1·填短语】 forms above.\n\nOnce 【条件·填短语】, 【动作·填短语】 falls on 【位置·填短语】. After this, 【后续物·填短语】 continues over 【地点】 and moves down. Finally, these 【终点物·填短语】 reach 【终点】, where 【最终结果·填短语】, creating 【产物·填短语】.', tips:'顺序连接词(First/Then/Once/Finally) + 被动主动混合。必背动词8个(approaches/reaches/is pushed upwards/rises and cools/forms/falls/continues/results in)。' },
    { id:'wt_ba', category:'大作文A', title:'观点型（第一优先背）', skeleton:'The debate surrounding 【话题】 has engaged a broad audience recently. From my perspective, I totally agree that 【观点】. This is an important issue, because its effects reach far beyond the situation we see now.\n\nFirst of all, 【核心主题】 undoubtedly brings substantial benefits. One key strength is its ability to improve 【普适领域】, thereby building a firm basis for 【进阶目标】. As a result, this practice not only generates short-term benefits but also contributes to long-term outcomes. Another significant advantage is that it addresses problems from the ground up by removing 【潜在原因】. For example, this has helped many people and improved life satisfaction. This then creates a ripple effect that helps a wide range of people in their daily lives.\n\nHowever, opponents may argue that 【反方观点】. Nevertheless, this advantage is short-lived, as the initial effect quickly fades once 【简单条件】. More importantly, these short-term gains often hide deeper problems that quick fixes cannot solve. In the end, the problems caused by ignoring the real issue are much bigger than any short-term comfort it gives.\n\nIn summary, for all the reasons above, I totally agree with 【话题】. On the one hand, it brings benefits; on the other hand, its downsides are limited. Therefore, the overall impact should be viewed as largely positive.', tips:'选一边站(agree固定)。【话题】题干词换进去；动词开头加 -ing。结尾【话题】= 开头 -ing 短语原样再抄。填空直接抄：普适领域/进阶目标用万能短语(people\'s well-being / quality of life / living standards)。' },
    { id:'wt_bb', category:'大作文B', title:'讨论型（第二优先背）', skeleton:'The debate surrounding 【话题】 has engaged a broad audience recently. Some people think 【观点 A】, while others believe 【观点 B】. After thinking about both sides, I agree more with the latter one.\n\nOn the one hand, the first view has some truth. People who support it believe it brings real benefits to 【普适领域】. One key strength is its ability to improve 【普适领域】, thereby building a firm basis for 【进阶目标】. As a result, this practice not only generates short-term benefits but also contributes to long-term outcomes. For example, this has helped many people and improved life satisfaction. This then creates a ripple effect that helps a wide range of people in their daily lives.\n\nOn the other hand, I support the second view. In my opinion, 【观点 B 核心理由】 matters more in the long run. This is because if we do not fix this basic problem first, the good results will not last. More importantly, these short-term gains often hide deeper problems that quick fixes cannot solve. In the end, the problems caused by ignoring the real issue are much bigger than any short-term comfort it gives.\n\nIn conclusion, I believe 【立场】 is the better choice. On the one hand, it brings benefits; on the other hand, its downsides are limited. Therefore, the overall impact should be viewed as largely positive.', tips:'支持第二方(latter固定)。正文1客观讲对方道理(题目要求 discuss both views 必须写)，正文2驳论式。观点 A/B/立场填名词短语或 -ing 短语。' }
  ]
};

let _hubLoaded = false;
function hubLoad(){
  if(_hubLoaded) return;   // 幂等：每次真实页面加载只解析一次 localStorage（data.js 求值 + common.js ready 两处调用只生效一次）
  _hubLoaded = true;
  try{
    const raw = localStorage.getItem(HUB_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      DATA = Object.assign({}, DATA, parsed);
      DATA.settings = Object.assign({}, DATA.settings, (parsed && parsed.settings) || {});
    }
    // 兼容旧备份：确保数组字段存在，避免 addMock / render 报错
    DATA.mockRecords = DATA.mockRecords || [];
    DATA.checkins = DATA.checkins || [];
    DATA.scores = DATA.scores || [];
    DATA.errorbook = DATA.errorbook || [];
    DATA.energy = DATA.energy || [];
    DATA.speaking = DATA.speaking || [];
    DATA.writing = DATA.writing || [];
    DATA.writingScores = DATA.writingScores || [];
    // 题库迁移：旧用户 localStorage 里没有 SPEAKING_BANK 的题目，按 id 补入
    if(SPEAKING_BANK && SPEAKING_BANK.length){
      const existingIds = new Set(DATA.speaking.map(s => s.id));
      const missing = SPEAKING_BANK.filter(s => !existingIds.has(s.id));
      if(missing.length) DATA.speaking = missing.concat(DATA.speaking);
    }
  }catch(e){ console.warn('读取本地数据失败', e); }
}

function hubSave(){
  try{ localStorage.setItem(HUB_KEY, JSON.stringify(DATA)); }
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

function escapeHtml(s){ return s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

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
