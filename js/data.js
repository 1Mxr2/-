'use strict';
/* ============================================================
 * data.js — 武器 / 敌人 / 神仙 / 关卡数据
 * 图块字符: '.'空 '#'实体 '='单向平台 '^'尖刺 '~'岩浆
 * 实体字符: P玩家 G门 Z Boss F存档点 H心 M心之容器
 *           f飞剑 b圣光弩
 *           A回春 B疾风 C神佑 D忘忧 E金刚
 *           1小恶魔 2石像鬼 3骷髅弓手 4地狱犬 5天兵
 *           6鬼火 7牛头 8马面 9蜘蛛妖 0堕落天使 i冰霜妖灵
 * ============================================================ */

// ---------- 地图构建器 ----------
function buildMap(w,h,fn){
  const g=[]; for(let y=0;y<h;y++) g.push(new Array(w).fill('.'));
  const api={
    put(x,y,c){ if(y>=0&&y<h&&x>=0&&x<w) g[y][x]=c; },
    rect(x1,y1,x2,y2,c){ c=c||'#'; for(let y=y1;y<=y2;y++) for(let x=x1;x<=x2;x++) api.put(x,y,c); },
    ground(x1,x2,top,c){ api.rect(x1,top,x2,h-1,c||'#'); },
    carve(x1,y1,x2,y2){ api.rect(x1,y1,x2,y2,'.'); },
    plat(x1,x2,y){ for(let x=x1;x<=x2;x++) api.put(x,y,'='); },
    spikes(x1,x2,y){ for(let x=x1;x<=x2;x++) api.put(x,y,'^'); },
    lava(x1,x2,top){ for(let y=top;y<h;y++) for(let x=x1;x<=x2;x++) api.put(x,y,'~'); },
  };
  fn(api);
  return g.map(r=>r.join(''));
}

// 每关的两条命包含正在使用的一条；回血道具不增加上限。
const PLAYER_RULES={lives:2,hearts:3,hurtGrace:1.25,respawnGrace:2};

// ---------- 武器：只有初始青铜剑可斩落弹幕，元素刀以特效/伤害换取输出 ----------
const WEAPONS=[
  {id:'sword',     name:'青铜剑',   slot:1, cd:0.36, kind:'melee', dmg:3, range:28},
  {id:'flysword',  name:'飞剑',     slot:2, cd:0.52, kind:'proj',  dmg:2, speed:255, pierce:2, life:0.95, spr:'p_flysword', pw:12, ph:4},
  {id:'bow',       name:'圣光弩',   slot:3, cd:0.25, kind:'proj',  dmg:1, speed:310, life:1.05, spr:'p_arrow', pw:8, ph:3},
  {id:'thunder',   name:'雷霆之刃', slot:4, cd:0.68, kind:'melee', dmg:4, range:24, elem:'thunder', spr:'wicon_thunder'},
  {id:'flameblade',name:'炎狱双刃', slot:5, cd:0.44, kind:'melee', dmg:2, range:27, elem:'fire', spr:'wicon_flame'},
];

// ---------- 敌人图鉴 ----------
const ENEMY_TYPES={
  '1':{name:'小恶魔',   hp:2, w:12,h:11, behavior:'jumper',  speed:42, contact:1, proj:'fire',  projCd:2.6, spr:'e_imp'},
  '2':{name:'石像鬼',   hp:3, w:14,h:12, behavior:'diver',   contact:1, spr:'e_gargoyle'},
  '3':{name:'骷髅弓手', hp:2, w:12,h:13, behavior:'shooter', proj:'arrow', projCd:1.9, range:175, spr:'e_skeleton', w2:12,h2:13},
  '4':{name:'地狱犬',   hp:3, w:15,h:10, behavior:'chaser',  speed:68, contact:1, effect:'burn', skill:'pounce', skillCd:3.8, spr:'e_hound'},
  '5':{name:'天兵',     hp:3, w:12,h:14, behavior:'guard',   speed:30, contact:1, spr:'e_soldier'},
  '6':{name:'鬼火',     hp:2, w:9, h:9,  behavior:'floater', speed:32, contact:1, skill:'lightBurst', skillCd:4.0, spr:'e_ghostfire', noGravity:true, ghost:true},
  '7':{name:'牛头',     hp:5, w:15,h:14, behavior:'charger', speed:26, chargeSpeed:165, contact:1, spr:'e_cowhead'},
  '8':{name:'马面',     hp:3, w:13,h:14, behavior:'shooter', proj:'bone', projCd:2.3, range:190, arc:true, spr:'e_horseface'},
  '9':{name:'蜘蛛妖',   hp:2, w:13,h:8,  behavior:'walker',  speed:40, contact:1, effect:'poison', skill:'poisonFan', skillCd:3.6, spr:'e_spider'},
  '0':{name:'堕落天使', hp:3, w:14,h:13, behavior:'swooper', proj:'light', projCd:2.6, spr:'e_angel', noGravity:true},
  'i':{name:'冰霜妖灵', hp:2, w:12,h:13, behavior:'shooter', proj:'ice', projCd:2.1, range:165, spr:'e_ice', effect:'slow'},
};

// ---------- Boss 图鉴（hp=每管血量；bars=血条数；scale=绘制/碰撞倍率，难度逐关递增） ----------
const BOSSES={
  garg:  {name:'石像鬼王',        hp:60, bars:2, w:24,h:18, scale:2, hoverHeight:62, spr:'b_garg',  fly:true},
  spider:{name:'蛛母 · 千目',     hp:80, bars:2, w:22,h:14, scale:2, hoverHeight:70, spr:'b_spider'},
  judge: {name:'判官 · 笔墨无情', hp:100,bars:2, w:16,h:20, scale:2, hoverHeight:60, spr:'b_judge'},
  flame: {name:'炎魔 · 焚世',     hp:125,bars:2, w:24,h:24, scale:2, hoverHeight:64, spr:'b_flame'},
  chaos: {name:'混沌魔神',        hp:110,bars:3, w:24,h:24, scale:2, hoverHeight:68, spr:'b_chaos'},
};

// 越靠后的关卡，反击窗口/空闲间隔越短；升空更快，但蓄力始终可读。
const BOSS_PACE={
  garg:  {recover:1.08,gap:0.46,windup:0.98,lift:100,move:110},
  spider:{recover:1.02,gap:0.39,windup:0.95,lift:116,move:120},
  judge: {recover:0.96,gap:0.32,windup:0.92,lift:132,move:130},
  flame: {recover:0.90,gap:0.25,windup:0.89,lift:148,move:140},
  chaos: {recover:0.84,gap:0.18,windup:0.86,lift:164,move:152},
};

// 技能池按阶段解锁；每轮洗牌、不连续重复。数值是蓄力秒数。
const BOSS_MOVES={
  garg:[['tele',0.8,'锁地俯冲','离开红线，落地后反击'],['volley',0.75,'碎石扇射','跳跃或挥剑挡弹'],['faultPre',0.95,'裂地石脊','离开红圈中的石脊'],['rainPre',1.05,'落石阵','走到石雨间隙',2],['roar',0.85,'震地双波','跳过地面冲击波',2]],
  spider:[['poisonPre',0.8,'毒液扇射','移开或挥剑挡弹'],['webPre',0.8,'缚足蛛网','横移躲开锁定方向'],['summonPre',0.9,'孵化幼蛛','优先清理幼蛛'],['swoopPre',0.85,'蛛影扑击','离开红线，等待扑空'],['weavePre',1.0,'交织毒幕','留在毒幕的空隙'],['venomPre',1.25,'万毒天降','避开标记落点',2],['webrPre',0.9,'天罗蛛网','闪避穿过蛛网',2]],
  judge:[['inkfan',0.8,'判命墨扇','挥剑挡墨或横移'],['pillarPre',0.95,'墨柱封印','离开地面红圈'],['dashPre',0.85,'执笔横斩','跳跃或神行穿过'],['summon',0.95,'召引鬼火','清理鬼火后反击'],['sealPre',1.0,'生死判印','判印两侧都有空隙'],['inkcross',0.9,'万墨归宗','从墨弹间隙穿过',2],['blinkPre',0.9,'墨影闪斩','现身还会蓄力，准备闪避',2]],
  flame:[['slamPre',0.95,'地火喷涌','离开地面红圈'],['hurlPre',0.8,'双焰投掷','横移或挥剑挡弹'],['furnacePre',1.1,'熔炉爆发','红圈间留有安全区'],['fanPre',0.85,'烈焰风暴','横移或神行闪避',2],['dashPre',0.95,'魔焰冲锋','跳跃避开冲锋路线',2],['meteorPre',1.1,'陨火连坠','避开标记落点',2],['infernoPre',0.95,'炼狱火环','穿过火球间隙',2]],
  chaos:[['ringPre',0.85,'八方光环','穿过光弹间隙',1,1],['triplePre',0.8,'三重光矢','离开锁定方向',1,1],['divePre',0.9,'混沌俯冲','离开红线，等待扑空',1,1],['riftPre',1.1,'时空裂隙','闪出裂隙后反击'],['inkRainPre',0.9,'墨浪倾泻','移动或挥剑挡弹',2],['summonPre',1.0,'召魂法阵','先清理追来的鬼火',2],['orbPre',0.95,'噬魂灵珠','诱导后闪避，灵珠会停止追踪',2],['tpOut',1.0,'虚空瞬斩','现身后再闪避横斩',2],['nova',1.15,'混沌新星','穿过弹幕间隙',3]],
};

// 同一技能连续多轮，每轮单独预警并锁定落点；只会扣一滴血。
const BOSS_PATTERNS={
  shatterPre:   {kind:'fan',waves:2,extraPhase:2,interval:0.82,count:5,spread:0.24,speed:178,spr:'p_shard'},
  stoneMarchPre:{kind:'pillars',waves:2,extraPhase:2,interval:0.86,offsets:[-42,0,42],shift:18,width:14,height:34,col:'stone'},
  webSpiralPre: {kind:'ring',waves:2,extraPhase:2,interval:0.83,count:10,speed:145,spr:'p_web',effect:'slow'},
  toxicLoomPre: {kind:'rain',waves:2,extraPhase:2,interval:0.86,offsets:[-60,-30,0,30,60],shift:15,speed:155,spr:'p_poison',effect:'poison'},
  verdictPre:   {kind:'pillars',waves:3,interval:0.76,offsets:[0],shift:0,width:26,height:58,col:'ink'},
  inkCagePre:   {kind:'pillars',waves:2,extraPhase:2,interval:0.8,offsets:[-72,-36,0,36,72],shift:18,width:12,height:56,col:'ink'},
  eruptionPre: {kind:'pillars',waves:3,interval:0.79,offsets:[-72,-36,0,36,72],shift:18,width:12,height:46,col:'fire'},
  cinderRainPre:{kind:'rain',waves:3,interval:0.79,offsets:[-90,-60,-30,0,30,60,90],shift:15,speed:185,spr:'p_fire',effect:'burn'},
  starfallPre: {kind:'rain',waves:3,extraPhase:3,interval:0.76,offsets:[-90,-60,-30,0,30,60,90],shift:15,speed:198,spr:'p_light',fan:3},
  eclipsePre:  {kind:'ring',waves:3,extraPhase:3,interval:0.74,count:14,speed:174,spr:'p_ink',effect:'curse'},
};
BOSS_MOVES.garg.push(['shatterPre',0.85,'碎岩连射','连续瞄准：移动或挥剑挡弹'],['stoneMarchPre',0.95,'逐浪石脊','石脊连发：每轮移出红圈',2]);
BOSS_MOVES.spider.push(['webSpiralPre',0.9,'回旋蛛网','多轮网环：从间隙穿过'],['toxicLoomPre',1.0,'毒雨交织','落点交替：留意下一轮红圈',2]);
BOSS_MOVES.judge.push(['verdictPre',0.92,'三重追判','连续三判：红圈锁定后移动'],['inkCagePre',1.0,'墨牢合围','墨柱交错：走进柱间空隙',2]);
BOSS_MOVES.flame.push(['eruptionPre',0.95,'焚地连爆','连续地火：观察红圈再换位'],['cinderRainPre',1.0,'交错火雨','火雨三轮：闪避或挥剑挡弹',2]);
BOSS_MOVES.chaos.push(['starfallPre',0.98,'星陨连锁','落星夹击：移位并斩落光弹'],['eclipsePre',1.0,'阴阳双轮','旋转弹环：穿过缺口或神行',2]);

// 全高度覆场招式：一阶段偶发，二阶段起每隔两、三招交替施放。
const BOSS_OVERLOADS={
  spider:{name:'万毒封场',radius:166,margin:34,cooldown:21,color:'#7cd870',dark:'#275632',core:'#d7ffac',spr:'p_poison'},
  judge: {name:'墨狱天罚',radius:172,margin:38,cooldown:20,color:'#bc86ed',dark:'#422458',core:'#ecdbff',spr:'p_ink'},
  flame: {name:'焚界爆发',radius:178,margin:42,cooldown:19,color:'#ffac52',dark:'#ae382c',core:'#fff4b2',spr:'p_fire'},
  chaos: {name:'混沌灭界',radius:194,margin:46,cooldown:18,color:'#ffe19a',dark:'#685493',core:'#fffbed',spr:'p_light'},
};
for(const [type,cfg] of Object.entries(BOSS_OVERLOADS)){
  BOSS_MOVES[type].push(['overloadPre',1.4,cfg.name,'不可挡 / 跳跃无效：连续神行离开红圈']);
}
for(const moves of Object.values(BOSS_MOVES)){
  for(const move of moves){
    move[3]=move[3].replace(/挥剑挡弹/g,'青铜剑挡弹').replace(/挥剑挡墨/g,'青铜剑挡墨');
    if(move[0]==='starfallPre')move[3]='落星夹击：移位或用青铜剑挡光弹';
  }
}

// ---------- 友方神仙 / 妖怪 ----------
const NPC_TYPES={
  A:{name:'药童',     spr:'n_heal',  buff:'heal',
     lines:['小侠留步！','这葫芦里的九转还魂丹，就送你了。'],
     bye:'仙丹只能赠一次，快去降妖吧！',
     toast:'回春：回复 1 颗心，解除所有异常！'},
  B:{name:'风灵',     spr:'n_wind',  buff:'speed',
     lines:['呼——呼——','借你一阵罡风，跑快些！'],
     bye:'罡风已借，剩下的路你自己跑！',
     toast:'疾风：移速提升，并获得二段跳（12 秒）'},
  C:{name:'土地公',   spr:'n_earth', buff:'shield',
     lines:['老朽乃此山土地。','这层护体神光，可替你挡下三次伤害。'],
     bye:'神光已护你，老朽在此等你凯旋。',
     toast:'神佑：获得 3 层护盾'},
  D:{name:'孟婆',     spr:'n_meng',  buff:'mengpo',
     lines:['孩子，饮下这碗忘忧汤吧。','忘却伤痛，百邪不侵。'],
     bye:'汤只此一碗，前路好走。',
     toast:'忘忧汤：回满心，无敌 6 秒！'},
  E:{name:'金刚力士', spr:'n_power', buff:'power',
     lines:['好胆色，凡人！','尝尝这金刚之力，打得他们屁滚尿流！'],
     bye:'力气已给你，去把他们打上天！',
     toast:'金刚之力：攻击翻倍（12 秒）'},
};

// ---------- 异常/增益效果元数据 ----------
const EFFECT_META={
  poison:   {name:'中毒', icon:'ui_poison', color:'#4fb84f', bad:true},
  burn:     {name:'灼烧', icon:'ui_burn',   color:'#f08020', bad:true},
  slow:     {name:'寒冰', icon:'ui_slow',   color:'#7fdce8', bad:true},
  curse:    {name:'诅咒', icon:'ui_curse',  color:'#9a4fd8', bad:true},
  speed:    {name:'疾风', icon:'ui_speed',  color:'#7fdce8', bad:false},
  power:    {name:'金刚', icon:'ui_power',  color:'#d84040', bad:false},
  invincible:{name:'无敌', icon:'ui_star',  color:'#f8d838', bad:false},
};

// ---------- 投射物图鉴 ----------
const PROJ_TYPES={
  fire:   {spr:'p_fire',    w:7,h:7,  speed:120, grav:0,   dmg:1, life:3},
  arrow:  {spr:'p_arrow',   w:8,h:3,  speed:190, grav:0,   dmg:1, life:3},
  bone:   {spr:'p_bone',    w:8,h:4,  speed:150, grav:420, dmg:1, life:4},
  ice:    {spr:'p_ice',     w:6,h:6,  speed:130, grav:0,   dmg:1, life:3, effect:'slow'},
  light:  {spr:'p_light',   w:4,h:10, speed:150, grav:0,   dmg:1, life:3},
  ink:    {spr:'p_ink',     w:7,h:7,  speed:120, grav:60,  dmg:1, life:4, effect:'curse'},
  web:    {spr:'p_web',     w:8,h:8,  speed:170, grav:0,   dmg:1, life:3, effect:'slow'},
  poison: {spr:'p_poison',  w:7,h:7,  speed:110, grav:260, dmg:1, life:4, effect:'poison'},
  shard:  {spr:'p_shard',   w:5,h:5,  speed:140, grav:400, dmg:1, life:2},
  orb:    {spr:'p_ink',     w:8,h:8,  speed:80,  grav:0,   dmg:1, life:5},
};

/* ============================================================
 * 关卡定义
 * ============================================================ */
const LEVELS=[
  // ---------- 第一关 · 云海天梯 ----------
  {
    name:'云海天梯', theme:'sky', boss:'garg',
    signs:[{x:3,y:12,t:'J 攻击 · 按住↑+J 上打'},{x:12,y:12,t:'→ 一路向右闯关'},{x:23,y:11,t:'小恶魔会喷火球！'},{x:47,y:11,t:'按 E 与神仙交谈得增益'},{x:60,y:11,t:'石像鬼会俯冲，↑+J 打它！'},{x:96,y:11,t:'前方 BOSS：石像鬼王！'},{x:110,y:11,t:'击败BOSS才能开门！'}],
    sub:'天界外域 · 东方天庭与西方魔物在此交战',
    tip:'每关两条命 · 每命三滴血 · L/Shift 神行闪避 · 红圈亮起时准备躲避',
    npcSkin:{},
    map:buildMap(120,17,a=>{
      a.ground(0,14,13);
      a.ground(20,31,12);
      a.ground(44,73,12);
      a.ground(94,119,12);
      a.rect(118,0,119,11);
      a.plat(16,19,11); a.plat(24,27,9); a.plat(33,35,11); a.plat(38,40,9);
      a.plat(49,51,9);  a.plat(74,76,11); a.plat(78,80,9); a.plat(84,86,8);
      a.plat(88,91,10);
      a.put(2,12,'P'); a.put(6,12,'A'); a.put(13,12,'5');
      a.put(24,11,'1'); a.put(28,11,'1');
      a.put(25,8,'H'); a.put(39,8,'B'); a.put(50,8,'f');
      a.put(34,10,'1'); a.put(47,11,'2'); a.put(54,11,'5'); a.put(58,11,'1');
      a.put(61,11,'F'); a.put(65,11,'1'); a.put(69,11,'3'); a.put(76,10,'2');
      a.put(85,7,'H'); a.put(89,9,'2'); a.put(94,11,'1');
      a.put(97,11,'1'); a.put(101,11,'2'); a.put(105,11,'3');
      a.put(113,11,'Z'); a.put(117,11,'G');
    }),
  },
  // ---------- 第二关 · 幽冥洞窟 ----------
  {
    name:'幽冥洞窟', theme:'cave', boss:'spider',
    signs:[{x:5,y:12,t:'按 E 交谈：土地公赠护盾'},{x:60,y:12,t:'毒液与蛛网会让人迟缓中毒'},{x:100,y:12,t:'BOSS：蛛母 · 千目'}],
    sub:'地脉深处 · 蛛网盘踞，寒气蚀骨',
    tip:'小心尖刺与毒蛛！好神仙会赠你神秘之力',
    npcSkin:{},
    map:buildMap(120,17,a=>{
      a.rect(0,0,119,1);
      a.ground(0,119,13);
      a.rect(44,13,47,15,'.');
      a.rect(44,16,47,16,'#');
      a.spikes(44,47,15);
      a.spikes(20,22,2); a.spikes(60,62,2); a.spikes(92,94,2);
      a.plat(20,24,10); a.plat(32,35,10); a.plat(48,51,10);
      a.plat(53,55,11); a.plat(56,59,8);
      a.plat(66,69,10); a.plat(86,89,10); a.plat(94,97,10);
      a.put(2,12,'P'); a.put(8,12,'C'); a.put(12,12,'9');
      a.put(16,12,'9'); a.put(26,12,'3'); a.put(29,12,'3');
      a.put(22,9,'H'); a.put(33,9,'H'); a.put(34,9,'l');
      a.put(36,12,'i'); a.put(41,12,'9');
      a.put(50,9,'3'); a.put(52,12,'3');
      a.put(58,7,'b'); a.put(57,12,'9'); a.put(62,12,'9');
      a.put(68,9,'H'); a.put(72,12,'2'); a.put(76,12,'9');
      a.put(82,12,'3'); a.put(87,9,'H'); a.put(90,12,'i');
      a.put(96,9,'M'); a.put(98,12,'F'); a.put(100,12,'i');
      a.put(104,12,'9'); a.put(110,12,'Z'); a.put(116,12,'G');
      a.rect(118,2,119,12);
    }),
  },
  // ---------- 第三关 · 炼狱十八层 ----------
  {
    name:'炼狱十八层', theme:'hell', boss:'judge',
    signs:[{x:17,y:12,t:'小心岩浆！接触会灼烧'},{x:114,y:12,t:'BOSS：判官 · 会瞬移召唤'}],
    sub:'幽冥鬼府 · 岩浆翻滚，恶鬼索命',
    tip:'灼烧与诅咒缠身时，快去找好神仙净化！',
    npcSkin:{},
    map:buildMap(130,17,a=>{
      a.ground(0,19,13); a.lava(20,25,14); a.plat(21,23,11);
      a.ground(26,45,13);
      a.lava(46,51,14); a.plat(47,49,11);
      a.ground(52,70,13);
      a.rect(71,13,72,16,'.'); a.lava(71,72,14);
      a.ground(73,85,13);
      a.lava(86,92,14); a.plat(87,88,11); a.plat(90,91,9);
      a.ground(93,129,13);
      a.rect(128,0,129,12);
      a.put(2,12,'P'); a.put(10,12,'H'); a.put(14,12,'4'); a.put(18,12,'4');
      a.put(26,12,'4'); a.put(30,12,'4'); a.put(34,12,'6'); a.put(40,12,'7'); a.put(44,12,'8');
      a.plat(56,58,10);
      a.plat(61,63,9); a.put(62,8,'H'); a.put(63,8,'g');
      a.put(54,12,'6'); a.put(60,12,'4'); a.put(64,12,'8'); a.put(68,12,'6');
      a.put(74,12,'F'); a.put(78,12,'7'); a.put(82,12,'8');
      a.put(88,10,'6'); a.put(93,12,'7'); a.put(96,12,'6'); a.put(100,12,'4'); a.put(104,12,'7');
      a.put(108,12,'8'); a.put(112,12,'4');
      a.put(116,12,'D'); a.put(119,12,'H');
      a.put(122,12,'Z'); a.put(126,12,'G');
    }),
  },
  // ---------- 第四关 · 圣殿遗迹 ----------
  {
    name:'圣殿遗迹', theme:'temple', boss:'flame',
    signs:[{x:31,y:12,t:'堕落天使会俯冲射击'},{x:106,y:12,t:'BOSS：炎魔 · 焚世'}],
    sub:'西天神域 · 堕落天使与炎魔盘踞的圣所',
    tip:'西方的神明……也未必都是善类。',
    npcSkin:{ C:{name:'治愈天使', spr:'n_angel', lines:['愿圣光庇佑你，勇敢的凡人。','这层圣光护盾，能挡下三次伤害。'] } },
    map:buildMap(120,17,a=>{
      a.ground(0,24,13);
      a.plat(26,27,11);
      a.ground(29,52,13);
      a.plat(35,37,11); a.plat(39,41,9); a.plat(54,55,10);
      a.ground(57,80,13);
      a.ground(81,100,13);
      a.plat(102,103,11);
      a.ground(101,119,13);
      a.rect(118,0,119,12);
      a.put(2,12,'P'); a.put(10,12,'C'); a.put(18,12,'0'); a.put(22,12,'1'); a.put(24,12,'1');
      a.put(31,12,'2'); a.put(32,12,'2'); a.put(36,12,'1');
      a.put(40,8,'H');
      a.put(42,12,'0'); a.put(46,12,'3');
      a.put(57,12,'0'); a.put(60,12,'1'); a.put(64,12,'2'); a.put(68,12,'4'); a.put(74,12,'0');
      a.put(79,12,'M');
      a.put(83,12,'F'); a.put(86,12,'0'); a.put(90,12,'2'); a.put(94,12,'1'); a.put(99,12,'2');
      a.put(97,12,'H');
      a.put(111,12,'Z'); a.put(116,12,'G');
    }),
  },
  // ---------- 第五关 · 神魔之巅 ----------
  {
    name:'神魔之巅', theme:'chaos', boss:'chaos',
    signs:[{x:55,y:11,t:'最终决战！集齐神兵'},{x:120,y:11,t:'决战场地 · 前方混沌魔神'},{x:143,y:11,t:'BOSS：混沌魔神'}],
    sub:'混沌王座 · 东西方神魔的最终决战',
    tip:'击败混沌魔神，封神榜上将留下你的名字！',
    npcSkin:{},
    map:buildMap(180,17,a=>{
      a.ground(0,18,13);
      a.plat(20,22,11); a.plat(25,27,9); a.plat(30,32,11);
      a.plat(36,38,8);  a.plat(42,44,11); a.plat(48,51,10);
      a.ground(54,74,12);
      a.lava(75,80,13); a.plat(76,77,10); a.plat(79,80,8);
      a.ground(81,104,12);
      a.plat(106,109,10); a.plat(112,115,8); a.plat(118,121,11);
      // 58 格连续战斗地面：实际可用宽 924px，是原 284px 的 3.25 倍。
      a.ground(120,179,12);
      a.rect(178,0,179,11);
      a.put(2,12,'P'); a.put(8,12,'H'); a.put(12,12,'1'); a.put(14,12,'1');
      a.put(21,10,'3'); a.put(22,10,'3'); a.put(26,8,'9'); a.put(31,10,'4'); a.put(32,10,'4');
      a.put(37,7,'H'); a.put(43,10,'0'); a.put(49,9,'2'); a.put(50,9,'1');
      a.put(55,11,'7'); a.put(58,11,'7'); a.put(62,11,'8'); a.put(66,11,'i');
      a.put(70,11,'6'); a.put(72,11,'F');
      a.put(84,11,'4'); a.put(86,11,'4'); a.put(88,11,'9'); a.put(92,11,'3');
      a.put(96,11,'2'); a.put(100,11,'1'); a.put(102,11,'E');
      a.put(107,9,'6'); a.put(113,7,'0'); a.put(119,10,'4'); a.put(126,11,'0');
      a.put(122,11,'F');
      a.put(144,11,'Z'); a.put(175,11,'G');
    }),
  },
];
