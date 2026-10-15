/* BlockFlow shared broken-chain recognizer. Derived from the tested Structure Editor core. */
(function (global) {
  'use strict';
function normalizeCommandText(value){const text=String(value??'').trimStart();if(!text.trim())return '';return text.startsWith('/')?text:'/'+text;}
function classifyChainCommand(value){const normalized=normalizeCommandText(value);if(!normalized)return 'empty';const body=normalized.slice(1).trimStart();const tokens=body.split(/\s+/,3);const first=(tokens[0]||'').toLowerCase();const second=(tokens[1]||'').toLowerCase();if(first==='structure'&&second==='load')return 'structure_load';if(['setblock','fill','clone','testfor','execute'].includes(first))return first;return 'other';}
function formatCommandChain(result){if(!result?.ok||!Array.isArray(result.chain))return '';return result.chain.map(item=>{const block=item?.block;if(!block?.command)return '';const command=normalizeCommandText(block.cmd);if(!command)return '';return `${block.conditional?'[c] ':''}${command}`;}).filter(Boolean).join('\n');}
function identifyCommandChain(start,getAt){
  if(!start?.command||typeof getAt!=='function')return{ok:false,reason:'not-command'};
  const dirs={0:[0,-1,0],1:[0,1,0],2:[0,0,-1],3:[0,0,1],4:[-1,0,0],5:[1,0,0]};
  const key=b=>`${b.layer}|${b.x},${b.y},${b.z}`;
  const isChain=b=>String(b?.name||'').endsWith('chain_command_block');
  const isSourceBlock=b=>b&&(/(?:^|:)command_block$|(?:^|:)repeating_command_block$/.test(String(b.name||'')));
  const dirOf=b=>dirs[Number(b?.facing)]||dirs[2];
  const opposite=v=>[-v[0],-v[1],-v[2]];
  const at=(b,v)=>getAt(b.x+v[0],b.y+v[1],b.z+v[2],b.layer);
  // Exact incoming arrows are preferred. If a chain node is itself mis-faced,
  // the physical predecessor may still occupy the cell opposite its own
  // facing. Accept that one-cell chain predecessor as a broken-link bridge;
  // never bridge through arbitrary neighbors or impulse/repeating blocks.
  const incoming=b=>{
    const out=[],seen=new Set();
    for(const d of Object.values(dirs)){
      const prev=getAt(b.x-d[0],b.y-d[1],b.z-d[2],b.layer);
      if(!prev?.command)continue;
      const pd=dirOf(prev);
      if(pd[0]===d[0]&&pd[1]===d[1]&&pd[2]===d[2]){out.push({block:prev,kind:'direct'});seen.add(key(prev));}
    }
    if(!out.length){
      const back=at(b,opposite(dirOf(b)));
      if(back?.command&&isChain(back)&&!seen.has(key(back)))out.push({block:back,kind:'broken-facing-predecessor'});
    }
    return out;
  };
  // global safety guard: cap pathological malformed graphs without imposing
  // the old execute/testfor semantic limits on valid command chains.
  const reverseSeen=new Map([[key(start),start]]),queue=[start],reverseEdges=[],reverseBoundaries=[];let roots=[];
  while(queue.length&&reverseSeen.size<10000){
    const cur=queue.shift();
    if(isSourceBlock(cur)){roots.push(cur);continue;}
    const parents=incoming(cur);
    if(!parents.length){
      roots.push(cur);
      if(isChain(cur)){
        const d=dirOf(cur),back=at(cur,opposite(d));
        if(back&&!back.command)reverseBoundaries.push({type:'reverse-auxiliary-block',block:back,near:cur});
        else if(!back)reverseBoundaries.push({type:'reverse-empty-space',x:cur.x-d[0],y:cur.y-d[1],z:cur.z-d[2],layer:cur.layer,near:cur});
      }
      continue;
    }
    if(parents.length>1)reverseEdges.push({at:cur,branches:parents.map(x=>x.block)});
    for(const parent of parents){
      const prev=parent.block;reverseEdges.push({from:prev,to:cur,kind:parent.kind});
      if(!reverseSeen.has(key(prev))){reverseSeen.set(key(prev),prev);queue.push(prev);}
    }
  }
  const rootCandidates=roots.filter(b=>isSourceBlock(b)||classifyChainCommand(b.cmd)!=='other'&&classifyChainCommand(b.cmd)!=='empty');
  let source=roots.find(isSourceBlock)||rootCandidates[0]||roots[0]||null;
  if(!source)source=[...reverseSeen.values()].at(-1)||start;
  const sourceKind=classifyChainCommand(source.cmd);
  // A self-closed loop must be recognized before ordinary forward traversal.
  const cycleNodes=[],cycleSeen=new Map();let cycleCursor=source,cycleStart=-1;
  for(let guard=0;guard<10000&&cycleCursor?.command;guard++){
    if(cycleCursor!==source&&isSourceBlock(cycleCursor))break;
    const k=key(cycleCursor);if(cycleSeen.has(k)){cycleStart=cycleSeen.get(k);break;}
    cycleSeen.set(k,cycleNodes.length);cycleNodes.push(cycleCursor);
    const d=dirOf(cycleCursor);cycleCursor=at(cycleCursor,d);
  }
  if(cycleStart>=0){
    const loop=cycleNodes.slice(cycleStart),valid=loop.length>=2&&loop.length<=4;
    return{ok:true,source,sourceKind,sourceConfirmed:false,reverseNodes:[...reverseSeen.values()],chain:loop.map(block=>({block,status:'self-closed'})),boundaries:reverseBoundaries,cycle:true,nonStandardCycle:!valid,stopReason:valid?'self-closed-cycle':'non-standard-cycle',branchCount:reverseEdges.filter(e=>e.branches).length,unrelatedAncestors:[]};
  }
  const chain=[],seen=new Map(),boundaries=[];let current=source,cycle=false,nonStandardCycle=false,travelDirection=null;
  const push=(block,status='normal')=>{if(!seen.has(key(block))){seen.set(key(block),chain.length);chain.push({block,status});}};
  push(source,isSourceBlock(source)?'source':sourceKind!=='other'&&sourceKind!=='empty'?'head-candidate':'source-unconfirmed');
  let stopReason='end';
  for(let guard=0;guard<10000;guard++){
    const forward=dirOf(current);
    let movement=forward,next=at(current,forward),usedBrokenFacing=false;
    const expectedNext=travelDirection?at(current,travelDirection):null;
    const directionChanged=!!travelDirection&&forward.some((v,i)=>v!==travelDirection[i]);
    const nextPointsBackToCurrent=!!next?.command&&dirOf(next).every((v,i)=>v===-forward[i]);
    const nextHasForwardCommand=!!next?.command&&!!at(next,dirOf(next))?.command;
    // If a mis-faced chain node points at a different command block while the
    // established straight run continues immediately behind it, the pointed
    // block is the broken target. Keep walking the established run instead of
    // accidentally jumping into an unrelated branch. A target that points
    // back to the current node is retained for the self-closed/back-reference
    // rules. Normal corners still work when no straight continuation exists.
    if(directionChanged&&next?.command&&!isSourceBlock(next)&&!nextPointsBackToCurrent&&!nextHasForwardCommand&&expectedNext?.command&&isChain(expectedNext)&&!seen.has(key(expectedNext))){
      boundaries.push({type:'wrong-facing-target-ignored',block:next,from:current});
      const last=chain[chain.length-1];if(last&&last.block===current)last.status='broken-facing-continuation';
      movement=travelDirection;next=expectedNext;usedBrokenFacing=true;
    }
    // Empty and auxiliary facing targets can also be bypassed only when the
    // exact next cell on the established run contains a chain command block.
    if(!next||!next.command){
      if(travelDirection&&directionChanged&&expectedNext?.command&&isChain(expectedNext)&&!seen.has(key(expectedNext))){
        if(!usedBrokenFacing){
          if(next)boundaries.push({type:'wrong-facing-target-ignored',block:next,from:current});
          else boundaries.push({type:'wrong-facing-empty-target',x:current.x+forward[0],y:current.y+forward[1],z:current.z+forward[2],layer:current.layer,from:current});
          const last=chain[chain.length-1];if(last&&last.block===current)last.status='broken-facing-continuation';
        }
        movement=travelDirection;next=expectedNext;usedBrokenFacing=true;
      }else{
        const last=chain[chain.length-1],isBrokenTerminal=last?.block===current&&last.status==='wrong-facing';
        if(next){stopReason=isBrokenTerminal?'wrong-facing-node':'auxiliary-block';if(!isBrokenTerminal)boundaries.push({type:'auxiliary-block',block:next});}
        else{stopReason=isBrokenTerminal?'wrong-facing-node':'empty-space';if(!isBrokenTerminal)boundaries.push({type:'empty-space',x:current.x+forward[0],y:current.y+forward[1],z:current.z+forward[2],layer:current.layer});}
        break;
      }
    }
    if(!next.command){stopReason='auxiliary-block';boundaries.push({type:'auxiliary-block',block:next});break;}
    if(isSourceBlock(next)){stopReason='next-source-block';boundaries.push({type:'next-source-block',block:next});break;}
    if(seen.has(key(next))){const size=chain.length;cycle=true;nonStandardCycle=size>4||size<2;stopReason=nonStandardCycle?'non-standard-cycle':'self-closed-cycle';break;}
    const nd=dirOf(next),target=at(next,nd),pointsBack=!!travelDirection&&nd[0]===-movement[0]&&nd[1]===-movement[1]&&nd[2]===-movement[2];
    if(pointsBack){push(next,'points-to-previous');boundaries.push({type:'back-pointing-node',block:next,pointsTo:current});stopReason='back-pointing-node';break;}
    if(target?.command){
      const turn=nd.some((v,i)=>v!==movement[i]);
      push(next,String(next.cmd||'').trim()?(turn?'turning':'normal'):'empty-command');
      current=next;travelDirection=movement;continue;
    }
    // The newly reached node may itself be the broken-facing node. Keep it;
    // the command it points at is the invalid target. Its predecessor's run
    // direction can carry the chain onward on the next iteration.
    push(next,'wrong-facing');
    if(target&&!target.command)boundaries.push({type:'auxiliary-block',block:target,from:next});
    else if(target)boundaries.push({type:'wrong-facing-target-ignored',block:target,from:next});
    else boundaries.push({type:'wrong-facing-empty-space',x:next.x+nd[0],y:next.y+nd[1],z:next.z+nd[2],layer:next.layer,from:next});
    current=next;travelDirection=movement;
    // Do not stop here: the next iteration may continue on the existing run
    // while excluding the bad block in the direction of the incorrect facing.
    stopReason=usedBrokenFacing?'broken-facing-continued':'wrong-facing-node';
  }
  if(reverseEdges.some(e=>e.branches))stopReason=stopReason==='end'?'multiple-predecessors':stopReason;
  const pathKeys=new Set(chain.map(x=>key(x.block)));
  const unrelatedAncestors=[...reverseSeen.values()].filter(b=>!pathKeys.has(key(b)));
  return{ok:true,source,sourceKind,sourceConfirmed:isSourceBlock(source)||sourceKind!=='other'&&sourceKind!=='empty',reverseNodes:[...reverseSeen.values()],chain,boundaries:[...reverseBoundaries,...boundaries],cycle,nonStandardCycle,stopReason,branchCount:reverseEdges.filter(e=>e.branches).length,unrelatedAncestors};
}
  global.BlockFlowBrokenChainCore = Object.freeze({
    normalizeCommandText,
    classifyChainCommand,
    formatCommandChain,
    identifyCommandChain
  });
})(typeof window !== 'undefined' ? window : self);
