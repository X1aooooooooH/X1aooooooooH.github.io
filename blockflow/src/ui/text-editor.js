import { app } from '../state.js';
import { isAirPlaceholderBlock } from '../core/blocks.js';
import { getBrokenHeadKind, isBrokenChainPlaceholder, normalizeBrokenChainBlocks } from '../core/broken-head.js';
import { ensureStructureSize, reflowChainsForSize } from '../core/layout.js';
import { cloneChains } from '../core/model.js';
import { escapeHtml } from './dom.js';
import { createLineMetrics } from './line-metrics.js';
import { toast, rememberModalFocus, restoreModalFocus } from './feedback.js';
import { logInfo, logOk, logError, setCurrentAction } from '../log.js';
import { saveCamera } from '../scene.js';
import {
  appendImportedChains, pushHistory, refreshChainsUI, closeChainAddModal
} from '../editor.js';

let textEditChain = -1;
let textEditIsNew = false;
let textEditDraft = null;
const textMetrics = createLineMetrics();
let textLayoutLines = [];
let textLayoutHeights = [];
let textContentHeight = 0;
let textLayoutToken = 0;

const escapeTextEditorHtml = escapeHtml;

function normalizeImportedCommands(text){
  const source=String(text??'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  // A single final newline is the conventional TXT line terminator, not an
  // additional physical command block. Interior blank rows remain physical
  // empty blocks. To express an explicit final empty block, end with two '\n'.
  if(source.length===0)return[];
  const normalized=source.endsWith('\n')?source.slice(0,-1):source;
  if(normalized.length===0)return[];
  return normalized.split('\n').map(line=>line.trim());
}

function classifyTxtChain(commands){
  return (getBrokenHeadKind(commands)||isBrokenChainPlaceholder(commands))?'snake':'repeat';
}

function serializeTextEditorBlocks(blocks){
  // Text rows map 1:1 to physical command blocks. An empty Command is an empty row,
  // not a missing row; otherwise selection/conditions/export silently shift.
  return (Array.isArray(blocks)?blocks:[]).map(b=>String(b?.cmd??'').trim()).join('\n');
}

function cloneChainForTextEditor(chain){
  let commandOffset=0;
  const airPlaceholderOffsets=[];
  for(const b of chain?.blocks||[]){
    if(isAirPlaceholderBlock(b))airPlaceholderOffsets.push(commandOffset);
    else commandOffset++;
  }
  const blocks=(chain?.blocks||[]).filter(b=>!isAirPlaceholderBlock(b)).map(b=>({
    x:b.x,y:b.y,z:b.z,facing:b.facing,cmd:String(b.cmd||''),cond:b.cond?1:0,
    auto:b.auto!==0?1:0,blockType:b.blockType,isAuxiliary:!!b.isAuxiliary,isBrokenNormalized:!!b.isBrokenNormalized,brokenWrongFacing:!!b.brokenWrongFacing,marked:!!b.marked,note:b.note||''
  }));
  const firstBlockType=blocks[0]?.blockType==='command'||blocks[0]?.blockType==='repeating'
    ?blocks[0].blockType
    :(chain?.type==='impulse'?'command':'repeating');
  return{
    type:chain?.type==='impulse'?'impulse':(chain?.type==='snake'?'snake':'repeat'),
    firstBlockType,
    selfClosed:!!chain?.selfClosed,
    preservePhysicalType:!!chain?.preservePhysicalType,
    selfClosedCycleKeys:Array.isArray(chain?.selfClosedCycleKeys)?chain.selfClosedCycleKeys.slice():[],
    airPlaceholderOffsets,
    blocks,
    text:serializeTextEditorBlocks(blocks),
    conditionLines:blocks.map(b=>!!b.cond)
  };
}

function openTextEditorNew(initialText='',title='新建文本链'){
  const text=String(initialText||'').replace(/^\uFEFF/,'');
  const rawLines=text.replace(/\r/g,'').split('\n');
  const parsed=rawLines.map(line=>({cmd:String(line??'').trim(),cond:0}));
  const type=classifyTxtChain(parsed.map(x=>x.cmd));
  if(type==='snake'){
    normalizeBrokenChainBlocks(parsed,{applyCondition:true});
  }
  textEditChain=-1;
  textEditIsNew=true;
  const normalizedLines=parsed;
  textEditDraft={
    type,
    firstBlockType:'repeating',
    blocks:normalizedLines.map(item=>({cmd:item.cmd,cond:item.cond,auto:1,facing:2,blockType:'chain',isBrokenNormalized:!!item.isBrokenNormalized,marked:false,note:''})),
    text:normalizedLines.map(item=>item.cmd).join('\n'),
    conditionLines:normalizedLines.map(item=>!!item.cond)
  };
  openTextEditorDraft(title||'新建文本链','新建链');
}

function openTextEditorForChain(ci){
  if(ci<0||ci>=app.chains.length)return;
  textEditChain=ci;
  textEditIsNew=false;
  textEditDraft=cloneChainForTextEditor(app.chains[ci]);
  openTextEditorDraft(`编辑链 ${ci+1}`,'应用修改');
}

function openTextEditorDraft(title,applyLabel){
  const overlay=document.getElementById('textEditorOverlay');
  document.getElementById('textEditorTitle').textContent=title;
  document.getElementById('textEditorSub').textContent=textEditIsNew
    ?'文本模式 · 每行一条命令 · 点击行号切换有无条件'
    :'只编辑当前链 · 每行一条命令';
  document.getElementById('textEditorApply').textContent=applyLabel;
  renderTextEditor();
  rememberModalFocus('textEditorOverlay');
  overlay.classList.add('on');
  overlay.setAttribute('aria-hidden','false');
  if(window.BlockFlowAI)window.BlockFlowAI.refresh();
  if(!textEditIsNew&&textEditChain>=0)logInfo(`打开链 ${textEditChain+1} 的文本模式`,'文本模式');
  setTimeout(()=>{
    const input=document.getElementById('textEditorInput');
    if(input){
      input.focus();
      const end=input.value.length;
      input.setSelectionRange(end,end);
    }
  },30);
}

function closeTextEditor(){
  const overlay=document.getElementById('textEditorOverlay');
  overlay.classList.remove('on');
  overlay.setAttribute('aria-hidden','true');
  restoreModalFocus('textEditorOverlay');
  textEditChain=-1;
  textEditIsNew=false;
  textEditDraft=null;
}

function highlightCommandBody(source){
  const text=String(source??'');
  let i=0,out='';
  const append=(cls,value)=>{out+=cls?`<span class="${cls}">${escapeTextEditorHtml(value)}</span>`:escapeTextEditorHtml(value);};
  while(i<text.length){
    if(text[i]==='#'){
      append('tok-comment',text.slice(i));
      break;
    }
    if(text[i]==='"'||text[i]==="'"){
      const quote=text[i];
      let j=i+1;
      while(j<text.length){
        if(text[j]==='\\'){j+=2;continue;}
        if(text[j]===quote){j++;break;}
        j++;
      }
      append('tok-string',text.slice(i,j));
      i=j;continue;
    }
    if(i===0&&text[i]==='/'){
      const m=text.match(/^\/[A-Za-z0-9_.:-]+/);
      if(m){append('tok-command',m[0]);i+=m[0].length;continue;}
    }
    if(text[i]==='@'){
      const m=text.slice(i).match(/^@[A-Za-z][A-Za-z0-9_]*(?:\[[^\]]*\])?/);
      if(m){append('tok-selector',m[0]);i+=m[0].length;continue;}
    }
    const coord=text.slice(i).match(/^[~^](?:-?(?:\d+(?:\.\d+)?|\.\d+))?/);
    if(coord){append('tok-coordinate',coord[0]);i+=coord[0].length;continue;}
    const number=text.slice(i).match(/^-?(?:\d+(?:\.\d+)?|\.\d+)/);
    if(number){append('tok-number',number[0]);i+=number[0].length;continue;}
    // Namespace IDs must be matched before ':' is treated as punctuation.
    // This also recognizes the value side of key=minecraft:block expressions.
    const resourceId=text.slice(i).match(/^[A-Za-z0-9_.-]+:[A-Za-z0-9_./-]+/);
    if(resourceId){append('tok-id',resourceId[0]);i+=resourceId[0].length;continue;}
    const punc=text[i].match(/[\[\]{}(),:]/);
    if(punc){append('tok-punc',text[i]);i++;continue;}
    const word=text.slice(i).match(/^[^\s\[\]{}(),:"']+/);
    if(word){
      const value=word[0];
      if(/^(?:true|false|null)$/i.test(value))append('tok-keyword',value);
      else if(/^[A-Za-z0-9_.-]+:[A-Za-z0-9_./-]+$/.test(value))append('tok-id',value);
      else append('',value);
      i+=value.length;continue;
    }
    append('',text[i]);i++;
  }
  return out||' ';
}

function highlightTextEditorLine(line){
  return highlightCommandBody(String(line??''));
}

function renderTextEditor(){
  const input=document.getElementById('textEditorInput');
  const highlight=document.getElementById('textEditorHighlight');
  const numbers=document.getElementById('textEditorLineNumbers');
  const main=document.getElementById('textEditorCodeMain');
  if(!input||!highlight||!numbers||!main)return;
  if(textEditDraft)input.value=String(textEditDraft.text??'');
  syncTextEditorVisuals();
}

function syncTextEditorVisuals(){
  const input=document.getElementById('textEditorInput');
  const highlight=document.getElementById('textEditorHighlight');
  const numbers=document.getElementById('textEditorLineNumbers');
  const main=document.getElementById('textEditorCodeMain');
  const work=document.getElementById('textEditorWork');
  if(!input||!highlight||!numbers||!main||!work)return;
  const scrollTop=main.scrollTop,scrollLeft=main.scrollLeft;
  const value=String(input.value??'').replace(/\r/g,'');
  const lines=value?value.split('\n'):[''];
  if(!value){
    if(highlight.innerHTML!=='')highlight.innerHTML='';
  }else if(lines.length!==textLayoutLines.length||highlight.children.length!==lines.length){
    highlight.innerHTML=lines.map(line=>`<span class="text-highlight-line">${highlightTextEditorLine(line)}</span>`).join('');
  }else{
    for(let index=0;index<lines.length;index++){
      if(lines[index]!==textLayoutLines[index])highlight.children[index].innerHTML=highlightTextEditorLine(lines[index]);
    }
  }
  const conditionLines=textEditDraft?.conditionLines||[];
  if(numbers.children.length!==lines.length){
    numbers.innerHTML=lines.map((_,index)=>`<span class="text-line-number${conditionLines[index]?' is-conditional':''}" data-line="${index}">${index+1}</span>`).join('');
  }else{
    for(let index=0;index<lines.length;index++)numbers.children[index].classList.toggle('is-conditional',!!conditionLines[index]);
  }
  textLayoutLines=lines.slice();
  main.classList.toggle('is-empty',!value);
  const token=++textLayoutToken;
  requestAnimationFrame(()=>{
    if(token!==textLayoutToken)return;
    const lineNodes=highlight.children;
    const heights=textMetrics(lineNodes,lines,highlight);
    let heightsChanged=heights.length!==textLayoutHeights.length;
    if(!heightsChanged){
      for(let index=0;index<heights.length;index++){
        if(heights[index]!==textLayoutHeights[index]){heightsChanged=true;break;}
      }
    }
    if(heightsChanged){
      const numNodes=numbers.children;
      for(let index=0;index<numNodes.length;index++){
        const height=heights[index];
        numNodes[index].style.height=height?`${height}px`:'1.75em';
      }
      textLayoutHeights=heights.slice();
      const contentHeight=Math.max(main.clientHeight,highlight.scrollHeight+2);
      if(contentHeight!==textContentHeight){
        textContentHeight=contentHeight;
        input.style.height=`${contentHeight}px`;
        highlight.style.minHeight=`${contentHeight}px`;
        numbers.style.minHeight=`${contentHeight}px`;
      }
    }
    main.scrollTop=scrollTop;
    main.scrollLeft=scrollLeft;
    numbers.style.transform=`translateY(${-main.scrollTop}px)`;
  });
}

window.addEventListener('resize', () => {
  if (document.getElementById('textEditorOverlay')?.classList.contains('on')) {
    textLayoutHeights=[];
    textContentHeight=0;
    syncTextEditorVisuals();
  }
});
if (document.fonts?.ready) {
  document.fonts.ready.then(() => {
    textMetrics.invalidate();
    textLayoutHeights=[];
    textContentHeight=0;
    if (document.getElementById('textEditorOverlay')?.classList.contains('on')) syncTextEditorVisuals();
  });
}

function syncTextEditorScroll(){
  const main=document.getElementById('textEditorCodeMain');
  const numbers=document.getElementById('textEditorLineNumbers');
  if(main&&numbers)numbers.style.transform=`translateY(${-main.scrollTop}px)`;
}

function updateTextEditorDraft(){
  const input=document.getElementById('textEditorInput');
  if(!input||!textEditDraft)return;
  const newText=input.value.replace(/\r/g,'');
  const oldText=String(textEditDraft.text??'').replace(/\r/g,'');
  const oldLines=oldText.split('\n');
  const newLines=newText.split('\n');
  const previousConditions=Array.isArray(textEditDraft.conditionLines)?textEditDraft.conditionLines:[];
  const previousBlocks=Array.isArray(textEditDraft.blocks)?textEditDraft.blocks:[];
  const sameCount=newLines.length===oldLines.length;
  let prefix=0,suffix=0;
  if(!sameCount){
    while(prefix<oldLines.length&&prefix<newLines.length&&oldLines[prefix]===newLines[prefix])prefix++;
    while(
      suffix<oldLines.length-prefix&&
      suffix<newLines.length-prefix&&
      oldLines[oldLines.length-1-suffix]===newLines[newLines.length-1-suffix]
    )suffix++;
  }else{
    prefix=oldLines.length;suffix=0;
  }
  const oldChangedStart=prefix;
  const newChangedStart=prefix;
  const oldChangedCount=Math.max(0,oldLines.length-prefix-suffix);
  const newChangedCount=Math.max(0,newLines.length-prefix-suffix);
  const lineMap=new Array(newLines.length).fill(null);
  for(let i=0;i<prefix;i++)lineMap[i]=i;
  for(let i=newLines.length-suffix;i<newLines.length;i++)lineMap[i]=i-(newChangedCount-oldChangedCount);
  if(newChangedCount>0&&oldChangedCount>0)lineMap[newChangedStart]=oldChangedStart;

  const newConditions=newLines.map((_,i)=>{
    const oldIndex=lineMap[i];
    return oldIndex!==null&&oldIndex>=0&&oldIndex<oldLines.length?!!previousConditions[oldIndex]:false;
  });
  const newBlockRecords=[];
  for(let lineIndex=0;lineIndex<newLines.length;lineIndex++){
    const cmd=String(newLines[lineIndex]??'').trim();
    const oldLineIndex=lineMap[lineIndex];
    // Since every text line corresponds to one physical block, block metadata
    // is indexed by line, not by the count of non-empty commands before it.
    const oldBlockIndex=oldLineIndex===null||oldLineIndex===undefined||oldLineIndex<0?-1:oldLineIndex;
    const oldBlock=oldBlockIndex>=0?previousBlocks[oldBlockIndex]:null;
    newBlockRecords.push({cmd,cond:newConditions[lineIndex]?1:0,oldBlock});
  }
  textEditDraft.text=input.value;
  textEditDraft.conditionLines=newConditions;
  textEditDraft.blocks=newBlockRecords.map(record=>({
    ...(record.oldBlock||{}),
    cmd:record.cmd,
    cond:record.cond
  }));
  updateTextEditorHint();
  syncTextEditorVisuals();
}

function updateTextEditorHint(){
  const hint=document.getElementById('textEditorHint');
  const input=document.getElementById('textEditorInput');
  if(!hint||!textEditDraft||!input)return;
  const value=input.value.replace(/\r/g,'');
  const lines=value.split('\n');
  const nonEmpty=lines.filter(line=>String(line||'').trim());
  const conditions=Array.isArray(textEditDraft.conditionLines)?textEditDraft.conditionLines:[];
  const conditionCount=lines.reduce((count,line,i)=>count+(String(line||'').trim()&&conditions[i]?1:0),0);
  // Include physical blank rows when detecting the special blank broken-head template.
  const inferred=classifyTxtChain(lines.map(line=>String(line??'').trim()));
  const type=inferred==='snake'?'snake':(textEditDraft.type==='impulse'||textEditDraft.firstBlockType==='command'?'impulse':'repeat');
  const emptyCount=lines.filter(line=>String(line||'').trim()==='').length;
  const typeLabel=type==='snake'?'断链':type==='impulse'?'脉冲':'循环';
  hint.textContent=`${lines.length} 个方块行（${nonEmpty.length} 行非空命令、${emptyCount} 个空命令方块） · ${conditionCount} 条有条件 · 当前按${typeLabel}链处理 · 点击左侧行号切换条件`;
}

function buildTextEditorChains(){
  const input=document.getElementById('textEditorInput');
  const text=input?input.value:String(textEditDraft?.text||'');
  if(!textEditDraft)throw new Error('文本编辑状态不存在');
  const lines=text.replace(/\r/g,'').split('\n');
  const conditionLines=textEditDraft.conditionLines||[];
  const parsed=lines.map((line,i)=>({cmd:String(line??'').trim(),cond:!!conditionLines[i]}));
  if(!parsed.length)throw new Error('文本内容中没有可表示的命令方块');
  const inferred=classifyTxtChain(parsed.map(item=>item.cmd));
  if(inferred==='snake'){
    normalizeBrokenChainBlocks(parsed,{applyCondition:false});
  }
  const type=inferred==='snake'?'snake':(textEditDraft.type==='impulse'||textEditDraft.firstBlockType==='command'?'impulse':'repeat');
  const sourceBlocks=textEditDraft.blocks||[];
  const firstBlockType=textEditDraft.firstBlockType==='command'?'command':'repeating';
  // Text-only edits to a supported self-closed cycle must not flatten its
  // physical topology. Preserve positions/facing/block types when row count is
  // unchanged; inserting/removing rows intentionally falls back to normal layout.
  const preserveCycleGeometry=!!textEditDraft.selfClosed&&parsed.length===sourceBlocks.length&&
    sourceBlocks.length>=2&&sourceBlocks.every(b=>b&&
      [b.x,b.y,b.z].every(Number.isInteger)&&Number.isInteger(b.facing)&&b.facing>=0&&b.facing<=5&&
      (b.blockType==='chain'||b.blockType==='command'||b.blockType==='repeating'));
  const blocks=parsed.map((item,i)=>{
    const old=sourceBlocks[i]||{};
    const auxiliary=!!old.isAuxiliary;
    const oldBlockType=['command','repeating','chain'].includes(old.blockType)?old.blockType:null;
    return{
      ...(preserveCycleGeometry?{x:old.x,y:old.y,z:old.z}:{}),
      cmd:item.cmd,
      cond:item.cond?1:0,
      auto:old.auto!==undefined?(old.auto!==0?1:0):1,
      facing:preserveCycleGeometry?old.facing:2,
      blockType:preserveCycleGeometry?old.blockType:(auxiliary&&oldBlockType?oldBlockType:(i===0?firstBlockType:'chain')),
      isAuxiliary:auxiliary,
      isBrokenNormalized:!!old.isBrokenNormalized,
      brokenWrongFacing:!!old.brokenWrongFacing,
      selfClosedCycle:preserveCycleGeometry&&!!old.selfClosedCycle,
      marked:!!old.marked,
      note:old.note||''
    };
  });
  // The virtual air slots are not editable command rows. Preserve their logical
  // positions when text is edited, clamping offsets if the command count changes.
  for(const offset of [...(textEditDraft.airPlaceholderOffsets||[])].sort((a,b)=>b-a)){
    const at=Math.max(0,Math.min(blocks.length,Number(offset)||0));
    blocks.splice(at,0,{cmd:'',cond:0,auto:1,facing:2,blockType:'chain',isAirPlaceholder:true,marked:false,note:''});
  }
  return[{
    type:preserveCycleGeometry?(textEditDraft.type||'repeat'):type,
    selfClosed:preserveCycleGeometry,
    preservePhysicalType:preserveCycleGeometry&&!!textEditDraft.preservePhysicalType,
    selfClosedCycleKeys:preserveCycleGeometry&&Array.isArray(textEditDraft.selfClosedCycleKeys)?textEditDraft.selfClosedCycleKeys.slice():[],
    blocks
  }];
}

function applyTextEditor(){
  setCurrentAction('应用文本编辑');
  try{
    const segments=buildTextEditorChains();
    if(textEditIsNew){
      appendImportedChains(segments,'文本链',{closeModal:false,silentToast:true});
      closeTextEditor();
      toast(segments[0]?.type==='snake'?'检测到断链特征，已自动规范两个 /setblock':'文本链已加入结构','ok');
      logOk('文本链已加入结构','应用文本编辑');
      return;
    }
    const ci=textEditChain;
    if(ci<0||ci>=app.chains.length)throw new Error('当前链不存在');
    const currentChain=app.chains[ci];
    if(!currentChain)throw new Error('当前链不存在');
    const nextChains=cloneChains(app.chains);
    nextChains.splice(ci,1,...segments);
    reflowChainsForSize(nextChains);
    ensureStructureSize(nextChains,'文本修改后结构');
    saveCamera();
    app.chains=nextChains;
    app.selectedChain=ci;
    app.selectedBlock=-1;
    app.singleChain=app.chains.length===1;
    pushHistory();
    refreshChainsUI();
    closeTextEditor();
    toast(segments[0]?.type==='snake'?'文本已应用并识别为断链':'文本已应用','ok');
    logOk('文本修改完成','应用文本编辑');
  }catch(e){
    logError(e?.stack||e?.message||String(e),'应用文本编辑');
    toast(e.message,'err');
  }finally{
    setCurrentAction('空闲');
  }
}

async function importChainFromTxt(file){
  const text=await file.text();
  const commands=normalizeImportedCommands(text);
  if(!commands.length)throw new Error('TXT 文件中没有找到命令');
  closeChainAddModal();
  openTextEditorNew(commands.join('\n'),file.name.replace(/\.txt$/i,''));
}

document.getElementById('textEditorClose').onclick=closeTextEditor;
document.getElementById('textEditorCancel').onclick=closeTextEditor;
document.getElementById('textEditorApply').onclick=applyTextEditor;
document.getElementById('textEditorOverlay').addEventListener('click',e=>{if(e.target.id==='textEditorOverlay')closeTextEditor();});
document.getElementById('textEditorInput').addEventListener('input',updateTextEditorDraft);
document.getElementById('textEditorLineNumbers').addEventListener('click',e=>{
  const target=e.target.closest('.text-line-number');
  if(!target||!textEditDraft)return;
  const line=Number(target.dataset.line);
  if(!Number.isInteger(line)||line<0)return;
  const value=document.getElementById('textEditorInput')?.value||'';
  const count=value.replace(/\r/g,'').split('\n').length;
  textEditDraft.conditionLines=textEditDraft.conditionLines||[];
  while(textEditDraft.conditionLines.length<count)textEditDraft.conditionLines.push(false);
  textEditDraft.conditionLines[line]=!textEditDraft.conditionLines[line];
  updateTextEditorDraft();
});
document.getElementById('textEditorCodeMain').addEventListener('scroll',syncTextEditorScroll);
document.getElementById('textEditorInput').addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){
    e.preventDefault();
    applyTextEditor();
    return;
  }
  if(e.key==='Tab'){
    e.preventDefault();
    const input=e.currentTarget;
    const start=input.selectionStart,end=input.selectionEnd;
    input.setRangeText('  ',start,end,'end');
    updateTextEditorDraft();
  }
});

export {
  openTextEditorNew, openTextEditorForChain, openTextEditorDraft, closeTextEditor,
  highlightTextEditorLine, renderTextEditor, applyTextEditor, importChainFromTxt
};
export const getTextEditChain = () => textEditChain;
export const getTextEditDraft = () => textEditDraft;
