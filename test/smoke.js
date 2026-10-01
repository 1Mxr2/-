'use strict';
/* 冒烟测试：用桩对象在 Node 里跑通游戏主循环，捕获运行时错误 */
const fs=require('fs');
const path=require('path');

// ---- Canvas / DOM 桩 ----
function ctxStub(){
  const grad={addColorStop(){}};
  return new Proxy({},{
    get(t,k){
      if(k==='createLinearGradient'||k==='createRadialGradient') return ()=>grad;
      if(k==='measureText') return ()=>({width:10});
      if(typeof k==='string') return ()=>undefined;
      return undefined;
    },
    set(){return true;}
  });
}
function canvasStub(){
  return {width:0,height:0,style:{},getContext:()=>ctxStub()};
}
// 多实例：每个 new Function 实例都会注册自己的键盘监听，按键广播给全部实例
const kds=[],kus=[];
global.window={
  addEventListener:(t,fn)=>{ if(t==='keydown')kds.push(fn); if(t==='keyup')kus.push(fn); },
  innerWidth:1280, innerHeight:720,
  AudioContext:undefined,
};
global.document={
  getElementById:()=>canvasStub(),
  createElement:()=>canvasStub(),
};
global.requestAnimationFrame=()=>{};
global.performance={now:()=>Date.now()};

// ---- 载入游戏代码 ----
const code=['js/sprites.js','js/data.js','js/game.js']
  .map(f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8')).join('\n');
const expose=new Function('window','document','requestAnimationFrame','performance', code+`
;return {game,player,get level(){return level;},cam,LEVELS,WEAPONS,NPC_TYPES,ENEMY_TYPES,BOSSES,
 startLevel,buildLevel,update,game_projs,hazards,particles,damageEnemy,applyEffect,
 resetRun,grantBuff,updateProjs,updateEnemy,updateBoss,hurtPlayer,levelClear,frame};`);
const G=expose(global.window,global.document,global.requestAnimationFrame,global.performance);

function press(codeStr){ kds.forEach(f=>f({code:codeStr,preventDefault(){},repeat:false})); }
function release(codeStr){ kus.forEach(f=>f({code:codeStr})); }

let failures=0;
function check(name,cond,extra){
  if(cond) console.log('  PASS  '+name);
  else { failures++; console.log('  FAIL  '+name+(extra?('  -> '+extra):'')); }
}

function runFrames(n,ts0){
  let ts=ts0;
  for(let i=0;i<n;i++){ ts+=16.7; try{ G.frame(ts); }catch(e){ console.error('  EXCEPTION at frame',i,':',e.stack); throw e; } }
  return ts;
}
const pressOnce=(c)=>{ press(c); };

(async()=>{
  console.log('== 烟雾测试开始 ==');
  let ts=1000;

  // 1. 标题 → 开始
  runFrames(10,ts);
  pressOnce('Enter'); ts=runFrames(1,ts); release('Enter');
  if(G.game.titleMode){ pressOnce('Enter'); ts=runFrames(1,ts); release('Enter'); }
  check('标题按回车进入第一关', G.game.state==='intro'||G.game.state==='play', 'state='+G.game.state);
  check('默认进入勇者模式', G.game.mode==='brave'&&G.game.god===false&&(window.DMG_MULT||1)===1, 'mode='+G.game.mode);

  let dlgSeen=false;
  // 2. 五关逐关：跑图 + 跳跃 + 攻击
  for(let lv=0; lv<G.LEVELS.length; lv++){
    dlgSeen=false;
    G.startLevel(lv);
    ts=runFrames(5,ts);
    pressOnce('Enter'); ts=runFrames(2,ts); release('Enter');
    check('第'+(lv+1)+'关 intro->play', G.game.state==='play');
    // 模拟闯关：按住右 + 周期跳 + 周期攻击
    press('ArrowRight');
    for(let f=0;f<900;f++){
      if(G.game.dialog&&!dlgSeen){ dlgSeen=true; console.log('  DEBUG dialog opened in sim lv'+(lv+1)+' f='+f+' state='+G.game.state+' npc='+(G.game.dialog.npc.type||'?')+' px='+G.player.x.toFixed(0)+' py='+G.player.y.toFixed(0)); }
      if(f%40===0) pressOnce('Space');
      if(f%40===20) release('Space');
      if(f%22===0) pressOnce('KeyJ'); else if(f%22===1) release('KeyJ');
      ts=runFrames(1,ts);
      if(G.game.state==='gameover'){ pressOnce('Enter'); ts=runFrames(2,ts); release('Enter'); }
      if(G.game.state==='clear') break;
    }
    release('ArrowRight');
    check('第'+(lv+1)+'关 15 秒模拟运行无异常', true);
  }

  // 3. Boss 战逐关：开启无敌+金刚，站在 Boss 面前挥剑 + 射弩
  for(let lv=0; lv<G.LEVELS.length; lv++){
    G.startLevel(lv);
    ts=runFrames(5,ts);
    pressOnce('Enter'); ts=runFrames(2,ts); release('Enter');
    if(!G.level||!G.level.boss) console.log('  DEBUG lv='+lv+' state='+G.game.state+' level='+(G.level?G.level.name:'null')+' boss='+(G.level&&G.level.boss?G.level.boss.name:'null')+' game.lv='+G.game.lv);
    const b=G.level.boss;
    G.game.god=true;
    G.player.fx.power={t:9999,tick:0};
    G.player.wi=0; // 贴身近战：剑的判定框宽，不会像箭一样从Boss体内隧穿
    // 传送到 Boss 面前
    G.player.x=b.x-70; G.player.y=b.y-10; G.player.face=1;
    const hp0=b.hp;
    let died=false;
    for(let f=0;f<7200;f++){
      // 贴身输出机器人：锚定 Boss 当前位置，连续挥剑
      G.player.x=b.x+b.w/2-4; G.player.y=b.y+b.h-13;
      G.player.vx=0; G.player.vy=0; G.player.face=1;
      if(f%14===0) pressOnce('KeyJ'); else if(f%14===1) release('KeyJ');
      ts=runFrames(1,ts);
      if(b.gone){ died=true; break; }
      if(G.game.state==='gameover'){ G.game.lives=3; pressOnce('Enter'); ts=runFrames(2,ts); release('Enter'); G.player.x=b.x-70; G.player.y=b.y-10; }
    }
    check('第'+(lv+1)+'关 Boss「'+b.name+'」可被击杀', b.gone===true, '剩余HP='+b.hp+'/'+b.maxhp);
    check('第'+(lv+1)+'关 Boss 死后大门开启', G.level.gate.open===true);
  }

  // 4. 状态效果：中毒/灼烧/寒冰/诅咒
  G.game.god=false;
  G.startLevel(0); ts=runFrames(3,ts);
  pressOnce('Enter'); ts=runFrames(2,ts); release('Enter');
  G.player.hearts=5; G.player.maxHearts=5; G.player.shield=0; delete G.player.fx.invincible;
  G.applyEffect('poison',6);
  const h0=G.player.hearts;
  ts=runFrames(300,ts); // 5 秒
  check('中毒持续掉血', G.player.hearts<h0, 'hearts='+G.player.hearts);
  // 防止中毒致死干扰后续：重开一关再测诅咒
  G.startLevel(0); ts=runFrames(3,ts);
  pressOnce('Enter'); ts=runFrames(2,ts); release('Enter');
  G.applyEffect('curse',5);
  const w0=G.WEAPONS[0];
  // 诅咒应放大近战冷却
  G.player.cd=0;
  pressOnce('KeyJ'); ts=runFrames(1,ts); release('KeyJ');
  const cdCurse=G.player.cd;
  G.player.cd=0; delete G.player.fx.curse;
  pressOnce('KeyJ'); ts=runFrames(1,ts); release('KeyJ');
  check('诅咒使攻击冷却变慢', cdCurse>G.player.cd, 'curse='+cdCurse.toFixed(2)+' normal='+G.player.cd.toFixed(2));
  G.applyEffect('slow',4);
  check('寒冰效果已挂上', !!G.player.fx.slow);

  // 5. NPC 对话 → 增益（第一关 npcs[0] 是第8行先解析的风灵，这里显式找药童）
  G.startLevel(0); ts=runFrames(3,ts);
  pressOnce('Enter'); ts=runFrames(2,ts); release('Enter');
  const npc=G.level.npcs.find(n=>n.type==='A');
  G.player.x=npc.x; G.player.y=npc.y;
  pressOnce('KeyE'); ts=runFrames(2,ts); release('KeyE');
  check('NPC 触发对话', !!G.game.dialog);
  for(let i=0;i<npc.lines.length;i++){ pressOnce('KeyE'); ts=runFrames(2,ts); release('KeyE'); }
  check('对话结束 NPC 已赠送增益', G.game.dialog===null&&npc.done===true);

  // 再次交谈：只说告别语，绝不重复送礼
  G.player.hearts=1;
  pressOnce('KeyE'); ts=runFrames(2,ts); release('KeyE');
  check('再次交谈显示告别语(仅1句)', !!G.game.dialog&&G.game.dialog.lines.length===1);
  const byeN=G.game.dialog.lines.length;
  for(let i=0;i<byeN;i++){ pressOnce('KeyE'); ts=runFrames(2,ts); release('KeyE'); }
  check('重复交谈不再赠送增益', G.game.dialog===null&&npc.done===true&&G.player.hearts===1, 'hearts='+G.player.hearts);

  // 5.5 方向攻击（独立干净实例，避免前序章节的输入状态污染）
  {
    const G2=new Function('window','document',code+`;return {game,player,get level(){return level},startLevel,frame,get game_projs(){return game_projs}};`)(global.window,global.document);
    const run2=n=>{for(let i=0;i<n;i++){ts+=16.7;G2.frame(ts);}};
    G2.startLevel(0); run2(3);
    pressOnce('Enter'); run2(2); release('Enter');
    if(!G2.player.weapons.includes('bow')) G2.player.weapons.push('bow');
    G2.player.wi=G2.player.weapons.indexOf('bow');
    press('ArrowUp'); press('KeyJ'); run2(1); release('KeyJ'); release('ArrowUp');
    const upPr=G2.game_projs.find(pr=>pr.team==='p');
    check('↑+J 可向上射击', !!upPr&&upPr.vy<0&&Math.abs(upPr.vx)<1, upPr?('vy='+upPr.vy.toFixed(0)+' aim='+G2.player.aim):'无投射物 aim='+G2.player.aim);
    // 空中 ↓+J 向下射（先等弓冷却转好，再置于空中）
    run2(22);
    G2.player.x=100; G2.player.y=100; G2.player.vy=0; G2.player.vx=0;
    press('ArrowDown'); press('KeyJ'); run2(1); release('KeyJ'); release('ArrowDown');
    const dnPr=G2.game_projs.find(pr=>pr.team==='p'&&pr.vy>0);
    check('空中↓+J 可向下射击', !!dnPr&&dnPr.vy>0&&Math.abs(dnPr.vx)<1, dnPr?('vy='+dnPr.vy.toFixed(0)):'无投射物');
    G2.game_projs.length=0;
  }

  // 6. 死亡与重生
  G.game.god=false;
  G.startLevel(0); ts=runFrames(3,ts);
  pressOnce('Enter'); ts=runFrames(2,ts); release('Enter');
  G.game.lives=2; G.player.shield=0; delete G.player.fx.invincible;
  G.player.hearts=3; // 与默认初始一致（此前测试可能吃过心之容器）
  for(let i=0;i<3;i++){
    G.player.inv=0;
    G.hurtPlayer(1,{});
    ts=runFrames(i<2?80:40,ts); // 越过无敌帧；第3次只走到死亡动画中途
  }
  check('三心打完进入死亡', G.player.dead===true);
  ts=runFrames(120,ts);
  check('死亡后消耗一条命并重生', G.player.dead===false&&G.game.lives===1, 'lives='+G.game.lives);
  G.game.lives=0; G.player.shield=0; G.player.inv=0; G.player.hearts=1; G.hurtPlayer(1,{}); ts=runFrames(120,ts);
  check('命尽进入 gameover', G.game.state==='gameover');
  pressOnce('Enter'); ts=runFrames(2,ts); release('Enter');
  check('gameover 回车重开本关', G.game.state==='intro'||G.game.state==='play');

  // 7. 地图结构校验：出生点安全 / 门存在 / Boss 存在
  for(let lv=0;lv<G.LEVELS.length;lv++){
    const L=G.buildLevel(lv);
    check('第'+(lv+1)+'关有门与Boss与出生点', !!L.gate&&!!L.boss&&!!L.spawn, JSON.stringify({gate:!!L.gate,boss:!!L.boss}));
    // 出生点不应卡在实体方块里
    const tx=Math.floor((L.spawn.x+4)/16), ty=Math.floor((L.spawn.y+8)/16);
    const ch=L.grid[ty][tx];
    check('第'+(lv+1)+'关出生点不在墙里', ch!=='#', 'ch='+ch+' at '+tx+','+ty);
  }

  console.log(failures===0?'\n== 全部通过 ==':'\n== 有 '+failures+' 项失败 ==');
  process.exit(failures===0?0:1);
})().catch(e=>{ console.error('致命错误:',e); process.exit(2); });
