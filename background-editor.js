const $=s=>document.querySelector(s),el=id=>document.getElementById(id);
const read=(k,d=null)=>{try{return JSON.parse(localStorage.getItem(k))??d;}catch{return d;}};
const params=new URL(location.href).searchParams;
const api=(params.get('server')||read('kg-board-api','https://kings-grid-board-v2.battlesim.workers.dev')).replace(/\/$/,'');
let maps=[],currentId=null,session=findSession(api),drag=null;
function findSession(server){
 const last=read('kg-board-last-session');if(last?.token&&last?.code&&last?.api===server)return last;
 for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(!k?.startsWith('kg-board-v2:'))continue;const s=read(k);if(s?.token&&s?.code&&s?.api===server)return s;}
 return null;
}
function youtubeId(value){
 const v=String(value||'').trim();if(/^[A-Za-z0-9_-]{11}$/.test(v))return v;
 try{const u=new URL(v);if(u.hostname.includes('youtu.be'))return u.pathname.split('/').filter(Boolean)[0]?.slice(0,11)||'';if(u.searchParams.get('v'))return u.searchParams.get('v').slice(0,11);const m=u.pathname.match(/\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})/);return m?.[1]||'';}catch{return '';}
}
function embedUrl(id){const q=new URLSearchParams({autoplay:'1',mute:'1',controls:'0',loop:'1',playlist:id,playsinline:'1',rel:'0',fs:'0',disablekb:'1'});return `https://www.youtube.com/embed/${id}?${q}`;}
function values(){return {id:currentId,name:el('mapName').value.trim(),youtubeId:youtubeId(el('youtubeUrl').value),scale:Number(el('scaleNumber').value)/100,offsetX:Number(el('offsetXNumber').value),offsetY:Number(el('offsetYNumber').value),enabled:el('enabled').checked,sortOrder:Number(el('sortOrder').value)||100};}
function syncPair(rangeId,numberId){const r=el(rangeId),n=el(numberId);r.oninput=()=>{n.value=r.value;preview();};n.oninput=()=>{r.value=n.value;preview();};}
syncPair('scale','scaleNumber');syncPair('offsetX','offsetXNumber');syncPair('offsetY','offsetYNumber');
el('youtubeUrl').oninput=preview;el('mapName').oninput=()=>{};
function setForm(m){
 currentId=m?.id||null;el('mapName').value=m?.name||'';el('youtubeUrl').value=m?.youtubeId||'';const scale=Math.round((m?.scale||1)*100);el('scale').value=el('scaleNumber').value=scale;el('offsetX').value=el('offsetXNumber').value=m?.offsetX||0;el('offsetY').value=el('offsetYNumber').value=m?.offsetY||0;el('enabled').checked=m?.enabled!==false;el('sortOrder').value=m?.sortOrder??100;el('deleteMap').disabled=!session||!currentId;renderList();preview();
}
function renderList(){const list=el('mapList');list.replaceChildren();for(const m of maps){const b=document.createElement('button');b.className='map-item'+(m.id===currentId?' active':'')+(m.enabled?'':' disabled-map');b.innerHTML=`<strong>${escapeHtml(m.name)}</strong><span>${m.enabled?'Visible':'Hidden'} · scale ${Math.round(m.scale*100)}% · X ${m.offsetX}% · Y ${m.offsetY}%</span>`;b.onclick=()=>setForm(m);list.append(b);}}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function preview(){const v=values(),layer=el('videoLayer'),id=v.youtubeId;let frame=layer.querySelector('iframe');if(!id){layer.replaceChildren();el('coordinates').textContent=`Scale ${Math.round(v.scale*100)}% · X ${v.offsetX||0}% · Y ${v.offsetY||0}%`;positionAnchor(v);return;}if(frame?.dataset.video!==id){frame=document.createElement('iframe');frame.dataset.video=id;frame.src=embedUrl(id);frame.allow='autoplay; encrypted-media; picture-in-picture';frame.referrerPolicy='strict-origin-when-cross-origin';frame.tabIndex=-1;layer.replaceChildren(frame);}Object.assign(frame.style,{left:`${50+v.offsetX}%`,top:`${50+v.offsetY}%`,width:`${147*v.scale}%`,height:`${122*v.scale}%`});el('coordinates').textContent=`Scale ${Math.round(v.scale*100)}% · X ${v.offsetX}% · Y ${v.offsetY}%`;positionAnchor(v);}
function positionAnchor(v){el('anchor').style.left=`${50+v.offsetX}%`;el('anchor').style.top=`${50+v.offsetY}%`;}
async function call(path,{body,auth=false}={}){const headers={'content-type':'application/json'};if(auth){if(!session)throw Error('Join or resume a King’s Grid room in this browser first.');headers.authorization=`Bearer ${session.token}`;headers['x-room-code']=session.code;}const res=await fetch(api+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'}),d=await res.json();if(!res.ok)throw Error(d.error||'Request failed');return d;}
async function load(){try{const d=await call('/api/backgrounds?all=1');maps=d.backgrounds||[];renderList();if(currentId){const m=maps.find(x=>x.id===currentId);if(m)setForm(m);}el('status').textContent=session?`Editor connected · room ${session.code}`:'View only · join a board once to save';el('saveMap').disabled=!session;el('deleteMap').disabled=!session||!currentId;}catch(e){el('status').textContent='Could not load map library';message(e.message,true);}}
function message(t,bad=false){el('message').textContent=t;el('message').style.color=bad?'#ffaca5':'#9fd6b5';}
el('newMap').onclick=()=>setForm(null);
el('resetPosition').onclick=()=>{el('scale').value=el('scaleNumber').value=100;el('offsetX').value=el('offsetXNumber').value=0;el('offsetY').value=el('offsetYNumber').value=0;preview();};
el('saveMap').onclick=async()=>{try{const m=values();if(!m.name)throw Error('Give the map a name.');if(!m.youtubeId)throw Error('Enter a valid YouTube URL or 11-character video ID.');const d=await call('/api/backgrounds',{auth:true,body:{action:'save',map:m}});maps=d.backgrounds||maps;currentId=d.map?.id||currentId;setForm(d.map||maps.find(x=>x.id===currentId));message('Background saved. It is now available to both players.');window.opener?.postMessage({kind:'kg-backgrounds-updated'},location.origin);}catch(e){message(e.message,true);}};
el('deleteMap').onclick=async()=>{if(!currentId||!confirm('Delete this background from the shared library?'))return;try{const d=await call('/api/backgrounds',{auth:true,body:{action:'delete',id:currentId}});maps=d.backgrounds||[];setForm(null);message('Background deleted.');window.opener?.postMessage({kind:'kg-backgrounds-updated'},location.origin);}catch(e){message(e.message,true);}};
const surface=el('dragSurface');surface.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,startX:Number(el('offsetXNumber').value)||0,startY:Number(el('offsetYNumber').value)||0};surface.setPointerCapture(e.pointerId);surface.classList.add('dragging');};surface.onpointermove=e=>{if(!drag)return;const r=el('preview').getBoundingClientRect(),x=Math.max(-100,Math.min(100,drag.startX+(e.clientX-drag.x)/r.width*100)),y=Math.max(-100,Math.min(100,drag.startY+(e.clientY-drag.y)/r.height*100));el('offsetX').value=el('offsetXNumber').value=x.toFixed(1);el('offsetY').value=el('offsetYNumber').value=y.toFixed(1);preview();};surface.onpointerup=surface.onpointercancel=e=>{drag=null;surface.classList.remove('dragging');try{surface.releasePointerCapture(e.pointerId);}catch{}};
surface.addEventListener('wheel',e=>{e.preventDefault();let n=Number(el('scaleNumber').value)||100;n=Math.max(50,Math.min(300,n+(e.deltaY<0?5:-5)));el('scale').value=el('scaleNumber').value=n;preview();},{passive:false});
load();setForm(null);
