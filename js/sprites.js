'use strict';
/* ============================================================
 * sprites.js — 像素精灵库（全部程序化绘制，无外部资源）
 * ============================================================ */

// ---------- 全局调色板 ----------
const PAL = {
  k:'#16161e',            // 描边黑
  w:'#f8f8f8',
  r:'#d84040', d:'#8c2020', // 红/暗红
  y:'#f8d838', o:'#f08020', // 黄/橙
  n:'#a06028', N:'#6b3d10', // 棕/深棕
  t:'#f2c896', T:'#c08858', // 肤色/肤色暗
  b:'#3f6fd8', B:'#26398c', // 蓝/深蓝
  c:'#7fdce8', C:'#2f97b5', // 青/深青
  g:'#4fb84f', G:'#1f7830', // 绿/深绿
  p:'#9a4fd8', P:'#5a2a8c', // 紫/深紫
  m:'#e878b8',              // 粉
  l:'#c0c0d0', a:'#707080', A:'#3a3a4a', // 灰系
  e:'#ffe8a0', E:'#c89820', // 金/暗金
  s:'#9aa8c8', S:'#5a6a88', // 钢/暗钢
  h:'#3c3c5a', H:'#606090', // 头发/发梢高光
  f:'#f2c896',              // 兼容旧精灵的脸部肤色
  x:'#26304a', K:'#9aafc6', // 面部暗线与冰晶亮面
};

// 保留原版像素网格和剪影，只区分头发、布料、皮肤和金属的色阶。
const HERO_PAL={...PAL,h:'#25334c',H:'#526988',t:'#f5c99e',T:'#d89377',
  b:'#426fc0',B:'#294879',q:'#8db6ec',r:'#dc5756',d:'#923847',E:'#c99d50',e:'#ffe2a2',A:'#293747'};
const CHAR_PAL={...PAL,w:'#f5efda',a:'#8294a5',A:'#404e63',l:'#c1d4dc',
  r:'#cf5258',d:'#853747',o:'#e88237',y:'#f4ce69',E:'#bc9452',e:'#f5ddb0',
  n:'#ac7b53',N:'#775239',g:'#70b06d',G:'#376648',p:'#9870c0',P:'#53416e',b:'#567bba'};

function mkcv(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; }

// 由字符串数组生成精灵画布
function spr(rows,palette=PAL){
  const h=rows.length, w=Math.max(...rows.map(r=>r.length));
  const c=mkcv(w,h), x=c.getContext('2d');
  rows.forEach((row,ry)=>{
    for(let rx=0;rx<row.length;rx++){
      const ch=row[rx];
      if(ch==='.'||ch===' ') continue;
      const col=palette[ch]; if(!col) continue;
      x.fillStyle=col; x.fillRect(rx,ry,1,1);
    }
  });
  return c;
}

const SPR={};
const _FLIP=new Map(), _WHITE=new Map();

// 自动描边：给精灵加一圈深色轮廓，任何背景下都清晰
function outlined(src){
  const sil=mkcv(src.width,src.height), sx=sil.getContext('2d');
  sx.drawImage(src,0,0);
  sx.globalCompositeOperation='source-in';
  sx.fillStyle='#10101c'; sx.fillRect(0,0,sil.width,sil.height);
  const o=mkcv(src.width+2,src.height+2), x=o.getContext('2d');
  for(const p of [[0,1],[2,1],[1,0],[1,2],[0,0],[2,0],[0,2],[2,2]]) x.drawImage(sil,p[0],p[1]);
  x.drawImage(src,1,1);
  return o;
}

function flipped(name){
  if(!_FLIP.has(name)){
    const src=SPR[name], c=mkcv(src.width,src.height), x=c.getContext('2d');
    x.translate(src.width,0); x.scale(-1,1); x.drawImage(src,0,0);
    _FLIP.set(name,c);
  }
  return _FLIP.get(name);
}
function whiten(name){ // 受击白闪用
  if(!_WHITE.has(name)){
    const src=SPR[name], c=mkcv(src.width,src.height), x=c.getContext('2d');
    x.drawImage(src,0,0);
    x.globalCompositeOperation='source-in';
    x.fillStyle='#ffffff'; x.fillRect(0,0,c.width,c.height);
    _WHITE.set(name,c);
  }
  return _WHITE.get(name);
}

/* ================= 玩家：御剑小侠（Q版大头 · 协调持械姿态） ================= */
SPR.hero_idle = spr([
"................",
"...kkkkkkkk.....",
"..khhHHhhhk....",
"..khHHHhhhkk....",
"..khtttttthk....",
"..kttkttkttk....",
"..kttttTtttk....",
"...kttttttk.....",
"....krrrrk......",
"..kttbqbbttk....",
"..kbqbeEbbbk....",
"...kbqbbbbk.....",
"....kbBBbk......",
"...kbb..bbk.....",
"..kAA....AAk....",
"................"
],HERO_PAL);
SPR.hero_run1 = spr([
"................",
"...kkkkkkkk.....",
"..khhHHhhhk....",
"..khHHHhhhkk....",
"..khtttttthk....",
"..kttkttkttk....",
"..kttttTtttk....",
"...kttttttk.....",
"...krrrrkrr.....",
"..kttbqbbttk....",
"..kbqbeEbbbk....",
"....kbqbbk......",
"...kbbk..bk.....",
"..kbbk...AAk....",
".kAAk...........",
"................"
],HERO_PAL);
SPR.hero_run2 = spr([
"................",
"...kkkkkkkk.....",
"..khhHHhhhk....",
"..khHHHhhhkk....",
"..khtttttthk....",
"..kttkttkttk....",
"..kttttTtttk....",
"...kttttttk.....",
".....krrrrkrr...",
"..kttbqbbttk....",
"..kbqbeEbbbk....",
"....kbqbbk......",
"....kbbkbbk.....",
"....kAAkkAAk....",
".....kAAk.......",
"................"
],HERO_PAL);
SPR.hero_jump = spr([
"................",
"...kkkkkkkk.....",
"..khhHHhhhk....",
"..khHHHhhhkk....",
"..khtttttthk....",
"..kttkttkttk....",
"..kttttTtttk....",
"...kttttttk.....",
"..kttkrrrrkttk..",
"...kttbqbbk.....",
"..kbqbeEbbbk....",
"....kbqbbk......",
"...kbbkkbbk.....",
"...kAAkkAAk.....",
"..kAA....AAk....",
"................"
],HERO_PAL);
/* ================= Handheld weapons (12x14)
 * Grip center: (5,12), drawn with drawImage(img,-5,-12).
 * ============================================================ */
SPR.wpn_held_sword = spr([  // 轩辕剑：玉刃金格
"............",
".....ss.....",
".....sws....",
"....swcws...",
"....swcws...",
"....swcws...",
"....swcws...",
"....swcws...",
"...sswcwss..",
"...eyyyye...",
"...knnk.....",
"...keek.....",
"............",
"............",
]);
SPR.wpn_held_flysword = spr([  // 青霜飞剑：冰刃流苏
"............",
"....cwwc....",
"...cwwwwc...",
"...cweewc...",
"....cwwc....",
".....cc.....",
"....tttt....",
"...tTTTt....",
"....tTt.....",
"....cCc.....",
"....ce c....",
".....cc.....",
"............",
]);
SPR.wpn_held_bow = spr([  // 射日神弓：金弦弯弓
"............",
"......yy....",
".....yEky...",
"....yEk.w...",
"...yEk...w..",
"...yE.....w.",
"...yE.....w.",
"...yEk...w..",
"....yEk.w...",
".....yEky...",
"......yy....",
"............",
"............",
"............",
]);
SPR.wpn_held_thunder = spr([  // 雷霆之刃：锯齿电刃
"............",
"......yy....",
".....yccy...",
".....yccy...",
"....yccy....",
"...yccyy....",
"...yccy.....",
"....yccy....",
"...yccyy....",
"..yccy......",
"..eeeee.....",
"...knnk.....",
"...keek.....",
"............",
]);
SPR.wpn_held_flameblade = spr([  // 炎狱双刃：双焰弯刀
"............",
"....o..o....",
"...oro.oro..",
"...oro.oro..",
"...oro.oro..",
"....o.o.o...",
".....ooo....",
".....ooo....",
"....eyyye...",
".....knk....",
".....knk....",
".....ke.....",
"............",
"............",
]);
// 兼容旧名
SPR.hand_sword = SPR.wpn_held_sword;
// 武器 id -> 手持精灵名
const HELD_SPR={sword:'wpn_held_sword',flysword:'wpn_held_flysword',bow:'wpn_held_bow',
                thunder:'wpn_held_thunder',flameblade:'wpn_held_flameblade'};

/* ================= 投射物 ================= */
SPR.p_fire = spr([
"........",
"...oo...",
"..oyoo..",
".oyywyo.",
".oyyyyo.",
"..oyyo..",
"...oo...",
"........",
]);
SPR.p_arrow = spr([
"........",
"ssssssse",
"........",
]);
SPR.p_lightning = spr([ // 雷电波（实际渲染走 drawLightningWave，此处仅作兜底贴图）
"..c...",
".cw...",
"ccwc..",
"..cwc.",
"...wc.",
"...c..",
]);
SPR.p_flysword = spr([
"....sssssss.",
"cSSSSSSSSke..",
"....sssssss.",
]);
SPR.p_ink = spr([
"........",
"..Ppk...",
".Pppkk..",
"Pppkkkk.",
".Ppkkkk.",
"..Pkk...",
"........",
"........",
]);
SPR.p_web = spr([
"l..l..l.",
".l.l.l..",
"..lll...",
"llllllll",
"..lll...",
".l.l.l..",
"l..l..l.",
"........",
]);
SPR.p_ice = spr([
"...c....",
"..ccc...",
".ccwccc.",
"..ccc...",
"...c....",
"........",
"........",
"........",
]);
SPR.p_bone = spr([
"........",
"w.....w.",
"wwnnnww.",
"w.....w.",
"........",
"........",
"........",
"........",
]);
SPR.p_light = spr([
"ee",
"ee",
"ee",
"ee",
"yy",
"yy",
"yy",
"yy",
]);
SPR.p_shard = spr([
"..a..",
".ala.",
"alala",
".ala.",
"..a..",
".....",
]);
SPR.p_poison = spr([
"........",
"..gg....",
".gGgg...",
".gGGgg..",
"..gGGg..",
"...gg...",
"........",
"........",
]);

/* ================= 敌人（东方） ================= */
// 天兵（金甲 + 红缨 + 长戟）
SPR.e_soldier = spr([
"................",
"......rr........",
".....krrk...ss..",
"....kEEEEk..ss..",
"....kEtttEk.ss..",
"....kttkttk.ss..",
"....ktttttk.ss..",
"...kEEeEEEEkEs..",
"..kttkEEEEkEttk.",
"..ktt.kEEEEk.ttk",
"......kEddk.....",
".....kEEEEEk....",
".....kEk.kEk....",
"....kAAk.kAAk...",
"................",
"................"
],CHAR_PAL);
// 鬼火（青焰 + 空眼）
SPR.e_ghostfire = spr([
"................",
".......cc.......",
"......cwwc......",
".....cwwwwc.....",
"....cwwkkwwc....",
"....cwwkkwwc....",
"....cwwwwwwc....",
".....cwwwwc.....",
"...c..cwwc..c...",
"..c....cc....c..",
"..c..........c..",
"...c........c...",
"................",
"................",
"................",
"................"
],CHAR_PAL);
// 牛头（双角 + 鼻环 + 蛮躯）
SPR.e_cowhead = spr([
"................",
"..kw.........wk.",
"..kNk.......kNk.",
"..kNNkkkkkkkNNk.",
"...kNNNNNNNNNk..",
"...kNkwNNNkwNk..",
"...kNnnNNNNNNk..",
"...kNNNkkkNNNk..",
"....kNNeeeNNk...",
"....kNwwewwNk...",
"...knnekNkennk..",
"..kttk.NNN.kttk.",
"..kttkNNNNNkttk.",
"...kkkNNNNNkkk..",
"......kNNNk.....",
".....kAAkAAk...."
],CHAR_PAL);
// 马面（长脸 + 獠牙 + 鬃毛）
SPR.e_horseface = spr([
"................",
"....kkkkkkk.....",
"...kNnnNNNNk....",
"..kNNNNNNNNNk...",
"..kNwkNNNkwNk...",
"..kNnnNNNNNNk...",
"..kNNNNNNNNNk...",
"...kNNNNNnNk....",
"...kNrNNNrNk....",
"....kNNNNNk.....",
"...kwwkkkwwk....",
"..kkAAAAAAAkk...",
".kAkAAAAAAAKAk..",
"...kAAAAAAAk....",
"....kAAkAAk.....",
"....kAk..kAk...."
],CHAR_PAL);
// 蜘蛛妖（紫蛛 + 八足 + 复眼）
SPR.e_spider = spr([
"................",
".P....P....P...P",
"..P..P..kk..P..P",
"...P..PkppkP..P.",
"....P.kpwwpk.P..",
"....PPkpppPkPP..",
"...PPkppppPpkPP.",
"..P.kpppppPPpk.P",
".P...kppppppk..P",
"P....kkkkkkkk..P",
"................",
"................",
"................",
"................",
"................",
"................"
],CHAR_PAL);

/* ================= 敌人（西方） ================= */
// 小恶魔（红皮 + 蝠翼 + 尖角 + 尾）
SPR.e_imp = spr([
"................",
".k...........k..",
".kk.........kk..",
"..kkk.....kkk...",
"..krrkkkkkrrk...",
"..krrrrrrrrdk...",
"..krwrrrrrwdk...",
"..krrrrrrrrdk...",
".kkrrkkkkkrrkk..",
"krk.krrrrrk.krk.",
"kr..krrrrrk..rk.",
"....krrrrrk.....",
"....krrkkrrk....",
"....krrk.krk....",
"....kkk...kk....",
"................"
],CHAR_PAL);
// 石像鬼（石躯 + 双翼 + 红目 + 利爪）
SPR.e_gargoyle = spr([
"................",
"..kk........kk..",
".kack......kcak.",
".kaack....kcaak.",
"..kalakkkkaaAk..",
"..kaarraarrAAk..",
"..kaalaaaaaAAk..",
".kkaaakkkkkAAakk",
".kkaakAAAAkaakkk",
"..kkak.kAAk.kakk",
".......kAAk.....",
"....kAkkAAkkAk..",
"....kAk....kAk..",
"...kkkk....kkkk.",
"................",
"................"
],CHAR_PAL);
// 骷髅弓手（白骨 + 长弓）
SPR.e_skeleton = spr([
"................",
"....kkkkk...n...",
"...kwwwwwk.n..n.",
"...kwkwkwk.n..n.",
"...kwwwwwk.n..n.",
"....kkkkk...n..n",
"...kwwwwwk...n..",
"..kwkwwwkwk.n...",
"...kwwwwwk..n...",
"....kwkwk...n...",
"....kwkwk.......",
"....kwkwk.......",
"....kwkwk.......",
"...kAAkkAAk.....",
"................",
"................"
],CHAR_PAL);
// 地狱犬（黑鬃 + 焰纹 + 红目）
SPR.e_hound = spr([
"................",
"..kk.......kk...",
".kAAk.....kAAk..",
".kAkkkkkkkkkAk..",
".kAAAAAAAAAAk...",
"kkAAooooooAAAAkk",
"kAAarAAAAAAraAk.",
".kkAAAAAAAAAkk..",
"..kAAakkkkAAk...",
"..kaak...kaak...",
"..kaak...kaak...",
"..kkk.....kkk...",
"................",
"................",
"................",
"................"
],CHAR_PAL);
// 堕落天使（灰袍 + 黑羽翼 + 金环）
SPR.e_angel = spr([
"................",
"....kEEEEk......",
"...kEeeeeEk.....",
"....kkkkkk......",
".kk.kalaaaak.kk.",
".kakkaawaaAkkak.",
".kaakaaaaaAkaAk.",
"kaaakayyyyAkAAk.",
"kaaakayyyyakaAk.",
".kakkalaakkakak.",
"..k..kaaak..k...",
".....kaaak......",
".....kak.kak....",
".....kak.kak....",
"................",
"................"
],CHAR_PAL);
// 冰霜妖灵（冰晶躯 + 冷光）
SPR.e_ice = spr([
"................",
"......ccc.......",
".....cwwcc......",
"....cwkwkwc.....",
"....cwwwwwc.....",
".....ccccc......",
"....cccwccc.....",
"...ccwwwwwcc....",
"..ccwwKwwwwcc...",
"..ccwwwKwwwwc...",
"...cccwwwccc....",
"....ccc.ccc.....",
"....cc...cc.....",
"................",
"................",
"................"
],CHAR_PAL);
SPR.b_garg = spr([
"........................",
"...k..................k.",
"..kak................kak",
"..kalak............kalAk",
".kaaalak........kalaAaak",
".kaaalakkkkkkkkkkAaAAak.",
"..kaaaallllaaaaaaAAAAk..",
"..kaaawaAaaaaaaaAAAAAk..",
"..kaaakraraaaaarkAAAaak.",
"...kaaalaaaaaaaaaAaAk...",
"...kaakaaaAAaAAaaakAak..",
"...kaaakkkkllaakkkkAAak.",
"....kaak..kaAaak..kAAk..",
"....kaak..kaaAak..kAak..",
"....kkaa..kaaaak..aAkk..",
".....kaaa.klaaak.aAAk...",
".....kaaa.kaaaak.AAAk...",
".....kaaa..kaak..aaak...",
"......kkk..kkkk..kkk....",
"........................",
"........................",
"........................",
"........................",
"........................"
],CHAR_PAL);
// 判官 24x28 -> 用 24x24，红袍判官持笔
SPR.b_judge = spr([
"........................",
"........kkkkkk..........",
".......kAAAAAAk.........",
"......kAEEeEEEAk........",
"......kEEEEeEEEk..E.....",
"......kEttttttEk..n.....",
"......kEtkttktEk..n.....",
"......kEttttttEk..n.....",
".......kEhtthEk...n.....",
"......krrrhhhhrk..n.....",
".....krrrrrhhrrrk.E.....",
"....krrdrrrrrrddrkk.....",
"....krrdrerrrrdddkwk....",
"....krrrrrerrrrddk......",
"....krrrEEEeeErddk......",
"....krrrrrrrrrrdrk......",
".....krrrrrrrrddk.......",
".....krrk....kddk.......",
".....krrk....krrk.......",
".....kddk....kddk.......",
"....kkAAkk..kkAAkk......",
"........................",
"........................",
"........................"
],CHAR_PAL);
// 炎魔 28x28
SPR.b_flame = spr([
"............................",
"...k....................k...",
"...kk..................kk...",
"...kok................kok...",
"....kok..............kok....",
".....kokkkkkkkkkkkkkok......",
"......koyyyyyooooooonk......",
"......konnooooooonnnnk......",
"......kooweoooooewnnok......",
"......koooyoooooyonnk.......",
".......kooyonnnnonnnok......",
".......koooooeooonnnok......",
"......konoooooooonnonok.....",
".....ktnnonyoooooynnntk.....",
"....kttknoonyoooynnkttk.....",
"....kttknooooyeyonnkttk.....",
".....kkknoooooeoonnokkk.....",
".........kooooooonnnok......",
".........konnoEoonnnnok.....",
".........konoEEEonnnnk......",
".........kooooooonnnok......",
".........kooookoonnok.......",
".........kook..konok........",
".........kok....knk.........",
".........kok....kok.........",
"........kkAk....kAkk........",
"............................",
"............................"
],CHAR_PAL);
// 混沌魔神 28x28
SPR.b_chaos = spr([
"............................",
".........kkkkkkkk...........",
"........kpepmeppek..........",
".......kpPcwppcPppk.........",
".......kpppmpppppPk.........",
"......kpppkpPPpkpPpk........",
"......kpppmppppppPPpk.......",
".....kpppeppppppePPPk.......",
".....kpppeppppppePPPpk......",
"....kpppppPppppPpPPPppk.....",
"....kpPppppPppPppPPpPPk.....",
"...kpppPppppecppppPPpPpk....",
"...kppppPpppcepppPPpPPpk....",
"...ktpppmppppeppppPPPptk....",
"..kttkpppppppppppPPPPkttk...",
"..kttkpppppppppppPPPPkttk...",
"...kkkpppPpppppppPPPPkkk....",
".......kpppppppppPPPPk......",
".......kppeeEEpeePPPpk......",
"........kppmmppppPPpk.......",
"........kppppkpppPPk........",
"........kpppk.kppPPk........",
"........kppk...kPPPk........",
"........kppk...kpppk........",
".......kkAAk...kkAAkk.......",
"............................",
"............................",
"............................"
],CHAR_PAL);

/* ================= 友方神仙/妖怪 NPC ================= */
// 药童（回春）
SPR.n_heal = spr([
"................",
"....ggggg.......",
"...kGgggGk......",
"...ktttttk..g...",
"...ktkttktk.G...",
"...ktttttk.ggg..",
"....ktttk.kGk...",
"...kGgggggkgk...",
"..ktkGggggk.....",
"...kGggggk......",
"....kGggk.......",
"....kGkGk.......",
"....kgk.gk......",
"...kAAk.kAAk....",
"................",
"................"
],CHAR_PAL);
// 风灵（疾风）
SPR.n_wind = spr([
"................",
"................",
"....ccc.........",
"..ccwwwcc.......",
".cwwwwwwc.......",
".cwwcwwwc..c....",
"..cwwwwc.cc.....",
"...ccwwc.c......",
"....cccc........",
"....c..c........",
"...c....c.......",
"................",
"................",
"................",
"................",
"................"
],CHAR_PAL);
// 土地公（神佑）
SPR.n_earth = spr([
"................",
"....EEEEE.......",
"...EeeeeE.......",
"...kwwwwwk......",
"...kwkwtkk......",
"...kwwwwwk......",
"....kkkkk.......",
"...kGggGGk......",
"..kwkGGGGkwk....",
"...kwkGGGkwk....",
"....kGGGGk......",
"....kGGkGk......",
"....kGk.Gk......",
"...kAAk.kAAk....",
"................",
"................"
],CHAR_PAL);
// 孟婆（忘忧）
SPR.n_meng = spr([
"................",
"....AAAAA.......",
"...kAAAAAk......",
"...kwwwwlk......",
"...kwkwtkk......",
"...kwwwwlk......",
"....kkkkk.......",
"...kPPPPPk......",
"..kwkPPPPkwk....",
"...kwkPPPkwk.ww.",
"....kPPPk....ww.",
"....kPkPk...wkw.",
"....kPk.k...kkk.",
"...kAAk.........",
"................",
"................"
],CHAR_PAL);
// 治愈天使（神佑）
SPR.n_angel = spr([
"................",
".....eeeee......",
"....keeeeek.....",
"....kwwwwwk.....",
"....kwkwtkk.....",
"....kwwwwwk.....",
".....kwwwk......",
"...kwkwwwkwk....",
"..kwkkwwwkkwk...",
"..kw.kwwwk.wk...",
"..k..kwwwk..k...",
"....kwwwk.......",
"....kwkwk.......",
"....kwk.kwk.....",
"................",
"................"
],CHAR_PAL);
// 金刚力士（金刚之力）
SPR.n_power = spr([
"................",
"................",
"....kkkkk.......",
"...kEtttEk......",
"...ktktttk......",
"...ktttttk......",
"....kkkkk.......",
"..kEeeeEEEk.....",
".ktkEEEEEEEktk..",
".ktkEEEEEEEktk..",
".ktkkEEEEEkkkt..",
"..k.kEEEEk......",
"....kEEEEk......",
"....kEkkEk......",
"...kAAk.kAAk....",
"................"
],CHAR_PAL);

/* ================= UI 图标 ================= */
SPR.ui_heart = spr([
".rr..rr.",
"rrrrrrrr",
"rrrrrrrr",
"rrrrrrrr",
".rrrrrr.",
"..rrrr..",
"...rr...",
"........",
]);
SPR.ui_heart_empty = spr([
".AA..AA.",
"AaaaaaA.",
"AaaaaaA.",
"aaaaaaA.",
".AaaaaA.",
"..AaaA..",
"...AA...",
"........",
]);
SPR.ui_shield = spr([
"ccbbbbc.",
"cbbbbbbc",
"cbbeebbc",
"cbbeebbc",
".cbbbbc.",
"..cbbc..",
"...cc...",
"........",
]);
SPR.ui_speed = spr([
"....c...",
"..cc.c..",
".cccc.c.",
"ccccc...",
".cccc.c.",
"..cc.c..",
"....c...",
"........",
]);
SPR.ui_power = spr([
".rrrr...",
"rrrrrr..",
"rrwwrr..",
"rrrrrr..",
".rrrr...",
"..rr....",
"..rr....",
"........",
]);
SPR.ui_star = spr([
"...y....",
"...y....",
".yywyy..",
"..ywy...",
".yy.y...",
"........",
"........",
"........",
]);
SPR.ui_poison = spr([
"..g..g..",
".ggg.g..",
".ggggg..",
"gGgggGg.",
".ggggg..",
"..ggg...",
"...g....",
"........",
]);
SPR.ui_burn = spr([
"...o....",
"..oo....",
"..ooo...",
".oyooo..",
".oyyoo..",
"..ooo...",
"...o....",
"........",
]);
SPR.ui_slow = spr([
"...cc...",
"..cccc..",
".cc..cc.",
".c....c.",
".c....c.",
".cc..cc.",
"..cccc..",
"...cc...",
]);
SPR.ui_curse = spr([
".p....p.",
"..p..p..",
"..pppp..",
".pp..pp.",
"..p..p..",
".p....p.",
"........",
"........",
]);
SPR.ui_skull = spr([
"..wwww..",
".wwwwww.",
".w.w.w..",
".wwwwww.",
"..wwww..",
"..w.w...",
"..wwww..",
"........",
]);
SPR.ui_live = spr([
".bbbb.",
"bbbbbb",
"bttttb",
"bttttb",
".bbbb.",
"......",
]);

// ================= 图块绘制（程序化，按主题） =================
function seeded(i){ const x=Math.sin(i*127.1+311.7)*43758.5453; return x-Math.floor(x); }

function makeTile(theme,variant){
  const c=mkcv(16,16), x=c.getContext('2d');
  const drawBase=(base,dark,edge,speck)=>{
    x.fillStyle=base; x.fillRect(0,0,16,16);
    x.fillStyle=dark; x.fillRect(0,14,16,2); x.fillRect(0,0,1,16);
    x.fillStyle=edge; x.fillRect(0,0,16,1);
    x.fillStyle=speck;
    for(let i=0;i<5;i++){
      const px=Math.floor(seeded(variant*31+i*7)*14)+1, py=2+Math.floor(seeded(variant*17+i*13)*11);
      x.fillRect(px,py,1+(variant%2),1);
    }
  };
  switch(theme){
    case 'sky':
      drawBase('#f4f8ff','#93aed8','#ffffff','#aebfe2');
      x.fillStyle='#7e97c4'; x.fillRect(0,15,16,1);
      x.fillStyle='#dbe7fb'; x.fillRect(2,4,5,1); x.fillRect(9,9,4,1);
      break;
    case 'cave':
      drawBase('#5a5170','#2e2742','#7c70a0','#322a48');
      x.fillStyle='#6c6088'; x.fillRect(3,3,2,1); x.fillRect(10,8,2,1);
      break;
    case 'hell':
      drawBase('#4c2833','#241018','#703840','#281018');
      x.fillStyle='#7c3a3a'; x.fillRect(4,5,3,1); x.fillRect(10,10,2,1);
      x.fillStyle='#9c4434'; if(variant%2) x.fillRect(8,3,1,4);
      break;
    case 'temple':
      drawBase('#e4ddca','#a89e88','#fff8ea','#c4bba8');
      x.fillStyle='#d0a850'; x.fillRect(0,0,16,1);
      x.fillStyle='#a89e88'; x.fillRect(4,5,4,1); x.fillRect(10,10,3,1);
      break;
    default: // chaos
      drawBase('#54326c','#2e1a40','#7c4aa4','#2c183e');
      x.fillStyle='#9a66d0'; x.fillRect(5,4,1,3); x.fillRect(11,9,3,1);
      break;
  }
  return c;
}

function makePlat(theme){
  const c=mkcv(16,6), x=c.getContext('2d');
  const cols={sky:['#ffffff','#93aed8'],cave:['#786c98','#3a3050'],hell:['#703840','#2a1218'],temple:['#fff8ea','#b0a690'],chaos:['#8456ae','#3c2454']}[theme]||['#ccc','#888'];
  x.fillStyle=cols[0]; x.fillRect(0,0,16,3);
  x.fillStyle=cols[1]; x.fillRect(0,3,16,3);
  x.fillRect(2,1,2,1); x.fillRect(9,2,3,1);
  return c;
}

function makeLava(f){
  const c=mkcv(16,16), x=c.getContext('2d');
  const hot=['#f8d838','#f08020','#e05018'];
  x.fillStyle='#c03818'; x.fillRect(0,0,16,16);
  x.fillStyle=hot[f%3];
  for(let i=0;i<4;i++){
    const px=Math.floor(seeded(i*7+f*13)*14), w=2+Math.floor(seeded(i*3+f)*4);
    x.fillRect(px,0,w,2);
    x.fillRect(Math.floor(seeded(i*11+f*3)*13),5+Math.floor(seeded(i*5)*8),2,1);
  }
  x.fillStyle=hot[(f+1)%3];
  x.fillRect(4,8,3,1); x.fillRect(10,12,3,1);
  return c;
}

// 尖刺（上/下）
function makeSpikes(down){
  const c=mkcv(16,16), x=c.getContext('2d');
  x.fillStyle='#9aa8c8';
  for(let i=0;i<4;i++){
    const bx=i*4;
    if(!down){ x.fillRect(bx+1,10,2,6); x.fillRect(bx+1,6,2,4); }
    else { x.fillRect(bx+1,0,2,6); }
  }
  x.fillStyle='#5a6a88';
  for(let i=0;i<4;i++){
    const bx=i*4;
    if(!down){ x.fillRect(bx+2,12,1,4); x.fillRect(bx+2,8,1,3); }
    else { x.fillRect(bx+2,2,1,4); }
  }
  return c;
}

// 传送门（关闭/开启两帧，24x40）
function makeGate(open){
  const c=mkcv(24,40), x=c.getContext('2d');
  x.fillStyle='#3a3a4a'; x.fillRect(0,0,24,40);
  x.fillStyle='#707080'; x.fillRect(2,2,20,36);
  x.fillStyle=open?'#7fdce8':'#d84040';
  x.fillRect(4,4,16,34);
  x.fillStyle=open?'#c9f4fa':'#8c2020';
  for(let i=0;i<5;i++) x.fillRect(5,6+i*6,14,3);
  x.fillStyle='#16161e';
  x.fillRect(4,4,16,1); x.fillRect(4,37,16,1); x.fillRect(4,4,1,34); x.fillRect(19,4,1,34);
  return c;
}

// 存档点灯笼
function makeLamp(lit){
  const c=mkcv(10,16), x=c.getContext('2d');
  x.fillStyle='#6b3d10'; x.fillRect(4,0,1,5); x.fillRect(2,13,6,3);
  x.fillStyle=lit?'#f8d838':'#3a3a4a'; x.fillRect(2,5,6,8);
  x.fillStyle=lit?'#fff8d0':'#5a6a88'; x.fillRect(3,6,4,5);
  x.fillStyle='#6b3d10'; x.fillRect(1,4,8,1); x.fillRect(1,13,8,1);
  return c;
}

// 图块缓存
const TILE_ART={};

/* ================= 新武器迷你图标 ================= */
SPR.wicon_thunder=spr([ // 雷霆之刃
"....yy....",
"..yySy....",
"....Sy....",
"....yS....",
"..yySy....",
"....Sy....",
"....Sy....",
"....S.....",
"..yS......",
"...y......",
]);
SPR.wicon_flame=spr([ // 炎狱双刃
"....o.....",
"...oo.....",
"...ooo....",
"..ooyo....",
"..oyyoo...",
"..oyyoo...",
".o.oyoo...",
"o..oyo....",
"...oo.....",
"....o.....",
]);

/* ================= Boss 飞行法器 =================
 * 翅膀已移除（观感不协调）。Boss 的悬空表现改由 game.js 的
 * drawBossHalo() 程序化绘制：符文石环 / 垂天蛛丝 / 墨云 / 火轮 / 混沌法印。
 * ================================================ */

/* ================= 蛛母 · 千目（程序化：圆腹 + 八足 + 复眼） ================= */
function makeSpiderBoss(){
  const c=mkcv(26,26), x=c.getContext('2d');
  const px=(cx,cy,col)=>{ x.fillStyle=col; x.fillRect(cx,cy,1,1); };
  const disc=(cx,cy,r,col)=>{ for(let y=-r;y<=r;y++) for(let dx=-r;dx<=r;dx++)
    if(dx*dx+y*y<=r*r+0.5) px(cx+dx,cy+y,col); };
  const line=(x0,y0,x1,y1,col)=>{
    const n=Math.max(Math.abs(x1-x0),Math.abs(y1-y0))||1;
    for(let i=0;i<=n;i++) px(Math.round(x0+(x1-x0)*i/n),Math.round(y0+(y1-y0)*i/n),col);
  };
  const legs=[ [4,7,  8,3,  12,1], [4,9,  9,7,  12,5],
               [4,13, 9,15, 12,18], [4,15, 8,19, 10,22] ];
  for(const s of [-1,1]) for(const L of legs){
    line(13+s*L[0],L[1], 13+s*L[2],L[3], '#6a2c9a');
    line(13+s*L[2],L[3], 13+s*L[4],L[5], '#9a4fd8');
  }
  disc(13,15,5,'#695084');
  disc(12,14,4,'#9870c0');
  disc(13,9,4,'#ac7fca');
  for(let i=0;i<3;i++) px(11+i,12,'#7a35a0');
  for(const [dx,dy] of [[0,-3],[-3,0],[3,0],[-2,3],[2,3],[0,4]]) px(13+dx,15+dy,'#c07af0');
  for(const [dx,dy] of [[-2,-1],[2,-1],[0,-2]]) px(13+dx,9+dy,'#d69bf5');
  for(const [dx,dy] of [[-3,0],[3,0],[-2,-2],[2,-2],[0,-3],[-1,1],[1,1]]) px(13+dx,9+dy,'#d84040');
  px(11,13,'#f8f8f8'); px(15,13,'#f8f8f8');
  return c;
}
SPR.b_spider = makeSpiderBoss();

/* ================= Boss 武器 ================= */
SPR.wpn_club=spr([ // 石像鬼王：巨石锤
"..a..a...",
".aAAAAa..",
".AAAAAAa.",
".AAaAAAa.",
"..AAAAA..",
"..knkk...",
"...kn....",
"...kn....",
"...kn....",
"...kk....",
]);
SPR.wpn_flamesword=spr([ // 炎魔：烈焰巨剑
".....oo.....",
"....oyyo....",
"....oyyo....",
"...ooyyoo...",
"...oyyyyoo..",
"...oyyyyoo..",
"..ooyyyyoo..",
"..oyyyyyyoo.",
"..oyyyyyyoo.",
"..ooyyyyoo..",
"...oEEEEo...",
"....knkn....",
"....knkn....",
".....kn.....",
".....kk.....",
]);
SPR.wpn_brush=spr([ // 判官：判官笔
"..kk..",
".kkkk.",
".kkkk.",
"..kk..",
"..EE..",
"..nn..",
"..nn..",
"..nn..",
"..nn..",
"..nn..",
"..nn..",
"..nn..",
"..nn..",
"..nn..",
"..EE..",
]);
SPR.wpn_staff=spr([ // 混沌魔神：混沌法杖
"..pppp..",
".ppwwpp.",
".pwPPwp.",
".ppwwpp.",
"..pppp..",
"...PP...",
"...PP...",
"...PP...",
"...PP...",
"...PP...",
"...PP...",
"...PP...",
"...PP...",
"...PP...",
"...PP...",
]);

// 给敌人/Boss/NPC 统一描边（在全部精灵定义完成后调用）
function outlineAllSprites(){
  for(const k of Object.keys(SPR)){
    if(/^(e_|b_|n_)/.test(k)) SPR[k]=outlined(SPR[k]);
  }
}
outlineAllSprites();

function buildTileArt(){
  for(const th of ['sky','cave','hell','temple','chaos']){
    TILE_ART[th]={ ground:[makeTile(th,0),makeTile(th,1)], plat:makePlat(th),
      spikesUp:makeSpikes(false), spikesDown:makeSpikes(true),
      lava:[makeLava(0),makeLava(1)] };
  }
  TILE_ART.gateOpen=makeGate(true);
  TILE_ART.gateSealed=makeGate(false);
  TILE_ART.lampOn=makeLamp(true);
  TILE_ART.lampOff=makeLamp(false);
}
