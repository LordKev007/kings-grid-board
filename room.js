import {emptyBoard,changeBoard,copy,visibleTiles,isUnit} from './model.js';
export const other=t=>t==='red'?'blue':'red';
export function newRoom(code,name,team,token,first){return {code,board:emptyBoard(),backgroundMap:'classic',fog:false,players:[{name,team,token}],phase:'setup',ready:{red:false,blue:false},first:first||team,turn:first||team,revision:0,undo:{red:[],blue:[]},log:[],requests:[],tickets:[]};}
// Each player's view of the room. This is the only data the Worker ever sends a player, so anything
// hidden here never reaches their browser: the opponent's setup, and in Fog of War everything outside
// what that player's units can see.
export function publicRoom(r,team){
 const board=copy(r.board),fog=!!r.fog&&r.phase==='play';let visible=null,hiddenOwn=[];
 if(r.phase==='setup'){board.pieces=board.pieces.filter(p=>p.fixed||p.team===team);board.nextNumber=1;}
 else if(fog){
  const seen=visibleTiles(r.board,team);visible=[...seen];
  const inView=p=>{for(let dx=0;dx<p.w;dx++)for(let dy=0;dy<p.h;dy++)if(seen.has(`${p.x+dx},${p.y+dy}`))return true;return false;};
  // Your own units and your own reserve always show; every other piece only while a unit can see it.
  const shows=p=>p.x===null?p.team===team:(p.team===team&&isUnit(p))||inView(p);
  hiddenOwn=board.pieces.filter(p=>p.team===team&&!shows(p)).map(p=>({type:p.type,copyNo:p.copyNo}));
  board.pieces=board.pieces.filter(shows);board.nextNumber=1;
  for(const k of Object.keys(board.paint||{}))if(!seen.has(k))delete board.paint[k];
 }
 const history=r.log.filter(l=>r.phase==='play'||l.team===team).map(l=>fog&&l.team!==team&&!l.pub?{...l,text:`${l.text.split(':')[0]}: made a move`}:l);
 return {code:r.code,board,backgroundMap:r.backgroundMap||'classic',fog:!!r.fog,visible,hiddenOwn,players:r.players.map(({name,team})=>({name,team})),phase:r.phase,ready:r.ready,turn:r.turn,first:r.first,revision:r.revision,canUndo:r.undo[team].length>0,history,myTeam:team};
}
export function applyAction(r,team,a){
 let description='',pub=['map','fog','reset','ready'].includes(a.kind);
 if(a.kind==='fog'){
  r.fog=a.on===true;description=r.fog?'Turned Fog of War on':'Turned Fog of War off';
 }else if(a.kind==='map'){
  const map=String(a.map||'classic').trim();
  if(map!=='classic'&&!/^[a-z0-9_-]{1,60}$/i.test(map))throw Error('Invalid battle map.');
  r.backgroundMap=map;description=map==='classic'?'Changed battlefield to Classic':'Changed battlefield';
 }else if(a.kind==='reset'){
  r.board=emptyBoard();r.phase='setup';r.ready={red:false,blue:false};r.turn=r.first;r.undo={red:[],blue:[]};r.log=[];description='Reset the table for a new setup';
 }else if(a.kind==='ready'){
  if(r.phase!=='setup')throw Error('Setup has already finished.');r.ready[team]=!r.ready[team];
  if(r.players.length===2&&r.ready.red&&r.ready.blue){r.phase='play';r.turn=r.first;r.undo={red:[],blue:[]};r.log=[];description='Both players ready — armies revealed';}
  else description=r.ready[team]?'Ready for reveal':'Resumed private setup';
 }else if(a.kind==='pass'){
  throw Error('Pass Turn is no longer used after setup. Both players may move pieces.');
 }else{
  if(r.phase==='setup'&&r.ready[team])throw Error('Click Not ready to change your setup.');
  // After setup, both players may move any piece. The board does not enforce turns.
  if(a.kind==='undo'){
   const last=r.undo[team].pop();if(!last)throw Error('Nothing to undo.');
   if(r.phase==='setup')r.board.pieces=[...r.board.pieces.filter(p=>p.fixed||p.team!==team),...last.pieces.filter(p=>!p.fixed)];else {r.board=last;r.undo[other(team)]=[];}description='Undid last edit';
  }else{
   const piece=r.board.pieces.find(p=>p.id===a.id);
   if(a.kind==='wallHealth'&&(!piece||piece.fixed||(r.phase==='setup'&&piece.team!==team)))throw Error('You cannot adjust that wall during this phase.');
   if(['edit','remove'].includes(a.kind)&&(!piece||piece.team!==team))throw Error('Select one of your own pieces.');
   if(a.kind==='move'&&(!piece||piece.fixed))throw Error('That piece cannot be moved.');
   if(a.kind==='move'&&r.phase==='setup'&&piece.team!==team)throw Error('Only move your own pieces during setup.');
   if(a.kind==='rotate'&&(!piece||piece.fixed||(piece.team!==team&&(r.phase==='setup'||!piece.type.endsWith('wall')))))throw Error('You cannot rotate that piece during this phase.');
   if(a.kind==='edit'&&a.team!==undefined&&a.team!==team)throw Error('Piece colours belong to their player.');
   if(a.kind==='add'){
    if(a.team!==team)throw Error('Place pieces from your own tray.');
    if(r.board.pieces.some(p=>p.team===team&&p.type===a.type&&p.copyNo===a.copyNo))throw Error('That numbered piece is already placed. Select it to move it.');
   }
   if(a.kind==='import'&&r.phase==='setup')throw Error('Load saved games after both players are ready.');
   if(a.kind==='import'&&r.fog)throw Error('Turn off Fog of War before loading a save.');
   if(a.kind==='paint'||a.kind==='paintStroke')a={...a,team};
   if(a.kind==='clearPaint')a={...a,team};
   const before=copy(r.board);
   let result;
   if(a.kind==='clear'){const b=copy(r.board);b.pieces=b.pieces.filter(p=>p.fixed||p.team!==team);result={board:b,description:'Returned all own pieces to the tray'};}
   else result=changeBoard(r.board,a);
   if(r.phase==='setup')before.pieces=before.pieces.filter(p=>p.fixed||p.team===team);
   r.undo[team].push(before);r.undo[team]=r.undo[team].slice(-40);
   while(new TextEncoder().encode(JSON.stringify(r.undo[team])).length>300000)r.undo[team].shift();
   r.board=result.board;if(r.phase==='play')r.undo[other(team)]=[];description=result.description;
  }
 }
 r.revision++;r.log.unshift({team,text:`${r.players.find(p=>p.team===team)?.name||team}: ${description}`,at:Date.now(),...(pub?{pub:true}:{})});r.log=r.log.slice(0,60);return r;
}
