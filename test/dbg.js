'use strict';
const fs=require('fs');
function ctxStub(){const grad={addColorStop(){}};return new Proxy({},{get(t,k){if(k==='createLinearGradient'||k==='createRadialGradient')return()=>grad;if(k==='measureText')return()=>({width:10});if(typeof k==='string')return()=>undefined;return undefined;},set(){return true;}});}
const cs=()=>({width:0,height:0,style:{},getContext:()=>ctxStub()});
let kd=null,ku=null;
global.window={addEventListener:(t,fn)=>{if(t==='keydown')kd=fn;if(t==='keyup')ku=fn;},innerWidth:1280,innerHeight:720};
global.document={getElementById:cs,createElement:cs};
global.requestAnimationFrame=()=>{};
const code=['js/sprites.js','js/data.js','js/game.js'].map(f=>fs.readFileSync(f,'utf8')).join('\n');
const G=new Function('window','document',code+`;return {game,player,get level(){return level},startLevel,frame,get game_projs(){return game_projs}};`)(global.window,global.document);
const press=c=>kd({code:c,preventDefault(){},repeat:false});
const release=c=>ku({code:c});
let ts=1000;
const run=n=>{for(let i=0;i<n;i++){ts+=16.7;G.frame(ts);}};

G.startLevel(0); run(3); press('Enter'); run(2); release('Enter');
console.log('state=',G.game.state,'weapons=',G.player.weapons.join(','),'wi=',G.player.wi);
if(!G.player.weapons.includes('bow')) G.player.weapons.push('bow');
G.player.wi=G.player.weapons.indexOf('bow');
console.log('wi=',G.player.wi,'cd=',G.player.cd.toFixed(2),'dead=',G.player.dead);
press('ArrowUp'); press('KeyJ');
run(1);
console.log('after frame: aim=',G.player.aim,'atkT=',G.player.atkT.toFixed(2),'cd=',G.player.cd.toFixed(2),'projs=',G.game_projs.length);
release('KeyJ'); release('ArrowUp');
