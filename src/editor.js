import { TYPE_LABEL } from './core/constants.js';
import { cloneNBT } from './core/nbt.js';
import { isAirPlaceholderBlock } from './core/blocks.js';
import { detectChainType, processCommands } from './core/trace.js';
import { ensureStructureSize, reflowChainsForSize } from './core/layout.js';
import { parseMcstructure } from './core/structure.js';
import { cloneChains, countPhysicalBlocks, snapshotChains } from './core/model.js';
import { app } from './state.js';
import { storageGet, storageSet, storageRemove } from './core/storage.js';
import { toast, undoToast, rememberModalFocus, restoreModalFocus, showPromptModal } from './ui/feedback.js';
import {
  logInfo, logOk, logWarn, logError, setCurrentAction
} from './log.js';
import {
  renderAllBlocks, reselectCurrent, saveCamera, initScene, ensureThree, preloadTextures,
  resizeRenderer, isPreviewReady, hasTextures,
  captureOverviewCamera, setBlockVisibility, applyChainCamera, setViewPreset, deselect
} from './scene.js';
import { hideInfo } from './inspector.js?v=r39-layout-20261129';
import { setTheme } from './ui/theme.js?v=r39-layout-20261129';

const AUTOSAVE_NBT_TYPE = '__blockflow_autosave_nbt_type__';

export function refreshChainsUI() {
  renderAllBlocks();
  updateStats();
  window.renderWorkspaceSidebar?.();
}

function reflowAllChains(){
  reflowChainsForSize(app.chains);
}

function updateChainBar(){
  const inChain=app.mode==='chain';
  const exitBtn=document.getElementById('exitChainBtn');
  if(exitBtn)exitBtn.style.display=(inChain&&!app.singleChain)?'flex':'none';
  if(window.BlockFlowAI)window.BlockFlowAI.refresh();
  window.syncWorkspaceMode?.();
  window.renderWorkspaceSidebar?.();
  window.renderInlineText?.();
}

function openChainAddModal(){
  const m=document.getElementById('chainAddModal');
  if(!m)return;
  // 将弹窗提升到 body 顶层，脱离编辑器/管理链可能创建的层叠上下文。
  // 否则即使设置更大的 z-index，也可能被父级 stacking context 限制。
  if(m.parentElement!==document.body)document.body.appendChild(m);
  rememberModalFocus('chainAddModal');
  m.classList.add('on');
  m.setAttribute('aria-hidden','false');
  setTimeout(()=>m.querySelector('.chain-import-btn')?.focus(),0);
}

function closeChainAddModal(){
  const m=document.getElementById('chainAddModal');if(m){m.classList.remove('on');m.setAttribute('aria-hidden','true');restoreModalFocus('chainAddModal');}
}

function appendImportedChains(chains,label,options={}){
  const silentToast=!!options.silentToast;
  const closeModal=options.closeModal!==false;
  if(!Array.isArray(chains)||chains.length===0)throw new Error(`${label}中没有找到可导入的命令链`);
  const imported=chains.map(c=>{
    const keepGeometry=!!(c.selfClosed||c.preservePhysicalType);
    const blocks=c.blocks.map((b,i)=>({
      ...(keepGeometry?{x:Number(b.x),y:Number(b.y),z:Number(b.z)}:{}),
      cmd:String(b.cmd||''),
      cond:b.cond?1:0,
      auto:b.auto!==0?1:0,
      facing:keepGeometry?Number(b.facing):2,
      blockType:b.blockType==='repeating'?'repeating':(b.blockType==='command'?'command':'chain'),
      isAuxiliary:!!b.isAuxiliary,
      isBrokenNormalized:!!b.isBrokenNormalized,
      isAirPlaceholder:!!b.isAirPlaceholder,
      selfClosedCycle:!!b.selfClosedCycle,
      brokenWrongFacing:!!b.brokenWrongFacing,
      marked:!!b.marked,
      note:b.note||''
    }));
    if(!keepGeometry&&blocks[0]&&blocks[0].blockType==='chain')blocks[0].blockType='repeating';
    return{type:c.preservePhysicalType?'repeat':detectChainType(blocks),selfClosed:!!c.selfClosed,preservePhysicalType:!!c.preservePhysicalType,selfClosedCycleKeys:Array.isArray(c.selfClosedCycleKeys)?c.selfClosedCycleKeys.slice():[],blocks};
  });
  const nextChains=app.chains.concat(imported);
  reflowChainsForSize(nextChains);
  ensureStructureSize(nextChains,`${label}导入后结构`);
  saveCamera();
  app.chains=nextChains;
  app.selectedChain=-1;
  app.selectedBlock=-1;
  app.singleChain=app.chains.length===1;
  app.mode='overview';
  pushHistory();
  refreshChainsUI();
  if(closeModal)closeChainAddModal();
  if(!silentToast)toast(`已导入 ${imported.length} 条链`,'ok');
}

async function importChainFromMcstructure(file){
  const buf=await file.arrayBuffer();
  const parsed=await parseMcstructure(buf);
  const context={blockMap:parsed.blockMap,X:parsed.X,Y:parsed.Y,Z:parsed.Z};
  const chains=processCommands(parsed.commands,context,{warn:logWarn});
  if(context.repeatingSplits)logWarn(`检测到 ${context.repeatingSplits} 处第二个循环命令方块，已从该处起自动拆分为下一条链`,'读取命令链');
  appendImportedChains(chains,'结构文件',{closeModal:true});
}

function addChainOfType(type){
  setCurrentAction('新增命令链');
  try{
    saveCamera();
    let blocks;
    if(type==='repeat'){
      blocks=[{cmd:'',cond:0,auto:1,facing:2,blockType:'repeating',marked:false,note:''}];
    }else if(type==='impulse'){
      blocks=[{cmd:'',cond:0,auto:1,facing:2,blockType:'command',marked:false,note:''}];
    }else{
      throw new Error('不支持的新增链类型');
    }
    const newChain={type,blocks};
    const nextChains=app.chains.concat(newChain);
    reflowChainsForSize(nextChains);
    ensureStructureSize(nextChains,'新增链后结构');
    app.chains=nextChains;
    app.selectedChain=app.chains.length-1;
    app.selectedBlock=-1;
    app.singleChain=app.chains.length===1;
    if(app.chains.length>1)app.singleChain=false;
    app.mode='overview';
    pushHistory();
    refreshChainsUI();
    closeChainAddModal();
    toast(type==='repeat'?'已新增循环链':'已新增脉冲链','ok');
    logOk(type==='repeat'?'新增循环链完成':'新增脉冲链完成','新增命令链');
  }catch(e){
    logError(e?.stack||e?.message||String(e),'新增命令链');
    toast(e.message,'err');
  }finally{
    setCurrentAction('空闲');
  }
}

function selectChainFromManager(ci) {
  if (!Number.isInteger(ci) || ci < 0 || ci >= app.chains.length) return;
  app.selectedChain = ci;
  app.selectedBlock = -1;
  if (!app.singleChain) {
    if (app.mode === 'overview') captureOverviewCamera();
    app.mode = 'chain';
    setBlockVisibility(ci);
    applyChainCamera();
    document.getElementById('exitChainBtn').style.display = 'flex';
  }
  updateChainBar();
  logInfo(app.singleChain ? `选中唯一链 ${ci + 1}` : `选中链 ${ci + 1}`, '选择命令链');
}

function reorderChains(from,to){
  if(from<0||to<0||from>=app.chains.length||to>=app.chains.length||from===to)return;
  saveCamera();
  const selectedRef=app.selectedChain>=0?app.chains[app.selectedChain]:null;
  const moved=app.chains.splice(from,1)[0];
  app.chains.splice(to,0,moved);
  reflowAllChains();
  if(selectedRef)app.selectedChain=app.chains.indexOf(selectedRef);
  else app.selectedChain=-1;
  app.selectedBlock=-1;
  pushHistory();
  refreshChainsUI();
  toast(`已将链移动到第 ${to+1} 位`,'ok');
  logInfo(`调整链顺序：${from+1} → ${to+1}`,'调整链顺序');
}

async function deleteChainAt(ci){
  if(!Number.isInteger(ci)||ci<0||ci>=app.chains.length)return;
  logInfo(`请求删除第 ${ci+1} 条链（当前共 ${app.chains.length} 条）`,'删除命令链');
  saveCamera();
  if(!(await showPromptModal(`确定删除第 ${ci+1} 条链（共 ${app.chains.length} 条）吗？`, {title:'删除命令链', confirmText:'删除', cancelText:'取消'})))return;
  app.chains.splice(ci,1);
  app.selectedBlock=-1;
  app.singleChain=app.chains.length===1;
  app.mode=app.singleChain?'chain':'overview';
  app.selectedChain=app.singleChain?0:-1;
  app.camera=null;
  app.overviewCamera=null;
  if(app.chains.length===0){
    if(isPreviewReady())renderAllBlocks();
    pushHistory();
    updateStats();
    updateChainBar();
    window.renderWorkspaceSidebar?.();
    document.getElementById('exitChainBtn').style.display='none';
    // Keep the empty editor visible so Ctrl+Z can restore the deleted final chain.
    toast('已删除最后一条链（可使用 Ctrl+Z 撤销）','ok');
    logOk('已删除最后一条链，结构现在为空；可用 Ctrl+Z 撤销','删除命令链');
    return;
  }
  reflowAllChains();
  pushHistory();
  refreshChainsUI();
  if(app.singleChain)setTimeout(()=>setViewPreset('top'),30);
  toast(`已删除链 ${ci+1}`,'ok');
  logOk(`已删除链 ${ci+1}，剩余 ${app.chains.length} 条链`,'删除命令链');
}

function changeSelectedBlockType(type){
  const ci=app.selectedChain,bi=app.selectedBlock;
  if(ci<0||bi<0||!['command','chain','repeating'].includes(type))return;
  const nextChains=cloneChains(app.chains);
  const chain=nextChains[ci];
  if(!chain||!chain.blocks[bi])return;
  const current=chain.blocks[bi];
  if(current.blockType===type)return;
  if(type==='chain'&&bi===0){
    toast('链头不能改成链式命令方块','err');
    const sel=document.getElementById('infoBlockType');if(sel)sel.value=current.blockType;
    return;
  }
  if(type==='command'||type==='repeating'){
    const headType=type==='command'?'impulse':'repeat';
    if(bi===0){
      chain.blocks[0].blockType=type;
      chain.type=headType;
      try{reflowChainsForSize(nextChains);ensureStructureSize(nextChains,'类型修改后结构');}
      catch(e){toast(e.message,'err');const sel=document.getElementById('infoBlockType');if(sel)sel.value=app.chains[ci]?.blocks[bi]?.blockType||'chain';return;}
      saveCamera();
      app.chains=nextChains;
      pushHistory();
      refreshChainsUI();
      setTimeout(reselectCurrent,20);
      toast(type==='command'?'已切换为脉冲命令方块':'已切换为重复命令方块','ok');
      logInfo(`链 ${ci+1} 的链头改为 ${TYPE_LABEL[type]||type}`,'编辑命令方块类型');
      return;
    }
    const prefix=chain.blocks.slice(0,bi);
    const suffix=chain.blocks.slice(bi);
    suffix[0].blockType=type;
    chain.blocks=prefix;
    chain.type=detectChainType(prefix);
    const newChain={type:headType,blocks:suffix};
    nextChains.splice(ci+1,0,newChain);
    try{reflowChainsForSize(nextChains);ensureStructureSize(nextChains,'拆链后结构');}
    catch(e){toast(e.message,'err');const sel=document.getElementById('infoBlockType');if(sel)sel.value=app.chains[ci]?.blocks[bi]?.blockType||'chain';return;}
    saveCamera();
    app.chains=nextChains;
    app.singleChain=app.chains.length===1;
    app.selectedChain=ci+1;
    app.selectedBlock=0;
    pushHistory();
    refreshChainsUI();
    if(app.mode==='chain')applyChainCamera();
    toast(type==='command'?'已拆分为新脉冲链':'已拆分为新循环链','ok');
    logOk(`链 ${ci+1} 在方块 ${bi} 处拆分为两条链`,'编辑命令方块类型');
    return;
  }
  current.blockType='chain';
  try{reflowChainsForSize(nextChains);ensureStructureSize(nextChains,'类型修改后结构');}
  catch(e){toast(e.message,'err');const sel=document.getElementById('infoBlockType');if(sel)sel.value=app.chains[ci]?.blocks[bi]?.blockType||'chain';return;}
  saveCamera();
  app.chains=nextChains;
  pushHistory();
  refreshChainsUI();
  setTimeout(reselectCurrent,20);
  toast('已切换为链式命令方块','ok');
  logInfo(`链 ${ci+1} / 方块 ${bi} 改为链式命令方块`,'编辑命令方块类型');
}

function commitInspectorText(kind,value){
  const ci=app.selectedChain,bi=app.selectedBlock;
  if(ci<0||bi<0)return;
  const current=app.chains[ci]?.blocks?.[bi];if(!current)return;
  const v=String(value??'');
  if(kind==='cmd'){
    if(current.cmd===v)return;
    const nextChains=cloneChains(app.chains);
    nextChains[ci].blocks[bi].cmd=v;
    try{
      reflowChainsForSize(nextChains);
      ensureStructureSize(nextChains,'命令修改后结构');
    }catch(e){
      const input=document.getElementById('infoCmd');if(input)input.value=current.cmd||'';
      toast(`命令未应用：${e.message}`,'err');return;
    }
    const beforeType=app.chains[ci]?.type;
    app.chains=nextChains;
    app.selectedChain=ci;app.selectedBlock=bi;
    pushHistory();
    refreshChainsUI();
    setTimeout(reselectCurrent,20);
    if(app.chains[ci]?.type==='snake'&&beforeType!=='snake')toast('已识别断链头，自动切换为断链布局','ok');
    else if(beforeType==='snake'&&app.chains[ci]?.type!=='snake')toast('断链头格式已解除，恢复普通链布局','ok');
  }else{
    if((current.note||'')===v)return;
    current.note=v;
    pushHistory();
    logInfo(`修改链 ${ci+1} / 方块 ${bi} 的注释`,'编辑命令方块');
  }
  if(kind==='cmd')logInfo(`修改链 ${ci+1} / 方块 ${bi} 的命令：${v.slice(0,120)}`,'编辑命令方块');
  toast(kind==='cmd'?`已确认修改链 ${ci+1} / 方块 ${bi} 的命令`:`已确认修改链 ${ci+1} / 方块 ${bi} 的注释`,'ok');
}

function updateStats(){
  const total=countPhysicalBlocks(app.chains);
  const fileEl=document.getElementById('tbarFile');
  const cmdEl=document.getElementById('tbarCommands');
  const chainEl=document.getElementById('tbarChains');
  if(fileEl)fileEl.textContent=app.fileName&&app.fileName!=='structure'?app.fileName:'未加载结构';
  if(cmdEl)cmdEl.textContent=String(total);
  if(chainEl)chainEl.textContent=String(app.chains.length);
}

function autosaveRootKey(){return app.autosaveKey+'.root';}

function autosaveNBTReplacer(key,value){
  if(typeof value==='bigint')return{[AUTOSAVE_NBT_TYPE]:'BigInt',value:value.toString()};
  if(value instanceof Uint8Array)return{[AUTOSAVE_NBT_TYPE]:'Uint8Array',value:Array.from(value)};
  return value;
}

function autosaveNBTReviver(key,value){
  if(!value||typeof value!=='object'||!(AUTOSAVE_NBT_TYPE in value))return value;
  if(value[AUTOSAVE_NBT_TYPE]==='BigInt')return BigInt(value.value);
  if(value[AUTOSAVE_NBT_TYPE]==='Uint8Array'&&Array.isArray(value.value))return Uint8Array.from(value.value);
  return value;
}

function writeAutosaveNow(){
  if(!app.chains.length){clearAutosave();return true;}
  const base={fileName:app.fileName,chains:snapshotChains(app.chains),theme:app.theme,updatedAt:Date.now(),originalSize:app.originalSize,sourceOrigin:app.sourceOrigin,hasOriginalRoot:false};
  try{
    if(app.originalRoot){
      let rootText=storageGet(autosaveRootKey());
      if(rootText===null){
        rootText=JSON.stringify(app.originalRoot,autosaveNBTReplacer);
        if(!storageSet(autosaveRootKey(),rootText))throw new Error('无法保存原始 NBT 数据');
      }
      base.hasOriginalRoot=rootText!==null;
    }
    if(!storageSet(app.autosaveKey,JSON.stringify(base)))throw new Error('无法保存命令链快照');
    return true;
  }catch(e){
    // Free a possibly oversized root payload, then try to preserve the editable chains.
    storageRemove(autosaveRootKey());
    base.hasOriginalRoot=false;
    if(!storageSet(app.autosaveKey,JSON.stringify(base))){
      logWarn('自动保存失败：浏览器存储不可用或空间不足','自动保存');
      toast('自动保存失败：浏览器存储不可用或空间不足','warn',6000);
      return false;
    }
    if(app.originalRoot){
      logWarn('自动保存空间不足：已保留命令链，但未能保留原始 NBT 元数据','自动保存');
      toast('自动保存空间不足：命令链已保存，原始 NBT 元数据未保存','warn',6000);
    }
    return true;
  }
}

function scheduleAutosave(){
  clearTimeout(app.autosaveTimer);
  app.autosaveTimer=setTimeout(()=>{
    app.autosaveTimer=null;
    writeAutosaveNow();
  },250);
}

function flushAutosave(){
  if(app.autosaveTimer===null)return;
  clearTimeout(app.autosaveTimer);
  app.autosaveTimer=null;
  writeAutosaveNow();
}

function clearAutosave(){
  clearTimeout(app.autosaveTimer);app.autosaveTimer=null;
  storageRemove(app.autosaveKey);storageRemove(autosaveRootKey());
  const bar=document.getElementById('resumeBar');if(bar)bar.hidden=true;
}

function syncSavedState(){app.saved=app.historyIndex<0||app.historyIndex===app.savedHistoryIndex;}

async function restoreAutosave(){
  setCurrentAction('恢复自动保存');
  logInfo('开始恢复上次编辑内容','恢复自动保存');
  try{
    const raw=storageGet(app.autosaveKey);
    if(!raw){
      clearAutosave();
      toast('没有可恢复的自动保存内容','warn');
      return false;
    }
    const data=JSON.parse(raw,autosaveNBTReviver);
    if(!Array.isArray(data.chains)||!data.chains.length){
      clearAutosave();
      toast('自动保存中没有可恢复的命令链，已清除过期恢复入口','warn');
      return false;
    }
    // Validate into a temporary model before mutating application state.
    const restoredChains=data.chains.map((chain,ci)=>{
      if(!chain||typeof chain!=='object'||!Array.isArray(chain.blocks))
        throw new Error(`自动保存中的第 ${ci+1} 条链格式无效`);
      const blocks=chain.blocks.map((b,bi)=>{
        if(!b||typeof b!=='object')throw new Error(`第 ${ci+1} 条链的第 ${bi+1} 个节点格式无效`);
        if(!Number.isInteger(b.x)||!Number.isInteger(b.y)||!Number.isInteger(b.z))
          throw new Error(`第 ${ci+1} 条链的第 ${bi+1} 个节点坐标必须为整数`);
        const x=b.x,y=b.y,z=b.z;
        const blockType=['command','repeating','chain'].includes(b.blockType)?b.blockType:
          (['command','repeating','chain'].includes(b.type)?b.type:'chain');
        const facing=Number(b.facing);
        // Whitelist the persisted model fields. Unknown legacy fields should not
        // silently leak into the live editor state after a restore.
        return{x,y,z,cmd:String(b.cmd??''),cond:b.cond?1:0,auto:b.auto!==0?1:0,
          facing:Number.isInteger(facing)&&facing>=0&&facing<=5?facing:2,
          blockType,isAuxiliary:!!b.isAuxiliary,isBrokenNormalized:!!b.isBrokenNormalized,isAirPlaceholder:!!b.isAirPlaceholder,brokenWrongFacing:!!b.brokenWrongFacing,selfClosedCycle:!!b.selfClosedCycle,marked:!!b.marked,note:String(b.note??'')};
      });
      if(blocks.length===0)throw new Error(`自动保存中的第 ${ci+1} 条链没有命令方块`);
      const type=['impulse','repeat','snake'].includes(chain.type)?chain.type:
        (blocks[0].blockType==='command'?'impulse':'repeat');
      // Chain metadata is also whitelisted to discard stale schema fields.
      return{uid:typeof chain.uid==='string'?chain.uid:'',type,blocks,selfClosed:!!chain.selfClosed,preservePhysicalType:!!chain.preservePhysicalType,
        selfClosedCycleKeys:Array.isArray(chain.selfClosedCycleKeys)?chain.selfClosedCycleKeys.filter(k=>typeof k==='string').slice():[]};
    });
    app.fileName=data.fileName||'恢复的结构';
    app.chains=restoredChains;
    app.theme=data.theme==='dark'?'dark':'light';
    app.originalRoot=null;
    if(data.hasOriginalRoot){
      const rootText=storageGet(autosaveRootKey());
      if(rootText){try{app.originalRoot=JSON.parse(rootText,autosaveNBTReviver);}catch(e){logWarn('原始 NBT 恢复失败，将仅恢复命令链','恢复自动保存');}}
      else logWarn('自动保存引用的原始 NBT 数据不存在，将仅恢复命令链','恢复自动保存');
    }else if(data.originalRoot){
      // Backward compatibility with older autosaves using an inline root field.
      app.originalRoot=data.originalRoot;
    }
    app.originalSize=data.originalSize||null;
    app.sourceOrigin=data.sourceOrigin||[0,0,0];
    app.singleChain=app.chains.length===1;
    app.mode=app.singleChain?'chain':'overview';
    app.selectedChain=app.singleChain?0:-1;
    app.selectedBlock=-1;
    app.history=[snapshotChains(app.chains)];
    app.historyIndex=0;
    app.savedHistoryIndex=-1;
    app.saved=false;
    setTheme(app.theme);
    document.getElementById('uploadView').classList.remove('on');
    document.getElementById('editorView').classList.add('on');
    hideInfo();
    if(!isPreviewReady()){
      await switchToEditor();
    }else{
      renderAllBlocks();
      updateStats();
      updateHistoryBtns();
    }
    const resumeBar=document.getElementById('resumeBar');
    if(resumeBar)resumeBar.hidden=true;
    scheduleAutosave();
    setTimeout(()=>setViewPreset('top'),30);
    toast('已恢复上次编辑内容','ok');
    logOk(`恢复完成：${app.chains.length} 条链，共 ${app.chains.reduce((n,c)=>n+c.blocks.filter(b=>!isAirPlaceholderBlock(b)).length,0)} 个命令方块`,'恢复自动保存');
    return true;
  }catch(e){
    logError(e?.stack||e?.message||String(e),'恢复自动保存');
    toast('恢复失败：'+(e?.message||String(e)),'err');
    return false;
  }finally{
    setCurrentAction('空闲');
  }
}

function pushHistory(){
  const s=snapshotChains(app.chains);
  if(app.historyIndex>=0&&app.history[app.historyIndex]&&
     JSON.stringify(app.history[app.historyIndex])===JSON.stringify(s))return;
  if(app.savedHistoryIndex>app.historyIndex)app.savedHistoryIndex=-1;
  app.history=app.history.slice(0,app.historyIndex+1);
  app.history.push(s);
  const totalBlocks=app.chains.reduce((n,c)=>n+(c.blocks?.length||0),0);
  const historyLimit=Math.max(12,Math.min(50,Math.floor(30000/Math.max(200,totalBlocks))));
  while(app.history.length>historyLimit){
    app.history.shift();
    if(app.savedHistoryIndex>=0)app.savedHistoryIndex--;
  }
  app.historyIndex=app.history.length-1;
  syncSavedState();
  updateHistoryBtns();
  scheduleAutosave();
}

function applySnap(s){app.chains=cloneChains(s);}

function updateHistoryBtns(){
  document.getElementById('undoBtn').disabled=app.historyIndex<=0;
  document.getElementById('redoBtn').disabled=app.historyIndex>=app.history.length-1;
}

function syncHistoryScreen(){
  const upload=document.getElementById('uploadView');
  const editor=document.getElementById('editorView');
  if(!upload||!editor)return;
  const empty=app.chains.length===0;
  // Keep the editor visible for an empty state when redo is available; otherwise
  // switching to upload view would hide the only redo control and strand history.
  const canUndo=app.historyIndex>0;
  const canRedo=app.historyIndex>=0&&app.historyIndex<app.history.length-1;
  const showUpload=empty&&!canUndo&&!canRedo;
  upload.classList.toggle('on',showUpload);
  editor.classList.toggle('on',!showUpload);
  if(empty){app.mode='overview';app.singleChain=false;app.selectedChain=-1;app.selectedBlock=-1;}
  else if(app.chains.length===1){app.singleChain=true;app.mode='chain';app.selectedChain=0;app.selectedBlock=-1;}
  else{app.singleChain=false;if(app.selectedChain<0||app.selectedChain>=app.chains.length)app.selectedChain=0;}
  updateChainBar();
}

function undo(){
  if(app.historyIndex<=0)return;
  const before=app.chains.length;
  app.historyIndex--;
  applySnap(app.history[app.historyIndex]);
  
  if(app.chains.length===0)app.selectedChain=-1;
  else if(app.selectedChain>=app.chains.length)app.selectedChain=app.chains.length-1;
  app.singleChain=(app.chains.length===1);
  if(app.singleChain&&app.chains.length===1){
    app.mode='chain';app.selectedChain=0;
    document.getElementById('exitChainBtn').style.display='none';
  }else if(app.chains.length>1&&app.singleChain){
    app.singleChain=false;
    if(app.mode==='chain')document.getElementById('exitChainBtn').style.display='flex';
  }
  app.camera=null;
  syncSavedState();
  syncHistoryScreen();
  updateHistoryBtns();
  renderAllBlocks();updateStats();deselect();window.renderWorkspaceSidebar?.();scheduleAutosave();
  const after = app.chains.length;
  const detail = before > after ? `恢复 ${before - after} 条链` : before < after ? `移除 ${after - before} 条链` : '链内容修改';
  logInfo(`撤销一步（${before} → ${after} 条链）`,'撤销');
  undoToast(`已撤销：${detail}`);
}

function redo(){
  if(app.historyIndex>=app.history.length-1)return;
  app.historyIndex++;
  applySnap(app.history[app.historyIndex]);
  if(app.chains.length===0)app.selectedChain=-1;
  else if(app.selectedChain>=app.chains.length)app.selectedChain=app.chains.length-1;
  app.singleChain=(app.chains.length===1);
  if(app.singleChain&&app.chains.length===1){
    app.mode='chain';app.selectedChain=0;
    document.getElementById('exitChainBtn').style.display='none';
  }else if(app.chains.length>1&&app.singleChain){
    app.singleChain=false;
    if(app.mode==='chain')document.getElementById('exitChainBtn').style.display='flex';
  }
  app.camera=null;
  syncSavedState();
  syncHistoryScreen();
  updateHistoryBtns();
  renderAllBlocks();updateStats();deselect();window.renderWorkspaceSidebar?.();scheduleAutosave();
  logInfo(`重做一步（当前 ${app.chains.length} 条链）`,'重做');
}

function duplicateChainAt(ci){
  if(ci<0||ci>=app.chains.length)return;
  const next=cloneChains(app.chains);
  const clone=next[ci].blocks.map(b=>({...b}));
  next.splice(ci+1,0,{name:next[ci].name?`${next[ci].name} 副本`:'',type:next[ci].type,selfClosed:!!next[ci].selfClosed,preservePhysicalType:!!next[ci].preservePhysicalType,selfClosedCycleKeys:Array.isArray(next[ci].selfClosedCycleKeys)?next[ci].selfClosedCycleKeys.slice():[],blocks:clone});
  try{reflowChainsForSize(next);ensureStructureSize(next,'复制链后结构');}catch(e){toast(e.message,'err');return;}
  saveCamera();app.chains=next;app.selectedChain=ci+1;app.selectedBlock=-1;app.mode=app.chains.length===1?'chain':'overview';app.singleChain=app.chains.length===1;pushHistory();refreshChainsUI();toast('已复制链','ok');
  logOk(`已复制链 ${ci+1} 为链 ${ci+2}`,'复制链');
}

async function loadMcstructure(file,buf){
  setCurrentAction('解析 mcstructure');
  const p=await parseMcstructure(buf);
  logInfo(`解析完成：发现 ${p.commands.length} 个命令方块，解析异常 ${p.parseWarnings||0} 个`);
  if(p.commands.length===0)throw new Error('未找到命令方块');
  app.fileName=file.name.replace(/\.mcstructure$/i,'')||'structure';
  app.originalRoot=cloneNBT(p.root);
  app.originalSize=[p.X,p.Y,p.Z];
  app.sourceOrigin=Array.isArray(p.origin)?p.origin.slice(0,3):[0,0,0];
  const context={blockMap:p.blockMap,X:p.X,Y:p.Y,Z:p.Z};
  app.chains=processCommands(p.commands,context,{warn:logWarn});
  if(context.repeatingSplits)logWarn(`检测到 ${context.repeatingSplits} 处第二个循环命令方块，已从该处起自动拆分为下一条链`,'读取命令链');
  if(app.chains.length===0)throw new Error('无法识别任何命令链');
  reflowChainsForSize(app.chains);
  ensureStructureSize(app.chains,'导入后结构');
  app.singleChain=(app.chains.length===1);
  if(app.singleChain){
    app.mode='chain';
    app.selectedChain=0;
  }else{
    app.mode='overview';
    app.selectedChain=-1;
  }
  app.selectedBlock=-1;
  app.camera=null;app.overviewCamera=null;app.forceView=true;
  app.history=[snapshotChains(app.chains)];app.historyIndex=0;app.savedHistoryIndex=0;
  app.selectedBlock=-1;
  syncSavedState();
  clearAutosave();
  updateStats();
  await switchToEditor();
  syncSavedState();
  // Save the imported starting point as well, so an interrupted first session can be resumed.
  scheduleAutosave();
  const tb=app.chains.reduce((s,c)=>s+c.blocks.filter(b=>!isAirPlaceholderBlock(b)).length,0);
  toast(`已加载 ${app.chains.length} 条链，共 ${tb} 个命令方块`,'ok');
}

async function switchToEditor(){
  setCurrentAction('初始化三维场景');
  logInfo('开始初始化三维场景','初始化三维场景');
  document.getElementById('uploadView').classList.remove('on');
  document.getElementById('editorView').classList.add('on');
  hideInfo();
  await new Promise(resolve=>setTimeout(resolve,0));
  try{
      await ensureThree();
      await preloadTextures();
      if(!isPreviewReady())initScene();
      else resizeRenderer();
      resizeRenderer();
      renderAllBlocks();
      updateStats();
      updateHistoryBtns();
      updateChainBar();
      if(!hasTextures())toast('未检测到 textures/ 文件夹，使用纯色显示','ok');
      logOk('三维场景初始化完成','初始化三维场景');
      setCurrentAction('空闲');
    }catch(e){
      logError(e?.stack||e?.message||String(e),'初始化三维场景');
      document.getElementById('loading').classList.add('hide');
      document.getElementById('uploadView').classList.add('on');
      document.getElementById('editorView').classList.remove('on');
      toast('3D 初始化失败：'+e.message,'err');
      throw e;
    }
}

document.getElementById('infoBlockType').addEventListener('change',e=>changeSelectedBlockType(e.target.value));

document.getElementById('infoCond').addEventListener('change',e=>{
  const ci=app.selectedChain,bi=app.selectedBlock;
  if(ci<0||bi<0)return;
  const c=app.chains[ci];if(!c)return;
  const b=c.blocks[bi];if(!b)return;
  const next=e.target.value==='1'?1:0;
  if(b.cond===next)return;
  b.cond=next;
  pushHistory();renderAllBlocks();updateStats();
  setTimeout(reselectCurrent,20);
  logInfo(`链 ${ci+1} / 方块 ${bi} 改为${next?'有条件':'无条件'}`,'编辑条件');
  toast(`已确认修改链 ${ci+1} / 方块 ${bi} 的条件`,'ok');
});
document.getElementById('infoAuto').addEventListener('change',e=>{
  const ci=app.selectedChain,bi=app.selectedBlock;
  if(ci<0||bi<0)return;
  const c=app.chains[ci];if(!c)return;
  const b=c.blocks[bi];if(!b)return;
  const next=e.target.value==='1'?1:0;
  if((b.auto!==0?1:0)===next)return;
  b.auto=next;
  pushHistory();renderAllBlocks();updateStats();
  setTimeout(reselectCurrent,20);
  logInfo(`链 ${ci+1} / 方块 ${bi} 改为${next?'保持开启':'红石触发'}`,'编辑执行方式');
  toast(`已确认修改链 ${ci+1} / 方块 ${bi} 的执行方式`,'ok');
});
document.getElementById('infoMark').onclick=()=>{
  const ci=app.selectedChain,bi=app.selectedBlock;
  if(ci<0||bi<0)return;
  const c=app.chains[ci];if(!c)return;
  const b=c.blocks[bi];if(!b)return;
  b.marked=!b.marked;
  pushHistory();renderAllBlocks();updateStats();
  setTimeout(reselectCurrent,20);
  toast(b.marked?'已标记':'已取消标记','ok');
  logInfo(`链 ${ci+1} / 方块 ${bi} ${b.marked?'已标记':'取消标记'}`,'编辑标记');
};
document.getElementById('infoInsAfter').onclick=()=>{
  setCurrentAction('后插命令方块');
  try{
    const ci=app.selectedChain,bi=app.selectedBlock;
    if(ci<0||bi<0)return;
    const c=app.chains[ci];if(!c)return;
    const nextChains=cloneChains(app.chains);
    nextChains[ci].blocks.splice(bi+1,0,{cmd:'/say new',cond:0,auto:1,facing:2,blockType:'chain',marked:false,note:''});
    reflowChainsForSize(nextChains);
    ensureStructureSize(nextChains,'插入后结构');
    app.chains=nextChains;
    pushHistory();
    app.selectedChain=ci;app.selectedBlock=bi+1;
    renderAllBlocks();updateStats();
    setTimeout(reselectCurrent,50);toast('已插入','ok');
    logOk(`链 ${ci+1} 方块 ${bi} 后插入一个新命令方块`,'后插命令方块');
  }catch(e){
    logError(e?.stack||e?.message||String(e),'后插命令方块');
    toast(e.message,'err');
  }finally{
    setCurrentAction('空闲');
  }
};


document.getElementById('infoDel').onclick=()=>{
  const ci=app.selectedChain,bi=app.selectedBlock;
  if(ci<0||bi<0)return;
  logInfo(`请求删除链 ${ci+1} / 方块 ${bi}`,'删除命令方块');
  const c=app.chains[ci];if(!c)return;
  let chainRemoved=false;
  const realBlockCount=c.blocks.filter(b=>!isAirPlaceholderBlock(b)).length;
  if(realBlockCount<=1){
    app.chains.splice(ci,1);
    chainRemoved=true;
    deselect();

    if(app.chains.length===0){
      app.singleChain=false;
      app.mode='overview';
      app.selectedChain=-1;
      app.selectedBlock=-1;
      app.camera=null;
      app.overviewCamera=null;
      document.getElementById('exitChainBtn').style.display='none';
      pushHistory();
      refreshChainsUI();
      // Do not hide the editor: the final deletion remains undoable with Ctrl+Z.
      toast('已删除最后一个命令方块（可使用 Ctrl+Z 撤销）','ok');
      return;
    }

    if(app.chains.length===1){
      app.singleChain=true;
      app.mode='chain';
      app.selectedChain=0;
      app.selectedBlock=-1;
      app.camera=null;
      app.overviewCamera=null;
      document.getElementById('exitChainBtn').style.display='none';
    }else{
      app.singleChain=false;
      app.mode='overview';
      app.selectedChain=-1;
      app.selectedBlock=-1;
      document.getElementById('exitChainBtn').style.display='none';
    }
  }else{
    c.blocks.splice(bi,1);
    reflowAllChains();
  }
  // Deleting the last block of a chain removes a whole chain. Reflow the remaining
  // chains just like deleteChainAt() so overview coordinates and export layout stay aligned.
  if(chainRemoved&&app.chains.length>0){
    reflowAllChains();
    app.singleChain=app.chains.length===1;
    app.mode=app.singleChain?'chain':'overview';
    app.selectedChain=app.singleChain?0:-1;
    app.selectedBlock=-1;
  }
  deselect();pushHistory();refreshChainsUI();
  if(chainRemoved&&app.chains.length>0){
    setTimeout(()=>setViewPreset('top'),30);
  }
  toast('已删除','ok');
  logOk(`已删除链 ${ci+1} / 方块 ${bi}${chainRemoved?'，该链已空并移除':''}`,'删除命令方块');
};

document.getElementById('infoClose').onclick=()=>deselect();

(function setupInspectorTextareas(){
  const cmdEl=document.getElementById('infoCmd');
  const noteEl=document.getElementById('infoNote');
  if(cmdEl){
    cmdEl.addEventListener('change',()=>commitInspectorText('cmd',cmdEl.value));
  }
  if(noteEl){
    noteEl.addEventListener('change',()=>commitInspectorText('note',noteEl.value));
  }
})();

window.focusChain = selectChainFromManager;
window.openChainAddModal = openChainAddModal;

export {
  updateChainBar, openChainAddModal, closeChainAddModal,
  appendImportedChains, importChainFromMcstructure, addChainOfType,
  reorderChains, deleteChainAt, updateStats,
  scheduleAutosave, flushAutosave, clearAutosave, syncSavedState,
  restoreAutosave, pushHistory, updateHistoryBtns, syncHistoryScreen, undo, redo,
  duplicateChainAt, loadMcstructure, switchToEditor
};
