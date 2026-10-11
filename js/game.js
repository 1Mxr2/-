'use strict';
/* ============================================================
 * game.js — 神魔远征 引擎主程序
 * ============================================================ */

const CVS=document.getElementById('game');
const CTX=CVS.getContext('2d',{alpha:false,desynchronized:true});
CTX.imageSmoothingEnabled=false;
const W=480, H=270, TILE=16;
const RS=2;                       // 渲染倍率：960x540 背板，文字与描边更清晰
const GRAV=830;
// 神行可穿过敌人和弹幕，墙体仍阻挡；方向在按下时锁定。
const DASH_SKILL={distance:60,duration:0.18,cooldown:4.5,speed:60/0.18,invDuration:0.3,slots:3};

// 整数倍缩放适配窗口（保证像素锐利）
function fitCanvas(){
  const s=Math.max(1,Math.floor(Math.min(window.innerWidth/(W*RS),window.innerHeight/(H*RS))));
  CVS.style.width=(W*RS*s)+'px';
  CVS.style.height=(H*RS*s)+'px';
}
window.addEventListener('resize',fitCanvas);
fitCanvas();

buildTileArt(); // 生成图块缓存

/* ---------------- 输入 ---------------- */
const keys={}, pressed={};
window.addEventListener('keydown',e=>{
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code)) e.preventDefault();
  if(!e.repeat){ pressed[e.code]=true; }
  keys[e.code]=true;
  ensureAudio();
});
window.addEventListener('keyup',e=>{ keys[e.code]=false; });
if(CVS.addEventListener) CVS.addEventListener('click',e=>{
  const r=CVS.getBoundingClientRect();
  const x=(e.clientX-r.left)/r.width*W, y=(e.clientY-r.top)/r.height*H;
  if(game.state!=='title') return;
  if(game.titleMode){
    if(x<W/2-150||x>W/2+150) return;
    if(y>=91&&y<121){ game.titleModeSel=0; SFX.pickup(); }
    else if(y>=121&&y<151){ game.titleModeSel=1; SFX.pickup(); }
    else if(y>=157&&y<187) startSelectedMode();
    return;
  }
  if(game.titleSet||game.titleHelp) return;
  if(y>=162&&y<182){ game.titleMenu=0; openModeSelect(); }
  else if(y>=182&&y<202){ game.titleMenu=1; game.titleSet=true; SET_SEL=0; }
  else if(y>=202&&y<222){ game.titleMenu=2; game.titleHelp=true; }
});
// 无分配版本的按键查询（每帧调用数十次，避免临时数组引发 GC）
function down(a,b,c){ return !!(keys[a]||(b&&keys[b])||(c&&keys[c])); }
function hit(a,b,c){ return !!(pressed[a]||(b&&pressed[b])||(c&&pressed[c])); }

/* ---------------- 音效（WebAudio 合成） ---------------- */
let AC=null, muted=false, master=null;
function ensureAudio(){
  if(!AC){
    try{
      AC=new (window.AudioContext||window.webkitAudioContext)();
      master=AC.createGain();
      master.gain.value=muted?0:(SET.vol/100)*0.9;
      master.connect(AC.destination);
    }catch(e){}
  }
  if(AC&&AC.state==='suspended') AC.resume();
}
// 同名音效最小间隔（毫秒）：连续命中时不轰炸耳朵、不堆积音频节点
const _sfxLast={};
function gate(name,ms){ const t=performance.now(); if(_sfxLast[name]&&t-_sfxLast[name]<ms) return false; _sfxLast[name]=t; return true; }

function tone(f0,f1,dur,type,vol,delay){
  if(!AC||muted) return;
  const t0=AC.currentTime+(delay||0);
  const o=AC.createOscillator(), g=AC.createGain();
  o.type=type||'square';
  o.frequency.setValueAtTime(f0,t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(1,f1||f0),t0+dur);
  g.gain.setValueAtTime(vol||0.12,t0);
  g.gain.exponentialRampToValueAtTime(0.001,t0+dur);
  o.connect(g); g.connect(master||AC.destination);
  o.start(t0); o.stop(t0+dur+0.02);
}
const SFX={
  jump(){ if(!gate('jump',120)) return; tone(280,520,0.13,'square',0.07); },
  attack(){ if(!gate('atk',80)) return; tone(240,140,0.07,'square',0.06); },
  shoot(){ if(!gate('shoot',70)) return; tone(760,900,0.07,'triangle',0.06); },
  hitEnemy(){ if(!gate('hit',60)) return; tone(620,860,0.045,'triangle',0.05); },
  hurt(){ tone(140,60,0.28,'sawtooth',0.14); },
  pickup(){ tone(660,660,0.08,'square',0.09); tone(990,990,0.1,'square',0.09,0.08); },
  buff(){ tone(523,523,0.1,'triangle',0.1); tone(659,659,0.1,'triangle',0.1,0.1); tone(784,784,0.16,'triangle',0.1,0.2); },
  debuff(){ if(!gate('debuff',300)) return; tone(300,120,0.3,'sawtooth',0.09); },
  die(){ tone(400,70,0.5,'sawtooth',0.13); },
  explode(){ if(!gate('boom',120)) return; tone(120,40,0.35,'square',0.14); },
  roar(){ tone(90,45,0.5,'sawtooth',0.16); },
  gate(){ tone(392,392,0.12,'triangle',0.1); tone(523,523,0.12,'triangle',0.1,0.12); tone(659,659,0.2,'triangle',0.1,0.24); },
  check(){ tone(784,784,0.1,'triangle',0.09); tone(1046,1046,0.14,'triangle',0.09,0.1); },
};

/* ---------------- 工具 ---------------- */
const rand=(a,b)=>a+Math.random()*(b-a);
const clamp=(v,a,b)=>v<a?a:(v>b?b:v);
const lerp=(a,b,t)=>a+(b-a)*t;
function overlap(a,b){ return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y; }
function dist(ax,ay,bx,by){ return Math.hypot(bx-ax,by-ay); }

/* ---------------- 全局状态 ---------------- */
const game={
  state:'title',      // title | intro | play | clear | dead | gameover | win
  lv:0, lives:PLAYER_RULES.lives, deaths:0, playTime:0, stateT:0,
  dialog:null, shake:0, flash:0, frame:0,
  mode:window.GOD_MODE?'coward':'brave', god:!!window.GOD_MODE, bossBannerT:0,
  titleSet:false, titleSel:0, titleMenu:0, titleHelp:false, titleMode:false,
  titleModeSel:window.GOD_MODE?1:0, settingsOpen:false,
};

/* ---------------- 本地设置（暂停/标题菜单可调，localStorage 保存） ---------------- */
let SET={vol:70,dmg:0,god:0,track:0}; // dmg/god/track: 0=未设置
try{ const s=JSON.parse(localStorage.getItem('myth_settings')||'null'); if(s) SET=Object.assign(SET,s); }catch(e){}
SET.track=musicTrackIndex(SET.track);
SET.vol=Number.isFinite(SET.vol)?clamp(SET.vol,0,100):70;
if(window.GOD_MODE){ game.mode='coward'; game.god=true; window.DMG_MULT=window.DMG_MULT||5; }
else { game.mode='brave'; game.god=false; window.DMG_MULT=1; }
let SET_SEL=0;
function saveSet(){ try{ localStorage.setItem('myth_settings',JSON.stringify(SET)); }catch(e){} }
function goTitle(){
  game.paused=false; game.settingsOpen=false; game.state='title'; game.titleSet=false; game.titleHelp=false; game.titleMode=false;
  game.titleModeSel=game.mode==='coward'?1:0; game.dialog=null;
  toasts.length=0;
}
function applyMode(mode){
  game.mode=window.GOD_MODE?'coward':mode;
  if(game.mode==='brave'){
    window.DMG_MULT=1; game.god=false;
  }else{
    window.DMG_MULT=window.GOD_MODE?Math.max(5,window.DMG_MULT||5):(SET.dmg||1);
    game.god=window.GOD_MODE||SET.god===1;
  }
  SET.dmg=window.DMG_MULT; SET.god=game.god?1:-1; saveSet();
}
function openModeSelect(){
  game.titleMode=true; game.titleModeSel=game.mode==='coward'?1:0; game.titleSet=false; game.titleHelp=false; SFX.pickup();
}
function startSelectedMode(){
  applyMode(game.titleModeSel===1?'coward':'brave');
  game.titleMode=false; resetRun(); startLevel(game.titleSel||0);
}
function adjustSettings(dir){
  if(SET_SEL===0){ SET.vol=clamp(SET.vol+dir*10,0,100); if(master) master.gain.setTargetAtTime(muted?0:(SET.vol/100)*0.9,AC.currentTime,0.02); }
  else if(SET_SEL===1){ SET.track=(musicTrackIndex(SET.track)+dir+MUS_NAMES.length)%MUS_NAMES.length; }
  else if(SET_SEL===2){
    if(game.mode==='brave'){ window.DMG_MULT=1; return; }
    const opts=[1,3,5,10];
    let i=opts.indexOf(window.DMG_MULT||1); if(i<0)i=0;
    window.DMG_MULT=opts[clamp(i+dir,0,3)];
  }
  else if(SET_SEL===3){ if(game.mode==='coward') game.god=!game.god; else game.god=false; }
  SET.dmg=window.DMG_MULT||1; SET.god=game.god?1:-1; SET.track=SET.track||0;
  saveSet(); SFX.pickup();
}
function settingsRows(){
  const brave=game.mode==='brave';
  return [
    ['音量',SET.vol+'%'],
    ['曲目',(SET.track+1)+'/'+MUS_NAMES.length+' '+MUS_NAMES[SET.track]],
    ['伤害倍率',brave?'×1（锁定）':'×'+(window.DMG_MULT||1)],
    ['无敌模式',brave?'关（锁定）':(game.god?'开':'关')],
    ['回到主界面','▶'],
  ];
}
function drawSettingsPanel(closeHint){
  const rows=settingsRows();
  CTX.fillStyle='rgba(8,8,18,0.9)';
  CTX.fillRect(W/2-128,H/2-88,256,202);
  CTX.strokeStyle='#c89820'; CTX.lineWidth=1;
  CTX.strokeRect(W/2-127.5,H/2-87.5,255,201);
  txt('设  置 · '+(game.mode==='brave'?'勇者模式':'懦夫模式'),W/2,H/2-62,'#f8f8f8',12,'center',true);
  rows.forEach((row,i)=>{
    const y=H/2-26+i*21, sel=i===SET_SEL;
    if(sel){ CTX.fillStyle='rgba(248,216,56,0.12)'; CTX.fillRect(W/2-102,y-12,204,18); }
    const act=i===4; // 动作行
    txt((sel&&act?'▶ ':sel?'▸ ':'  ')+row[0],W/2-92,y,sel?(act?'#ffe8a0':'#f8d838'):(act?'#d8b860':'#c0c0d0'),9,'left',sel);
    txt(row[1],W/2+53,y,sel?'#ffe8a0':'#aab6c8',9,'center',sel);
  });
  txt('↑↓/WS 选择   ←→/AD 调整   '+closeHint,W/2,H/2+76,'#7fdce8',8,'center',true);
  txt(MUSIC_TRACKS[SET.track].style+' · '+MUSIC_TRACKS[SET.track].bpm+' BPM',W/2,H/2+96,'#d0c5aa',8,'center');
}

/* ---------------- 操作说明面板 ---------------- */
const HELP_ROWS=[
  ['← →  /  A D','左右移动'],
  ['空格','跳跃（疾风加护时可二段跳，长按跳更高）'],
  ['J  /  Z','挥击 / 射击（仅初始青铜剑能挡敌方弹幕）'],
  ['按住 ↑  /  W','向上攻击 · 向上射击'],
  ['空中按住 ↓ / S','向下攻击 · 向下射击'],
  ['Q  /  1 - 5','切换已获得的神兵'],
  ['E','与神仙妖怪交谈，领取加护'],
  ['L / Shift','3次神行，各4.5秒；大红圈须连续冲出'],
  ['P  /  Esc','暂停 · 打开设置'],
  ['M','静音开关'],
  ['F8  /  F9','跳关 · 无敌（调试用）'],
];
function drawHelpPanel(){
  const pw=376, ph=232, px=W/2-pw/2, py=H/2-ph/2;
  CTX.fillStyle='rgba(8,8,18,0.94)'; CTX.fillRect(px,py,pw,ph);
  CTX.strokeStyle='#c89820'; CTX.lineWidth=1; CTX.strokeRect(px+0.5,py+0.5,pw-1,ph-1);
  CTX.fillStyle='rgba(248,216,56,0.10)'; CTX.fillRect(px+1,py+1,pw-2,20);
  txt('操 作 说 明',W/2,py+15,'#f8d838',12,'center',true);
  HELP_ROWS.forEach((r,i)=>{
    const y=py+36+i*15;
    if(i%2===1){ CTX.fillStyle='rgba(255,255,255,0.035)'; CTX.fillRect(px+10,y-9,pw-20,13); }
    txt(r[0],px+140,y,'#7fdce8',9,'right',true);
    txt(r[1],px+150,y,'#e8e8f4',9,'left');
  });
  CTX.fillStyle='rgba(200,152,32,0.35)'; CTX.fillRect(px+12,py+ph-21,pw-24,1);
  txt('W / S 或 ↑ ↓ 也可切换菜单项　·　'+(Math.floor(game.frame/20)%2===0?'按 H / Esc / 回车 返回':''),W/2,py+ph-8,'#ffe8a0',8,'center',true);
}
function drawModePanel(){
  const pw=320, ph=150, px=W/2-pw/2, py=H/2-ph/2;
  CTX.fillStyle='rgba(8,8,18,0.96)'; CTX.fillRect(px,py,pw,ph);
  CTX.strokeStyle='#c89820'; CTX.lineWidth=1; CTX.strokeRect(px+0.5,py+0.5,pw-1,ph-1);
  txt('选 择 征 战 模 式',W/2,py+22,'#f8d838',13,'center',true);
  const rows=[
    ['勇者模式','普通数值 ×1 · 无敌关闭'],
    ['懦夫模式','可调整伤害倍率 · 可开启无敌'],
  ];
  rows.forEach((r,i)=>{
    const y=py+55+i*31, on=i===game.titleModeSel;
    CTX.fillStyle=on?'rgba(248,216,56,0.16)':'rgba(255,255,255,0.05)';
    CTX.fillRect(px+20,y-13,pw-40,24);
    if(on){ CTX.strokeStyle='#f8d838'; CTX.strokeRect(px+20.5,y-12.5,pw-41,23); }
    txt((on?'▸ ':'')+r[0],px+34,y+1,on?'#f8d838':'#c0c0d0',10,'left',on);
    txt(r[1],px+174,y+1,on?'#ffe8a0':'#8a8a9a',8,'left');
  });
  txt('↑↓/WS 选择　回车确认　Esc 返回',W/2,py+133,'#7fdce8',8,'center',true);
}

// Music sequencing and synthesis are defined in music.js.

const VIGN=(function(){
  const c=mkcv(W,H), x=c.getContext('2d');
  const g=x.createRadialGradient(W/2,H/2,H*0.52,W/2,H/2,H*0.98);
  g.addColorStop(0,'rgba(0,0,0,0)');
  g.addColorStop(1,'rgba(4,4,14,0.4)');
  x.fillStyle=g; x.fillRect(0,0,W,H);
  return c;
})();

// 带阴影的文字
function txt(s,x,y,color,size,align,bold){
  CTX.font=(bold?'bold ':'')+size+'px "Microsoft YaHei",sans-serif';
  CTX.textAlign=align||'left';
  CTX.fillStyle='rgba(6,6,14,0.75)'; CTX.fillText(s,x+1,y+1);
  CTX.fillStyle=color; CTX.fillText(s,x,y);
}
let level=null;
const cam={x:0, y:0};
let particles=[], toasts=[], hazards=[]; // hazards: 柱阵 / 覆场爆发

/* ---------------- 玩家 ---------------- */
const player={
  x:0,y:0,w:9,h:13, vx:0,vy:0, face:1,
  hearts:PLAYER_RULES.hearts, maxHearts:PLAYER_RULES.hearts, inv:0, shield:0,
  weapons:['sword'], wi:0, cd:0,
  fx:{},                       // 状态效果
  onGround:false, coyote:0, jbuf:0, jumps:0,
  atkT:0, castT:0, atkBuf:0, swing:0, swingHit:null, aim:'fwd',
  dead:false, deadT:0, anim:0, spawn:{x:0,y:0}, safeT:0,
  dashT:0, dashCd:[0,0,0], dashSlot:-1, aimX:1, aimY:0,
};

/* ============================================================
 * 关卡构建
 * ============================================================ */
function buildLevel(idx){
  const L=LEVELS[idx];
  const grid=L.map.map(r=>r.split(''));
  const lv={
    idx, w:Math.max(...grid.map(r=>r.length)), h:grid.length, grid,
    theme:L.theme, name:L.name, sub:L.sub, tip:L.tip, npcSkin:L.npcSkin||{},
    bossType:L.boss, boss:null, bossActive:false, bossDead:false,
    enemies:[], npcs:[], pickups:[], lamps:[], gate:null,
    spawn:{x:32,y:32}, bossSeal:null,
  };
  // 路牌
  lv.signs=(L.signs||[]).map(s=>({x:s.x,y:s.y,t:s.t}));

  for(let y=0;y<lv.h;y++) for(let x=0;x<lv.w;x++){
    const c=grid[y][x];
    const px=x*TILE, py=y*TILE;
    switch(c){
      case 'P': lv.spawn={x:px+3,y:py+2}; grid[y][x]='.'; break;
      case 'G': lv.gate={x:px-4,y:py+TILE-40,w:24,h:40,open:false}; grid[y][x]='.'; break;
      case 'F': lv.lamps.push({x:px+3,y:py+TILE-16,w:10,h:16,on:false}); grid[y][x]='.'; break;
      case 'H': lv.pickups.push({kind:'heart',x:px+4,y:py+4,w:8,h:8,t:rand(0,6)}); grid[y][x]='.'; break;
      case 'M': lv.pickups.push({kind:'maxheart',x:px+3,y:py+3,w:10,h:10,t:0}); grid[y][x]='.'; break;
      case 'f': lv.pickups.push({kind:'wpn',wpn:'flysword',x:px+2,y:py+4,w:12,h:8,t:0}); grid[y][x]='.'; break;
      case 'b': lv.pickups.push({kind:'wpn',wpn:'bow',x:px+4,y:py+6,w:8,h:4,t:0}); grid[y][x]='.'; break;
      case 'l': lv.pickups.push({kind:'wpn',wpn:'thunder',x:px+3,y:py+4,w:10,h:10,t:0}); grid[y][x]='.'; break;
      case 'g': lv.pickups.push({kind:'wpn',wpn:'flameblade',x:px+3,y:py+4,w:10,h:10,t:0}); grid[y][x]='.'; break;
      case 'Z': {
        const B=BOSSES[lv.bossType];
        const bs=B.scale||2, bw=B.w*bs, bh=B.h*bs;
        const b={boss:true,btype:lv.bossType,name:B.name,hp:B.hp,maxhp:B.hp,bar:1,bars:B.bars||1,
          scale:bs, x:px+8-bw/2, y:Math.max(34,py+TILE-bh-B.hoverHeight), w:bw,h:bh, vx:0,vy:0,face:-1,
          t:rand(0,2), state:'idle', stT:0, active:false, flash:0, phase:1,
          lastSkill:'',
          warningKey:'', warningPoints:null, warningTarget:null,
          anchor:{x:px,y:py}, dir:-1, onGround:false};
        lv.boss=b; grid[y][x]='.'; break;
      }
      default:
        if(NPC_TYPES[c]){
          const N=NPC_TYPES[c], skin=(L.npcSkin&&L.npcSkin[c])||{};
          lv.npcs.push({type:c,name:skin.name||N.name,sprName:skin.spr||N.spr,
            lines:skin.lines||N.lines, bye:N.bye, buff:N.buff, toast:N.toast,
            x:px+2,y:py+2,w:12,h:14,done:false,t:rand(0,6)});
          grid[y][x]='.';
        } else if(ENEMY_TYPES[c]){
          const E=ENEMY_TYPES[c];
          lv.enemies.push({etype:c, name:E.name, hp:E.hp, maxhp:E.hp,
            x:px+8-E.w/2, y:py+TILE-E.h, w:E.w, h:E.h,
            vx:0, vy:0, dir:Math.random()<0.5?-1:1, face:-1,
            t:rand(0,1.5), cd:rand(0.5,E.projCd||2), state:'patrol', stT:0,
            active:false, flash:0, onGround:false, sprName:E.spr,
            anchor:{x:px,y:py}, lastHitSwing:-1});
          grid[y][x]='.';
        }
    }
  }
  return lv;
}

function startLevel(idx){
  game.lv=idx;
  game.lives=PLAYER_RULES.lives;
  level=buildLevel(idx);
  particles=[]; toasts=[]; hazards=[]; game_projs.length=0;
  game.dialog=null; game.paused=false; game.settingsOpen=false;
  player.x=level.spawn.x; player.y=level.spawn.y;
  player.vx=0; player.vy=0; player.maxHearts=PLAYER_RULES.hearts; player.hearts=PLAYER_RULES.hearts;
  player.fx={}; player.inv=1; player.dead=false; player.shield=0;
  player.deathResolved=false; player.onGround=false; player.attackWeapon=null;
  player.cd=0; player.atkT=0; player.castT=0; player.atkBuf=0; player.swingHit=new Set(); player.aim='fwd';
  player.coyote=0; player.jbuf=0; player.jumps=0; player.safeT=0; player.lavaCd=0; player.spikeCd=0;
  player.dashT=0; player.dashCd=[0,0,0]; player.dashSlot=-1; player.aimX=player.face; player.aimY=0;
  player.spawn={x:player.x,y:player.y};
  player.weapons=player.weapons.filter(w=>WEAPONS.some(v=>v.id===w));
  if(!player.weapons.length) player.weapons=['sword'];
  if(player.wi>=player.weapons.length) player.wi=0;
  game.shake=0; game.flash=0; game.bossBannerT=0;
  game.state='intro'; game.stateT=0;
  cam.x=clamp(player.x+player.w/2-W*0.42,0,level.w*TILE-W);
}

/* ============================================================
 * 图块查询 / 碰撞
 * ============================================================ */
function tileAt(tx,ty){
  if(!level) return '.';
  if(tx<0||tx>=level.w) return '#';       // 左右边界视为墙
  if(ty<0) return '.';
  if(ty>=level.h) return '.';
  return level.grid[ty][tx];
}
const isSolid=ch=>ch==='#';

// 覆盖的实体图块（复用缓冲，避免每帧分配大量小对象引发 GC 卡顿）
const _scan=[]; for(let i=0;i<48;i++) _scan.push({tx:0,ty:0,ch:'.'});
function tilesOf(e){
  let n=0;
  const x0=Math.floor(e.x/TILE), x1=Math.floor((e.x+e.w-0.01)/TILE);
  const y0=Math.floor(e.y/TILE), y1=Math.floor((e.y+e.h-0.01)/TILE);
  for(let ty=y0;ty<=y1;ty++) for(let tx=x0;tx<=x1;tx++){
    const ch=tileAt(tx,ty);
    if(n<_scan.length){ const o=_scan[n]; o.tx=tx; o.ty=ty; o.ch=ch; }
    else _scan.push({tx,ty,ch});
    n++;
  }
  _scan.length=n;
  return _scan;
}

// 通用移动 + 碰撞（X 轴 / Y 轴分离）
function moveEntity(e,dt,useGrav=true){
  e.hitWall=false;
  // ---- X ----
  e.x+=e.vx*dt;
  for(const t of tilesOf(e)){
    if(isSolid(t.ch)){
      if(e.vx>0){ e.x=t.tx*TILE-e.w-0.01; }
      else if(e.vx<0){ e.x=(t.tx+1)*TILE+0.01; }
      e.hitWall=true; e.vx=0; break;
    }
  }
  // ---- Y ----
  const prevBottom=e.y+e.h;
  if(useGrav) e.vy+=GRAV*dt;
  e.y+=e.vy*dt;
  e.onGround=false;
  for(const t of tilesOf(e)){
    const solid=isSolid(t.ch), oneway=t.ch==='=';
    if(!solid&&!oneway) continue;
    if(e.vy>0){
      const top=t.ty*TILE;
      if(solid || (oneway && prevBottom<=top+0.5)){
        e.y=top-e.h-0.01; e.vy=0; e.onGround=true;
      }
    } else if(e.vy<0 && solid){
      e.y=(t.ty+1)*TILE+0.01; e.vy=0;
    }
  }
}

function touchingHazard(e){
  for(const t of tilesOf(e)){
    if(t.ch==='^') return 'spike';
    if(t.ch==='~') return 'lava';
  }
  return null;
}
// 尖刺朝向：上方是实体 → 朝下
function spikeDir(tx,ty){ return isSolid(tileAt(tx,ty-1))?'down':'up'; }

/* ============================================================
 * 粒子 / 提示
 * ============================================================ */
function burst(x,y,color,n,spd,life){
  if(particles.length>360) particles.splice(0,particles.length-360); // 粒子上限，防止爆发时堆积
  for(let i=0;i<n;i++){
    const a=rand(0,Math.PI*2), s=rand(spd*0.3,spd);
    particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-30,life:life||rand(0.3,0.7),maxLife:life||0.7,color,size:rand(1,2.4)});
  }
}
function toast(text,color){ toasts.push({text,color:color||'#ffe8a0',t:2.6}); }

/* ============================================================
 * 玩家逻辑
 * ============================================================ */
function curWeapon(){ return WEAPONS.find(w=>w.id===player.weapons[player.wi])||WEAPONS[0]; }

function updateDashSkill(dt){
  const p=player;
  if(p.dead) return;
  if(!Array.isArray(p.dashCd)) p.dashCd=[Math.max(0,p.dashCd||0),0,0];
  while(p.dashCd.length<DASH_SKILL.slots) p.dashCd.push(0);
  for(let i=0;i<DASH_SKILL.slots;i++){
    p.dashCd[i]=Math.max(0,p.dashCd[i]-dt);
    if(p.dashCd[i]<0.001) p.dashCd[i]=0;
  }
}

function activateDashSkill(){
  const p=player;
  if(p.dead||game.state!=='play'||p.dashT>0) return false;
  if(!Array.isArray(p.dashCd)) p.dashCd=[Math.max(0,p.dashCd||0),0,0];
  while(p.dashCd.length<DASH_SKILL.slots) p.dashCd.push(0);
  const slot=p.dashCd.findIndex(cd=>cd<=0);
  if(slot<0) return false;
  const mx=(down('ArrowRight','KeyD')?1:0)-(down('ArrowLeft','KeyA')?1:0);
  p.dashDir=mx||p.face; p.face=p.dashDir;
  p.dashT=DASH_SKILL.duration; p.dashSlot=slot; p.dashCd[slot]=DASH_SKILL.cooldown;
  p.vx=p.dashDir*DASH_SKILL.speed; p.vy=0; p.inv=Math.max(p.inv,DASH_SKILL.invDuration);
  SFX.buff();
  burst(p.x+p.w/2,p.y+p.h/2,'#7fdce8',20,170,0.45);
  return true;
}

function updatePlayer(dt){
  const p=player;
  if(p.dead){
    p.deadT-=dt;
    p.vy+=GRAV*dt; p.y+=p.vy*dt;
    if(p.deadT<=0) afterDeath();
    return;
  }
  // ---- 输入 ----
  let mx=0;
  if(down('ArrowLeft','KeyA')) mx--;
  if(down('ArrowRight','KeyD')) mx++;
  if(mx!==0&&p.dashT<=0) p.face=mx;
  const slowMul=p.fx.slow?0.55:1;
  const spdMul=(p.fx.speed?1.5:1)*slowMul;
  const dashActive=p.dashT>0;
  const target=dashActive?p.dashDir*DASH_SKILL.speed:mx*95*spdMul;
  p.vx=dashActive?target:lerp(p.vx,target, p.onGround?0.4:0.18);
  if(Math.abs(p.vx)<3&&mx===0) p.vx=0;

  // 跳跃（仅空格；↑/W 专职向上瞄准）
  if(hit('Space')) p.jbuf=0.1;
  p.jbuf-=dt; p.coyote-=dt;
  const maxJumps=p.fx.speed?2:1;
  if(p.jbuf>0){
    if(p.onGround||p.coyote>0){ p.vy=-300; p.jbuf=0; p.coyote=0; p.jumps=1; SFX.jump(); }
    else if(p.jumps<maxJumps){ p.vy=-280; p.jumps++; p.jbuf=0; SFX.jump(); burst(p.x+p.w/2,p.y+p.h,'#7fdce8',5,50,0.3); }
  }
  if(!down('Space')&&p.vy<-120) p.vy=-120; // 可变跳跃高度
  p.vy=clamp(p.vy,-320,420);

  if(dashActive){
    p.vy=0;
    const stepTime=Math.min(dt,p.dashT), steps=Math.max(1,Math.ceil(DASH_SKILL.speed*stepTime/4));
    for(let i=0;i<steps;i++){ moveEntity(p,stepTime/steps,false); if(p.hitWall) break; }
    p.dashT=Math.max(0,p.dashT-stepTime);
    if(p.hitWall||p.dashT<0.00001){ p.dashT=0; p.vx=0; p.dashSlot=-1; }
    if(Math.random()<dt*90){
      particles.push({x:p.x+p.w/2-p.face*rand(3,10),y:p.y+rand(2,p.h-2),vx:-p.face*24,vy:rand(-12,12),life:0.18,maxLife:0.18,color:'#7fdce8',size:2});
    }
  }
  else moveEntity(p,dt);
  if(p.onGround){ p.coyote=0.09; p.jumps=0; }

  // ---- 攻击（带输入缓冲：冷却中按键会在冷却结束瞬间自动出手）----
  p.cd-=dt;
  if(hit('KeyJ','KeyZ')){
    if(p.cd<=0) doAttack();
    else p.atkBuf=0.14;
  }
  if(p.atkBuf>0){
    p.atkBuf-=dt;
    if(p.cd<=0){ p.atkBuf=0; doAttack(); }
  }
  if(p.atkT>0){
    p.atkT-=dt;
    meleeHits();
  }
  if(p.castT>0) p.castT-=dt;
  // 切换武器
  if(player.weapons.length&&hit('KeyQ')) switchWeapon((player.wi+1)%player.weapons.length);
  for(let i=0;i<player.weapons.length;i++){
    if(hit('Digit'+(i+1))) switchWeapon(i);
  }

  // ---- 状态效果 ----
  updateStatusFX(dt);
  if(p.dead) return;

  // ---- 危险地形 ----
  const hz=touchingHazard(p);
  if(hz){
    if(hz==='lava'&&!p.lavaCd){ hurtPlayer(1,{effect:'burn'}); p.lavaCd=1; }
    else if(hz==='spike'&&!p.spikeCd){ hurtPlayer(1,{}); p.spikeCd=0.6; }
    if(hz==='lava'||hz==='spike') respawnToSafe(true);
  }
  p.lavaCd=Math.max(0,(p.lavaCd||0)-dt);
  p.spikeCd=Math.max(0,(p.spikeCd||0)-dt);
  if(p.y>level.h*TILE+40){ hurtPlayer(1,{}); respawnToSafe(false); }
  if(p.dead) return;

  // 记录安全点
  p.safeT-=dt;
  if(p.onGround&&p.safeT<=0){
    const bx=Math.floor((p.x+p.w/2)/TILE), by=Math.floor((p.y+p.h+2)/TILE);
    if(isSolid(tileAt(bx,by))&&!touchingHazard({x:p.x,y:p.y,w:p.w,h:p.h+2})){
      p.spawn={x:p.x,y:p.y}; p.safeT=0.3;
    }
  }

  // ---- 存档点 ----
  for(const l of level.lamps){
    if(!l.on&&overlap(p,l)){ l.on=true; p.spawn={x:l.x-2,y:l.y-2}; SFX.check(); toast('存档点已点亮','#7fdce8'); burst(l.x+5,l.y+8,'#f8d838',10,60,0.5); }
  }
  // ---- 拾取 ----
  for(const it of level.pickups){
    if(it.got) continue;
    if(overlap(p,it)) takePickup(it);
  }
  // ---- NPC 交谈 ----
  for(const n of level.npcs){
    if(overlap(p,{x:n.x-6,y:n.y-4,w:n.w+12,h:n.h+8})&&hit('KeyE')&&!game.dialog){
      // 已赠过加护的神仙只说告别语，不再重复送礼
      game.dialog={npc:n,idx:0,lines:n.done?[n.bye]:n.lines};
    }
  }
  // ---- 门 ----
  const g=level.gate;
  if(g&&overlap(p,g)){
    if(g.open){ levelClear(); }
    else if(!p.gateHintT||p.gateHintT<=0){ toast('传送门被封印了！先击败「'+level.boss.name+'」','#d84040'); p.gateHintT=2.5; }
  }
  p.gateHintT=Math.max(0,(p.gateHintT||0)-dt);

  p.inv=Math.max(0,p.inv-dt);
  p.anim+=dt*(Math.abs(p.vx)>10?10:0);
}

function switchWeapon(i){
  if(!player.weapons.length) return;                       // 无武器时忽略，避免 wi 变成 NaN
  player.wi=clamp(i|0,0,player.weapons.length-1);
  SFX.pickup(); toast('切换武器：'+curWeapon().name,'#c0c0d0');
}

// 玩家脚下的地面高度（火焰波贴地用）
function floorBelow(px,py){
  const tx=Math.floor(px/TILE);
  if(tx<0||tx>=level.w) return null;
  for(let ty=Math.max(0,Math.floor(py/TILE));ty<level.h;ty++){
    const ch=level.grid[ty][tx];
    if(isSolid(ch)||ch==='=') return ty*TILE;
  }
  return null;
}

// 落雷 / 火柱 / 墨柱的贴地面：从 fromY 往下找立足面，找不到就用地图底部
function groundTop(px,fromY){
  const g=floorBelow(px,fromY);
  return g===null?level.h*TILE:g;
}

// 支持 ↑ 上挥 / 空中 ↓ 下挥，斜向攻击时雷电波也沿斜线飞行
function castLightningWave(){
  const p=player, dir=p.aim;
  let w,h,vx,vy,sx,sy;
  if(dir==='diag'){
    w=24; h=24; vx=p.aimX*152; vy=p.aimY*152;
    sx=p.x+p.w/2+p.aimX*12; sy=p.y+p.h*0.42+p.aimY*12;
  }
  else if(dir==='up'){ w=18; h=32; vx=0; vy=-215; sx=p.x+p.w/2; sy=p.y-4; }
  else if(dir==='down'){ w=18; h=32; vx=0; vy=215; sx=p.x+p.w/2; sy=p.y+p.h+4; }
  else { w=32; h=18; vx=p.face*215; vy=0; sx=p.x+p.w/2+p.face*16; sy=p.y+p.h*0.42; }
  game_projs.push({team:'p',x:sx-w/2,y:sy-h/2,w,h,vx,vy,grav:0,
    dmg:2,life:0.4,spr:'p_lightning',face:p.face,wave:true,lightning:true,seed:rand(0,60),dir});
  tone(1200,320,0.12,'sawtooth',0.08); tone(320,90,0.16,'square',0.06,0.02);
  game.shake=Math.max(game.shake,3);
  for(let i=0;i<8;i++) particles.push({x:sx,y:sy+rand(-6,6),
    vx:vx*0.4+p.face*rand(30,70),vy:vy*0.4+rand(-45,45),
    life:0.28,maxLife:0.28,color:i%2?'#7fdce8':'#ffffff',size:1.5});
}

function lobTarget(p,maxRange){
  const cx=p.x+p.w/2, cy=p.y+p.h/2;
  maxRange=maxRange||240;
  let best=null, bestScore=Infinity;
  const consider=e=>{
    if(!e||e.dying||e.gone) return;
    const ex=e.x+e.w/2, ey=e.y+e.h/2, dx=ex-cx;
    if(p.face*dx<-18||Math.abs(dx)>maxRange||Math.abs(ey-cy)>150) return;
    const score=Math.abs(dx)+Math.abs(ey-cy)*0.7;
    if(score<bestScore){ bestScore=score; best={x:ex,y:ey}; }
  };
  for(const e of level.enemies) consider(e);
  if(level.boss&&level.boss.active) consider(level.boss);
  return best;
}

function doAttack(){
  const w=curWeapon(), p=player;
  const cdMul=p.fx.curse?1.35:1;
  p.attackWeapon=w;
  p.cd=w.cd*cdMul;
  p.swing++; p.swingHit=new Set();
  // 方向攻击：W+A / W+D 斜向上，空中 S+A / S+D 斜向下
  const up=down('ArrowUp','KeyW');
  const dn=!p.onGround&&down('ArrowDown','KeyS');
  const left=down('ArrowLeft','KeyA'), right=down('ArrowRight','KeyD');
  const horizontal=left?-1:(right?1:0), vertical=up?-1:(dn?1:0);
  if(horizontal&&vertical){ p.aim='diag'; p.aimX=horizontal; p.aimY=vertical; }
  else if(vertical){ p.aim=vertical<0?'up':'down'; p.aimX=0; p.aimY=vertical; }
  else { p.aim='fwd'; p.aimX=p.face; p.aimY=0; }
  if(w.kind==='melee'){
    p.atkT=0.16;
    if(p.onGround&&p.aim==='fwd') p.vx=clamp(p.vx+p.face*70,-160,160); // 出剑小前冲
    if(w.elem==='thunder') castLightningWave();               // 雷霆之刃：雷电波（含上/下挥）
    if(w.elem==='fire'){                                      // 炎狱双刃：火焰波（上挥 / 下劈 / 平推三向）
      let fw=null;
      if(p.aim==='diag'){
        fw={x:p.aimX>0?p.x+p.w-2:p.x-16,y:p.aimY<0?p.y-18:p.y+p.h-2,w:18,h:18,vx:p.aimX*138,vy:p.aimY*138,diag:true};
      }else if(up){ fw={x:p.x+p.w/2-7,y:p.y-26,w:14,h:26,vx:0,vy:-195}; }
      else if(dn){ fw={x:p.x+p.w/2-7,y:p.y+p.h+2,w:14,h:26,vx:0,vy:195}; }
      else{
        const wx=p.x+p.w/2+p.face*20;
        if(p.onGround){
          const gy=floorBelow(wx,p.y+p.h);
          if(gy!==null) fw={x:wx-11,y:gy-13,w:22,h:12,vx:p.face*165,vy:0,ground:true};
        }else{
          // 空中平推跟随主角当前高度，不能重新吸附到下方地面。
          fw={x:wx-11,y:p.y+p.h*0.42-6,w:22,h:12,vx:p.face*165,vy:0,ground:false};
        }
      }
      if(fw) game_projs.push({team:'p',...fw,dmg:1,life:0.75,spr:'p_fire',face:p.face,wave:true,flamewave:true});
    }
    SFX.attack();
  }
  else{
    const cx=p.x+p.w/2, cy=p.y+4;
    const vert=p.aim!=='fwd';
    if(w.kind==='lob'){
      let vx=p.face*(w.lvx||150), vy=w.lvy||-190;
      if(p.aim==='diag'){ vx=p.aimX*(w.lvx||150)*0.707; vy=p.aimY*Math.abs(w.lvy||190)*0.707; }
      else if(p.aim==='up'){ vx=p.face*40; vy=-270; }
      else if(p.aim==='down'){ vx=p.face*30; vy=140; }
      else{
        const target=lobTarget(p,w.lobRange), gravity=GRAV*0.6;
        if(target){
          const tx=target.x-cx, flight=clamp(Math.abs(tx)/Math.abs(vx||1),0.34,0.9);
          vy=clamp((target.y-cy-0.5*gravity*flight*flight)/flight,-340,260);
        }
      }
      p.castT=0.14;
      game_projs.push({team:'p',x:cx-4,y:cy-4,w:8,h:8,vx,vy,grav:1,
        dmg:w.dmg,aoe:w.aoe,splitCount:w.splitCount||0,splitSpeed:w.splitSpeed||145,
        life:2.4,spr:w.spr,face:p.face,lob:true});
    }else{
      let vx=p.face*w.speed, vy=0, sx=cx+p.face*6, sy=cy;
      if(p.aim==='diag'){ vx=p.aimX*w.speed*0.707; vy=p.aimY*w.speed*0.707; sx=cx+p.aimX*5; sy=cy+p.aimY*5; }
      else if(p.aim==='up'){ vx=0; vy=-w.speed; sx=cx-3; sy=p.y-12; }
      else if(p.aim==='down'){ vx=0; vy=w.speed; sx=cx-3; sy=p.y+p.h+2; }
      game_projs.push({team:'p',x:sx,y:sy,w:vert?w.ph:w.pw,h:vert?w.pw:w.ph,vx,vy,grav:0,
        dmg:w.dmg,pierce:w.pierce,hitTargets:new Set(),life:w.life||1.1,spr:w.spr,face:p.face,rot:vert});
      p.castT=0.12;
    }
    SFX.shoot();
  }
}

function meleeHits(){
  const w=player.attackWeapon||curWeapon(),p=player;
  if(p.dead||p.atkT<=0||w.kind!=='melee') return;
  let box;
  if(p.aim==='diag') box={x:p.aimX>0?p.x+p.w-2:p.x-w.range+2,y:p.aimY<0?p.y-w.range:p.y+p.h,w:w.range,h:w.range};
  else if(p.aim==='up') box={x:p.x-6,y:p.y-24,w:p.w+12,h:24};
  else if(p.aim==='down') box={x:p.x-6,y:p.y+p.h,w:p.w+12,h:22};
  else box={x:p.face>0?p.x+p.w-2:p.x-w.range+2, y:p.y-6, w:w.range, h:p.h+12};
  for(const e of level.enemies) tryMeleeHit(e,box);
  const b=level.boss;
  if(b&&!b.dying&&!b.gone) tryMeleeHit(b,box);
  // 按本次挥砍开始时的武器判定：只有初始青铜剑能击碎敌方弹幕。
  if(w.id!=='sword') return;
  for(const pr of game_projs){
    if(pr.team==='e'&&pr.life>0&&!pr.pillar&&overlap(box,pr)&&!p.swingHit.has(pr)){
      p.swingHit.add(pr); pr.life=0; burst(pr.x+pr.w/2,pr.y+pr.h/2,'#c0c0d0',4,60,0.25);
    }
  }
}
// 玩家伤害统一计算：武器伤害 × 金刚之力 × 诅咒 × 版本倍率（无敌版 5 倍）
function playerDmg(base){ return base*(player.fx.power?2:1)*(player.fx.curse?0.75:1)*(window.DMG_MULT||1); }

function tryMeleeHit(e,box){
  const p=player;
  if(e.dying||e.gone) return;
  if(p.swingHit.has(e)) return;
  if(!overlap(box,{x:e.x,y:e.y,w:e.w,h:e.h})) return;
  p.swingHit.add(e);
  const dmg=playerDmg((p.attackWeapon||curWeapon()).dmg||1);
  damageEnemy(e,dmg,p.face*90);
  burst(e.x+e.w/2,e.y+e.h/2,'#f8d838',6,90,0.3);
  burst(e.x+e.w/2,e.y+e.h/2,'#ffffff',3,60,0.2);
}

function applyEffect(name,dur){
  const meta=EFFECT_META[name];
  if(!meta||player.dead||(meta.bad&&(game.god||player.fx.invincible))) return;
  player.fx[name]={t:dur,tick:0};
  if(meta.bad){ SFX.debuff(); toast(meta.name+'了！'+(name==='slow'?'行动迟缓…':name==='curse'?'攻击减弱…':''),meta.color); }
}
function updateStatusFX(dt){
  const p=player, fx=p.fx;
  for(const k of Object.keys(fx)){
    const f=fx[k]; if(!f) continue;
    const activeDt=Math.min(dt,Math.max(0,f.t)); f.t-=dt;
    if(k==='poison'){ f.tick+=activeDt; if(f.tick>=2.2){ f.tick=0; dotDamage('poison'); } if(Math.random()<dt*8) particles.push({x:p.x+rand(0,p.w),y:p.y,vx:rand(-8,8),vy:-30,life:0.5,maxLife:0.5,color:'#4fb84f',size:1.5}); }
    if(k==='burn'){ f.tick+=activeDt; if(f.tick>=2.0){ f.tick=0; dotDamage('burn'); } if(Math.random()<dt*10) particles.push({x:p.x+rand(0,p.w),y:p.y+rand(0,p.h),vx:rand(-6,6),vy:-45,life:0.35,maxLife:0.35,color:'#f08020',size:1.5}); }
    if(f.t<=0){ delete fx[k]; }
  }
  p.shield=Math.max(0,p.shield);
}
function dotDamage(kind){
  // 异常最多削到最后一滴血，致命伤仍须来自可躲避的攻击。
  if(player.hearts<=1) return;
  if(!hurtPlayer(1,{noKnock:true,silent:true})) return;
  burst(player.x+player.w/2,player.y+player.h/2,EFFECT_META[kind].color,5,50,0.3);
}

function hurtPlayer(n,opt){
  opt=opt||{};
  const p=player;
  if(game.state!=='play'||p.dead||p.inv>0||p.fx.invincible||game.god||!(n>0)) return false;
  if(p.shield>0){ p.shield=Math.max(0,p.shield-1); p.inv=PLAYER_RULES.hurtGrace; SFX.hitEnemy(); burst(p.x+p.w/2,p.y+p.h/2,'#7fdce8',8,70,0.3); if(p.shield<=0) toast('护盾破碎！','#7fdce8'); return true; }
  p.hearts=Math.max(0,p.hearts-1);
  p.inv=PLAYER_RULES.hurtGrace; game.shake=Math.max(game.shake,4); game.flash=0.18;
  SFX.hurt();
  burst(p.x+p.w/2,p.y+p.h/2,'#d84040',8,80,0.4);
  if(!opt.noKnock){ p.vx=(opt.kx!==undefined?opt.kx:-p.face*110); p.vy=-140; }
  if(opt.effect&&!p.fx[opt.effect]) applyEffect(opt.effect,opt.effect==='burn'?2.5:opt.effect==='poison'?3:opt.effect==='curse'?4:2.5);
  if(p.hearts<=0){
    p.hearts=0; p.dead=true; p.deadT=1.3; p.vy=-220; game.deaths++;
    p.deathResolved=false; game.lives=Math.max(0,game.lives-1);
    p.dashT=0; p.atkT=0; p.atkBuf=0; p.fx={};
    SFX.die();
  }
  return true;
}

function respawnToSafe(withVel){
  const p=player;
  if(p.dead) return;
  p.x=p.spawn.x; p.y=p.spawn.y; p.vx=0; p.vy=0;
  game.shake=3;
}

function afterDeath(){
  if(!player.dead||player.deathResolved) return;
  player.deathResolved=true;
  if(game.lives<=0){ game.state='gameover'; game.stateT=0; return; }
  // 单条命用尽时回到最近检查点，保留当前章节、敌人和 Boss 的战斗进度。
  const p=player;
  p.dead=false; p.maxHearts=PLAYER_RULES.hearts; p.hearts=PLAYER_RULES.hearts; p.fx={}; p.inv=PLAYER_RULES.respawnGrace; p.shield=0;
  p.onGround=false; p.coyote=0; p.jbuf=0; p.jumps=0; p.attackWeapon=null;
  p.lavaCd=0; p.spikeCd=0; p.cd=0; p.atkT=0; p.castT=0; p.atkBuf=0; p.swingHit=new Set(); p.aim='fwd';
  p.dashT=0; p.dashCd=[0,0,0]; p.dashSlot=-1; p.aimX=p.face; p.aimY=0;
  p.x=p.spawn.x; p.y=p.spawn.y; p.vx=0; p.vy=0;
  game_projs.length=0; hazards.length=0;
  if(level.boss&&level.boss.active&&!level.boss.dying&&!level.boss.gone){
    recoverBoss(level.boss,1.5);resetBossOverload(level.boss);
  }
  game.state='play'; game.stateT=0;
}

function restoreVictoryHealth(){
  if(player.dead) return;
  player.maxHearts=PLAYER_RULES.hearts;
  player.hearts=PLAYER_RULES.hearts;
  for(const name of Object.keys(player.fx)){
    if(EFFECT_META[name]&&EFFECT_META[name].bad) delete player.fx[name];
  }
  player.inv=Math.max(player.inv,PLAYER_RULES.respawnGrace);
}

function levelClear(){
  if(player.dead||game.state!=='play') return;
  restoreVictoryHealth();
  SFX.gate();
  game.state='clear'; game.stateT=0;
  burst(player.x,player.y,'#ffe8a0',20,100,0.8);
}

/* ============================================================
 * 拾取
 * ============================================================ */
function takePickup(it){
  if(player.dead) return;
  it.got=true;
  const p=player;
  if(it.kind==='heart'){
    if(p.hearts>=p.maxHearts){ it.got=false; return; }
    p.hearts=Math.min(p.maxHearts,p.hearts+1); SFX.pickup(); burst(it.x+4,it.y+4,'#d84040',8,60,0.4);
  }else if(it.kind==='maxheart'){
    p.maxHearts=PLAYER_RULES.hearts; p.hearts=PLAYER_RULES.hearts;
    for(const k of ['poison','burn','slow','curse']) delete p.fx[k];
    SFX.buff(); toast('回春灵心：回满三滴血，解除异常','#d84040'); burst(it.x+5,it.y+5,'#d84040',14,90,0.6);
  }else if(it.kind==='wpn'){
    if(!p.weapons.includes(it.wpn)) p.weapons.push(it.wpn);
    player.wi=p.weapons.indexOf(it.wpn);
    const w=WEAPONS.find(v=>v.id===it.wpn);
    SFX.buff(); toast('获得【'+w.name+'】！按数字键 '+(player.wi+1)+' 或 Q 切换','#ffe8a0');
    burst(it.x+6,it.y+4,'#ffe8a0',12,80,0.5);
  }
}

/* ============================================================
 * 敌人 AI
 * ============================================================ */
function spawnEnemyProj(e,type,tx,ty,opt){
  const P=PROJ_TYPES[type]; opt=opt||{};
  const dx=tx-(e.x+e.w/2), dy=ty-(e.y+e.h/2);
  const d=Math.hypot(dx,dy)||1;
  const sp=P.speed;
  game_projs.push({team:'e',x:e.x+e.w/2-P.w/2,y:e.y+e.h/2-P.h/2,w:P.w,h:P.h,
    vx:(opt.vx!==undefined?opt.vx:dx/d*sp), vy:(opt.vy!==undefined?opt.vy:(P.grav? -170 : dy/d*sp)),
    grav:(opt.grav!==undefined?opt.grav:(P.grav?1:0)), dmg:P.dmg, effect:P.effect, life:P.life, spr:P.spr,
    face:dx>0?1:-1});
}

function updateEnemy(e,dt){
  const E=ENEMY_TYPES[e.etype], p=player;
  if(!e.active){
    if(e.x>cam.x-60&&e.x<cam.x+W+120) e.active=true;
    else return;
  }
  if(e.flash>0) e.flash-=dt;
  e.t+=dt; e.cd-=dt;
  const pcx=p.x+p.w/2, pcy=p.y+p.h/2, ecx=e.x+e.w/2, ecy=e.y+e.h/2;
  const dP=dist(ecx,ecy,pcx,pcy);
  if(dP>300) return;
  if(e.stunT>0){
    e.stunT-=dt;
    if(!E.noGravity&&E.behavior!=='diver') moveEntity(e,dt);
    return;
  }
  // 远程小兵先亮光蓄力，瞄准点在亮光时固定，闪避后不会转头追射。
  if(e.shotT>0){
    e.shotT-=dt; e.vx=0;
    if(Math.random()<dt*18) burst(ecx,ecy,'#ffe8a0',1,18,0.2);
    if(e.shotT<=0){
      const shot=e.pendingShot; e.pendingShot=null;
      if(shot.fan){
        const base=Math.atan2(shot.y-ecy,shot.x-ecx);
        for(const spread of [-0.32,0,0.32]) spawnEnemyProj(e,'light',shot.x,shot.y,{vx:Math.cos(base+spread)*110,vy:Math.sin(base+spread)*110});
      }else spawnEnemyProj(e,shot.type,shot.x,shot.y,shot.opt);
    }
    if(!E.noGravity&&E.behavior!=='diver') moveEntity(e,dt);
    if(overlap(p,e)) touchPlayer(e,E);
    return;
  }

  switch(E.behavior){
    case 'walker':{
      if(e.state==='skillPre'){
        e.vx=0; e.stT-=dt;
        if(Math.random()<dt*18) particles.push({x:ecx+rand(-5,5),y:e.y-2,vx:0,vy:-18,life:0.25,maxLife:0.25,color:'#4fb84f',size:1.5});
        if(e.stT<=0){
          const dir=e.face;
          for(const spread of [-42,0,42]) spawnEnemyProj(e,'poison',pcx,pcy,{vx:dir*85+spread,vy:-125});
          e.state='patrol'; e.cd=E.skillCd||3;
        }
      }else{
        e.vx=e.dir*E.speed;
        if(e.onGround){
          const ax=Math.floor((ecx+e.dir*(e.w/2+3))/TILE), ay=Math.floor((e.y+e.h+2)/TILE);
          if(!isSolid(tileAt(ax,ay))&&tileAt(ax,ay)!=='=') e.dir*=-1;
        }
        if(e.hitWall) e.dir*=-1;
        e.face=e.dir;
        if(E.skill&&e.cd<=0&&dP<135){ e.state='skillPre'; e.stT=0.6; e.vx=0; e.face=Math.sign(pcx-ecx)||e.dir; }
      }
      moveEntity(e,dt);
      break;
    }
    case 'guard':{
      // 天兵：巡逻 + 突刺
      if(e.state==='patrol'){
        e.vx=e.dir*E.speed;
        if(e.onGround){
          const ax=Math.floor((ecx+e.dir*(e.w/2+3))/TILE), ay=Math.floor((e.y+e.h+2)/TILE);
          if(!isSolid(tileAt(ax,ay))&&tileAt(ax,ay)!=='=') e.dir*=-1;
        }
        if(e.hitWall) e.dir*=-1;
        e.face=e.dir;
        if(e.cd<=0&&Math.abs(pcy-ecy)<24&&Math.abs(pcx-ecx)<40&&Math.sign(pcx-ecx)===e.dir){ e.state='windup'; e.stT=0.55; e.vx=0; }
      }else if(e.state==='windup'){
        e.vx=0; e.stT-=dt;
        if(e.stT<=0){ e.state='thrust'; e.stT=0.22; e.vx=e.face*160; }
      }else if(e.state==='thrust'){
        e.stT-=dt; if(e.stT<=0){ e.state='patrol'; e.cd=1.2; e.stunT=0.35; e.vx=0; }
      }
      moveEntity(e,dt);
      break;
    }
    case 'jumper':{
      // 小恶魔：跳向玩家 + 喷火
      if(e.onGround){
        e.vx*=0.8;
        if(e.t>1.15){ e.t=0; e.dir=pcx<ecx?-1:1; e.vx=e.dir*62; e.vy=-195; }
      }
      if(e.cd<=0&&dP<140){ prepareEnemyShot(e,'fire',pcx,pcy,E.projCd); }
      moveEntity(e,dt);
      e.face=pcx<ecx?-1:1;
      break;
    }
    case 'shooter':{
      const inRange=dP<E.range&&Math.abs(pcy-ecy)<46;
      if(inRange){
        e.vx=0; e.face=pcx<ecx?-1:1;
        if(e.cd<=0){
          prepareEnemyShot(e,E.proj,pcx,pcy,E.projCd,E.arc?{vx:pcx>ecx?110:-110,vy:-175}:undefined);
        }
      }else{
        // 脱战时缓慢巡逻，不再站桩发呆
        e.vx=e.dir*18;
        if(e.onGround){
          const ax=Math.floor((ecx+e.dir*(e.w/2+3))/TILE), ay=Math.floor((e.y+e.h+2)/TILE);
          if(!isSolid(tileAt(ax,ay))&&tileAt(ax,ay)!=='=') e.dir*=-1;
        }
        if(e.hitWall) e.dir*=-1;
        e.face=e.dir;
      }
      moveEntity(e,dt);
      break;
    }
    case 'chaser':{
      if(e.state==='pouncePre'){
        e.vx=0; e.stT-=dt;
        if(Math.random()<dt*20) particles.push({x:ecx-e.face*7,y:e.y+e.h,vx:-e.face*20,vy:-18,life:0.25,maxLife:0.25,color:'#f08020',size:1.5});
        if(e.stT<=0){ e.state='pounce'; e.stT=0.68; e.dir=e.face; e.vx=e.dir*145; e.vy=-190; }
      }else if(e.state==='pounce'){
        e.vx=e.dir*145; e.stT-=dt; e.face=e.dir;
        if(e.stT<=0){
          hazards.push({pillar:true,x:ecx,y:groundTop(ecx,e.y+e.h),w:8,h:0,maxH:15,t:0,rise:0.12,dur:0.45,col:'fire'});
          e.state='patrol'; e.cd=E.skillCd||3.8; e.stunT=0.45; e.vx=0;
        }
      }else{
        if(dP<150&&Math.abs(pcy-ecy)<30){ e.dir=pcx<ecx?-1:1; e.vx=e.dir*E.speed; }
        else{
          e.vx=e.dir*30;
          if(e.onGround){
            const ax=Math.floor((ecx+e.dir*(e.w/2+3))/TILE), ay=Math.floor((e.y+e.h+2)/TILE);
            if(!isSolid(tileAt(ax,ay))&&tileAt(ax,ay)!=='=') e.dir*=-1;
          }
          if(e.hitWall) e.dir*=-1;
        }
        e.face=e.dir;
        if(E.skill&&e.cd<=0&&dP<125){ e.state='pouncePre'; e.stT=0.65; e.vx=0; }
      }
      moveEntity(e,dt);
      break;
    }
    case 'charger':{
      // 牛头：冲锋
      if(e.state==='patrol'){
        e.vx=e.dir*E.speed;
        if(e.onGround){
          const ax=Math.floor((ecx+e.dir*(e.w/2+3))/TILE), ay=Math.floor((e.y+e.h+2)/TILE);
          if(!isSolid(tileAt(ax,ay))&&tileAt(ax,ay)!=='=') e.dir*=-1;
        }
        if(e.hitWall) e.dir*=-1;
        e.face=e.dir;
        if(e.cd<=0&&Math.abs(pcy-ecy)<26&&Math.abs(pcx-ecx)<120&&Math.sign(pcx-ecx)===e.dir){ e.state='windup'; e.stT=0.7; e.vx=0; }
      }else if(e.state==='windup'){
        e.vx=0; e.stT-=dt;
        if(Math.random()<dt*20) particles.push({x:ecx+rand(-8,8),y:e.y+e.h,vx:0,vy:-20,life:0.3,maxLife:0.3,color:'#f8d838',size:1});
        if(e.stT<=0){ e.state='charge'; e.stT=0.7; e.face=e.dir; }
      }else if(e.state==='charge'){
        e.vx=e.dir*E.chargeSpeed; e.stT-=dt;
        if(Math.random()<dt*30) particles.push({x:ecx-e.dir*8,y:e.y+e.h-2,vx:-e.dir*30,vy:rand(-30,0),life:0.3,maxLife:0.3,color:'#a06028',size:1.5});
        if(e.hitWall||e.stT<=0){ e.state='patrol'; e.vx=0; e.cd=2; e.stunT=0.65; game.shake=Math.max(game.shake,2); }
      }
      moveEntity(e,dt);
      break;
    }
    case 'floater':{
      // 鬼火：飘向玩家（穿墙）
      const wob=Math.sin(e.t*5)*12;
      const ang=Math.atan2(pcy+wob-ecy,pcx-ecx);
      e.vx=lerp(e.vx,Math.cos(ang)*E.speed,0.03);
      e.vy=lerp(e.vy,Math.sin(ang)*E.speed,0.03);
      e.x+=e.vx*dt; e.y+=e.vy*dt;
      e.x=clamp(e.x,0,level.w*TILE-e.w); e.y=clamp(e.y,0,level.h*TILE-e.h);
      if(E.skill&&e.cd<=0&&dP<155){
        prepareEnemyShot(e,'light',pcx,pcy,E.skillCd); e.pendingShot.fan=true;
      }
      if(Math.random()<dt*6) particles.push({x:ecx,y:ecy,vx:rand(-10,10),vy:rand(-10,10),life:0.4,maxLife:0.4,color:'#7fdce8',size:1});
      break;
    }
    case 'diver':{
      // 石像鬼：绕巢盘旋飞行，靠近后俯冲，落地短暂停顿后再飞回
      if(e.state==='patrol'){
        // 绕锚点盘旋（在远处也看得到它在飞）
        e.t2=(e.t2||0)+dt;
        const hx=e.anchor.x+8+Math.sin(e.t2*0.9)*44, hy=e.anchor.y-14+Math.sin(e.t2*1.8)*9;
        e.vx=lerp(e.vx,clamp((hx-ecx)*2.4,-80,80),0.06);
        e.vy=lerp(e.vy,clamp((hy-ecy)*2.4,-70,70),0.06);
        e.x+=e.vx*dt; e.y+=e.vy*dt;
        e.y=Math.max(20,e.y);
        e.face=pcx<ecx?-1:1;
        if(e.cd<=0&&Math.abs(pcx-ecx)<90&&pcy>ecy+4){ e.state='tele'; e.stT=0.65; e.diveTarget={x:pcx,y:pcy}; }
      }else if(e.state==='tele'){
        e.stT-=dt; e.vx*=0.9; e.vy*=0.9; e.x+=e.vx*dt; e.y+=e.vy*dt;
        if(e.stT<=0){
          e.state='dive'; e.stT=1.0;
          const dx=e.diveTarget.x-ecx, dy=e.diveTarget.y-ecy, d=Math.hypot(dx,dy)||1;
          e.vx=dx/d*175; e.vy=Math.max(120,dy/d*175);
        }
      }else if(e.state==='dive'){
        e.stT-=dt; e.face=e.vx<0?-1:1;
        e.x+=e.vx*dt; e.y+=e.vy*dt;
        if(Math.random()<dt*30) particles.push({x:ecx,y:ecy,vx:rand(-15,15),vy:rand(-15,15),life:0.2,maxLife:0.2,color:'#9aa8c8',size:1.5});
        const below=tileAt(Math.floor(ecx/TILE),Math.floor((e.y+e.h+2)/TILE));
        if(isSolid(below)||e.stT<=0){
          e.state='land'; e.stT=0.55; e.vx=0; e.vy=0;
          game.shake=Math.max(game.shake,2);
          burst(ecx,e.y+e.h,'#9aa8c8',8,70,0.35);
        }
      }else if(e.state==='land'){
        // 落地喘息：输出的好机会
        e.stT-=dt; moveEntity(e,dt);
        if(e.stT<=0){ e.state='return'; e.cd=1.9; }
      }else if(e.state==='return'){
        const hx=e.anchor.x+8, hy=e.anchor.y-14;
        e.vx=lerp(e.vx,clamp((hx-ecx)*2.4,-90,90),0.08);
        e.vy=lerp(e.vy,clamp((hy-ecy)*2.4,-90,90),0.08);
        e.x+=e.vx*dt; e.y+=e.vy*dt;
        if(Math.abs(hx-ecx)<8&&Math.abs(hy-ecy)<10){ e.state='patrol'; e.t2=rand(0,3); }
      }
      break;
    }
    case 'swooper':{
      // 堕落天使：保持距离俯冲射击
      const tx=pcx-Math.sign(pcx-ecx||1)*70, ty=Math.min(pcy-40,level.h*TILE-40);
      e.vx=lerp(e.vx,clamp((tx-ecx)*2,-60,60),0.05);
      e.vy=lerp(e.vy,clamp((ty-ecy)*2,-50,50),0.05)+Math.sin(e.t*3)*8*dt*10;
      e.x+=e.vx*dt; e.y+=e.vy*dt;
      e.y=clamp(e.y,16,level.h*TILE-e.h-2);
      e.face=pcx<ecx?-1:1;
      if(e.cd<=0&&dP<190){ prepareEnemyShot(e,'light',pcx,pcy-4,E.projCd); }
      break;
    }
  }

  // 接触伤害
  if(overlap(p,e)) touchPlayer(e,E);
}

function prepareEnemyShot(e,type,x,y,cooldown,opt){
  e.shotT=0.55; e.cd=cooldown+e.shotT; e.pendingShot={type,x,y,opt};
}

function touchPlayer(e,E){
  const p=player;
  const kx=Math.sign(p.x+p.w/2-(e.x+e.w/2))*110;
  hurtPlayer(E.contact||1,{kx,effect:E.effect});
}

function damageEnemy(e,n,kx){
  if(e.dying||e.gone) return;
  // 沉睡中的 Boss：第一下只将其唤醒，不受伤害（防止远程/溅射提前惊醒并磨血）
  if(e.boss&&!e.active){
    activateBoss(e); SFX.hitEnemy(); e.flash=0.15;
    return;
  }
  e.hp-=n; e.flash=0.12; SFX.hitEnemy();
  // 多管血 Boss：打空当前管 → 进入下一形态（血条数=阶段数）
  if(e.boss&&e.bars>1&&e.hp<=0&&e.bar<e.bars){
    e.bar++; e.hp=e.maxhp; e.phase=e.bar; e.skillBag=[];
    recoverBoss(e,1.5);
    resetBossOverload(e);
    for(let i=game_projs.length-1;i>=0;i--) if(game_projs[i].team==='e') game_projs.splice(i,1);
    hazards.length=0;
    SFX.roar(); game.shake=9; game.bossBannerT=1.6;
    burst(e.x+e.w/2,e.y+e.h/2,'#f8d838',26,130,0.9);
    toast('「'+e.name+'」进入下一阶段，新招式解锁！','#d84040');
    return;
  }
  if(kx&&!e.boss){ e.vx=kx; e.vy=-90; e.stunT=0.22; }
  if(e.hp<=0&&!e.dying){
    e.dying=true; e.deadT=0.25;
    game.shake=Math.max(game.shake,1.5);
    burst(e.x+e.w/2,e.y+e.h/2,'#f8d838',12,100,0.5);
    burst(e.x+e.w/2,e.y+e.h/2,'#d84040',8,80,0.45);
    burst(e.x+e.w/2,e.y+e.h/2,'#ffffff',4,60,0.3);
    if(Math.random()<0.18) level.pickups.push({kind:'heart',x:e.x+e.w/2-4,y:e.y,w:8,h:8,t:0});
  }
}

// 唤醒 Boss（靠近 / 先手攻击均可）
function activateBoss(b){
  if(b.active||b.dying||b.gone) return;
  b.active=true; level.bossActive=true; b.cd=1.4;
  b.arena=bossArena(b); b.hoverSide=Math.sign(b.x+b.w/2-player.x)||1;
  resetBossOverload(b);
  b.spawnT=0.55;                     // 苏醒演出：弹起 + 光晕
  SFX.roar(); game.shake=6; game.bossBannerT=1.9;
  toast('「'+b.name+'」现身！','#d84040');
}

// 竞技场仅取出生点附近连续的实地；飞行/冲锋不会把 Boss 带进墙或深坑。
function bossArena(b){
  const row=Math.floor((b.anchor.y+TILE)/TILE), col=Math.floor((b.anchor.x+8)/TILE);
  let left=col, right=col;
  const safe=x=>isSolid(tileAt(x,row))&&!isSolid(tileAt(x,row-1));
  while(left>Math.max(0,col-24)&&safe(left-1)) left--;
  while(right<level.w-1&&safe(right+1)) right++;
  return {left:left*TILE+2,right:(right+1)*TILE-2,floor:row*TILE};
}
function constrainBoss(b){
  const a=b.arena||(b.arena=bossArena(b));
  const x=b.x,y=b.y;
  b.x=clamp(b.x,a.left,a.right-b.w);
  b.y=clamp(b.y,34,a.floor-b.h-1);
  if(b.x!==x) b.vx=0;
  if(b.y!==y) b.vy=0;
}
function bossHoverY(b){
  const a=b.arena||(b.arena=bossArena(b));
  return Math.max(34,a.floor-b.h-BOSSES[b.btype].hoverHeight+Math.sin(b.t*2)*4);
}
function hoverBoss(b,dt){
  const a=b.arena||(b.arena=bossArena(b)), px=clamp(player.x+player.w/2,a.left,a.right);
  const cx=b.x+b.w/2, spacing=b.btype==='judge'?86:96;
  let side=b.hoverSide||Math.sign(cx-px)||1;
  if(side>0&&a.right-px<spacing+b.w/2&&px-a.left>a.right-px) side=-1;
  else if(side<0&&px-a.left<spacing+b.w/2&&a.right-px>px-a.left) side=1;
  b.hoverSide=side;
  const tx=clamp(px+side*spacing+Math.sin(b.t*1.4)*10-b.w/2,a.left,a.right-b.w);
  const ty=bossHoverY(b);
  const blend=1-Math.exp(-10*dt),speed=BOSS_PACE[b.btype].move+8*(b.phase-1);
  b.vx=lerp(b.vx,clamp((tx-b.x)*3.8,-speed,speed),blend);
  const lift=BOSS_PACE[b.btype].lift;
  b.vy=lerp(b.vy,clamp((ty-b.y)*(4.5+(lift-100)/32),-lift,72),blend);
  b.x+=b.vx*dt; b.y+=b.vy*dt; b.face=Math.sign(px-cx)||b.face;
}
function recoverBoss(b,duration){
  b.state='recover'; b.stT=duration||1.1; b.cd=0.55;
  delete b.patternStep; delete b.patternWaves;
  delete b.overloadZone;
  b.vx=0; b.vy=0; b.warningKey=''; b.warningPoints=null; b.warningTarget=null;
  constrainBoss(b);
}
function finishBossSkill(b){
  recoverBoss(b,Math.max(0.76,BOSS_PACE[b.btype].recover-0.04*(b.phase-1)));
}
function resetBossOverload(b){
  b.overloadPhase=b.phase;b.overloadCount=0;b.overloadGap=2;
  b.overloadCd=b.phase>=2?0:8;
}
function canBossOverload(b){
  if(!BOSS_OVERLOADS[b.btype])return false;
  const px=player.x+player.w/2,a=b.arena;
  const ready=player.dashCd.filter(cd=>cd<=0).length;
  return (b.phase>=2||b.overloadCd<=0)&&!player.dead&&px>=a.left+12&&px<=a.right-12&&ready>=(player.fx.speed?3:2);
}
function prepareBossOverload(b){
  const cfg=BOSS_OVERLOADS[b.btype],a=b.arena,px=player.x+player.w/2;
  // 第二至五关的新招统一缩到原来的 80%，预警圈与命中范围同步缩小。
  const radius=Math.min(cfg.radius+8*(b.phase-1),(a.right-a.left)/2-20)*0.8;
  // 按增益/减速实际剩余时间计算，防止蓄力中减速结束后仅靠跑动脱离。
  const speedT=Math.max(0,player.fx.speed?.t||0),slowT=Math.max(0,player.fx.slow?.t||0);
  let walkBudget=radius-cfg.margin,windup=0;
  for(const expiry of [speedT,slowT,Infinity].filter(t=>t>0).sort((x,y)=>x-y)){
    const speed=95*(windup<speedT?1.5:1)*(windup<slowT?0.55:1);
    const step=Math.min(expiry-windup,walkBudget/speed);
    windup+=step;walkBudget-=step*speed;
    if(walkBudget<0.001)break;
  }
  b.stT=Math.max(0.9,windup);b.castDuration=b.stT;
  b.overloadZone={left:px-radius,right:px+radius,floor:a.floor,
    dir:px-a.left<a.right-px?1:-1,color:cfg.color,btype:b.btype};
  b.skillHint='不可挡 / 跳跃无效：L / Shift 连续神行'+(b.overloadZone.dir>0?' →':' ←');
  b.overloadCd=b.phase>=2?0:cfg.cooldown;
  // 覆场蓄力期间留出纯粹的逃生路线，避免旧弹幕与召唤物堵住出口。
  for(let i=game_projs.length-1;i>=0;i--)if(game_projs[i].team==='e')game_projs.splice(i,1);
  hazards.length=0;
  for(const e of level.enemies){
    if(!e.dying){e.stunT=Math.max(e.stunT||0,b.stT+0.85);e.vx=0;e.vy=0;}
  }
}
function beginBossSkill(b,forcedName){
  if(b.overloadPhase!==b.phase)resetBossOverload(b);
  const moves=BOSS_MOVES[b.btype].filter(m=>b.phase>=(m[4]||1)&&b.phase<=(m[5]||3));
  const available=m=>m[0]!=='overloadPre'||canBossOverload(b);
  // 指定招式用于单招调试；仍遵守阶段解锁、冷却和神行储量。
  let move=forcedName?moves.find(m=>m[0]===forcedName&&available(m)):null;
  if(!move&&b.phase>=2&&b.overloadCount>=b.overloadGap&&canBossOverload(b)){
    move=moves.find(m=>m[0]==='overloadPre');
  }
  if(!move){
    // 后阶段的大圈单独按招数调度，不占普通招式的洗牌位置。
    const pool=b.phase>=2?moves.filter(m=>m[0]!=='overloadPre'):moves;
    if(b.phase>=2&&b.skillBag)b.skillBag=b.skillBag.filter(m=>m[0]!=='overloadPre');
    if(!b.skillBag||!b.skillBag.some(available)){
      b.skillBag=pool.slice();
      for(let i=b.skillBag.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [b.skillBag[i],b.skillBag[j]]=[b.skillBag[j],b.skillBag[i]]; }
      if(b.skillBag.length>1&&b.skillBag[b.skillBag.length-1][0]===b.lastSkill) [b.skillBag[0],b.skillBag[b.skillBag.length-1]]=[b.skillBag[b.skillBag.length-1],b.skillBag[0]];
    }
    let index=b.skillBag.findLastIndex(m=>available(m)&&m[0]!==b.lastSkill);
    if(index<0)index=b.skillBag.findLastIndex(available);
    move=b.skillBag.splice(index,1)[0];
  }
  if(b.phase>=2){
    if(move[0]==='overloadPre'){
      b.overloadCount=0;b.overloadGap=b.overloadGap===2?3:2;
    }else b.overloadCount++;
  }
  b.state=move[0]; b.stT=Math.max(0.7,move[1]*BOSS_PACE[b.btype].windup-0.02*(b.phase-1)); b.castDuration=b.stT; b.skillName=move[2]; b.skillHint=move[3];
  const pattern=BOSS_PATTERNS[b.state];
  if(pattern){
    b.patternStep=0; b.patternWaves=pattern.waves+(pattern.extraPhase&&b.phase>=pattern.extraPhase?1:0);
  }else{ delete b.patternStep; delete b.patternWaves; }
  b.lastSkill=b.state; b.vx=0; b.vy=0; b.cd=0; b.trailT=0;
  b.warningKey=''; b.warningTarget=null; b.warningPoints=null;
  delete b.overloadZone;
  if(b.state==='overloadPre')prepareBossOverload(b);
  b.face=Math.sign(player.x+player.w/2-b.x-b.w/2)||b.face;
  bossWarningPoints(b);
}
function bossReadyToCast(b){
  const gap=Math.abs(b.x+b.w/2-player.x-player.w/2);
  // 每次反击窗口结束后先回到空中，再准备下一招，避免连续贴地出招。
  const airborne=b.y<=bossHoverY(b)+8;
  return b.cd<=0&&airborne&&(gap>=72||b.cd<=-1.4);
}
function teleportBossForDash(b){
  const target=bossWarningTarget(b), a=b.arena;
  const side=target.x-a.left>a.right-target.x?-1:1;
  b.x=clamp(target.x+side*100-b.w/2,a.left,a.right-b.w);
  b.y=a.floor-b.h-1; b.vx=0; b.vy=0; b.hoverSide=side;
  b.face=Math.sign(target.x-b.x-b.w/2)||-side;
  b.state='teleportDashPre'; b.stT=0.75; b.castDuration=0.75;
  b.warningKey=''; b.warningPoints=null; b.warningTarget=null;
  b.skillHint='即将横斩：跳跃或神行穿过'; bossWarningPoints(b);
  burst(b.x+b.w/2,b.y+b.h/2,'#9a4fd8',14,80,0.4);
}
function summonBossMinions(b,type,count,cap){
  const living=level.enemies.filter(e=>e.summoned&&!e.dying).length;
  const E=ENEMY_TYPES[type], a=b.arena;
  for(let i=0;i<Math.min(count,cap-living);i++){
    let x=clamp(b.x+b.w/2+(i%2?32:-32),a.left,a.right-E.w);
    if(Math.abs(x-player.x)<42) x=player.x-a.left>a.right-player.x?a.left:a.right-E.w;
    level.enemies.push({etype:type,name:E.name,hp:E.hp,maxhp:E.hp,x,y:a.floor-E.h-2,w:E.w,h:E.h,vx:0,vy:0,dir:i%2?1:-1,face:-1,t:0,cd:1.6,state:'patrol',stT:0,active:true,flash:0,onGround:false,sprName:E.spr,anchor:{x,y:a.floor-E.h-2},lastHitSwing:-1,summoned:true,stunT:0.65});
  }
}

// 新技能复用地面/弹幕系统，所有实际落点与预警使用同一份坐标。
function castPatternSkill(b){
  const points=bossWarningPoints(b);
  for(let i=0;i<points.length;i++){
    const q=points[i];
    if(b.state==='weavePre'){
      game_projs.push({team:'e',x:q.x-3.5,y:40,w:7,h:7,vx:0,vy:100,grav:0,dmg:1,effect:'poison',life:2.6,spr:'p_poison',face:1});
    }else{
      const col=b.btype==='judge'||b.btype==='chaos'?'ink':b.btype==='garg'?'stone':'fire';
      hazards.push({pillar:true,x:q.x,y:q.y-1,w:q.rx*2,h:0,maxH:b.btype==='chaos'?44:30,t:0,rise:0.22,dur:0.48,delay:b.btype==='judge'?i*0.2:0,col});
    }
  }
  SFX.explode(); finishBossSkill(b);
}

function bossPatternAngles(b,cfg){
  const target=bossWarningTarget(b),base=Math.atan2(target.y-b.y-b.h/2,target.x-b.x-b.w/2);
  const n=cfg.count+(b.phase>=2?2:0),angles=[];
  for(let i=0;i<n;i++){
    if(cfg.kind==='ring'){
      // 留一个明确缺口；下一轮旋转，不能一直站在同一条缝里。
      if(i===0||i===1)continue;
      angles.push(base+(i+b.patternStep*0.5)*Math.PI*2/n);
    }else angles.push(base+(i-(n-1)/2)*cfg.spread);
  }
  return angles;
}
function fireBossPattern(b,cfg){
  const cx=b.x+b.w/2,cy=b.y+b.h/2,step=b.patternStep;
  const bullet=(x,y,angle,speed,spr,effect)=>{
    const w=SPR[spr].width,h=SPR[spr].height;
    game_projs.push({team:'e',x:x-w/2,y:y-h/2,w,h,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,grav:0,dmg:1,life:3.1,spr,face:1,effect});
  };
  if(cfg.kind==='fan'||cfg.kind==='ring'){
    for(const angle of bossPatternAngles(b,cfg)){
      const spr=b.state==='eclipsePre'&&step%2?'p_light':cfg.spr;
      bullet(cx,cy,angle,cfg.speed+(b.phase-1)*8,spr,cfg.effect);
    }
  }else{
    for(const q of bossWarningPoints(b)){
      if(cfg.kind==='pillars')hazards.push({pillar:true,x:q.x,y:q.y-1,w:cfg.width,h:0,maxH:cfg.height,t:0,rise:0.14,dur:0.16,delay:0,col:cfg.col});
      else bullet(q.x,Math.max(36,q.y-146),Math.PI/2,cfg.speed+(b.phase-1)*8,cfg.spr,cfg.effect);
    }
    if(cfg.fan){
      const target=bossWarningTarget(b),angle=Math.atan2(target.y-cy,target.x-cx);
      for(let i=0;i<cfg.fan;i++)bullet(cx,cy,angle+(i-(cfg.fan-1)/2)*0.24,160+b.phase*8,'p_light');
    }
  }
  SFX.shoot();
}
function updateBossPattern(b,dt){
  const cfg=BOSS_PATTERNS[b.state];
  bossWarningPoints(b); b.stT-=dt; b.t+=dt;
  if(b.stT>0)return;
  fireBossPattern(b,cfg); b.patternStep++;
  if(b.patternStep>=b.patternWaves){finishBossSkill(b);return;}
  b.stT=Math.max(0.7,cfg.interval-0.02*(b.phase-1)); b.castDuration=b.stT;
  b.warningKey=''; b.warningPoints=null; b.warningTarget=null;
  bossWarningPoints(b);
}

/* ============================================================
 * Boss AI
 * ============================================================ */
function updateBoss(b,dt){
  const p=player;
  if(b.gone)return;
  if(b.dying){ b.deadT-=dt; if(b.deadT<=0) bossDie(b); return; }
  if(!b.active){
    if(Math.abs(p.x-b.x)<170) activateBoss(b);
    return;
  }
  b.overloadCd=Math.max(0,(b.overloadCd||0)-dt);
  if(b.flash>0) b.flash=Math.max(0,b.flash-dt);
  if(b.spawnT>0) b.spawnT=Math.max(0,b.spawnT-dt);
  if(b.state==='overloadPre'){
    b.stT-=dt;b.t+=dt;bossWarningPoints(b);
    if(b.stT<=0){
      hazards.push({...b.overloadZone,overload:true,t:0,dur:0.65});
      SFX.explode();game.shake=Math.max(game.shake,5);
      recoverBoss(b,Math.max(1.05,BOSS_PACE[b.btype].recover));
    }
    return;
  }
  if(BOSS_PATTERNS[b.state]){ updateBossPattern(b,dt); return; }
  if(b.state==='recover'){
    b.stT-=dt;
    // 降低但不贴地：留给上斩和跳斩的反击窗口，没有接触伤害。
    b.y=lerp(b.y,b.arena.floor-b.h-22,1-Math.exp(-8*dt));
    constrainBoss(b);
    if(b.stT<=0){ b.state='idle'; b.cd=Math.max(0.1,BOSS_PACE[b.btype].gap-0.025*(b.phase-1)); }
    return;
  }
  if(['faultPre','weavePre','sealPre','furnacePre','riftPre'].includes(b.state)){
    bossWarningPoints(b); b.stT-=dt;
    if(b.stT<=0) castPatternSkill(b);
    return;
  }
  if(b.state==='teleportDashPre'){
    bossWarningPoints(b); b.stT-=dt;
    if(b.stT<=0){ b.state='dash'; b.stT=0.48; b.vx=b.face*210; }
    return;
  }
  // 横斩/冲锋仅在有预警的蓄力期间下降，锁定地面路线后再发动。
  if(b.state==='dashPre'){
    b.y=lerp(b.y,b.arena.floor-b.h-4,1-Math.exp(-7*dt)); b.vy=0;
  }
  if(BOSS_WARN_STATES.has(b.state)){
    bossWarningPoints(b);
  }else{
    b.warningKey='';
    b.warningPoints=null;
    b.warningTarget=null;
  }
  b.t+=dt; b.cd=(b.cd||0)-dt; b.stT-=dt;
  const pcx=p.x+p.w/2, pcy=p.y+p.h/2, bcx=b.x+b.w/2, bcy=b.y+b.h/2;
  const wasBossAttack=BOSS_ATK.has(b.state);
  if(b.bars===1&&b.hp<b.maxhp*0.45&&b.phase===1){ b.phase=2; resetBossOverload(b); b.stT=0.8; b.state='rage'; game.shake=8; SFX.roar(); burst(bcx,bcy,'#f8d838',24,120,0.8); toast(b.name+' 暴怒了！','#d84040'); }
  if(b.state==='rage'&&b.stT<=0) b.state='idle';

  // 掉出世界救援：送回竞技场出生点，不掉血
  if(b.y>level.h*TILE+40){
    b.x=b.anchor.x+8-b.w/2; b.y=bossHoverY(b);
    b.vx=0; b.vy=0; b.state='idle'; b.cd=1;
    burst(b.x+b.w/2,b.y+b.h/2,'#7fdce8',16,90,0.6);
    toast('「'+b.name+'」爬回了竞技场','#7fdce8');
  }

  const pc2=b.phase===2;
  switch(b.btype){
    /* ---- 石像鬼王（双血条：第二条血狂暴——更快 + 落石雨） ---- */
    case 'garg':{
      if(b.state==='idle'){
        hoverBoss(b,dt);
        if(bossReadyToCast(b)) beginBossSkill(b);
      }else if(b.state==='roar'){
        // 咆哮：左右两道贯穿地面的冲击波
        b.vx*=0.9; b.vy*=0.9; b.x+=b.vx*dt; b.y+=b.vy*dt;
        if(Math.random()<dt*24) particles.push({x:bcx+rand(-14,14),y:bcy+rand(-8,8),vx:0,vy:0,life:0.25,maxLife:0.25,color:'#9aa8c8',size:2});
        if(b.stT<=0){
          SFX.roar(); game.shake=5;
          for(const dir of [-1,1]){
            game_projs.push({team:'e',x:bcx+dir*20,y:b.arena.floor-10,w:12,h:10,vx:dir*145,vy:0,grav:0,dmg:1,life:2,spr:'p_shard',face:dir});
          }
          b.state='idle';
        }
      }else if(b.state==='rainPre'){
        // 飞到玩家上空准备落石
        const target=bossWarningTarget(b);
        const tx=target.x-b.w/2, ty=Math.max(20,target.y-120);
        b.vx=lerp(b.vx,(tx-b.x)*3,0.12); b.vy=lerp(b.vy,(ty-b.y)*3,0.12);
        b.x+=b.vx*dt; b.y+=b.vy*dt;
        if(Math.random()<dt*30) particles.push({x:bcx+rand(-12,12),y:bcy+rand(-10,10),vx:0,vy:0,life:0.25,maxLife:0.25,color:'#f8d838',size:2});
        if(b.stT<=0){ b.state='rain'; b.stT=1.2; b.rainT=0; b.rainIndex=0; }
      }else if(b.state==='rain'){
        b.rainT=(b.rainT||0)-dt;
        b.vy=Math.sin(b.t*7)*10; b.x+=b.vx*dt*0.3; b.y+=b.vy*dt;
        const rainPoints=bossWarningPoints(b);
        if(b.rainT<=0&&b.rainIndex<rainPoints.length){
          b.rainT=0.16;
          const sx=rainPoints[b.rainIndex++].x;
          game_projs.push({team:'e',x:sx-2.5,y:36,w:5,h:5,vx:0,vy:125,grav:1,dmg:1,life:2.5,spr:'p_shard',face:1});
        }
        if(b.stT<=0){ b.state='idle'; b.cd=1.1; }
      }else if(b.state==='volley'){
        b.vx*=0.92; b.vy*=0.92; b.x+=b.vx*dt; b.y+=b.vy*dt;
        b.face=pcx<bcx?-1:1;
        if(Math.random()<dt*24) particles.push({x:bcx+rand(-10,10),y:bcy+rand(-8,8),vx:0,vy:0,life:0.22,maxLife:0.22,color:'#c0c0d0',size:1.5});
        if(b.stT<=0){
          const target=bossWarningTarget(b);
          const n=pc2?5:3, base=Math.atan2(target.y-bcy,target.x-bcx);
          for(let i=0;i<n;i++){
            const a=base+(i-(n-1)/2)*(pc2?0.3:0.26);
            game_projs.push({team:'e',x:bcx-2,y:bcy-2,w:5,h:5,vx:Math.cos(a)*160,vy:Math.sin(a)*160,grav:0,dmg:1,life:2.5,spr:'p_shard',face:1});
          }
          SFX.shoot(); b.state='idle';
        }
      }else if(b.state==='tele'){
        b.vx*=0.9; b.vy*=0.9; b.x+=b.vx*dt; b.y+=b.vy*dt;
        if(Math.random()<dt*30) particles.push({x:bcx+rand(-12,12),y:bcy+rand(-10,10),vx:0,vy:0,life:0.25,maxLife:0.25,color:'#c0c0d0',size:2});
        if(b.stT<=0){
          const target=bossWarningTarget(b);
          b.state='dive'; b.stT=0.48; b.vx=(target.x-bcx)/0.48; b.vy=(target.y-bcy)/0.48;
        }
      }else if(b.state==='dive'){
        b.x+=b.vx*dt; b.y+=b.vy*dt;
        if(Math.random()<dt*40) particles.push({x:bcx,y:bcy,vx:rand(-20,20),vy:rand(-20,20),life:0.2,maxLife:0.2,color:'#9aa8c8',size:1.5});
        const feet=b.y+b.h;
        const below=tileAt(Math.floor(bcx/TILE),Math.floor((feet+2)/TILE));
        if(isSolid(below)||feet>level.h*TILE||b.stT<=0){
          b.state='idle'; game.shake=5; SFX.explode();
          const nShard=pc2?6:4;
          for(let i=0;i<nShard;i++){
            const dir=i%2?1:-1;
            game_projs.push({team:'e',x:bcx-2,y:feet-14,w:5,h:5,vx:dir*(90+rand(0,80)),vy:rand(-200,-120),grav:1,dmg:1,life:2,spr:'p_shard',face:dir});
          }
          burst(bcx,feet,'#9aa8c8',12,90,0.4);
        }
      }
      break;
    }
    /* ---- 蛛母（飞行蛾母：悬停 + 俯冲扑击） ---- */
    case 'spider':{
      if(b.state==='idle'||b.state==='hover'){
        b.state='hover';
        hoverBoss(b,dt);
        if(bossReadyToCast(b)) beginBossSkill(b);
      }else if(b.state==='poisonPre'){
        b.vx*=0.9; b.vy*=0.9; b.x+=b.vx*dt; b.y+=b.vy*dt;
        if(Math.random()<dt*24) particles.push({x:bcx+rand(-12,12),y:bcy+rand(-8,8),vx:0,vy:-20,life:0.3,maxLife:0.3,color:'#4fb84f',size:1.5});
        if(b.stT<=0){
          const target=bossWarningTarget(b), base=Math.atan2(target.y-bcy,target.x-bcx);
          for(const spread of [-0.38,-0.19,0,0.19,0.38]){
            const angle=base+spread;
            spawnEnemyProj(b,'poison',target.x,target.y,{vx:Math.cos(angle)*155,vy:Math.sin(angle)*155,grav:0});
          }
          SFX.shoot(); b.state='hover';
        }
      }else if(b.state==='webPre'){
        b.vx*=0.9; b.vy*=0.9; b.x+=b.vx*dt; b.y+=b.vy*dt;
        if(Math.random()<dt*24) particles.push({x:bcx+rand(-12,12),y:bcy+rand(-8,8),vx:0,vy:0,life:0.3,maxLife:0.3,color:'#c0c0d0',size:1.5});
        if(b.stT<=0){
          const target=bossWarningTarget(b), angle=Math.atan2(target.y-bcy,target.x-bcx);
          const speed=pc2?220:195;
          for(const spread of pc2?[-0.16,0,0.16]:[-0.12,0,0.12]){
            const webAngle=angle+spread;
            spawnEnemyProj(b,'web',target.x,target.y,{vx:Math.cos(webAngle)*speed,vy:Math.sin(webAngle)*speed,grav:0});
          }
          SFX.shoot(); b.state='hover';
        }
      }else if(b.state==='summonPre'){
        b.vx*=0.9; b.vy*=0.9; b.x+=b.vx*dt; b.y+=b.vy*dt;
        if(Math.random()<dt*20) particles.push({x:bcx+rand(-10,10),y:bcy+rand(-8,8),vx:0,vy:20,life:0.3,maxLife:0.3,color:'#9a4fd8',size:1.5});
        if(b.stT<=0){
          summonBossMinions(b,'9',2,3);
          b.state='hover';
        }
      }else if(b.state==='venomPre'){
        // 万毒天降：延长蓄力后一次性落下毒液
        b.vx*=0.9; b.vy*=0.9; b.x+=b.vx*dt; b.y+=b.vy*dt;
        if(Math.random()<dt*24) particles.push({x:bcx+rand(-12,12),y:bcy+rand(-8,8),vx:0,vy:20,life:0.3,maxLife:0.3,color:'#4fb84f',size:1.5});
        if(b.stT<=0){
          const target=bossWarningTarget(b);
          for(const point of bossWarningPoints(b)){
            game_projs.push({team:'e',x:point.x-3.5,y:36,w:7,h:7,vx:0,vy:120,grav:1,dmg:1,effect:'poison',life:3,spr:'p_poison',face:1});
          }
          SFX.explode(); b.state='hover';
        }
      }else if(b.state==='webrPre'){
        // 天罗蛛网阵：扇形五网封锁大范围
        b.vx*=0.9; b.vy*=0.9; b.x+=b.vx*dt; b.y+=b.vy*dt;
        if(Math.random()<dt*24) particles.push({x:bcx+rand(-12,12),y:bcy+rand(-8,8),vx:0,vy:0,life:0.3,maxLife:0.3,color:'#c0c0d0',size:1.5});
        if(b.stT<=0){
          const target=bossWarningTarget(b), base=Math.atan2(target.y-bcy,target.x-bcx);
          for(let i=0;i<7;i++){
            const a=base+(i-3)*0.24;
            game_projs.push({team:'e',x:bcx-4,y:bcy-4,w:8,h:8,vx:Math.cos(a)*150,vy:Math.sin(a)*150,grav:0,dmg:1,effect:'slow',life:3,spr:'p_web',face:1});
          }
          SFX.shoot(); b.state='hover';
        }
      }else if(b.state==='swoopPre'){
        b.vx*=0.9; b.vy*=0.9; b.x+=b.vx*dt; b.y+=b.vy*dt;
        const target=bossWarningTarget(b);
        b.face=Math.sign(target.x-bcx)||b.face;
        if(Math.random()<dt*24) particles.push({x:bcx+rand(-12,12),y:bcy+rand(-8,8),vx:0,vy:0,life:0.3,maxLife:0.3,color:'#9a4fd8',size:1.5});
        if(b.stT<=0){
          b.state='swoop'; b.stT=0.48;
          const dx=target.x-bcx, dy=target.y-bcy, d=Math.hypot(dx,dy)||1;
          b.vx=dx/0.48; b.vy=dy/0.48;
        }
      }else if(b.state==='swoop'){
        b.x+=b.vx*dt; b.y+=b.vy*dt;
        if(Math.random()<dt*30) particles.push({x:bcx,y:bcy,vx:rand(-20,20),vy:rand(-20,20),life:0.25,maxLife:0.25,color:'#9a4fd8',size:1.5});
        if(b.stT<=0){ b.state='hover'; b.cd=Math.max(b.cd,0.6); }
      }
      break;
    }
    /* ---- 判官 ---- */
    case 'judge':{
      if(b.state==='idle'){
        // 侧面悬停，蓄力前留出距离。
        hoverBoss(b,dt);
        if(bossReadyToCast(b)) beginBossSkill(b);
      }else if(b.state==='blinkPre'){
        // 墨影闪斩：消失后闪到玩家侧面，接一段快速冲刺
        b.vx*=0.86; b.vy*=0.86;
        if(Math.random()<dt*30) particles.push({x:bcx+rand(-10,10),y:bcy+rand(-12,12),vx:0,vy:0,life:0.2,maxLife:0.2,color:'#9a4fd8',size:2});
        if(b.stT<=0){
          const target=bossWarningTarget(b);
          teleportBossForDash(b);
          SFX.roar();
        }
      }else if(b.state==='inkcross'){
        // 万墨归宗：八方墨弹爆发
        b.vx*=0.9; b.vy*=0.9; b.x+=b.vx*dt; b.y+=b.vy*dt;
        if(Math.random()<dt*26) particles.push({x:bcx+rand(-10,10),y:bcy+rand(-12,12),vx:0,vy:0,life:0.25,maxLife:0.25,color:'#5a2a8c',size:1.5});
        if(b.stT<=0){
          SFX.roar(); game.shake=4;
          for(let i=0;i<12;i++){
            const a=Math.PI*2*i/12;
            game_projs.push({team:'e',x:bcx-3,y:bcy-3,w:7,h:7,vx:Math.cos(a)*118,vy:Math.sin(a)*118,grav:0,dmg:1,effect:'curse',life:3.5,spr:'p_ink',face:1});
          }
          b.state='idle';
        }
      }else if(b.state==='pillarPre'){
        const target=bossWarningTarget(b);
        b.face=Math.sign(target.x-bcx)||b.face;
        if(Math.random()<dt*26) particles.push({x:bcx+rand(-8,8),y:bcy+rand(-10,10),vx:0,vy:0,life:0.25,maxLife:0.25,color:'#5a2a8c',size:1.5});
        if(b.stT<=0){
          SFX.explode();
          for(const point of bossWarningPoints(b)){
            hazards.push({pillar:true,x:point.x,y:point.y-1,w:10,h:0,maxH:28,t:0,rise:0.3,dur:0.7,col:'ink'});
          }
          b.state='idle';
        }
      }else if(b.state==='inkfan'){
        if(b.stT<=0){
          const target=bossWarningTarget(b);
          const n=pc2?7:5;
          for(let i=0;i<n;i++){
            const a=Math.atan2(target.y-bcy,target.x-bcx)+(i-(n-1)/2)*0.32;
            game_projs.push({team:'e',x:bcx-3,y:bcy-3,w:7,h:7,vx:Math.cos(a)*130,vy:Math.sin(a)*130,grav:0,dmg:1,effect:'curse',life:3.5,spr:'p_ink',face:1});
          }
          SFX.shoot(); b.state='idle';
        }
      }else if(b.state==='dashPre'){
        const target=bossWarningTarget(b);
        b.face=Math.sign(target.x-bcx)||b.face;
        if(Math.random()<dt*30) particles.push({x:bcx+rand(-8,8),y:bcy+rand(-10,10),vx:0,vy:0,life:0.25,maxLife:0.25,color:'#9a4fd8',size:1.5});
        if(b.stT<=0){ b.state='dash'; b.stT=0.5; b.vx=b.face*235; }
      }else if(b.state==='dash'){
        b.x+=b.vx*dt;
        b.trailT=(b.trailT||0)-dt;
        if(pc2&&b.trailT<=0){ // 二阶段冲锋沿途留墨柱
          b.trailT=0.3;
          hazards.push({pillar:true,x:bcx,y:groundTop(bcx,player.y+player.h),w:9,h:0,maxH:22,t:0,rise:0.2,dur:0.5,col:'ink'});
        }
        if(Math.random()<dt*40) particles.push({x:bcx,y:bcy+rand(-8,8),vx:-b.vx*0.2,vy:0,life:0.25,maxLife:0.25,color:'#8c2020',size:2});
        if(b.stT<=0||b.x<10||b.x>level.w*TILE-40){ b.state='idle'; b.vx=0; }
      }else if(b.state==='summon'){
        if(b.stT<=0){
          summonBossMinions(b,'6',2,3);
          b.state='idle';
        }
      }
      // 判官受近战会短暂瞬移反击（简化：无）
      break;
    }
    /* ---- 炎魔（飞行魔神：悬停 + 空中冲锋留火） ---- */
    case 'flame':{
      if(b.state==='idle'||b.state==='walk'||b.state==='hover'){
        b.state='hover';
        hoverBoss(b,dt);
        if(bossReadyToCast(b)) beginBossSkill(b);
      }else if(b.state==='infernoPre'){
        // 炼狱火环：以 Boss 为中心向八方喷出灼烧火环
        b.vx*=0.9; b.vy*=0.9; b.x+=b.vx*dt; b.y+=b.vy*dt;
        if(Math.random()<dt*28) particles.push({x:bcx+rand(-15,15),y:bcy+rand(-12,12),vx:0,vy:0,life:0.25,maxLife:0.25,color:'#f08020',size:2});
        if(b.stT<=0){
          for(let i=0;i<8;i++){
            const a=Math.PI*2*i/8;
            game_projs.push({team:'e',x:bcx-3,y:bcy-3,w:7,h:7,vx:Math.cos(a)*145,vy:Math.sin(a)*145,grav:0,dmg:1,effect:'burn',life:3,spr:'p_fire',face:1});
          }
          SFX.explode(); b.state='hover';
        }
      }else if(b.state==='meteorPre'){
        // 陨火连坠：多枚带灼烧的火球从上方落下
        b.vx*=0.9; b.vy*=0.9; b.x+=b.vx*dt; b.y+=b.vy*dt;
        if(Math.random()<dt*26) particles.push({x:bcx+rand(-14,14),y:bcy+rand(-10,10),vx:0,vy:-30,life:0.3,maxLife:0.3,color:'#f8d838',size:2});
        if(b.stT<=0){
          const target=bossWarningTarget(b);
          for(const point of bossWarningPoints(b)){
            game_projs.push({team:'e',x:point.x-3.5,y:36,w:7,h:7,vx:0,vy:130,grav:1,dmg:1,effect:'burn',life:3,spr:'p_fire',face:1});
          }
          SFX.explode(); b.state='hover';
        }
      }else if(b.state==='fanPre'){
        // 烈焰风暴：朝玩家扇形喷出五发火球
        b.vx*=0.9; b.vy*=0.9; b.x+=b.vx*dt; b.y+=b.vy*dt;
        const target=bossWarningTarget(b);
        b.face=Math.sign(target.x-bcx)||b.face;
        if(Math.random()<dt*28) particles.push({x:bcx+rand(-14,14),y:bcy+rand(-10,10),vx:0,vy:-40,life:0.3,maxLife:0.3,color:'#f08020',size:2});
        if(b.stT<=0){
          const base=Math.atan2(target.y-bcy,target.x-bcx);
          for(let i=0;i<5;i++){
            const a=base+(i-2)*0.28;
            game_projs.push({team:'e',x:bcx-3,y:bcy-3,w:7,h:7,vx:Math.cos(a)*175,vy:Math.sin(a)*175,grav:0,dmg:1,effect:'burn',life:3,spr:'p_fire',face:1});
          }
          SFX.explode(); b.state='hover';
        }
      }else if(b.state==='dashPre'){
        b.vx*=0.9; b.vy*=0.9; b.x+=b.vx*dt; b.y+=b.vy*dt;
        const target=bossWarningTarget(b);
        b.face=Math.sign(target.x-bcx)||b.face;
        if(Math.random()<dt*30) particles.push({x:bcx+rand(-14,14),y:bcy+rand(-12,12),vx:0,vy:-50,life:0.3,maxLife:0.3,color:'#f08020',size:2});
        if(b.stT<=0){ b.state='dash'; b.stT=0.52; b.vx=b.face*220; b.vy=0; SFX.roar(); }
      }else if(b.state==='dash'){
        b.x+=b.vx*dt;
        b.trailT=(b.trailT||0)-dt;
        if(b.trailT<=0){ // 冲锋沿途在地面留下火焰
          b.trailT=0.16;
          hazards.push({pillar:true,x:bcx,y:groundTop(bcx,player.y+player.h),w:9,h:0,maxH:18,t:0,rise:0.15,dur:0.4});
        }
        if(b.stT<=0||b.x<10||b.x>level.w*TILE-b.w-10){ b.state='hover'; b.cd=Math.max(b.cd,0.7); game.shake=Math.max(game.shake,3); }
      }else if(b.state==='slamPre'){
        b.vx*=0.9; b.vy*=0.9; b.x+=b.vx*dt; b.y+=b.vy*dt;
        if(b.stT<=0){
          game.shake=7; SFX.explode();
          const target=bossWarningTarget(b);
          for(const point of bossWarningPoints(b)){
            hazards.push({pillar:true,x:point.x,y:point.y-1,w:10,h:0,maxH:30,t:0,rise:0.28,dur:0.65});
          }
          b.state='hover';
        }
      }else if(b.state==='hurlPre'){
        b.vx*=0.9; b.vy*=0.9; b.x+=b.vx*dt; b.y+=b.vy*dt;
        if(b.stT<=0){
          b.state='hover';
          const target=bossWarningTarget(b);
          const angle=Math.atan2(target.y-bcy,target.x-bcx);
          for(const spread of [-0.18,0.18]) spawnEnemyProj(b,'fire',target.x,target.y,{vx:Math.cos(angle+spread)*125,vy:Math.sin(angle+spread)*125});
        }
      }
      if(pc2&&Math.random()<dt*14) particles.push({x:bcx+rand(-14,14),y:b.y+rand(0,b.h),vx:rand(-10,10),vy:-60,life:0.4,maxLife:0.4,color:'#f08020',size:2});
      break;
    }
    /* ---- 混沌魔神 ---- */
    case 'chaos':{
      if(b.phase===1){
        // 西方形态：飞行 + 光弹环 + 俯冲
        if(b.state==='idle'){
          hoverBoss(b,dt);
        if(bossReadyToCast(b)) beginBossSkill(b);
      }else if(b.state==='ringPre'){
          if(Math.random()<dt*28) particles.push({x:bcx+rand(-12,12),y:bcy+rand(-12,12),vx:0,vy:0,life:0.25,maxLife:0.25,color:'#7fdce8',size:1.5});
          if(b.stT<=0){
            for(let i=0;i<8;i++){ const a=Math.PI*2*i/8;
              game_projs.push({team:'e',x:bcx-2,y:bcy-2,w:4,h:10,vx:Math.cos(a)*120,vy:Math.sin(a)*120,grav:0,dmg:1,life:3,spr:'p_light',face:1}); }
            SFX.shoot(); b.state='idle';
          }
        }else if(b.state==='triplePre'){
          if(Math.random()<dt*28) particles.push({x:bcx+rand(-10,10),y:bcy+rand(-10,10),vx:0,vy:0,life:0.25,maxLife:0.25,color:'#7fdce8',size:1.5});
          if(b.stT<=0){
            const target=bossWarningTarget(b), base=Math.atan2(target.y-bcy,target.x-bcx);
            for(let i=0;i<3;i++){
              const a=base+(i-1)*0.2;
              game_projs.push({team:'e',x:bcx-2,y:bcy-2,w:4,h:10,vx:Math.cos(a)*165,vy:Math.sin(a)*165,grav:0,dmg:1,life:3,spr:'p_light',face:1});
            }
            SFX.shoot(); b.state='idle';
          }
        }else if(b.state==='divePre'){
          if(b.stT<=0){
            const target=bossWarningTarget(b);
            b.state='dive'; b.stT=0.48; b.vx=(target.x-bcx)/0.48; b.vy=(target.y-bcy)/0.48;
          }
        }else if(b.state==='dive'){
          b.x+=b.vx*dt; b.y+=b.vy*dt;
          if(b.stT<=0){ b.state='idle'; }
        }
      }else{
        // 东方形态（第二管血）与狂化（第三管血）：飞行悬停 + 墨浪 + 召唤 + 噬魂珠 + 瞬移斩
        const p3=b.phase>=3;
        if(b.state==='idle'||b.state==='hover'){
          b.state='hover';
          hoverBoss(b,dt);
        if(bossReadyToCast(b)) beginBossSkill(b);
      }else if(b.state==='inkRainPre'){
          b.vx*=0.9; b.vy*=0.9; b.x+=b.vx*dt; b.y+=b.vy*dt;
          if(Math.random()<dt*28) particles.push({x:bcx+rand(-12,12),y:bcy+rand(-10,10),vx:0,vy:20,life:0.3,maxLife:0.3,color:'#9a4fd8',size:1.5});
          if(b.stT<=0){
            const n=p3?7:5;
            for(let i=0;i<n;i++) game_projs.push({team:'e',x:bcx-3,y:bcy,w:7,h:7,vx:b.face*(70+i*(p3?26:22)),vy:-200-i*8,grav:1,dmg:1,effect:'curse',life:4,spr:'p_ink',face:b.face});
            SFX.shoot(); b.state='hover';
          }
        }else if(b.state==='summonPre'){
          b.vx*=0.9; b.vy*=0.9; b.x+=b.vx*dt; b.y+=b.vy*dt;
          if(Math.random()<dt*26) particles.push({x:bcx+rand(-12,12),y:bcy+rand(-12,12),vx:0,vy:0,life:0.3,maxLife:0.3,color:'#7fdce8',size:1.5});
          if(b.stT<=0){
            summonBossMinions(b,'6',2,p3?4:3);
            b.state='hover';
          }
        }else if(b.state==='orbPre'){
          b.vx*=0.9; b.vy*=0.9; b.x+=b.vx*dt; b.y+=b.vy*dt;
          if(Math.random()<dt*26) particles.push({x:bcx+rand(-12,12),y:bcy+rand(-12,12),vx:0,vy:0,life:0.25,maxLife:0.25,color:'#e08830',size:1.5});
          if(b.stT<=0){
            const n=p3?4:3;
            for(let i=0;i<n;i++){
              const a=rand(0,Math.PI*2), sp=p3?100:85;
              game_projs.push({team:'e',x:bcx-4,y:bcy-4,w:8,h:8,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,grav:0,dmg:1,effect:'curse',life:3.2,spr:'p_ink',face:1,home:true,homeT:1.1});
            }
            SFX.debuff(); b.state='hover';
          }
        }else if(b.state==='tpOut'){
          if(Math.random()<dt*40) particles.push({x:bcx+rand(-12,12),y:bcy+rand(-12,12),vx:0,vy:0,life:0.25,maxLife:0.25,color:'#9a4fd8',size:2});
          if(b.stT<=0){
            const target=bossWarningTarget(b);
            teleportBossForDash(b);
          }
        }else if(b.state==='nova'){
          // 混沌新星：蓄力后 12 向大爆发（光弹与墨弹交替）
          b.vx*=0.9; b.vy*=0.9; b.x+=b.vx*dt; b.y+=b.vy*dt;
          if(Math.random()<dt*34){
            const a=rand(0,Math.PI*2), rr=rand(10,26);
            particles.push({x:bcx+Math.cos(a)*rr,y:bcy+Math.sin(a)*rr,vx:Math.cos(a)*30,vy:Math.sin(a)*30,life:0.3,maxLife:0.3,color:'#e08830',size:2});
          }
          if(b.stT<=0){
            SFX.explode(); game.shake=7;
            for(let i=0;i<12;i++){
              const a=Math.PI*2*i/12;
              game_projs.push({team:'e',x:bcx-3,y:bcy-3,w:7,h:7,vx:Math.cos(a)*132,vy:Math.sin(a)*132,grav:0,dmg:1,effect:i%2?'curse':undefined,life:3.5,spr:i%2?'p_ink':'p_light',face:1});
            }
            b.state='hover'; b.cd=Math.max(b.cd,0.8);
          }
        }else if(b.state==='dash'){
          b.x+=b.vx*dt;
          if(Math.random()<dt*30) particles.push({x:b.x+b.w/2,y:b.y+b.h/2+rand(-8,8),vx:-b.vx*0.2,vy:0,life:0.25,maxLife:0.25,color:'#9a4fd8',size:2});
          if(b.stT<=0||b.x<10||b.x>level.w*TILE-b.w-10){ b.state='idle'; b.vx=0; }
        }
      }
      break;
    }
  }
  constrainBoss(b);
  if(wasBossAttack&&!BOSS_ATK.has(b.state)) finishBossSkill(b);
  // Boss 接触伤害
  if(!p.dead&&['dash','dive','swoop','charge'].includes(b.state)&&overlap(p,b)){
    const eff=b.btype==='flame'?'burn':(b.btype==='chaos'&&b.phase===2?'curse':undefined);
    touchPlayer(b,{contact:1,effect:eff});
  }
}

// Boss 处于攻击/蓄力姿势的状态集合
const BOSS_ATK=new Set(['faultPre','weavePre','sealPre','furnacePre','riftPre','teleportDashPre','inkcross','summon','summonPre','tele','volley','rainPre','rain','roar','swoopPre','swoop','venomPre','webrPre','blinkPre','dashPre','dash','inkcross','inkfan','pillarPre','summon','summonPre','slamPre','hurlPre','meteorPre','infernoPre','fanPre','nova','tpOut','divePre','dive','rage','charge','ringPre','triplePre','poisonPre','webPre','inkRainPre','orbPre']);
const BOSS_WARN_STATES=new Set(['faultPre','weavePre','sealPre','furnacePre','riftPre','teleportDashPre','inkcross','summon','summonPre','tele','volley','rainPre','rain','roar','swoopPre','venomPre','webrPre','blinkPre','inkfan','pillarPre','slamPre','dashPre','hurlPre','meteorPre','infernoPre','fanPre','nova','tpOut','divePre','ringPre','triplePre','poisonPre','webPre','inkRainPre','orbPre']);
for(const state of Object.keys(BOSS_PATTERNS)){ BOSS_ATK.add(state); BOSS_WARN_STATES.add(state); }
BOSS_ATK.add('overloadPre');BOSS_WARN_STATES.add('overloadPre');

function warningSurfaceY(px,fromY){
  return groundTop(px,fromY)+1;
}

function bossWarningPoints(b){
  const playerX=player.x+player.w/2;
  const state=b.state;
  if(!BOSS_WARN_STATES.has(state)){
    b.warningKey='';
    b.warningPoints=null;
    b.warningTarget=null;
    return [];
  }
  const phaseKey=(b.phase||1);
  const carryWarning=state==='rain'&&b.warningKey==='rainPre|'+phaseKey;
  if(carryWarning&&b.warningPoints&&b.warningTarget){
    b.warningKey=state+'|'+phaseKey;
    return b.warningPoints;
  }
  const warningKey=state+'|'+phaseKey;
  if(b.warningKey===warningKey&&b.warningPoints&&b.warningTarget) return b.warningPoints;
  const bossX=b.x+b.w/2, bossGround=warningSurfaceY(bossX,b.y+b.h);
  const playerGround=warningSurfaceY(playerX,player.y+player.h);
  const points=[];
  const add=(x,y,rx,ry)=>points.push({x,y,rx,ry});
  const addPlayer=(rx,ry)=>add(playerX,playerGround,rx,ry);
  const addBoss=(rx,ry)=>add(bossX,bossGround,rx,ry);
  const a=b.arena||(b.arena=bossArena(b));
  const addGround=(x,rx,ry)=>{
    if(x<a.left+rx||x>a.right-rx) return;
    add(x,a.floor+1,rx,ry);
  };
  const dashRx=b.w/2+player.w/2, dashRy=Math.max(8,b.h/2);

  const pattern=BOSS_PATTERNS[state];
  if(state==='overloadPre'){
    const zone=b.overloadZone;
    add((zone.left+zone.right)/2,zone.floor,(zone.right-zone.left)/2,2.4);
  }else if(pattern){
    if(pattern.offsets){
      const shift=(b.patternStep%2?pattern.shift:0);
      for(const offset of pattern.offsets)addGround(playerX+offset+shift,pattern.width?pattern.width/2:6,2.4);
    }else addPlayer(24,2.4);
  }else if(['faultPre','sealPre','riftPre','weavePre','furnacePre'].includes(state)){
    const offsets=state==='weavePre'?[-68,-34,0,34,68]:state==='furnacePre'?[-64,-32,32,64]:[-42,0,42];
    for(const offset of offsets) addGround(playerX+offset,state==='weavePre'?6:7,2.4);
  }else if(state==='roar'){
    add(bossX-24,bossGround,30,2.4);
    add(bossX+24,bossGround,30,2.4);
  }else if(state==='infernoPre'||state==='ringPre'||state==='nova'||state==='orbPre'){
    const size=state==='orbPre'?28:34;
    addBoss(size,2.4);
  }else if(state==='pillarPre'||state==='slamPre'){
    const count=state==='slamPre'?(b.phase===2?5:3):(b.phase===2?7:5);
    const gap=state==='slamPre'?38:(b.phase===2?46:36);
    for(let i=0;i<count;i++){
      const x=playerX+(i-(count-1)/2)*gap;
      addGround(x,6,2.4);
    }
  }else if(state==='dashPre'||state==='teleportDashPre'){
    if(b.btype==='flame'){
      const count=4, step=48;
      for(let i=1;i<=count;i++){
        const x=clamp(bossX+b.face*i*step,10,level.w*TILE-10);
        addGround(x,9,2.4);
      }
    }else{
      addPlayer(dashRx,dashRy);
    }
  }else if(state==='meteorPre'||state==='venomPre'){
    for(let i=-3;i<=3;i++) addGround(playerX+i*32,6,2.4);
  }else if(state==='rainPre'||state==='rain'){
    for(let i=-3;i<=3;i++) addGround(playerX+i*34,5,2.4);
  }else if(state==='swoopPre'||state==='tele'||state==='blinkPre'||state==='divePre'||state==='tpOut'){
    addPlayer(dashRx,dashRy);
  }else if(state==='inkRainPre'){
    addBoss(44,2.4);
  }else if(state==='inkfan'||state==='fanPre'){
    addPlayer(36,2.4);
  }else if(state==='webrPre'){
    addPlayer(42,2.4);
  }else if(state==='poisonPre'){
    addPlayer(32,2.4);
  }else if(state==='volley'){
    addPlayer(30,2.4);
  }else if(state==='webPre'||state==='triplePre'){
    addPlayer(28,2.4);
  }else if(state==='hurlPre'){
    addPlayer(20,2.4);
  }else{
    addPlayer(16,2.4);
  }
  b.warningKey=warningKey;
  b.warningPoints=points;
  b.warningTarget={x:playerX,y:player.y+player.h/2};
  return points;
}

function bossWarningTarget(b){
  return b.warningTarget||{x:player.x+player.w/2,y:player.y+player.h/2};
}

function drawBossWarnings(b){
  if(!b||b.gone||b.dying||!b.active||!BOSS_WARN_STATES.has(b.state)) return;
  const pulse=0.62+Math.sin(game.frame/2.5)*0.2;
  const warningPoints=bossWarningPoints(b);
  CTX.save();
  CTX.globalCompositeOperation='source-over';
  CTX.globalAlpha=1;
  CTX.strokeStyle='rgba(255,80,80,'+pulse.toFixed(2)+')';
  CTX.lineWidth=1;
  const pattern=BOSS_PATTERNS[b.state];
  if(pattern){
    CTX.setLineDash([3,4]);
    if(pattern.kind==='fan'||pattern.kind==='ring'){
      const cx=b.x+b.w/2,cy=b.y+b.h/2;
      for(const angle of bossPatternAngles(b,pattern)){
        CTX.beginPath();CTX.moveTo(cx+Math.cos(angle)*18,cy+Math.sin(angle)*18);
        CTX.lineTo(cx+Math.cos(angle)*58,cy+Math.sin(angle)*58);CTX.stroke();
      }
    }else if(pattern.kind==='rain'){
      for(const q of warningPoints){
        CTX.beginPath();CTX.moveTo(q.x,Math.max(36,q.y-146));CTX.lineTo(q.x,q.y-4);CTX.stroke();
      }
    }
    CTX.setLineDash([]);
  }
  if(['tele','swoopPre','divePre','dashPre','teleportDashPre'].includes(b.state)){
    const t=bossWarningTarget(b), cx=b.x+b.w/2, cy=b.y+b.h/2;
    CTX.setLineDash([4,3]); CTX.beginPath(); CTX.moveTo(cx,cy);
    const horizontal=b.state==='dashPre'||b.state==='teleportDashPre';
    CTX.lineTo(horizontal?clamp(cx+b.face*115,b.arena.left,b.arena.right):t.x,horizontal?cy:t.y);
    CTX.stroke(); CTX.setLineDash([]);
  }
  for(const point of warningPoints){
    const rx=point.rx+Math.sin(game.frame/2.5)*0.8;
    const ry=2.4+Math.sin(game.frame/2.5)*0.15;
    CTX.beginPath();
    CTX.ellipse(point.x,point.y,Math.max(2,rx),Math.max(2,ry),0,0,Math.PI*2);
    CTX.stroke();
    CTX.globalAlpha=0.16+0.08*Math.sin(game.frame/2.5);
    CTX.fillStyle='#ff5050';
    CTX.fill();
    CTX.globalAlpha=1;
  }
  CTX.restore();
}

// 密集落雨与像素刺阵共用一个覆场伤害区，视觉不会飞到圈外或残留攻击。
function drawOverloadBurst(zone){
  const cfg=BOSS_OVERLOADS[zone.btype],width=zone.right-zone.left;
  const cx=(zone.left+zone.right)/2,rx=width/2,t=zone.t;
  const alpha=CTX.globalAlpha,top=Math.min(16,zone.floor-184),rainHeight=zone.floor-top;
  CTX.save();
  CTX.beginPath();CTX.rect(zone.left,-H,width,zone.floor+H+7);CTX.clip();
  // 从爆发第一帧起覆盖高空：三层落弹一直循环到危险区消退。
  const columns=Math.ceil(width/18);
  for(let i=0;i<columns;i++)for(let row=0;row<3;row++){
    const x=Math.round(zone.left+(i+0.5)*width/columns+Math.sin(i*2.7+row)*3);
    const progress=(t*2.5+row/3+(i%4)*0.075)%1;
    const y=Math.round(top+progress*rainHeight);
    CTX.globalAlpha=alpha*0.4;CTX.fillStyle=cfg.color;
    CTX.fillRect(x-1,y-24,2,18);CTX.fillRect(x-3,y-15,1,8);
    CTX.globalAlpha=alpha;
    const spr=zone.btype==='chaos'&&(i+row)%2?'p_ink':cfg.spr,img=SPR[spr];
    CTX.drawImage(img,Math.round(x-img.width/2),Math.round(y-img.height/2));
    if(zone.btype==='judge'){
      CTX.fillStyle=cfg.core;CTX.fillRect(x,y-6,1,10);
    }
  }
  // 地面没有可站的缝：刺阵与落地炸点铺满同一条红圈范围。
  const spikes=Math.ceil(width/13),rise=Math.min(1,0.6+t/0.08);
  for(let i=0;i<spikes;i++){
    const x=Math.round(zone.left+(i+0.5)*width/spikes);
    const pulse=0.82+0.18*Math.sin(t*25+i*1.9);
    const height=Math.round((zone.btype==='flame'?52:zone.btype==='judge'?43:36)*pulse*rise);
    const halfWidth=zone.btype==='flame'?7:6;
    for(let yy=0;yy<height;yy+=3){
      const half=Math.max(1,Math.round(halfWidth*(1-yy/height)));
      const lean=zone.btype==='flame'?Math.round(Math.sin(yy*0.21+t*22+i)*2):Math.round(yy/height*(i%2?2:-2));
      const sx=x+lean-half,sy=zone.floor-yy-3;
      CTX.fillStyle=cfg.dark;CTX.fillRect(sx,sy,half*2,3);
      CTX.fillStyle=cfg.color;CTX.fillRect(sx+1,sy,Math.max(1,half*2-2),3);
      CTX.fillStyle=cfg.core;CTX.fillRect(x+lean,sy,1,3);
    }
    const flash=(t*8+i*0.31)%1,reach=Math.round(3+flash*7);
    CTX.globalAlpha=alpha*(1-flash)*0.8;CTX.fillStyle=cfg.core;
    CTX.fillRect(x-reach,zone.floor-2,reach*2,2);
    CTX.fillRect(x-1,zone.floor-8-flash*14,2,5);
    CTX.globalAlpha=alpha;
  }
  CTX.strokeStyle=zone.color;CTX.lineWidth=1;
  for(let i=0;i<3;i++){
    CTX.beginPath();CTX.ellipse(cx,zone.floor,rx-i*3,2.4+i,0,0,Math.PI*2);CTX.stroke();
  }
  CTX.restore();
}

function bossDie(b){
  b.dying=false; b.gone=true;
  delete b.patternStep; delete b.patternWaves;
  delete b.overloadZone;
  level.bossActive=false; level.bossDead=true;
  if(level.gate){ level.gate.open=true; }
  for(let i=game_projs.length-1;i>=0;i--) if(game_projs[i].team==='e') game_projs.splice(i,1);
  hazards.length=0;
  level.enemies=level.enemies.filter(e=>!e.summoned);
  restoreVictoryHealth();
  SFX.explode(); SFX.gate();
  game.shake=10;
  burst(b.x+b.w/2,b.y+b.h/2,'#f8d838',30,140,0.9);
  burst(b.x+b.w/2,b.y+b.h/2,'#d84040',20,110,0.8);
  toast('「'+b.name+'」已被讨伐！血量回满，前方大门开启','#ffe8a0');
}

/* ============================================================
 * 投射物 & 危险区域
 * ============================================================ */
const game_projs=[];

function lobHitsTerrain(pr,prevY){
  if(!pr.lob) return false;
  const cx=pr.x+pr.w/2, bottom=pr.y+pr.h;
  if(pr.x+pr.w<0||pr.x>level.w*TILE||bottom>level.h*TILE) return true;
  const centerTile=tileAt(Math.floor(cx/TILE),Math.floor((pr.y+pr.h/2)/TILE));
  if(isSolid(centerTile)) return true;
  const bx=Math.floor(cx/TILE), by=Math.floor((bottom-0.01)/TILE), under=tileAt(bx,by);
  const surfaceY=by*TILE;
  if(under==='='&&pr.vy>=0&&prevY+pr.h<=surfaceY+0.5&&bottom>=surfaceY) return true;
  return (under==='^'||under==='~')&&bottom>=surfaceY;
}

function updateProjs(dt){
  const p=player;
  for(const pr of game_projs){
    pr.life-=dt;
    if(pr.life<=0) continue;
    if(pr.pillar) continue;
    const prevY=pr.y;
    if(pr.grav) pr.vy+=GRAV*0.6*dt;
    if(pr.home&&pr.homeT>0&&!p.dead){ // 只追踪开头 1.1 秒，神行后可摆脱。
      pr.homeT=Math.max(0,pr.homeT-dt);
      const want=Math.atan2(p.y+p.h/2-pr.y,p.x+p.w/2-pr.x);
      const cur=Math.atan2(pr.vy,pr.vx);
      const delta=Math.atan2(Math.sin(want-cur),Math.cos(want-cur));
      const na=cur+clamp(delta,-1.6*dt,1.6*dt);
      const sp=Math.hypot(pr.vx,pr.vy);
      pr.vx=Math.cos(na)*sp; pr.vy=Math.sin(na)*sp;
    }
    pr.x+=pr.vx*dt; pr.y+=pr.vy*dt;
    if(pr.team==='e'&&Math.random()<dt*8) particles.push({x:pr.x+pr.w/2,y:pr.y+pr.h/2,vx:0,vy:0,life:0.2,maxLife:0.2,color:'#f08020',size:1});
    if(pr.team==='p'&&pr.spr==='p_flysword'&&Math.random()<dt*40) particles.push({x:pr.x+(pr.vx<0?pr.w:0),y:pr.y+pr.h/2,vx:-pr.vx*0.06,vy:rand(-8,8),life:0.22,maxLife:0.22,color:'#7fdce8',size:1.5});
    if(pr.lightning&&Math.random()<dt*60) particles.push({x:pr.x+rand(0,pr.w),y:pr.y+pr.h/2+rand(-7,7),vx:-pr.vx*0.18,vy:rand(-25,25),life:0.18,maxLife:0.18,color:Math.random()<0.5?'#7fdce8':'#ffffff',size:1.2});
    const tx=Math.floor((pr.x+pr.w/2)/TILE), ty=Math.floor((pr.y+pr.h/2)/TILE);
    if(isSolid(tileAt(tx,ty))||lobHitsTerrain(pr,prevY)){
      pr.life=0;
      burst(pr.x+pr.w/2,pr.y+pr.h/2,'#c0c0d0',4,50,0.25);
      continue;
    }
    if(pr.life<=0) continue;
    // 命中判定
    if(pr.team==='e'){
      if(!p.dead&&overlap(pr,p)){
        hurtPlayer(pr.dmg,{kx:Math.sign(pr.vx)*100,effect:pr.effect});
        pr.life=0;
      }
    }else{
      if(!pr.hitTargets) pr.hitTargets=new Set();
      for(const e of level.enemies){
        if(e.dying||pr.hitTargets.has(e)) continue;
        if(overlap(pr,e)){
          pr.hitTargets.add(e);
          damageEnemy(e,playerDmg(pr.dmg),Math.sign(pr.vx)*70);
          burst(pr.x,pr.y,'#f8d838',5,60,0.3);
          // 远程命中不加停顿：连续射击时停顿会被感知为卡顿
          if(!pr.pierce||pr.hitTargets.size>=pr.pierce){ pr.life=0; break; }
        }
      }
      const b=level.boss;
      if(b&&!b.dying&&!b.gone&&pr.life>0&&!pr.hitTargets.has(b)&&overlap(pr,b)){
        pr.hitTargets.add(b);
        damageEnemy(b,playerDmg(pr.dmg),0);
        burst(pr.x,pr.y,'#f8d838',5,60,0.3);
        if(!pr.pierce||pr.hitTargets.size>=pr.pierce) pr.life=0;
      }
    }
  }
  for(let i=game_projs.length-1;i>=0;i--) if(game_projs[i].life<=0) game_projs.splice(i,1);

  // 火柱
  for(const hz of hazards){
    if(hz.overload){
      hz.t+=dt;
      if(hz.t<=hz.dur&&!p.dead&&overlap(p,{x:hz.left,y:-H,w:hz.right-hz.left,h:hz.floor+H})){
        hurtPlayer(1,{noKnock:true});
      }
      continue;
    }
    if(hz.delay>0){ hz.delay=Math.max(0,hz.delay-dt); continue; }
    hz.t+=dt;
    if(hz.t<hz.rise) hz.h=hz.maxH*(hz.t/hz.rise);
    else hz.h=hz.maxH*(1-Math.max(0,(hz.t-hz.rise-hz.dur)/0.2));
    if(!p.dead&&hz.h>4&&overlap(p,{x:hz.x-hz.w/2,y:hz.y-hz.h,w:hz.w,h:hz.h})){
      hurtPlayer(1,{kx:rand(-60,60),effect:hz.col==='ink'?'curse':hz.col==='stone'?undefined:'burn'});
    }
    if(Math.random()<dt*30&&hz.h>4){
      const ink=hz.col==='ink';
      particles.push({x:hz.x+rand(-4,4),y:hz.y-rand(0,hz.h),vx:rand(-8,8),vy:-70,life:0.3,maxLife:0.3,color:ink?(Math.random()<0.5?'#9a4fd8':'#5a2a8c'):(Math.random()<0.5?'#f08020':'#f8d838'),size:2});
    }
  }
  for(let i=hazards.length-1;i>=0;i--){
    const hz=hazards[i],end=hz.overload?hz.dur+0.18:hz.rise+hz.dur+0.25;
    if(hz.t>end)hazards.splice(i,1);
  }
}
/* ============================================================
 * 主更新
 * ============================================================ */
function updateParticles(dt){
  for(let i=particles.length-1;i>=0;i--){
    const pa=particles[i];
    pa.life-=dt; pa.x+=pa.vx*dt; pa.y+=pa.vy*dt; pa.vy+=140*dt;
    if(pa.life<=0) particles.splice(i,1);
  }
}

function update(dt){
  game.frame++;
  // M 在标题、设置、暂停和战斗里均可静音，已排入队列的音符也立即静音。
  if(hit('KeyM')){
    muted=!muted;
    if(master)master.gain.setTargetAtTime(muted?0:(SET.vol/100)*0.9,AC.currentTime,0.015);
    if(muted)resetMusic();
    toast(muted?'已静音':'声音开启','#c0c0d0');
  }
  game.shake=Math.max(0,game.shake-dt*20);
  game.flash=Math.max(0,game.flash-dt*2);
  game.bossBannerT=Math.max(0,game.bossBannerT-dt);
  updateParticles(dt);
  for(let i=toasts.length-1;i>=0;i--){ toasts[i].t-=dt; if(toasts[i].t<=0) toasts.splice(i,1); }
  if(hit('Escape')){
    if(game.state==='title'){
      if(game.titleMode){ game.titleMode=false; return; }
      if(game.titleSet){ game.titleSet=false; return; }
      if(game.titleHelp){ game.titleHelp=false; return; }
      game.titleSet=true; SET_SEL=0; return;
    }
    if(game.settingsOpen){ game.settingsOpen=false; game.paused=false; return; }
    game.settingsOpen=true; game.paused=true; SET_SEL=0; SFX.check(); return;
  }
  if(game.settingsOpen){
    if(hit('ArrowUp','KeyW')) SET_SEL=(SET_SEL+4)%5;
    if(hit('ArrowDown','KeyS')) SET_SEL=(SET_SEL+1)%5;
    const settingsDir=(hit('ArrowRight','KeyD')?1:0)-(hit('ArrowLeft','KeyA')?1:0);
    if(SET_SEL===4&&(settingsDir||hit('Enter'))){ goTitle(); return; }
    if(settingsDir) adjustSettings(settingsDir);
    if(hit('KeyP')){ game.settingsOpen=false; game.paused=false; }
    return;
  }
  if(game.state==='intro'){
    game.stateT+=dt;
    if(game.stateT>2.4||hit('Enter','Space','KeyJ')){ game.state='play'; }
    return;
  }
  if(game.state==='clear'){
    game.stateT+=dt;
    if(game.stateT>2.2){
      if(game.lv+1<LEVELS.length) startLevel(game.lv+1);
      else { game.state='win'; game.stateT=0; }
    }
    return;
  }
  if(game.state!=='play'){ 
    if(game.state==='title'){
      // 标题页设置面板
      if(game.titleSet){
        if(hit('ArrowUp','KeyW')) SET_SEL=(SET_SEL+4)%5;
        if(hit('ArrowDown','KeyS')) SET_SEL=(SET_SEL+1)%5;
        const d2=(hit('ArrowRight','KeyD')?1:0)-(hit('ArrowLeft','KeyA')?1:0);
        if(SET_SEL===4&&d2){ goTitle(); return; }
        if(d2) adjustSettings(d2);
        if(hit('KeyP')) game.titleSet=false;
        return;
      }
      // 开始征战后的模式选择
      if(game.titleMode){
        if(hit('ArrowUp','KeyW')) game.titleModeSel=(game.titleModeSel+1)%2;
        if(hit('ArrowDown','KeyS')) game.titleModeSel=(game.titleModeSel+1)%2;
        if(hit('Enter','KeyJ')) startSelectedMode();
        return;
      }
      // 操作说明面板
      if(game.titleHelp){
        if(hit('KeyH','Escape','Enter')) game.titleHelp=false;
        return;
      }
      // 菜单导航
      if(hit('KeyH')){ game.titleHelp=true; SFX.pickup(); return; }
      if(hit('ArrowUp','KeyW')){ game.titleMenu=(game.titleMenu+2)%3; SFX.pickup(); }
      if(hit('ArrowDown','KeyS')){ game.titleMenu=(game.titleMenu+1)%3; SFX.pickup(); }
      if(game.titleMenu===0){
        if(hit('ArrowLeft','KeyA')){ game.titleSel=((game.titleSel||0)+LEVELS.length-1)%LEVELS.length; SFX.pickup(); }
        if(hit('ArrowRight','KeyD')){ game.titleSel=((game.titleSel||0)+1)%LEVELS.length; SFX.pickup(); }
      }
      if(hit('Enter')||hit('KeyJ')){
        if(game.titleMenu===0){ openModeSelect(); }
        else if(game.titleMenu===1){ game.titleSet=true; SET_SEL=0; }
        else { game.titleHelp=true; }
      }
    }
    else if(game.state==='gameover'&&hit('Enter')){ startLevel(game.lv); }
    else if(game.state==='win'&&hit('Enter')){ game.state='title'; }
    return;
  }

  // 对话冻结世界
  if(game.dialog){
    if(hit('KeyE','Enter')||hit('Space','KeyJ')){
      game.dialog.idx++;
      if(game.dialog.idx>=game.dialog.lines.length){
        if(!game.dialog.npc.done){
          grantBuff(game.dialog.npc);
          game.dialog.npc.done=true;
        }
        game.dialog=null;
      }
    }
    return;
  }

  if(hit('KeyP')){ game.settingsOpen=true; game.paused=true; SET_SEL=0; SFX.check(); return; }
  updateDashSkill(dt);
  if(hit('KeyL','ShiftLeft','ShiftRight')) activateDashSkill();
  if(hit('F9')&&game.mode==='coward'){
    game.god=!game.god; SET.god=game.god?1:-1; saveSet(); toast(game.god?'无敌模式 开':'无敌模式 关','#9a4fd8');
  }
  if(hit('F8')){ toast('跳关…','#9a4fd8'); if(game.lv+1<LEVELS.length) startLevel(game.lv+1); else {game.state='win';} return; }

  game.playTime+=dt;
  updatePlayer(dt);
  if(player.dead||game.state!=='play') return;
  for(const e of level.enemies){
    if(e.dying){ e.deadT-=dt; continue; }
    if(e.gotHeart) continue;
    updateEnemy(e,dt);
  }
  for(let i=level.enemies.length-1;i>=0;i--) if(level.enemies[i].dying&&level.enemies[i].deadT<=0) level.enemies.splice(i,1);
  if(level.boss&&!level.boss.gone) updateBoss(level.boss,dt);
  updateProjs(dt);

  // 摄像机
  // 镜头只跟随玩家位置，不再因为朝向切换左右跳动。
  const targetX=clamp(player.x+player.w/2-W*0.42,0,level.w*TILE-W);
  cam.x=lerp(cam.x,targetX,0.16);
}

function grantBuff(npc){
  const p=player;
  SFX.buff();
  switch(npc.buff){
    case 'heal': p.hearts=Math.min(p.maxHearts,p.hearts+1); ['poison','burn','slow','curse'].forEach(k=>delete p.fx[k]); break;
    case 'speed': p.fx.speed={t:12,tick:0}; break;
    case 'shield': p.shield=3; break;
    case 'mengpo': p.hearts=p.maxHearts; p.fx.invincible={t:6,tick:0}; ['poison','burn','slow','curse'].forEach(k=>delete p.fx[k]); break;
    case 'power': p.fx.power={t:12,tick:0}; break;
  }
  toast(npc.toast,'#ffe8a0');
  burst(p.x+p.w/2,p.y+p.h/2,'#ffe8a0',16,90,0.7);
}

function resetRun(){
  game.lives=PLAYER_RULES.lives; game.deaths=0; game.playTime=0;
  player.maxHearts=PLAYER_RULES.hearts; player.hearts=PLAYER_RULES.hearts; player.shield=0;
  player.dashT=0; player.dashCd=[0,0,0]; player.dashSlot=-1; player.aimX=player.face; player.aimY=0;
  player.weapons=['sword']; player.wi=0;
}

/* ============================================================
 * 渲染
 * ============================================================ */
function drawSpr(name,cx,by,face,flash,scale){
  const img=face<0?flipped(name):SPR[name];
  const s=scale||1;
  const dx=Math.round(cx-img.width*s/2), dy=Math.round(by-img.height*s);
  if(flash>0){ CTX.drawImage(whiten(name),dx,dy,img.width*s,img.height*s); }
  else CTX.drawImage(img,dx,dy,img.width*s,img.height*s);
}

// 脚下投影：向下找地面，落在其表面
function drawShadow(e){
  const cx=e.x+e.w/2;
  const tx=Math.floor(cx/TILE);
  let ty=Math.floor((e.y+e.h)/TILE);
  for(let i=0;i<6;i++,ty++){
    const ch=tileAt(tx,ty);
    if(isSolid(ch)||ch==='='){
      CTX.fillStyle='rgba(8,8,18,0.3)';
      CTX.beginPath();
      CTX.ellipse(cx,ty*TILE+1,Math.max(5,e.w/2+2),2.4,0,0,Math.PI*2);
      CTX.fill();
      return;
    }
    if(ch==='~'||ch==='^') return; // 岩浆/尖刺上不投影
  }
}

// 背景渐变按主题缓存（避免每帧重建渐变对象）
const _bgGrad={};
function bgGrad(th){
  if(_bgGrad[th]) return _bgGrad[th];
  let g;
  if(th==='sky'){ g=CTX.createLinearGradient(0,0,0,H); g.addColorStop(0,'#6fb0e4'); g.addColorStop(0.6,'#a8d0ef'); g.addColorStop(1,'#cfe0f2'); }
  else if(th==='cave'){ g=CTX.createLinearGradient(0,0,0,H); g.addColorStop(0,'#141020'); g.addColorStop(1,'#241c30'); }
  else if(th==='hell'){ g=CTX.createLinearGradient(0,0,0,H); g.addColorStop(0,'#1c0808'); g.addColorStop(0.7,'#3c1010'); g.addColorStop(1,'#57180e'); }
  else if(th==='temple'){ g=CTX.createLinearGradient(0,0,0,H); g.addColorStop(0,'#c8d8ee'); g.addColorStop(1,'#efe8d8'); }
  else { g=CTX.createLinearGradient(0,0,0,H); g.addColorStop(0,'#12081e'); g.addColorStop(0.6,'#241038'); g.addColorStop(1,'#3a1a52'); }
  _bgGrad[th]=g;
  return g;
}

function drawBG(){
  const th=level?level.theme:'sky';
  CTX.fillStyle=bgGrad(th); CTX.fillRect(0,0,W,H);

  const t=game.frame/60;
  if(th==='sky'){
    for(let i=0;i<10;i++){
      const s=((i*173+60)-cam.x*0.25)%(W+140)-70;
      CTX.fillStyle='rgba(255,255,255,0.55)';
      cloudShape(((s+W+140)%(W+140))-70, 20+((i*53)%140), 0.7+((i*29)%40)/40);
    }
    // 远处天宫剪影
    CTX.fillStyle='rgba(90,130,190,0.35)';
    const bx=120-cam.x*0.1;
    CTX.fillRect(bx,H-90,80,60); CTX.fillRect(bx-10,H-100,100,12);
    CTX.fillRect(bx+14,H-118,52,20);
    CTX.fillStyle='rgba(90,130,190,0.28)';
    const bx2=360-cam.x*0.1;
    CTX.fillRect(bx2,H-70,60,44); CTX.fillRect(bx2-8,H-78,76,10);
  }else if(th==='cave'){
    CTX.fillStyle='#191426';
    for(let i=0;i<14;i++){
      const s=((i*97)-cam.x*0.35)%(W+80);
      const x=((s% (W+80))+(W+80))%(W+80)-40;
      const w=14+(i*13)%18, h=26+(i*29)%46;
      CTX.beginPath(); CTX.moveTo(x,0); CTX.lineTo(x+w,0); CTX.lineTo(x+w/2,h); CTX.fill();
    }
    CTX.fillStyle='#3a2f4a';
    for(let i=0;i<10;i++){
      const x=(((i*127)-cam.x*0.55)%(W+80)+(W+80))%(W+80)-40;
      CTX.fillRect(x,190+(i*37)%60,4+(i*7)%6,60);
    }
    for(let i=0;i<8;i++){
      const x=(((i*211)-cam.x*0.45)%(W)+(W))%W, y=40+(i*67)%150;
      const gl=0.4+Math.sin(t*2+i)*0.25;
      CTX.fillStyle='rgba(127,220,232,'+gl.toFixed(2)+')';
      CTX.fillRect(x,y,2,2);
    }
  }else if(th==='hell'){
    CTX.fillStyle='rgba(240,128,32,0.08)';
    for(let i=0;i<6;i++){
      const yy=200+i*12, hh=4+Math.sin(t*3+i*2)*3;
      CTX.fillRect(0,yy,W,hh);
    }
    CTX.fillStyle='#2a0d0d';
    for(let i=0;i<8;i++){
      const x=(((i*151)-cam.x*0.3)%(W+100)+(W+100))%(W+100)-50;
      CTX.fillRect(x,60+(i*41)%80,20+(i*17)%26,90);
    }
    for(let i=0;i<16;i++){
      const x=(((i*97)-cam.x*0.5+t*14)%(W)+(W))%W, y=(H-((t*20+i*53)%(H+20)));
      CTX.fillStyle='rgba(240,128,32,'+(0.25+(i%3)*0.15).toFixed(2)+')';
      CTX.fillRect(x,y,1.5,1.5);
    }
  }else if(th==='temple'){
    CTX.fillStyle='rgba(255,255,255,0.5)';
    for(let i=0;i<8;i++){
      const s=((i*167+40)-cam.x*0.2)%(W+120);
      cloudShape(((s%(W+120))+(W+120))%(W+120)-60, 24+(i*47)%90, 0.8);
    }
    for(let i=0;i<9;i++){
      const x=(((i*113)-cam.x*0.5)%(W+60)+(W+60))%(W+60)-30;
      CTX.fillStyle='rgba(150,140,120,0.35)';
      CTX.fillRect(x,60,18,H-60);
      CTX.fillStyle='rgba(120,110,90,0.3)';
      CTX.fillRect(x,60,3,H-60); CTX.fillRect(x+15,60,3,H-60);
    }
  }else{
    for(let i=0;i<26;i++){
      const x=(((i*89)-cam.x*0.15)%(W)+(W))%W, y=(i*53)%H;
      const gl=0.3+Math.sin(t*2.4+i*1.7)*0.25;
      CTX.fillStyle='rgba(200,160,255,'+gl.toFixed(2)+')';
      CTX.fillRect(x,y,1.5,1.5);
    }
    for(let i=0;i<6;i++){
      const x=(((i*197)-cam.x*0.4)%(W+80)+(W+80))%(W+80)-40, y=40+(i*61)%160;
      const s=6+Math.sin(t*1.5+i)*2;
      CTX.strokeStyle='rgba(154,79,216,0.4)';
      CTX.strokeRect(x-s/2,y-s/2,s,s);
    }
  }
}
function cloudShape(x,y,s){
  CTX.beginPath();
  CTX.ellipse(x,y,26*s,9*s,0,0,Math.PI*2);
  CTX.ellipse(x+20*s,y-6*s,18*s,8*s,0,0,Math.PI*2);
  CTX.ellipse(x-20*s,y-4*s,16*s,7*s,0,0,Math.PI*2);
  CTX.fill();
}

function drawTiles(){
  const th=level.theme, art=TILE_ART[th];
  const x0=Math.max(0,Math.floor(cam.x/TILE)), x1=Math.min(level.w-1,Math.ceil((cam.x+W)/TILE));
  const lavaF=Math.floor(game.frame/22)%2;
  for(let ty=0;ty<level.h;ty++){
    for(let tx=x0;tx<=x1;tx++){
      const ch=level.grid[ty][tx];
      if(ch==='.') continue;
      const px=tx*TILE, py=ty*TILE;
      if(ch==='#'){ CTX.drawImage(art.ground[(tx*7+ty*13)%2],px,py); }
      else if(ch==='='){ CTX.drawImage(art.plat,px,py+2); }
      else if(ch==='^'){
        CTX.drawImage(spikeDir(tx,ty)==='down'?art.spikesDown:art.spikesUp,px,py);
      }
      else if(ch==='~'){ CTX.drawImage(art.lava[lavaF],px,py); }
    }
  }
}

function drawGate(){
  const g=level.gate; if(!g) return;
  const img=g.open?TILE_ART.gateOpen:TILE_ART.gateSealed;
  CTX.drawImage(img,Math.round(g.x),Math.round(g.y));
  if(!g.open){
    const t=game.frame/60;
    CTX.fillStyle='rgba(216,64,64,'+(0.25+Math.sin(t*4)*0.15).toFixed(2)+')';
    CTX.fillRect(g.x+8,g.y+14,8,8);
    txt('封印中',g.x+12,g.y+24,'#ff9090',8,'center',true);
  }else{
    const t=game.frame/60;
    for(let i=0;i<3;i++){
      const yy=g.y+34-((t*22+i*12)%34);
      CTX.fillStyle='rgba(127,220,232,'+(0.5-Math.abs(yy-(g.y+17))/40).toFixed(2)+')';
      CTX.fillRect(g.x+6+i*6,yy,2,4);
    }
    txt('已解封 ▸ 进入！',g.x+12,g.y+24,'#9ff0fa',8,'center',true);
  }
  txt('传送门',g.x+12,g.y-4,'#ffe8a0',8,'center',true);
}

// 路牌
function drawSigns(){
  for(const s of level.signs){
    const sx=s.x*TILE, sy=s.y*TILE;
    if(sx<cam.x-90||sx>cam.x+W+90) continue;
    CTX.fillStyle='#6b3d10'; CTX.fillRect(sx+6,sy+8,3,8);
    CTX.fillStyle='#8a5a28'; CTX.fillRect(sx+2,sy+2,12,7);
    CTX.fillStyle='#5a3a18'; CTX.fillRect(sx+2,sy+2,12,1);
    CTX.font='bold 7px "Microsoft YaHei",sans-serif';
    const tw=CTX.measureText(s.t).width;
    CTX.fillStyle='rgba(8,8,18,0.72)';
    CTX.fillRect(sx+8-tw/2-4,sy-18,tw+8,11);
    txt(s.t,sx+8,sy-10,'#ffe8a0',7,'center',true);
  }
}

function drawEntityBase(e,sprName,opt){
  opt=opt||{};
  const cx=e.x+e.w/2+(opt.ox||0), by=e.y+e.h+(opt.oy||0);
  drawSpr(sprName,cx,by+((opt.bob!==undefined)?opt.bob:0),opt.face||e.face||1,opt.flash||0);
}

function drawWorld(){
  drawBG();
  // 世界层：应用摄像机偏移（取整防止像素接缝）+ 震屏
  CTX.save();
  CTX.translate(-Math.round(cam.x),0);
  if(game.shake>0) CTX.translate(rand(-game.shake*0.35,game.shake*0.35),rand(-game.shake,game.shake));

  drawTiles();
  drawGate();
  drawSigns();

  // 存档点
  for(const l of level.lamps){
    CTX.drawImage(l.on?TILE_ART.lampOn:TILE_ART.lampOff,Math.round(l.x),Math.round(l.y));
    if(l.on){ const t=game.frame/60; CTX.fillStyle='rgba(248,216,56,'+(0.15+Math.sin(t*3)*0.08).toFixed(2)+')'; CTX.beginPath(); CTX.arc(l.x+5,l.y+8,10,0,Math.PI*2); CTX.fill(); }
  }
  // 拾取物
  for(const it of level.pickups){
    if(it.got) continue;
    it.t+=1/60;
    const bob=Math.sin(it.t*4)*2;
    if(it.kind==='heart'){ drawSpr('ui_heart',it.x+4,it.y+8+bob,1,0); }
    else if(it.kind==='maxheart'){
      const t=game.frame/60;
      CTX.fillStyle='rgba(248,216,56,'+(0.2+Math.sin(t*3)*0.1).toFixed(2)+')';
      CTX.beginPath(); CTX.arc(it.x+5,it.y+5,8,0,Math.PI*2); CTX.fill();
      CTX.drawImage(SPR.ui_heart,it.x,it.y+Math.round(bob));
      CTX.drawImage(SPR.ui_heart,it.x+1,it.y-1+Math.round(bob));
    }
    else if(it.kind==='wpn'){
      const t=game.frame/60;
      CTX.fillStyle='rgba(255,232,160,'+(0.18+Math.sin(t*3)*0.1).toFixed(2)+')';
      CTX.beginPath(); CTX.arc(it.x+it.w/2,it.y+it.h/2,11,0,Math.PI*2); CTX.fill();
      CTX.strokeStyle='rgba(200,152,32,'+(0.5+Math.sin(t*3)*0.25).toFixed(2)+')';
      CTX.lineWidth=1;
      CTX.beginPath(); CTX.arc(it.x+it.w/2,it.y+it.h/2,13,0,Math.PI*2); CTX.stroke();
      drawWpnIcon(it.wpn,it.x+it.w/2,it.y+it.h/2+bob,1);
    }
  }
  // NPC
  for(const n of level.npcs){
    const t=game.frame/60+n.t;
    const col=n.buff==='heal'?'79,184,79':n.buff==='speed'?'127,220,232':n.buff==='mengpo'?'154,79,216':n.buff==='power'?'248,216,56':'255,232,160';
    const pulse=0.22+Math.sin(t*3)*0.1;
    CTX.fillStyle='rgba('+col+','+pulse.toFixed(2)+')';
    CTX.beginPath(); CTX.ellipse(n.x+n.w/2,n.y+n.h-3,11,4,0,0,Math.PI*2); CTX.fill();
    CTX.fillStyle='rgba('+col+','+(pulse*0.55).toFixed(2)+')';
    CTX.beginPath(); CTX.arc(n.x+n.w/2,n.y+n.h/2-2,11,0,Math.PI*2); CTX.fill();
    drawEntityBase(n,n.sprName,{face:player.x>n.x?1:-1,bob:Math.sin(t*2.4)*1});
    if(!n.done&&dist(player.x,player.y,n.x,n.y)<26){
      drawTalkHint(n.x+n.w/2,n.y-8);
    }
  }
  // 敌人
  for(const e of level.enemies){
    if(e.dying){ CTX.globalAlpha=Math.max(0,e.deadT*4); drawEntityBase(e,e.sprName,{}); CTX.globalAlpha=1; continue; }
    if(e.x<cam.x-40||e.x>cam.x+W+40) continue;
    let bob=0;
    if(ENEMY_TYPES[e.etype].noGravity) bob=Math.sin(game.frame/12+e.t*3)*2;
    drawShadow(e);
    drawEntityBase(e,e.sprName,{bob});
    if(e.shotT>0||['windup','pouncePre','skillPre','tele'].includes(e.state)){
      txt('!',e.x+e.w/2,e.y-5,'#ffe8a0',10,'center',true);
    }
  }
  // Boss（2 倍体型 + 翅膀/武器 + 姿态动画：待机呼吸 / 蓄力 / 出招 / 受击 / 苏醒 / 死亡）
  const b=level.boss;
  if(b&&!b.gone){
    drawShadow(b);
    const sprN=sprNameOf(b);
    const P=bossPose(b);
    const atk=P.wind||P.strike;
    const sc=(b.scale||2)*P.sc;
    const bob=(b.onGround&&Math.abs(b.vx)>8)?-Math.abs(Math.sin(game.frame/5))*2:0;
    const alpha=b.dying?clamp(b.deadT*3,0,1):1;
    // 死亡：旋转缩小坠落
    const dprog=b.dying?clamp(1-b.deadT/0.25,0,1):0;
    CTX.save();
    CTX.translate(Math.round(b.x+b.w/2+P.ox),Math.round(b.y+b.h+bob+P.oy));
    if(P.rot+dprog) CTX.rotate(P.rot+b.face*dprog*1.6);
    CTX.globalAlpha=alpha;
    if(P.glow>0&&!b.dying){
      CTX.fillStyle='rgba(255,236,180,'+(P.glow*0.26).toFixed(2)+')';
      CTX.beginPath(); CTX.ellipse(0,-b.h*0.5,b.w*0.62,b.h*0.62,0,0,Math.PI*2); CTX.fill();
    }
    // 飞行法器（取代翅膀）：符文石环 / 垂天蛛丝 / 墨云 / 火轮 / 混沌法印
    if(!b.dying) drawBossHalo(b);
    const shrink=b.dying?1-dprog*0.3:1;
    if(atk&&!b.dying){
      // 蓄力/出招：白色轮廓脉冲 + 微涨大
      CTX.globalAlpha=alpha*(0.35+Math.sin(game.frame/2)*0.2);
      drawSpr(sprN,0,0,b.face,1,sc*shrink);
      CTX.globalAlpha=alpha;
    }
    drawSpr(sprN,0,0,b.face,b.flash>0?1:0,sc*shrink);
    // 专属武器：待机垂放 / 蓄力后引 / 出招前挥
    const wpnName={garg:'wpn_club',judge:'wpn_brush',flame:'wpn_flamesword',chaos:'wpn_staff'}[b.btype];
    if(wpnName&&!b.dying){
      const wi=SPR[wpnName], ww=wi.width*2, wh=wi.height*2;
      const side=b.face||1;
      const ang=P.strike?(0.85+0.18*Math.sin(game.frame/3)):(P.wind?-0.6:0.12+0.05*Math.sin(game.frame/26));
      CTX.save();
      CTX.translate(Math.round(side*(b.w*0.38)),Math.round(-b.h*0.4));
      CTX.rotate(side*ang);
      CTX.scale(side,1);
      CTX.drawImage(wi,-Math.round(ww*0.25),-Math.round(wh*0.9),Math.round(ww),Math.round(wh));
      CTX.restore();
    }
    CTX.restore();
    CTX.globalAlpha=1;
    if(b.spawnT>0&&!b.dying){
      // 苏醒冲击环
      const k=clamp(b.spawnT/0.55,0,1);
      CTX.strokeStyle='rgba(255,232,160,'+(k*0.7).toFixed(2)+')';
      CTX.lineWidth=2;
      CTX.beginPath(); CTX.ellipse(b.x+b.w/2,b.y+b.h*0.55,(1-k)*b.w*1.1+10,(1-k)*b.h*0.7+8,0,0,Math.PI*2); CTX.stroke();
    }
    if(!b.active){ // 沉睡中的 Boss：Z z 气泡 + 靠近时的感叹号
      const t=game.frame/40;
      for(let i=0;i<2;i++){
        const ph=(t*0.5+i*0.5)%1;
        CTX.globalAlpha=(1-ph)*0.85;
        txt('Z',b.x+b.w-1+i*5,b.y-6-ph*9,'#d0d0e0',7,'center');
      }
      CTX.globalAlpha=1;
      if(Math.abs(player.x-b.x)<240){
        const bob=Math.sin(game.frame/6)*2;
        txt('!',b.x+b.w/2,b.y-12+bob,'#ff5050',13,'center',true);
      }
    }
  }
  // 玩家
  drawShadow(player);
  drawPlayer();
  // 投射物
  for(const pr of game_projs){
    if(pr.pillar) continue;
    if(pr.lightning){ drawLightningWave(pr); continue; }
    if(pr.flamewave){ drawFlameWave(pr); continue; }
    const img=SPR[pr.spr];
    const fx=pr.vx<0?-1:1;
    const img2=fx<0?flipped(pr.spr):img;
    if(pr.rot&&(pr.vx!==0||pr.vy!==0)){
      // 非水平飞行的箭/飞剑：按实际速度方向旋转贴图
      CTX.save();
      CTX.translate(Math.round(pr.x+pr.w/2),Math.round(pr.y+pr.h/2));
      CTX.rotate(Math.atan2(pr.vy,pr.vx));
      CTX.drawImage(img,-Math.round(pr.w/2),-Math.round(pr.h/2));
      CTX.restore();
    }else{
      CTX.drawImage(img2,Math.round(pr.x),Math.round(pr.y+(pr.grav?Math.sin(game.frame/3)*1:0)));
    }
  }
  // 火柱 / 墨柱
  for(const hz of hazards){
    if(hz.overload){
      CTX.save();CTX.globalAlpha=hz.t>hz.dur?clamp(1-(hz.t-hz.dur)/0.18,0,1):1;
      drawOverloadBurst(hz);CTX.restore();continue;
    }
    if(hz.delay>0){
      CTX.fillStyle='#ff6868'; CTX.fillRect(hz.x-hz.w/2,hz.y-2,hz.w,2);
    }
    if(hz.h<2) continue;
    const ink=hz.col==='ink', stone=hz.col==='stone';
    for(let yy=0;yy<hz.h;yy+=4){
      CTX.fillStyle=stone?(yy%8===0?'#c0c0d0':'#5a6a88'):ink?(yy%8===0?'#9a4fd8':'#5a2a8c'):(yy%8===0?'#f08020':'#f8d838');
      CTX.fillRect(Math.round(hz.x-hz.w/2+rand(-1,1)),Math.round(hz.y-yy-4),hz.w-2,4);
    }
  }
  // 粒子
  for(const pa of particles){
    CTX.globalAlpha=clamp(pa.life/pa.maxLife,0,1);
    CTX.fillStyle=pa.color;
    // 大粒子左右对称 + 上一行：近似 3x3 光点，比单像素更亮眼
    const s=pa.size|0;
    CTX.fillRect(Math.round(pa.x),Math.round(pa.y),s,s);
    if(s>=2){ CTX.fillRect(Math.round(pa.x)-1,Math.round(pa.y)+1,s+2,Math.max(1,s-2)); }
  }
  // 独立预警层：始终显示在平台、Boss、角色和投射物之上，避免被平台盖住。
  drawBossWarnings(level.boss);
  CTX.globalAlpha=1;
  CTX.restore();
}

function sprNameOf(b){ return BOSSES[b.btype].spr; }

// Boss 姿态：把 AI 状态映射成 缩放/位移/旋转/发光（动作表现的核心）
function bossPose(b){
  const st=b.state, f=game.frame;
  const wind=/Pre$/.test(st)||st==='roar'||st==='tele'||st==='summon';
  const strike=BOSS_ATK.has(st)&&!wind;
  let sc=1, ox=0, oy=0, rot=0, glow=0;
  if(strike){ sc=1.10; ox=b.face*4; glow=0.55+Math.sin(f/2)*0.2; }
  else if(wind){ sc=1.05; ox=-b.face*3; rot=-b.face*0.05; glow=0.35+Math.sin(f/3)*0.15; }
  else{
    sc=1+Math.sin(f/13)*0.02;              // 呼吸
    if(b.btype==='judge') rot=Math.sin(f/38)*0.035;        // 判官：袍摆摇曳
    if(b.btype==='flame') glow=0.18+Math.sin(f/9)*0.1;     // 炎魔：周身火光
    if(b.btype==='chaos') glow=0.15+Math.sin(f/17)*0.12;   // 混沌：能量脉动
    if(b.btype==='garg')  oy=Math.sin(f/21)*1.2;           // 石像鬼王：振翅悬停
    if(b.btype==='spider')oy=Math.sin(f/16)*1.5;           // 蛛母：腹部起伏
  }
  if(b.flash>0){ ox-=b.face*2.5; rot+=b.face*0.07; glow=Math.max(glow,0.5); }  // 受击后仰
  if(b.spawnT>0){ const k=clamp(b.spawnT/0.55,0,1); sc*=1+0.14*k; oy-=9*k; glow=Math.max(glow,0.6*k); }
  return {sc,ox,oy,rot,glow,wind,strike};
}

/* ---------------- Boss 飞行法器（取代翅膀） ----------------
 * 每个飞行 Boss 一件专属「神器」，随呼吸律动，比翅膀更协调。
 * 坐标原点 = Boss 脚底中心（调用前已 translate）。
 * ============================================================ */
function drawBossHalo(b){
  const t=game.frame/60, w=b.w, h=b.h, beat=Math.sin(t*2.4);
  if(b.btype==='garg'){
    // 石像鬼王 · 踏罡斗：足下悬浮符文石环 + 环绕碎石
    const rx=w*0.64, ry=w*0.19, yy=-3+beat*1.5;
    CTX.save(); CTX.translate(0,yy);
    CTX.fillStyle='rgba(120,140,190,'+(0.10+0.05*beat).toFixed(2)+')';
    CTX.beginPath(); CTX.ellipse(0,0,rx,ry,0,0,Math.PI*2); CTX.fill();
    CTX.strokeStyle='rgba(178,194,226,0.9)'; CTX.lineWidth=2;
    CTX.beginPath(); CTX.ellipse(0,0,rx,ry,0,0,Math.PI*2); CTX.stroke();
    CTX.strokeStyle='rgba(200,152,32,0.65)'; CTX.lineWidth=1;
    CTX.beginPath(); CTX.ellipse(0,0,rx*0.68,ry*0.68,0,0,Math.PI*2); CTX.stroke();
    for(let i=0;i<10;i++){
      const a=t*0.6+i*Math.PI/5;
      CTX.fillStyle=i%2?'#c89820':'#dae3f6';
      CTX.fillRect(Math.round(Math.cos(a)*rx-1),Math.round(Math.sin(a)*ry-2),2,4);
    }
    CTX.restore();
    for(let i=0;i<5;i++){
      const a=-t*1.4+i*Math.PI*2/5;
      const px2=Math.cos(a)*rx*1.18, py2=yy+Math.sin(a)*ry*1.18-7;
      const s=2+(i%2?1:0);
      CTX.globalAlpha=0.45+0.55*Math.max(0,Math.sin(a));
      CTX.fillStyle='#8fa0c0'; CTX.fillRect(Math.round(px2-s),Math.round(py2-s),s*2,s*2);
      CTX.fillStyle='#c89820'; CTX.fillRect(Math.round(px2-s),Math.round(py2-s),s*2,1);
      CTX.globalAlpha=1;
    }
  }else if(b.btype==='spider'){
    // 蛛母 · 垂丝：自天顶垂下的蛛丝与腹下幽光
    CTX.strokeStyle='rgba(220,228,244,0.55)'; CTX.lineWidth=1;
    for(let i=-1;i<=1;i++){
      CTX.beginPath();
      const x0=i*10, y0=-h*0.6;
      CTX.moveTo(x0*2.2,y0-460);
      for(let k=1;k<=7;k++){
        const f=k/7;
        CTX.lineTo(x0*(2.2-1.2*f)+Math.sin(t*1.4+k+i)*3*f, y0-460*(1-f));
      }
      CTX.stroke();
    }
    CTX.fillStyle='rgba(186,90,222,'+(0.15+0.07*beat).toFixed(2)+')';
    CTX.beginPath(); CTX.ellipse(0,-h*0.22,w*0.34,h*0.22,0,0,Math.PI*2); CTX.fill();
  }else if(b.btype==='judge'){
    // 判官 · 墨云：脚踏翻滚墨云
    const yy=-3+beat*2;
    CTX.fillStyle='rgba(58,28,92,0.85)';
    CTX.beginPath(); CTX.ellipse(0,yy,w*0.40,h*0.11,0,0,Math.PI*2); CTX.fill();
    for(let i=0;i<5;i++){
      const px2=(i-2)*w*0.19, sx2=w*(0.22-Math.abs(i-2)*0.03);
      CTX.fillStyle=i%2?'rgba(74,34,110,0.9)':'rgba(116,58,168,0.85)';
      CTX.beginPath(); CTX.ellipse(px2+(i%2?3:-3),yy+Math.sin(t*2+i*1.3)*2,sx2,h*0.085,0,0,Math.PI*2); CTX.fill();
    }
    CTX.fillStyle='rgba(186,130,245,'+(0.20+0.10*beat).toFixed(2)+')';
    CTX.beginPath(); CTX.ellipse(0,yy,w*0.40,h*0.09,0,0,Math.PI*2); CTX.fill();
  }else if(b.btype==='flame'){
    // 炎魔 · 双环火轮：一顺一逆，绕身旋烧
    for(let ring=0;ring<2;ring++){
      const rr=w*(0.56+ring*0.16), ang=t*(ring?-1.2:1.6);
      CTX.strokeStyle=ring?'rgba(216,64,64,0.30)':'rgba(248,216,56,0.34)';
      CTX.lineWidth=2;
      CTX.beginPath(); CTX.ellipse(0,-h*0.44,rr,rr*0.42,0,0,Math.PI*2); CTX.stroke();
      for(let i=0;i<14;i++){
        const a=ang+i*Math.PI/7;
        const px2=Math.cos(a)*rr, py2=-h*0.44+Math.sin(a)*rr*0.42;
        const s=2+(i%3)*0.8+Math.sin(t*9+i*2)*0.6;
        CTX.globalAlpha=0.55+0.45*Math.max(0,Math.sin(a*1.2+t*2.5));
        CTX.fillStyle=i%3===0?'#f8d838':(i%3===1?'#f08020':'#e05020');
        CTX.fillRect(Math.round(px2-s),Math.round(py2-s),Math.round(s*2),Math.round(s*2));
        CTX.globalAlpha=1;
      }
    }
    // 脚下余烬
    if(Math.random()<0.5) particles.push({x:rand(-w*0.4,w*0.4),y:-2,vx:0,vy:rand(-26,-10),
      life:0.4,maxLife:0.4,color:Math.random()<0.5?'#f08020':'#f8d838',size:1.6});
  }else if(b.btype==='chaos'){
    // 混沌魔神 · 混沌法印：身后双色法阵 + 环绕噬魂珠
    const R=w*0.80, my=-h*0.46;
    CTX.save(); CTX.translate(0,my);
    CTX.fillStyle='rgba(120,60,180,0.30)';
    CTX.beginPath(); CTX.arc(0,0,R*0.82,0,Math.PI*2); CTX.fill();
    CTX.strokeStyle='rgba(205,155,255,0.55)'; CTX.lineWidth=1;
    for(let i=0;i<12;i++){
      const a=t*0.25+i*Math.PI/6;
      CTX.beginPath();
      CTX.moveTo(Math.cos(a)*R*0.42,Math.sin(a)*R*0.36);
      CTX.lineTo(Math.cos(a)*R*0.96,Math.sin(a)*R*0.82);
      CTX.stroke();
    }
    CTX.strokeStyle='rgba(226,178,255,1)'; CTX.lineWidth=2;
    CTX.beginPath();
    for(let i=0;i<6;i++){
      const a=t*0.5+i*Math.PI/3, px2=Math.cos(a)*R, py2=Math.sin(a)*R*0.86;
      if(i===0) CTX.moveTo(px2,py2); else CTX.lineTo(px2,py2);
    }
    CTX.closePath(); CTX.stroke();
    CTX.strokeStyle='rgba(255,180,80,0.9)'; CTX.lineWidth=1.5;
    CTX.beginPath();
    for(let i=0;i<6;i++){
      const a=-t*0.75+i*Math.PI/3*2, px2=Math.cos(a)*R*0.94, py2=Math.sin(a)*R*0.82;
      if(i===0) CTX.moveTo(px2,py2); else CTX.lineTo(px2,py2);
    }
    CTX.closePath(); CTX.stroke();
    CTX.restore();
    for(let i=0;i<6;i++){
      const a=-t*1.7+i*Math.PI/3;
      const px2=Math.cos(a)*w*0.82, py2=my+Math.sin(a)*w*0.36;
      const s=2+Math.sin(t*5+i)*0.9;
      CTX.fillStyle=i%2?'#e08830':'#c07af0';
      CTX.fillRect(Math.round(px2-s/2),Math.round(py2-s/2),Math.round(s),Math.round(s));
    }
  }
}

// 雷电波：三层主干电弧 + 分叉小枝 + 前端亮头
function drawLightningWave(pr){
  const x0=pr.x, y0=pr.y, w=pr.w, h=pr.h;
  const cx=x0+w/2, cy=y0+h/2;
  const a=clamp(pr.life/0.4,0,1);
  const glow=0.5+0.5*Math.sin(game.frame/2.2);
  const angle=Math.atan2(pr.vy,pr.vx);
  const length=pr.dir==='diag'?30:32;
  const breadth=pr.dir==='diag'?14:18;
  const amp=breadth*0.34;
  CTX.globalAlpha=a;
  CTX.save();
  CTX.translate(cx,cy);
  CTX.rotate(angle);
  // 外层辉光
  CTX.fillStyle='rgba(70,180,255,'+(0.18+0.12*glow).toFixed(2)+')';
  CTX.beginPath(); CTX.ellipse(0,0,length*0.58,breadth*0.72,0,0,Math.PI*2); CTX.fill();
  CTX.fillStyle='rgba(200,240,255,'+(0.14+0.12*glow).toFixed(2)+')';
  CTX.beginPath(); CTX.ellipse(0,0,length*0.42,breadth*0.45,0,0,Math.PI*2); CTX.fill();
  // 主干电弧：粗深蓝 → 中青 → 细白
  const n=7;
  const bolt=(lw,col,fr)=>{
    CTX.strokeStyle=col; CTX.lineWidth=lw; CTX.beginPath();
    for(let i=0;i<=n;i++){
      const t=i/n, env=Math.sin(t*Math.PI);      // 两端收敛，中段狂野
      const off=Math.sin(pr.seed+i*2.3+game.frame*fr)*amp*env;
      const px2=-length/2+length*t;
      const py2=off;
      if(i===0) CTX.moveTo(px2,py2); else CTX.lineTo(px2,py2);
    }
    CTX.stroke();
  };
  bolt(3.6,'#2f7fc8',0.45);
  bolt(1.8,'#7fdce8',0.6);
  bolt(0.9,'#ffffff',0.8);
  // 分叉小枝
  CTX.strokeStyle='rgba(205,245,255,0.9)'; CTX.lineWidth=1;
  for(const bt of [0.32,0.58,0.8]){
    const env=Math.sin(bt*Math.PI);
    const off=Math.sin(pr.seed+bt*n*2.3+game.frame*0.7)*amp*env;
    const bx=-length/2+length*bt, by=off;
    const dir=Math.sin(pr.seed+bt*31)>0?1:-1;
    CTX.beginPath(); CTX.moveTo(bx,by);
    for(let k=1;k<=3;k++){
      const s=k*3.4;
      CTX.lineTo(bx+dir*s*0.55,by+dir*s);
    }
    CTX.stroke();
  }
  // 前端亮头
  CTX.fillStyle='rgba(255,255,255,'+(0.6+0.4*glow).toFixed(2)+')';
  CTX.fillRect(length/2-5,-2,5,4);
  CTX.restore();
  CTX.globalAlpha=1;
}

// 火焰波：炎狱双刃的烈焰舌（平推贴地 / 上挥 / 下劈 三向）
function drawFlameWave(pr){
  const x0=pr.x, y0=pr.y, w=pr.w, h=pr.h;
  const a=clamp(pr.life/0.75,0,1);
  const vert=pr.vx===0;                   // 竖直飞出的火焰波（上挥 / 下劈）
  const dir=pr.face>0?1:-1;
  CTX.globalAlpha=a;
  if(pr.diag){
    const cx=x0+w/2, cy=y0+h/2;
    const angle=Math.atan2(pr.vy,pr.vx), length=28, breadth=14;
    CTX.save();
    CTX.translate(cx,cy);
    CTX.rotate(angle);
    CTX.fillStyle='rgba(255,130,30,0.2)';
    CTX.beginPath(); CTX.ellipse(0,0,length*0.58,breadth*0.58,0,0,Math.PI*2); CTX.fill();
    for(let i=0;i<5;i++){
      const f=i/4;
      const fx=-length/2+length*f;
      const wob=Math.sin(game.frame*0.45+i*1.9);
      const fh=breadth*(0.72+0.34*Math.sin(f*Math.PI))*(0.85+0.15*wob);
      CTX.fillStyle=i<2?'#f8d838':(i<4?'#f08020':'#c83020');
      CTX.beginPath(); CTX.ellipse(fx,-fh*0.08,fh*0.34,fh*0.5,0,0,Math.PI*2); CTX.fill();
    }
    CTX.fillStyle='rgba(255,255,225,'+(0.45+0.3*Math.sin(game.frame*0.7)).toFixed(2)+')';
    CTX.beginPath(); CTX.ellipse(-length*0.24,-breadth*0.08,breadth*0.2,breadth*0.3,0,0,Math.PI*2); CTX.fill();
    if(Math.random()<0.6) particles.push({x:cx+rand(-5,5),y:cy+rand(-5,5),vx:-pr.vx*0.12+rand(-20,20),vy:-pr.vy*0.12+rand(-20,20),life:0.3,maxLife:0.3,color:Math.random()<0.5?'#f8d838':'#f08020',size:1.4});
    CTX.restore();
  }else if(vert){
    const d=pr.vy>0?1:-1;                 // 1=向下, -1=向上
    const cx=x0+w/2, tail=d>0?y0:y0+h, tip=d>0?y0+h:y0;
    // 尾端辉光
    CTX.fillStyle="rgba(255,130,30,0.22)";
    CTX.beginPath(); CTX.ellipse(cx,tail+(tip-tail)*0.35,w*0.62,4,0,0,Math.PI*2); CTX.fill();
    // 沿飞行方向排布的火焰舌
    for(let i=0;i<5;i++){
      const f=i/4;
      const fy=tail+(tip-tail)*f;
      const wob=Math.sin(game.frame*0.45+i*1.9);
      const fh=w*(0.72+0.34*Math.sin(f*Math.PI))*(0.85+0.15*wob);
      CTX.fillStyle=i<2?'#f8d838':(i<4?'#f08020':'#c83020');
      CTX.beginPath(); CTX.ellipse(cx,fy,fh*0.5,fh*0.34,0,0,Math.PI*2); CTX.fill();
    }
    // 焰心
    CTX.fillStyle='rgba(255,255,225,'+(0.45+0.3*Math.sin(game.frame*0.7)).toFixed(2)+')';
    CTX.beginPath(); CTX.ellipse(cx,tail+(tip-tail)*0.24,w*0.20,w*0.30,0,0,Math.PI*2); CTX.fill();
    // 飘散火星
    if(Math.random()<0.6) particles.push({x:cx+rand(-6,6),y:tail+(tip-tail)*Math.random(),
      vx:rand(-40,40),vy:d>0?rand(10,40):rand(-40,-10),life:0.3,maxLife:0.3,color:Math.random()<0.5?'#f8d838':'#f08020',size:1.4});
  }else{
    const base=y0+h;
    // 只有地面平推才绘制贴地辉光，空中平推保持在投射物自身高度。
    CTX.fillStyle=pr.ground===false?"rgba(255,130,30,0.16)":"rgba(255,130,30,0.22)";
    CTX.beginPath(); CTX.ellipse(x0+w/2,pr.ground===false?y0+h*0.55:base-1,w*0.62,4,0,0,Math.PI*2); CTX.fill();
    // 一排高低起伏的火焰舌
    for(let i=0;i<5;i++){
      const f=i/4;
      const fx=x0+w*(dir>0?f:1-f);
      const wob=Math.sin(game.frame*0.45+i*1.9);
      const fh=h*(0.72+0.34*Math.sin(f*Math.PI))*(0.85+0.15*wob);
      CTX.fillStyle=i<2?'#f8d838':(i<4?'#f08020':'#c83020');
      CTX.beginPath(); CTX.ellipse(fx,base-fh*0.5,fh*0.34,fh*0.5,0,0,Math.PI*2); CTX.fill();
    }
    // 焰心
    CTX.fillStyle='rgba(255,255,225,'+(0.45+0.3*Math.sin(game.frame*0.7)).toFixed(2)+')';
    const hx=x0+w*(dir>0?0.24:0.76);
    CTX.beginPath(); CTX.ellipse(hx,base-h*0.42,h*0.20,h*0.30,0,0,Math.PI*2); CTX.fill();
    // 飘散火星
    if(Math.random()<0.6) particles.push({x:x0+w*Math.random(),y:base-h*0.5,
      vx:-dir*rand(20,50),vy:rand(-40,-10),life:0.3,maxLife:0.3,color:Math.random()<0.5?'#f8d838':'#f08020',size:1.4});
  }
  CTX.globalAlpha=1;
}

// 各神兵的挥击辉光色（统一为「神器」质感）
const WFX={sword:'255,236,180',flysword:'150,232,252',bow:'255,226,150',
           thunder:'168,238,255',flameblade:'255,148,56'};
const HOLD_POSE={
  sword:{handX:5,handY:11,rest:-0.62,scale:0.84},
  thunder:{handX:5,handY:11,rest:-0.58,scale:0.84},
  flameblade:{handX:5,handY:11,rest:-0.5,scale:0.84},
  bow:{handX:4,handY:10,rest:0.04,scale:0.9},
  flysword:{handX:3,handY:10,rest:-0.12,scale:0.82},
};
function drawPlayer(){
  const p=player;
  if(p.dead){
    CTX.globalAlpha=Math.max(0.2,p.deadT);
    drawSpr('hero_hurt' in SPR?'hero_hurt':'hero_jump',p.x+p.w/2,p.y+p.h+6,-p.face,0);
    CTX.globalAlpha=1;
    return;
  }
  // 无敌帧：半透明闪烁（而非整只消失）
  if(p.inv>0&&Math.floor(game.frame/3)%2===0) CTX.globalAlpha=0.45;
  let name='hero_idle';
  if(!p.onGround) name='hero_jump';
  else if(Math.abs(p.vx)>12) name=(Math.floor(p.anim)%2===0)?'hero_run1':'hero_run2';
  if(p.dashT>0){
    const ratio=clamp(p.dashT/DASH_SKILL.duration,0,1);
    const cx=p.x+p.w/2, cy=p.y+p.h/2;
    CTX.save();
    CTX.lineCap='round';
    for(let i=1;i<=3;i++){
      CTX.strokeStyle='rgba(127,220,232,'+(0.25*ratio*(1-i*0.2)).toFixed(2)+')';
      CTX.lineWidth=3-i*0.5;
      CTX.beginPath();
      CTX.moveTo(cx-p.face*(i*7+4),cy);
      CTX.lineTo(cx-p.face*(i*7+13),cy);
      CTX.stroke();
    }
    CTX.restore();
  }
  drawSpr(name,p.x+p.w/2,p.y+p.h,p.face,0);
  // 持械层只取当前武器：近战握刃，远程保持弓、符或御剑手印姿势。
  const w=(p.atkT>0?p.attackWeapon:null)||curWeapon(), img=SPR[HELD_SPR[w.id]||HELD_SPR.sword], pose=HOLD_POSE[w.id]||HOLD_POSE.sword;
  if(img){
    const melee=w.kind==='melee', casting=p.castT>0&& !melee;
    let ang=pose.rest+Math.sin(p.anim*0.35)*0.04;
    if(melee&&p.atkT>0){
      const prog=clamp(1-p.atkT/0.16,0,1);
      if(p.aim==='diag') ang=p.aimY<0?Math.PI/4:Math.PI*3/4;
      else ang=p.aim==='up'?-Math.PI*0.56:(p.aim==='down'?Math.PI*0.56:-2.15+prog*3.0);
    }
    CTX.save();
    CTX.translate(Math.round(p.x+p.w/2+p.face*pose.handX),Math.round(p.y+pose.handY));
    if(p.face<0) CTX.scale(-1,1);
    CTX.rotate(ang);
    CTX.scale(pose.scale,pose.scale);
    if(melee&&p.atkT>0){ CTX.globalAlpha=0.3; CTX.drawImage(img,-5,-12); CTX.globalAlpha=1; }
    CTX.drawImage(img,-5,-12);
    CTX.restore();
    if(casting){
      const fc=WFX[w.id]||'255,255,255';
      CTX.strokeStyle='rgba('+fc+',0.7)'; CTX.lineWidth=1;
      CTX.beginPath(); CTX.arc(p.x+p.w/2+p.face*pose.handX,p.y+pose.handY,7,0,Math.PI*2); CTX.stroke();
    }
  }
  CTX.globalAlpha=1;
  // 挥剑：扫击弧光（支持上/下/前三个方向）
  if(p.atkT>0&&w.kind==='melee'){
    const prog=clamp(1-p.atkT/0.16,0,1);
    const cx=p.x+p.w/2, cy=p.y+p.h/2-1;
    CTX.save();
    CTX.translate(Math.round(cx),Math.round(cy));
    if(p.aim==='up') CTX.rotate(-Math.PI/2);
    else if(p.aim==='down') CTX.rotate(Math.PI/2);
    else if(p.aim==='diag'){
      CTX.rotate(p.aimY<0?-Math.PI/4:Math.PI/4);
      if(p.face<0) CTX.scale(-1,1);
    }
    else if(p.face<0) CTX.scale(-1,1);
    const a0=-1.9+prog*1.5, a1=a0+1.7;
    const fc=WFX[w.id]||'255,255,255';
    CTX.strokeStyle='rgba('+fc+','+(0.95*(1-prog*0.35)).toFixed(2)+')';
    CTX.lineWidth=3;
    CTX.beginPath(); CTX.arc(0,0,14,a0,a1); CTX.stroke();
    CTX.strokeStyle='rgba(255,255,255,'+(0.85*(1-prog*0.35)).toFixed(2)+')';
    CTX.lineWidth=1.5;
    CTX.beginPath(); CTX.arc(0,0,10.5,a0+0.15,a1-0.15); CTX.stroke();
    // 雷霆之刃：弧光上缠绕电弧
    if(w.elem==='thunder'){
      CTX.strokeStyle='rgba(200,240,255,0.95)';
      CTX.lineWidth=1.2;
      CTX.beginPath();
      let ex2=6, ey2=-12;
      CTX.moveTo(ex2,ey2);
      for(let i=0;i<4;i++){ ex2+=3+Math.random()*3; ey2+=(Math.random()-0.15)*9; CTX.lineTo(ex2,ey2); }
      CTX.stroke();
    }
    CTX.restore();
    // 剑尖火花
    if(prog<0.5&&Math.random()<0.5){
      let tipx,tipy;
      if(p.aim==='up'){ tipx=cx; tipy=p.y-13; }
      else if(p.aim==='down'){ tipx=cx; tipy=p.y+p.h+12; }
      else { tipx=cx+p.face*13; tipy=cy-6+prog*14; }
      particles.push({x:tipx,y:tipy,vx:rand(-30,30),vy:rand(-30,30),life:0.18,maxLife:0.18,color:'#ffffff',size:1.5});
    }
  }
  // 状态光效
  const t=game.frame/60;
  if(p.fx.invincible){
    CTX.fillStyle='rgba(248,216,56,'+(0.18+Math.sin(t*10)*0.1).toFixed(2)+')';
    CTX.beginPath(); CTX.arc(p.x+p.w/2,p.y+p.h/2,12,0,Math.PI*2); CTX.fill();
  }
  if(p.shield>0){
    CTX.strokeStyle='rgba(127,220,232,'+(0.5+Math.sin(t*5)*0.2).toFixed(2)+')';
    CTX.lineWidth=1;
    CTX.beginPath(); CTX.arc(p.x+p.w/2,p.y+p.h/2,10.5,0,Math.PI*2); CTX.stroke();
  }
  if(p.fx.slow){ CTX.fillStyle='rgba(127,220,232,0.1)'; CTX.fillRect(p.x-2,p.y-2,p.w+4,p.h+4); }
  if(p.fx.curse){ CTX.fillStyle='rgba(154,79,216,0.1)'; CTX.fillRect(p.x-2,p.y-2,p.w+4,p.h+4); }
}

function drawTalkHint(x,y){
  const t=game.frame/30;
  CTX.fillStyle='rgba(22,22,30,0.85)';
  CTX.fillRect(Math.round(x-14),Math.round(y-6-((t%2<1)?1:0)),28,10);
  CTX.fillStyle='#ffe8a0';
  CTX.font='bold 8px "Microsoft YaHei",sans-serif';
  CTX.textAlign='center';
  CTX.fillText('E 交谈',x,y+1-((t%2<1)?1:0));
}

/* ---------------- HUD ---------------- */
function drawHUD(){
  const p=player;
  // 心
  for(let i=0;i<p.maxHearts;i++){
    CTX.drawImage(i<p.hearts?SPR.ui_heart:SPR.ui_heart_empty,5+i*10,5);
  }
  // 护盾
  for(let i=0;i<p.shield;i++){
    CTX.fillStyle='#7fdce8'; CTX.fillRect(6+i*5,15,3,3);
    CTX.fillStyle='#2f97b5'; CTX.fillRect(6+i*5,16,3,2);
  }
  // 生命（剩余命）
  CTX.drawImage(SPR.ui_live,W-40,5);
  CTX.fillStyle='#f8f8f8'; CTX.font='bold 9px "Microsoft YaHei",sans-serif'; CTX.textAlign='left';
  CTX.fillText('×'+Math.max(0,game.lives)+'/2',W-32,14);
  // 神行冲锋：L 或 Shift 自动使用任意一个已就绪的独立技能槽
  const skillW=8, skillGap=2, skillX=5, skillY=24;
  if(!Array.isArray(p.dashCd)) p.dashCd=[Math.max(0,p.dashCd||0),0,0];
  while(p.dashCd.length<DASH_SKILL.slots) p.dashCd.push(0);
  for(let i=0;i<DASH_SKILL.slots;i++){
    const x=skillX+i*(skillW+skillGap), cd=p.dashCd[i]||0;
    const ratio=clamp(1-cd/DASH_SKILL.cooldown,0,1);
    const active=p.dashT>0&&p.dashSlot===i;
    CTX.fillStyle='rgba(8,8,18,0.78)'; CTX.fillRect(x-1,skillY-1,skillW+2,9);
    CTX.fillStyle='#28243a'; CTX.fillRect(x,skillY,skillW,4);
    CTX.fillStyle=active?'#7fdce8':(cd>0?'#9a4fd8':'#f8d838');
    CTX.fillRect(x,skillY,skillW*ratio,4);
    txt(['L','⇧','+'][i],x+skillW/2,skillY+12,active?'#7fdce8':(cd<=0?'#f8d838':'#c0c0d0'),5,'center',true);
  }
  // 无敌模式标识
  if(game.god){
    CTX.fillStyle='rgba(248,216,56,0.18)'; CTX.fillRect(W-56,20,52,11);
    txt((window.DMG_MULT>1?'★无敌 伤害×'+window.DMG_MULT:'★无敌'),W-30,29,'#f8d838',8,'center',true);
  }
  // 状态图标
  let ey=24;
  for(const k of Object.keys(p.fx)){
    const m=EFFECT_META[k]; if(!m) continue;
    CTX.drawImage(SPR[m.icon],W-16,ey);
    CTX.fillStyle=m.color; CTX.font='bold 7px "Microsoft YaHei",sans-serif';
    CTX.textAlign='right';
    CTX.fillText(m.name+Math.ceil(p.fx[k].t)+'s',W-18,ey+7);
    ey+=13;
  }
  if(p.shield>0){
    CTX.drawImage(SPR.ui_shield,W-16,ey);
    CTX.fillStyle='#7fdce8'; CTX.font='bold 7px "Microsoft YaHei",sans-serif'; CTX.textAlign='right';
    CTX.fillText('神佑×'+p.shield,W-18,ey+7);
    ey+=13;
  }
  // 武器槽
  for(let i=0;i<player.weapons.length;i++){
    const w=WEAPONS.find(v=>v.id===player.weapons[i]);
    const sx=5+i*17, sy=H-21;
    CTX.fillStyle='rgba(22,22,30,0.8)'; CTX.fillRect(sx,sy,15,15);
    CTX.strokeStyle=i===player.wi?'#f8d838':'#5a6a88';
    CTX.lineWidth=1; CTX.strokeRect(sx+0.5,sy+0.5,14,14);
    drawWpnIcon(w.id,sx+7.5,sy+8);
    CTX.fillStyle=i===player.wi?'#f8d838':'#707080';
    CTX.font='bold 6px "Microsoft YaHei",sans-serif'; CTX.textAlign='left';
    CTX.fillText(String(i+1),sx+1,sy+14);
  }
  // 关卡名 + 当前任务目标
  txt((game.lv+1)+'-'+level.name,W/2,12,'rgba(255,255,255,0.85)',8,'center',true);
  let obj='',oc='#f8d838';
  if(level.bossDead){ obj='◈ 任务：进入传送门！'; oc='#7fdce8'; }
  else if(level.boss){ obj='◈ 任务：击败 '+level.boss.name; oc='#f8d838'; }
  if(obj) txt(obj,W/2,23,oc,8,'center',true);
  // Boss 血条（支持多管：多条从上到下依次点亮）
  const b=level.boss;
  if(b&&b.active&&!b.gone&&!b.dying){
    if(BOSS_WARN_STATES.has(b.state)&&b.state!=='rain'){
      const wave=BOSS_PATTERNS[b.state]?' '+(b.patternStep+1)+'/'+b.patternWaves:'';
      const label=(b.skillName||'蓄力')+wave+' · '+(b.skillHint||'离开红色预警');
      CTX.fillStyle='rgba(8,8,18,0.82)'; CTX.fillRect(W/2-158,35,316,23);
      txt(label,W/2,46,'#ffe8a0',8,'center',true);
      CTX.fillStyle='#ff6868'; CTX.fillRect(W/2-90,51,180*(1-clamp(b.stT/(b.castDuration||1),0,1)),2);
    }else if(hazards.some(h=>h.overload&&h.t<=h.dur)){
      txt('爆发中！先留在红圈外',W/2,45,'#ffe8a0',9,'center',true);
    }else if(b.state==='recover'){
      txt('破绽！趁现在反击',W/2,45,'#7fdce8',9,'center',true);
    }
    const bars=b.bars||1, bw=180, bx=W/2-bw/2, by=H-14-(bars-1)*7;
    CTX.fillStyle='rgba(0,0,0,0.6)'; CTX.fillRect(bx-2,by-2,bw+4,bars*7+3);
    CTX.font='bold 7px "Microsoft YaHei",sans-serif'; CTX.textAlign='center';
    CTX.fillStyle='rgba(6,6,14,0.75)'; CTX.fillText(b.name,W/2+1,by-3);
    CTX.fillStyle='#f8f8f8'; CTX.fillText(b.name,W/2,by-4);
    for(let i=0;i<bars;i++){
      const y=by+i*7;
      CTX.fillStyle='#3a3a4a'; CTX.fillRect(bx,y,bw,4);
      let r=0, col;
      if(i+1<b.bar){ r=1; col='#3a3a4a'; }
      else if(i+1===b.bar){ r=clamp(b.hp/b.maxhp,0,1); col=(i===0)?'#d84040':(i===1?'#b455d8':'#e08830'); }
      if(r>0){ CTX.fillStyle=col; CTX.fillRect(bx,y,bw*r,4); }
      if(i+1===b.bar&&r>0){ // 当前管高亮描边
        CTX.strokeStyle='rgba(255,255,255,0.5)'; CTX.lineWidth=0.5;
        CTX.strokeRect(bx+0.25,y+0.25,bw-0.5,3.5);
      }
    }
  }
  // 提示不覆盖关卡目标、技能名和蓄力条，只展示最近两条。
  const firstToast=Math.max(0,toasts.length-2), toastY=b&&b.active&&!b.gone?63:31;
  for(let i=firstToast;i<toasts.length;i++){
    const tt=toasts[i];
    const a=clamp(tt.t/0.4,0,1);
    CTX.globalAlpha=a;
    CTX.fillStyle='rgba(22,22,30,0.85)';
    CTX.font='bold 9px "Microsoft YaHei",sans-serif';
    const tw=CTX.measureText(tt.text).width;
    const y=toastY+(i-firstToast)*14;
    CTX.fillRect(W/2-tw/2-6,y,tw+12,12);
    CTX.fillStyle=tt.color; CTX.textAlign='center';
    CTX.fillText(tt.text,W/2,y+9);
    CTX.globalAlpha=1;
  }
  // 诅咒/毒 屏幕色调
  if(p.fx.curse){ CTX.fillStyle='rgba(90,42,140,0.13)'; CTX.fillRect(0,0,W,H); }
  if(p.fx.poison){ CTX.fillStyle='rgba(79,184,79,0.08)'; CTX.fillRect(0,0,W,H); }
  if(p.fx.slow){ CTX.fillStyle='rgba(127,220,232,0.09)'; CTX.fillRect(0,0,W,H); }
  if(game.flash>0){ CTX.fillStyle='rgba(216,64,64,'+(game.flash*0.5).toFixed(2)+')'; CTX.fillRect(0,0,W,H); }
  if(p.fx.invincible){ CTX.fillStyle='rgba(248,216,56,0.05)'; CTX.fillRect(0,0,W,H); }
  drawOffscreenArrow();
}

// 目标不在屏幕内时，在屏幕边缘画指向箭头
function drawOffscreenArrow(){
  const b=level.boss;
  let tx=null, label='';
  if(!level.bossDead&&b&&!b.gone){ tx=b.x+b.w/2; label='BOSS'; }
  else if(level.gate){ tx=level.gate.x+12; label='门'; }
  if(tx===null) return;
  const sx=tx-cam.x;
  if(sx>14&&sx<W-14) return;
  const ax=sx<=14?16:W-16, dir=sx<=14?-1:1;
  const pulse=0.6+Math.sin(game.frame/8)*0.3;
  CTX.fillStyle='rgba(248,216,56,'+pulse.toFixed(2)+')';
  CTX.beginPath();
  CTX.moveTo(ax+dir*7,H/2);
  CTX.lineTo(ax-dir*4,H/2-7);
  CTX.lineTo(ax-dir*4,H/2+7);
  CTX.fill();
  txt(label,ax-dir*8,H/2+3,'#ffe8a0',9,dir>0?'left':'right',true);
}

// 神兵图标（16x16 像素画，五把各不相同，统一「神器」描边语言）
const WICON_PAL={k:'#16161e',w:'#f8f8f8',s:'#9aa8c8',S:'#5a6a88',e:'#ffe8a0',E:'#c89820',
  y:'#f8d838',o:'#f08020',r:'#d84040',d:'#8c2020',c:'#7fdce8',C:'#2f97b5',
  n:'#a06028',N:'#6b3d10',m:'#e878b8',p:'#9a4fd8',P:'#5a2a8c'};
const WICON={
  sword:[
    "................",
    "............ss..",
    "...........ssws.",
    "..........ssws..",
    ".........ssws...",
    "........ssws....",
    ".......ssws.....",
    "......ssws......",
    ".....ssws.......",
    "....ssws........",
    "...ssws.........",
    "...eewee........",
    "....knnk........",
    "....knnk........",
    "....keek........",
    "................"],
  flysword:[
    "................",
    "............sc..",
    "...........scws.",
    "..........scws..",
    ".........scws...",
    "........scws....",
    ".......scws.....",
    "......scws......",
    ".....scws.......",
    "....scws........",
    "...scws.........",
    "...eeyee........",
    "....eee.........",
    "....mm..........",
    ".....m..........",
    "................"],
  bow:[
    "................",
    "........yy......",
    ".......yEky.....",
    "......yEk.w.....",
    ".....yEk...w....",
    "....yEk.....w...",
    "...yEk.......w..",
    "...yE.........w.",
    "...yE.........w.",
    "...yEk.......w..",
    "....yEk.....w...",
    ".....yEk...w....",
    "......yEk.w.....",
    ".......yEky.....",
    "........yy......",
    "................"],
  thunder:[
    "................",
    ".......yy.......",
    "......yccy......",
    "......yccy......",
    ".....yccy.......",
    "....yccy........",
    "...yyccyy.......",
    "..ycccy.........",
    "...yccy.........",
    "....yccy........",
    ".....yccy.......",
    "....ycccy.......",
    "...yccy.........",
    "..yccy..........",
    "..yccy..........",
    "...yy..........."],
  flameblade:[
    "................",
    "....o.....o.....",
    "...oro...oro....",
    "..oryo..oryo....",
    "..oryo..oryo....",
    "..oryo..oryo....",
    "...oro...oro....",
    "...oro...oro....",
    "....o.....o.....",
    ".....o...o......",
    "......o.o.......",
    ".....eyyye......",
    "......knk.......",
    "......knk.......",
    "......ke........",
    "................"],
};
function drawWpnIcon(id,cx,cy,scale){
  const rows=WICON[id]||WICON.sword, s=scale||1;
  const x0=cx-rows[0].length*s/2, y0=cy-rows.length*s/2;
  for(let y=0;y<rows.length;y++){
    const row=rows[y];
    for(let x=0;x<row.length;x++){
      const ch=row[x]; if(ch==='.') continue;
      CTX.fillStyle=WICON_PAL[ch]||'#f8f8f8';
      CTX.fillRect(Math.round(x0+x*s),Math.round(y0+y*s),s,s);
    }
  }
}

/* ---------------- 界面 ---------------- */
function drawDialog(){
  const d=game.dialog; if(!d) return;
  const n=d.npc;
  const bw=340, bx=W/2-bw/2, by=H-64;
  CTX.fillStyle='rgba(10,10,20,0.92)';
  CTX.fillRect(bx,by,bw,54);
  CTX.strokeStyle='#c89820'; CTX.lineWidth=1; CTX.strokeRect(bx+0.5,by+0.5,bw-1,53);
  CTX.fillStyle='#f8d838'; CTX.font='bold 9px "Microsoft YaHei",sans-serif'; CTX.textAlign='left';
  CTX.fillText(n.name+'：',bx+10,by+15);
  CTX.fillStyle='#f8f8f8'; CTX.font='9px "Microsoft YaHei",sans-serif';
  CTX.fillText(d.lines[d.idx],bx+10,by+32);
  if(Math.floor(game.frame/20)%2===0){
    CTX.fillStyle='#ffe8a0'; CTX.textAlign='right';
    CTX.fillText('E ▸',bx+bw-8,by+48);
  }
}

function drawIntro(){
  CTX.fillStyle='rgba(8,8,16,0.78)';
  CTX.fillRect(0,H/2-48,W,96);
  CTX.fillStyle='#f8d838';
  CTX.font='bold 20px "Microsoft YaHei",sans-serif'; CTX.textAlign='center';
  CTX.fillText('第'+['一','二','三','四','五'][game.lv]+'关 · '+level.name,W/2,H/2-14);
  CTX.fillStyle='#c0c0d0'; CTX.font='9px "Microsoft YaHei",sans-serif';
  CTX.fillText(level.sub,W/2,H/2+6);
  CTX.fillStyle='#ffe8a0'; CTX.font='bold 9px "Microsoft YaHei",sans-serif';
  CTX.fillText('◈ 通关目标：击败 BOSS「'+BOSSES[level.bossType].name+'」，传送门便会解封',W/2,H/2+24);
  CTX.fillStyle='#7fdce8'; CTX.font='8px "Microsoft YaHei",sans-serif';
  CTX.fillText(level.tip,W/2,H/2+40);
}

// 标题界面：全妖魔阵容海报
const TITLE_CAST=[ // [精灵名, 是否浮空]
  ['n_heal',0],['e_soldier',0],['e_cowhead',0],['e_horseface',0],['e_spider',0],['e_ghostfire',1],
  'HERO',
  ['e_skeleton',0],['e_hound',0],['e_imp',0],['e_gargoyle',0],['e_angel',1],['e_ice',0],['b_chaos',0],
];
function drawTitle(){
  const t=game.frame/60;
  // ---- 背景 ----
  if(!_bgGrad.title){
    const g=CTX.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#0b0718'); g.addColorStop(0.5,'#241030'); g.addColorStop(0.82,'#4a1626'); g.addColorStop(1,'#241020');
    _bgGrad.title=g;
  }
  CTX.fillStyle=_bgGrad.title; CTX.fillRect(0,0,W,H);
  // 月亮 + 光晕
  CTX.fillStyle='rgba(244,232,192,0.10)'; CTX.beginPath(); CTX.arc(392,52,34,0,Math.PI*2); CTX.fill();
  CTX.fillStyle='rgba(244,232,192,0.16)'; CTX.beginPath(); CTX.arc(392,52,28,0,Math.PI*2); CTX.fill();
  CTX.fillStyle='#f4e8c0'; CTX.beginPath(); CTX.arc(392,52,20,0,Math.PI*2); CTX.fill();
  CTX.fillStyle='rgba(180,160,120,0.5)';
  CTX.beginPath(); CTX.arc(386,48,3,0,Math.PI*2); CTX.fill();
  CTX.beginPath(); CTX.arc(398,58,2,0,Math.PI*2); CTX.fill();
  // 远处天宫/群山剪影
  CTX.fillStyle='rgba(16,8,28,0.85)';
  CTX.fillRect(30,196,54,42); CTX.fillRect(22,188,70,10);
  CTX.fillRect(44,178,26,12); CTX.fillRect(38,168,38,12);
  CTX.beginPath(); CTX.moveTo(330,238); CTX.lineTo(390,196); CTX.lineTo(450,238); CTX.fill();
  CTX.beginPath(); CTX.moveTo(424,238); CTX.lineTo(470,208); CTX.lineTo(480,238); CTX.fill();
  // 飘云
  CTX.fillStyle='rgba(90,50,110,0.35)';
  cloudShape(((t*10)%(W+160))-80,88,0.9);
  cloudShape(((t*6+300)%(W+160))-80,150,0.7);
  // 上空飞过的石像鬼王
  const gx=((t*26)%(W+240))-120;
  drawSpr('b_garg',gx,44+Math.sin(t*1.6)*7,(gx%480)>240?1:-1,0,1.1);
  // 上飘的灵火粒子
  for(let i=0;i<18;i++){
    const px2=(i*113+((t*10*(1+i%2))%W))%W;
    const py2=H-((t*16+i*37)%(H*0.9));
    CTX.fillStyle='rgba(255,'+(180+(i%3)*20)+',120,'+(0.16+(i%3)*0.1).toFixed(2)+')';
    CTX.fillRect(px2,py2,1.5,1.5);
  }
  // ---- 底部妖魔列队 ----
  const stripTop=218, floorY=236;
  CTX.fillStyle='#170e20'; CTX.fillRect(0,stripTop,W,H-stripTop);
  CTX.fillStyle='#241634'; CTX.fillRect(0,floorY,W,3);
  CTX.fillStyle='rgba(248,216,56,0.28)'; CTX.fillRect(0,floorY,W,1);
  const castX0=26, gap=34;
  CTX.save();
  CTX.beginPath(); CTX.rect(0,stripTop,W,H-stripTop); CTX.clip();  // 阵容只在下栏活动，不压菜单
  TITLE_CAST.forEach((c,i)=>{
    const x=castX0+i*gap;
    if(c==='HERO'){
      CTX.fillStyle='rgba(248,216,56,0.35)'; CTX.fillRect(x-16,floorY,32,3);
      drawSpr('hero_idle',x,floorY,1,0,1.15);
      return;
    }
    const [name,air]=c;
    const bob=air?Math.sin(t*2.6+i*1.3)*3:0;
    const face=x<W/2?1:-1;
    drawSpr(name,x,floorY-(air?9:0)-bob,face,0,air?1:(name==='b_chaos'?1.05:1));
  });
  CTX.restore();
  // ---- 两侧压阵 Boss ----
  CTX.fillStyle='rgba(154,79,216,0.18)'; CTX.beginPath(); CTX.ellipse(46,138,26,30,0,0,Math.PI*2); CTX.fill();
  CTX.fillStyle='rgba(240,128,32,0.16)'; CTX.beginPath(); CTX.ellipse(434,136,28,32,0,0,Math.PI*2); CTX.fill();
  drawSpr('b_judge',46,150+Math.sin(t*2)*3,1,0,1.5);
  drawSpr('b_flame',434,148+Math.sin(t*2.3+1)*3,-1,0,1.55);
  // ---- 标题 ----
  CTX.textAlign='center';
  CTX.fillStyle='rgba(0,0,0,0.55)';
  CTX.font='bold 42px "Microsoft YaHei",sans-serif';
  CTX.fillText('神魔远征',W/2+3,82);
  CTX.fillStyle='#f8d838';
  CTX.fillText('神魔远征',W/2,79);
  CTX.strokeStyle='rgba(200,152,32,0.9)'; CTX.lineWidth=1;
  CTX.beginPath();
  CTX.moveTo(W/2-128,92); CTX.lineTo(W/2-92,92);
  CTX.moveTo(W/2+92,92); CTX.lineTo(W/2+128,92);
  CTX.stroke();
  CTX.fillStyle='#ffe8a0'; CTX.font='bold 10px "Microsoft YaHei",sans-serif';
  CTX.fillText(window.GOD_MODE?'✦ MYTHIC ODYSSEY · 无敌版 ✦':'✦ MYTHIC ODYSSEY ✦',W/2,96);
  if(window.GOD_MODE){
    CTX.fillStyle='rgba(248,216,56,'+(0.5+Math.sin(t*4)*0.25).toFixed(2)+')';
    CTX.font='bold 9px "Microsoft YaHei",sans-serif';
    CTX.fillText('★ 无敌模式 · 伤害 ×'+(window.DMG_MULT||5)+' ★',W/2,110);
  }
  // ---- 菜单 ----
  CTX.fillStyle='#c0c0d0'; CTX.font='9px "Microsoft YaHei",sans-serif';
  CTX.fillText('东方与西方的神仙妖怪在此拦路 · 五重天地 · 集齐神兵讨魔神',W/2,138);
  // 关卡选择（菜单第一项选中时可用）
  const sel=game.titleSel||0, menuOn=game.titleMenu===0&&!game.titleSet&&!game.titleHelp;
  CTX.fillStyle=menuOn?'#7fdce8':'#5a6a7a'; CTX.font='bold 9px "Microsoft YaHei",sans-serif';
  CTX.fillText((menuOn?'◀  ':'    ')+'第 '+(sel+1)+' 关 · '+LEVELS[sel].name+(menuOn?'  ▶':'    '),W/2,152);
  // 三个菜单按钮
  CTX.fillStyle='rgba(10,7,20,0.80)'; CTX.fillRect(W/2-74,162,148,60);   // 菜单衬底，压住背景
  const items=['开始征战','设  置','操作说明'];
  items.forEach((s,i)=>{
    const y=176+i*20, on=game.titleMenu===i&&!game.titleSet&&!game.titleHelp;
    CTX.fillStyle=on?'rgba(248,216,56,0.16)':'rgba(255,255,255,0.05)';
    CTX.fillRect(W/2-64,y-11,128,16);
    if(on){ CTX.strokeStyle='#f8d838'; CTX.lineWidth=1; CTX.strokeRect(W/2-63.5,y-10.5,127,15); }
    txt((on?'▸ ':'')+s,W/2,y+1,on?'#f8d838':'#b0b0c0',10,'center',on);
  });
  CTX.fillStyle='#8a8a9a'; CTX.font='8px "Microsoft YaHei",sans-serif';
  CTX.fillText(menuOn?'↑↓/WS 选择    ←→/AD 换关卡    回车 确认':'↑↓/WS 选择菜单项    回车 确认',W/2,245);
  // 操作说明（底部半透明条）
  CTX.fillStyle='rgba(8,6,16,0.6)'; CTX.fillRect(0,252,W,18);
  CTX.fillStyle='rgba(200,200,215,0.9)'; CTX.font='8px "Microsoft YaHei",sans-serif';
  CTX.fillText('←→ 移动  空格 跳跃  J 攻击  L/Shift 冲锋  E 交谈  Q 换武器  H 操作说明',W/2,262);
}

function drawGameover(){
  CTX.fillStyle='rgba(10,4,4,0.88)'; CTX.fillRect(0,0,W,H);
  CTX.textAlign='center';
  CTX.fillStyle='#d84040'; CTX.font='bold 30px "Microsoft YaHei",sans-serif';
  CTX.fillText('你倒下了……',W/2,H/2-20);
  CTX.fillStyle='#c0c0d0'; CTX.font='10px "Microsoft YaHei",sans-serif';
  CTX.fillText('神仙妖怪的考验尚未结束',W/2,H/2+4);
  if(Math.floor(game.frame/30)%2===0){
    CTX.fillStyle='#f8f8f8'; CTX.font='bold 12px "Microsoft YaHei",sans-serif';
    CTX.fillText('按 回车 重整旗鼓（本关重来）',W/2,H/2+34);
  }
}

function drawWin(){
  CTX.fillStyle='rgba(12,8,4,0.9)'; CTX.fillRect(0,0,W,H);
  const t=game.frame/60;
  for(let i=0;i<40;i++){
    const x=(i*89+t*10)%W, y=(i*137)%H;
    CTX.fillStyle='rgba(248,216,56,'+(0.2+(i%3)*0.15).toFixed(2)+')';
    CTX.fillRect(x,y,2,2);
  }
  CTX.textAlign='center';
  CTX.fillStyle='#f8d838'; CTX.font='bold 28px "Microsoft YaHei",sans-serif';
  CTX.fillText('通 关 大 吉 ！',W/2,90);
  CTX.fillStyle='#ffe8a0'; CTX.font='bold 12px "Microsoft YaHei",sans-serif';
  CTX.fillText('混沌魔神已灭，封神榜上留下你的名字！',W/2,118);
  CTX.fillStyle='#c0c0d0'; CTX.font='10px "Microsoft YaHei",sans-serif';
  const mins=Math.floor(game.playTime/60), secs=Math.floor(game.playTime%60);
  CTX.fillText('用时 '+mins+' 分 '+(secs<10?'0':'')+secs+' 秒　·　倒下 '+game.deaths+' 次',W/2,146);
  drawSpr('hero_idle',W/2-4,200+Math.sin(t*2)*3,1,0);
  if(Math.floor(game.frame/30)%2===0){
    CTX.fillStyle='#f8f8f8'; CTX.font='bold 11px "Microsoft YaHei",sans-serif';
    CTX.fillText('按 回车 返回标题',W/2,238);
  }
}

/* ---------------- 主循环 ---------------- */
let lastT=0;
function frame(ts){
  const dt=Math.min(1/30,(ts-lastT)/1000||0.016);
  lastT=ts;
  update(dt);
  updateMusic();
  // 绘制（2x 变换，全部沿用逻辑坐标）
  CTX.setTransform(RS,0,0,RS,0,0);
  CTX.clearRect(0,0,W,H);
  if(game.state==='title'){
    drawTitle();
    if(game.titleSet) drawSettingsPanel('Esc 返回');
    if(game.titleHelp) drawHelpPanel();
    if(game.titleMode) drawModePanel();
  }else if(level){
    drawWorld();
    CTX.drawImage(VIGN,0,0); // 暗角
    drawHUD();
    drawDialog();
    // Boss 出场横幅
    if(game.bossBannerT>0&&level.boss&&!level.boss.gone){
      const a=clamp(game.bossBannerT*1.5,0,1);
      CTX.globalAlpha=a;
      txt('— BOSS —',W/2,H/2-34,'#ff7070',10,'center',true);
      txt('「'+level.boss.name+'」',W/2,H/2-14,'#f8f8f8',17,'center',true);
      CTX.globalAlpha=1;
    }
    if(game.state==='intro') drawIntro();
    if(game.state==='clear'){
      CTX.fillStyle='rgba(8,8,16,'+clamp(game.stateT*2,0,0.6).toFixed(2)+')';
      CTX.fillRect(0,0,W,H);
      CTX.fillStyle='#f8d838'; CTX.font='bold 24px "Microsoft YaHei",sans-serif'; CTX.textAlign='center';
      CTX.fillText('关 卡 完 成 ！',W/2,H/2-6);
      CTX.fillStyle='#ffe8a0'; CTX.font='10px "Microsoft YaHei",sans-serif';
      CTX.fillText('踏入传送门，前往下一重天地……',W/2,H/2+18);
    }
  }
  if(game.state==='gameover') drawGameover();
  if(game.state==='win') drawWin();
  if(game.settingsOpen&&game.state!=='title'&&level){
    CTX.fillStyle='rgba(8,8,16,0.72)'; CTX.fillRect(0,0,W,H);
    drawSettingsPanel('Esc 关闭');
  }
  // 清除单帧按键
  for(const k in pressed) pressed[k]=false;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
