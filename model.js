import {CATALOG} from './catalog.js';
export const WIDTH=31,HEIGHT=21;
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
],nextNumber:1};}
export function validateBoard(b){
 if(!b||b.width!==WIDTH||b.height!==HEIGHT||!Array.isArray(b.pieces)||b.pieces.length>500)throw Error('Expected a 31 × 21 board with at most 500 pieces.');
 const ids=new Set(),cannonTeams=new Set();
 for(const p of b.pieces){
  if(!p||typeof p.id!=='string'||p.id.length>80||ids.has(p.id)||!types.has(p.type))throw Error('Invalid or duplicate piece.');ids.add(p.id);
  if(!['red','blue','neutral'].includes(p.team)||!['normal','defeated','captured'].includes(p.status))throw Error('Invalid piece colour or status.');
  if(!Number.isInteger(p.copyNo)||p.copyNo<1||p.copyNo>99)throw Error('Invalid piece number.');
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
  b.nextNumber++;b.pieces.push(p);description=`Added ${p.label}`;break;
 }
 case 'move': {const p=find();p.x=action.x;p.y=action.y;description=`Moved ${p.label}${p.x===null?' to reserve':` to ${coord(p.x,p.y)}`}`;break;}
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
