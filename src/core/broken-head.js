import { FACING_VEC } from './constants.js';
import { blockKey, getOffsetPosition } from './blocks.js';

// Detect intentional self-closed command-block loops. Only cycles of 2–4
// chain-command blocks are treated as supported loops; larger loops are left
// to the normal validation path because they are considered malformed layouts.
export function detectSelfClosedCycles(blockMap,maxCycleSize=4,brokenKeys=new Set()){
  const cycles=[];
  const signatures=new Set();
  if(!(blockMap instanceof Map))return{cycles,keys:new Set(),oversized:[]};
  const oversized=[];
  for(const start of blockMap.values()){
    if(!start||start.type!=='chain')continue;
    const path=[];
    const position=new Map();
    let current=start;
    let guard=0;
    while(current&&current.type==='chain'&&guard++<Math.min(blockMap.size+1,10000)){
      const key=blockKey(current.x,current.y,current.z);
      if(position.has(key)){
        const keys=path.slice(position.get(key));
        // Broken-head markers intentionally face into one another. That is a
        // broken-head encoding, not a self-closed chain. Besides the exact
        // /setblock templates, exclude every block that belongs to a detected
        // broken-head pattern; execute-style markers use `air` or other commands
        // and would otherwise turn a downward chain into a false 2-block loop.
        const markerCycle=keys.some(cycleKey=>{
          if(brokenKeys.has(cycleKey))return true;
          const node=blockMap.get(cycleKey);
          return isSetblockFirstMarker(node?.cmd||'')||isSetblockSecondMarker(node?.cmd||'');
        });
        if(keys.length>=2&&keys.length<=maxCycleSize&&!markerCycle){
          const signature=[...keys].sort().join('|');
          if(!signatures.has(signature)){signatures.add(signature);cycles.push(keys);}
        }else if(keys.length>maxCycleSize&&!markerCycle){
          const signature=[...keys].sort().join('|');
          if(!signatures.has('oversized:'+signature)){signatures.add('oversized:'+signature);oversized.push(keys);}
        }
        break;
      }
      position.set(key,path.length);path.push(key);
      const p=getOffsetPosition(current,current.facing,1);
      current=p?blockMap.get(blockKey(p.x,p.y,p.z)):null;
      if(current&&current.type!=='chain')break;
    }
  }
  return{cycles,keys:new Set(cycles.flat()),oversized};
}
// Minecraft command text may include the leading slash or omit it.
export function startsCommand(cmd,name){return new RegExp('^\\s*\\/?'+name+'\\b','i').test(String(cmd??'').trim());}
export function isTestforCommand(cmd){return startsCommand(cmd,'testfor');}
export function hasRelativeCoordinateSyntax(cmd){
  const s=String(cmd??'');
  // Bedrock structures in the wild use both spaced coordinates (~ ~ ~-1)
  // and compact project notation (~~~-1). Accept either form.
  return /(?:^|[\s,])~(?:-?\d+(?:\.\d+)?)?(?=$|[\s,])/.test(s)||/(?:^|[\s,])(?:~(?:-?\d+(?:\.\d+)?)?){3}(?=$|[\s,])/.test(s);
}
export function getRelativeCommandOperation(cmd){
  const s=String(cmd??'').trim();
  const execute=s.match(/^\/?execute\b[\s\S]*?\brun\s+\/?(setblock|fill|clone|structure)\b/i);
  if(execute)return execute[1].toLowerCase();
  const direct=s.match(/^\/?(setblock|fill|clone|structure)\b/i);
  return direct?direct[1].toLowerCase():null;
}
export function isSupportedRelativeCommand(cmd){
  return !!getRelativeCommandOperation(cmd)&&hasRelativeCoordinateSyntax(cmd);
}
// Broken-head markers are /setblock templates. `fill`, `clone` and especially
// `structure load` are often ordinary commands with relative coordinates; they
// must not be mistaken for the two special /setblock marker blocks.
export function isSetblockRelativeCommand(cmd){
  return getRelativeCommandOperation(cmd)==='setblock'&&hasRelativeCoordinateSyntax(cmd);
}
export function hasExecuteAtBeforeRun(cmd){
  const source=String(cmd??'').trim();
  if(!/^\s*\/?execute\b/i.test(source))return false;
  const runMatch=/\brun\b/i.exec(source);
  const head=runMatch?source.slice(0,runMatch.index):source;
  // Bedrock's `/execute ... at @s ... run ...` is a normal positional execute
  // command, not the broken-head template. Only inspect the subcommands before
  // `run`; arguments after `run` must not affect broken-head detection.
  return /(?:^|\s)at\s+@/i.test(head);
}
export function isExecuteRunRelativeCommand(cmd){
  return /^\s*\/?execute\b/i.test(String(cmd??'').trim())&&
    !hasExecuteAtBeforeRun(cmd)&&isSupportedRelativeCommand(cmd);
}
export function isSetblockMarker(cmd,position){
  const s=String(cmd??'').trim();
  if(!startsCommand(s,'setblock')||! /\bchain_command_block\b/i.test(s))return false;
  const beforeBlock=s.replace(/^\s*\/?setblock\b/i,'').split(/\bchain_command_block\b/i)[0];
  const compact=beforeBlock.replace(/\s+/g,'');
  return position==='first'?compact==='~~~-1':compact==='~~~';
}
export function isSetblockFirstMarker(cmd){return isSetblockMarker(cmd,'first');}
export function isSetblockSecondMarker(cmd){return isSetblockMarker(cmd,'second');}
export function isBrokenHeadMarkerBlock(b){
  return !!b&&['command','repeating','chain'].includes(b.type||b.blockType)&&String(b.cmd||'').trim()!==''&&isSetblockRelativeCommand(b.cmd||'');
}
// Shared broken-head recognizer. The gap is a geometric slot, not a required
// block type: it may be air, an ordinary block, water/lava, or any command block.
export function identifyBrokenHeadGeometry(root,getExact,isMarker){
  if(!root||typeof getExact!=='function'||typeof isMarker!=='function')return null;
  const cmd=String(root.cmd||'').trim();
  const isCommandRecord=b=>!!b&&['command','repeating','chain'].includes(b.type||b.blockType);
  const make=(kind,direction,previous,gap,marker,rootDirection=direction)=>{
    // Only the two `-gap` forms own a physical auxiliary slot between the
    // command head/first marker and the final marker. The `-direct` forms place
    // the two markers next to each other, so inventing a placeholder there would
    // shift the whole chain by one block and display a phantom blank block.
    const hasGap=kind.endsWith('-gap');
    const gapPosition=hasGap&&previous?getOffsetPosition(previous,direction,1):null;
    const gapIsCommand=hasGap&&isCommandRecord(gap);
    // A command block in the auxiliary slot is a real physical chain node. Keep
    // its original command/type/condition/auto values and mark it so relayout
    // and text editing do not downgrade it to an ordinary chain block.
    const auxiliary=gapIsCommand?{...gap,isAuxiliary:true}:null;
    const placeholder=gapPosition&&!gapIsCommand?{
      ...gapPosition,type:'placeholder',blockType:'chain',cmd:'',cond:0,auto:1,
      facing:direction,isAirPlaceholder:true,marked:false,note:''
    }:null;
    return{
      kind,direction,rootDirection,wrongFacingBlock:marker,previous,gap,placeholder,auxiliary,
      // Non-command gaps stay virtual air slots; command gaps become editable
      // physical nodes in the same chain.
      blocks:[...(kind.startsWith('testfor')?[previous]:[]),...(auxiliary?[auxiliary]:[]),...(placeholder?[placeholder]:[]),marker].filter(Boolean),
      skipped:gap||null
    };
  };
  const candidateDirections=[Number.isInteger(root.facing)?root.facing:2,...Object.keys(FACING_VEC).map(Number)]
    .filter((value,index,array)=>FACING_VEC[value]&&array.indexOf(value)===index);
  if(isTestforCommand(cmd)){
    for(const rootDirection of candidateDirections){
      const first=getExact(root,rootDirection,1);
      if(!isMarker(first))continue;
      const directions=[rootDirection,first.facing].filter((value,index,array)=>Number.isInteger(value)&&FACING_VEC[value]&&array.indexOf(value)===index);
      for(const direction of directions){
        const secondDirect=getExact(first,direction,1);
        const secondGap=getExact(first,direction,2);
        // Prefer the explicit one-slot gap when both positions contain relative
        // command text. This lets an impulse command block occupy the gap without
        // being mistaken for the second marker solely because it has a command.
        if(isMarker(secondGap))return make('testfor-gap',direction,first,secondDirect,secondGap,rootDirection);
        if(isMarker(secondDirect))return make('testfor-direct',direction,first,null,secondDirect,rootDirection);
      }
    }
    return null;
  }
  if(isExecuteRunRelativeCommand(cmd)){
    for(const direction of candidateDirections){
      const first=getExact(root,direction,1);
      const second=getExact(root,direction,2);
      if(isMarker(second))return make('execute-gap',direction,root,first,second,direction);
      if(isMarker(first))return make('execute-direct',direction,root,null,first,direction);
    }
  }
  return null;
}
export function findBrokenChainSetblockIndexes(items){
  const list=Array.isArray(items)?items:[];
  const found=[];
  for(let i=0;i<list.length;i++){
    const value=typeof list[i]==='string'?String(list[i]||'').trim():String(list[i]?.cmd||'').trim();
    if(isSetblockRelativeCommand(value)){
      found.push(i);
      if(found.length===2)break;
    }
  }
  return found;
}
export function getBrokenHeadKind(items){
  if(!Array.isArray(items)||items.length<2)return null;
  if(items._brokenMatch==='execute'||items._brokenMatch==='testfor')return items._brokenMatch;
  const cmdAt=i=>String(typeof items[i]==='string'?items[i]:items[i]?.cmd||'').trim();
  const first=cmdAt(0);
  const indexes=findBrokenChainSetblockIndexes(items);
  if(isExecuteRunRelativeCommand(first)&&indexes[0]===0&&indexes.length>=2)return 'execute';
  if(isTestforCommand(first)&&indexes[0]>=1&&indexes.length>=2)return 'testfor';
  return null;
}
export function isBrokenChainPlaceholder(items){
  if(!Array.isArray(items)||items.length<3||String(typeof items[0]==='string'?items[0]:items[0]?.cmd||'').trim()!=='')return false;
  return isSetblockRelativeCommand(items[1]?.cmd??items[1])&&isSetblockRelativeCommand(items[2]?.cmd??items[2]);
}
export function parseRelativeComponent(token){
  const m=String(token).match(/^~(-?\d+(?:\.\d+)?)?$/);
  return m?Number(m[1]||0):null;
}
export function formatRelativeComponent(value){
  const n=Math.abs(value)<1e-9?0:Number(value.toFixed(6));
  return n===0?'~':'~'+String(n);
}
export function rotateRelativeVector(x,y,z,facing){
  switch(Number(facing)){
    case 3:return[-x,y,-z];
    case 4:return[-z,y,x];
    case 5:return[z,y,-x];
    case 0:return[x,-z,y];
    case 1:return[x,z,-y];
    case 2:default:return[x,y,z];
  }
}
export function rotateRelativeCoordinateTriples(cmd,facing){
  let source=String(cmd??'');
  if(!source||Number(facing)===2)return source;
  const triple=/((?:~(?:-?\d+(?:\.\d+)?)?)\s+){2}(~(?:-?\d+(?:\.\d+)?)?)/g;
  source=source.replace(triple,match=>{
    const parts=match.trim().split(/\s+/);
    if(parts.length!==3||parts.some(v=>parseRelativeComponent(v)===null))return match;
    const [x,y,z]=parts.map(parseRelativeComponent);
    return rotateRelativeVector(x,y,z,facing).map(formatRelativeComponent).join(match.includes('  ')?'  ':' ');
  });
  // Compact coordinate triples such as ~~~-1 are used by existing structures.
  source=source.replace(/(^|[\s,])((?:~(?:-?\d+(?:\.\d+)?)?){3})(?=$|[\s,])/g,(whole,prefix,compact)=>{
    const parts=compact.match(/~(?:-?\d+(?:\.\d+)?)?/g)||[];
    if(parts.length!==3||parts.some(v=>parseRelativeComponent(v)===null))return whole;
    const [x,y,z]=parts.map(parseRelativeComponent);
    return prefix+rotateRelativeVector(x,y,z,facing).map(formatRelativeComponent).join('');
  });
  return source;
}
export function normalizeBrokenChainBlocks(blocks,options={}){
  if(!Array.isArray(blocks))return false;
  const kind=options.kind||getBrokenHeadKind(blocks);
  if(!kind&&!options.forceCoordinates)return false;
  const direction=Number.isInteger(options.direction)?options.direction:(Number.isInteger(blocks._brokenDirection)?blocks._brokenDirection:2);
  const specialKeys=options.specialKeys instanceof Set?options.specialKeys:new Set(blocks._brokenSpecialKeys||[]);
  const facingMap=options.facingMap||blocks._brokenFacingMap||{};
  const preserveCommands=!!options.preserveCommands;
  for(const b of blocks){
    if(!b||typeof b.cmd!=='string')continue;
    // Commands are normalized exactly once, when the chain is first imported or
    // created. Reflow runs on every edit and must not rotate already-normalized
    // coordinates again (doing so corrupts non-Z-axis broken heads).
    if(b.isBrokenNormalized)continue;
    if(preserveCommands&&(b.brokenWrongFacing||b.isAuxiliary)){b.isBrokenNormalized=true;continue;}
    const key=blockKey(b.x,b.y,b.z);
    const facing=Number.isInteger(facingMap[key])?facingMap[key]:(specialKeys.has(key)?direction:(Number.isInteger(b.facing)?b.facing:direction));
    b.cmd=rotateRelativeCoordinateTriples(b.cmd,facing);
    b.isBrokenNormalized=true;
  }
  if(options.applyCondition!==false){
    const indexes=findBrokenChainSetblockIndexes(blocks);
    if(indexes.length>=2){
      blocks[indexes[0]].cond=kind==='testfor'?1:0;
      blocks[indexes[1]].cond=0;
    }
  }
  return true;
}
