/* 数据层：localStorage 读写与默认数据 */
const HUB_KEY = 'ielts_study_hub_v1';

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

/* ===== 5-8 月口语题库（高频顺序录入，完整题库待补） ===== */
const FREQ_LABEL = { ultra:'超高频', high:'高频', medium:'中频', low:'低频' };
const SPEAKING_BANK = [
  { id:"sb_p1_music", type:"P1", period:"2026-05-08", isNew:true, frequency:"high", category:"日常",
    titleEn:"Music", titleZh:"音乐",
    questions:["Do you like listening to music?","What kind of music do you like?","Do you play any musical instruments?","Has your music taste changed?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架①", proficiency:"没练" },
  { id:"sb_p1_teachers", type:"P1", period:"2026-05-08", isNew:true, frequency:"ultra", category:"人物",
    titleEn:"Teachers", titleZh:"老师",
    questions:["Do you have a favorite teacher?","Do you want to be a teacher in the future?","Do you think teachers are important?","What qualities should a good teacher have?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架⑤", proficiency:"没练" },
  { id:"sb_p1_socialmedia", type:"P1", period:"2026-05-08", isNew:true, frequency:"high", category:"日常",
    titleEn:"Social media", titleZh:"社交媒体",
    questions:["Do you use social media?","How much time do you spend on social media?","Do you think social media is good or bad?","What social media platforms do you use?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架④", proficiency:"没练" },
  { id:"sb_p1_tidiness", type:"P1", period:"2026-05-08", isNew:true, frequency:"high", category:"日常",
    titleEn:"Tidiness", titleZh:"整洁",
    questions:["Are you a tidy person?","Do you keep your room tidy?","Is it important to be tidy?","Do you think people should be tidy?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架③", proficiency:"没练" },
  { id:"sb_p1_websites", type:"P1", period:"2026-05-08", isNew:true, frequency:"ultra", category:"物品",
    titleEn:"Websites", titleZh:"网页",
    questions:["What kind of websites do you often visit?","Do you think websites are reliable?","What is your favorite website?","Do you prefer using apps or websites?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架④", proficiency:"没练" },
  { id:"sb_p1_watch", type:"P1", period:"2026-05-08", isNew:true, frequency:"ultra", category:"物品",
    titleEn:"Watch", titleZh:"手表",
    questions:["Do you usually wear a watch?","Do you think watches are important?","Have you ever received a watch as a gift?","Why do some people like wearing watches?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架④", proficiency:"没练" },
  { id:"sb_p1_shopping", type:"P1", period:"2026-05-08", isNew:true, frequency:"high", category:"日常",
    titleEn:"Shopping", titleZh:"购物",
    questions:["Do you like shopping?","How often do you go shopping?","Do you prefer online or in-store shopping?","What do you usually buy?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架③", proficiency:"没练" },
  { id:"sb_p1_cars", type:"P1", period:"2026-05-08", isNew:true, frequency:"ultra", category:"物品",
    titleEn:"Cars", titleZh:"汽车",
    questions:["Do you like cars?","Do you have a car?","Do you prefer to be a driver or a passenger?","Is it important to know how to drive?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架④", proficiency:"没练" },
  { id:"sb_p1_parks", type:"P1", period:"2026-08-09", isNew:true, frequency:"high", category:"日常",
    titleEn:"Parks", titleZh:"",
    questions:["Did you like going to parks as a child?","Do you still like going to parks now?","Would you like to see more parks in your city?","Are there any parks you want to go to in the future?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p1_science", type:"P1", period:"2026-05-08", isNew:true, frequency:"high", category:"抽象",
    titleEn:"Science", titleZh:"科学",
    questions:["Do you like science?","Did you enjoy science at school?","Is science important?","Would you like to learn more science?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架⑥", proficiency:"没练" },
  { id:"sb_p1_mirrors", type:"P1", period:"2026-05-08", isNew:true, frequency:"high", category:"物品",
    titleEn:"Mirrors", titleZh:"镜子",
    questions:["Do you often look in the mirror?","Do you have mirrors in your home?","Have you ever bought a mirror?","Do you think mirrors are necessary?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架④", proficiency:"没练" },
  { id:"sb_p1_space", type:"P1", period:"2026-05-08", isNew:true, frequency:"high", category:"抽象",
    titleEn:"Outer space and stars", titleZh:"太空与星空",
    questions:["Are you interested in outer space?","Have you learned about stars?","Do you want to travel to space?","Is it important to study space?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架⑥", proficiency:"没练" },
  { id:"sb_p1_singing", type:"P1", period:"2026-05-08", isNew:true, frequency:"high", category:"日常",
    titleEn:"Singing", titleZh:"唱歌",
    questions:["Do you like singing?","Do you sing often?","Have you ever taken singing lessons?","Do you think singing is good for you?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架①", proficiency:"没练" },
  { id:"sb_p1_clothing", type:"P1", period:"2026-05-08", isNew:true, frequency:"high", category:"物品",
    titleEn:"Clothing", titleZh:"衣服",
    questions:["What kind of clothes do you usually wear?","Do you prefer formal or casual clothes?","Have your clothing preferences changed?","Do you think clothes are important?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架④", proficiency:"没练" },
  { id:"sb_p1_jokes_comedies", type:"P1", period:"2026-08-09", isNew:true, frequency:"high", category:"日常",
    titleEn:"Jokes & Comedies", titleZh:"",
    questions:["Are you good at telling jokes?","Do your friends like to tell jokes?","Do you like to watch comedies?","Have you ever watched a live show?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p1_headphones", type:"P1", period:"2026-05-08", isNew:true, frequency:"high", category:"物品",
    titleEn:"Headphones", titleZh:"耳机",
    questions:["Do you use headphones?","When do you use headphones?","What kind of headphones do you prefer?","Would you buy expensive headphones?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架④", proficiency:"没练" },
  { id:"sb_p2_tallbuilding", type:"P2", period:"2026-05-08", isNew:true, frequency:"high", category:"地点",
    titleEn:"A tall building you like or dislike", titleZh:"喜欢或不喜欢的高建筑",
    promptEn:"Describe a tall building you like or dislike.", promptZh:"描述一栋你喜欢或不喜欢的高建筑。",
    youShouldSay:["Where it is","What it looks like","Why you like or dislike it","And explain why this matters to you"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_video", type:"P2", period:"2026-05-08", isNew:true, frequency:"high", category:"物品",
    titleEn:"An interesting video", titleZh:"有趣视频",
    promptEn:"Describe an interesting video you saw recently.", promptZh:"描述一个你最近看到的有趣视频。",
    youShouldSay:["What the video was about","Where you saw it","Why it was interesting","And explain why this matters to you"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_a_boring_place18", type:"P2", period:"2026-08-09", isNew:true, frequency:"high", category:"地点",
    titleEn:"a boring place", titleZh:"去过的无聊地方",
    promptEn:"Describe a boring place", promptZh:"",
    youShouldSay:["Where it is","Who you went there with","What you did there","And explain why you think it is a boring place"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_your_favorite_city_that_you_hav19", type:"P2", period:"2026-08-09", isNew:true, frequency:"high", category:"地点",
    titleEn:"your favorite city that you have visited", titleZh:"去过的最喜欢的城市",
    promptEn:"Describe your favorite city that you have visited", promptZh:"",
    youShouldSay:["Where it is","When you visited it","What you did there","And explain why it is your favourite"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_earlymorning", type:"P2", period:"2026-05-08", isNew:true, frequency:"medium", category:"事件",
    titleEn:"An early morning experience", titleZh:"早起经历",
    promptEn:"Describe a time you got up early.", promptZh:"描述一次你早起的经历。",
    youShouldSay:["When it was","Why you got up early","How you felt","And explain why this matters to you"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_a_person_who_loves_to_grow_vege21", type:"P2", period:"2026-08-09", isNew:true, frequency:"high", category:"人物",
    titleEn:"a person who loves to grow vegetables at home or in the gard", titleZh:"喜欢在家/花园种菜的人",
    promptEn:"Describe a person who loves to grow vegetables at home or in the garden", promptZh:"",
    youShouldSay:["Who this person is","What vegetables he/she grows","How he/she grows the vegetables","And explain why he/she loves growing vegetables"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_newlaw", type:"P2", period:"2026-05-08", isNew:true, frequency:"medium", category:"抽象",
    titleEn:"A new law you would introduce", titleZh:"想颁布的新法律",
    promptEn:"Describe a new law you would like to see introduced.", promptZh:"描述一项你想看到颁布的新法律。",
    youShouldSay:["What the law would be","Why it is needed","How it would help","And explain why this matters to you"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_childhoodfriend", type:"P2", period:"2026-05-08", isNew:true, frequency:"high", category:"人物",
    titleEn:"A childhood friend", titleZh:"发小",
    promptEn:"Describe a friend you have known since childhood.", promptZh:"描述一个你从小认识的朋友。",
    youShouldSay:["Who this person is","How you became friends","What you do together","And explain why this matters to you"],
    cue:'', content:'', keywords:'', linkedTo:"可套妹妹母本(发小)", proficiency:"没练" },
  { id:"sb_p2_medperson", type:"P2", period:"2026-05-08", isNew:true, frequency:"high", category:"人物",
    titleEn:"A person who wants to work in medicine", titleZh:"想从事医疗行业的人",
    promptEn:"Describe a person you know who wants to work in medicine.", promptZh:"描述一个你认识想从事医疗行业的人。",
    youShouldSay:["Who this person is","Why they want to work in medicine","What they are doing to achieve it","And explain why this matters to you"],
    cue:'', content:'', keywords:'', linkedTo:"可套Leo母本(想从医)", proficiency:"没练" },
  { id:"sb_p2_bizperson", type:"P2", period:"2026-05-08", isNew:true, frequency:"high", category:"人物",
    titleEn:"A person with a successful business", titleZh:"拥有成功商业的人",
    promptEn:"Describe a person you know who has a successful business.", promptZh:"描述一个你认识的拥有成功商业的人。",
    youShouldSay:["Who this person is","What business they run","Why they are successful","And explain why this matters to you"],
    cue:'', content:'', keywords:'', linkedTo:"可套舅舅母本(成功商业)", proficiency:"没练" },
  { id:"sb_p2_describe_a_plan_that_you_had_to_change_r26", type:"P2", period:"2026-08-09", isNew:true, frequency:"high", category:"事件",
    titleEn:"a plan that you had to change recently", titleZh:"近期改变的计划",
    promptEn:"Describe a plan that you had to change recently", promptZh:"",
    youShouldSay:["When this happened","What made you change the plan","What the new plan was","And how you felt about the change"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_teamwork", type:"P2", period:"2026-05-08", isNew:true, frequency:"medium", category:"事件",
    titleEn:"Working in a team", titleZh:"在团队中工作",
    promptEn:"Describe a time you worked in a team.", promptZh:"描述一次你在团队中工作的经历。",
    youShouldSay:["What the team did","What your role was","How you felt about it","And explain why this matters to you"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_decision", type:"P2", period:"2026-05-08", isNew:true, frequency:"medium", category:"事件",
    titleEn:"An important decision", titleZh:"重要决定",
    promptEn:"Describe an important decision you made.", promptZh:"描述你做出的一个重要决定。",
    youShouldSay:["What the decision was","Why it was important","What happened afterwards","And explain why this matters to you"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_a_live_sports_event_you_watched29", type:"P2", period:"2026-08-09", isNew:true, frequency:"high", category:"事件",
    titleEn:"a live sports event you watched and liked", titleZh:"喜欢现场体育赛事",
    promptEn:"Describe a live sports event you watched and liked", promptZh:"",
    youShouldSay:["What it was","When and where you watched it","Who you watched it with","And explain why you liked it"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_specialfood", type:"P2", period:"2026-05-08", isNew:false, frequency:"high", category:"物品",
    titleEn:"Food for special occasions", titleZh:"特别场合的食物",
    promptEn:"Describe a food you eat on special occasions.", promptZh:"描述一种你在特别场合吃的食物。",
    youShouldSay:["What the food is","When you eat it","Why it is special","And explain why this matters to you"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_langperson", type:"P2", period:"2026-05-08", isNew:true, frequency:"high", category:"人物",
    titleEn:"A person good at languages", titleZh:"擅长学习和说语言的人",
    promptEn:"Describe a person you know who is good at learning and speaking languages.", promptZh:"描述一个你认识的擅长学习和说语言的人。",
    youShouldSay:["Who this person is","How they learned languages","Why you think they are good at it","And explain why this matters to you"],
    cue:'', content:'', keywords:'', linkedTo:"可套Leo母本(擅长语言)", proficiency:"没练" },
  { id:"sb_p1_food", type:"P1", period:"2026-08-09", isNew:true, frequency:"medium", category:"日常",
    titleEn:"Food", titleZh:"",
    questions:["What is your favourite food?","What kind of food did you like when you were young?","Do you eat different foods at different times of the year?","Has your favourite food changed since you were a child?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p1_pets_and_animals", type:"P1", period:"2026-08-09", isNew:true, frequency:"medium", category:"日常",
    titleEn:"Pets and Animals", titleZh:"",
    questions:["What's your favourite animal? Why?","Where do you prefer to keep your pet, indoors or outdoors?","Have you ever had a pet before?","What is the most popular animal in China?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p1_sports_team", type:"P1", period:"2026-08-09", isNew:true, frequency:"medium", category:"日常",
    titleEn:"Sports team", titleZh:"",
    questions:["Have you ever been part of a sports team?","Is team sports popular in your culture?","Do you like watching team games? Why?","What are the differences between team sports and individual sports?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p1_hobby", type:"P1", period:"2026-08-09", isNew:true, frequency:"medium", category:"日常",
    titleEn:"Hobby", titleZh:"",
    questions:["Do you have any hobbies?","Did you have any hobbies when you were a child?","Do you have a hobby that you’ve had since childhood?","Do you have the same hobbies as your family members?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p1_morning_time", type:"P1", period:"2026-08-09", isNew:true, frequency:"medium", category:"日常",
    titleEn:"Morning time", titleZh:"",
    questions:["Do you like getting up early in the morning?","What do you usually do in the morning?","What did you do in the morning when you were little? Why?","you did in the past?","weekdays? Why?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p1_gifts", type:"P1", period:"2026-08-09", isNew:true, frequency:"medium", category:"日常",
    titleEn:"Gifts", titleZh:"",
    questions:["Have you ever sent handmade gifts to others?","Have you ever received a great gift?","What do you consider when choosing a gift?","Do you think you are good at choosing gifts?","What gift have you received recently?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p1_reading", type:"P1", period:"2026-08-09", isNew:true, frequency:"medium", category:"日常",
    titleEn:"Reading", titleZh:"",
    questions:["Do you like reading?","Do you prefer to read on paper or on a screen?","When do you need to read carefully, and when not?","Do you prefer scanning or detailed reading?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p1_walking", type:"P1", period:"2026-08-09", isNew:true, frequency:"medium", category:"日常",
    titleEn:"Walking", titleZh:"",
    questions:["Do you walk a lot?","Did you often go outside to have a walk when you were a child?","Why do people like to walk in parks?","Where would you like to take a long walk if you had the chance?","Where did you go for a walk lately?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p1_typing", type:"P1", period:"2026-08-09", isNew:true, frequency:"medium", category:"日常",
    titleEn:"Typing", titleZh:"",
    questions:["Do you prefer typing or handwriting?","Do you type on a desktop or laptop keyboard every day?","When did you learn how to type on a keyboard?","How do you improve your typing?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p1_scenery", type:"P1", period:"2026-08-09", isNew:true, frequency:"high", category:"日常",
    titleEn:"Scenery", titleZh:"",
    questions:["Do you look out the window at the scenery when travelling by bus or car?","Do you prefer the mountains or the sea?","Do you like to take scenery pictures?","What are the most beautiful sights you have seen while traveling?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p1_building", type:"P1", period:"2026-08-09", isNew:true, frequency:"high", category:"日常",
    titleEn:"Building", titleZh:"",
    questions:["Are there tall buildings near your home?","Do you take photos of buildings?","Is there a building that you would like to visit?","Do you want to live in a tall building?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p1_childhood_activities", type:"P1", period:"2026-08-09", isNew:true, frequency:"medium", category:"日常",
    titleEn:"Childhood activities", titleZh:"",
    questions:["What are your favourite activities?","What were your favourite activities when you were a child?","child?","child and those you like now?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p1_views", type:"P1", period:"2026-08-09", isNew:true, frequency:"medium", category:"日常",
    titleEn:"Views", titleZh:"",
    questions:["Do you like taking pictures of different views?","Do you prefer views in urban areas or rural areas?","Do you prefer views in your own country or in other countries?","Have you seen an unforgettable and beautiful view or scenery?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p1_life_stages", type:"P1", period:"2026-08-09", isNew:true, frequency:"medium", category:"日常",
    titleEn:"Life stages", titleZh:"",
    questions:["What did you often do with your friends in your childhood?","What do you think is the most important at the moment?","Do you have any plans for the next five years?","How do people remember each stage of their lives?","Do you enjoy being the age you are now?","At what age do you think people are the happiest?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p1_work", type:"P1", period:"2026-05-08", isNew:false, frequency:"ultra", category:"日常",
    titleEn:"Work or studies", titleZh:"工作/学习",
    questions:["What do you do?","Do you like your studies?","Is there anything you want to change about your studies?","What do you plan to do after graduation?"],
    cue:'', content:'', keywords:'', linkedTo:"必考题", proficiency:"没练" },
  { id:"sb_p1_home", type:"P1", period:"2026-05-08", isNew:false, frequency:"ultra", category:"地点",
    titleEn:"Home & Accommodation", titleZh:"家",
    questions:["Do you live in a house or an apartment?","Do you like where you live?","What is your favorite room?","Would you like to move?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架②", proficiency:"没练" },
  { id:"sb_p1_hometown", type:"P1", period:"2026-05-08", isNew:false, frequency:"ultra", category:"地点",
    titleEn:"Hometown", titleZh:"家乡",
    questions:["Where is your hometown?","Do you like your hometown?","Is your hometown a good place to live?","Has your hometown changed?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架②", proficiency:"没练" },
  { id:"sb_p1_area", type:"P1", period:"2026-05-08", isNew:false, frequency:"ultra", category:"地点",
    titleEn:"The area you live in", titleZh:"居住的地方",
    questions:["Do you like the area you live in?","What is your area like?","Has your area changed recently?","Would you recommend your area to others?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架②", proficiency:"没练" },
  { id:"sb_p1_the_city_you_live_in", type:"P1", period:"2026-08-09", isNew:true, frequency:"ultra", category:"日常",
    titleEn:"The city you live in", titleZh:"",
    questions:["What city do you live in?","Do you like this city? Why?","How long have you lived in this city?","Are there big changes in this city?","Is this city your permanent residence?","Are there people of different ages living in this city?","Are the people friendly in the city?","Is the city friendly to children and old people?","Do you often see your neighbors?","What's the weather like where you live?","Would you recommend your city to others?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_a_perfect_job_you_would_like_to51", type:"P2", period:"2026-08-09", isNew:true, frequency:"medium", category:"物品",
    titleEn:"a perfect job you would like to have in the future", titleZh:"完美工作",
    promptEn:"Describe a perfect job you would like to have in the future", promptZh:"",
    youShouldSay:["What it is","How you knew it","What you need to learn to get this job","And explain why you think it is a perfect job for you"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_a_famous_person_you_would_like_52", type:"P2", period:"2026-08-09", isNew:true, frequency:"medium", category:"人物",
    titleEn:"a famous person you would like to meet", titleZh:"想见的名人",
    promptEn:"Describe a famous person you would like to meet", promptZh:"",
    youShouldSay:["Who he/she is","How you knew him/her","How/where you would like to meet him/her","And explain why you would like to meet him/her"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_an_occasion_when_you_were_not_a53", type:"P2", period:"2026-08-09", isNew:true, frequency:"medium", category:"物品",
    titleEn:"an occasion when you were not allowed to use your mobile pho", titleZh:"禁用手机的场合",
    promptEn:"Describe an occasion when you were not allowed to use your mobile phone", promptZh:"",
    youShouldSay:["When it was","Where it was","Why you were not allowed to use your mobile phone","And how you felt about it"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_a_time_when_you_gave_advice_to_54", type:"P2", period:"2026-08-09", isNew:true, frequency:"medium", category:"人物",
    titleEn:"a time when you gave advice to others", titleZh:"给别人建议",
    promptEn:"Describe a time when you gave advice to others", promptZh:"",
    youShouldSay:["When it was","To whom you gave the advice","What the advice was","And explain why you gave the advice"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_techproduct", type:"P2", period:"2026-05-08", isNew:false, frequency:"medium", category:"物品",
    titleEn:"A tech product you want to have", titleZh:"想拥有的科技产品",
    promptEn:"Describe a technology product you would like to have.", promptZh:"描述一个你想拥有的科技产品。",
    youShouldSay:["What it is","What it can do","Why you want it","And explain why this matters to you"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_plansperson", type:"P2", period:"2026-05-08", isNew:true, frequency:"medium", category:"人物",
    titleEn:"A person good at making plans", titleZh:"擅长做计划的人",
    promptEn:"Describe a person you know who is good at making plans.", promptZh:"描述一个你认识的擅长做计划的人。",
    youShouldSay:["Who this person is","How they make plans","Why you think they are good at it","And explain why this matters to you"],
    cue:'', content:'', keywords:'', linkedTo:"可套Leo母本(常做计划)", proficiency:"没练" },
  { id:"sb_p2_describe_a_child_who_loves_drawing_paint57", type:"P2", period:"2026-08-09", isNew:true, frequency:"medium", category:"人物",
    titleEn:"a child who loves drawing/painting", titleZh:"喜欢画画的孩子",
    promptEn:"Describe a child who loves drawing/painting", promptZh:"",
    youShouldSay:["Who he/she is","How/when you knew him/her","How often he/she draws/paints","And explain why you think he/she loves drawing/painting"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_a_program_or_app_on_your_comput58", type:"P2", period:"2026-08-09", isNew:true, frequency:"medium", category:"物品",
    titleEn:"a program or app on your computer or phone", titleZh:"App/程序",
    promptEn:"Describe a program or app on your computer or phone", promptZh:"",
    youShouldSay:["What it is","How often you use it","When/how you use it","When/how you found it","And explain how you feel about it"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_an_occasion_when_many_people_we59", type:"P2", period:"2026-08-09", isNew:true, frequency:"medium", category:"物品",
    titleEn:"an occasion when many people were smiling", titleZh:"微笑的场合",
    promptEn:"Describe an occasion when many people were smiling", promptZh:"",
    youShouldSay:["When it happened","Who you were with","What happened","And explain why most people were smiling"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_a_time_when_you_felt_proud_of_a60", type:"P2", period:"2026-08-09", isNew:true, frequency:"high", category:"人物",
    titleEn:"a time when you felt proud of a family member", titleZh:"为家人骄傲",
    promptEn:"Describe a time when you felt proud of a family member", promptZh:"",
    youShouldSay:["When it happened","Who the person is","What the person did","And explain why you felt proud of him/her"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_something_important_that_has_be61", type:"P2", period:"2026-08-09", isNew:true, frequency:"medium", category:"人物",
    titleEn:"something important that has been kept in your family for a ", titleZh:"对家庭重要的东西",
    promptEn:"Describe something important that has been kept in your family for a long time", promptZh:"",
    youShouldSay:["What it is","When your family had it","How your family got it","And explain why it is important to your family"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_a_bicycle_motorcycle_car_trip_y62", type:"P2", period:"2026-08-09", isNew:true, frequency:"high", category:"地点",
    titleEn:"a bicycle/motorcycle/car trip you would like to go", titleZh:"自行车/摩托车/汽车旅行",
    promptEn:"Describe a bicycle/motorcycle/car trip you would like to go", promptZh:"",
    youShouldSay:["Who you would like to go with","Where you would like to go","When you would like to go","And explain why you would like to go by bicycle/motorcycle/car"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_a_person_who_solved_a_problem_i63", type:"P2", period:"2026-08-09", isNew:true, frequency:"high", category:"人物",
    titleEn:"a person who solved a problem in a smart way", titleZh:"机智解决问题的人",
    promptEn:"Describe a person who solved a problem in a smart way", promptZh:"",
    youShouldSay:["Who this person is","What the problem was","How he/she solved it","And explain why you think he/she did it in a smart way"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_one_of_your_friends_who_learned64", type:"P2", period:"2026-08-09", isNew:true, frequency:"medium", category:"人物",
    titleEn:"one of your friends who learned something without a teacher", titleZh:"朋友自学",
    promptEn:"Describe one of your friends who learned something without a teacher", promptZh:"",
    youShouldSay:["Who he/she is","What he/she learned","Why he/she learned this","And explain whether it would be easier to learn from a teacher"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_an_event_you_attended_in_which_65", type:"P2", period:"2026-08-09", isNew:true, frequency:"high", category:"物品",
    titleEn:"an event you attended in which you didn’t enjoy the music pl", titleZh:"不享受的音乐活动",
    promptEn:"Describe an event you attended in which you didn’t enjoy the music played", promptZh:"",
    youShouldSay:["What it was","Who you went with","Why you decided to go there","And explain why you didn’t enjoy it"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_a_movie_you_watched_and_enjoyed66", type:"P2", period:"2026-08-09", isNew:true, frequency:"high", category:"物品",
    titleEn:"a movie you watched and enjoyed recently", titleZh:"近期看过且享受的电影",
    promptEn:"Describe a movie you watched and enjoyed recently", promptZh:"",
    youShouldSay:["When and where you watched it","Who you watched it with","What it was about","And explain why you watched this movie"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_an_interesting_building67", type:"P2", period:"2026-08-09", isNew:true, frequency:"medium", category:"地点",
    titleEn:"an interesting building", titleZh:"有趣的建筑",
    promptEn:"Describe an interesting building", promptZh:"",
    youShouldSay:["Where it is","What it looks like","What function it has","And explain why you think it is interesting"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_a_time_you_needed_to_use_your_i68", type:"P2", period:"2026-08-09", isNew:true, frequency:"medium", category:"抽象",
    titleEn:"a time you needed to use your imagination", titleZh:"发挥想象力",
    promptEn:"Describe a time you needed to use your imagination", promptZh:"",
    youShouldSay:["When it was","Why you needed to use imagination","How difficult or easy it was","And explain how you felt about it"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_a_person_who_often_helps_others69", type:"P2", period:"2026-08-09", isNew:true, frequency:"medium", category:"人物",
    titleEn:"a person who often helps others", titleZh:"乐于助人的人",
    promptEn:"Describe a person who often helps others", promptZh:"",
    youShouldSay:["Who this person is","How often he/she helps others","How/why he/she helps others","And how you feel about this person"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_an_item_on_which_you_spent_more70", type:"P2", period:"2026-08-09", isNew:true, frequency:"medium", category:"物品",
    titleEn:"an item on which you spent more than expected", titleZh:"花费超过预期的物品",
    promptEn:"Describe an item on which you spent more than expected", promptZh:"",
    youShouldSay:["What it is","How much you spent on it","Why you bought it","And explain why you think you spent more than expected"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_a_time_when_you_encouraged_some71", type:"P2", period:"2026-08-09", isNew:true, frequency:"medium", category:"人物",
    titleEn:"a time when you encouraged someone to do something that he/s", titleZh:"鼓励别人做不愿做的事",
    promptEn:"Describe a time when you encouraged someone to do something that he/she didn't want to do", promptZh:"",
    youShouldSay:["Who he or she is","What you encouraged him/her to do","How he/she reacted","And explain why you encouraged him/her to do it"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_a_short_term_job_you_want_to_ha72", type:"P2", period:"2026-08-09", isNew:true, frequency:"medium", category:"抽象",
    titleEn:"a short-term job you want to have in a foreign country", titleZh:"想从事的短期海外工作",
    promptEn:"Describe a short-term job you want to have in a foreign country", promptZh:"",
    youShouldSay:["Where it is","How you know of it","What the job is","And explain why you want to do it"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_a_person_who_likes_to_look_afte73", type:"P2", period:"2026-08-09", isNew:true, frequency:"medium", category:"人物",
    titleEn:"a person who likes to look after the natural world", titleZh:"爱护自然之人",
    promptEn:"Describe a person who likes to look after the natural world", promptZh:"",
    youShouldSay:["Who this person is","What he or she does","How he or she does it","How often he or she does it","And explain how you feel about this person"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_a_city_that_you_think_is_very_i74", type:"P2", period:"2026-08-09", isNew:true, frequency:"medium", category:"人物",
    titleEn:"a city that you think is very interesting/famous", titleZh:"有趣/著名的城市",
    promptEn:"Describe a city that you think is very interesting/famous", promptZh:"",
    youShouldSay:["Where it is","What it is famous for","How you knew this city","And explain why you think it is very interesting/famous"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_citylike", type:"P2", period:"2026-05-08", isNew:false, frequency:"medium", category:"地点",
    titleEn:"A city you visited and liked", titleZh:"去过且喜欢的城市",
    promptEn:"Describe a city you visited and liked.", promptZh:"描述一个你去过且喜欢的城市。",
    youShouldSay:["Where it is","What you did there","Why you liked it","And explain why this matters to you"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p1_dream_and_ambition", type:"P1", period:"2026-08-09", isNew:true, frequency:"normal", category:"日常",
    titleEn:"Dream and ambition", titleZh:"",
    questions:["What was your childhood dream?","Are you the kind of person who sticks to dreams?","What is your dream job?","Do you think you are an ambitious person?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_a_place_you_would_like_to_visit77", type:"P2", period:"2026-08-09", isNew:true, frequency:"normal", category:"地点",
    titleEn:"a place you would like to visit in your free time", titleZh:"想有空时去旅游的地方",
    promptEn:"Describe a place you would like to visit in your free time", promptZh:"",
    youShouldSay:["Where it is","What you will do there","How long you will stay there","And explain why you would like to visit it"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_a_special_cake_you_received_fro78", type:"P2", period:"2026-08-09", isNew:true, frequency:"high", category:"抽象",
    titleEn:"a special cake you received from others", titleZh:"收到特殊蛋糕",
    promptEn:"Describe a special cake you received from others", promptZh:"",
    youShouldSay:["When it happened","Where it happened","Who gave it to you","And explain what made it special"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_describe_a_person_who_works_in_a_success79", type:"P2", period:"2026-08-09", isNew:true, frequency:"normal", category:"人物",
    titleEn:"a person who works in a successful company", titleZh:"在成功公司工作的人",
    promptEn:"Describe a person who works in a successful company", promptZh:"",
    youShouldSay:["Who he/she is","What he/she does in the company","What business the company does","And explain why you think it is a successful company"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p1_art", type:"P1", period:"2026-05-08", isNew:true, frequency:"ultra", category:"抽象",
    titleEn:"Art", titleZh:"艺术",
    questions:["Do you like art?","Do you enjoy visiting art galleries?","Have you ever tried creating art?","Do you think art is important for children?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架⑥", proficiency:"没练" },
  { id:"sb_p1_parks", type:"P1", period:"2026-05-08", isNew:true, frequency:"ultra", category:"地点",
    titleEn:"Public gardens and parks", titleZh:"公园",
    questions:["Do you often visit parks?","What do you usually do in parks?","Are there many parks near your home?","Do you think parks are important for cities?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架②", proficiency:"没练" },
  { id:"sb_p1_sports", type:"P1", period:"2026-05-08", isNew:true, frequency:"high", category:"日常",
    titleEn:"Sports programs", titleZh:"运动频道",
    questions:["Do you watch sports programs?","What sports do you like to watch?","Do you prefer watching or playing sports?","Have you watched a live sports event?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架①", proficiency:"没练" },
  { id:"sb_p2_change", type:"P2", period:"2026-05-08", isNew:true, frequency:"ultra", category:"事件",
    titleEn:"A recent change", titleZh:"近期改变",
    promptEn:"Describe a recent change you made in your life.", promptZh:"描述你生活中近期做出的一个改变。",
    youShouldSay:["What the change was","Why you made the change","How you felt about it","And explain why this matters to you"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_changemind", type:"P2", period:"2026-05-08", isNew:true, frequency:"ultra", category:"事件",
    titleEn:"A time you changed your mind", titleZh:"改变重要想法",
    promptEn:"Describe a time when you changed your mind about something.", promptZh:"描述一次你改变想法的经历。",
    youShouldSay:["What you changed your mind about","Why you changed your mind","How you felt afterwards","And explain why this matters to you"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_lawenv", type:"P2", period:"2026-05-08", isNew:true, frequency:"ultra", category:"抽象",
    titleEn:"A law to protect the environment", titleZh:"保护环境的法律",
    promptEn:"Describe a law that helps protect the environment.", promptZh:"描述一项有助于保护环境的法律。",
    youShouldSay:["What the law is","How it helps the environment","Whether it is effective","And explain why this matters to you"],
    cue:'', content:'', keywords:'', linkedTo:"可套舅舅母本", proficiency:"没练" },
  { id:"sb_p2_ambition", type:"P2", period:"2026-05-08", isNew:true, frequency:"ultra", category:"抽象",
    titleEn:"A long-term ambition", titleZh:"长久目标/抱负",
    promptEn:"Describe a long-term ambition you have.", promptZh:"描述你的一个长期目标。",
    youShouldSay:["What the ambition is","When you started having it","What you plan to do to achieve it","And explain why this matters to you"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_waitmsg", type:"P2", period:"2026-05-08", isNew:true, frequency:"ultra", category:"事件",
    titleEn:"A message you waited long for", titleZh:"很久没收到回复的信息",
    promptEn:"Describe a message you waited a long time to receive.", promptZh:"描述一条你等了很久才收到的信息。",
    youShouldSay:["What the message was","Why you waited so long","How you felt when you received it","And explain why this matters to you"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_animals", type:"P2", period:"2026-05-08", isNew:true, frequency:"high", category:"物品",
    titleEn:"A story or book with animals", titleZh:"包含动物的故事或书",
    promptEn:"Describe a story or book that includes animals.", promptZh:"描述一个包含动物的故事或书。",
    youShouldSay:["What the story/book is","What animals are in it","Why you like it","And explain why this matters to you"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_adceleb", type:"P2", period:"2026-05-08", isNew:true, frequency:"high", category:"物品",
    titleEn:"An ad with a celebrity", titleZh:"名人出演的广告",
    promptEn:"Describe an advertisement that features a celebrity.", promptZh:"描述一个有名人出演的广告。",
    youShouldSay:["What the ad is about","Who the celebrity is","What you think of the ad","And explain why this matters to you"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_travel", type:"P2", period:"2026-05-08", isNew:true, frequency:"high", category:"地点",
    titleEn:"A place you recommend to travel", titleZh:"推荐旅行过的地方",
    promptEn:"Describe a place you would recommend people to travel to.", promptZh:"描述一个你推荐别人去旅行的地方。",
    youShouldSay:["Where it is","What people can do there","Why you recommend it","And explain why this matters to you"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_techprob", type:"P2", period:"2026-05-08", isNew:true, frequency:"high", category:"事件",
    titleEn:"A tech problem you encountered", titleZh:"遇到的科技问题",
    promptEn:"Describe a time you had a problem with a piece of technology.", promptZh:"描述一次你遇到科技问题的经历。",
    youShouldSay:["What the problem was","How you solved it","How you felt about it","And explain why this matters to you"],
    cue:'', content:'', keywords:'', linkedTo:"可套Leo母本(机智解决)", proficiency:"没练" },
  { id:"sb_p2_plantsperson", type:"P2", period:"2026-05-08", isNew:false, frequency:"high", category:"人物",
    titleEn:"A person who enjoys growing plants", titleZh:"喜欢种植物的人",
    promptEn:"Describe a person you know who enjoys growing plants at home or in their garden.", promptZh:"描述一个你喜欢在家/花园种植物的人。",
    youShouldSay:["Who this person is","What plants they grow","Why they enjoy it","And explain why this matters to you"],
    cue:'', content:'', keywords:'', linkedTo:"可套舅舅母本(种植物)", proficiency:"没练" },
  { id:"sb_p2_boringplace", type:"P2", period:"2026-05-08", isNew:true, frequency:"high", category:"地点",
    titleEn:"A boring place you visited", titleZh:"去过无聊的地方",
    promptEn:"Describe a place you visited that was boring.", promptZh:"描述一个你去过的无聊的地方。",
    youShouldSay:["Where it was","Why it was boring","What you did there","And explain why this matters to you"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_liveevent", type:"P2", period:"2026-05-08", isNew:true, frequency:"medium", category:"事件",
    titleEn:"A live sports event", titleZh:"喜欢的现场体育赛事",
    promptEn:"Describe a live sports event you enjoyed watching.", promptZh:"描述一个你喜欢的现场体育赛事。",
    youShouldSay:["What event it was","Where you watched it","Why you enjoyed it","And explain why this matters to you"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_visitnotlive", type:"P2", period:"2026-05-08", isNew:true, frequency:"high", category:"地点",
    titleEn:"A home you like to visit but not live", titleZh:"喜欢拜访但不想住的家",
    promptEn:"Describe a home you like to visit but would not want to live in.", promptZh:"描述一个你喜欢拜访但不想住的家。",
    youShouldSay:["Whose home it is","What it is like","Why you would not want to live there","And explain why this matters to you"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p1_leisure", type:"P1", period:"2026-08-09", isNew:true, frequency:"high", category:"日常",
    titleEn:"Leisure time", titleZh:"闲暇时间",
    questions:["What do you usually do in your leisure time?","Do you prefer to spend leisure time alone or with others?","Did you have more leisure time when you were a child?","Do you think leisure time is important?"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p1_dailyroutine", type:"P1", period:"2026-08-20", isNew:true, frequency:"medium", category:"事",
    titleEn:"Daily routine", titleZh:"日常作息",
    questions:["What is your daily routine?","Do you have a fixed daily schedule?","Has your routine changed recently?","Do you prefer a routine or doing things spontaneously?"],
    cue:'', content:'', keywords:'', linkedTo:"可套框架③", proficiency:"没练" },
  { id:"sb_p2_difficult_problem", type:"P2", period:"2026-08-20", isNew:true, frequency:"medium", category:"事",
    titleEn:"A time you solved a difficult problem", titleZh:"解决困难的一次经历",
    promptEn:"Describe a time when you solved a difficult problem.", promptZh:"描述一次你解决困难问题的经历。",
    youShouldSay:["What the problem was","How you solved it","What the result was","And explain how you felt about it"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_encouraged_by_others", type:"P2", period:"2026-08-20", isNew:true, frequency:"medium", category:"事",
    titleEn:"A time when someone encouraged you", titleZh:"别人鼓励你的经历",
    promptEn:"Describe a time when someone encouraged you.", promptZh:"描述一次别人鼓励你的经历。",
    youShouldSay:["Who encouraged you","When it happened","What they said or did","And explain how it helped you"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" },
  { id:"sb_p2_old_object", type:"P2", period:"2026-08-20", isNew:true, frequency:"medium", category:"物",
    titleEn:"An old object your family keeps", titleZh:"家里保留的一件旧物件",
    promptEn:"Describe an old object which your family has kept for a long time.", promptZh:"描述一件你家长期保留的旧物件。",
    youShouldSay:["What it is","Who kept it","How long it has been kept","And explain why it is important"],
    cue:'', content:'', keywords:'', linkedTo:"", proficiency:"没练" }
];

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
  scores: [
    { id:'seed_first', date:'2026-08-02', listening:4, reading:5, writing:5, speaking:4.5, note:'首考' }
  ],
  settings: {
    name: 'Camille',
    examDate: '2026-08-25',                 // 下一次考试（首考 2026-08-02 已过，不再作倒计时基准）
    examDates: ['2026-08-25', '2026-09-13'], // 后续场次日程，倒计时自动取"未来最早一场"
    theme: 'light',
    dailyGoalHours: 8,
    targets: { overall: 6.0, listening: 5.5, reading: 6.5, writing: 5.5, speaking: 5.5 },
    relayToken: '',
    syncCode: '',
    autoSync: true
  },
  errorbook: [],
  longSent: [],           // 长难句拆解记录（合并进「词句」页，由 errorbook.js 读写）
  energy: [],
  checkins: [],
  mockRecords: [],
  deletedIds: [],   // 全局墓碑：所有删除操作的 raw id 集合，跨同步传播删除
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
    { id:'wt_cr3', category:'Report', title:'先表态再分析（万能版）', skeleton:'The debate surrounding 【话题】 has engaged a broad audience recently. From my perspective, 【话题】 is a serious problem, and this essay will discuss why it happens.\n\nFirst of all, there are several clear reasons why this happens. One key strength is its ability to improve 【普适领域】, thereby building a firm basis for 【进阶目标】. As a result, this practice not only generates short-term benefits but also contributes to long-term outcomes. Another significant advantage is that it addresses problems from the ground up by removing 【潜在原因】. For example, this has helped many people and improved life satisfaction. This then creates a ripple effect that helps a wide range of people in their daily lives.\n\n【题目问解决时才加这句：However, I think the government should take action.】\nHowever, opponents may argue that 【反方观点】. Nevertheless, this advantage is short-lived, as the initial effect quickly fades once 【简单条件】. More importantly, these short-term gains often hide deeper problems that quick fixes cannot solve. In the end, the problems caused by ignoring the real issue are much bigger than any short-term comfort it gives.\n\nIn conclusion, 【话题】 is a complex problem. On the one hand, it brings benefits; on the other hand, its downsides are limited. Therefore, the overall impact should be viewed as largely positive.', tips:'Report 题型（用户自制「先亮立场 + 让步反驳」万能骨架）。开头直接表态【话题】is a serious problem 并点明 discuss why it happens；Body1 写原因（strength / advantage 措辞，填【普适领域】【进阶目标】【潜在原因】）；Body2 先让步写【反方观点】再回击（【简单条件】让短期优势失效）。中间【题目问解决时才加这句：However, I think the government should take action.】只在题干问 how / what to do / solutions 时保留，否则整行删掉。只填名词短语，不自己造语法。' }
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
    // 兜底：确保所有数组字段非 undefined（极端损坏数据时也不崩）
    const arrayFields = ['sessions','notes','meds','words','plans','corpus','scores','errorbook',
      'energy','checkins','speaking','writing','writingScores','speakingStories','writingPhrases','mockRecords',
      'dictationSources','dictationLogs','longSent','deletedIds'];
    for(const f of arrayFields){ if(!Array.isArray(DATA[f])) DATA[f] = []; }
    if(!DATA.settings || typeof DATA.settings !== 'object') DATA.settings = {};
    // 题库迁移：仅补用户缺失的题目；用户手动删过的 id 记入全局墓碑 deletedIds（兼容旧 settings.deletedSpeakingIds），不再恢复
    if(SPEAKING_BANK && SPEAKING_BANK.length){
      const legacyDel = (DATA.settings && Array.isArray(DATA.settings.deletedSpeakingIds)) ? DATA.settings.deletedSpeakingIds : [];
      const deletedIds = new Set([...(DATA.deletedIds||[]), ...legacyDel]);
      DATA.deletedIds = Array.from(deletedIds);
      const existingIds = new Set(DATA.speaking.map(s => s.id));
      const missing = SPEAKING_BANK.filter(s => !existingIds.has(s.id) && !deletedIds.has(s.id));
      if(missing.length) DATA.speaking = missing.concat(DATA.speaking);
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
        DATA.writing.forEach(t => {
          if(t && titleUpdates[t.id]) t.title = titleUpdates[t.id];
          if(t && categoryUpdates[t.id]) t.category = categoryUpdates[t.id];
          if(t && oldCategoryMap[t.category]) t.category = oldCategoryMap[t.category];
        });
        const deletedIds = new Set(DATA.deletedIds || []);
        // 2026-08-23：Report 模板收敛为单一「先表态再分析」骨架（用户自制），旧 4 条 Report 默认不再保留
        ['wt_cr1','wt_cr2','wt_cr4'].forEach(id => deletedIds.add(id));
        // 若用户浏览器里仍有这些旧 Report 模板，强制移除；并检查已存在的 wt_cr3 是否需要刷新为新骨架
        DATA.writing = DATA.writing.filter(t => !(t && t.category === 'Report' && ['wt_cr1','wt_cr2','wt_cr4'].includes(t.id)));
        const cr3Default = DATA.writing.find(t => t.id === 'wt_cr3');
        if(cr3Default){
          const seed = DEFAULT_WRITING_TEMPLATES.find(t => t.id === 'wt_cr3');
          if(seed){ cr3Default.skeleton = seed.skeleton; cr3Default.title = seed.title; cr3Default.tips = seed.tips; }
        }
        // 2026-08-23：动态图/静态图/地图对比/地图变化/流程图万能版替换为用户「完整背诵版」骨架，老用户本地已存的也要同步刷新
        ['wt_a5','wt_b5','wt_c5a','wt_c5b','wt_d5'].forEach(id => {
          const local = DATA.writing.find(t => t.id === id);
          const seed = DEFAULT_WRITING_TEMPLATES.find(t => t.id === id);
          if(local && seed){ local.skeleton = seed.skeleton; local.title = seed.title; local.tips = seed.tips; }
        });
        const existingIds = new Set(DATA.writing.map(t => t.id));
        const missing = DEFAULT_WRITING_TEMPLATES.filter(t => !existingIds.has(t.id) && !deletedIds.has(t.id));
        if(missing.length) DATA.writing = DATA.writing.concat(missing);
      }
    })();
    // 口语题库档位体系迁移：统一为 超高频(ultra,原必考)>高频(high)>中频(medium)>低频(low)；分类统一 人/事/地/物/杂项。
    // 作用：既修正 SPEAKING_BANK 新题，也回写老用户浏览器里已存的旧档位/旧分类（种子只增量补齐、不回写，故必须在此统一重映射）。
    (function migrateSpeakingTiers(){
      const REMAP = {
        sb_p1_work:['ultra','事'], sb_p1_home:['ultra','地'], sb_p1_hometown:['ultra','地'], sb_p1_area:['ultra','地'], sb_p1_the_city_you_live_in:['ultra','事'],
        sb_p1_socialmedia:['high','物'], sb_p1_tidiness:['high','地'], sb_p1_space:['high','杂项'], sb_p1_science:['high','杂项'], sb_p1_watch:['high','物'], sb_p1_headphones:['high','物'],
        sb_p1_music:['medium','杂项'], sb_p1_teachers:['medium','人'], sb_p1_shopping:['medium','事'], sb_p1_websites:['medium','物'], sb_p1_clothing:['medium','物'], sb_p1_parks:['medium','地'], sb_p1_singing:['medium','事'], sb_p1_dailyroutine:['medium','事'],
        sb_p2_travel:['high','地'], sb_p2_techproduct:['high','物'], sb_p2_tallbuilding:['high','物'], sb_p2_animals:['high','杂项'], sb_p2_boringplace:['high','地'], sb_p2_describe_a_boring_place18:['high','地'],
        sb_p2_childhoodfriend:['high','人'], sb_p2_describe_a_famous_person_you_would_like_52:['high','人'], sb_p2_describe_a_live_sports_event_you_watched29:['high','事'], sb_p2_specialfood:['high','物'], sb_p2_teamwork:['high','事'], sb_p2_describe_a_plan_that_you_had_to_change_r26:['high','事'], sb_p2_earlymorning:['high','事'], sb_p2_describe_a_person_who_loves_to_grow_vege21:['high','人'],
        sb_p2_decision:['medium','事'], sb_p2_describe_a_movie_you_watched_and_enjoyed66:['medium','杂项'], sb_p2_describe_a_bicycle_motorcycle_car_trip_y62:['medium','地'], sb_p2_difficult_problem:['medium','事'], sb_p2_encouraged_by_others:['medium','事'], sb_p2_old_object:['medium','物']
      };
      const OLDCAT = { '人物':'人', '事件':'事', '地点':'地', '物品':'物', '抽象':'杂项', '日常':'事' };
      DATA.speaking.forEach(s => {
        if(!s || !s.id) return;
        const r = REMAP[s.id];
        if(r){ s.frequency = r[0]; s.category = r[1]; }
        else { s.frequency = 'low'; s.category = OLDCAT[s.category] || '事'; }
      });
    })();
    // 考试倒计时迁移（Bug：首页/顶部显示"已过 天"）：
    // 老用户 localStorage 里 examDate 仍是首考 2026-08-02（已过），导致 daysUntil 返回负数、格式串又硬拼" 天"，
    // 倒计时丢失"距下次考试"信息。这里按用户真实档期初始化 upcoming 列表（仅当缺失时，已手动管理者不受影响）。
    if(!Array.isArray(DATA.settings.examDates) || DATA.settings.examDates.length === 0){
      const KNOWN_EXAMS = ['2026-08-25', '2026-09-13']; // 二场、三场(目标分)
      const today0 = new Date(); today0.setHours(0,0,0,0);
      const future = KNOWN_EXAMS.filter(d => {
        const dt = new Date(d + 'T00:00:00');
        return !isNaN(dt) && dt >= today0;
      });
      if(future.length){
        DATA.settings.examDates = future;
        // 同步修正单个 examDate，确保仍读 examDate 的旧代码不再显示"已过"
        const cur = DATA.settings.examDate;
        const curDt = cur ? new Date(cur + 'T00:00:00') : null;
        if(!curDt || isNaN(curDt) || curDt < today0) DATA.settings.examDate = future[0];
      }
    }
    // 自愈：清洗词库中 en 非「非空字符串」的脏词（发音评测红词曾写入 undefined/null，导致练习页崩溃）
    if(Array.isArray(DATA.words)){
      const before = DATA.words.length;
      DATA.words = DATA.words.filter(w => w && typeof w.en === 'string' && w.en.trim() !== '');
      if(DATA.words.length !== before){ console.warn('已清洗 ' + (before - DATA.words.length) + ' 个脏词'); hubSave(); }
    }
  }catch(e){ console.warn('读取本地数据失败', e); }
}

function hubSave(){
  try{
    DATA._lastSaved = Date.now();   // 记录本机保存时间，供云端下载比对新旧（Bug17）
    localStorage.setItem(HUB_KEY, JSON.stringify(DATA));
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
