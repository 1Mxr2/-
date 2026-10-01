'use strict';
const fs=require('fs');
function ctxStub(){const grad={addColorStop(){}};return new Proxy({},{get(t,k){if(k==='createLinearGradient'||k==='createRadialGradient')return()=>grad;if(k==='measureText')return()=>({width:10});if(typeof k==='string')return()=>undefined;return undefined;},set(){return true;}});}
const cs=()=>({width:0,height:0,getContext:()=>ctxStub()});
global.window={addEventListener(){}};
global.document={getElementById:cs,createElement:cs};
global.requestAnimationFrame=()=>{};
const code=['js/sprites.js','js/data.js'].map(f=>fs.readFileSync(f,'utf8')).join('\n');
const G=new Function('window','document',code+';return {LEVELS};')(global.window,global.document);
for(const [i,L] of G.LEVELS.entries()){
  let z=[],g=[];
  L.map.forEach((row,y)=>{
    let x=row.indexOf('Z'); if(x>=0) z.push(x+','+y);
    x=row.indexOf('G'); if(x>=0) g.push(x+','+y);
  });
  console.log('Lv'+(i+1),L.name,'| boss:',L.boss,'| Z:',JSON.stringify(z),'| G:',JSON.stringify(g));
}
