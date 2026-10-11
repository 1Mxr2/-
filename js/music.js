'use strict';
/* 原创循环配乐：四声部 + 合成打击乐。纯 WebAudio，可离线运行。 */
const notes=s=>s.trim().split(/\s+/).map(n=>n==='.'?-1:Number(n));
const phrase=(...parts)=>notes(parts.join(' '));
const chord=(root,minor=false)=>[root,root+(minor?3:4),root+7];
const MUSIC_TRACKS=[
  {name:'热血战曲',style:'街机摇滚 · 热血推进',bpm:146,base:220,voice:'pulse',bassVoice:'bass',drum:'k-h-sk-hk-hhsk-h',
    chords:[chord(0,true),chord(5,true),chord(8),chord(7)],arp:true,
    mel:phrase('0 3 7 12 . 7 3 0','5 8 12 15 . 12 8 7','8 12 15 19 15 . 12 8','7 11 14 17 14 11 7 .','12 . 12 10 7 3 7 10','12 15 . 12 8 5 8 12','15 12 8 12 19 15 12 .','14 11 7 11 12 . . .')},
  {name:'云海谣',style:'笛音琴弦 · 云间漫步',bpm:88,base:294,voice:'flute',bassVoice:'round',drum:'k-------h---t---',
    chords:[chord(0),chord(9,true),chord(5),chord(7)],arp:true,
    mel:phrase('0 . 4 7 12 . 9 7','4 . 7 12 16 . 14 12','9 . 7 4 7 . 12 9','5 . 9 12 9 7 4 .','7 . 12 . 14 16 14 12','9 . 12 16 19 . 16 12','17 . 16 12 9 . 7 5','7 9 7 4 2 . 0 .')},
  {name:'幽冥葬歌',style:'钟声暗潮 · 幽冥探险',bpm:112,base:207.65,voice:'bell',bassVoice:'bass',drum:'k---s-t-k--hs---',
    chords:[chord(0,true),chord(8),chord(5,true),chord(7)],arp:false,
    mel:phrase('0 . . 3 7 . 6 .','8 . 7 . 3 . 0 .','5 . 8 . 12 . 11 .','7 . 11 14 11 . 7 .','12 11 8 7 3 . 0 .','8 . 12 . 15 14 12 .','5 8 12 . 8 . 5 .','7 . 11 . 12 . . .')},
  {name:'竹林蹦蹦调',style:'竹音拨弦 · 轻快跳跃',bpm:124,base:261.63,voice:'pluck',bassVoice:'round',drum:'k-h-t-h-sk-h-t-h',swing:0.12,
    chords:[chord(0),chord(5),chord(9,true),chord(7)],arp:true,
    mel:phrase('12 7 4 . 7 9 7 .','9 12 9 5 9 . 12 .','12 9 7 . 9 12 16 12','14 11 7 9 7 . 2 .','4 7 12 . 16 12 7 .','5 9 12 17 16 12 9 .','9 12 16 . 19 16 12 9','11 14 11 7 4 2 0 .')},
  {name:'灯火赶集',style:'锣鼓木琴 · 热闹夜市',bpm:132,base:293.66,voice:'marimba',bassVoice:'round',drum:'kht-skhtkht-stht',swing:0.08,
    chords:[chord(0),chord(7),chord(5),chord(0)],arp:true,
    mel:phrase('0 4 7 4 9 7 4 .','7 11 14 . 11 7 2 .','5 9 12 9 14 12 9 5','7 4 0 . 4 7 12 .','12 12 16 12 19 16 12 7','14 11 7 11 14 . 19 .','17 16 12 9 12 14 12 9','7 9 7 4 2 4 0 .')},
  {name:'御剑追风',style:'电子疾驰 · 御剑飞行',bpm:158,base:246.94,voice:'pulse',bassVoice:'bass',drum:'k-hhskhhk-hhskhs',arp:true,
    chords:[chord(0,true),chord(8),chord(3),chord(10)],
    mel:phrase('0 7 12 7 15 12 7 3','8 12 15 12 19 . 15 12','3 7 10 15 10 7 3 7','10 14 17 14 22 17 14 10','12 . 15 19 15 12 7 12','20 19 15 12 15 19 20 .','15 10 7 10 15 . 19 15','17 14 10 14 12 . 7 .')},
  {name:'月下摇摆',style:'摇摆电琴 · 松弛闯关',bpm:104,base:220,voice:'keys',bassVoice:'round',drum:'k-h-s-h-k-ths-h-',swing:0.24,
    chords:[[0,3,7,10],[5,8,12,15],[2,5,9,12],[7,11,14,17]],arp:false,
    mel:phrase('12 . 15 14 12 . 10 7','8 . 12 15 12 8 7 .','9 12 14 . 17 14 12 9','11 . 14 17 14 11 7 .','15 12 10 . 7 10 12 .','17 . 15 12 8 . 12 15','14 12 9 . 5 9 12 14','11 14 17 14 12 . . .')},
  {name:'星河泡泡',style:'合成器流行 · 闪亮冒险',bpm:120,base:261.63,voice:'bell',bassVoice:'round',drum:'k-hhsh-hk-hhsh-h',arp:true,
    chords:[chord(0),chord(7),chord(9,true),chord(5)],
    mel:phrase('12 . 7 12 16 12 7 .','14 . 11 7 11 14 19 .','16 12 9 . 12 16 19 16','17 . 12 9 5 9 12 .','19 16 12 . 16 19 24 .','23 19 14 . 11 14 19 .','21 19 16 12 9 . 12 16','17 16 12 9 7 . 12 .')},
  {name:'决战破阵',style:'战鼓史诗 · Boss 决战',bpm:138,base:196,voice:'brass',bassVoice:'bass',drum:'k-t-skttk-t-skts',arp:true,
    chords:[chord(0,true),chord(5,true),chord(8),chord(7)],
    mel:phrase('0 . 0 7 12 . 10 7','5 . 8 12 17 15 12 .','8 12 15 . 20 19 15 12','7 . 11 14 19 17 14 .','12 12 15 19 15 12 10 7','17 . 15 12 8 12 15 17','20 19 15 12 8 . 12 15','19 17 14 11 12 . . .')},
];
const TITLE_TRACK={name:'山河序',style:'琴钟序曲',bpm:74,base:261.63,voice:'pluck',bassVoice:'round',drum:'k-------t-------',arp:true,
  chords:[chord(0),chord(9,true),chord(5),chord(7)],
  mel:phrase('0 . 4 . 7 . 12 .','11 . 7 . 9 . 7 .','4 . 7 . 12 . 16 .','14 . 11 . 7 . 4 .')};
const MUS_NAMES=MUSIC_TRACKS.map(t=>t.name);
const MUS={step:0,nextT:0,current:null,bus:null,tracks:{title:TITLE_TRACK,list:MUSIC_TRACKS}};
const nf=(base,n)=>base*Math.pow(2,n/12);

function createMusicBus(context,destination){
  const input=context.createGain(),output=context.createGain(),compressor=context.createDynamicsCompressor();
  compressor.threshold.value=-16;compressor.knee.value=12;compressor.ratio.value=3;compressor.attack.value=0.006;compressor.release.value=0.15;
  input.connect(compressor);compressor.connect(output);output.connect(destination);output.gain.value=0.72;
  const echo=context.createDelay(1),echoGain=context.createGain();echo.delayTime.value=0.19;echoGain.gain.value=0.10;
  input.connect(echo);echo.connect(echoGain);echoGain.connect(compressor);
  let seed=12345;const noise=context.createBuffer(1,Math.ceil(context.sampleRate*0.3),context.sampleRate),channel=noise.getChannelData(0);
  for(let i=0;i<channel.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;channel[i]=seed/2147483648-1;}
  const bus={context,input,output,compressor,echo,echoGain,noise,sources:new Set(),closed:false};
  bus.close=()=>{if(bus.closed)return;bus.closed=true;for(const source of bus.sources){try{source.stop();}catch(e){}}bus.sources.clear();for(const node of [input,output,compressor,echo,echoGain])node.disconnect();};
  return bus;
}
function musicNote(bus,freq,at,len,voice='pluck',volume=0.08,pan=0){
  if(bus.closed)return;
  const c=bus.context,g=c.createGain(),filter=c.createBiquadFilter(),stereo=c.createStereoPanner();
  filter.type='lowpass';filter.frequency.value=voice==='bass'?750:voice==='pulse'?2400:voice==='brass'?1800:5000;
  stereo.pan.value=pan;filter.connect(g);g.connect(stereo);stereo.connect(bus.input);
  const sustain=voice==='flute'||voice==='brass'||voice==='round',attack=sustain?0.025:0.007,release=0.09;
  g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(volume,at+attack);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001,volume*(sustain?0.58:0.2)),at+Math.max(attack+0.01,len*0.7));
  g.gain.linearRampToValueAtTime(0,at+len+release);
  const layers=voice==='bell'?[[1,1,'sine'],[2.01,0.28,'sine'],[3.98,0.09,'sine']]:voice==='keys'?[[1,1,'sine'],[2,0.20,'triangle']]:voice==='marimba'?[[1,1,'sine'],[4,0.10,'sine']]:voice==='pluck'?[[1,1,'triangle'],[2,0.13,'sine']]:[[1,1,voice==='pulse'?'square':voice==='brass'||voice==='bass'?'sawtooth':voice==='flute'?'sine':'triangle']];
  let remaining=layers.length;
  for(const [harmonic,amp,wave] of layers){
    const osc=c.createOscillator(),v=c.createGain();osc.type=wave;osc.frequency.value=freq*harmonic;v.gain.value=amp;
    osc.connect(v);v.connect(filter);bus.sources.add(osc);
    osc.onended=()=>{bus.sources.delete(osc);osc.disconnect();v.disconnect();if(--remaining===0){g.disconnect();filter.disconnect();stereo.disconnect();}};
    osc.start(at);osc.stop(at+len+release+0.01);
  }
}
function musicDrum(bus,kind,at){
  const c=bus.context;
  if(kind==='k'||kind==='t'){
    const osc=c.createOscillator(),g=c.createGain();osc.type='sine';osc.frequency.setValueAtTime(kind==='k'?130:210,at);osc.frequency.exponentialRampToValueAtTime(kind==='k'?46:90,at+0.13);
    g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(kind==='k'?0.16:0.08,at+0.003);g.gain.exponentialRampToValueAtTime(0.001,at+0.2);
    osc.connect(g);g.connect(bus.input);bus.sources.add(osc);osc.onended=()=>{bus.sources.delete(osc);osc.disconnect();g.disconnect();};osc.start(at);osc.stop(at+0.21);
  }else if(kind==='s'||kind==='h'){
    const src=c.createBufferSource(),filter=c.createBiquadFilter(),g=c.createGain();src.buffer=bus.noise;
    filter.type='highpass';filter.frequency.value=kind==='h'?6500:1500;
    const dur=kind==='h'?0.045:0.14;g.gain.setValueAtTime(kind==='h'?0.032:0.09,at);g.gain.exponentialRampToValueAtTime(0.001,at+dur);
    src.connect(filter);filter.connect(g);g.connect(bus.input);bus.sources.add(src);src.onended=()=>{bus.sources.delete(src);src.disconnect();filter.disconnect();g.disconnect();};src.start(at);src.stop(at+dur+0.01);
  }
}
function scheduleMusicStep(bus,trk,step,at,dur){
  const beat=step%8,ch=trk.chords[Math.floor(step/8)%trk.chords.length],swing=step%2?(trk.swing||0)*dur:0;
  const m=trk.mel[step%trk.mel.length];
  if(m!==-1)musicNote(bus,nf(trk.base,m),at+swing,dur*0.77,trk.voice,trk.voice==='pulse'?0.047:0.082,-0.10);
  if(beat%2===0){
    const bass=ch[0]-24+(beat===6?7:0);
    musicNote(bus,nf(trk.base,bass),at,dur*1.45,trk.bassVoice,0.085,0);
  }
  if(beat===0)for(const n of ch)musicNote(bus,nf(trk.base,n-12),at,dur*6.8,'round',0.023,0.22);
  if(trk.arp&&step%2===1)musicNote(bus,nf(trk.base,ch[Math.floor(step/2)%ch.length]+12),at+swing,dur*0.6,'pluck',0.025,0.42);
  musicDrum(bus,trk.drum[step%trk.drum.length],at+swing);
}
function musicTrackIndex(index){return Number.isInteger(index)&&index>=0&&index<MUSIC_TRACKS.length?index:0;}
function resetMusic(){
  if(MUS.bus){
    const old=MUS.bus,now=old.context.currentTime;
    old.output.gain.cancelScheduledValues(now);old.output.gain.setValueAtTime(old.output.gain.value,now);old.output.gain.linearRampToValueAtTime(0,now+0.08);
    setTimeout(()=>old.close(),180);
  }
  MUS.bus=null;MUS.current=null;MUS.step=0;MUS.nextT=0;
}
function updateMusic(){
  if(!AC||muted||AC.state!=='running')return;
  const trk=game.state==='title'&&!game.titleSet?TITLE_TRACK:MUSIC_TRACKS[musicTrackIndex(SET.track)];
  if(MUS.current!==trk){
    resetMusic();MUS.current=trk;MUS.bus=createMusicBus(AC,master||AC.destination);MUS.nextT=AC.currentTime+0.035;
    MUS.bus.output.gain.setValueAtTime(0,AC.currentTime);MUS.bus.output.gain.linearRampToValueAtTime(0.72,AC.currentTime+0.12);
  }
  const dur=60/trk.bpm/2;
  if(MUS.nextT<AC.currentTime-0.05)MUS.nextT=AC.currentTime+0.035;
  let guard=0;
  while(MUS.nextT<AC.currentTime+0.16&&guard++<16){scheduleMusicStep(MUS.bus,trk,MUS.step,MUS.nextT,dur);MUS.step=(MUS.step+1)%trk.mel.length;MUS.nextT+=dur;}
}

// 与游戏使用同一合成器的离线试听/检查入口，避免“示例声音”和实际游戏不一致。
async function renderMusicTrack(index,seconds=10,sampleRate=22050){
  const trk=MUSIC_TRACKS[musicTrackIndex(index)],c=new OfflineAudioContext(2,Math.ceil(seconds*sampleRate),sampleRate);
  const bus=createMusicBus(c,c.destination),dur=60/trk.bpm/2;
  for(let step=0,at=0.05;at<seconds-0.25;step++,at+=dur)scheduleMusicStep(bus,trk,step,at,dur);
  bus.output.gain.setValueAtTime(0,c.currentTime);bus.output.gain.linearRampToValueAtTime(0.72,0.08);
  bus.output.gain.setValueAtTime(0.72,seconds-0.20);bus.output.gain.linearRampToValueAtTime(0,seconds);
  const buffer=await c.startRendering();bus.close();return buffer;
}
