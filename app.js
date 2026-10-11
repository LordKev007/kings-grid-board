import {CATALOG} from './catalog.js';
import {emptyBoard,validateBoard,coord,WIDTH,HEIGHT,wallMaxHP,wallHP,saveFilename} from './model.js';
import {newRoom,publicRoom,applyAction,other} from './room.js';
const $=s=>document.querySelector(s),el=id=>document.getElementById(id),uuid=()=>crypto.randomUUID();
const read=(k,d=null)=>{try{return JSON.parse(localStorage.getItem(k))??d;}catch{return d;}};
const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{toast('Browser storage unavailable. Keep your private resume link and download saves.');}};
const forget=k=>{try{localStorage.removeItem(k);}catch{}};
let room=null,session=null,local=false,localState=null,team='red',selected=null,placing=null,flipped=false,cell=30,fit=true,busy=false,connected=false,pingMode=false,rulerMode=false,rulerOrigin=null,privateRuler=null,publicRuler=null,paintMode=false,paintErase=false;
let socket=null,retry=null,heartbeat=null,toastTimer=null,generation=0,dragData=null,lastDrag=0,previousPositions=new Map();
let battleMaps=[{id:'classic',name:'Classic',youtubeId:null,scale:1,offsetX:0,offsetY:0,enabled:true,sortOrder:-1}];
const battleMap=id=>battleMaps.find(m=>m.id===id)||null;
function populateMapSelect(){
 const select=el('mapSelect');if(!select)return;const wanted=room?.backgroundMap||select.value||'classic';select.replaceChildren();
 for(const map of battleMaps){const o=document.createElement('option');o.value=map.id;o.textContent=map.name;select.append(o);}
 if(wanted&&!battleMap(wanted)){const o=document.createElement('option');o.value=wanted;o.textContent='Unavailable map';o.disabled=true;select.append(o);}
 select.value=wanted;
}
async function loadBattleMaps(api){
 try{const res=await fetch(api+'/api/backgrounds',{headers:{accept:'application/json'},cache:'no-store'});const d=await res.json();if(!res.ok)throw Error(d.error||'Could not load backgrounds.');
  const remote=Array.isArray(d.backgrounds)?d.backgrounds.filter(m=>m&&m.enabled!==false):[];
  battleMaps=[{id:'classic',name:'Classic',youtubeId:null,scale:1,offsetX:0,offsetY:0,enabled:true,sortOrder:-1},...remote.filter(m=>m.id!=='classic')];populateMapSelect();if(room)renderMap();
 }catch(e){console.warn(e);populateMapSelect();}
}
function mapEmbedUrl(videoId){const q=new URLSearchParams({autoplay:'1',mute:'1',controls:'0',loop:'1',playlist:videoId,playsinline:'1',rel:'0',fs:'0',disablekb:'1'});return `https://www.youtube.com/embed/${videoId}?${q}`;}
function renderMap(){
 const board=el('board'),layer=el('mapLayer');if(!board||!layer)return;
 const id=room?.backgroundMap||'classic',map=battleMap(id),videoId=map?.youtubeId||null;
 board.classList.toggle('has-map',!!videoId);layer.classList.toggle('active',!!videoId);
 if(!videoId){if(layer.childElementCount){layer.replaceChildren();layer.dataset.signature='';}return;}
 const scale=Math.max(.5,Math.min(3,Number(map.scale)||1)),offsetX=Math.max(-100,Math.min(100,Number(map.offsetX)||0)),offsetY=Math.max(-100,Math.min(100,Number(map.offsetY)||0));
 const signature=[videoId,scale,offsetX,offsetY].join('|');let iframe=layer.querySelector('iframe');
 if(layer.dataset.signature!==signature||!iframe){iframe=document.createElement('iframe');iframe.src=mapEmbedUrl(videoId);iframe.title='Animated King’s Grid battlefield';iframe.allow='autoplay; encrypted-media; picture-in-picture';iframe.referrerPolicy='strict-origin-when-cross-origin';iframe.tabIndex=-1;layer.replaceChildren(iframe);layer.dataset.signature=signature;}
 Object.assign(iframe.style,{left:`${50+offsetX}%`,top:`${50+offsetY}%`,width:`${147*scale}%`,height:`${122*scale}%`});
}
const start=new URL(location.href);el('api').value=start.searchParams.get('server')||read('kg-board-api','https://kings-grid-board-v2.battlesim.workers.dev');el('name').value=read('kg-board-name','');el('code').value=start.searchParams.get('room')||'';
el('backgroundEditor').href=`background-editor.html?server=${encodeURIComponent(el('api').value)}${start.searchParams.get('room')?`&room=${encodeURIComponent(start.searchParams.get('room'))}`:''}`;loadBattleMaps(el('api').value);window.addEventListener('focus',()=>loadBattleMaps(session?.api||el('api').value));window.addEventListener('message',e=>{if(e.origin===location.origin&&e.data?.kind==='kg-backgrounds-updated')loadBattleMaps(session?.api||el('api').value);});setInterval(()=>loadBattleMaps(session?.api||el('api').value),60000);
el('update').onclick=()=>{const u=new URL(location.href);u.searchParams.set('kg_update',Date.now().toString());location.replace(u.href);};
function toast(text){el('toast').textContent=text;el('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el('toast').hidden=true,6500);}
function server(){const u=new URL(el('api').value.trim());if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw Error('Enter the HTTPS URL of the new board Worker.');return u.origin;}
const key=(api,code)=>`kg-board-v2:${api}:${code}`;
async function request(path,{body,token=session?.token,api=session?.api||server()}={}){
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),15000);
 try{const res=await fetch(api+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:c.signal});const d=await res.json();if(!res.ok){if(d.room)update(d.room);throw Error(d.error||'Request failed');}return d;}finally{clearTimeout(timer);}
}
async function launch(join){
 el('setupError').textContent='';el('create').disabled=el('join').disabled=true;
 try{const api=server(),name=el('name').value.trim()||'Player';let d;
  if(join){const code=el('code').value.trim().toUpperCase();if(!/^[A-Z2-9]{8}$/.test(code))throw Error('Enter the 8-character room code.');const saved=read(key(api,code)),hash=new URLSearchParams(location.hash.slice(1)),privateToken=hash.get('resume');
   if(privateToken||saved?.token){session={api,code,token:privateToken||saved.token};d=await request(`/api/rooms/${code}/state`);session.team=d.room.myTeam;}
   else{d=await request(`/api/rooms/${code}/join`,{api,token:null,body:{name}});session={api,code,token:d.token,team:d.team};}
  }else{const chosen=$('input[name="team"]:checked')?.value;if(!chosen)throw Error('Choose Red or Blue.');d=await request('/api/rooms',{api,token:null,body:{name,team:chosen,first:chosen}});session={api,code:d.room.code,token:d.token,team:d.team};}
  if(!d.room.phase)throw Error('This is an older board server. Deploy the v0.2.14 Worker first.');
  local=false;team=session.team;write(key(api,session.code),session);write('kg-board-last-session',session);write('kg-board-api',api);write('kg-board-name',name);await loadBattleMaps(api);el('backgroundEditor').href=`background-editor.html?server=${encodeURIComponent(api)}&room=${encodeURIComponent(session.code)}`;const u=new URL(location.href);u.hash='';u.search='';u.searchParams.set('room',session.code);history.replaceState(null,'',u);enter(d.room);connect();
 }catch(e){el('setupError').textContent=e.message;}finally{el('create').disabled=el('join').disabled=false;}
}
el('create').onclick=()=>launch(false);el('join').onclick=()=>launch(true);
el('local').onclick=()=>{local=true;team='red';session=null;localState=read('kg-board-v2-local');if(!localState?.phase){localState=newRoom('LOCAL','Red player','red','local-red','red');localState.players.push({name:'Blue player',team:'blue',token:'local-blue'});}connected=true;enter(publicRoom(localState,team));};
function enter(r){room=r;selected=null;placing=null;previousPositions.clear();el('welcome').hidden=true;el('table').hidden=false;el('leave').hidden=false;el('invite').hidden=el('resume').hidden=local;el('localSwitch').hidden=!local;fit=true;render();status();requestAnimationFrame(resize);}
function status(){el('connection').textContent=local?'● Local test · one computer':connected?'● Connected · changes saved':'● Reconnecting · editing paused';el('connection').classList.toggle('offline',!local&&!connected);}
function stopSocket(){generation++;clearTimeout(retry);clearInterval(heartbeat);if(socket){socket.onclose=null;socket.close();socket=null;}connected=false;}
async function connect(){stopSocket();const gen=generation;status();try{const d=await request(`/api/rooms/${session.code}/ticket`,{body:{}});if(gen!==generation)return;const u=new URL(session.api);u.protocol=u.protocol==='https:'?'wss:':'ws:';u.pathname=`/api/rooms/${session.code}/ws`;u.searchParams.set('ticket',d.ticket);socket=new WebSocket(u);
 socket.onopen=()=>{connected=true;status();heartbeat=setInterval(()=>{if(socket?.readyState===1)socket.send('ping');},20000);};
 socket.onmessage=e=>{if(e.data==='pong')return;try{const d=JSON.parse(e.data);if(d.room)update(d.room);if(d.ping)showPing(d.ping);if(d.drag)showDrag(d.drag);if(d.rulerClear){publicRuler=null;render();}if(d.ruler){publicRuler=d.ruler;render();}}catch{}};
 socket.onclose=()=>{connected=false;status();clearInterval(heartbeat);retry=setTimeout(connect,2000);};socket.onerror=()=>socket?.close();
 }catch{if(gen===generation){connected=false;status();retry=setTimeout(connect,3000);}}}
el('leave').onclick=async()=>{if(busy)return;if(local){stopSocket();room=null;session=null;el('table').hidden=true;el('welcome').hidden=false;el('leave').hidden=true;el('roomInfo').textContent='31 × 21 · Your board, your rules';return;}
 const leaving=session;if(!leaving)return;busy=true;el('leave').disabled=true;
 try{await request(`/api/rooms/${leaving.code}/leave`,{body:{},token:leaving.token,api:leaving.api});forget(key(leaving.api,leaving.code));const last=read('kg-board-last-session');if(last?.code===leaving.code&&last?.token===leaving.token)forget('kg-board-last-session');stopSocket();room=null;session=null;el('table').hidden=true;el('welcome').hidden=false;el('leave').hidden=true;el('roomInfo').textContent='31 × 21 · Your board, your rules';toast('Seat released. This table can now be joined from another device.');}
 catch(e){toast(e.message||'Could not release this seat.');}
 finally{busy=false;el('leave').disabled=false;}
};
function update(r){if(room&&r.revision<room.revision)return;room=r;team=r.myTeam;if(r.backgroundMap&&!battleMap(r.backgroundMap))loadBattleMaps(session?.api||el('api').value);if(r.phase==='setup'){privateRuler=null;publicRuler=null;rulerOrigin=null;}render();}
function editable(){return room&&((room.phase==='setup'&&!room.ready[team])||room.phase==='play')&&(local||connected);}
async function act(action){if(busy)return toast('Wait for the current edit to finish.');if(!local&&!connected)return toast('Reconnecting—editing is paused.');busy=true;
 try{if(local){applyAction(localState,team,action);write('kg-board-v2-local',localState);update(publicRoom(localState,team));}
 else{const payload={requestId:uuid(),revision:room.revision,action};let d;try{d=await request(`/api/rooms/${session.code}/command`,{body:payload});}catch(e){if(e.name==='AbortError'||e instanceof TypeError)d=await request(`/api/rooms/${session.code}/command`,{body:payload});else throw e;}update(d.room);}return true;
 }catch(e){toast(e.message);return false;}finally{busy=false;}}
el('localSwitch').onclick=()=>{team=other(team);selected=null;placing=null;previousPositions.clear();update(publicRoom(localState,team));toast(`Now viewing as ${team}. This is a local two-seat test.`);};
el('ready').onclick=()=>{selected=null;placing=null;act({kind:'ready'});};
function button(text,fn,cls){const b=document.createElement('button');b.textContent=text;b.onclick=fn;if(cls)b.className=cls;return b;}
const rulerButton=button('◎ Ruler',()=>{rulerMode=!rulerMode;paintMode=false;rulerButton.classList.toggle('active',rulerMode);paintButton?.classList.remove('active');erasePaintButton?.classList.remove('active');if(rulerMode)toast('Ruler mode: click any board tile, then enter a radius.');else{rulerOrigin=null;privateRuler=null;publicRuler=null;if(!local&&socket?.readyState===1)socket.send(JSON.stringify({kind:'rulerClear'}));render();}},'');
const rulerControls=document.createElement('span');rulerControls.className='ruler-controls';rulerControls.innerHTML='<label>Radius <input id="rulerRadius" type="number" min="1" max="30" value="5"></label><label>Colour <input id="rulerColor" type="color" value="#f1c75b" aria-label="Ruler colour"></label><label>Show to <select id="rulerScope"><option value="private">Only me</option><option value="public">Both players</option></select></label>';
const paintButton=button('▦ Paint',()=>{paintMode=!paintMode;paintErase=false;rulerMode=false;paintButton.classList.toggle('active',paintMode);erasePaintButton.classList.remove('active');rulerButton.classList.remove('active');if(paintMode)toast('Paint mode: click any tile. Paint stays until erased.');},'');
const erasePaintButton=button('⌫ Erase',()=>{paintMode=!paintMode||!paintErase;paintErase=true;rulerMode=false;erasePaintButton.classList.toggle('active',paintMode);paintButton.classList.remove('active');rulerButton.classList.remove('active');if(paintMode)toast('Erase mode: click painted tiles to clear them.');},'');
const paintControls=document.createElement('span');paintControls.className='paint-controls';paintControls.innerHTML='<label>Colour <input id="paintColor" type="color" value="#ffd54f" aria-label="Paint colour"></label><label>Opacity <select id="paintOpacity"><option value="0.3">Wash 30%</option><option value="0.6" selected>Highlight 60%</option><option value="1">Solid 100%</option></select></label>';
const clearMine=button('Clear my paint',()=>{if(confirm('Clear all tiles painted by you?'))act({kind:'clearPaint',scope:'mine'});},'');
const clearAll=button('Clear all paint',()=>{if(confirm('Clear ALL painted tiles for both players?'))act({kind:'clearPaint',scope:'all'});},'');
document.querySelector('.toolbar').append(rulerButton,rulerControls,paintButton,erasePaintButton,paintControls,clearMine,clearAll);
const rulerRadius=()=>Math.max(1,Math.min(30,Number.parseInt(el('rulerRadius').value,10)||1));
const rulerColor=()=>/^#[0-9a-f]{6}$/i.test(el('rulerColor').value)?el('rulerColor').value:'#f1c75b';
const paintColor=()=>/^#[0-9a-f]{6}$/i.test(el('paintColor').value)?el('paintColor').value:'#ffd54f';
const paintOpacity=()=>Math.max(0,Math.min(1,Number(el('paintOpacity').value)||.6));
el('rulerColor').value=read('kg-ruler-color','#f1c75b');el('paintColor').value=read('kg-paint-color','#ffd54f');el('paintOpacity').value=String(read('kg-paint-opacity',.6));
el('rulerColor').oninput=()=>{write('kg-ruler-color',el('rulerColor').value);if(rulerOrigin)setRulerOrigin(rulerOrigin.x,rulerOrigin.y);};
el('paintColor').oninput=()=>write('kg-paint-color',el('paintColor').value);el('paintOpacity').onchange=()=>write('kg-paint-opacity',Number(el('paintOpacity').value));
function setRulerOrigin(x,y){if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=WIDTH||y>=HEIGHT)return;rulerOrigin={x,y};const measure={x,y,radius:rulerRadius(),team,color:rulerColor()};if(el('rulerScope').value==='public'){if(room.phase!=='play')return toast('Public rulers are available after both players are ready.');publicRuler=measure;privateRuler=null;if(local)render();else if(socket?.readyState===1)socket.send(JSON.stringify({kind:'ruler',x,y,radius:measure.radius,color:measure.color}));else toast('Reconnect before sharing a ruler.');}else{if(publicRuler?.team===team){publicRuler=null;if(!local&&socket?.readyState===1)socket.send(JSON.stringify({kind:'rulerClear'}));}privateRuler=measure;render();}}
function paintAt(x,y){if(!editable())return toast('Reconnect before painting.');act(paintErase?{kind:'erasePaint',x,y}:{kind:'paint',x,y,color:paintColor(),opacity:paintOpacity()});}
el('rulerRadius').oninput=()=>{if(rulerOrigin)setRulerOrigin(rulerOrigin.x,rulerOrigin.y);};
el('rulerScope').onchange=()=>{if(rulerOrigin)setRulerOrigin(rulerOrigin.x,rulerOrigin.y);};
function graphic(t,colour,n){const path=t.art?.[colour+n];if(path){const im=document.createElement('img');im.src=path;im.alt=`${colour} ${t.name} ${n}`;im.draggable=false;im.className='token-art';return im;}const s=document.createElement('span');s.className='placeholder';s.textContent=t.id==='cannon'?'CANNON':`${t.icon} ${n}`;s.title=`${t.name} ${n} — placeholder`;return s;}
function renderCatalog(){el('ownTeam').textContent=`${team.toUpperCase()} PIECES`;el('ownTeam').className='teamchoices '+team+'text';const list=el('catalog');list.replaceChildren();const q=el('search').value.toLowerCase();
 for(const t of CATALOG.filter(t=>!['base','giving'].includes(t.id)&&t.name.toLowerCase().includes(q))){const row=document.createElement('div');row.className='catalog-row';const label=document.createElement('span');label.textContent=t.name;row.append(label);const tokens=document.createElement('div');tokens.className='token-row';for(let n=1;n<=(['unit1','cannon'].includes(t.id)?1:3);n++){const existing=room.board.pieces.find(p=>p.type===t.id&&p.team===team&&p.copyNo===n);const b=button('',()=>{if(!editable())return toast('Reconnect, or click Not ready to edit setup.');if(existing){selected=existing.id;placing=null;}else{placing={type:t.id,copyNo:n};selected=null;}render();},'tray-token '+team+(existing?' used':''));b.title=`${t.name} ${n}${existing?' (already placed)':''}`;b.setAttribute('aria-label',`${t.name} ${n}`);b.append(graphic(t,team,n));b.draggable=true;b.ondragstart=e=>{if(!editable()){e.preventDefault();return;}dragData=existing?{id:existing.id}:{type:t.id,copyNo:n};e.dataTransfer.setData('application/json',JSON.stringify(dragData));e.dataTransfer.effectAllowed='move';};b.ondragend=()=>dragData=null;tokens.append(b);}row.append(tokens);list.append(row);}}
el('search').oninput=renderCatalog;
function view(x,y,w=1,h=1){return flipped?{x:WIDTH-x-w,y:HEIGHT-y-h}:{x,y};}
function at(x,y){return room.board.pieces.filter(p=>p.x!==null&&x>=p.x&&x<p.x+p.w&&y>=p.y&&y<p.y+p.h);}
function squareFrom(e){const b=el('board').getBoundingClientRect();let x=Math.floor((e.clientX-b.left)/cell)-1,y=Math.floor((e.clientY-b.top)/cell)-1;if(x<0||y<0||x>=WIDTH||y>=HEIGHT)return null;return flipped?{x:WIDTH-1-x,y:HEIGHT-1-y}:{x,y};}
async function place(data,x,y,keepSelection=false){if(!editable())return toast('Reconnect, or click Not ready to edit setup.');const action=data.id?{kind:'move',id:data.id,x,y}:{kind:'add',id:uuid(),type:data.type,copyNo:data.copyNo,team,x,y,vertical:el('wallDirection').value==='vertical'};if(await act(action)){if(!keepSelection){selected=null;placing=null;}render();}}
function squareClick(x,y,e){if(pingMode||e.shiftKey){ping(x,y);return;}if(rulerMode){setRulerOrigin(x,y);return;}if(paintMode){paintAt(x,y);return;}if(placing){place(placing,x,y);return;}const p=room.board.pieces.find(p=>p.id===selected);if(p&&!p.fixed&&editable()&&(p.x!==x||p.y!==y)){place({id:p.id},x,y);return;}const ps=at(x,y);selected=ps.length?ps[(ps.findIndex(p=>p.id===selected)+1)%ps.length].id:null;render();}
el('board').ondragover=e=>{if(!editable())return;e.preventDefault();e.dataTransfer.dropEffect='move';const pos=squareFrom(e);if(pos&&dragData?.id&&Date.now()-lastDrag>90){lastDrag=Date.now();if(!local&&room.phase==='play'&&socket?.readyState===1)socket.send(JSON.stringify({kind:'drag',id:dragData.id,...pos}));}};
el('board').ondrop=e=>{e.preventDefault();const pos=squareFrom(e);let data=dragData;try{data=data||JSON.parse(e.dataTransfer.getData('application/json'));}catch{}dragData=null;if(pos&&data)place(data,pos.x,pos.y);};
let wallClick=null;
function showWallHealth(p,d){
 const max=wallMaxHP(p.type),hp=wallHP(p),vertical=p.h>p.w;
 d.classList.add('wall-health',vertical?'wall-vertical':'wall-horizontal');
 const label=document.createElement('span');label.className='wall-hp-label';label.textContent=max===null?'∞':`${hp}/${max}`;d.append(label);
 d.title+=max===null?' · Invincible':` · ${hp}/${max} HP`;
 const bar=document.createElement('span');bar.className='wall-hp-track';const fill=document.createElement('span');fill.style[vertical?'height':'width']=`${max===null?100:100*hp/max}%`;bar.append(fill);d.append(bar);
 if(max!==null&&hp===0)d.classList.add('wall-zero');
}
function renderWallEditor(board){
 const p=room.board.pieces.find(p=>p.id===selected);if(!p||!p.type.endsWith('wall')||p.x===null)return;
 const max=wallMaxHP(p.type);if(max===null)return;
 const v=view(p.x,p.y,p.w,p.h),panel=document.createElement('div');panel.className='wall-hp-editor';panel.setAttribute('aria-label','Wall health controls');
 panel.style.left=`${Math.max(cell,Math.min((v.x+1)*cell,(WIDTH+1)*cell-210))}px`;
 panel.style.top=`${v.y>=3?(v.y+1)*cell-78:(v.y+p.h+1)*cell+4}px`;
 const title=document.createElement('strong');title.textContent=`${p.label} · ${wallHP(p)}/${max} HP`;panel.append(title);
 const controls=document.createElement('div'),slider=document.createElement('input');slider.type='range';slider.min=0;slider.max=max;slider.step=1;slider.value=wallHP(p);slider.setAttribute('aria-label',`${p.label} health`);
 const set=hp=>act({kind:'wallHealth',id:p.id,hp});
 const minus=button('−',()=>set(Math.max(0,wallHP(p)-1))),plus=button('+',()=>set(Math.min(max,wallHP(p)+1)));
 minus.setAttribute('aria-label','Decrease wall health');plus.setAttribute('aria-label','Increase wall health');
 slider.oninput=()=>{title.textContent=`${p.label} · ${slider.value}/${max} HP`;};slider.onchange=()=>set(Number(slider.value));
 const allowed=editable();slider.disabled=!allowed;minus.disabled=!allowed||wallHP(p)===0;plus.disabled=!allowed||wallHP(p)===max;
 controls.append(minus,slider,plus);panel.append(controls);
 for(const name of ['click','dblclick','pointerdown','keydown','keyup'])panel.addEventListener(name,e=>e.stopPropagation());
 panel.addEventListener('dragstart',e=>{e.preventDefault();e.stopPropagation();});board.append(panel);
}
function renderBoard(){const board=el('board'),next=new Map();for(const child of [...board.children])if(child.id!=='mapLayer')child.remove();renderMap();
 for(let x=0;x<WIDTH;x++){const a=document.createElement('span');a.className='axis';a.textContent=coord(flipped?WIDTH-1-x:x,0).replace(/\d/g,'');a.style.left=`${(x+1)*cell}px`;a.style.top='0';board.append(a);}
 for(let y=0;y<HEIGHT;y++){const a=document.createElement('span');a.className='axis';a.textContent=String(flipped?HEIGHT-y:y+1);a.style.top=`${(y+1)*cell}px`;a.style.left='0';board.append(a);}
 for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){const v=view(x,y),b=button('',e=>squareClick(x,y,e),'cell'+((x+y)%2?' alt':''));b.style.left=`${(v.x+1)*cell}px`;b.style.top=`${(v.y+1)*cell}px`;b.dataset.x=x;b.dataset.y=y;b.setAttribute('role','gridcell');b.setAttribute('aria-label',coord(x,y));board.append(b);}
 for(const [key,paint] of Object.entries(room.board.paint||{})){const [x,y]=key.split(',').map(Number),v=view(x,y),mark=document.createElement('span');mark.className='paint-cell';mark.style.left=`${(v.x+1)*cell}px`;mark.style.top=`${(v.y+1)*cell}px`;mark.style.width=`${cell}px`;mark.style.height=`${cell}px`;mark.style.background=`${paint.color}${Math.round((paint.opacity??.6)*255).toString(16).padStart(2,'0')}`;board.append(mark);}
 const measure=privateRuler||publicRuler;if(measure&&Number.isInteger(measure.x)&&Number.isInteger(measure.y))for(let y=Math.max(0,measure.y-measure.radius);y<=Math.min(HEIGHT-1,measure.y+measure.radius);y++)for(let x=Math.max(0,measure.x-measure.radius);x<=Math.min(WIDTH-1,measure.x+measure.radius);x++)if(Math.max(Math.abs(x-measure.x),Math.abs(y-measure.y))<=measure.radius){const v=view(x,y),mark=document.createElement('span');mark.className='ruler-cell';const c=/^#[0-9a-f]{6}$/i.test(measure.color||'')?measure.color:'#f1c75b';mark.style.background=`${c}40`;mark.style.borderColor=`${c}cc`;mark.style.left=`${(v.x+1)*cell}px`;mark.style.top=`${(v.y+1)*cell}px`;mark.style.width=`${cell}px`;mark.style.height=`${cell}px`;board.append(mark);}
 const ordered=[...room.board.pieces].sort((a,b)=>(b.w*b.h-a.w*a.h)||((a.id===selected?1:0)-(b.id===selected?1:0)));
 for(const p of ordered){if(p.x===null)continue;const t=(CATALOG.find(t=>t.id===p.type)||{id:p.type,name:'Retired unit',icon:'✧',art:{}}),v=view(p.x,p.y,p.w,p.h),d=document.createElement('div');d.className=`piece ${p.team} ${p.status}${p.id===selected?' selected':''}${p.type==='cannon'?' cannon-object':''}${p.id.startsWith('fixed-base-')?' fixed-base':''}${p.type==='giving'?' fixed-giving':''}`;d.dataset.piece=p.id;d.setAttribute('role','button');d.tabIndex=0;d.setAttribute('aria-label',`${p.team} ${p.label} at ${coord(p.x,p.y)}`);d.title=`${p.label} · ${coord(p.x,p.y)}`;const left=(v.x+1)*cell+2,top=(v.y+1)*cell+2;Object.assign(d.style,{left:`${left}px`,top:`${top}px`,width:`${p.w*cell-4}px`,height:`${p.h*cell-4}px`});if(p.id.startsWith('fixed-base-')||p.type==='giving'){const fixedLabel=document.createElement('span');fixedLabel.className='fixed-label';fixedLabel.textContent=p.type==='giving'?'GT':'B';d.append(fixedLabel);}else d.append(graphic(t,p.team,p.copyNo));
 if(!p.fixed&&!t.art?.[p.team+p.copyNo]){const label=document.createElement('span');label.className='tiny';label.textContent=p.type==='cannon'?`Object ${p.copyNo}`:p.label;d.append(label);}
 if(p.type.endsWith('wall'))showWallHealth(p,d);
 if(p.status!=='normal'){const m=document.createElement('span');m.className='statusMark';m.textContent=p.status==='defeated'?'×':p.status==='distracted'?'♪':'⚑';d.append(m);}const n=at(p.x,p.y).length;if(n>1){const badge=document.createElement('span');badge.className='stackbadge';badge.textContent=n;d.append(badge);}
 d.onclick=e=>{e.stopPropagation();if(pingMode||e.shiftKey){ping(p.x,p.y);return;}if(rulerMode){const pos=squareFrom(e);if(pos)setRulerOrigin(pos.x,pos.y);return;}if(paintMode){const pos=squareFrom(e);if(pos)paintAt(pos.x,pos.y);return;}if(p.fixed)return;if(p.type.endsWith('wall')){const now=performance.now();if(wallClick?.id===p.id&&now-wallClick.at<500){wallClick=null;if(editable())act({kind:'rotate',id:p.id});return;}wallClick={id:p.id,at:now};}else wallClick=null;selected=p.id;placing=null;render();};d.onkeydown=e=>{if(e.key==='Enter'&&!p.fixed){selected=p.id;placing=null;render();}};
 d.draggable=!p.fixed&&editable();d.ondragstart=e=>{if(p.fixed||!editable()){e.preventDefault();return;}dragData={id:p.id};selected=null;placing=null;e.dataTransfer.setData('application/json',JSON.stringify(dragData));e.dataTransfer.effectAllowed='move';};d.ondragend=()=>dragData=null;board.append(d);
 const prev=previousPositions.get(p.id);if(prev&&(prev.left!==left||prev.top!==top)&&!matchMedia('(prefers-reduced-motion: reduce)').matches)d.animate([{transform:`translate(${prev.left-left}px,${prev.top-top}px)`},{transform:'translate(0,0)'}],{duration:280,easing:'ease-out'});next.set(p.id,{left,top});
 }previousPositions=next;renderWallEditor(board);
}
function render(){if(!room)return;if(selected&&!room.board.pieces.some(p=>p.id===selected))selected=null;populateMapSelect();el('mapSelect').value=room.backgroundMap||'classic';renderCatalog();renderBoard();
 el('roomInfo').textContent=local?`LOCAL TEST · viewing ${team}`:`Room ${room.code} · ${room.players.map(p=>p.name+' ('+p.team+')').join(' / ')}`;
 el('fullscreen').hidden=room.phase!=='play';el('ready').hidden=room.phase!=='setup';el('ready').textContent=room.ready[team]?'Not ready · edit setup':'Ready';el('pass').hidden=true;
 el('turnLabel').textContent=room.phase==='setup'?`Private setup · ${other(team)} ${room.ready[other(team)]?'ready':'not ready'}`:'Open movement · both players may move';
 el('counts').textContent=room.phase==='setup'?`${room.board.pieces.filter(p=>p.x!==null).length} of your pieces on board · opponent hidden`:`${room.board.pieces.filter(p=>p.x!==null).length} pieces on board`;
 el('undo').disabled=!room.canUndo||!editable();el('export').disabled=room.phase!=='play';el('reserves').replaceChildren();const reserve=room.board.pieces.filter(p=>p.x===null&&p.team===team);el('reserveCount').textContent=`(${reserve.length})`;for(const p of reserve)el('reserves').append(button(p.label,()=>{selected=p.id;placing=null;render();}));
 const p=room.board.pieces.find(p=>p.id===selected);el('selection').hidden=!p;
 el('hint').textContent=placing?`Drag or click to place ${CATALOG.find(t=>t.id===placing.type).name} ${placing.copyNo}.`:p?`${p.label} selected. ${p.type.endsWith('wall')?'Drag or use cursor keys to move; double-click to rotate.':p.team===team?'Drag, use the cursor keys, or use the controls below.':'Opponent’s piece — you may move it after reveal with drag or the cursor keys.'}`:room.phase==='setup'?'Place your pieces privately. Both players must click Ready to reveal.':'Both players may move any piece. Click a piece, then use the cursor keys to move it one square.';
 if(p){el('selectedName').textContent=(CATALOG.find(t=>t.id===p.type)||{id:p.type,name:'Retired unit',icon:'✧',art:{}}).name;el('selectedCoord').textContent=p.x===null?'In reserve':coord(p.x,p.y);el('label').value=p.label;el('pieceStatus').value=p.status;for(const id of ['label','pieceStatus','savePiece','rotate','reservePiece','remove'])el(id).disabled=p.team!==team||!editable();el('rotate').disabled=!editable()||p.fixed||(p.team!==team&&(room.phase!=='play'||!p.type.endsWith('wall')));el('stack').replaceChildren();if(p.x!==null&&at(p.x,p.y).length>1)for(const a of at(p.x,p.y))el('stack').append(button(a.label,()=>{selected=a.id;render();},a.id===p.id?'active':''));}
 el('log').replaceChildren();for(const item of room.history){const p=document.createElement('p');p.textContent=item.text;el('log').append(p);}
}
function resize(){if(!room)return;if(fit){
 const v=el('viewport'),cs=getComputedStyle(v),padX=parseFloat(cs.paddingLeft)+parseFloat(cs.paddingRight),padY=parseFloat(cs.paddingTop)+parseFloat(cs.paddingBottom);
 const availableWidth=Math.max(1,v.clientWidth-padX),availableHeight=Math.max(1,v.clientHeight-padY);
 cell=Math.max(1,Math.floor(Math.min(availableWidth/(WIDTH+1),availableHeight/(HEIGHT+1))));
 v.scrollLeft=0;v.scrollTop=0;
 }previousPositions.clear();document.documentElement.style.setProperty('--cell',cell+'px');el('zoomLabel').textContent=fit?'Fit':Math.round(cell/30*100)+'%';renderBoard();}
new ResizeObserver(()=>{if(room&&fit)resize();}).observe(el('viewport'));
el('fit').onclick=()=>{fit=true;resize();};el('plus').onclick=()=>{fit=false;cell=Math.min(90,cell+5);resize();};el('minus').onclick=()=>{fit=false;cell=Math.max(14,cell-5);resize();};el('mapSelect').onchange=()=>act({kind:'map',map:el('mapSelect').value});el('flip').onclick=()=>{flipped=!flipped;previousPositions.clear();renderBoard();};
el('viewport').addEventListener('wheel',e=>{
 if(!room||e.deltaY===0)return;e.preventDefault();
 const viewport=el('viewport'),board=el('board'),before=board.getBoundingClientRect(),cursorX=e.clientX-before.left,cursorY=e.clientY-before.top,oldCell=cell;
 fit=false;cell=Math.max(14,Math.min(90,cell*(e.deltaY<0?1.1:.9)));document.documentElement.style.setProperty('--cell',cell+'px');el('zoomLabel').textContent=Math.round(cell/30*100)+'%';previousPositions.clear();renderBoard();
 const after=board.getBoundingClientRect(),scale=cell/oldCell;
 viewport.scrollLeft+=after.left+cursorX*scale-e.clientX;
 viewport.scrollTop+=after.top+cursorY*scale-e.clientY;
},{passive:false});
el('ping').onclick=()=>{pingMode=!pingMode;el('ping').classList.toggle('active',pingMode);};
function ping(x,y){if(local)showPing({x,y,team});else if(socket?.readyState===1)socket.send(JSON.stringify({kind:'ping',x,y}));else toast('Reconnect before sending a ping.');}
function showPing(p){const v=view(p.x,p.y),d=document.createElement('div');d.className='board-ping '+p.team;Object.assign(d.style,{left:`${(v.x+1.5)*cell}px`,top:`${(v.y+1.5)*cell}px`});el('board').append(d);setTimeout(()=>d.remove(),1500);}
function showDrag(a){const p=room.board.pieces.find(p=>p.id===a.id);if(!p)return;document.querySelectorAll('.drag-preview').forEach(x=>x.remove());const v=view(a.x,a.y,p.w,p.h),d=document.createElement('div');d.className='drag-preview '+a.team;d.textContent=p.label;Object.assign(d.style,{left:`${(v.x+1)*cell}px`,top:`${(v.y+1)*cell}px`,width:`${p.w*cell}px`,height:`${p.h*cell}px`});el('board').append(d);setTimeout(()=>d.remove(),800);}
el('addReserve').onclick=()=>{if(!placing)return toast('Choose a numbered piece first.');place(placing,null,null);};
el('savePiece').onclick=()=>act({kind:'edit',id:selected,label:el('label').value.trim(),status:el('pieceStatus').value});el('rotate').onclick=()=>act({kind:'rotate',id:selected});el('reservePiece').onclick=()=>act({kind:'move',id:selected,x:null,y:null});el('remove').onclick=()=>act({kind:'remove',id:selected});
function cancel(){selected=null;placing=null;pingMode=false;rulerMode=false;paintMode=false;el('ping').classList.remove('active');rulerButton.classList.remove('active');paintButton.classList.remove('active');erasePaintButton.classList.remove('active');if(room)render();}el('cancel').onclick=cancel;
const cursorKeys=new Set();let cursorMoveTimer=null;
function moveSelectedByKeys(){cursorMoveTimer=null;if(!room||!selected||busy)return;const p=room.board.pieces.find(p=>p.id===selected);if(!p||p.fixed||!editable()||p.x===null)return;const dx=(cursorKeys.has('ArrowRight')?1:0)-(cursorKeys.has('ArrowLeft')?1:0),dy=(cursorKeys.has('ArrowDown')?1:0)-(cursorKeys.has('ArrowUp')?1:0);if(!dx&&!dy)return;const x=p.x+dx,y=p.y+dy;if(x<0||y<0||x+p.w>WIDTH||y+p.h>HEIGHT)return;place({id:p.id},x,y,true);}
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'){cancel();return;}
 if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)||!room||!selected)return;
 if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;
 cursorKeys.add(e.key);e.preventDefault();if(!cursorMoveTimer)cursorMoveTimer=setTimeout(moveSelectedByKeys,35);
},true);
document.addEventListener('keyup',e=>{if(cursorKeys.has(e.key))cursorKeys.delete(e.key);},true);
el('undo').onclick=()=>act({kind:'undo'});
el('clear').onclick=()=>{if(confirm('Return all YOUR pieces to the tray?'))act({kind:'clear'});};
el('reset').onclick=()=>{if(confirm('Reset the entire table for a new setup? This clears both armies from the board.')){selected=null;placing=null;act({kind:'reset'});}};
el('export').onclick=()=>{const b=new Blob([JSON.stringify({format:'kings-grid-board-v2',savedAt:new Date().toISOString(),board:room.board},null,2)],{type:'application/json'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=saveFilename(room.code);a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
el('import').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>200000)throw Error('Save is too large.');const d=JSON.parse(await f.text());validateBoard(d.board);if(confirm('Replace the entire revealed board with this save?'))await act({kind:'import',board:d.board});}catch(err){toast(err.message);}e.target.value='';};
async function copyLink(privateLink){const u=new URL(location.href);u.search='';u.hash='';u.searchParams.set('room',session.code);u.searchParams.set('server',session.api);if(privateLink)u.hash=new URLSearchParams({resume:session.token}).toString();try{await navigator.clipboard.writeText(u.href);toast(privateLink?'Private resume link copied. Keep it for yourself.':'Invite copied. Send it to the other player.');}catch{prompt('Copy this '+(privateLink?'private resume link':'invite')+':',u.href);}}
el('invite').onclick=()=>copyLink(false);el('resume').onclick=()=>copyLink(true);el('trayTab').onclick=()=>{el('tray').hidden=false;el('log').hidden=true;el('trayTab').classList.add('active');el('logTab').classList.remove('active');};el('logTab').onclick=()=>{el('tray').hidden=true;el('log').hidden=false;el('logTab').classList.add('active');el('trayTab').classList.remove('active');};

// Middle mouse pans the viewport, including when pressed over a piece.
let pan=null;
const viewport=el('viewport');
viewport.addEventListener('pointerdown',e=>{
 if(e.button!==1||!room)return;
 e.preventDefault();e.stopPropagation();wallClick=null;
 pan={id:e.pointerId,x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};
 viewport.setPointerCapture(e.pointerId);viewport.classList.add('panning');
},true);
viewport.addEventListener('pointermove',e=>{if(!pan||e.pointerId!==pan.id)return;e.preventDefault();viewport.scrollLeft=pan.left+pan.x-e.clientX;viewport.scrollTop=pan.top+pan.y-e.clientY;});
function endPan(e){if(!pan||e.pointerId!==pan.id)return;pan=null;viewport.classList.remove('panning');if(viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);}
viewport.addEventListener('pointerup',endPan);viewport.addEventListener('pointercancel',endPan);viewport.addEventListener('lostpointercapture',()=>{pan=null;viewport.classList.remove('panning');});
viewport.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();});
viewport.addEventListener('mousedown',e=>{if(e.button===1)e.preventDefault();},true);
let fullscreenView=null;
el('fullscreen').onclick=async()=>{
 if(room?.phase!=='play')return;
 if(!viewport.requestFullscreen)return toast('Fullscreen is unavailable in this browser.');
 fullscreenView={fit,cell,left:viewport.scrollLeft,top:viewport.scrollTop};
 try{await viewport.requestFullscreen();}catch{fullscreenView=null;toast('The browser could not enter fullscreen.');}
};
document.addEventListener('fullscreenchange',()=>{
 if(document.fullscreenElement===viewport){fit=true;resize();viewport.scrollLeft=viewport.scrollTop=0;}
 else if(fullscreenView){const old=fullscreenView;fullscreenView=null;fit=old.fit;cell=old.cell;resize();viewport.scrollLeft=old.left;viewport.scrollTop=old.top;}
});

// If this browser already owns a seat for a room URL, resume it automatically.
// This makes links back from the Background Editor return to the live table,
// while public invite links without a saved/private token still stop at Join.
(async()=>{
 const initialCode=(start.searchParams.get('room')||'').trim().toUpperCase();
 if(!/^[A-Z2-9]{8}$/.test(initialCode))return;
 try{
  const api=server(),saved=read(key(api,initialCode)),hash=new URLSearchParams(location.hash.slice(1));
  if(hash.get('resume')||saved?.token)await launch(true);
 }catch(e){console.warn('Automatic room resume failed:',e);}
})();
