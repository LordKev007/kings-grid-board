import {CATALOG} from './catalog.js';
export const WIDTH=31,HEIGHT=21;
export const wallMaxHP=type=>type==='woodwall'?3:type==='stonewall'?6:null;
export const wallHP=p=>p.hp===undefined?wallMaxHP(p.type):p.hp;
export function saveFilename(code,date=new Date()){
 const pad=n=>String(n).padStart(2,'0');
 return `Kings_Grid_${code}_${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}.json`;
}
// Retired pieces remain readable in old saves, but cannot be created.
const types=new Set([...CATALOG.map(x=>x.id),'ritual']);
export const copy=x=>JSON.parse(JSON.stringify(x));
export function emptyBoard(){return {width:WIDTH,height:HEIGHT,pieces:[
 {id:'fixed-base-red',type:'base',team:'red',label:'B',x:1,y:10,w:1,h:1,status:'normal',copyNo:1,fixed:true},
 {id:'fixed-base-blue',type:'base',team:'blue',label:'B',x:29,y:10,w:1,h:1,status:'normal',copyNo:1,fixed:true},
 {id:'fixed-gt-1',type:'giving',team:'neutral',label:'GT',x:30,y:0,w:1,h:1,status:'normal',copyNo:1,fixed:true},
 {id:'fixed-gt-2',type:'giving',team:'neutral',label:'GT',x:10,y:1,w:1,h:1,status:'normal',copyNo:1,fixed:true},
 {id:'fixed-gt-3',type:'giving',team:'neutral',label:'GT',x:15,y:10,w:1,h:1,status:'normal',copyNo:1,fixed:true},
 {id:'fixed-gt-4',type:'giving',team:'neutral',label:'GT',x:20,y:19,w:1,h:1,status:'normal',copyNo:1,fixed:true},
 {id:'fixed-gt-5',type:'giving',team:'neutral',label:'GT',x:0,y:20,w:1,h:1,status:'normal',copyNo:1,fixed:true}
],nextNumber:1,paint:{}};}
export function validateBoard(b){
 if(!b||b.width!==WIDTH||b.height!==HEIGHT||!Array.isArray(b.pieces)||b.pieces.length>500)throw Error('Expected a 31 × 21 board with at most 500 pieces.');
 if(b.paint===undefined)b.paint={};
 if(!b.paint||typeof b.paint!=='object'||Array.isArray(b.paint)||Object.keys(b.paint).length>651)throw Error('Invalid painted tiles.');
 for(const [key,v] of Object.entries(b.paint)){const m=/^(\d+),(\d+)$/.exec(key);if(!m)throw Error('Invalid painted tile.');const x=Number(m[1]),y=Number(m[2]);if(x<0||x>=WIDTH||y<0||y>=HEIGHT||!v||!/^#[0-9a-f]{6}$/i.test(v.color)||typeof v.opacity!=='number'||v.opacity<0||v.opacity>1||!['red','blue'].includes(v.team))throw Error('Invalid painted tile.');}
 const ids=new Set(),cannonTeams=new Set();
 for(const p of b.pieces){
  if(!p||typeof p.id!=='string'||p.id.length>80||ids.has(p.id)||!types.has(p.type))throw Error('Invalid or duplicate piece.');ids.add(p.id);
  if(!['red','blue','neutral'].includes(p.team)||!['normal','defeated','captured','distracted'].includes(p.status))throw Error('Invalid piece colour or status.');
  if(!Number.isInteger(p.copyNo)||p.copyNo<1||p.copyNo>99)throw Error('Invalid piece number.');
  if(p.hp!==undefined&&(wallMaxHP(p.type)===null||!Number.isInteger(p.hp)||p.hp<0||p.hp>wallMaxHP(p.type)))throw Error('Invalid wall health.');
  if(p.type==='cannon'){
   if(!['red','blue'].includes(p.team)||cannonTeams.has(p.team))throw Error('Each side may have only one cannon, including pieces in reserve.');
   cannonTeams.add(p.team);
  }
  if(p.fixed!==undefined&&!Boolean(p.fixed))throw Error('Invalid fixed marker.');
  if(['woodwall','stonewall','ironwall'].includes(p.type)&&!((p.w===5&&p.h===1)||(p.w===1&&p.h===5)))throw Error('Walls must be exactly five squares, horizontal or vertical.');
  if(typeof p.label!=='string'||p.label.length>40)throw Error('Piece labels must be 40 characters or fewer.');
  if(!Number.isInteger(p.w)||!Number.isInteger(p.h)||p.w<1||p.h<1||p.w>5||p.h>5)throw Error('Piece dimensions must be 1–5 squares.');
  if(p.x!==null||p.y!==null){if(!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<0||p.y<0||p.x+p.w>WIDTH||p.y+p.h>HEIGHT)throw Error('That piece would extend past the board.');}
 }
 if(!Number.isInteger(b.nextNumber)||b.nextNumber<1||b.nextNumber>1000000)throw Error('Invalid piece counter.');
 return b;
}
export function changeBoard(original,action){
 const b=copy(original);let description='Board updated';
 const find=()=>{const p=b.pieces.find(p=>p.id===action.id);if(!p)throw Error('Piece no longer exists.');if(p.fixed)throw Error('The fixed board markers cannot be moved.');return p;};
 switch(action.kind){
 case 'add': {
  const t=CATALOG.find(t=>t.id===action.type);if(!t)throw Error('Unknown piece type.');
  const p={id:action.id,type:t.id,team:action.team,label:action.label||`${t.short} ${action.copyNo??1}`,x:action.x??null,y:action.y??null,w:['woodwall','stonewall','ironwall'].includes(t.id)?(action.vertical?1:5):1,h:['woodwall','stonewall','ironwall'].includes(t.id)?(action.vertical?5:1):1,status:'normal',copyNo:action.copyNo??1};
  if(wallMaxHP(p.type)!==null)p.hp=wallMaxHP(p.type);
  b.nextNumber++;b.pieces.push(p);description=`Added ${p.label}`;break;
 }
 case 'move': {const p=find();p.x=action.x;p.y=action.y;description=`Moved ${p.label}${p.x===null?' to reserve':` to ${coord(p.x,p.y)}`}`;break;}
 case 'paint': {if(!Number.isInteger(action.x)||!Number.isInteger(action.y)||action.x<0||action.x>=WIDTH||action.y<0||action.y>=HEIGHT||!/^#[0-9a-f]{6}$/i.test(action.color)||typeof action.opacity!=='number'||action.opacity<0||action.opacity>1||!['red','blue'].includes(action.team))throw Error('Invalid paint.');b.paint[`${action.x},${action.y}`]={color:action.color.toLowerCase(),opacity:action.opacity,team:action.team};description=`Painted ${coord(action.x,action.y)}`;break;}
 case 'erasePaint': {if(!Number.isInteger(action.x)||!Number.isInteger(action.y))throw Error('Invalid paint tile.');delete b.paint[`${action.x},${action.y}`];description=`Erased paint at ${coord(action.x,action.y)}`;break;}
 case 'clearPaint': {if(action.scope==='all'){b.paint={};description='Cleared all painted tiles';}else{for(const [k,v] of Object.entries(b.paint))if(v.team===action.team)delete b.paint[k];description='Cleared own painted tiles';}break;}
 case 'wallHealth': {const p=find(),max=wallMaxHP(p.type);if(max===null)throw Error('Only wood and stone walls have adjustable health.');if(!Number.isInteger(action.hp)||action.hp<0||action.hp>max)throw Error(`Health must be between 0 and ${max}.`);p.hp=action.hp;description=`${p.label}: ${p.hp}/${max} HP`;break;}
 case 'edit': {const p=find();for(const k of ['label','team','status'])if(action[k]!==undefined)p[k]=action[k];description=`Updated ${p.label}`;break;}
 case 'rotate': {const p=find();[p.w,p.h]=[p.h,p.w];description=`Rotated ${p.label}`;break;}
 case 'remove': {description=`Removed ${find().label}`;b.pieces=b.pieces.filter(p=>p.id!==action.id);break;}
 case 'clear': b.pieces=[];b.nextNumber=1;description='Cleared the board';break;
 case 'import': return {board:copy(validateBoard(action.board)),description:'Loaded a saved board'};
 default:throw Error('Unknown board action.');
 }
 validateBoard(b);return {board:b,description};
}
export function coord(x,y){return `${x<26?String.fromCharCode(65+x):'A'+String.fromCharCode(65+x-26)}${y+1}`;}
