import { MAX_STRUCTURE_SIZE, STD_Z } from './constants.js';
import { blockKey, getOffsetPosition, isAirPlaceholderBlock } from './blocks.js';
import {
  detectSelfClosedCycles, getBrokenHeadKind, identifyBrokenHeadGeometry,
  isBrokenChainPlaceholder, isBrokenHeadMarkerBlock, normalizeBrokenChainBlocks
} from './broken-head.js';
import { relayoutBlocks } from './trace.js';

export function getStructureDimensions(chains){
  if(!Array.isArray(chains)||chains.length===0)return{X:0,Y:0,Z:0};
  let minX=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for(const chain of chains){
    for(const b of chain.blocks||[]){
      minX=Math.min(minX,b.x);
      maxX=Math.max(maxX,b.x);
      maxY=Math.max(maxY,b.y);
      maxZ=Math.max(maxZ,b.z);
    }
  }
  if(minX===Infinity)return{X:0,Y:0,Z:0};
  return{X:maxX-minX+1,Y:maxY+1,Z:maxZ+1};
}
export function ensureStructureSize(chains,label='结构'){
  // The editor view intentionally keeps every chain on the same Y baseline and
  // permits the overall X span to grow. Only each individual chain's dimensions
  // and the shared editable Y/Z ranges are constrained here. Export performs
  // export-time X-axis splitting in buildExportLayouts().
  const size=getStructureDimensions(chains);
  const offenders=[];
  let invalidCoordinate=null;
  for(let i=0;i<chains.length;i++){
    const blocks=chains[i]?.blocks||[];
    if(!blocks.length)continue;
    let minX=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    for(const b of blocks){
      if(![b.x,b.y,b.z].every(v=>Number.isFinite(Number(v))&&Number.isInteger(Number(v)))){
        invalidCoordinate=`链${i+1}存在非整数或无效坐标`;
        break;
      }
      if(Number(b.y)<0){
        invalidCoordinate=`链${i+1}存在负 Y 坐标`;
        break;
      }
      if(Number(b.z)<0||Number(b.z)>=STD_Z){
        invalidCoordinate=`链${i+1}的 Z 坐标必须在 0 到 ${STD_Z-1} 之间`;
        break;
      }
      minX=Math.min(minX,Number(b.x));
      maxX=Math.max(maxX,Number(b.x));
      maxY=Math.max(maxY,Number(b.y));
      maxZ=Math.max(maxZ,Number(b.z));
    }
    if(invalidCoordinate)break;
    const sx=maxX-minX+1,sy=maxY+1,sz=maxZ+1;
    if(sx>MAX_STRUCTURE_SIZE||sy>MAX_STRUCTURE_SIZE||sz>MAX_STRUCTURE_SIZE){
      offenders.push(`链${i+1}（${blocks.length}方块，${sx}×${sy}×${sz}）`);
    }
  }
  if(invalidCoordinate)throw new Error(`${label}坐标无效：${invalidCoordinate}`);
  if(size.Y>MAX_STRUCTURE_SIZE||size.Z>MAX_STRUCTURE_SIZE||offenders.length){
    const detail=offenders.slice(0,3).join('、');
    const over=[];
    if(size.Y>MAX_STRUCTURE_SIZE)over.push(`Y=${size.Y}`);
    if(size.Z>MAX_STRUCTURE_SIZE)over.push(`Z=${size.Z}`);
    throw new Error(`${label}单链尺寸超过 ${MAX_STRUCTURE_SIZE}×${MAX_STRUCTURE_SIZE}×${MAX_STRUCTURE_SIZE}${over.length?`：${over.join('、')}`:''}${detail?`；超限链：${detail}`:''}`);
  }
  return size;
}

export function buildExportLayouts(chains){
  // Export follows the editor's completed layout exactly. relayoutBlocks() has
  // already stacked long command chains through Y layers; do not repack blocks
  // or turn a long chain into multiple pieces. Split only between whole chains
  // when the combined X span of the completed overview exceeds 64 blocks.
  const nonEmpty=(Array.isArray(chains)?chains:[]).filter(c=>Array.isArray(c?.blocks)&&c.blocks.some(b=>!isAirPlaceholderBlock(b)));
  if(!nonEmpty.length)return[{blocks:[],spanX:0,sizeY:0,sizeZ:STD_Z,part:1,chainCount:0}];
  const layouts=[];
  let current=[];
  let minX=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  const boundsOf=chain=>{
    let lo=Infinity,hi=-Infinity,topY=-Infinity,topZ=-Infinity;
    for(const b of chain.blocks){
      const x=Number(b.x),y=Number(b.y),z=Number(b.z);
      if(![x,y,z].every(Number.isInteger)||y<0||z<0||z>=STD_Z)
        throw new Error(`导出失败：链中存在无效坐标 (${b.x}, ${b.y}, ${b.z})`);
      lo=Math.min(lo,x);hi=Math.max(hi,x);topY=Math.max(topY,y);topZ=Math.max(topZ,z);
    }
    return{minX:lo,maxX:hi,maxY:topY,maxZ:topZ};
  };
  const finish=()=>{
    if(!current.length)return;
    const blocks=current.flatMap(chain=>chain.blocks.map(b=>({...b})));
    const partMinX=Math.min(...blocks.map(b=>Number(b.x)));
    const partMaxX=Math.max(...blocks.map(b=>Number(b.x)));
    const partMaxY=Math.max(...blocks.map(b=>Number(b.y)));
    const partMaxZ=Math.max(...blocks.map(b=>Number(b.z)));
    const spanX=partMaxX-partMinX+1,sizeY=partMaxY+1,sizeZ=Math.max(STD_Z,partMaxZ+1);
    if(spanX>MAX_STRUCTURE_SIZE)
      throw new Error(`导出布局错误：完整链组的 X 尺寸为 ${spanX}，超过 ${MAX_STRUCTURE_SIZE} 格；未拆断任何命令链`);
    if(sizeY>MAX_STRUCTURE_SIZE||sizeZ>MAX_STRUCTURE_SIZE)
      throw new Error(`导出失败：结构尺寸 ${spanX}×${sizeY}×${sizeZ} 超过 ${MAX_STRUCTURE_SIZE} 格限制`);
    // Shift the entire part as one rigid group so its minimum X is zero.
    for(const block of blocks)block.x-=partMinX;
    layouts.push({blocks,spanX,sizeY,sizeZ,part:layouts.length+1,chainCount:current.length});
    current=[];minX=Infinity;maxX=-Infinity;maxY=-Infinity;maxZ=-Infinity;
  };
  for(let i=0;i<nonEmpty.length;i++){
    const chain=nonEmpty[i],bounds=boundsOf(chain);
    const nextMin=Math.min(minX,bounds.minX),nextMax=Math.max(maxX,bounds.maxX);
    if(current.length&&nextMax-nextMin+1>MAX_STRUCTURE_SIZE)finish();
    const ownSpan=bounds.maxX-bounds.minX+1;
    if(ownSpan>MAX_STRUCTURE_SIZE)
      throw new Error(`导出失败：第 ${i+1} 条链在已完成布局中的 X 宽度为 ${ownSpan} 格，无法在不改变链结构的情况下放入单个结构`);
    current.push(chain);
    minX=Math.min(minX,bounds.minX);maxX=Math.max(maxX,bounds.maxX);
    maxY=Math.max(maxY,bounds.maxY);maxZ=Math.max(maxZ,bounds.maxZ);
  }
  finish();
  return layouts;
}
export function buildExportLayout(chains){
  return buildExportLayouts(chains)[0];
}
// Keep whole chains' internal geometry intact while preventing exact 3D
// coordinate collisions after reflow. Shifting X does not change a closed
// cycle's relative coordinates or its facing directions.
export function resolveChainCoordinateOverlaps(chains){
  const occupied=new Set();
  for(let i=0;i<(Array.isArray(chains)?chains.length:0);i++){
    const blocks=chains[i]?.blocks||[];
    if(!blocks.length)continue;
    const local=new Set();
    for(const b of blocks){
      const k=blockKey(Number(b.x),Number(b.y),Number(b.z));
      if(local.has(k))throw new Error(`第 ${i+1} 条链内部存在重复方块坐标 ${k}`);
      local.add(k);
    }
    const collides=dx=>blocks.some(b=>occupied.has(blockKey(Number(b.x)+dx,Number(b.y),Number(b.z))));
    let dx=0;
    // Occupied coordinates are finite, so moving left eventually finds a free
    // column unless the chain itself contains a duplicate (checked above).
    while(collides(dx))dx--;
    if(dx)for(const b of blocks)b.x=Number(b.x)+dx;
    // Cached cycle keys contain absolute coordinates, so refresh them after a
    // rigid translation; otherwise snapshots/text-edit state can refer to the
    // pre-reflow positions.
    if(Array.isArray(chains[i].selfClosedCycleKeys)||blocks.some(b=>b.selfClosedCycle)){
      chains[i].selfClosedCycleKeys=blocks.filter(b=>b.selfClosedCycle).map(b=>blockKey(Number(b.x),Number(b.y),Number(b.z)));
    }
    for(const b of blocks)occupied.add(blockKey(Number(b.x),Number(b.y),Number(b.z)));
  }
  return chains;
}

export function reflowChainsForSize(chains){
  for(let i=0;i<chains.length;i++){
    const chain=chains[i];
    // Re-detect a closed loop after every edit instead of trusting stale flags.
    // This lets a user break a loop by changing a node's block type, while
    // preserving a valid 2–4 chain-block cycle through reflow/undo/redo.
    const localBlockMap=new Map((chain.blocks||[]).filter(b=>!isAirPlaceholderBlock(b)).map(b=>[blockKey(Number(b.x),Number(b.y),Number(b.z)),{...b,type:b.blockType}]));
    const localGetExact=(b,facing,step=1)=>{
      const p=getOffsetPosition(b,facing,step);
      return p?(localBlockMap.get(blockKey(p.x,p.y,p.z))||null):null;
    };
    const localBrokenKeys=new Set();
    for(const b of localBlockMap.values()){
      const pattern=identifyBrokenHeadGeometry(b,localGetExact,isBrokenHeadMarkerBlock);
      if(!pattern)continue;
      for(const pb of pattern.blocks)localBrokenKeys.add(blockKey(pb.x,pb.y,pb.z));
    }
    const localCycles=detectSelfClosedCycles(localBlockMap,4,localBrokenKeys);
    const hasSelfClosedCycle=localCycles.cycles.length>0;
    if(hasSelfClosedCycle){
      const cycKeys=localCycles.keys;
      const anchorX=Number(chain.blocks[0]?.x);
      if(!Number.isInteger(anchorX))throw new Error('自闭链起始 X 坐标无效');
      const dx=-2*i-anchorX;
      chain.blocks=chain.blocks.map(b=>({...b,x:Number(b.x)+dx,y:Number(b.y),z:Number(b.z),facing:Number(b.facing),selfClosedCycle:cycKeys.has(blockKey(Number(b.x),Number(b.y),Number(b.z)))}));
      chain.selfClosed=true;
      chain.selfClosedCycleKeys=chain.blocks.filter(b=>b.selfClosedCycle).map(b=>blockKey(b.x,b.y,b.z));
      continue;
    }
    if(chain.preservePhysicalType&&chain.blocks.length===1){
      // Keep a standalone empty chain block visible as the same block type/facing.
      const anchorX=Number(chain.blocks[0].x);
      if(!Number.isInteger(anchorX))throw new Error('孤立命令方块 X 坐标无效');
      const dx=-2*i-anchorX;
      chain.blocks=chain.blocks.map(b=>({...b,x:Number(b.x)+dx,y:Number(b.y),z:Number(b.z),facing:Number(b.facing)}));
      chain.selfClosed=false;chain.selfClosedCycleKeys=[];
      continue;
    }
    chain.preservePhysicalType=false;
    chain.selfClosed=false;
    chain.selfClosedCycleKeys=[];
    for(const b of chain.blocks)b.selfClosedCycle=false;
    const headKind=getBrokenHeadKind(chain.blocks);
    const placeholder=chain.type==='snake'&&isBrokenChainPlaceholder(chain.blocks);
    if(headKind){
      // Re-apply the Z-axis coordinate normalization while preserving the
      // user's command verbs and chosen conditional flags.
      normalizeBrokenChainBlocks(chain.blocks,{applyCondition:false,preserveCommands:true});
      chain.type='snake';
    }else if(placeholder){
      chain.type='snake';
    }else{
      chain.type=chain.blocks[0]?.blockType==='command'?'impulse':'repeat';
    }
    const src=chain.blocks.map(b=>({cmd:b.cmd,cond:b.cond,auto:b.auto!==0?1:0,blockType:b.blockType,isAuxiliary:!!b.isAuxiliary,isBrokenNormalized:!!b.isBrokenNormalized,isAirPlaceholder:!!b.isAirPlaceholder,brokenWrongFacing:!!b.brokenWrongFacing}));
    const newBlocks=relayoutBlocks(src,chain.type,-2*i);
    for(let j=0;j<newBlocks.length;j++){
      newBlocks[j].isAuxiliary=!!chain.blocks[j]?.isAuxiliary;
      newBlocks[j].isBrokenNormalized=!!chain.blocks[j]?.isBrokenNormalized;
      newBlocks[j].isAirPlaceholder=!!chain.blocks[j]?.isAirPlaceholder;
      newBlocks[j].marked=chain.blocks[j]?.marked||false;
      newBlocks[j].note=chain.blocks[j]?.note||'';
    }
    chain.blocks=newBlocks;
  }
  resolveChainCoordinateOverlaps(chains);
}
