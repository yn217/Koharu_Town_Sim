// ゲームデータ：建物・目標・こはるのセリフ
window.KT = window.KT || {};

KT.N = 26;              // マップの一辺
KT.DAY_SEC = 7;         // 等速での1日の秒数
KT.ENTRANCE = { x: 0, y: 13 };
KT.SAVE_KEY = 'koharu-town-v2';

// cat: road / home / shop / work / public / tool
KT.BUILDINGS = {
  road:     { name: '道路', cat: 'road', cost: 20, upkeep: 0.2, icon: '🛣️', desc: '建物は道路に面していないと使えません。川の上は橋になります（¥100）。' },
  house:    { name: 'おうち', cat: 'home', cost: 300, upkeep: 0, cap: [4, 10, 22], icon: '🏠', desc: '住民が暮らします。まわりが快適で、お店が近いと大きなおうちに育ちます。' },
  konbini:  { name: 'コンビニ', cat: 'shop', cost: 800, upkeep: 5, jobs: 4, shopCap: 45, rate: 1.0, icon: '🏪', desc: '町の生活を支える小さなお店。こはるの得意分野！' },
  shop:     { name: '商店', cat: 'shop', cost: 1000, upkeep: 6, jobs: 6, shopCap: 70, rate: 1.3, icon: '🛍️', desc: 'たくさんのお客さんを受け入れられるお店です。' },
  cafe:     { name: 'カフェ', cat: 'shop', cost: 1200, upkeep: 6, jobs: 3, shopCap: 30, rate: 1.9, infl: { r: 3, v: 9 }, icon: '☕', desc: 'まわりの快適さが上がるおしゃれなお店。' },
  farm:     { name: '畑', cat: 'work', cost: 450, upkeep: 2, jobs: 5, prod: 3.2, infl: { r: 1, v: 2 }, icon: '🌾', desc: 'のどかな働き場所。まわりを少しだけ快適にします。' },
  workshop: { name: '工房', cat: 'work', cost: 1500, upkeep: 10, jobs: 14, prod: 4.6, infl: { r: 2, v: -12 }, icon: '🏭', desc: 'たくさんの仕事を生みますが、まわりが少しにぎやか（騒がしい）になります。' },
  flower:   { name: '花だん', cat: 'public', cost: 120, upkeep: 1, infl: { r: 1, v: 7 }, icon: '🌷', desc: 'となりのマスを快適にする小さな花だん。' },
  park:     { name: '公園', cat: 'public', cost: 400, upkeep: 4, infl: { r: 3, v: 12 }, icon: '🌳', desc: 'まわり3マスの快適さを大きく上げます。' },
  school:   { name: '学校', cat: 'public', cost: 3000, upkeep: 28, jobs: 8, service: 'edu', radius: 8, infl: { r: 4, v: 7 }, icon: '🏫', desc: '半径8マスのおうちに教育を届けます。住民50人を超えると必要に。' },
  clinic:   { name: '診療所', cat: 'public', cost: 2500, upkeep: 24, jobs: 6, service: 'health', radius: 8, infl: { r: 3, v: 5 }, icon: '🏥', desc: '半径8マスのおうちに医療を届けます。住民100人を超えると必要に。' },
  plaza:    { name: 'お祭り広場', cat: 'public', cost: 5000, upkeep: 20, infl: { r: 4, v: 16 }, icon: '🏮', desc: '町のシンボル。観光客が来て、ときどきお祭りが開かれます。' },
  bulldoze: { name: 'こわす', cat: 'tool', cost: 0, icon: '🧹', desc: '建物や道路をこわします。木を切るのは ¥20。' },
};

KT.PALETTE = ['road', 'house', 'konbini', 'shop', 'cafe', 'farm', 'workshop', 'flower', 'park', 'school', 'clinic', 'plaza', 'bulldoze'];
KT.START_UNLOCKED = ['road', 'house', 'konbini', 'farm', 'workshop', 'flower', 'park', 'bulldoze'];

KT.SEASONS = ['春', '夏', '秋', '冬'];
KT.SEASON_DAYS = 30;
KT.season = S => Math.floor(((S.day - 1) % (KT.SEASON_DAYS * 4)) / KT.SEASON_DAYS);
KT.dateLabel = S => {
  const d = S.day - 1, y = Math.floor(d / (KT.SEASON_DAYS * 4)) + 1;
  return `${y}年目 ${KT.SEASONS[KT.season(S)]} ${(d % KT.SEASON_DAYS) + 1}日`;
};

// こはるの表情：normal / happy / surprised / worried / thinking / wink
// 目標。check(s) は { cur, max } を返す
KT.GOALS = [
  {
    title: '道路を5マスのばそう', desc: '町の入口から道路をつなげよう。ドラッグでまとめて引けます。', reward: 300,
    check: s => ({ cur: Math.max(0, s.connectedRoads - s.startRoads), max: 5 }),
    intro: [
      ['happy', 'はじめまして！ わたし、こはるです。今日からこの「ひなた町」の街づくりをお手伝いしますね！'],
      ['normal', 'まずは道路から。左の「道路」を選んで、町の入口（左のはし）からドラッグで道をのばしてみてください。'],
    ],
    done: [['wink', 'いい感じの道です！ 道がつながっていないと建物は使えないので、覚えておいてくださいね♪']],
  },
  {
    title: '道路沿いにおうちを3軒', desc: 'おうちは道路に面して建てよう。', reward: 500,
    check: s => ({ cur: s.count('house', true), max: 3 }),
    intro: [['normal', 'つぎはおうちです。道路のとなりに3軒建ててみましょう。住民さんが引っ越してきますよ。']],
    done: [['happy', 'おうちに明かりがつきました！ 少しずつ人が集まってきますね。']],
  },
  {
    title: '住民を10人にしよう', desc: '日にちを進めると住民が増えていきます。', reward: 500,
    check: s => ({ cur: s.residents, max: 10 }),
    intro: [['thinking', '右上の「▶」で時間が進みます。急ぎたいときは「▶▶」も使ってみてくださいね。']],
    done: [['happy', '10人突破です！ ……でも、みんなのお買い物する場所がまだないですね。']],
  },
  {
    title: 'コンビニを建てよう', desc: 'お買い物ができる場所をつくろう。', reward: 800,
    check: s => ({ cur: s.count('konbini', true), max: 1 }),
    intro: [['wink', 'コンビニならおまかせください！ おにぎりの並べ方には、ちょっとうるさいんです。']],
    done: [['happy', 'いらっしゃいませー！ お店ができると、おうちも大きく育つようになります。商店とカフェも建てられるようになりましたよ！']],
    unlock: ['shop', 'cafe'],
  },
  {
    title: '仕事を15人分つくろう', desc: '畑や工房を建てて、働く場所をふやそう。', reward: 800,
    check: s => ({ cur: s.jobsTotal, max: 15 }),
    intro: [['thinking', '住民さんには働く場所も必要です。右上の「住・商・工」のバーは、町が今なにを求めているかの目安ですよ。']],
    done: [['normal', '仕事ができると、税収も増えて、新しい住民さんも来やすくなります。工房のまわりはちょっと騒がしいので、おうちとは少しはなしてくださいね。']],
  },
  {
    title: '公園で、まんぞく度60%', desc: '公園を建てて、町のまんぞく度を60%以上に。', reward: 1000,
    check: s => ({ cur: Math.min(s.count('park', false), 1) + (s.happy >= 60 ? 1 : 0), max: 2 }),
    intro: [['normal', '町にはひと息つける場所も大事です。公園や花だんはまわりを快適にしてくれます。「🗺」で快適さマップも見られますよ。']],
    done: [['happy', '公園でお昼寝したくなりますね……。はっ、お仕事中でした！']],
  },
  {
    title: '住民を50人にしよう', desc: 'おうち・仕事・お店のバランスを整えよう。', reward: 1500,
    check: s => ({ cur: s.residents, max: 50 }),
    intro: [['thinking', 'ここからは町全体のバランスが大切です。困ったら「アドバイス」を押してくださいね。']],
    done: [['surprised', 'わっ、50人！ 町がにぎやかになってきました！ 学校と診療所も建てられるようになりましたよ。']],
    cg: 'cg_growth', cgTitle: 'にぎやかになってきた！', cgText: 'ひなた町の住民が50人を超えました。通りに笑い声が増えてきます。',
    unlock: ['school', 'clinic'],
  },
  {
    title: '学校を建てよう', desc: '住民50人を超えると、教育が必要になります。', reward: 1500,
    check: s => ({ cur: s.count('school', true), max: 1 }),
    intro: [['normal', '子どもたちのために学校を。学校のまわりのおうちは、もっと大きく育てるようになります。']],
    done: [['happy', 'チャイムの音っていいですよね。なつかしいなぁ。']],
  },
  {
    title: '大きなおうちを建てよう', desc: 'おうちをレベル3まで育てよう（満員・快適・お店と学校が近い）。', reward: 2000,
    check: s => ({ cur: s.houseLv3, max: 1 }),
    intro: [['thinking', 'おうちは、満員で、まわりが快適で、お店と学校が近いと育ちます。公園やカフェをそばに置いてみましょう。']],
    done: [['surprised', 'すごい、マンションみたい！ たくさんの人が暮らせますね。']],
  },
  {
    title: '住民を200人にしよう', desc: '100人を超えたら診療所も忘れずに。', reward: 3000,
    check: s => ({ cur: s.residents, max: 200 }),
    intro: [['normal', '100人を超えると、医療も必要になってきます。診療所の位置も考えてみてくださいね。']],
    done: [['happy', '200人！ そろそろ町のシンボルがほしいですね……お祭り広場、建てちゃいましょう！']],
    unlock: ['plaza'],
  },
  {
    title: 'お祭り広場を建てよう', desc: '町のシンボル。観光客がやってきます。', reward: 3000,
    check: s => ({ cur: s.count('plaza', true), max: 1 }),
    intro: [['wink', 'お祭り広場ができたら、夏祭りをひらきましょう！ わたし、ゆかたは持ってないですけど……。']],
    done: [['happy', 'お祭りの準備はばっちりです！ みんなで楽しみましょうね！']],
    cg: 'cg_festival', cgTitle: 'ひなた町 夏祭り', cgText: '広場にちょうちんが灯り、はじめてのお祭りがひらかれました。',
  },
  {
    title: '住民500人・まんぞく度70%', desc: 'ひなた町を、みんなの「好き」が集まる町に。', reward: 5000,
    check: s => ({ cur: Math.min(s.residents, 500), max: 500, ok: s.residents >= 500 && s.happy >= 70 }),
    intro: [['normal', 'いよいよ最後の目標です。500人の住民さんが、笑顔で暮らせる町にしましょう。']],
    done: [
      ['happy', 'やりました……！ ひなた町、すてきな町になりましたね。'],
      ['wink', 'これからも、町長さんのとなりでお手伝いさせてください。自由に町を育てていきましょう♪'],
    ],
    cg: 'cg_evening', cgTitle: 'ひなた町の夕暮れ', cgText: 'あたたかい明かりが灯る町並み。ここは、みんなの「好き」が集まる町。',
  },
];

// 建てたときのひとこと
KT.BUILD_LINES = {
  house: ['新しいおうち！ どんな人が引っ越してくるかな？', 'あたたかそうなおうちですね。'],
  konbini: ['24時間、町を見守ります！', 'おにぎりの品ぞろえ、チェックしなきゃ！'],
  shop: ['商店街っぽくなってきましたね！'],
  cafe: ['いい香り……。休憩、まだですか？'],
  farm: ['とれたて野菜、楽しみです！'],
  workshop: ['トンテンカン！ 町の仕事が増えますね。'],
  park: ['公園！ ベンチでひなたぼっこしたいです。'],
  flower: ['お花、きれいです♪'],
  school: ['学校ができました！ 未来の町長さんが育つかも。'],
  clinic: ['これで安心して暮らせますね。'],
  plaza: ['町のシンボル、完成です！'],
};
