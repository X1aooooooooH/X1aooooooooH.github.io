

let project=null,selected=null,threeLib=null,scene=null,camera=null,renderer=null,controls=null,raycaster=null,pickTargets=[],solidMaterial=null,textureCache={},textureClones=new Set(),commandMaterialCache=new Map(),textureLoader=null,outline=null,canvas=null,saveTimer=0,toastTimer=0,pendingInsert=null,dragOrigin=null,cameraMoveKeys=new Set(),lastCameraMoveAt=0,specialGeometries=new Set(),specialMaterialCache=new Map(),specialHitboxGeometry=null,specialHitboxMaterial=null,blockPositionSet=new Set(),blockLookupByLayer=new Map(),blockCountByLayer=new Map(),blockArrayIndex=new Map(),blockListByLayer=new Map(),blockLayerArrayIndex=new Map(),blocksByLayerChunk=new Map(),blockChunkArrayIndex=new Map(),commandBlockCount=0;
let bakedGroup=null,bakedAtlas=null,bakedAtlasPromise=null,blockflowAtlasMap=null,blockflowAtlasMapPromise=null,bakeBuildSequence=0;
let extractedVoxelModels=null,extractedVoxelModelsPromise=null,extractedVoxelAtlas=null,extractedVoxelMaterials=null,extractedVoxelGeometryCache=new Map();
let snapshotWorker=null,snapshotWorkerReady=false,snapshotSeq=0,snapshotPending=new Map(),snapshotLoadPending=new Map(),snapshotWorkerProject=null,snapshotBasePromise=null;let snapshotDirtyLayers=new Set();
let blockLayerBounds=new Map(),highlightOverlay=null,highlightFillOverlay=null,highlightedBlockKeys=new Set(),sourceLightGroup=null,hemisphereLight=null,sunLight=null,fillLight=null,lightSourceCache=new Map();
let renderRaf=0,renderingFrame=false,rebuildTimer=0,rebuildRunning=false,rebuildQueuedLayers=new Set(),rebuildQueuedChunks=new Map(),rebuildQueuedFull=false;
                                                                                
                                                                         
                                                                            
let editPreviewGroups=new Map();
let searchIndex=[],searchTimer=0,searchEntryByBlock=new Map(),searchIndexPosition=new Map();
let undoHistory=[],undoHistoryBytes=0,historyGroupTimer=0,historyGroupKey='',historyGroupActive=false,restoringHistory=false;
let rebuildWaiters=[],modelLoadingActive=false,batchReplacePreview=null;
const lightSettings={emitters:true,ambient:.95,sun:1.15,fill:.35};
const FACE_NORMALS=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const FACE_RIGHT=[[0,0,-1],[0,0,1],[1,0,0],[1,0,0],[1,0,0],[-1,0,0]];
const FACE_UP=[[0,1,0],[0,1,0],[0,0,-1],[0,0,1],[0,1,0],[0,1,0]];
const metadata={};let lastBlockId='minecraft:stone';
const DB_NAME='BlockFlowStructureEditor',DB_VERSION=1,DB_STORE='sessions';
function toast(message,type=''){const el=document.getElementById('toast');el.textContent=message;el.className='toast on'+(type?' '+type:'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('on'),3600);}
function setStatus(text){document.getElementById('stats').textContent=text;if(modelLoadingActive){const detail=document.getElementById('loadingDetail');if(detail)detail.textContent=String(text);}}
function setModelLoadingProgress(percent,detail){if(!modelLoadingActive)return;const value=Math.max(0,Math.min(100,Number(percent)||0));const bar=document.getElementById('loadingProgressBar'),label=document.getElementById('loadingPercent');if(bar)bar.style.width=value.toFixed(1)+'%';if(label)label.textContent=Math.round(value)+'%';if(detail!==undefined){const el=document.getElementById('loadingDetail');if(el)el.textContent=String(detail);}}
function showModelLoading(title='正在更新模型',detail='正在构建 3D 模型…',percent=0){modelLoadingActive=true;updateUndoButton();const box=document.getElementById('loading');if(!box)return;const h=document.getElementById('loadingTitle'),d=document.getElementById('loadingDetail');if(h)h.textContent=title;if(d)d.textContent=detail;box.classList.remove('hide');setModelLoadingProgress(percent,detail);}
function hideModelLoading(){modelLoadingActive=false;document.getElementById('loading')?.classList.add('hide');updateUndoButton();}
function waitForSceneRebuild(){return new Promise((resolve,reject)=>rebuildWaiters.push({resolve,reject}));}
function settleSceneRebuild(error=null){const pending=rebuildWaiters.splice(0);for(const item of pending){if(error)item.reject(error);else item.resolve();}}
function closeHistoryGroup(){clearTimeout(historyGroupTimer);historyGroupTimer=0;historyGroupKey='';historyGroupActive=false;}
function resetUndoHistory(){closeHistoryGroup();undoHistory.length=0;undoHistoryBytes=0;updateUndoButton();}
function updateUndoButton(){const button=document.getElementById('historyUndoBtn');if(button)button.disabled=!undoHistory.length||modelLoadingActive||restoringHistory;}
function captureUndoSnapshotRaw(label='编辑'){
  if(!project||restoringHistory)return false;
  try{
    const raw=window.BFSECore.serializeStructure(project);const bytes=raw instanceof Uint8Array?raw.slice():new Uint8Array(raw).slice();
    const size=bytes.byteLength;if(size>64*1024*1024){toast('当前结构超过 64 MiB，无法创建回滚快照','warn',5000);return false;}
    const entry={label,bytes,size,filename:project.filename||'structure.mcstructure',meta:window.BFSECore.cloneNBT(metadata),lastBlockId,selection:selected?{x:selected.x,y:selected.y,z:selected.z,layer:selected.layer}:null,createdAt:Date.now()};
    undoHistory.push(entry);undoHistoryBytes+=size;
    while(undoHistory.length>12||undoHistoryBytes>64*1024*1024){const removed=undoHistory.shift();undoHistoryBytes-=removed.size;}
    updateUndoButton();return true;
  }catch(error){console.warn('Undo snapshot failed:',error);toast('无法建立回滚点：'+error.message,'err');return false;}
}
function captureUndoSnapshot(label='编辑'){closeHistoryGroup();return captureUndoSnapshotRaw(label);}
function beginUndoGroup(label,key){
  if(!project||restoringHistory)return;
  if(historyGroupActive&&historyGroupKey===key){clearTimeout(historyGroupTimer);historyGroupTimer=setTimeout(closeHistoryGroup,900);return;}
  closeHistoryGroup();captureUndoSnapshotRaw(label);historyGroupActive=true;historyGroupKey=key;historyGroupTimer=setTimeout(closeHistoryGroup,900);
}
async function undoLastEdit(){
  closeHistoryGroup();if(!undoHistory.length)return;
  const entry=undoHistory.pop();undoHistoryBytes-=entry.size;updateUndoButton();restoringHistory=true;
  try{
    showModelLoading('正在回滚编辑',`恢复：${entry.label}`,8);clearSceneObjects();
    const buffer=entry.bytes.buffer.slice(entry.bytes.byteOffset,entry.bytes.byteOffset+entry.bytes.byteLength);
    const restored=window.BFSECore.parseStructure(buffer);restored.filename=entry.filename;restored.cameraSaved=false;project=restored;
    invalidateSnapshotBase();applyMeta(entry.meta||{});lastBlockId=entry.lastBlockId||'minecraft:stone';document.getElementById('newBlockIdInput').value=lastBlockId;rebuildSearchIndex();updateFileUI();
    const pending=waitForSceneRebuild();buildScene(true);setModelLoadingProgress(52,'正在恢复方块模型…');await pending;
    if(entry.selection){const b=project.blocks.find(x=>x.x===entry.selection.x&&x.y===entry.selection.y&&x.z===entry.selection.z&&x.layer===entry.selection.layer);selectBlock(b||null);}else selectBlock(null);
    hideModelLoading();saveSnapshotDebounced();toast(`已回滚：${entry.label}`,'ok');
  }catch(error){undoHistory.push(entry);undoHistoryBytes+=entry.size;hideModelLoading();toast('回滚失败：'+error.message,'err');console.error(error);}
  finally{restoringHistory=false;updateUndoButton();}
}
function openDatabase(){return new Promise((resolve,reject)=>{if(!('indexedDB'in window)){reject(new Error('浏览器不支持 IndexedDB'));return;}const request=indexedDB.open(DB_NAME,DB_VERSION);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(DB_STORE))db.createObjectStore(DB_STORE);};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('打开本地存储失败'));});}
async function dbGet(){const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readonly'),r=tx.objectStore(DB_STORE).get('current');r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});}
async function dbPut(value){const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(value,'current');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error||new Error('保存失败'));};tx.onabort=()=>{db.close();reject(tx.error||new Error('保存失败'));};});}
function metaKey(b){return`${b.layer}|${b.x},${b.y},${b.z}`;}
function applyMeta(saved){for(const key of Object.keys(metadata))delete metadata[key];highlightedBlockKeys.clear();if(saved&&typeof saved==='object')for(const [k,v] of Object.entries(saved)){metadata[k]={highlight:!!v.highlight,note:String(v.note||'')};if(v?.highlight)highlightedBlockKeys.add(k);}}
function saveSnapshotDebounced(){if(!project)return;clearTimeout(saveTimer);document.getElementById('stats').textContent='正在保存…';saveTimer=setTimeout(()=>saveSnapshot(),1100);}
let snapshotInitPromise=null;
function ensureSnapshotWorker(){
  if(snapshotWorkerReady&&snapshotWorker)return Promise.resolve();
  if(!snapshotInitPromise){snapshotInitPromise=initSnapshotWorker().catch(error=>{snapshotInitPromise=null;try{snapshotWorker?.terminate();}catch{}snapshotWorker=null;throw error;});}
  return snapshotInitPromise;
}
function initSnapshotWorker(){
  return new Promise((resolve,reject)=>{
    try{
      snapshotWorker=BlockFlowWorkers.create('snapshot');
      const timer=setTimeout(()=>reject(new Error('NBT 保存 Worker 初始化超时')),15000);
      snapshotWorker.onmessage=e=>{
        const d=e.data||{};
        if(d.type==='ready'){snapshotWorkerReady=true;clearTimeout(timer);resolve();return;}
        if(d.type==='loaded'){const pending=snapshotLoadPending.get(d.seq);if(pending){snapshotLoadPending.delete(d.seq);pending.resolve();}return;}
        if(d.type==='error'){
          const loading=snapshotLoadPending.get(d.seq);
          if(loading){snapshotLoadPending.delete(d.seq);loading.reject(new Error(d.message||'后台结构缓存加载失败'));return;}
        }
        const pending=snapshotPending.get(d.seq);if(!pending)return;
        snapshotPending.delete(d.seq);
        if(d.type==='error')pending.reject(new Error(d.message||'后台序列化失败'));
        else pending.resolve(new Uint8Array(d.bytes));
      };
      snapshotWorker.onerror=e=>{
        const error=new Error(e.message||'NBT 保存 Worker 加载失败');
        clearTimeout(timer);snapshotWorkerReady=false;
        for(const pending of snapshotLoadPending.values())pending.reject(error);
        snapshotLoadPending.clear();
        for(const pending of snapshotPending.values())pending.reject(error);
        snapshotPending.clear();
        if(!snapshotWorkerReady)reject(error);
      };
    }catch(error){reject(error);}
  });
}
function cloneRootTemplate(node,key=''){
  if(!node||typeof node!=='object')return node;
  if(key==='block_indices'&&node.value&&Array.isArray(node.value.items))return{...node,value:{...node.value,items:[]}};
  if(key==='block_indices'&&ArrayBuffer.isView(node.value))return{...node,value:new node.value.constructor(0)};
  if(key==='block_palette'&&node.value&&Array.isArray(node.value.items))return{...node,value:{...node.value,items:[]}};
  if(key==='block_position_data'&&node.value&&typeof node.value==='object')return{...node,value:{}};
  if(ArrayBuffer.isView(node))return node.slice();
  if(Array.isArray(node))return node.map(value=>cloneRootTemplate(value));
  const out={};for(const [childKey,value] of Object.entries(node))out[childKey]=cloneRootTemplate(value,childKey);return out;
}
function invalidateSnapshotBase(){snapshotWorkerProject=null;snapshotBasePromise=null;snapshotDirtyLayers.clear();}
function markSnapshotLayerDirty(layer){if(Number.isInteger(layer))snapshotDirtyLayers.add(layer);}
function copyLayerForSnapshotWorker(layer){
                                                                         
                                                                           
                                                                
  return Int32Array.from(layer || []);
}
async function ensureSnapshotProject(){
  if(!snapshotWorkerReady||!snapshotWorker)return;
  if(snapshotWorkerProject===project)return;
  if(snapshotBasePromise)return snapshotBasePromise;
  const target=project,seq=++snapshotSeq;
  const rootTemplate=cloneRootTemplate(target.root);
  const layers=target.layers.map(copyLayerForSnapshotWorker);
  const transfers=layers.map(layer=>layer.buffer);
  snapshotBasePromise=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{snapshotLoadPending.delete(seq);snapshotBasePromise=null;reject(new Error('后台结构缓存初始化超时'));},120000);
    snapshotLoadPending.set(seq,{
      resolve:()=>{clearTimeout(timer);snapshotWorkerProject=target;snapshotDirtyLayers.clear();snapshotBasePromise=null;resolve();},
      reject:error=>{clearTimeout(timer);snapshotBasePromise=null;reject(error);}
    });
    try{
      snapshotWorker.postMessage({type:'load-project',seq,state:{rootTemplate,X:target.X,Y:target.Y,Z:target.Z,layers}},transfers);
    }catch(error){
      clearTimeout(timer);snapshotLoadPending.delete(seq);snapshotBasePromise=null;reject(error);
    }
  });
  return snapshotBasePromise;
}
async function serializeProjectAsync(mode='full',layerIndex=null){
  if(!project)return Promise.reject(new Error('没有打开结构'));
  try{await ensureSnapshotWorker();}catch(error){console.warn('后台保存 Worker 不可用，回退到主线程序列化：',error);}
  if(!snapshotWorkerReady||!snapshotWorker){try{return serializeStructure(project);}catch(error){throw error;}}
  await ensureSnapshotProject();
  const seq=++snapshotSeq;
  const dirtyLayers=[...snapshotDirtyLayers].filter(i=>i>=0&&i<project.layers.length).map(layer=>({layer,values:copyLayerForSnapshotWorker(project.layers[layer])}));
  const transfers=dirtyLayers.map(item=>item.values.buffer);
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{snapshotPending.delete(seq);for(const item of dirtyLayers)snapshotDirtyLayers.add(item.layer);reject(new Error('后台序列化超时'));},120000);
    snapshotPending.set(seq,{
      dirtyLayerIds:dirtyLayers.map(item=>item.layer),
      resolve:value=>{clearTimeout(timer);resolve(value);},
      reject:error=>{clearTimeout(timer);for(const item of dirtyLayers)snapshotDirtyLayers.add(item.layer);reject(error);}
    });
    try{
      snapshotWorker.postMessage({type:'serialize',seq,mode,layerIndex,X:project.X,Y:project.Y,Z:project.Z,palette:project.palette,bpd:project.bpd,dirtyLayers},transfers);
      for(const item of dirtyLayers)snapshotDirtyLayers.delete(item.layer);
    }catch(error){
      clearTimeout(timer);snapshotPending.delete(seq);
      for(const item of dirtyLayers)snapshotDirtyLayers.add(item.layer);
      reject(error);
    }
  });
}

async function saveSnapshot(){if(!project)return;const savedProject=project;try{const bytes=(snapshotWorkerReady&&snapshotWorker)?await serializeProjectAsync('full'):serializeStructure(savedProject);if(project!==savedProject)return;const blob=new Blob([bytes],{type:'application/octet-stream'});await dbPut({blob,filename:project.filename||'structure.mcstructure',meta:cloneNBT(metadata),lastBlockId,updatedAt:Date.now()});setStatus(`${project.blocks.length.toLocaleString()} 个方块 · 已自动保存`);}catch(error){setStatus('本地自动保存失败');console.error(error);toast('自动保存失败：'+error.message,'err');}}
function updateStats(){if(!project){setStatus('0 个方块');return;}setStatus(`${project.blocks.length.toLocaleString()} 个方块 · ${commandBlockCount.toLocaleString()} 个命令方块`);}
function idExistsInProject(id){return !!project?.palette?.some(n=>getTag(n,'name','')===id);}
function validBlockId(id){if(typeof id!=='string'||id!==id.trim()||!/^([a-z0-9_.-]+):([a-z0-9_./-]+)$/.test(id))return false;const namespace=id.split(':')[0];if(namespace==='minecraft')return vanillaIdSet.has(id)||idExistsInProject(id);return idExistsInProject(id);}
function blockIdChoices(){const set=new Set(vanillaIdSet);if(project)for(const node of project.palette){const name=getTag(node,'name','');if(name)set.add(name);}return [...set];}
function showSuggestions(input){const list=document.getElementById('idSuggestions');list.dataset.target=input.id;const rawValue=input.value.trim().toLowerCase();if(!rawValue){list.classList.remove('on');return;}let query=rawValue;if(!query.includes(':'))query='minecraft:'+query;const matches=blockIdChoices().map(id=>({id,score:fuzzyScore(query,id)})).filter(x=>x.score>=0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,12);if(!matches.length){list.classList.remove('on');return;}list.innerHTML=matches.map(x=>`<div class="suggestion" data-id="${escapeAttr(x.id)}">${escapeHtml(x.id)}<small>${idExistsInProject(x.id)?'当前结构中存在':'内置 ID'}</small></div>`).join('');list.classList.add('on');const rect=input.getBoundingClientRect();list.style.left='0';list.style.top=(rect.height+4)+'px';}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function escapeAttr(value){return escapeHtml(value);}
function makeColor(name,b){
  if(b.command)return 0xffffff;
  let h=0;for(let i=0;i<name.length;i++)h=(h*31+name.charCodeAt(i))|0;
  const hue=((h>>>0)%360)/360;const color=new threeLib.THREE.Color();color.setHSL(hue,.42,.58);return color;
}
function disposeCommandMaterialCache(){
  for(const mats of commandMaterialCache.values())for(const mat of mats)mat.dispose();
  commandMaterialCache.clear();
  for(const tex of textureClones)tex.dispose();
  textureClones.clear();
  for(const tex of Object.values(textureCache))tex?.dispose?.();
  textureCache={};
}
function clearSceneObjects(){
  bakeBuildSequence++;window.BlockFlowBaker?.cancelAll?.();
  rebuildQueuedLayers.clear();rebuildQueuedChunks.clear();rebuildQueuedFull=false;
  if(!scene)return;
  if(bakedGroup){scene.remove(bakedGroup);disposeLayerGroup(bakedGroup);bakedGroup=null;}
  for(const group of editPreviewGroups.values()){scene.remove(group);group.traverse(node=>{node.geometry?.dispose?.();});}editPreviewGroups.clear();
  for(const target of pickTargets)scene.remove(target.mesh);
  pickTargets=[];
  for(const geometry of specialGeometries)geometry.dispose();
  specialGeometries.clear();
  if(specialHitboxGeometry){specialHitboxGeometry.dispose();specialHitboxGeometry=null;}
  if(specialHitboxMaterial){specialHitboxMaterial.dispose();specialHitboxMaterial=null;}
  for(const material of specialMaterialCache.values())material.dispose();
  specialMaterialCache.clear();
  disposeCommandMaterialCache();
  if(solidMaterial){solidMaterial.dispose();solidMaterial=null;}
  if(outline){scene.remove(outline);outline.geometry.dispose();outline.material.dispose();outline=null;}
  if(highlightOverlay){scene.remove(highlightOverlay);highlightOverlay.geometry.dispose();highlightOverlay.material.dispose();highlightOverlay=null;}
  if(highlightFillOverlay){scene.remove(highlightFillOverlay);highlightFillOverlay.geometry.dispose();highlightFillOverlay.material.dispose();highlightFillOverlay=null;}
  highlightOverlaySignature='';
  if(sourceLightGroup)while(sourceLightGroup.children.length)sourceLightGroup.remove(sourceLightGroup.children[0]);
}
async function ensureBlockflowAtlasMap(){
  if(blockflowAtlasMap)return blockflowAtlasMap;
  if(!blockflowAtlasMapPromise){
    blockflowAtlasMapPromise=fetch('../assets/data/blockflow-atlas-map.json?v=2.12.1',{cache:'force-cache'}).then(response=>{
      if(!response.ok)throw new Error('方块图集索引加载失败：'+response.status);
      return response.json();
    }).then(data=>{blockflowAtlasMap=data;return data;}).catch(error=>{blockflowAtlasMapPromise=null;throw error;});
  }
  return blockflowAtlasMapPromise;
}
function ensureBlockAtlasLoaded(){
  if(bakedAtlasPromise)return bakedAtlasPromise;
  if(!textureLoader||!threeLib)return Promise.reject(new Error('纹理加载器尚未初始化'));
  const {THREE}=threeLib;
  bakedAtlasPromise=new Promise((resolve,reject)=>{
    const texture=textureLoader.load('../assets/textures/structure/block-atlas.png?v=2.12.1',loaded=>{
      requestSceneRender();resolve(loaded);
    },undefined,error=>{bakedAtlas=null;bakedAtlasPromise=null;reject(error||new Error('方块图集加载失败'));});
    bakedAtlas=texture;
    texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;
    texture.generateMipmaps=false;texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
  });
  return bakedAtlasPromise;
}
async function ensureExtractedVoxelModels(){
  if(extractedVoxelModels&&extractedVoxelMaterials)return extractedVoxelModels;
  if(!extractedVoxelModelsPromise){
    extractedVoxelModelsPromise=(async()=>{
      const response=await fetch('../assets/data/blockflow-special-models.json?v=2.12.1',{cache:'force-cache'});
      if(!response.ok)throw new Error('专用方块模型数据加载失败：'+response.status);
      const data=await response.json();
      if(data?.schema!=='BlockFlow.SpecialVoxelModels'||!data.models)throw new Error('专用方块模型数据格式无效');
      if(!textureLoader||!threeLib)throw new Error('专用模型纹理加载器尚未初始化');
      const texture=await new Promise((resolve,reject)=>textureLoader.load('../assets/textures/structure/blockflow-special-atlas.png?v=2.12.1',resolve,undefined,reject));
      const {THREE}=threeLib;
      texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
      extractedVoxelAtlas=texture;
      extractedVoxelMaterials={
        opaque:new THREE.MeshLambertMaterial({map:texture,color:0xffffff,vertexColors:true,side:THREE.DoubleSide,alphaTest:.015,transparent:false,depthWrite:true}),
        transparent:new THREE.MeshLambertMaterial({map:texture,color:0xffffff,vertexColors:true,side:THREE.DoubleSide,alphaTest:.015,transparent:true,opacity:1,depthWrite:false})
      };
      extractedVoxelModels=data;return data;
    })().catch(error=>{extractedVoxelModelsPromise=null;extractedVoxelModels=null;extractedVoxelMaterials=null;extractedVoxelAtlas=null;throw error;});
  }
  return extractedVoxelModelsPromise;
}
function getExtractedModelPartGeometry(part,cacheKey){
  const {THREE}=threeLib;if(!part||!part.vc||!part.ic)return null;
  let template=extractedVoxelGeometryCache.get(cacheKey);
  if(!template){
    template=new THREE.BufferGeometry();
    template.setAttribute('position',new THREE.Float32BufferAttribute(part.p,3));
    template.setAttribute('uv',new THREE.Float32BufferAttribute(part.u,2));
    template.setAttribute('color',new THREE.Float32BufferAttribute(part.c,3));
    template.setAttribute('normal',new THREE.Float32BufferAttribute(part.n,3));
    template.setIndex(part.i);template.computeBoundingBox();template.computeBoundingSphere();
    extractedVoxelGeometryCache.set(cacheKey,template);
  }
                                                                            
                                                                                    
  const geometry=new THREE.BufferGeometry();
  for(const [name,attribute] of Object.entries(template.attributes))geometry.setAttribute(name,attribute);
  geometry.setIndex(template.index);
  geometry.boundingBox=template.boundingBox?.clone?.()||null;
  geometry.boundingSphere=template.boundingSphere?.clone?.()||null;
  return geometry;
}
function addExtractedModelParts(group,key){
  const model=extractedVoxelModels?.models?.[key];if(!model)return false;
  let added=false;
  if(model.o){const geometry=getExtractedModelPartGeometry(model.o,`${key}:opaque`);if(geometry){addTrackedMesh(group,geometry,extractedVoxelMaterials.opaque);added=true;}}
  if(model.x){const geometry=getExtractedModelPartGeometry(model.x,`${key}:transparent`);if(geometry){addTrackedMesh(group,geometry,extractedVoxelMaterials.transparent);added=true;}}
  return added;
}
function modelExtractedFaceName(value,fallback='north'){
  if(typeof value==='number'||/^\d+$/.test(String(value??'')))return ({0:'down',1:'up',2:'north',3:'south',4:'west',5:'east'})[Number(value)]||fallback;
  const text=String(value??fallback).toLowerCase();
  return ['down','up','north','south','west','east'].includes(text)?text:fallback;
}
function modelExtractedWallYaw(normal){
                                                                         
                                                                               
                                                                
  return Math.atan2(normal[2],-normal[0]);
}
function modelExtractedDeviceDirection(block){
  const cardinal=modelState(block,'minecraft:cardinal_direction','cardinal_direction','facing');
  if(cardinal!==undefined){const value=String(cardinal).toLowerCase();if(['north','south','east','west'].includes(value))return value;}
  const face=modelState(block,'facing_direction','minecraft:facing_direction');
  if(face!==undefined){const name=modelExtractedFaceName(face,'south');if(['north','south','east','west'].includes(name))return name;}
  const legacy=modelNumber(modelState(block,'direction','weirdo_direction'),0);
  return (['south','west','north','east'])[Math.max(0,Math.min(3,legacy))]||'south';
}
function modelExtractedWoodName(name,kind){
  const suffixes=kind==='sign'?['_wall_hanging_sign','_hanging_sign','_wall_sign','_standing_sign','_sign']:['_button'];
  for(const suffix of suffixes)if(name.endsWith(suffix)){const wood=name.slice(0,-suffix.length);return wood||'oak';}
  return 'oak';
}
function modelExtractedSignKey(block){
  const name=blockRenderName(block),wood=modelExtractedWoodName(name,'sign'),placement=modelResolveSignPlacement(block);
  const face=modelExtractedFaceName(modelState(block,'facing_direction','minecraft:facing_direction','minecraft:cardinal_direction','cardinal_direction')??2);
  const attached=modelBool(modelState(block,'attached_bit'))?'attached':'free';
  if(placement.wallHanging)return `sign/${wood}/wall_hanging/${face}/${attached}`;
  if(placement.hanging)return `sign/${wood}/hanging/${attached}`;
  if(placement.wall)return `sign/${wood}/wall/${face}`;
  return `sign/${wood}/standing`;
}
function modelExtractedLeverKey(block){
  const directions=['down_east_west','east','west','south','north','up_north_south','up_east_west','down_north_south'];
  let direction=modelState(block,'lever_direction');
  if(direction===undefined)direction='up_north_south';
  if(typeof direction==='number'||/^\d+$/.test(String(direction)))direction=directions[Math.max(0,Math.min(7,Number(direction)))];
  direction=String(direction).toLowerCase();if(!directions.includes(direction))direction='up_north_south';
  return `lever/${direction}/${modelBool(modelState(block,'open_bit','powered_bit','lever_powered_bit'))?'on':'off'}`;
}
function modelExtractedButtonKey(block){
  const name=blockRenderName(block),face=modelExtractedFaceName(modelState(block,'facing_direction','minecraft:facing_direction','minecraft:cardinal_direction')??2);
  const pressed=modelBool(modelState(block,'button_pressed_bit','pressed_bit'))?'pressed':'released';
  const woodMatch=/^(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|bamboo|crimson|warped|pale_oak)_button$/.exec(name);
  if(!woodMatch)return `button/stone/${face}/${pressed}`;
  return `button/${woodMatch[1]}/${face}/${pressed}`;
}
function modelResolveTorchPlacement(block){
  const name=blockRenderName(block);
  const raw=modelState(block,'torch_facing_direction');
                                                                       
                                                                            
  const numericFaces={0:'unknown',1:'west',2:'east',3:'north',4:'south',5:'top'};
  let face=raw===undefined?'top':raw;
  if(typeof face==='number'||/^\d+$/.test(String(face)))face=numericFaces[Number(face)]||'unknown';
  face=String(face).toLowerCase();
  if(!['west','east','north','south','top'].includes(face))face='top';
  const wall=face!=='top';
  const isRedstone=name==='redstone_torch'||name==='unlit_redstone_torch'||name==='redstone_wall_torch';
  const rawLit=modelState(block,'lit');
  const unlit=name==='unlit_redstone_torch'||name.startsWith('unlit_redstone_')||modelBool(modelState(block,'unlit_bit'))||(rawLit!==undefined&&!modelBool(rawLit));
  return {face,wall,mountNormal:wall?directionNormal(face,[0,1,0]):[0,1,0],redstone:isRedstone,lit:!unlit,soul:name.includes('soul'),copper:name.includes('copper')};
}
function modelExtractedTorchKey(block){
  const placement=modelResolveTorchPlacement(block);
  if(placement.redstone){
    const state=placement.lit?'on':'off';
    return placement.wall?`redstone/wall_torch/${placement.face}/${state}`:`redstone/torch/${state}`;
  }
  if(placement.wall){
    if(placement.soul)return `torch/soul_wall/${placement.face}`;
    return `torch/wall/${placement.face}`;
  }
  if(placement.soul)return 'torch/soul';
  if(placement.copper)return 'torch/copper';
  return 'torch/normal';
}
function addExtractedSignText(group,block,placement){
  if(typeof readSignFaceData!=='function'||typeof createSignPixelTextGeometry!=='function')return;
  const wall=placement.wall,hanging=placement.hanging,wallHanging=placement.wallHanging;
  const boardW=wallHanging?.84:wall?.96:hanging?.84:.96;
  const boardH=wallHanging?.58:wall?.46:hanging?.58:.40;
  const centerY=wall&&!wallHanging?0:(hanging||wallHanging)?-.1875:.28125;
                                                                        
                                                                           
  const frontNormal=wall?[1,0,0]:[0,0,1];
  const frontPos=wall&&!wallHanging?[-.372,centerY,0]:wallHanging?[.127,centerY,0]:[0,centerY,.064];
  const backNormal=frontNormal.map(value=>-value);
  const backPos=wall&&!wallHanging?[-.503,centerY,0]:wallHanging?[-.127,centerY,0]:[0,centerY,-.064];
  const addFace=(face,position,normal,back=false)=>{
    const data=readSignFaceData(block,face);if(!data?.text)return;
    const geometry=createSignPixelTextGeometry(data.text,boardW*.86,boardH*.72,.0038);if(!geometry)return;
    const material=modelColorMat(data.color,{side:threeLib.THREE.DoubleSide,toneMapped:!data.glowing,depthWrite:true});
    const textGroup=new threeLib.THREE.Group();textGroup.userData.blockRef=block;textGroup.position.set(...position);
    textGroup.quaternion.setFromUnitVectors(new threeLib.THREE.Vector3(0,0,1),new threeLib.THREE.Vector3(...normal));
    if(back)textGroup.rotateY(Math.PI);
    group.add(textGroup);addTrackedMesh(textGroup,geometry,material);
  };
  addFace('front',frontPos,frontNormal,false);
  addFace('back',backPos,backNormal,true);
}
function buildExtractedSpecialBlockModel(group,block,kind){
  const name=blockRenderName(block),state=(...keys)=>modelState(block,...keys);
  let key=null;
  if(kind==='sign'){
    const placement=modelResolveSignPlacement(block);key=modelExtractedSignKey(block);
    if(placement.wall){
      const support=placement.supportNormal||[-placement.normal[0],-placement.normal[1],-placement.normal[2]];
      group.rotation.y=modelExtractedWallYaw(support);
                                                                          
                                                                                   
                                                                                 
      if(placement.wallHanging)group.position.add(new threeLib.THREE.Vector3(support[0]*.375,support[1]*.375,support[2]*.375));
    }else group.rotation.y=placement.yaw;
  }else if(kind==='lever'){
    key=modelExtractedLeverKey(block);
  }else if(kind==='button'){
    key=modelExtractedButtonKey(block);
  }else if(kind==='torch'){
    const placement=modelResolveTorchPlacement(block);key=modelExtractedTorchKey(block);
                                                                       
                                                                        
    if(placement.wall)group.rotation.y=modelExtractedWallYaw(placement.mountNormal);
  }else if(kind==='redstone_device'){
    const device=modelResolveRedstoneDeviceState(block),direction=modelExtractedDeviceDirection(block);
    const delay=Math.max(0,Math.min(3,device.delay||0));
    key=device.kind==='comparator'?`redstone/comparator/${direction}/${device.subtract?'subtract':'compare'}/${device.powered?'on':'off'}`:`redstone/repeater/${direction}/delay${delay}/${device.powered?'on':'off'}`;
    group.rotation.y=modelRedstoneDeviceYaw(block);
  }else if(kind==='tripwire_hook'){
    const face=modelExtractedFaceName(state('facing_direction','minecraft:facing_direction')??2);key=`redstone/tripwire_hook/${face}`;
    const normal=directionNormal(state('facing_direction','minecraft:facing_direction')??2,[0,0,-1]);group.rotation.y=modelExtractedWallYaw(normal);
  }else if(kind==='tripwire'){
    key='redstone/tripwire';
  }else return false;
  if(!addExtractedModelParts(group,key))return false;
  if(kind==='sign')addExtractedSignText(group,block,modelResolveSignPlacement(block));
  return true;
}

function getBlockAtlasBaseTexture(){
  if(!bakedAtlas&&textureLoader)ensureBlockAtlasLoaded().catch(error=>console.error('图集纹理加载失败：',error));
  return bakedAtlas;
}
function makeAtlasTexture(assetId,repeatY=1,offsetY=0){
  const rect=blockflowAtlasMap?.textures?.[assetId];
  const base=getBlockAtlasBaseTexture();
  if(!rect||!base)return null;
  const [x,y,w,h]=rect;const {width,height}=blockflowAtlasMap;
  const {THREE}=threeLib;const texture=base.clone();
  texture.wrapS=THREE.ClampToEdgeWrapping;texture.wrapT=THREE.ClampToEdgeWrapping;
  texture.repeat.set(Math.max(0,w-1)/width,Math.max(0,h-1)/height*repeatY);
  texture.offset.set((x+.5)/width,(height-y-h+.5)/height+Math.max(0,h-1)/height*offsetY);
  texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;
  texture.generateMipmaps=false;texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
  textureClones.add(texture);return texture;
}
function loadBlockTexture(assetId){
  if(textureCache[assetId])return textureCache[assetId];
  const texture=makeAtlasTexture(assetId);
  if(texture)textureCache[assetId]=texture;
  return texture;
}
function blockRenderName(b){return String(b?.name||'').replace(/^minecraft:/,'');}
function getBlockRenderDefinition(b){
  const short=blockRenderName(b);
  const renderName=short==='grass_block'?'grass':short;
  let def=BEDROCK_RENDER_DEFINITIONS[renderName]||null;
  const state=(key)=>{const node=b?.statesNode?.value?.[key];return node&&Object.prototype.hasOwnProperty.call(node,'value')?node.value:undefined;};
                                                               
  if(short==='furnace'&&(state('lit')===1||state('lit')===true)&&BEDROCK_RENDER_DEFINITIONS.lit_furnace)def=BEDROCK_RENDER_DEFINITIONS.lit_furnace;
  return def;
}
function blockVariantIndex(b,count){
  if(count<=1)return 0;
  let h=2166136261;
  const s=`${b?.name||''}|${b?.x||0},${b?.y||0},${b?.z||0}|${b?.lin||0}`;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
  return (h>>>0)%count;
}
function terrainCandidate(alias,b){
  if(!alias)return null;
  const list=TERRAIN_TEXTURE_MAP[alias];if(!list?.length)return null;
  const stateEntries=Object.entries(b?.statesNode?.value||{}).map(([key,node])=>[key,raw(node)]);
  const states=stateEntries.map(([,value])=>String(value).toLowerCase().replace(/^minecraft:/,''));
  const powered=stateEntries.some(([key,value])=>/(lit|powered|active|output_lit|button_pressed)/i.test(key)&& (value===1||value===true||value==='true'));
  if(list.some(candidate=>candidate.n.endsWith('_on'))&&list.some(candidate=>candidate.n.endsWith('_off'))){const wanted=list.find(candidate=>candidate.n.endsWith(powered?'_on':'_off'));if(wanted)return wanted;}
  for(const state of states){
    if(!state||state.length<3)continue;
    const exact=list.find(candidate=>candidate.n===state||candidate.n.endsWith('_'+state));
    if(exact)return exact;
    const partial=list.find(candidate=>candidate.n.includes(state));
    if(partial)return partial;
  }
  return list[blockVariantIndex(b,list.length)]||list[0]||null;
}
function getBlockFaceDescriptors(b){
  const def=getBlockRenderDefinition(b),textures=def?.textures;
  const faceNames=['east','west','up','down','south','north'];
  let aliases=[];
  if(b.command){
    const isRepeating=b.name==='minecraft:repeating_command_block';
    const isChain=b.name==='minecraft:chain_command_block';
    const front=isChain?'command_block_chain_front':isRepeating?'command_block_repeating_front':'command_block_front';
    const back=isChain?'command_block_chain_back':isRepeating?'command_block_repeating_back':'command_block_back';
    const side=isChain?'command_block_chain_side':isRepeating?'command_block_repeating_side':'command_block_side';
    const conditionalSide=isChain?'command_block_chain_conditional_side':isRepeating?'command_block_repeating_conditional_side':'command_block_conditional_side';
    const F=facingVector[Number.isInteger(b.facing)?b.facing:2]||[0,0,-1];
    for(const n of FACE_NORMALS){
      const dot=n[0]*F[0]+n[1]*F[1]+n[2]*F[2];
      if(dot>.5)aliases.push(front);
      else if(dot<-.5)aliases.push(back);
      else if(b.conditional)aliases.push(conditionalSide);
      else aliases.push(side);
    }
  }else if(typeof textures==='string'){
    aliases=Array(6).fill(textures);
  }else if(textures&&typeof textures==='object'){
    const fallback=textures.side||textures.all||textures.up||textures.down||textures.north||textures.south||textures.east||textures.west||null;
    aliases=faceNames.map(face=>textures[face]||((face==='east'||face==='west'||face==='south'||face==='north')?textures.side:null)||fallback);
  }else{
    aliases=Array(6).fill(null);
  }
  return aliases.map(alias=>{
    const candidate=terrainCandidate(alias,b);
    return candidate?{asset:candidate.a,tint:candidate.c||null,alias}:{asset:null,tint:null,alias:null};
  });
}
function blockRenderSignature(b){
  const descriptors=getBlockFaceDescriptors(b);
  return descriptors.map(d=>d.asset?`${d.asset}:${d.tint||''}`:`fallback:${blockRenderName(b)}`).join('|');
}
function parseTint(value){
  if(typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value))return 0xffffff;
  return Number.parseInt(value.slice(1),16);
}
function buildBlockMaterials(b){
  const {THREE}=threeLib,key=blockRenderSignature(b);
  if(commandMaterialCache.has(key))return commandMaterialCache.get(key);
  const descriptors=getBlockFaceDescriptors(b);
  const materials=descriptors.map(desc=>{
    if(!desc.asset){return new THREE.MeshBasicMaterial({color:makeColor(b.name,b),side:THREE.DoubleSide});}
    const map=loadBlockTexture(desc.asset);
    const alphaMode=BLOCK_TEXTURE_ALPHA[desc.asset]||'opaque';
    const short=blockRenderName(b);
    const blendOpacity=({glass:.34,stained_glass:.48,tinted_glass:.70,water:.58,flowing_water:.58,ice:.78,frosted_ice:.68,packed_ice:.78,blue_ice:.78})[short]||0;
    const useBlend=alphaMode==='blend'||blendOpacity>0;
    return new THREE.MeshBasicMaterial({
      map,color:parseTint(desc.tint),side:THREE.DoubleSide,
      transparent:useBlend,opacity:blendOpacity||1,alphaTest:useBlend?0:(alphaMode==='cutout'?.08:0),
      depthWrite:!useBlend
    });
  });
  commandMaterialCache.set(key,materials);return materials;
}
async function initThree(){
  const lib=window.BlockFlowThree;
  if(!lib?.THREE||!lib?.OrbitControls){const detail=`THREE=${!!lib?.THREE}, OrbitControls=${!!lib?.OrbitControls}`;throw new Error(`Three.js 引擎脚本未正确注册（${detail}）。请确认内嵌引擎代码完整；这与 WebGL 是否可用是两个不同问题。`); }
  threeLib=lib;const {THREE,OrbitControls}=lib;
  textureLoader=new THREE.TextureLoader();
  await ensureBlockflowAtlasMap();
  const wrap=document.getElementById('viewport');const w=Math.max(1,wrap.clientWidth),h=Math.max(1,wrap.clientHeight);
  scene=new THREE.Scene();scene.background=new THREE.Color(0x101824);
  camera=new THREE.PerspectiveCamera(48,w/h,.1,10000);camera.position.set(22,18,24);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.35));renderer.setSize(w,h);
  if('outputColorSpace'in renderer)renderer.outputColorSpace=THREE.SRGBColorSpace;
  wrap.prepend(renderer.domElement);canvas=renderer.domElement;canvas.tabIndex=0;
  hemisphereLight=new THREE.HemisphereLight(0xd7e5ff,0x586174,lightSettings.ambient);scene.add(hemisphereLight);
  sunLight=new THREE.DirectionalLight(0xffffff,lightSettings.sun);sunLight.position.set(40,70,30);scene.add(sunLight);
  fillLight=new THREE.DirectionalLight(0xc3d6ff,lightSettings.fill);fillLight.position.set(-40,25,-40);scene.add(fillLight);
  sourceLightGroup=new THREE.Group();sourceLightGroup.name='BlockFlow_BlockLightSources';scene.add(sourceLightGroup);
  controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.075;controls.touches.ONE=THREE.TOUCH.ROTATE;controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
  controls.screenSpacePanning=true;controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:-1};
  controls.minDistance=1;controls.maxDistance=10000;raycaster=new THREE.Raycaster();
  controls.addEventListener('change',requestSceneRender);
  canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('pointerdown',e=>{canvas.focus();onPointerDown(e);});
  canvas.addEventListener('pointerup',onPointerUp);canvas.addEventListener('pointercancel',()=>dragOrigin=null);
  window.addEventListener('resize',resizeRenderer);
  const initialTheme=(()=>{try{return localStorage.getItem('bfse-theme-v2');}catch{return null;}})()||'light';
  applyTheme(initialTheme,false);
  loadLightSettings();
  document.getElementById('loading').classList.add('hide');
  requestSceneRender();
}
function requestSceneRender(){if(!renderer||!scene||!camera||renderRaf||renderingFrame)return;renderRaf=requestAnimationFrame(renderSceneFrame);}
function updateDirectionCompass(){const rose=document.getElementById('compassRose');if(!rose||!camera)return;const forward=new threeLib.THREE.Vector3();camera.getWorldDirection(forward);const horizontal=Math.hypot(forward.x,forward.z);if(horizontal<1e-5)return;const heading=Math.atan2(forward.x,-forward.z);rose.style.transform=`rotate(${-heading}rad)`;}
function renderSceneFrame(){renderRaf=0;if(!renderer||!scene||!camera)return;renderingFrame=true;let moving=false;try{const now=performance.now(),dt=Math.min(.05,lastCameraMoveAt?((now-lastCameraMoveAt)/1000):.016);lastCameraMoveAt=now;if(cameraMoveKeys.size){const forward=new threeLib.THREE.Vector3();camera.getWorldDirection(forward);forward.y=0;forward.normalize();const right=new threeLib.THREE.Vector3().crossVectors(forward,new threeLib.THREE.Vector3(0,1,0)).normalize();const speed=Math.max(2,controls.target.distanceTo(camera.position)*.42)*dt;const delta=new threeLib.THREE.Vector3();if(cameraMoveKeys.has('w'))delta.addScaledVector(forward,speed);if(cameraMoveKeys.has('s'))delta.addScaledVector(forward,-speed);if(cameraMoveKeys.has('d')||cameraMoveKeys.has('right'))delta.addScaledVector(right,speed);if(cameraMoveKeys.has('a')||cameraMoveKeys.has('left'))delta.addScaledVector(right,-speed);if(cameraMoveKeys.has(' ')||cameraMoveKeys.has('up'))delta.y+=speed;if(cameraMoveKeys.has('shift')||cameraMoveKeys.has('down'))delta.y-=speed;camera.position.add(delta);controls.target.add(delta);moving=true;}moving=!!controls?.update?.()||moving;updateDirectionCompass();renderer.render(scene,camera);}finally{renderingFrame=false;}if(moving)requestSceneRender();else lastCameraMoveAt=0;}
function resizeRenderer(){if(!renderer||!camera)return;const wrap=document.getElementById('viewport');const w=Math.max(1,wrap.clientWidth),h=Math.max(1,wrap.clientHeight);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);requestSceneRender();}
function applyTheme(theme,persist=true){const light=theme==='light';document.documentElement.dataset.theme=light?'light':'dark';const button=document.getElementById('themeToggle');if(button)button.textContent=light?'深色主题':'浅色主题';if(scene)scene.background=new threeLib.THREE.Color(light?0xdfe7ef:0x101824);if(persist){try{localStorage.setItem('bfse-theme-v2',light?'light':'dark');}catch{}}requestSceneRender();}
function loadLightSettings(){lightSettings.emitters=true;lightSettings.ambient=.95;lightSettings.sun=1.15;lightSettings.fill=.35;if(hemisphereLight)hemisphereLight.intensity=lightSettings.ambient;if(sunLight)sunLight.intensity=lightSettings.sun;if(fillLight)fillLight.intensity=lightSettings.fill;updateBlockLights();requestSceneRender();}
function getBlockLightDescriptor(b){
  const n=blockRenderName(b);let color=null,intensity=.85,distance=8;
  if(n.includes('redstone_torch')){const lit=blockStateValue(b,'lit');const off=n.includes('unlit')||(lit!==undefined&&!modelBool(lit))||modelBool(blockStateValue(b,'unlit_bit'));if(off)return null;color=0xff3a28;intensity=.9;}
  else if(n==='torch'||n==='wall_torch'||n==='soul_torch'||n==='soul_wall_torch'){color=n.includes('soul')?0x64dfff:0xffa34b;intensity=.9;}
  else if(n.includes('lantern')){color=0xffc16b;intensity=1.15;distance=10;}
  else if(n==='campfire'||n==='soul_campfire'){color=n.startsWith('soul')?0x54dfff:0xff823c;intensity=1.4;distance=13;}
  else if(['glowstone','shroomlight','sea_lantern','ochre_froglight','verdant_froglight','pearlescent_froglight','end_rod','beacon','conduit'].includes(n)){color=n==='sea_lantern'||n==='beacon'?0x75d7ff:0xffd49a;intensity=n==='beacon'?1.6:1.05;distance=12;}
  else if(n==='lit_pumpkin'||n==='jack_o_lantern'){color=0xffa14d;intensity=1.15;}
  else if(n==='redstone_lamp'&&Number(blockStateValue(b,'lit'))===1){color=0xffaa57;intensity=1.05;}
  else if(n==='sea_pickle'&&Number(blockStateValue(b,'dead_bit'))===0){color=0x8ee5c1;intensity=.5;}
  return color===null?null:{b,color,intensity,distance};
}
function refreshBlockLightEntry(b){const key=metaKey(b),source=getBlockLightDescriptor(b);if(source)lightSourceCache.set(key,source);else lightSourceCache.delete(key);}
function updateBlockLights(){
  if(!sourceLightGroup||!threeLib)return;
  const {THREE}=threeLib;
  while(sourceLightGroup.children.length)sourceLightGroup.remove(sourceLightGroup.children[0]);
  if(!project||!lightSettings.emitters)return;
  const focus=camera?.position||new THREE.Vector3(),nearest=[];
  for(const src of lightSourceCache.values()){
    const dx=src.b.x+.5-focus.x,dy=src.b.y+.5+(src.b.layer?1.08:0)-focus.y,dz=src.b.z+.5-focus.z,d2=dx*dx+dy*dy+dz*dz;
    if(nearest.length<28||d2<nearest[nearest.length-1].d2){nearest.push({...src,d2});nearest.sort((a,b)=>a.d2-b.d2);if(nearest.length>28)nearest.pop();}
  }
  for(const src of nearest){const light=new THREE.PointLight(src.color,src.intensity,src.distance,2);light.position.set(src.b.x+.5,src.b.y+.5+(src.b.layer?1.08:0),src.b.z+.5);sourceLightGroup.add(light);}
  requestSceneRender();
}

function resizeRenderer(){if(!renderer||!camera)return;const wrap=document.getElementById('viewport');const w=Math.max(1,wrap.clientWidth),h=Math.max(1,wrap.clientHeight);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);}
function blockStateValue(b,...keys){
  const states=b?.statesNode?.value||{};
  for(const key of keys){const node=states[key];if(node!==undefined){if(node&&typeof node==='object'&&Object.prototype.hasOwnProperty.call(node,'value'))return node.value;return node;}}
  return undefined;
}
function directionNormal(value,fallback=[0,1,0]){
  if(Number.isInteger(value))return ({0:[0,-1,0],1:[0,1,0],2:[0,0,-1],3:[0,0,1],4:[-1,0,0],5:[1,0,0]})[value]||fallback;
  const text=String(value??'').toLowerCase();
  if(text.includes('up')||text==='top')return [0,1,0];
  if(text.includes('down')||text==='bottom')return [0,-1,0];
  if(text.includes('north'))return [0,0,-1];
  if(text.includes('south'))return [0,0,1];
  if(text.includes('west'))return [-1,0,0];
  if(text.includes('east'))return [1,0,0];
  return fallback;
}
const CROSSED_PLANT_NAMES=new Set('dandelion poppy blue_orchid allium azure_bluet oxeye_daisy cornflower lily_of_the_valley wither_rose red_tulip orange_tulip white_tulip pink_tulip sunflower lilac rose_bush peony brown_mushroom red_mushroom short_grass tall_grass tallgrass large_fern fern dead_bush deadbush oak_sapling spruce_sapling birch_sapling jungle_sapling acacia_sapling dark_oak_sapling cherry_sapling mangrove_propagule pale_oak_sapling bamboo_sapling crimson_roots warped_roots nether_sprouts azalea flowering_azalea bush firefly_bush wildflowers torchflower torchflower_crop pitcher_plant pitcher_crop wheat carrots potatoes beetroots nether_wart sugar_cane seagrass tall_seagrass kelp vine glow_lichen cave_vines cave_vines_body_with_berries cave_vines_head_with_berries hanging_roots twisting_vines weeping_vines lily_pad cactus_flower red_flower yellow_flower grass short_dry_grass tall_dry_grass small_dripleaf_block big_dripleaf coral_fan coral_fan_dead coral_fan_hang coral_fan_hang2 coral_fan_hang3 brain_coral_fan bubble_coral_fan fire_coral_fan horn_coral_fan tube_coral_fan dead_brain_coral_fan dead_bubble_coral_fan dead_fire_coral_fan dead_horn_coral_fan dead_tube_coral_fan'.split(' '));
function shapeKindForBlock(b){
  if(!b||b.command)return null;
  const n=blockRenderName(b);
  if(n==='sign'||n.endsWith('_sign')||/(^|_)(standing_sign|wall_sign|hanging_sign)$/.test(n))return 'sign';
  if(n==='standing_banner'||n==='wall_banner'||n.endsWith('_standing_banner')||n.endsWith('_wall_banner'))return 'banner';
  if(n==='skull'||n.endsWith('_skull')||n.endsWith('_head'))return 'head';
  if(n==='chest'||n==='trapped_chest'||n==='ender_chest'||n.endsWith('_copper_chest'))return 'chest';
  if(n==='barrel')return 'barrel';
  if(n==='bed'||n.endsWith('_bed'))return 'bed';
  if(n==='bookshelf'||n==='chiseled_bookshelf'||n.endsWith('_shelf'))return 'bookshelf';
  if(n==='hopper')return 'hopper';
  if(n==='brewing_stand')return 'brewing_stand';
  if(n==='anvil'||n==='chipped_anvil'||n==='damaged_anvil')return 'anvil';
  if(n==='grindstone')return 'grindstone';
  if(n==='campfire'||n==='soul_campfire')return 'campfire';
  if(n==='lantern'||n==='soul_lantern'||n.endsWith('_copper_lantern'))return 'lantern';
  if(['torch','wall_torch','redstone_torch','redstone_wall_torch','unlit_redstone_torch','soul_torch','soul_wall_torch','copper_torch'].includes(n))return 'torch';
  if(n.endsWith('_button'))return 'button';
  if(n==='lever')return 'lever';
  if(n.endsWith('_pressure_plate')||n==='light_weighted_pressure_plate'||n==='heavy_weighted_pressure_plate')return 'pressure_plate';
  if(n==='carpet'||n.endsWith('_carpet')||n==='moss_carpet'||n==='pale_moss_carpet')return 'carpet';
  if(n==='snow_layer')return 'snow_layer';
  if(n.endsWith('_double_slab')||n==='double_stone_slab'||n==='double_wooden_slab')return null;
  if(n.endsWith('_slab')||n==='stone_slab'||n==='wooden_slab')return 'slab';
  if(n.endsWith('_trapdoor'))return 'trapdoor';
  if(n==='ladder')return 'ladder';
  if(['rail','golden_rail','powered_rail','detector_rail','activator_rail'].includes(n))return 'rail';
  if(n.includes('repeater')||n.includes('comparator'))return 'redstone_device';
  if(n==='redstone_wire')return 'redstone_wire';
  if(n.endsWith('_stairs')||n==='stairs')return 'stairs';
  if(n.endsWith('_door')||n==='wooden_door')return 'door';
  if(n.endsWith('_pane')||n==='iron_bars')return 'pane';
  if(n.endsWith('_fence_gate'))return 'fence_gate';
  if(n.endsWith('_fence')||n==='nether_brick_fence'||n==='iron_bars_fence')return 'fence';
  if(n.endsWith('_wall')&&n!=='wall_sign')return 'wall';
  if(n==='candle'||n.endsWith('_candle')||n==='sea_pickle')return 'candle';
  if(n==='end_rod'||n==='lightning_rod'||n==='chain')return 'slender_rod';
  if(n==='tripwire_hook')return 'tripwire_hook';
  if(n==='tripwire')return 'tripwire';
  if(CROSSED_PLANT_NAMES.has(n)||(/(^|_)(sapling|flower|tulip|orchid|allium|azure_bluet|cornflower|daisy|poppy|rose|petals|grass|fern|roots|sprouts|crop|mushroom|bush|wildflowers|deadbush|dead_bush|seagrass|kelp|coral_fan|coral_plant|dripleaf|torchflower|pitcher_crop|wheat|carrots|potatoes|beetroots|nether_wart)(_|$)/.test(n)&&!n.endsWith('_block')&&!n.endsWith('_wall_fan')))return 'plant';
  return null;
}
function getShapeTextureMaterial(alias,b,opts={}){
  const candidate=terrainCandidate(alias,b);if(!candidate)return new threeLib.THREE.MeshBasicMaterial({color:0xb0b7c2,side:threeLib.THREE.DoubleSide});
  const {THREE}=threeLib,key=`${candidate.a}|${candidate.c||''}|${opts.mode||'auto'}`;
  if(specialMaterialCache.has(key))return specialMaterialCache.get(key);
  const alphaMode=BLOCK_TEXTURE_ALPHA[candidate.a]||'opaque';
  const map=loadBlockTexture(candidate.a);
  const mat=new THREE.MeshBasicMaterial({map,color:parseTint(candidate.c),side:THREE.DoubleSide,transparent:opts.transparent??(alphaMode!=='opaque'),alphaTest:opts.alphaTest??(alphaMode==='opaque'?0:.06),depthWrite:opts.depthWrite??(alphaMode==='opaque')});
  specialMaterialCache.set(key,mat);return mat;
}
function addTrackedMesh(group,geometry,material,position=[0,0,0],rotation=[0,0,0]){
  const {THREE}=threeLib;specialGeometries.add(geometry);const mesh=new THREE.Mesh(geometry,material);mesh.position.set(position[0],position[1],position[2]);mesh.rotation.set(rotation[0],rotation[1],rotation[2]);mesh.userData.blockRef=group.userData.blockRef;group.add(mesh);return mesh;
}
function addShapeBox(group,b,size,position,rotation=[0,0,0],materials=null){
  const {THREE}=threeLib;return addTrackedMesh(group,new THREE.BoxGeometry(size[0],size[1],size[2]),materials||buildBlockMaterials(b),position,rotation);
}
function addShapePlane(group,geometry,material,position=[0,0,0],rotation=[0,0,0]){return addTrackedMesh(group,geometry,material,position,rotation);}
function blockHasNeighbor(b,dx,dy,dz){
  return blockPositionSet.has(`${b.layer}|${b.x+dx},${b.y+dy},${b.z+dz}`);
}
function modelState(b,...keys){return blockStateValue(b,...keys);}
function modelBool(v){return v===true||v===1||v==='1'||String(v).toLowerCase()==='true';}
function modelNumber(v,def=0){const n=Number(v);return Number.isFinite(n)?n:def;}
function modelMat(alias,b,opts={}){return getShapeTextureMaterial(alias,b,opts);}
function modelMatArray(alias,b,opts={}){const m=modelMat(alias,b,opts);return Array(6).fill(m);}
function modelColorMat(color,opts={}){return new threeLib.THREE.MeshBasicMaterial({color,side:threeLib.THREE.DoubleSide,...opts});}
function modelCardinalYaw(value,defaultValue='south'){
  if(typeof value==='number'||/^\d+$/.test(String(value??'')))return modelCardinalYawState(value,defaultValue);
  const v=String(value??defaultValue).toLowerCase();
  if(v==='south'||v==='3')return 0;if(v==='west'||v==='4')return -Math.PI/2;if(v==='north'||v==='2')return Math.PI;if(v==='east'||v==='5')return Math.PI/2;
  return 0;
}
function modelCardinalYawState(value,defaultValue='south'){
  if(Number.isInteger(value)||(/^\d+$/.test(String(value??'')))){const n=Number(value);return ({2:Math.PI,3:0,4:-Math.PI/2,5:Math.PI/2})[n]??0;}
  return modelCardinalYaw(value,defaultValue);
}
function modelDirectionYaw(b,defaultValue='south'){
  const modern=modelState(b,'minecraft:cardinal_direction','cardinal_direction');
  if(modern!==undefined)return modelCardinalYaw(modern,defaultValue);
  const facing=modelState(b,'facing_direction','minecraft:facing_direction');
  if(facing!==undefined){const yaw=modelCardinalYawState(facing,defaultValue);if(Number(facing)>=2)return yaw;}
  const legacy=modelState(b,'direction','weirdo_direction');
  if(legacy!==undefined){const text=String(legacy).toLowerCase();if(['north','south','east','west'].includes(text))return modelCardinalYaw(text,defaultValue);const n=modelNumber(legacy,-1);return ({0:0,1:-Math.PI/2,2:Math.PI,3:Math.PI/2})[n]??modelCardinalYaw(defaultValue);}
  return modelCardinalYaw(defaultValue);
}
function modelFenceGateYaw(b,fallback='south'){
  const modern=modelState(b,'minecraft:cardinal_direction','cardinal_direction');
  if(modern!==undefined)return modelCardinalYaw(modern,fallback);
  const legacy=modelState(b,'direction');
  return ({0:0,1:-Math.PI/2,2:Math.PI,3:Math.PI/2})[modelNumber(legacy,-1)]??modelCardinalYaw(fallback);
}
function modelFacingNormal(value,defaultValue='south'){
  if(value===undefined||value===null)value=defaultValue;
  if(typeof value==='string'&&['north','south','east','west','up','down'].includes(value.toLowerCase()))return directionNormal(value);
  return directionNormal(Number(value));
}
function modelTextureAlias(b,faceIndex=2){const ds=getBlockFaceDescriptors(b);return ds?.[faceIndex]?.alias||ds?.find(x=>x.alias)?.alias||blockRenderName(b);}
function modelSetPanelNormal(mesh,normal){mesh.quaternion.setFromUnitVectors(new threeLib.THREE.Vector3(0,0,1),new threeLib.THREE.Vector3(normal[0],normal[1],normal[2]));return mesh;}
function modelAddBox(group,b,size,pos,alias=null,opts={}){
  const mats=alias?modelMatArray(alias,b,opts):buildBlockMaterials(b);
  return addShapeBox(group,b,size,pos,[0,0,0],mats);
}
function modelAddFaceTexturedBox(group,b,size,pos,faceAlias,edgeColor=0x4c3829,opts={}){
  const {THREE}=threeLib;
  const face=modelMat(faceAlias,b,{transparent:false,...opts});
  const edge=modelColorMat(edgeColor),top=modelColorMat(Math.min(0xffffff,edgeColor+0x17110b));
                                                        
  return addTrackedMesh(group,new THREE.BoxGeometry(size[0],size[1],size[2]),[edge,edge,top,edge,face,face],pos);
}
function modelAddMetalRivet(group,x,y,z,scale=1){
  const {THREE}=threeLib,metal=modelColorMat(0xb5bcc3),slot=modelColorMat(0x39434b);
  addTrackedMesh(group,new THREE.CylinderGeometry(.012*scale,.012*scale,.006*scale,10),metal,[x,y,z]);
  addTrackedMesh(group,new THREE.BoxGeometry(.014*scale,.0025*scale,.0025*scale),slot,[x,y+.004*scale,z]);
}
function modelAddCylinder(group,b,rTop,rBottom,height,pos,alias,radial=10,rotation=[0,0,0],opts={}){
  const {THREE}=threeLib;const mat=alias?modelMat(alias,b,opts):modelMat('stone',b,opts);
  return addTrackedMesh(group,new THREE.CylinderGeometry(rTop,rBottom,height,radial),mat,pos,rotation);
}
function modelAddStick(group,b,a,bp,radius,alias,opts={}){
  const {THREE}=threeLib;const start=new THREE.Vector3(...a),end=new THREE.Vector3(...bp),delta=end.clone().sub(start);const mesh=addTrackedMesh(group,new THREE.CylinderGeometry(radius,radius,delta.length(),8),modelMat(alias,b,opts),start.clone().add(end).multiplyScalar(.5).toArray());
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return mesh;
}
function unwrapBlockEntityNode(node){
  return node&&typeof node==='object'&&Object.prototype.hasOwnProperty.call(node,'value')?node.value:node;
}
function getBlockEntityCompound(block){
  const wrapper=unwrapBlockEntityNode(block?.blockEntityNode);
  const data=unwrapBlockEntityNode(wrapper?.block_entity_data);
  return data&&typeof data==='object'&&!Array.isArray(data)?data:null;
}
function getCompoundField(compound,...keys){
  let current=compound;
  for(const key of keys){current=unwrapBlockEntityNode(current?.[key]);if(current===undefined||current===null)return undefined;}
  return current;
}
function normalizeSignMessage(value){
  if(value===undefined||value===null)return '';
  let text=String(value);
  if(text.startsWith('{')||text.startsWith('[')){
    try{
      const parsed=JSON.parse(text);
      const collect=node=>{
        if(node===null||node===undefined)return '';
        if(typeof node==='string'||typeof node==='number')return String(node);
        if(Array.isArray(node))return node.map(collect).join('');
        if(typeof node==='object'){
          if(Array.isArray(node.rawtext))return node.rawtext.map(collect).join('');
          if(node.text!==undefined)return String(node.text)+collect(node.extra||[]);
          if(node.translate!==undefined)return String(node.translate);
          if(node.with!==undefined)return collect(node.with);
        }
        return '';
      };
      const extracted=collect(parsed);if(extracted)text=extracted;
    }catch{}
  }
  return text.replace(/\r\n?/g,'\n').replace(/\u0000/g,'').slice(0,1024);
}
function readSignFaceData(block,face='front'){
  const entity=getBlockEntityCompound(block);if(!entity)return{text:'',color:0x202020,glowing:false};
  const faceNode=getCompoundField(entity,face==='back'?'BackText':'FrontText')||{};
  let text=normalizeSignMessage(getCompoundField(faceNode,'Text')??getCompoundField(faceNode,'Message'));
  if(!text&&face==='front'){
    text=normalizeSignMessage(getCompoundField(entity,'Text'));
    if(!text){text=['Text1','Text2','Text3','Text4'].map(key=>normalizeSignMessage(getCompoundField(entity,key))).filter(Boolean).join('\n');}
  }
  const rawColor=getCompoundField(faceNode,'SignTextColor')??getCompoundField(entity,'SignTextColor');
  let color=0x202020;
  if(Number.isFinite(Number(rawColor))){const numeric=Number(rawColor)>>>0;color=numeric&0xffffff;if(color===0)color=0x202020;}
  else if(typeof rawColor==='string'&&/^#[0-9a-f]{6}$/i.test(rawColor))color=Number.parseInt(rawColor.slice(1),16);
  const glowing=!!(getCompoundField(faceNode,'IgnoreLighting')??getCompoundField(faceNode,'GlowingText'));
  return{text,color,glowing};
}
function createSignPixelTextGeometry(text,width,height,depth){
  const {THREE}=threeLib;if(typeof document==='undefined')return null;
  const lines=String(text||'').split(/\n/).slice(0,4);if(!lines.some(line=>line.trim()))return null;
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=64;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return null;
  const columns=128,rowsPerLine=10,totalRows=rowsPerLine*4,cellW=width/columns,cellH=height/totalRows;
  const positions=[],indices=[];
  const pushBox=(x0,y0,z0,x1,y1,z1)=>{
    const faces=[
      [[1,0,0],[[x1,y0,z0],[x1,y0,z1],[x1,y1,z1],[x1,y1,z0]]],
      [[-1,0,0],[[x0,y0,z1],[x0,y0,z0],[x0,y1,z0],[x0,y1,z1]]],
      [[0,1,0],[[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]]],
      [[0,-1,0],[[x0,y0,z1],[x1,y0,z1],[x1,y0,z0],[x0,y0,z0]]],
      [[0,0,1],[[x1,y0,z1],[x0,y0,z1],[x0,y1,z1],[x1,y1,z1]]],
      [[0,0,-1],[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0]]]
    ];
    for(const [,verts] of faces){const base=positions.length/3;for(const v of verts)positions.push(v[0],v[1],v[2]);indices.push(base,base+1,base+2,base,base+2,base+3);}
  };
  const top=height*.5;
  for(let lineIndex=0;lineIndex<4;lineIndex++){
    const line=lines[lineIndex]||'';if(!line.trim())continue;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    let fontSize=52;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`700 ${fontSize}px sans-serif`;
    while(fontSize>13&&ctx.measureText(line).width>294){fontSize-=2;ctx.font=`700 ${fontSize}px sans-serif`;}
    ctx.fillStyle='#fff';ctx.fillText(line,160,32,296);
    const image=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    const bits=new Uint8Array(columns*rowsPerLine);
    for(let gy=0;gy<rowsPerLine;gy++)for(let gx=0;gx<columns;gx++){
      const x0=Math.floor(gx*canvas.width/columns),x1=Math.max(x0+1,Math.floor((gx+1)*canvas.width/columns));
      const y0=Math.floor(gy*canvas.height/rowsPerLine),y1=Math.max(y0+1,Math.floor((gy+1)*canvas.height/rowsPerLine));
      let alpha=0;for(let py=y0;py<y1&&alpha<72;py++)for(let px=x0;px<x1&&alpha<72;px++)alpha=Math.max(alpha,image[(py*canvas.width+px)*4+3]);
      bits[gy*columns+gx]=alpha>72?1:0;
    }
    for(let gy=0;gy<rowsPerLine;gy++){
      let gx=0;while(gx<columns){while(gx<columns&&!bits[gy*columns+gx])gx++;if(gx>=columns)break;const start=gx;while(gx<columns&&bits[gy*columns+gx])gx++;const end=gx;
        const x0=-width/2+start*cellW,x1=-width/2+end*cellW;
        const y1=top-(lineIndex*rowsPerLine+gy)*cellH,y0=y1-cellH*.84;
        pushBox(x0,y0,-depth/2,x1,y1,depth/2);
      }
    }
  }
  if(!indices.length)return null;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
  return geometry;
}
function addSignFaceText(host,block,centerY,boardW,boardH,boardDepth,face='front'){
  const data=readSignFaceData(block,face);if(!data.text)return null;
  const innerW=boardW*.88,innerH=boardH*.76,thickness=.0045;
  const geometry=createSignPixelTextGeometry(data.text,innerW,innerH,thickness);if(!geometry)return null;
  const material=modelColorMat(data.color,{side:threeLib.THREE.DoubleSide,toneMapped:!data.glowing,depthWrite:true});
  const textGroup=new threeLib.THREE.Group();textGroup.userData.blockRef=block;textGroup.position.set(0,centerY,face==='front'?boardDepth/2+thickness*.65:-boardDepth/2-thickness*.65);
  if(face==='back')textGroup.rotation.y=Math.PI;
  host.add(textGroup);addTrackedMesh(textGroup,geometry,material,[0,0,0]);return textGroup;
}
function modelResolveLeverPlacement(block){
  const rawDirection=modelState(block,'lever_direction','facing_direction','minecraft:cardinal_direction');
  const value=String(rawDirection??'up_north_south').toLowerCase();
  const directions={
    down_east_west:[[0,-1,0],[1,0,0]],east:[[1,0,0],[0,0,1]],west:[[-1,0,0],[0,0,1]],
    south:[[0,0,1],[1,0,0]],north:[[0,0,-1],[1,0,0]],
    up_north_south:[[0,1,0],[0,0,1]],up_east_west:[[0,1,0],[1,0,0]],
    down_north_south:[[0,-1,0],[0,0,1]]
  };
  const legacy=[directions.down_east_west,directions.east,directions.west,directions.south,directions.north,directions.up_north_south,directions.up_east_west,directions.down_north_south];
  const numeric=typeof rawDirection==='number'||/^\d+$/.test(String(rawDirection??''));
  const spec=directions[value]||(numeric?legacy[Math.max(0,Math.min(7,modelNumber(rawDirection,5)))]:directions.up_north_south)||directions.up_north_south;
  return {value,mountNormal:spec[0].slice(),hingeAxis:spec[1].slice(),powered:modelBool(modelState(block,'open_bit','powered_bit','lever_powered_bit'))};
}
function modelResolveRedstoneDeviceState(block){
  const name=String(block?.name||'').split(':').pop().toLowerCase();
  const state=(...keys)=>modelState(block,...keys);
  return {
    kind:name.includes('comparator')?'comparator':'repeater',
    powered:name.startsWith('powered_')||modelBool(state('powered_bit','output_lit_bit','lit')),
    subtract:modelBool(state('output_subtract_bit','subtract_mode')),
    delay:Math.max(0,Math.min(3,modelNumber(state('repeater_delay','delay'),0))),
    direction:state('direction','weirdo_direction','facing_direction','minecraft:cardinal_direction','cardinal_direction')
  };
}
function modelResolveButtonPlacement(block){
  const name=blockRenderName(block);
  const face=modelState(block,'facing_direction','minecraft:facing_direction','minecraft:cardinal_direction')??2;
  const wooden=/(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|bamboo|crimson|warped|pale_oak)_button$/.test(name);
  return {
    normal:modelFacingNormal(face,'north'),
    pressed:modelBool(modelState(block,'button_pressed_bit','pressed_bit')),
    wooden,
    facing:face
  };
}
function modelResolveSignPlacement(block){
  const name=blockRenderName(block),state=(...keys)=>modelState(block,...keys);
  const hangingId=name.endsWith('_hanging_sign')||name==='hanging_sign';
  const wallHanging=hangingId&&modelBool(state('hanging'));
  const hanging=hangingId&&!wallHanging;
  const wall=name.endsWith('_wall_sign')||name==='wall_sign'||wallHanging||name.includes('_wall_hanging_sign');
  const ground=state('ground_sign_direction');
  const facing=state('minecraft:cardinal_direction','cardinal_direction','facing_direction');
  const yaw=ground!==undefined?modelFacingYawFrom16(ground):
    (typeof facing==='string'&&['north','south','east','west'].includes(facing.toLowerCase())?modelCardinalYaw(facing):modelFacingYawFrom16(facing??0));
  const normal=wall?modelFacingNormal(state('facing_direction','minecraft:facing_direction','minecraft:cardinal_direction','cardinal_direction')??2,'north'):null;
  const supportNormal=normal?normal.map(value=>-value):null;
  return {wall,hanging,wallHanging,normal,supportNormal,yaw,attached:modelBool(state('attached_bit'))};
}
function modelBuildButton(group,block,placement=modelResolveButtonPlacement(block)){
  const {THREE}=threeLib,normal=placement.normal,pressed=placement.pressed,woodButton=placement.wooden;
  const mount=new THREE.Group();mount.userData.blockRef=block;
                                                                            
                                                                        
  mount.position.set(normal[0]*.485,normal[1]*.485,normal[2]*.485);
  mount.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(...normal));group.add(mount);
  const frame=modelColorMat(woodButton?0x4f3929:0x474d52),rim=modelColorMat(woodButton?0x795638:0x727a80);
  const cap=modelColorMat(woodButton?0xa17a50:0xaeb6bd),capSide=modelColorMat(woodButton?0x66462f:0x6b747c);
  addTrackedMesh(mount,new THREE.BoxGeometry(.285,.195,.044),[frame,frame,rim,frame,frame,frame],[0,0,.018]);
  addTrackedMesh(mount,new THREE.BoxGeometry(.248,.158,.010),[capSide,capSide,rim,capSide,capSide,capSide],[0,0,.043]);
  const capDepth=pressed?.026:.052,capCenter=pressed?.061:.074;
  addTrackedMesh(mount,new THREE.BoxGeometry(.188,.108,capDepth),[capSide,capSide,cap,capSide,cap,cap],[0,0,capCenter]);
  for(const x of [-.111,.111])for(const y of [-.071,.071]){
    addTrackedMesh(mount,new THREE.CylinderGeometry(.008,.008,.006,8),rim,[x,y,.048],[Math.PI/2,0,0]);
    addTrackedMesh(mount,new THREE.BoxGeometry(.010,.0018,.0018),frame,[x,y,.052]);
  }
  return mount;
}
function addDetailedLeverModel(group,block){
  const {THREE}=threeLib,{mountNormal,hingeAxis,powered}=modelResolveLeverPlacement(block);
  const mount=new THREE.Group();mount.userData.blockRef=block;
  mount.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(...mountNormal));
                                                                            
                                                                              
  mount.position.set(mountNormal[0]*.03,mountNormal[1]*.03,mountNormal[2]*.03);group.add(mount);
  const stone=modelMat('stone',block),darkMetal=modelColorMat(0x303941),steel=modelColorMat(0xaeb8c0),steelLight=modelColorMat(0xd4dadd),wood=modelColorMat(0x68472f),woodLight=modelColorMat(0x9a704c),woodDark=modelColorMat(0x3e291f);
  addTrackedMesh(mount,new THREE.BoxGeometry(.34,.055,.34),[darkMetal,darkMetal,stone,darkMetal,steel,steel],[0,.438,0]);
  addTrackedMesh(mount,new THREE.BoxGeometry(.292,.014,.292),[steel,steel,steelLight,darkMetal,steelLight,steelLight],[0,.473,0]);
  for(const x of [-.112,.112])for(const z of [-.112,.112])modelAddMetalRivet(mount,x,.484,z,.78);
  addTrackedMesh(mount,new THREE.CylinderGeometry(.072,.078,.028,16),darkMetal,[0,.495,0]);
  addTrackedMesh(mount,new THREE.CylinderGeometry(.058,.058,.034,16),steel,[0,.523,0]);
  const pivot=new THREE.Group();pivot.position.set(0,.538,0);
  const axis=hingeAxis[0]!==0?new THREE.Vector3(1,0,0):new THREE.Vector3(0,0,1),angle=powered?.62:-.48;
  pivot.rotation.set(axis.x*angle,axis.y*angle,axis.z*angle);mount.add(pivot);
  const armVector=new THREE.Vector3(hingeAxis[0]*.235,.245,hingeAxis[2]*.235),armLength=armVector.length(),direction=armVector.clone().normalize();
  const arm=addTrackedMesh(pivot,new THREE.CylinderGeometry(.022,.029,armLength,10,2),wood,[0,0,0]);
  arm.position.copy(armVector).multiplyScalar(.5);arm.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);
  const ferrule=addTrackedMesh(pivot,new THREE.CylinderGeometry(.034,.034,.025,12),steel,armVector.clone().multiplyScalar(.73).toArray());ferrule.quaternion.copy(arm.quaternion);
  const grip=addTrackedMesh(pivot,new THREE.SphereGeometry(.057,12,9),woodLight,armVector.toArray());grip.scale.set(.92,1.18,.92);
  const cap=addTrackedMesh(pivot,new THREE.SphereGeometry(.027,10,7),woodDark,armVector.clone().addScaledVector(direction,.045).toArray());cap.scale.set(.9,.72,.9);
  addTrackedMesh(mount,new THREE.CylinderGeometry(.018,.018,.008,10),powered?modelColorMat(0xc84b32):steel,[0,.545,0]);
  return mount;
}
function addGeometricTorchHead(group,block,{redstone=false,lit=true,soul=false,copper=false}={}){
  const {THREE}=threeLib;
  const shaftColor=redstone?0x49312e:copper?0x99613d:0x735034;
  const shaftMat=modelColorMat(shaftColor),collarMat=modelColorMat(copper?0xc1844d:0x494d51),darkMat=modelColorMat(0x30282a);
                                                                             
                                           
  addTrackedMesh(group,new THREE.CylinderGeometry(.026,.043,.315,9,2),shaftMat,[0,-.018,0]);
  addTrackedMesh(group,new THREE.CylinderGeometry(.041,.041,.018,10),collarMat,[0,.125,0]);
  addTrackedMesh(group,new THREE.CylinderGeometry(.032,.037,.012,10),darkMat,[0,.141,0]);
  if(redstone&&!lit){
    addTrackedMesh(group,new THREE.CylinderGeometry(.029,.043,.065,8,1),modelColorMat(0x4b292c),[0,.178,0]);
    addTrackedMesh(group,new THREE.SphereGeometry(.026,8,6),modelColorMat(0x321f24),[0,.214,0]);
    return;
  }
  const outer=redstone?0xf04435:soul?0x3bd2e5:copper?0xe58a43:0xff8a35;
  const inner=redstone?0xffa35a:soul?0xa5faff:copper?0xffd18a:0xffe36a;
  const shell=modelColorMat(outer,{transparent:true,opacity:.94,depthWrite:false,toneMapped:false});
  const core=modelColorMat(inner,{transparent:true,opacity:.98,depthWrite:false,toneMapped:false});
  const flame=addTrackedMesh(group,new THREE.ConeGeometry(.052,.17,7,2),shell,[0,.239,0]);flame.rotation.y=Math.PI/7;
  const center=addTrackedMesh(group,new THREE.ConeGeometry(.029,.105,6,2),core,[0,.24,0]);center.rotation.y=-Math.PI/9;
  for(const [x,z,rx,rz] of [[-.025,.004,-.22,.13],[.024,-.008,.17,-.19]]){
    const tongue=addTrackedMesh(group,new THREE.ConeGeometry(.021,.078,5,1),shell,[x,.236,z]);tongue.rotation.set(rx,0,rz);
  }
  addTrackedMesh(group,new THREE.SphereGeometry(.014,8,6),core,[0,.281,0]);
}
function modelFacingYawFrom16(value){return -((modelNumber(value,0)%16+16)%16)*Math.PI/8;}
function modelAttachGroup(group,normal){group.quaternion.setFromUnitVectors(new threeLib.THREE.Vector3(0,0,1),new threeLib.THREE.Vector3(...normal));return group;}
function modelConnected(b,dir,stateValue){
  const keys={east:['minecraft:connection_east','connection_east','wall_connection_type_east'],west:['minecraft:connection_west','connection_west','wall_connection_type_west'],north:['minecraft:connection_north','connection_north','wall_connection_type_north'],south:['minecraft:connection_south','connection_south','wall_connection_type_south']}[dir];
  for(const k of keys||[]){const v=modelState(b,k);if(v!==undefined){const s=String(v).toLowerCase();return !(s==='none'||s==='false'||s==='0'||s==='');}}
  const d=({east:[1,0],west:[-1,0],north:[0,-1],south:[0,1]})[dir];return d?blockHasNeighbor(b,d[0],0,d[1]):false;
}
function modelBlockAtOffset(b,dx,dy,dz){
  return blockLookupByLayer.get(`${b.layer}|${b.x+dx},${b.y+dy},${b.z+dz}`)||null;
}
function modelAngleDistance(a,b){let d=(a-b)%(Math.PI*2);if(d>Math.PI)d-=Math.PI*2;if(d<-Math.PI)d+=Math.PI*2;return Math.abs(d);}
function modelChestPairInfo(b,yaw){
  const n=blockRenderName(b);
  if(n==='ender_chest')return null;
  const axisX=Math.cos(yaw),axisZ=-Math.sin(yaw);
  for(const sign of [-1,1]){
    const dx=Math.round(axisX*sign),dz=Math.round(axisZ*sign);
    const other=modelBlockAtOffset(b,dx,0,dz);
    if(!other||other.name!==b.name||other.layer!==b.layer)continue;
    if(modelAngleDistance(modelDirectionYaw(other,'south'),yaw)>.015)continue;
    return{sign,other,dx,dz};
  }
  return null;
}
function modelCropTextureMaterial(alias,b,repeatY,offsetY,opts={}){
  const candidate=terrainCandidate(alias,b);
  if(!candidate)return modelColorMat(0x8b6745,opts);
  const {THREE}=threeLib;
  const key=`crop|${candidate.a}|${repeatY}|${offsetY}|${opts.transparent?'t':'o'}`;
  if(specialMaterialCache.has(key))return specialMaterialCache.get(key);
  const map=makeAtlasTexture(candidate.a,repeatY,offsetY);
  if(!map)return modelColorMat(0x8b6745,opts);
  const alphaMode=BLOCK_TEXTURE_ALPHA[candidate.a]||'opaque';
  const material=new THREE.MeshBasicMaterial({map,color:parseTint(candidate.c),side:THREE.DoubleSide,
    transparent:opts.transparent??(alphaMode!=='opaque'),alphaTest:opts.alphaTest??(alphaMode==='opaque'?0:.04),depthWrite:opts.depthWrite??(alphaMode==='opaque')});
  specialMaterialCache.set(key,material);return material;
}
function modelRedstoneConnectable(b){
  if(!b)return false;
  const n=blockRenderName(b);
  return n==='redstone_wire'||n.includes('repeater')||n.includes('comparator')||n.includes('redstone_torch')||n==='unlit_redstone_torch'||n==='lever'||n.endsWith('_button')||n.endsWith('_pressure_plate')||n==='redstone_block'||n==='redstone_lamp'||n==='observer'||n==='piston'||n==='sticky_piston'||n==='dispenser'||n==='dropper'||n==='hopper'||n==='target'||n==='daylight_detector'||n==='tripwire_hook'||n==='redstone_ore'||n==='lit_redstone_ore'||n==='crafter'||n==='copper_bulb'||n.endsWith('_copper_bulb');
}
function modelRedstoneDirectionMode(b,dir){
  const value=modelState(b,`redstone_wire_direction_${dir}`,`minecraft:redstone_wire_direction_${dir}`);
  if(value!==undefined){
    const s=String(value).toLowerCase().replace(/^minecraft:/,'');
    if(['none','false','0',''].includes(s))return 'none';
    if(s==='up'||s==='up_side')return 'up';
    return 'side';
  }
  const offsets={north:[0,0,-1],south:[0,0,1],east:[1,0,0],west:[-1,0,0]};
  const [dx,dy,dz]=offsets[dir];
  const same=modelBlockAtOffset(b,dx,0,dz);
  if(modelRedstoneConnectable(same))return 'side';
  const above=modelBlockAtOffset(b,dx,1,dz);
  if(modelRedstoneConnectable(above))return 'up';
  return 'none';
}
function modelRedstoneDeviceYaw(b){
  const cardinal=modelState(b,'minecraft:cardinal_direction','cardinal_direction','facing');
  if(cardinal!==undefined)return modelCardinalYaw(cardinal,'south');
  const facing=modelState(b,'facing_direction','minecraft:facing_direction');
  if(facing!==undefined&&Number(facing)>=2)return modelCardinalYawState(facing,'south');
  const legacy=modelState(b,'direction','weirdo_direction');
  if(legacy!==undefined)return ({0:0,1:-Math.PI/2,2:Math.PI,3:Math.PI/2})[modelNumber(legacy,0)]||0;
  return 0;
}
function modelAddMiniRedstoneTorch(group,b,x,z,on,scale=1,variant='redstone'){
  const {THREE}=threeLib,base=modelColorMat(0x4c4a48),shaft=modelColorMat(0x56362f),collar=modelColorMat(0x777b7d);
  const footH=.025*scale,shaftH=.10*scale,collarH=.010*scale;
  const footY=-.375,shaftY=footY+footH/2+shaftH/2,collarY=shaftY+shaftH/2+collarH/2;
  addTrackedMesh(group,new THREE.CylinderGeometry(.027*scale,.032*scale,footH,8),base,[x,footY,z]);
  addTrackedMesh(group,new THREE.CylinderGeometry(.013*scale,.018*scale,shaftH,7,2),shaft,[x,shaftY,z]);
  addTrackedMesh(group,new THREE.CylinderGeometry(.021*scale,.021*scale,collarH,8),collar,[x,collarY,z]);
  const flameH=.074*scale,flameY=collarY+collarH/2+flameH/2;
  if(on){
    const hue=variant==='comparator'?0xff5a45:0xff4c3b;
    addTrackedMesh(group,new THREE.ConeGeometry(.026*scale,flameH,6,2),modelColorMat(hue,{toneMapped:false}),[x,flameY,z]);
    addTrackedMesh(group,new THREE.ConeGeometry(.014*scale,.046*scale,6,2),modelColorMat(0xffb46d,{toneMapped:false}),[x,flameY+.002*scale,z]);
  }else{
    const capH=.052*scale,capY=collarY+collarH/2+capH/2;
    addTrackedMesh(group,new THREE.CylinderGeometry(.017*scale,.024*scale,capH,6),modelColorMat(0x512d31),[x,capY,z]);
  }
}
function modelAddRedstoneDeviceBase(group,b,kind){
  const alias=kind==='repeater'?'repeater_floor':'comparator_stone_slab';
  const side=modelMat('stone_slab_side',b),top=modelMat(alias,b,{transparent:false}),bottom=modelMat('stone',b);
  const rim=modelColorMat(0x4d4b49);
  addTrackedMesh(group,new threeLib.THREE.BoxGeometry(.94,.12,.94),[side,side,top,bottom,side,side],[0,-.44,0]);
  addTrackedMesh(group,new threeLib.THREE.BoxGeometry(.87,.018,.87),[rim,rim,top,rim,rim,rim],[0,-.372,0]);
  for(const x of [-.425,.425])for(const z of [-.425,.425])addTrackedMesh(group,new threeLib.THREE.CylinderGeometry(.014,.014,.008,8),modelColorMat(0x777b7c),[x,-.36,z]);
}
function modelAddRedstoneRail(group,b,z,color=0x8a3530){
  const rail=modelColorMat(color),edge=modelColorMat(0x472d2c),{THREE}=threeLib;
  addTrackedMesh(group,new THREE.BoxGeometry(.12,.026,.47),[edge,edge,rail,edge,edge,edge],[0,-.355,z]);
  for(const x of [-.105,.105])addTrackedMesh(group,new THREE.BoxGeometry(.024,.035,.48),[edge,edge,rail,edge,edge,edge],[x,-.345,z]);
}
function modelAddRedstoneTorchCarrier(group,b,x,z,on,variant='repeater'){
  const {THREE}=threeLib,carrier=modelColorMat(0x77736d),slot=modelColorMat(0x393a3b);
  addTrackedMesh(group,new THREE.BoxGeometry(.14,.025,.14),carrier,[x,-.40,z]);
  addTrackedMesh(group,new THREE.BoxGeometry(.08,.006,.08),slot,[x,-.383,z]);
  modelAddMiniRedstoneTorch(group,b,x,z,on,.78,variant);
}
function renderAdvancedShape(group,b,kind){
  const {THREE}=threeLib,n=blockRenderName(b),state=(...keys)=>modelState(b,...keys),mats=buildBlockMaterials(b);
  const woodAlias=modelTextureAlias(b,2),frontAlias=modelTextureAlias(b,4),sideAlias=modelTextureAlias(b,0);
  const frontMat=modelMat(frontAlias,b,{transparent:true,alphaTest:.02}),woodMat=modelMat(woodAlias,b);
  const opaque=opts=>({transparent:false,...opts});
  const cardinal=state('minecraft:cardinal_direction','cardinal_direction','facing','facing_direction')??'south';
  if(kind==='sign'){
    const placement=modelResolveSignPlacement(b),wall=placement.wall,hanging=placement.hanging;
    const alias=woodAlias,boardW=hanging?.92:.94,boardH=hanging?.43:.56,boardDepth=hanging?.075:.065;
    const addBoardTrim=(host,centerY)=>{
      const trim=modelColorMat(0x765034),edge=modelColorMat(0x4e3527);
      for(const y of [-1,1])modelAddBox(host,b,[boardW+.012,.018,.012],[0,centerY+y*(boardH/2-.009),0],alias);
      for(const x of [-1,1])modelAddBox(host,b,[.014,boardH,.012],[x*(boardW/2-.007),centerY,0],alias);
      modelAddBox(host,b,[boardW-.035,.009,.008],[0,centerY-boardH*.30,boardDepth*.48],alias);
                                                                                   
      for(const x of [-1,1])addTrackedMesh(host,new THREE.CylinderGeometry(.006,.006,.018,6),edge,[x*(boardW/2-.025),centerY,boardDepth*.50]);
      return {trim,edge};
    };
    const finishBoard=(host,centerY,frontOffset=0)=>{
                                                                           
      modelAddFaceTexturedBox(host,b,[boardW,boardH,boardDepth],[0,centerY,0],alias,0x513a2a);
      addBoardTrim(host,centerY);
                                                                           
      for(const x of [-.245,-.082,.082,.245]){
        if(Math.abs(x)>=boardW*.43)continue;
        const seam=modelColorMat(0x4a3023,{transparent:true,opacity:.30,depthWrite:false});
        addShapeBox(host,b,[.003,boardH*.68,.002],[x,centerY,boardDepth/2+.001],[0,0,0],Array(6).fill(seam));
      }
      addSignFaceText(host,b,centerY,boardW-.07,boardH-.09,boardDepth,'front');
      if(readSignFaceData(b,'back').text)addSignFaceText(host,b,centerY,boardW-.07,boardH-.09,boardDepth,'back');
    };
    if(wall){
      const normal=placement.normal,wallHanging=placement.wallHanging;
      const panel=new THREE.Group();modelAttachGroup(panel,normal);panel.position.set(normal[0]*.462,normal[1]*.462,normal[2]*.462);group.add(panel);
      finishBoard(panel,.02);
      const bracket=modelColorMat(0x554b3d);
      for(const x of [-.30,.30]){
        modelAddStick(panel,b,[x,-.13,-.005],[x,-.13,-.105],wallHanging?.022:.016,null);
        addTrackedMesh(panel,new THREE.CylinderGeometry(.018,.018,.025,8),bracket,[x,-.13,-.108],[Math.PI/2,0,0]);
      }
      if(wallHanging)modelAddStick(panel,b,[-.30,.31,-.11],[.30,.31,-.11],.022,null);
    }else if(hanging){
      group.rotation.y=placement.yaw;
      const attached=placement.attached,metal=modelColorMat(0x55595d);
      if(attached){
        for(const x of [-.28,.28]){
          modelAddStick(group,b,[x,.50,0],[x,.27,0],.018,null);
          addTrackedMesh(group,new THREE.TorusGeometry(.028,.009,5,10),metal,[x,.50,0],[Math.PI/2,0,0]);
        }
      }else{
        for(const x of [-.28,.28]){
          modelAddStick(group,b,[x,.50,0],[x,.29,0],.018,null);
          addTrackedMesh(group,new THREE.TorusGeometry(.03,.009,5,10),metal,[x,.50,0],[Math.PI/2,0,0]);
        }
        modelAddStick(group,b,[-.39,.48,0],[.39,.48,0],.026,null);
      }
      modelAddBox(group,b,[boardW,.075,.085],[0,.205,0],alias,{transparent:false});
      finishBoard(group,-.09);
    }else{
      group.rotation.y=placement.yaw;
      modelAddCylinder(group,b,.031,.046,.49,[0,-.255,0],alias,8);
      modelAddBox(group,b,[.115,.045,.105],[0,-.39,0],alias,{transparent:false});
      finishBoard(group,.16);
      const brace=modelColorMat(0x775239);
      for(const x of [-.30,.30]){
        const support=addTrackedMesh(group,new THREE.CylinderGeometry(.009,.014,.17,6),brace,[x*.72,-.025,0]);support.rotation.z=x<0?-.35:.35;
      }
    }
    return true;
  }
  if(kind==='banner'){
    const wall=n==='wall_banner'||n.endsWith('_wall_banner');
    const cloth=modelColorMat(0xf3eee1,{transparent:true,opacity:.96,side:THREE.DoubleSide});
    if(wall){const normal=modelFacingNormal(state('facing_direction','minecraft:facing_direction','minecraft:cardinal_direction','cardinal_direction')??2,'north');const panel=new THREE.Group();modelAttachGroup(panel,normal);panel.position.set(normal[0]*.46,normal[1]*.46,normal[2]*.46);group.add(panel);modelAddBox(panel,b,[.80,.95,.045],[0,0,0],woodAlias);addTrackedMesh(panel,new THREE.PlaneGeometry(.72,.88),cloth,[0,.04,.026]);}
    else{group.rotation.y=modelFacingYawFrom16(state('ground_sign_direction')??0);modelAddCylinder(group,b,.025,.03,1,[0,0,0],woodAlias,8);modelAddBox(group,b,[.78,.94,.035],[0,.01,0],woodAlias);addTrackedMesh(group,new THREE.PlaneGeometry(.74,.90),cloth,[0,.02,.021]);}
    return true;
  }
  if(kind==='head'){
    const wall=n.includes('wall_')||String(state('facing_direction')??'').match(/^[2345]$/);
    const yaw=modelFacingYawFrom16(state('minecraft:sixteen_way_rotation','ground_sign_direction')??0);
    const headAlias=n.includes('creeper')?'green_concrete':n.includes('zombie')?'mossy_cobblestone':n.includes('dragon')?'obsidian':'bone_block_side';
    const addFaceDetails=host=>{const dark=modelColorMat(0x242326);if(n.includes('creeper')){for(const x of [-.10,.10])modelAddBox(host,b,[.075,.075,.018],[x,-.10,.22],null,{color:0x202020});modelAddBox(host,b,[.22,.045,.018],[0,-.22,.22],null,{color:0x202020});}else if(n.includes('skeleton')||n.includes('wither')){for(const x of [-.105,.105])modelAddBox(host,b,[.075,.06,.018],[x,-.07,.22],null);modelAddBox(host,b,[.045,.06,.018],[0,-.18,.22],null);}else if(n.includes('zombie')){for(const x of [-.105,.105])modelAddBox(host,b,[.07,.045,.018],[x,-.08,.22],null);}};
    if(wall){const normal=modelFacingNormal(state('facing_direction','minecraft:facing_direction')??2,'north');const holder=new THREE.Group();modelAttachGroup(holder,normal);holder.position.set(normal[0]*.48,normal[1]*.48,normal[2]*.48);group.add(holder);modelAddBox(holder,b,[.48,.43,.42],[0,-.015,-.12],headAlias);modelAddBox(holder,b,[.28,.13,.16],[0,-.20,.02],headAlias);addFaceDetails(holder);}
    else{group.rotation.y=yaw;const scale=n.includes('dragon')?1.2:1;modelAddBox(group,b,[.48*scale,.43*scale,.42*scale],[0,-.18,0],headAlias);modelAddBox(group,b,[.28*scale,.13*scale,.16*scale],[0,-.37,.12*scale],headAlias);addFaceDetails(group);}
    return true;
  }
  if(kind==='chest'){
    const yaw=modelDirectionYaw(b,cardinal);group.rotation.y=yaw;
    const pair=modelChestPairInfo(b,yaw),doubleChest=!!pair;
    const width=doubleChest?.9375:.875,depth=.875,wall=.075,bodyH=.625;
    const descriptors=getBlockFaceDescriptors(b),frontAlias=descriptors[4]?.alias||'chest_inventory_front';
    const sideAlias=descriptors[5]?.alias||'chest_inventory_side';
    const topAlias=descriptors[2]?.alias||'chest_inventory_top';
    const dark=modelColorMat(n.includes('ender_chest')?0x171324:0x24180f);
    const side=modelMat(sideAlias,b),top=modelMat(topAlias,b);
    const bodyFront=doubleChest?side:modelCropTextureMaterial(frontAlias,b,.6875,0,{transparent:false});
    const lidFront=modelCropTextureMaterial(frontAlias,b,.3125,.6875,{transparent:false});
                                                                                                       
    const floorMats=[side,side,dark,top,side,side];
    addShapeBox(group,b,[width,.075,depth],[0,-.4625,0],[0,0,0],floorMats);
                                                                                   
    const frontMats=[side,side,dark,dark,bodyFront,dark];
    addShapeBox(group,b,[width,bodyH,wall],[0,-.1875,depth/2-wall/2],[0,0,0],frontMats);
                                                                                   
    const backMats=[side,side,dark,dark,dark,side];
    addShapeBox(group,b,[width,bodyH,wall],[0,-.1875,-depth/2+wall/2],[0,0,0],backMats);
    const leftMats=[dark,side,dark,dark,side,side],rightMats=[side,dark,dark,dark,side,side];
    addShapeBox(group,b,[wall,bodyH,depth-2*wall],[-width/2+wall/2,-.1875,0],[0,0,0],leftMats);
    addShapeBox(group,b,[wall,bodyH,depth-2*wall],[width/2-wall/2,-.1875,0],[0,0,0],rightMats);

                                                                          
    const lidPivot=new THREE.Group();lidPivot.userData.blockRef=b;lidPivot.position.set(0,.125,-depth/2);group.add(lidPivot);
    const lidTopMats=[side,side,top,side,side,side];
    addShapeBox(lidPivot,b,[width,.055,depth],[0,.285,depth/2],[0,0,0],lidTopMats);
    const lidFrontMats=[side,side,dark,dark,lidFront,dark];
    const lidBackMats=[side,side,dark,dark,dark,side];
    addShapeBox(lidPivot,b,[width,.257,wall],[0,.1535,depth-wall/2],[0,0,0],lidFrontMats);
    addShapeBox(lidPivot,b,[width,.257,wall],[0,.1535,wall/2],[0,0,0],lidBackMats);
    addShapeBox(lidPivot,b,[wall,.257,depth-2*wall],[-width/2+wall/2,.1535,depth/2],[0,0,0],leftMats);
    addShapeBox(lidPivot,b,[wall,.257,depth-2*wall],[width/2-wall/2,.1535,depth/2],[0,0,0],rightMats);
    if(modelBool(state('open_bit','is_open','open')))lidPivot.rotation.x=-Math.PI*.46;
    const hingeMat=modelColorMat(n.includes('ender_chest')?0x454b55:n.includes('copper_chest')?0x9a653d:0x76542f);
    for(const x of [-width*.31,width*.31])addShapeBox(lidPivot,b,[.065,.045,.045],[x,.015,.035],[0,0,0],Array(6).fill(hingeMat));
    if(doubleChest&&pair.sign===1){
                                                                 
      const gold=modelColorMat(n.includes('copper_chest')?0xb87336:0xc0a05b),darkLock=modelColorMat(0x3e3328);
      addShapeBox(group,b,[.07,.13,.035],[.445,-.045,.445],[0,0,0],Array(6).fill(gold));
      addShapeBox(group,b,[.032,.068,.018],[.445,-.050,.469],[0,0,0],Array(6).fill(darkLock));
      addShapeBox(group,b,[.024,.028,.018],[.445,.004,.469],[0,0,0],Array(6).fill(gold));
    }
    return true;
  }
  if(kind==='barrel'){
    const facing=state('facing_direction','minecraft:cardinal_direction')??'up';const normal=modelFacingNormal(facing,'up');
    modelAddBox(group,b,[.88,.88,.88],[0,0,0],null);
    if(normal[1]!==0){
      const lid=new THREE.Group();group.add(lid);lid.position.set(0,normal[1]*.42,0);
      modelAddBox(lid,b,[.88,.075,.88],[0,0,0],'barrel_top');
      if(modelBool(state('open_bit'))){lid.rotation.x=normal[1]>0?-Math.PI/2:Math.PI/2;lid.position.z=normal[1]>0?.40:-.40;}
    }else{
      const lid=new THREE.Group();modelAttachGroup(lid,normal);group.add(lid);lid.position.set(0,0,0);
      modelAddBox(lid,b,[.88,.88,.075],[0,0,-.40],'barrel_side');
      if(modelBool(state('open_bit')))lid.rotation.x=Math.PI/2;
    }
    return true;
  }
  if(kind==='bed'){
    group.rotation.y=modelDirectionYaw(b,cardinal);
    const colorRaw=state('color','bed_color');const colorNames=['white','orange','magenta','light_blue','yellow','lime','pink','gray','light_gray','cyan','purple','blue','brown','green','red','black'];
    const color=typeof colorRaw==='string'?colorRaw:colorNames[modelNumber(colorRaw,14)]||'red';
    const mattressAlias=`${color}_wool`;const plankAlias='oak_planks';
    modelAddBox(group,b,[.94,.22,.94],[0,-.28,0],mattressAlias);
    modelAddBox(group,b,[.94,.07,.94],[0,-.425,0],plankAlias);
    const head=modelBool(state('head_piece_bit'));
    const endZ=head?.39:-.39;
    modelAddBox(group,b,[.92,.16,.055],[0,-.19,endZ],mattressAlias);
    for(const x of [-.39,.39])for(const z of [-.39,.39])modelAddBox(group,b,[.09,.18,.09],[x,-.405,z],plankAlias);
    if(head)modelAddBox(group,b,[.58,.075,.23],[0,-.10,.20],mattressAlias);
    return true;
  }
  if(kind==='bookshelf'){
    const chiseled=n==='chiseled_bookshelf';
    modelAddBox(group,b,[.94,.94,.94],[0,0,0],chiseled?'chiseled_bookshelf_side':'bookshelf');
    const wood=modelMat('oak_planks',b),colors=[0x884b2b,0x315b8a,0x55753b,0x8b743e,0x633b82,0x9b3f35];
    if(chiseled){
      for(let row=0;row<2;row++)for(let col=0;col<3;col++){
        const mat=modelColorMat(colors[(row*3+col)%colors.length]);addShapeBox(group,b,[.22,.32,.07],[-.29+col*.29,.20-row*.38,.46],[mat,mat,mat,mat,mat,mat]);
      }
    }else{
      for(let row=0;row<3;row++){
        modelAddBox(group,b,[.92,.045,.92],[0,-.31+row*.31,0],'oak_planks');
        for(let col=0;col<5;col++){
          const mat=modelColorMat(colors[(col+row*2)%colors.length]);addShapeBox(group,b,[.115,.23,.38],[-.36+col*.18,-.17+row*.31,.24],[mat,mat,mat,mat,mat,mat]);
        }
      }
    }
    return true;
  }
  if(kind==='hopper'){
    const f=state('facing_direction')??0;const dir=modelFacingNormal(f,'down');
    for(const x of [-.38,.38])modelAddBox(group,b,[.10,.10,.86],[x,.43,0],'hopper_top');for(const z of [-.38,.38])modelAddBox(group,b,[.66,.10,.10],[0,.43,z],'hopper_top');
    const wallMat=modelMat('hopper_outside',b);
    const funnel=addTrackedMesh(group,new THREE.CylinderGeometry(.13,.43,.43,4,1,true),wallMat,[0,.14,0]);funnel.rotation.y=Math.PI/4;
    modelAddBox(group,b,[.17,.18,.17],[0,-.20,0],'hopper_outside');
    modelAddCylinder(group,b,.085,.085,.22,[0,-.40,0],'hopper_inside',8);
    if(dir[1]===0){const spout=new THREE.Group();modelAttachGroup(spout,dir);group.add(spout);modelAddBox(spout,b,[.18,.19,.25],[0,-.28,.08],'hopper_outside');}
    return true;
  }
  if(kind==='brewing_stand'){
    modelAddCylinder(group,b,.42,.42,.10,[0,-.43,0],'brewing_stand_base',12);
    modelAddCylinder(group,b,.045,.045,.60,[0,-.08,0],'brewing_stand',8);
    modelAddCylinder(group,b,.20,.13,.055,[0,.17,0],'brewing_stand',8);
    for(let i=0;i<3;i++){const a=i*Math.PI*2/3;const x=Math.cos(a)*.27,z=Math.sin(a)*.27;modelAddStick(group,b,[0,.12,0],[x,.05,z],.025,'brewing_stand');modelAddCylinder(group,b,.075,.09,.20,[x,-.15,z],'brewing_stand',8);}
    return true;
  }
  if(kind==='anvil'){
    group.rotation.y=modelDirectionYaw(b,cardinal);
    const top=n==='damaged_anvil'?'damaged_anvil_top':n==='chipped_anvil'?'chipped_anvil_top':'anvil_top';
    modelAddBox(group,b,[.72,.18,.66],[0,-.39,0],'flattened_anvil_base');
    modelAddBox(group,b,[.40,.42,.43],[0,-.08,0],'flattened_anvil_base');
    modelAddBox(group,b,[.96,.20,.62],[0,.23,0],top);
    return true;
  }
  if(kind==='grindstone'){
    const attachment=String(state('attachment')||'standing').toLowerCase();group.rotation.y=modelDirectionYaw(b,cardinal);
    const wheel=new THREE.Group();group.add(wheel);
    const axis=attachment.includes('wall')?[0,0,1]:[1,0,0];
    const disc=modelAddCylinder(wheel,b,.36,.36,.13,[0,0,0],'grindstone_round',20,[Math.PI/2,0,0]);
    disc.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(...axis));
    const side1=[-axis[0]*.34,-.22,-axis[2]*.34],side2=[axis[0]*.34,-.22,axis[2]*.34];
    modelAddStick(group,b,side1,[side1[0],.25,side1[2]],.055,'grindstone_leg');modelAddStick(group,b,side2,[side2[0],.25,side2[2]],.055,'grindstone_leg');
    modelAddStick(group,b,[side1[0],.24,side1[2]],[side2[0],.24,side2[2]],.045,'grindstone_pivot');
    return true;
  }
  if(kind==='campfire'){
    const log=n==='soul_campfire'?'soul_campfire_log_lit':'campfire_log_lit';
    const logMat=modelMat(log,b);modelAddBox(group,b,[.88,.13,.18],[0,-.34,0],log);const cross=modelAddBox(group,b,[.18,.13,.88],[0,-.34,0],log);
    modelAddBox(group,b,[.72,.10,.16],[0,-.22,0],'campfire_log');modelAddBox(group,b,[.16,.10,.72],[0,-.22,0],'campfire_log');
    const extinguished=modelBool(state('extinguished','extinguished_bit'));
    if(!extinguished){const flame=modelMat(n==='soul_campfire'?'soul_campfire_fire':'campfire_fire',b,{transparent:true,alphaTest:.025,depthWrite:false});const f=addTrackedMesh(group,new THREE.PlaneGeometry(.8,.8),flame,[0,.10,0]);f.rotation.y=Math.PI/4;const f2=addTrackedMesh(group,new THREE.PlaneGeometry(.8,.8),flame,[0,.10,0]);f2.rotation.y=-Math.PI/4;}
    return true;
  }
  if(kind==='lantern'){
    const hanging=modelBool(state('hanging'));
    const alias=n==='soul_lantern'?'soul_lantern':n.includes('copper')?n:'lantern';
    const metal=modelColorMat(0x4a555e),glass=modelMat(alias,b,{transparent:true,alphaTest:.025,depthWrite:false});
    if(hanging)modelAddStick(group,b,[0,.50,0],[0,.34,0],.025,'chain');
    modelAddBox(group,b,[.34,.34,.34],[0,-.02,0],alias,{transparent:true,alphaTest:.02});
    for(const x of [-.19,.19])for(const z of [-.19,.19])addShapeBox(group,b,[.035,.43,.035],[x,-.02,z],[metal,metal,metal,metal,metal,metal]);
    modelAddBox(group,b,[.42,.055,.42],[0,.22,0],alias);modelAddBox(group,b,[.42,.055,.42],[0,-.25,0],alias);
    modelAddCylinder(group,b,.11,.14,.055,[0,.27,0],alias,8);
    return true;
  }
  if(kind==='stairs'){
    const upside=modelBool(state('upside_down_bit'));const dir=modelNumber(state('weirdo_direction','direction'),0);
    const yaw=({0:Math.PI/2,1:-Math.PI/2,2:0,3:Math.PI})[dir]??0;group.rotation.y=yaw;
    const lowerY=upside?.25:-.25;modelAddBox(group,b,[1,.5,1],[0,lowerY,0]);
    const stepY=upside?-.125:.125;const corner=String(state('minecraft:corner','corner')||'none').toLowerCase();
    if(corner==='outer_left'||corner==='outer_right'){
      const side=corner.endsWith('left')?-.25:.25;modelAddBox(group,b,[.50,.5,.50],[side,stepY,.25]);
    }else{
      modelAddBox(group,b,[1,.5,.5],[0,stepY,.25]);
      if(corner==='inner_left'||corner==='inner_right'){const side=corner.endsWith('left')?-.25:.25;modelAddBox(group,b,[.5,.5,.5],[side,stepY,-.25]);}
    }
    return true;
  }
  if(kind==='button'){
    modelBuildButton(group,b,modelResolveButtonPlacement(b));
    return true;
  }
  if(kind==='lever'){addDetailedLeverModel(group,b);return true;}
  if(kind==='fence_gate'){
    const open=modelBool(state('open_bit'));const inWall=modelBool(state('in_wall_bit'));
    group.rotation.y=modelFenceGateYaw(b,cardinal)+(open?Math.PI/2:0);
    for(const x of [-.40,.40])modelAddBox(group,b,[.14,.86,.14],[x,-.02,0]);
    for(const y of [inWall?-.18:-.20,.20])modelAddBox(group,b,[.82,.12,.12],[0,y,0]);
    return true;
  }
  if(kind==='fence'||kind==='wall'||kind==='pane'){
    const isPane=kind==='pane',isWall=kind==='wall';const post=isPane?.065:isWall?.25:.18;const rail=isPane?.055:isWall?.20:.12;
    if(isWall){const postBit=state('wall_post_bit');if(postBit===undefined||modelBool(postBit))modelAddBox(group,b,[.32,.98,.32],[0,0,0]);}
    else modelAddBox(group,b,[post,1,post],[0,0,0]);
    const dirSpecs=[['east',[1,0,0]],['west',[-1,0,0]],['north',[0,0,-1]],['south',[0,0,1]]];
    for(const [name,v] of dirSpecs){const connected=modelConnected(b,name);if(!connected)continue;
      if(isPane){modelAddBox(group,b,[v[0]!==0?.50:post,.94,v[2]!==0?.50:post],[v[0]*.25,0,v[2]*.25]);}
      else if(isWall){const conn=String(state(`wall_connection_type_${name}`)||'low').toLowerCase();const tall=conn==='tall';modelAddBox(group,b,[v[0]!==0?.50:rail,tall?.96:.68,v[2]!==0?.50:rail],[v[0]*.25,tall?0:-.10,v[2]*.25]);}
      else{for(const yy of [-.20,.20])modelAddBox(group,b,[v[0]!==0?.50:rail,.12,v[2]!==0?.50:rail],[v[0]*.27,yy,v[2]*.27]);}
    }
    return true;
  }
  if(kind==='redstone_wire'){
    const signal=Math.max(0,Math.min(15,modelNumber(state('redstone_signal','signal_strength'),0)));
    const strength=signal/15,red=Math.round(96+159*strength),green=Math.round(12+18*strength),blue=Math.round(14+10*strength);
    const dust=modelColorMat((red<<16)|(green<<8)|blue,{toneMapped:false,side:THREE.DoubleSide});
    const shadow=modelColorMat(0x32191b,{toneMapped:false,side:THREE.DoubleSide}),y=-.476,thick=.014;
    const modes={north:modelRedstoneDirectionMode(b,'north'),south:modelRedstoneDirectionMode(b,'south'),east:modelRedstoneDirectionMode(b,'east'),west:modelRedstoneDirectionMode(b,'west')};
    const active=Object.entries(modes).filter(([,mode])=>mode!=='none').map(([dir,mode])=>({dir,mode}));
    const addRibbon=(points,width,material)=>{
      const positions=[],indices=[];
      for(let i=0;i<points.length;i++){
        const p=points[i],prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
        const dx=next[0]-prev[0],dz=next[2]-prev[2],len=Math.hypot(dx,dz)||1,ox=-dz/len*width*.5,oz=dx/len*width*.5;
        positions.push(p[0]+ox,p[1],p[2]+oz,p[0]-ox,p[1],p[2]-oz);
      }
      for(let i=0;i<points.length-1;i++){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
      addTrackedMesh(group,geometry,material,[0,0,0]);
    };
    if(!active.length){
      addShapeBox(group,b,[.13,thick,.13],[0,y,0],[0,0,0],Array(6).fill(dust));
      addTrackedMesh(group,new THREE.SphereGeometry(.07,8,4),dust,[0,y+.012,0]);
    }else{
      addShapeBox(group,b,[.15,thick,.15],[0,y,0],[0,0,0],Array(6).fill(dust));
      for(const {dir,mode} of active){
        const isUp=mode==='up'||mode==='tall';let points;
        if(dir==='north')points=isUp?[[0,y+.01,0],[0,y+.055,-.20],[0,y+.105,-.49]]:[[0,y+.01,0],[0,y+.01,-.25],[0,y+.01,-.49]];
        else if(dir==='south')points=isUp?[[0,y+.01,0],[0,y+.055,.20],[0,y+.105,.49]]:[[0,y+.01,0],[0,y+.01,.25],[0,y+.01,.49]];
        else if(dir==='east')points=isUp?[[0,y+.01,0],[.20,y+.055,0],[.49,y+.105,0]]:[[0,y+.01,0],[.25,y+.01,0],[.49,y+.01,0]];
        else points=isUp?[[0,y+.01,0],[-.20,y+.055,0],[-.49,y+.105,0]]:[[0,y+.01,0],[-.25,y+.01,0],[-.49,y+.01,0]];
        addRibbon(points,.105,dust);
        if(isUp)addTrackedMesh(group,new THREE.SphereGeometry(.052,7,5),dust,points[points.length-1]);
      }
    }
    addShapeBox(group,b,[.19,.008,.19],[0,y-.012,0],[0,0,0],Array(6).fill(shadow));
    return true;
  }
  return false;
}

function makeSpecialBlockObject(b,attachToScene=true){
  const {THREE}=threeLib,kind=shapeKindForBlock(b);if(!kind)return null;
  const group=new THREE.Group();group.userData.blockRef=b;group.position.set(b.x+.5,b.y+.5+(b.layer?1.08:0),b.z+.5);
                                                                        
                                                                              
                                         
  if(attachToScene){
    if(!specialHitboxGeometry)specialHitboxGeometry=new THREE.BoxGeometry(1,1,1);
    if(!specialHitboxMaterial)specialHitboxMaterial=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,colorWrite:false,depthWrite:false,side:THREE.DoubleSide});
    const hitbox=new THREE.Mesh(specialHitboxGeometry,specialHitboxMaterial);hitbox.userData.blockRef=b;group.add(hitbox);
  }
  if(buildExtractedSpecialBlockModel(group,b,kind)){if(attachToScene){scene.add(group);pickTargets.push({mesh:group,block:b});}return group;}
  const mats=buildBlockMaterials(b),short=blockRenderName(b),state=(...keys)=>blockStateValue(b,...keys);
  if(renderAdvancedShape(group,b,kind)){if(attachToScene){scene.add(group);pickTargets.push({mesh:group,block:b});}return group;}
  const up=[0,1,0],normal=(value)=>directionNormal(value,up),rotY=(v)=>({0:0,1:-Math.PI/2,2:Math.PI,3:Math.PI/2})[Number(v)]||0;

  if(kind==='torch'){
    const redstone=short.includes('redstone'),litState=state('lit'),unlit=short.includes('unlit')||(litState!==undefined&&!modelBool(litState))||modelBool(state('unlit_bit'));
    const soul=short.includes('soul'),copper=short.includes('copper');
    const facing=state('torch_facing_direction','facing_direction')??'top';
    const dir=normal(facing),upright=dir[1]>.5;
    const axis=upright?[0,1,0]:[dir[0]*.40,.92,dir[2]*.40];
    const axisLength=Math.hypot(...axis)||1,axisN=axis.map(v=>v/axisLength);
    const startPoint=upright?[0,-.47,0]:[-dir[0]*.40,-.29,-dir[2]*.40];
    const center=startPoint.map((v,i)=>v+axisN[i]*.22);
    const torchBody=new THREE.Group();torchBody.userData.blockRef=b;torchBody.position.set(...center);
    torchBody.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(...axisN));group.add(torchBody);
                                                                                                
    addGeometricTorchHead(torchBody,b,{redstone,lit:!unlit,soul,copper});
  }else if(kind==='button'){
    const facing=state('facing_direction','minecraft:facing_direction','minecraft:cardinal_direction')??2;
    const n=normal(facing),pressed=modelBool(state('button_pressed_bit','pressed_bit'));
    const mount=new THREE.Group();mount.userData.blockRef=b;
    mount.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(...n));group.add(mount);
    const woodButton=short.includes('wooden')||/(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|bamboo|crimson|warped)_button/.test(short);
    const plateMat=modelColorMat(0x555b61),rimMat=modelColorMat(0x292f35);
    const capMat=modelColorMat(woodButton?0x946b45:0x92999e),capSide=modelColorMat(woodButton?0x62452f:0x626a70);
    addTrackedMesh(mount,new THREE.BoxGeometry(.34,.29,.065),plateMat,[0,0,.425]);
    addTrackedMesh(mount,new THREE.BoxGeometry(.30,.25,.018),rimMat,[0,0,.465]);
    addTrackedMesh(mount,new THREE.BoxGeometry(.235,.185,pressed?.035:.075),capMat,[0,0,pressed?.493:.525]);
    for(const x of [-.125,.125])for(const y of [-.105,.105]){
      addTrackedMesh(mount,new THREE.CylinderGeometry(.012,.012,.008,8),capSide,[x,y,.48],[Math.PI/2,0,0]);
    }
  }else if(kind==='lever'){
    addDetailedLeverModel(group,b);
  }else if(kind==='pressure_plate'||kind==='carpet'||kind==='snow_layer'){
    let h=kind==='pressure_plate'?.0625:kind==='carpet'?.0625:Math.max(.125,Math.min(1,((Number(state('height'))||0)+1)/8));
    const pressed=!!state('redstone_signal','powered_bit');if(kind==='pressure_plate'&&pressed)h=.045;
    addShapeBox(group,b,[.98,h,.98],[0,-.5+h/2,0],[0,0,0],mats);
  }else if(kind==='slab'){
    const top=!!state('top_slot_bit','upside_down_bit')||String(state('minecraft:vertical_half')||'').toLowerCase()==='top';
    const h=.5,y=top?.25:-.25;addShapeBox(group,b,[1,h,1],[0,y,0],[0,0,0],mats);
  }else if(kind==='trapdoor'){
    const open=!!state('open_bit'),top=!!state('upside_down_bit');
    if(!open)addShapeBox(group,b,[.98,.125,.98],[0,top?.4375:-.4375,0],[0,0,0],mats);
    else{
      const d=Number(state('direction','weirdo_direction'))||0;const angle=rotY(d);
      const ox=-.4375*Math.sin(angle),oz=-.4375*Math.cos(angle);
      addShapeBox(group,b,[.98,.98,.125],[ox,0,oz],[0,angle,0],mats);
    }
  }else if(kind==='ladder'){
    const facing=state('facing_direction','direction','minecraft:cardinal_direction')??'north',n=normal(facing);
    const mat=getShapeTextureMaterial('ladder',b,{transparent:true,alphaTest:.04,depthWrite:false});
    const plane=addShapePlane(group,new THREE.PlaneGeometry(.92,.92),mat,[n[0]*.485,0,n[2]*.485]);
    plane.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(...n));
  }else if(kind==='rail'){
    const d=modelNumber(state('rail_direction','weirdo_direction'),0);
    const poweredRail=short==='powered_rail',detectorRail=short==='detector_rail',activatorRail=short==='activator_rail';
    const railGroup=new THREE.Group();railGroup.userData.blockRef=b;group.add(railGroup);
    let yaw=0,tilt=0;
    if(d===1)yaw=Math.PI/2;
    else if(d===2){yaw=Math.PI/2;tilt=Math.PI/6;}
    else if(d===3){yaw=-Math.PI/2;tilt=Math.PI/6;}
    else if(d===4)tilt=-Math.PI/6;
    else if(d===5)tilt=Math.PI/6;
    else if(d>=6&&d<=9)yaw=({6:Math.PI/4,7:-Math.PI/4,8:-3*Math.PI/4,9:3*Math.PI/4})[d];
    railGroup.rotation.set(tilt,yaw,0);
    const tieMat=modelMat('oak_planks',b),railColor=poweredRail?0xb78b38:0x87909a;
    const railMat=modelColorMat(railColor),poweredMat=modelColorMat(modelBool(state('rail_data_bit','powered_bit'))?0xff4b34:0x6b2422);
    for(const z of [-.36,-.18,0,.18,.36])addShapeBox(railGroup,b,[.78,.045,.095],[0,-.455,z],[0,0,0],Array(6).fill(tieMat));
    for(const x of [-.32,.32]){
      addShapeBox(railGroup,b,[.06,.055,.94],[x,-.385,0],[0,0,0],Array(6).fill(railMat));
      for(const z of [-.36,.36])addShapeBox(railGroup,b,[.085,.075,.075],[x,-.425,z],[0,0,0],Array(6).fill(railMat));
    }
    if(poweredRail||detectorRail||activatorRail){
      const centerColor=poweredRail?poweredMat:modelColorMat(activatorRail?0x7b6b3e:0x665f58);
      addShapeBox(railGroup,b,[.16,.026,.72],[0,-.414,0],[0,0,0],Array(6).fill(centerColor));
    }
  }else if(kind==='redstone_device'){
    group.rotation.y=modelRedstoneDeviceYaw(b);
    const deviceState=modelResolveRedstoneDeviceState(b);
    const isComparator=deviceState.kind==='comparator',powered=deviceState.powered,subtract=deviceState.subtract,delay=deviceState.delay;
    modelAddRedstoneDeviceBase(group,b,isComparator?'comparator':'repeater');
    const railColor=isComparator?(subtract?0x76538c:0x8a3b34):0x8c3932;
    modelAddRedstoneRail(group,b,-.005,railColor);
    const stoneEdge=modelColorMat(0x77736c),brass=modelColorMat(0x9b8260),dark=modelColorMat(0x4a4641);
    if(isComparator){
                                                                         
                                                                              
      modelAddRedstoneTorchCarrier(group,b,-.235,-.205,true,'comparator');
      modelAddRedstoneTorchCarrier(group,b,.235,-.205,true,'comparator');
      modelAddRedstoneTorchCarrier(group,b,0,.235,powered,'comparator');
      addTrackedMesh(group,new THREE.BoxGeometry(.22,.026,.12),[dark,dark,brass,dark,brass,brass],[0,-.325,.015]);
      const selectorX=subtract?.18:-.18;
      addTrackedMesh(group,new THREE.CylinderGeometry(.022,.022,.025,10),brass,[selectorX,-.30,-.015]);
      const selector=addTrackedMesh(group,new THREE.BoxGeometry(.035,.065,.045),subtract?modelColorMat(0x9b76b5):stoneEdge,[selectorX,-.265,-.015]);
      selector.rotation.z=subtract?-.12:.12;
      addTrackedMesh(group,new THREE.BoxGeometry(.055,.009,.055),modelColorMat(powered?0xe94c38:0x60312d,{toneMapped:false}),[0,-.315,.35]);
    }else{
                                                                             
      const firstZ=-.255,secondZ=.10+delay*.075;
      addTrackedMesh(group,new THREE.BoxGeometry(.12,.026,.56),[dark,dark,stoneEdge,dark,dark,dark],[0,-.315,-.015]);
      for(const x of [-.095,.095])addTrackedMesh(group,new THREE.BoxGeometry(.024,.034,.56),[dark,dark,brass,dark,dark,dark],[x,-.305,-.015]);
      modelAddRedstoneTorchCarrier(group,b,0,firstZ,!powered,'repeater');
      modelAddRedstoneTorchCarrier(group,b,0,secondZ,powered,'repeater');
      addTrackedMesh(group,new THREE.BoxGeometry(.105,.025,.10),[dark,dark,brass,dark,dark,dark],[0,-.304,secondZ]);
      addTrackedMesh(group,new THREE.BoxGeometry(.045,.009,.045),modelColorMat(powered?0xe94c38:0x60312d,{toneMapped:false}),[0,-.315,.39]);
                                                                           
      const mark=modelColorMat(0x4a3d35);
      for(let i=0;i<4;i++)addTrackedMesh(group,new THREE.BoxGeometry(.012,.006,.028),i===delay?brass:mark,[-.30+i*.20,-.355,-.34]);
    }
  }else if(kind==='stairs'){
    const top=!!state('upside_down_bit');const dir=Number(state('weirdo_direction','direction'))||0;const rot=rotY(dir);
    const baseY=top ? .25 : -.25,stepY=top ? -.125 : .125;
    const stepX=-.25*Math.sin(rot),stepZ=-.25*Math.cos(rot);
    addShapeBox(group,b,[1,.5,1],[0,baseY,0],[0,rot,0],mats);
    addShapeBox(group,b,[1,.5,.5],[stepX,stepY,stepZ],[0,rot,0],mats);
  }else if(kind==='door'){
    const top=!!state('upper_block_bit');const dir=Number(state('direction','weirdo_direction'))||0;const open=!!state('open_bit');
    const panel=addShapeBox(group,b,[.98,1,.10],[0,0,0],[0,rotY(dir)+(open?Math.PI/2:0),0],mats);
    panel.userData.blockRef=b;
  }else if(kind==='pane'||kind==='fence'||kind==='fence_gate'||kind==='wall'){
    const glass=kind==='pane';const fence=kind==='fence'||kind==='fence_gate';
    const postW=glass?.07:fence?.22:.28;const railW=glass?.07:fence?.12:.18;
    const vertical=addShapeBox(group,b,[postW,1,postW],[0,0,0],[0,0,0],mats);
    if(glass){
      const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
      for(const [dx,dz] of dirs)if(blockHasNeighbor(b,dx,0,dz))addShapeBox(group,b,[dx!==0?.5:postW,.94,dz!==0?.5:postW],[dx*.25,0,dz*.25],[0,0,0],mats);
    }else{
      for(const y of [-.22,.18]){
        if(kind==='fence_gate')addShapeBox(group,b,[.88,.10,.10],[0,y,0],[0,0,0],mats);
        else for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])if(blockHasNeighbor(b,dx,0,dz))addShapeBox(group,b,[dx!==0?.42:railW,.11,dz!==0?.42:railW],[dx*.27,y,dz*.27],[0,0,0],mats);
      }
    }
  }else if(kind==='plant'){
    const desc=getBlockFaceDescriptors(b)[2]||getBlockFaceDescriptors(b).find(x=>x.asset);
    const alias=desc?.alias||'tallgrass';
    const mat=getShapeTextureMaterial(alias,b,{transparent:true,alphaTest:.025,depthWrite:false});
    const h=['sunflower','rose_bush','peony','lilac','large_fern','tall_grass','tallgrass','tall_seagrass','pitcher_plant'].includes(short)?1.05:.78;
    const y=(h-1)/2;
    addShapePlane(group,new THREE.PlaneGeometry(.88,h),mat,[0,y,0],[0,0,0]);
  }else if(kind==='candle'){
    const alias=getBlockFaceDescriptors(b)[2]?.alias||short;const mat=getShapeTextureMaterial(alias,b,{transparent:true,alphaTest:.035,depthWrite:false});
    const count=Math.max(1,Math.min(4,Number(state('candles','cluster_count'))||1));
    const positions=count===1?[[0,0]]:count===2?[[-.10,0],[.10,0]]:count===3?[[-.10,-.07],[.10,-.07],[0,.10]]:[[-.10,-.10],[.10,-.10],[-.10,.10],[.10,.10]];
    for(const [x,z] of positions)addTrackedMesh(group,new THREE.CylinderGeometry(.055,.055,.34,8),mat,[x,-.30,z]);
  }else if(kind==='slender_rod'){
    const alias=getBlockFaceDescriptors(b)[2]?.alias||short;const mat=getShapeTextureMaterial(alias,b,{transparent:true,alphaTest:.025,depthWrite:false});
    const n=directionNormal(state('facing_direction','minecraft:cardinal_direction')??1,[0,1,0]);
    const radius=short==='chain'?.035:.045;
    const rod=addTrackedMesh(group,new THREE.CylinderGeometry(radius,radius,.92,6),mat,[0,0,0]);
    rod.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(...n));
  }else if(kind==='tripwire_hook'){
    const n=directionNormal(state('facing_direction','direction','minecraft:cardinal_direction')??'north');
    const mount=new THREE.Group();mount.userData.blockRef=b;modelSetPanelNormal(mount,n);mount.position.set(n[0]*.455,n[1]*.455,n[2]*.455);group.add(mount);
    const plateMats=buildBlockMaterials(b);
    addShapeBox(mount,b,[.28,.25,.055],[0,0,-.012],[0,0,0],plateMats);
    const iron=modelColorMat(0x9da4ad),darkIron=modelColorMat(0x505963);
    modelAddStick(mount,b,[0,0,.015],[0,0,.18],.022,'iron_block');
    addShapeBox(mount,b,[.055,.045,.12],[0,.055,.135],[0,0,0],Array(6).fill(iron));
    addShapeBox(mount,b,[.055,.045,.12],[0,-.055,.135],[0,0,0],Array(6).fill(iron));
    addShapeBox(mount,b,[.15,.045,.055],[0,0,.205],[0,0,0],Array(6).fill(darkIron));
  }
  if(attachToScene){scene.add(group);pickTargets.push({mesh:group,block:b});}return group;
}
function disposeLayerGroup(group){if(!group)return;const disposedMaterials=new Set();group.traverse(node=>{if(node.geometry)node.geometry.dispose();if(node.material){for(const m of (Array.isArray(node.material)?node.material:[node.material])){if(!m||m===bakedAtlas||disposedMaterials.has(m))continue;disposedMaterials.add(m);m.userData?.blockFlowOwnedMap?.dispose?.();m.dispose?.();}}});}

function updateLayerBoundsAdd(b){let box=blockLayerBounds.get(b.layer);if(!box){box={minX:b.x,minY:b.y,minZ:b.z,maxX:b.x,maxY:b.y,maxZ:b.z};blockLayerBounds.set(b.layer,box);}else{box.minX=Math.min(box.minX,b.x);box.minY=Math.min(box.minY,b.y);box.minZ=Math.min(box.minZ,b.z);box.maxX=Math.max(box.maxX,b.x);box.maxY=Math.max(box.maxY,b.y);box.maxZ=Math.max(box.maxZ,b.z);}}
function getBlockChunkKey(b){return `${Math.floor(b.x/16)},${Math.floor(b.y/16)},${Math.floor(b.z/16)}`;}
function addBlockToChunkIndex(b){let chunks=blocksByLayerChunk.get(b.layer);if(!chunks)blocksByLayerChunk.set(b.layer,chunks=new Map());const key=getBlockChunkKey(b);let list=chunks.get(key);if(!list)chunks.set(key,list=[]);blockChunkArrayIndex.set(b,list.length);list.push(b);}
function removeBlockFromChunkIndex(b){const chunks=blocksByLayerChunk.get(b.layer);const key=getBlockChunkKey(b);const list=chunks?.get(key);const index=blockChunkArrayIndex.get(b);if(list&&index!==undefined&&index>=0&&index<list.length){const tail=list.pop();if(index<list.length){list[index]=tail;blockChunkArrayIndex.set(tail,index);}}if(!list?.length)chunks?.delete(key);if(!chunks?.size)blocksByLayerChunk.delete(b.layer);blockChunkArrayIndex.delete(b);}
function collectChunkContextBlocks(layer,targetChunkKeys){const chunks=blocksByLayerChunk.get(layer);if(!chunks)return[];const query=new Set();for(const key of targetChunkKeys||[]){const parts=String(key).split(',').map(Number);if(parts.length!==3||parts.some(value=>!Number.isFinite(value)))continue;const[cx,cy,cz]=parts;query.add(key);for(const[dx,dy,dz]of[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]])query.add(`${cx+dx},${cy+dy},${cz+dz}`);}const result=[];for(const key of query){const list=chunks.get(key);if(list)result.push(...list);}return result;}
function registerBlockLookup(b){const key=metaKey(b);blockPositionSet.add(key);blockLookupByLayer.set(key,b);blockCountByLayer.set(b.layer,(blockCountByLayer.get(b.layer)||0)+1);let layerBlocks=blockListByLayer.get(b.layer);if(!layerBlocks){layerBlocks=[];blockListByLayer.set(b.layer,layerBlocks);}blockLayerArrayIndex.set(b,layerBlocks.length);layerBlocks.push(b);addBlockToChunkIndex(b);if(b.command)commandBlockCount++;if(project)blockArrayIndex.set(b,project.blocks.length-1);refreshBlockLightEntry(b);updateLayerBoundsAdd(b);}
function unregisterBlockLookup(b){const key=metaKey(b);blockPositionSet.delete(key);blockLookupByLayer.delete(key);removeBlockFromChunkIndex(b);const count=(blockCountByLayer.get(b.layer)||1)-1;if(count>0)blockCountByLayer.set(b.layer,count);else blockCountByLayer.delete(b.layer);if(b.command)commandBlockCount=Math.max(0,commandBlockCount-1);lightSourceCache.delete(key);const layerBlocks=blockListByLayer.get(b.layer),layerIndex=blockLayerArrayIndex.get(b);if(layerBlocks&&layerIndex!==undefined&&layerIndex>=0&&layerIndex<layerBlocks.length){const tail=layerBlocks.pop();if(layerIndex<layerBlocks.length){layerBlocks[layerIndex]=tail;blockLayerArrayIndex.set(tail,layerIndex);}}if(!layerBlocks?.length)blockListByLayer.delete(b.layer);blockLayerArrayIndex.delete(b);const index=blockArrayIndex.get(b),lastIndex=project.blocks.length-1;if(index!==undefined&&index>=0&&index<=lastIndex){const last=project.blocks[lastIndex];project.blocks.pop();if(index<lastIndex){project.blocks[index]=last;blockArrayIndex.set(last,index);}}blockArrayIndex.delete(b);const box=blockLayerBounds.get(b.layer);if(box&&(b.x===box.minX||b.x===box.maxX||b.y===box.minY||b.y===box.maxY||b.z===box.minZ||b.z===box.maxZ)){blockLayerBounds.delete(b.layer);for(const other of (blockListByLayer.get(b.layer)||[]))updateLayerBoundsAdd(other);}}
function updateBlockLookups(){
  blockPositionSet=new Set();blockLookupByLayer=new Map();blockLayerBounds=new Map();blockCountByLayer=new Map();blockArrayIndex=new Map();blockListByLayer=new Map();blockLayerArrayIndex=new Map();blocksByLayerChunk=new Map();blockChunkArrayIndex=new Map();lightSourceCache=new Map();commandBlockCount=0;
  for(let i=0;i<project.blocks.length;i++){const b=project.blocks[i],key=metaKey(b);blockPositionSet.add(key);blockLookupByLayer.set(key,b);blockArrayIndex.set(b,i);blockCountByLayer.set(b.layer,(blockCountByLayer.get(b.layer)||0)+1);let layerBlocks=blockListByLayer.get(b.layer);if(!layerBlocks){layerBlocks=[];blockListByLayer.set(b.layer,layerBlocks);}blockLayerArrayIndex.set(b,layerBlocks.length);layerBlocks.push(b);addBlockToChunkIndex(b);if(b.command)commandBlockCount++;const light=getBlockLightDescriptor(b);if(light)lightSourceCache.set(key,light);updateLayerBoundsAdd(b);}
  project.commandCount=commandBlockCount;
}
async function buildBakedScene(fit=false,layersToBuild=null,chunksToBuild=null){
  if(!project)return false;
  if(!window.BlockFlowBaker?.bakeLayer)throw new Error('BlockFlow 原生模型烘焙模块未加载');
  await Promise.all([ensureBlockAtlasLoaded(),ensureExtractedVoxelModels()]);
  const sequence=++bakeBuildSequence;
  const targetSet=new Set();
  if(Array.isArray(layersToBuild))for(const layer of layersToBuild)if(layer>=0&&layer<project.layers.length)targetSet.add(layer);
  if(chunksToBuild instanceof Map)for(const layer of chunksToBuild.keys())if(layer>=0&&layer<project.layers.length)targetSet.add(layer);
  if(layersToBuild===null&&(!chunksToBuild||!chunksToBuild.size))for(let i=0;i<project.layers.length;i++)targetSet.add(i);
  const targets=Array.from(targetSet).sort((a,b)=>a-b);
  const replacements=[];
  let layerProgressIndex=0;
  try{
    for(const layer of targets){
      const allLayerBlocks=blockListByLayer.get(layer)||[];
      const chunkKeys=chunksToBuild instanceof Map ? chunksToBuild.get(layer) : null;
      const partial=Array.isArray(chunkKeys)&&chunkKeys.length>0&&!layersToBuild?.includes?.(layer);
      const blocks=partial?collectChunkContextBlocks(layer,chunkKeys):allLayerBlocks;
      if(!blocks.length&&!partial){replacements.push({layer,group:new threeLib.THREE.Group(),partial:false});layerProgressIndex++;setModelLoadingProgress(55+40*(layerProgressIndex/Math.max(1,targets.length)),`已完成 ${layerProgressIndex}/${targets.length} 层后台模型烘焙…`);continue;}
      setModelLoadingProgress(55+40*(layerProgressIndex/Math.max(1,targets.length)),`正在使用 BlockFlow Worker 烘焙第 ${layerProgressIndex+1}/${targets.length} 层…`);
      const group=await window.BlockFlowBaker.bakeLayer({
        THREE:threeLib.THREE,
        blocks,
        totalLayerBlocks:blockCountByLayer.get(layer)||allLayerBlocks.length,
        atlas:bakedAtlas,
        layer,
        getMaterials:buildBlockMaterials,
        isSpecialBlock:block=>!!shapeKindForBlock(block),
        createSpecialBlockGroup:block=>makeSpecialBlockObject(block,false),
        releaseSourceGeometry:geometry=>specialGeometries.delete(geometry),
        chunkSize:16,
        lodThreshold:1800,
        enableLOD:true,
        targetChunks:partial?chunkKeys:null,
        isCancelled:()=>sequence!==bakeBuildSequence,
        onProgress:(done,total,phase)=>{
          const ratio=total?Math.min(1,done/total):1;
          const layerSpan=40/Math.max(1,targets.length);
          const layerBase=55+layerSpan*layerProgressIndex;
          const percent=layerBase+(phase==='prepare'?layerSpan*.2*ratio:layerSpan*(.2+.8*ratio));
          setModelLoadingProgress(percent,`BlockFlow 后台烘焙：第 ${layerProgressIndex+1}/${targets.length} 层，${done.toLocaleString()}/${total.toLocaleString()}（${phase}）…`);
        }
      });
      if(sequence!==bakeBuildSequence){disposeLayerGroup(group);for(const item of replacements)if(item.group)disposeLayerGroup(item.group);return false;}
      group.userData.partial=partial;
      replacements.push({layer,group,partial,chunkKeys:partial?chunkKeys:null});
      layerProgressIndex++;
      setModelLoadingProgress(55+40*(layerProgressIndex/Math.max(1,targets.length)),`已完成 ${layerProgressIndex}/${targets.length} 层后台模型烘焙…`);
    }
  }catch(error){
    for(const item of replacements)if(item.group)disposeLayerGroup(item.group);
    throw error;
  }
  if(sequence!==bakeBuildSequence){for(const item of replacements)if(item.group)disposeLayerGroup(item.group);return false;}
  if(!bakedGroup){bakedGroup=new threeLib.THREE.Group();bakedGroup.name='BlockFlowBakedStructure';scene.add(bakedGroup);}
  for(const replacement of replacements){
    let oldLayer=bakedGroup.children.find(child=>child.name===`BakedLayer_${replacement.layer}`);
    if(replacement.partial){
      if(!oldLayer){oldLayer=new threeLib.THREE.Group();oldLayer.name=`BakedLayer_${replacement.layer}`;bakedGroup.add(oldLayer);}
      for(const nextChunk of [...replacement.group.children]){
        const oldChunk=oldLayer.children.find(child=>child.name===nextChunk.name);
        if(oldChunk){oldLayer.remove(oldChunk);disposeLayerGroup(oldChunk);}
        oldLayer.add(nextChunk);
      }
      replacement.group.clear();
      replacement.group=null;
    }else{
      if(oldLayer){bakedGroup.remove(oldLayer);disposeLayerGroup(oldLayer);}
      bakedGroup.add(replacement.group);
    }
  }
  pickTargets=pickTargets.filter(target=>!target.isBaked);
  for(const child of bakedGroup.children){const layer=Number(child.name.split('_').pop());pickTargets.push({mesh:child,blocks:null,layer,isBaked:true});}
  if(fit||!project.cameraSaved){
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    for(const b of project.blocks){const displayY=b.y+(b.layer?1.08:0);minX=Math.min(minX,b.x);minY=Math.min(minY,displayY);minZ=Math.min(minZ,b.z);maxX=Math.max(maxX,b.x+1);maxY=Math.max(maxY,displayY+1);maxZ=Math.max(maxZ,b.z+1);}
    if(minX===Infinity){minX=0;minY=0;minZ=0;maxX=project.X;maxY=project.Y;maxZ=project.Z;}
    const sx=Math.max(1,maxX-minX),sy=Math.max(1,maxY-minY),sz=Math.max(1,maxZ-minZ),cx=(minX+maxX)/2,cy=(minY+maxY)/2,cz=(minZ+maxZ)/2;
    const span=Math.max(sx,sy,sz,4),distance=Math.max(9,span*2.15);controls.target.set(cx,cy,cz);camera.position.set(cx+distance*.78,cy+distance*.58,cz+distance*.78);camera.near=.1;camera.far=Math.max(2000,distance*20);camera.updateProjectionMatrix();controls.update();project.cameraSaved=true;
  }
  updateSelectionOutline();updateHighlightOverlay();updateBlockLights();updateStats();setModelLoadingProgress(96,'正在完成 BlockFlow 分区模型整理…');requestSceneRender();return true;
}
function removeEditPreview(layer){
  const group=editPreviewGroups.get(layer);if(!group)return;
  scene?.remove(group);group.traverse(node=>{node.geometry?.dispose?.();});editPreviewGroups.delete(layer);
}
function renderFastEditPreview(layer){
                                                                                 
                                                                                
  requestSceneRender();
}
function queueDirtyBlockChunks(layer,block){
  if(!block){rebuildQueuedLayers.add(layer);rebuildQueuedChunks.delete(layer);return;}
  if(rebuildQueuedLayers.has(layer))return;
  let keys=rebuildQueuedChunks.get(layer);if(!keys)rebuildQueuedChunks.set(layer,keys=new Set());
  for(const key of window.BlockFlowBaker.neighboringChunkKeys(block))keys.add(key);
}
async function runRebuildQueue(){
  if(rebuildRunning)return;rebuildRunning=true;let fatal=null;
  try{
    while(rebuildQueuedFull||rebuildQueuedLayers.size||rebuildQueuedChunks.size){
      const full=rebuildQueuedFull;
      const layers=full?null:Array.from(rebuildQueuedLayers);
      const chunks=full?null:new Map(Array.from(rebuildQueuedChunks,([layer,set])=>[layer,Array.from(set)]));
      rebuildQueuedFull=false;rebuildQueuedLayers.clear();rebuildQueuedChunks.clear();
      try{const ok=await buildBakedScene(false,layers,chunks);if(!ok&&full)throw new Error('BlockFlow 后台烘焙未完成');}
      catch(error){console.error('Chunked geometry rebuild failed:',error);toast('模型更新失败：'+error.message,'err');if(full){fatal=error;}else{rebuildQueuedFull=true;}}
    }
  }finally{
    rebuildRunning=false;
    if(rebuildQueuedFull||rebuildQueuedLayers.size||rebuildQueuedChunks.size)runRebuildQueue();
    else{if(modelLoadingActive)setModelLoadingProgress(100,'模型更新完成');settleSceneRebuild(fatal);}
  }
}
function scheduleSceneRebuild(layer=null,fit=false,dirtyBlock=null){
  if(!scene||!project)return;if(fit)project.cameraSaved=false;
  if(layer===null){rebuildQueuedFull=true;rebuildQueuedLayers.clear();rebuildQueuedChunks.clear();}
  else{renderFastEditPreview(layer);queueDirtyBlockChunks(layer,dirtyBlock);}
  clearTimeout(rebuildTimer);rebuildTimer=setTimeout(runRebuildQueue,layer===null?0:120);
}
function buildScene(fit=false,layers=null){
  if(!scene||!project)return;updateBlockLookups();if(fit||!project.cameraSaved)project.cameraSaved=false;
  setStatus(`正在更新 ${project.blocks.length.toLocaleString()} 个方块…`);
  if(modelLoadingActive)setModelLoadingProgress(50,`正在准备 ${project.blocks.length.toLocaleString()} 个方块模型…`);
  if(Array.isArray(layers)){for(const layer of layers)rebuildQueuedLayers.add(layer);}else{rebuildQueuedFull=true;rebuildQueuedLayers.clear();rebuildQueuedChunks.clear();}
  clearTimeout(rebuildTimer);rebuildTimer=setTimeout(runRebuildQueue,Array.isArray(layers)?110:0);
}

function updateSelectionOutline(){
  if(!scene||!threeLib)return;const {THREE}=threeLib;
  if(!outline){const geo=new THREE.EdgesGeometry(new THREE.BoxGeometry(1.035,1.035,1.035));const mat=new THREE.LineBasicMaterial({color:0xffd36c,transparent:true,opacity:1,depthTest:true});outline=new THREE.LineSegments(geo,mat);outline.renderOrder=10;scene.add(outline);}
  if(!selected){outline.visible=false;requestSceneRender();return;}
  outline.position.set(selected.x+.5,selected.y+.5+(selected.layer?1.08:0),selected.z+.5);outline.visible=true;requestSceneRender();
}
let highlightOverlaySignature='';
function updateHighlightOverlay(){
  if(!scene||!threeLib||!project)return;
  const visibleKeys=[];
  for(const key of highlightedBlockKeys){if(selected&&key===metaKey(selected))continue;visibleKeys.push(key);}
  visibleKeys.sort();const signature=visibleKeys.join(';');
  if(signature===highlightOverlaySignature){requestSceneRender();return;}
  highlightOverlaySignature=signature;
  if(highlightOverlay){scene.remove(highlightOverlay);highlightOverlay.geometry.dispose();highlightOverlay.material.dispose();highlightOverlay=null;}
  if(highlightFillOverlay){scene.remove(highlightFillOverlay);highlightFillOverlay.geometry.dispose();highlightFillOverlay.material.dispose();highlightFillOverlay=null;}
  if(!visibleKeys.length){requestSceneRender();return;}
  const {THREE}=threeLib;const fillGeometry=new THREE.BoxGeometry(1.012,1.012,1.012);
  const fillMaterial=new THREE.MeshBasicMaterial({color:0xffbd45,transparent:true,opacity:.19,depthTest:false,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
  const fill=new THREE.InstancedMesh(fillGeometry,fillMaterial,visibleKeys.length);fill.frustumCulled=false;fill.renderOrder=19;
  const dummy=new THREE.Object3D();let fillCount=0;const positions=new Float32Array(visibleKeys.length*12*6);let offset=0;
  const edges=[[0,0,0,1,0,0],[0,1,0,1,1,0],[0,0,1,1,0,1],[0,1,1,1,1,1],[0,0,0,0,1,0],[1,0,0,1,1,0],[0,0,1,0,1,1],[1,0,1,1,1,1],[0,0,0,0,0,1],[1,0,0,1,0,1],[0,1,0,0,1,1],[1,1,0,1,1,1]];
  for(const key of visibleKeys){const b=blockLookupByLayer.get(key);if(!b)continue;const y=b.y+(b.layer?1.08:0);dummy.position.set(b.x+.5,y+.5,b.z+.5);dummy.updateMatrix();fill.setMatrixAt(fillCount++,dummy.matrix);for(const e of edges){positions[offset++]=b.x+e[0];positions[offset++]=y+e[1];positions[offset++]=b.z+e[2];positions[offset++]=b.x+e[3];positions[offset++]=y+e[4];positions[offset++]=b.z+e[5];}}
  fill.count=fillCount;fill.instanceMatrix.needsUpdate=true;fill.computeBoundingSphere();highlightFillOverlay=fill;scene.add(fill);
  if(offset){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions.subarray(0,offset),3));const material=new THREE.LineBasicMaterial({color:0xffc247,transparent:true,opacity:1,depthTest:false,depthWrite:false,toneMapped:false});highlightOverlay=new THREE.LineSegments(geometry,material);highlightOverlay.renderOrder=20;scene.add(highlightOverlay);}
  requestSceneRender();
}
function raycastVoxelLayer(ray,layer){
  const bounds=blockLayerBounds.get(layer);if(!bounds)return null;const offsetY=layer?1.08:0;const o={x:ray.origin.x,y:ray.origin.y-offsetY,z:ray.origin.z},d={x:ray.direction.x,y:ray.direction.y,z:ray.direction.z};
  const min=[bounds.minX,bounds.minY,bounds.minZ],max=[bounds.maxX+1,bounds.maxY+1,bounds.maxZ+1],origin=[o.x,o.y,o.z],dir=[d.x,d.y,d.z];let near=-Infinity,far=Infinity;
  for(let axis=0;axis<3;axis++){if(Math.abs(dir[axis])<1e-10){if(origin[axis]<min[axis]||origin[axis]>max[axis])return null;continue;}let a=(min[axis]-origin[axis])/dir[axis],b=(max[axis]-origin[axis])/dir[axis];if(a>b){const t=a;a=b;b=t;}near=Math.max(near,a);far=Math.min(far,b);if(near>far)return null;}
  if(far<0)return null;let t=Math.max(0,near)+1e-6;let cell=origin.map((v,i)=>Math.floor(v+dir[i]*t));const step=dir.map(v=>v>0?1:v<0?-1:0);const delta=dir.map(v=>Math.abs(v)<1e-10?Infinity:Math.abs(1/v));
  const next=cell.map((v,i)=>step[i]===0?Infinity:((step[i]>0?v+1:v)-origin[i])/dir[i]);let normal=[0,0,0];const maxSteps=Math.min(250000,Math.max(64,(bounds.maxX-bounds.minX+bounds.maxY-bounds.minY+bounds.maxZ-bounds.minZ+8)*5));
  for(let i=0;i<maxSteps&&t<=far+1e-5;i++){
    const block=blockLookupByLayer.get(`${layer}|${cell[0]},${cell[1]},${cell[2]}`);if(block){const THREE=threeLib.THREE;const point=new THREE.Vector3(ray.origin.x,ray.origin.y,ray.origin.z).addScaledVector(ray.direction,t);if(normal[0]===0&&normal[1]===0&&normal[2]===0){const axis=Math.abs(dir[0])>=Math.abs(dir[1])&&Math.abs(dir[0])>=Math.abs(dir[2])?0:Math.abs(dir[1])>=Math.abs(dir[2])?1:2;normal[axis]=-Math.sign(dir[axis])||1;}return{block,normal:new THREE.Vector3(normal[0],normal[1],normal[2]),hit:{point,face:{normal:new THREE.Vector3(normal[0],normal[1],normal[2])}},distance:t};}
    let axis=next[0]<=next[1]&&next[0]<=next[2]?0:next[1]<=next[2]?1:2;t=next[axis];next[axis]+=delta[axis];cell[axis]+=step[axis];normal=[0,0,0];normal[axis]=-step[axis];
  }
  return null;
}
function pickAt(clientX,clientY){
  if(!project||!blockLookupByLayer.size)return null;
  const rect=canvas.getBoundingClientRect();const mouse=new threeLib.THREE.Vector2((clientX-rect.left)/rect.width*2-1,-((clientY-rect.top)/rect.height)*2+1);raycaster.setFromCamera(mouse,camera);
  let best=null;for(const layer of blockLayerBounds.keys()){const hit=raycastVoxelLayer(raycaster.ray,layer);if(hit&&(!best||hit.distance<best.distance))best=hit;}return best;
}

function onPointerDown(e){if(e.button!==0)return;dragOrigin={x:e.clientX,y:e.clientY,time:performance.now()};}
function onPointerUp(e){if(e.button!==0||!dragOrigin)return;const start=dragOrigin;dragOrigin=null;if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>5||performance.now()-start.time>700)return;const picked=pickAt(e.clientX,e.clientY);if(picked)selectBlock(picked.block);else selectBlock(null);}
function makeSearchEntry(block){const meta=metadata[metaKey(block)]||{};const note=String(meta.note||'');const command=block.command?String(block.cmd||''):'';const id=block.command?String(block.name||''):'';return{block,note,command,id,haystack:`${note} ${command} ${id}`.toLowerCase()};}
function rebuildSearchIndex(){searchIndex=[];searchEntryByBlock=new Map();searchIndexPosition=new Map();if(!project)return;for(const block of project.blocks){const entry=makeSearchEntry(block);searchIndexPosition.set(block,searchIndex.length);searchEntryByBlock.set(block,entry);searchIndex.push(entry);}}
function upsertSearchEntry(block){if(!block)return;const entry=makeSearchEntry(block),index=searchIndexPosition.get(block);if(index===undefined){searchIndexPosition.set(block,searchIndex.length);searchEntryByBlock.set(block,entry);searchIndex.push(entry);}else{searchIndex[index]=entry;searchEntryByBlock.set(block,entry);}}
function removeSearchEntry(block){const index=searchIndexPosition.get(block);if(index===undefined)return;const last=searchIndex.pop();searchIndexPosition.delete(block);searchEntryByBlock.delete(block);if(index<searchIndex.length){searchIndex[index]=last;searchIndexPosition.set(last.block,index);}}
function scheduleSearchRefresh(block=null){if(block)upsertSearchEntry(block);clearTimeout(searchTimer);searchTimer=setTimeout(()=>updateSearchResults(),140);}
function updateSearchResults(){const input=document.getElementById('searchInput'),panel=document.getElementById('searchResults');if(!input||!panel)return;const query=input.value.trim().toLowerCase();if(!query){panel.hidden=true;panel.innerHTML='';return;}const terms=query.split(/\s+/).filter(Boolean);const matches=[];for(const entry of searchIndex){if(terms.every(term=>entry.haystack.includes(term)))matches.push(entry);if(matches.length>=80)break;}panel.innerHTML=matches.length?`<div class="search-results-head">找到 ${matches.length}${matches.length===80?' 条以上':''} 个匹配方块</div>`+matches.map((entry,i)=>{const b=entry.block;const snippet=entry.note?`注释：${escapeHtml(entry.note.slice(0,96))}`:entry.command?`命令：${escapeHtml(entry.command.slice(0,96))}`:`命令方块 ID：${escapeHtml(entry.id)}`;const kind=b.command?'命令方块':'普通方块';return`<button class="search-result" data-index="${i}"><span class="search-result-title">${escapeHtml(b.name)}</span><span class="search-result-meta">${kind} · ${b.x}, ${b.y}, ${b.z} · ${b.layer===0?'主层':'次层'}</span><span class="search-result-snippet">${snippet}</span></button>`;}).join(''):'<div class="search-empty">没有找到匹配项。方块 ID 仅搜索命令方块，不会搜索普通方块 ID。</div>';panel.hidden=false;panel._matches=matches;}
function focusSearchResult(entry){const b=entry?.block;if(!b)return;selectBlock(b);const target=new threeLib.THREE.Vector3(b.x+.5,b.y+.5+(b.layer?1.08:0),b.z+.5);const offset=camera.position.clone().sub(controls.target);controls.target.copy(target);camera.position.copy(target).add(offset);controls.update();requestSceneRender();document.getElementById('searchResults').hidden=true;}
function selectBlock(block){
  if(selected!== (block||null))closeHistoryGroup();
  selected=block||null;const empty=document.getElementById('emptyPanel'),panel=document.getElementById('blockPanel');
  empty.hidden=!!selected;panel.hidden=!selected;empty.style.display=selected?'none':'';panel.style.display=selected?'flex':'none';
  const inspectorPanel=document.getElementById('inspectorPanel');
  if(inspectorPanel&&window.matchMedia('(max-width: 700px)').matches)setMobileInspectorOpen(!!selected);
  document.getElementById('panelTitle').textContent=selected?selected.name:'方块检查器';document.getElementById('panelSubtitle').textContent=selected?`${selected.x}, ${selected.y}, ${selected.z}`:'点击 3D 场景中的任意方块开始编辑';
  const badge=document.getElementById('selectionBadge');if(badge){badge.textContent=selected?(selected.command?'命令方块':'普通方块'):'未选择';badge.classList.toggle('active',!!selected);badge.classList.toggle('command',!!selected?.command);}
  if(!selected){updateSelectionOutline();updateHighlightOverlay();return;}
  document.getElementById('blockIdInput').value=selected.name;
  document.getElementById('commandFields').hidden=!selected.command;document.getElementById('normalAddCard').hidden=!!selected.command;document.getElementById('commandAddCard').hidden=!selected.command;
  document.getElementById('commandInput').value=selected.command?selected.cmd:'';document.getElementById('autoInput').checked=!!selected.auto;document.getElementById('conditionalInput').checked=!!selected.conditional;
  document.getElementById('facingValue').textContent=`${getFacingName(selected.facing)} (${selected.facing})`;
  document.getElementById('commandModeValue').textContent=selected.name.includes('repeating_')?'循环':selected.name.includes('chain_')?'连锁':'脉冲';
  const m=metadata[metaKey(selected)]||{};document.getElementById('highlightInput').checked=!!m.highlight;document.getElementById('noteInput').value=m.note||'';
  updateSelectionOutline();updateHighlightOverlay();
}

function countAt(x,y,z){const a=blockLookupByLayer.get(`0|${x},${y},${z}`),b=blockLookupByLayer.get(`1|${x},${y},${z}`);return a?(b?[a,b]:[a]):b?[b]:[];}
function countAtLayer(x,y,z,layer){const block=blockLookupByLayer.get(`${layer}|${x},${y},${z}`);return block?[block]:[];}
function getCellPaletteIndex(layer,x,y,z){if(layer<0||layer>=project.layers.length||x<0||y<0||z<0||x>=project.X||y>=project.Y||z>=project.Z)return -1;const pi=project.layers[layer][indexOf(x,y,z,project)];if(pi<0)return -1;const name=getTag(project.palette[pi],'name','');return name==='minecraft:air'||name==='minecraft:cave_air'||name==='minecraft:void_air'?-1:pi;}
function addPalette(name,opts={}){const entry=makePaletteEntry(project,name,opts);const signature=JSON.stringify(entry.value.states?.value||{});for(let i=0;i<project.palette.length;i++){const p=project.palette[i];if(getTag(p,'name','')===name&&JSON.stringify(p.value.states?.value||{})===signature)return i;}project.palette.push(entry);return project.palette.length-1;}
function setBlockIndex(b,paletteIndex){const lin=indexOf(b.x,b.y,b.z,project);project.layers[b.layer][lin]=paletteIndex;b.lin=lin;b.paletteIndex=paletteIndex;markSnapshotLayerDirty(b.layer);}
function removeBpdForBlock(b){const key=String(indexOf(b.x,b.y,b.z,project));const other=countAt(b.x,b.y,b.z).some(o=>o!==b);if(!other)delete project.bpd[key];}
function translateNumericList(node,delta){const items=node?.value?.items;if(!items||items.length<3)return;for(let i=0;i<3;i++){if(ArrayBuffer.isView(items))items[i]=Number(items[i])+delta[i];else if(items[i]&&typeof items[i].value==='number')items[i].value+=delta[i];}}
function shiftEntityCoordinates(node,delta){if(!node||node.type!==TAG.COMPOUND)return;const entities=node.value?.items;if(!Array.isArray(entities))return;for(const wrap of entities){const ent=wrap?.value;if(!ent)continue;translateNumericList(ent.blockPos,delta);translateNumericList(ent.pos,delta);}}
function ensureBounds(x,y,z){const minX=Math.min(0,x),minY=Math.min(0,y),minZ=Math.min(0,z),maxX=Math.max(project.X-1,x),maxY=Math.max(project.Y-1,y),maxZ=Math.max(project.Z-1,z);const nx=maxX-minX+1,ny=maxY-minY+1,nz=maxZ-minZ+1;if(nx*ny*nz>MAX_IMPORT_VOLUME)throw new Error('新增方块会使结构超过安全体积上限');if(nx===project.X&&ny===project.Y&&nz===project.Z)return{x,y,z};const dx=-minX,dy=-minY,dz=-minZ,oldX=project.X,oldY=project.Y,oldZ=project.Z,oldLayers=project.layers;const newLayers=oldLayers.map(()=>new Int32Array(nx*ny*nz).fill(-1));for(let l=0;l<oldLayers.length;l++)for(let ix=0;ix<oldX;ix++)for(let iy=0;iy<oldY;iy++){const oldBase=ix*(oldY*oldZ)+iy*oldZ;const newBase=(ix+dx)*(ny*nz)+(iy+dy)*nz+dz;newLayers[l].set(oldLayers[l].slice(oldBase,oldBase+oldZ),newBase);}
  const remapped={};for(const [oldKey,node] of Object.entries(project.bpd)){if(!/^\d+$/.test(oldKey)){remapped[oldKey]=node;continue;}const oldLin=Number(oldKey),ox=Math.floor(oldLin/(oldY*oldZ)),r=oldLin%(oldY*oldZ),oy=Math.floor(r/oldZ),oz=r%oldZ,newLin=(ox+dx)*(ny*nz)+(oy+dy)*nz+(oz+dz);remapped[String(newLin)]=node;const bed=node?.value?.block_entity_data;if(bed?.type===TAG.COMPOUND){setTag(bed,'x',T.int(ox+dx));setTag(bed,'y',T.int(oy+dy));setTag(bed,'z',T.int(oz+dz));}}
  for(const b of project.blocks){b.x+=dx;b.y+=dy;b.z+=dz;b.lin=indexOf(b.x,b.y,b.z,{X:nx,Y:ny,Z:nz});}const shiftedMeta={};for(const [key,value] of Object.entries(metadata)){const m=key.match(/^(\d+)\|(-?\d+),(-?\d+),(-?\d+)$/);if(!m){shiftedMeta[key]=value;continue;}shiftedMeta[`${m[1]}|${Number(m[2])+dx},${Number(m[3])+dy},${Number(m[4])+dz}`]=value;}applyMeta(shiftedMeta);
  project.layers=newLayers;project.bpd=remapped;project.X=nx;project.Y=ny;project.Z=nz;updateBlockLookups();invalidateSnapshotBase();const root=project.root.value;root.size=T.list(TAG.INT,[T.int(nx),T.int(ny),T.int(nz)]);if(root.structure_world_origin)translateNumericList(root.structure_world_origin,[-dx,-dy,-dz]);shiftEntityCoordinates(root.structure?.value?.entities,[dx,dy,dz]);return{x:x+dx,y:y+dy,z:z+dz};}
function addBlockAt(x,y,z,name,layer=0,options={}){if(!project)return;try{if(!validBlockId(name))throw new Error(`方块 ID 不在当前离线注册表中：${name}`);const current=countAtLayer(x,y,z,layer);if(current.length&&!options.allowReplace)throw new Error(`坐标 ${x}, ${y}, ${z} 已经有方块，请先移除占位方块`);if(!options.historyCaptured)captureUndoSnapshot('新增方块');if(current.length)for(const old of current)removeBlockModel(old,false);const before=`${project.X},${project.Y},${project.Z}`;const pos=ensureBounds(x,y,z);x=pos.x;y=pos.y;z=pos.z;const expanded=before!==`${project.X},${project.Y},${project.Z}`;if(layer>=project.layers.length)throw new Error('目标数据层不存在');if(getCellPaletteIndex(layer,x,y,z)>=0)throw new Error('目标位置已被占用');const command=isCommandName(name);const facing=options.facing??2,conditional=!!options.conditional,auto=options.auto!==false;const paletteIndex=addPalette(name,{command,facing,conditional});const b={uid:'new:'+Date.now()+':'+Math.random(),x,y,z,layer,lin:indexOf(x,y,z,project),paletteIndex,name,command,cmd:'',conditional,auto,facing};project.layers[layer][b.lin]=paletteIndex;markSnapshotLayerDirty(layer);project.blocks.push(b);registerBlockLookup(b);project.commandCount=commandBlockCount;if(command)syncCommandEntity(project,b);lastBlockId=name;document.getElementById('newBlockIdInput').value=name;rebuildAndSelect(b,expanded);upsertSearchEntry(b);saveSnapshotDebounced();toast(`已新增 ${name}，位置 ${x}, ${y}, ${z}`,'ok');}catch(error){toast(error.message,'err');}}
function removeBlockModel(b,refresh=true){if(!b||!project)return;const layer=b.layer;const lin=indexOf(b.x,b.y,b.z,project);project.layers[layer][lin]=-1;markSnapshotLayerDirty(layer);removeBpdForBlock(b);const meta=metaKey(b);delete metadata[meta];highlightedBlockKeys.delete(meta);unregisterBlockLookup(b);removeSearchEntry(b);project.commandCount=commandBlockCount;if(selected===b)selected=null;if(refresh){scheduleSceneRebuild(layer,false,b);selectBlock(null);updateHighlightOverlay();scheduleSearchRefresh();saveSnapshotDebounced();}}
function rebuildAndSelect(b,allLayers=false){selected=b;scheduleSceneRebuild(allLayers?null:b.layer,false,allLayers?null:b);selectBlock(b);}
function applyBlockType(){if(!selected||!project)return;const id=document.getElementById('blockIdInput').value.trim();if(!validBlockId(id)){toast('方块 ID 不正确或不在当前离线 ID 表/结构调色板中，请从搜索建议中选择','err');return;}if(id===selected.name){toast('方块类型没有变化');return;}captureUndoSnapshot('修改方块 ID');if(id==='minecraft:air'){removeBlockModel(selected);toast('已将方块移除（空气不作为实体方块显示）','ok');return;}const wasCommand=selected.command,willCommand=isCommandName(id);if(!(wasCommand&&willCommand))removeBpdForBlock(selected);if(wasCommand!==willCommand){commandBlockCount=Math.max(0,commandBlockCount+(willCommand?1:-1));project.commandCount=commandBlockCount;}selected.name=id;selected.command=willCommand;document.getElementById('panelTitle').textContent=id;refreshBlockLightEntry(selected);if(willCommand&&!wasCommand){selected.cmd='';selected.auto=true;selected.conditional=false;}else if(!willCommand)selected.cmd='';if(willCommand){const pi=addPalette(id,{command:true,facing:selected.facing,conditional:selected.conditional});setBlockIndex(selected,pi);syncCommandEntity(project,selected);}else{const pi=addPalette(id);setBlockIndex(selected,pi);}lastBlockId=id;document.getElementById('newBlockIdInput').value=id;rebuildAndSelect(selected);upsertSearchEntry(selected);saveSnapshotDebounced();toast('方块类型已更改','ok');}
function updateCommandText(){if(!selected?.command)return;beginUndoGroup('修改命令内容','command-text:'+metaKey(selected));selected.cmd=document.getElementById('commandInput').value;syncCommandEntity(project,selected);scheduleSearchRefresh(selected);saveSnapshotDebounced();}
function updateCommandFlag(which,value){if(!selected?.command)return;captureUndoSnapshot(which==='auto'?'修改自动执行':'修改条件状态');if(which==='auto')selected.auto=!!value;else{selected.conditional=!!value;const pi=addPalette(selected.name,{command:true,facing:selected.facing,conditional:selected.conditional});setBlockIndex(selected,pi);}syncCommandEntity(project,selected);saveSnapshotDebounced();}
function persistMetaQuick(){if(!project)return;try{localStorage.setItem('bfse-meta:'+project.filename+':'+project.X+'x'+project.Y+'x'+project.Z,JSON.stringify(metadata));}catch(e){console.warn('meta quick save failed',e);}}
function updateHighlight(){if(!selected)return;captureUndoSnapshot('修改高光');const key=metaKey(selected),old=metadata[key]||{};old.highlight=document.getElementById('highlightInput').checked;old.note=document.getElementById('noteInput').value;metadata[key]=old;if(old.highlight)highlightedBlockKeys.add(key);else highlightedBlockKeys.delete(key);persistMetaQuick();updateHighlightOverlay();scheduleSearchRefresh(selected);saveSnapshotDebounced();}
function updateNote(){if(!selected)return;beginUndoGroup('修改注释','note:'+metaKey(selected));const key=metaKey(selected),old=metadata[key]||{};old.highlight=document.getElementById('highlightInput').checked;old.note=document.getElementById('noteInput').value;metadata[key]=old;if(old.highlight)highlightedBlockKeys.add(key);else highlightedBlockKeys.delete(key);persistMetaQuick();scheduleSearchRefresh(selected);saveSnapshotDebounced();}
function removeSelected(){if(!selected)return;const name=selected.name;captureUndoSnapshot('删除方块');removeBlockModel(selected);toast(`已移除 ${name}`,'ok');}
function openAdjacentPicker(){if(!selected||selected.command)return;document.getElementById('adjacentPickerModal').classList.add('on');}
function placeAdjacent(direction){if(!selected)return;const vectors={up:[0,1,0],down:[0,-1,0],north:[0,0,-1],south:[0,0,1],west:[-1,0,0],east:[1,0,0]};const v=vectors[direction];if(!v)return;document.getElementById('adjacentPickerModal').classList.remove('on');const id=document.getElementById('newBlockIdInput').value.trim()||lastBlockId;addBlockAt(selected.x+v[0],selected.y+v[1],selected.z+v[2],id,selected.layer);}
function openChainCode(text){const textarea=document.getElementById('chainCodeText'),gutter=document.getElementById('chainLineNumbers'),lines=Math.max(1,String(text||'').split('\n').length);textarea.value=text||'';gutter.textContent=Array.from({length:lines},(_,i)=>String(i+1)).join('\n');document.getElementById('chainCodeMeta').textContent=`${lines.toLocaleString()} 行 · 只读`;document.getElementById('chainCodeModal').classList.add('on');document.getElementById('chainCodeModal').setAttribute('aria-hidden','false');textarea.scrollTop=0;textarea.scrollLeft=0;gutter.scrollTop=0;}
function closeChainCode(){document.getElementById('chainCodeModal').classList.remove('on');document.getElementById('chainCodeModal').setAttribute('aria-hidden','true');}
function findSelectedCommandChain(){
  if(!selected?.command)return;
  const result=window.BFSECore?.identifyCommandChain(selected,(x,y,z,layer)=>countAtLayer(x,y,z,layer)[0]||null);
  if(!result?.ok){toast('无法识别当前命令链','err');return;}
  const output=window.BFSECore.formatCommandChain(result);openChainCode(output);
  toast(`已读取 ${result.chain.filter(item=>item.block?.command&&String(item.block.cmd||'').trim()).length} 条命令`,'ok');
}

function insertCommandAfterSelected(){if(!selected?.command)return;const v=directionVector(selected.facing);const tx=selected.x+v[0],ty=selected.y+v[1],tz=selected.z+v[2];const occupied=countAt(tx,ty,tz);if(occupied.length){pendingInsert={x:tx,y:ty,z:tz,source:selected,layer:selected.layer};document.getElementById('conflictText').textContent=`方块 ${occupied.map(b=>b.name+(b.layer?'（次层）':'（主层）')).join('、')} 占据了 ${tx}, ${ty}, ${tz}。你可以取消，或明确移除该坐标上的占位方块后继续插入。`;document.getElementById('conflictModal').classList.add('on');return;}finishInsertCommand(false);}
function finishInsertCommand(replace){if(!pendingInsert&&!selected?.command)return;captureUndoSnapshot('新增命令方块');const p=pendingInsert||(()=>{const v=directionVector(selected.facing);return{x:selected.x+v[0],y:selected.y+v[1],z:selected.z+v[2],source:selected,layer:selected.layer};})();if(replace){for(const b of countAt(p.x,p.y,p.z))removeBlockModel(b,false);}pendingInsert=null;document.getElementById('conflictModal').classList.remove('on');const source=p.source;addBlockAt(p.x,p.y,p.z,'minecraft:chain_command_block',p.layer,{facing:source.facing,conditional:false,auto:true,historyCaptured:true});}

async function computeBatchReplacement(){
  if(!project)throw new Error('请先导入结构');
  const scope=document.getElementById('replaceScope').value,pattern=document.getElementById('replaceFind').value,replacement=document.getElementById('replaceWith').value,useRegex=document.getElementById('replaceRegex').checked,caseSensitive=document.getElementById('replaceCaseSensitive').checked;
  if(!pattern)throw new Error('查找内容不能为空');
  const candidates=[];for(let i=0;i<project.blocks.length;i++){const block=project.blocks[i];if(scope==='commands'&&!block.command)continue;candidates.push({index:i,value:scope==='commands'?String(block.cmd||''):String(block.name||'')});}
  if(candidates.length>500000)throw new Error('待扫描条目超过 500,000 个，请缩小结构范围');
  return new Promise((resolve,reject)=>{
    let worker;try{worker=BlockFlowWorkers.create('batch');}catch(error){reject(new Error('批量替换 Worker 无法启动：'+error.message));return;}
    const timer=setTimeout(()=>{worker.terminate();reject(new Error('正则计算超时。请检查表达式是否存在高复杂度回溯。'));},7000);
    worker.onmessage=event=>{clearTimeout(timer);worker.terminate();const data=event.data||{};if(data.type==='error'){reject(new Error(data.message||'批量替换失败'));return;}if(data.type!=='result'){reject(new Error('批量替换 Worker 返回了未知结果'));return;}resolve({scope,changes:data.changes||[],matched:data.matched||0,scanned:candidates.length,pattern,replacement,useRegex,caseSensitive});};
    worker.onerror=event=>{clearTimeout(timer);worker.terminate();reject(new Error(event.message||'批量替换 Worker 出错'));};
    worker.postMessage({type:'replace',items:candidates,pattern,replacement,useRegex,caseSensitive});
  });
}
function openBatchReplace(){if(!project)return;batchReplacePreview=null;document.getElementById('replacePreviewInfo').textContent='尚未预览';document.getElementById('replaceApplyBtn').disabled=true;document.getElementById('batchReplaceModal').classList.add('on');}
async function previewBatchReplace(){const button=document.getElementById('replacePreviewBtn');button.disabled=true;button.textContent='正在匹配…';try{batchReplacePreview=await computeBatchReplacement();if(batchReplacePreview.scope==='ids'){const invalid=batchReplacePreview.changes.filter(change=>!validBlockId(change.value));if(invalid.length)throw new Error(`有 ${invalid.length} 个替换结果不是有效方块 ID。请修改替换规则。`);}document.getElementById('replacePreviewInfo').textContent=`扫描 ${batchReplacePreview.scanned.toLocaleString()} 项，匹配 ${batchReplacePreview.matched.toLocaleString()} 处，涉及 ${batchReplacePreview.changes.length.toLocaleString()} 个方块。`;document.getElementById('replaceApplyBtn').disabled=!batchReplacePreview.changes.length;}catch(error){batchReplacePreview=null;document.getElementById('replacePreviewInfo').textContent=error.message;document.getElementById('replaceApplyBtn').disabled=true;}finally{button.disabled=false;button.textContent='预览匹配';}}
async function applyBatchReplace(){if(!batchReplacePreview?.changes?.length)return;const plan=batchReplacePreview;if(plan.scope==='ids'){const invalid=plan.changes.filter(change=>!validBlockId(change.value));if(invalid.length){toast(`有 ${invalid.length} 个无效方块 ID，未执行替换`,'err');return;}}
  captureUndoSnapshot(plan.scope==='commands'?'批量替换命令':'批量替换方块 ID');
  const operations=plan.changes.map(change=>({block:project.blocks[change.index],value:change.value})).filter(item=>item.block);
  for(const {block,value} of operations){if(plan.scope==='commands'){block.cmd=window.BFSECore.normalizeCommandText(value);syncCommandEntity(project,block);continue;}if(value==='minecraft:air'){removeBlockModel(block,false);continue;}const oldCommand=block.command,newCommand=isCommandName(value);if(oldCommand&&!newCommand)removeBpdForBlock(block);block.name=value;block.command=newCommand;if(newCommand){if(!oldCommand){block.cmd='';block.auto=true;block.conditional=false;}const pi=addPalette(value,{command:true,facing:block.facing,conditional:block.conditional});setBlockIndex(block,pi);syncCommandEntity(project,block);}else{block.cmd='';const pi=addPalette(value);setBlockIndex(block,pi);}refreshBlockLightEntry(block);}
  document.getElementById('batchReplaceModal').classList.remove('on');batchReplacePreview=null;updateBlockLookups();rebuildSearchIndex();if(selected){const stillSelected=project.blocks.find(b=>b.x===selected.x&&b.y===selected.y&&b.z===selected.z&&b.layer===selected.layer);selectBlock(stillSelected||null);}saveSnapshotDebounced();await rebuildAllWithProgress('正在应用批量替换','正在更新受影响的方块模型…');toast(`批量替换完成，修改 ${plan.changes.length.toLocaleString()} 个方块`,'ok');
}

function updateFileUI(){
  document.getElementById('fileName').textContent=project?.filename||'尚未打开结构文件';
  document.getElementById('exportBtn').disabled=!project;
  document.getElementById('batchReplaceBtn').disabled=!project;
}
async function rebuildAllWithProgress(title,detail='正在构建完整模型…'){
  showModelLoading(title,detail,8);clearSceneObjects();requestSceneRender();
  const pending=waitForSceneRebuild();buildScene(true);await pending;hideModelLoading();
}
async function importFile(file){
  if(!file)return;
  if(!/\.mcstructure$/i.test(String(file.name||'')))throw new Error('BlockFlow 仅支持导入 .mcstructure 文件。');
  if(file.size>MAX_IMPORT_BYTES)throw new Error(`文件超过 ${MAX_IMPORT_BYTES/1024/1024} MiB 上限`);
  const previousProject=project,previousMeta=window.BFSECore.cloneNBT(metadata),previousLastBlockId=lastBlockId,previousSelection=selected?{x:selected.x,y:selected.y,z:selected.z,layer:selected.layer}:null;
  showModelLoading('正在导入 MCStructure',file.name,3);selected=null;clearSceneObjects();requestSceneRender();
  try{
    const buffer=await file.arrayBuffer();
    setModelLoadingProgress(28,'正在解析 MCStructure NBT…');
    await new Promise(resolve=>requestAnimationFrame(resolve));
    const parsed=parseStructure(buffer);
    parsed.filename=file.name;parsed.cameraSaved=false;
    project=parsed;selected=null;resetUndoHistory();applyMeta({});lastBlockId='minecraft:stone';rebuildSearchIndex();updateFileUI();selectBlock(null);
    setModelLoadingProgress(52,`正在建立模型索引（${project.blocks.length.toLocaleString()} 个方块）…`);
    const pending=waitForSceneRebuild();buildScene(true);await pending;hideModelLoading();
    const canonicalBytes=await serializeProjectAsync('full');
    await dbPut({blob:new Blob([canonicalBytes],{type:'application/octet-stream'}),filename:file.name,meta:{},lastBlockId,updatedAt:Date.now()}).catch(e=>console.warn('IndexedDB save failed',e));
    toast(`读取完成：${project.blocks.length.toLocaleString()} 个非空气方块，其中 ${project.commandCount.toLocaleString()} 个命令方块`,'ok');
  }catch(error){
    console.error(error);
    if(previousProject){project=previousProject;applyMeta(previousMeta);lastBlockId=previousLastBlockId;rebuildSearchIndex();updateFileUI();try{const pending=waitForSceneRebuild();buildScene(true);await pending;if(previousSelection){const old=project.blocks.find(b=>b.x===previousSelection.x&&b.y===previousSelection.y&&b.z===previousSelection.z&&b.layer===previousSelection.layer);selectBlock(old||null);}else selectBlock(null);}catch(restoreError){console.warn('Previous model restore failed:',restoreError);}}
    else{project=null;resetUndoHistory();rebuildSearchIndex();updateFileUI();selectBlock(null);}
    hideModelLoading();throw error;
  }
}

async function restoreLastSession(){try{const session=await dbGet();if(!session?.blob)return false;showModelLoading('正在恢复结构','正在读取上次编辑会话…',8);const buf=await session.blob.arrayBuffer();const parsed=parseStructure(buf);parsed.filename=session.filename||'上次编辑的结构.mcstructure';parsed.cameraSaved=false;project=parsed;resetUndoHistory();let savedMeta=session.meta||{};try{const quick=localStorage.getItem('bfse-meta:'+project.filename+':'+project.X+'x'+project.Y+'x'+project.Z);if(quick)savedMeta=JSON.parse(quick);}catch(e){console.warn('Quick metadata restore failed',e);}applyMeta(savedMeta);lastBlockId=session.lastBlockId||'minecraft:stone';document.getElementById('newBlockIdInput').value=lastBlockId;rebuildSearchIndex();updateFileUI();const pending=waitForSceneRebuild();buildScene(true);await pending;hideModelLoading();toast('已恢复上次编辑会话','ok');return true;}catch(error){hideModelLoading();console.warn('Restore session failed',error);toast('恢复上次会话失败：'+error.message,'err');return false;}}
async function exportFile(){
  if(!project)return;
  const button=document.getElementById('exportBtn');button.disabled=true;button.textContent='正在导出 MCStructure…';
  try{
    const bytes=await serializeProjectAsync('full');
    const baseName=(project.filename||'structure').replace(/@\[.*$/,'').replace(/\.[^.]+$/,'').replace(/-edited$/i,'')||'structure';
    const randomSuffix=String(Math.floor(Math.random()*1000000)).padStart(6,'0');
    const filename=`${baseName}${randomSuffix}.mcstructure`;
    const blob=new Blob([bytes],{type:'application/octet-stream'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
    toast(`已导出 ${filename}（${(bytes.byteLength/1024/1024).toFixed(2)} MiB）`,'ok');
  }catch(error){console.error(error);toast('导出失败：'+error.message,'err');}
  finally{button.disabled=!project;button.textContent='导出 MCStructure';}
}


function setMobileInspectorOpen(open){
  const panel=document.getElementById('inspectorPanel');
  const scrim=document.getElementById('mobileInspectorScrim');
  const toggle=document.getElementById('mobileInspectorToggle');
  if(!panel)return;
  const isOpen=!!open;
  panel.classList.toggle('mobile-open',isOpen);
  if(scrim)scrim.hidden=!isOpen;
  if(toggle){toggle.setAttribute('aria-expanded',String(isOpen));toggle.hidden=isOpen;}
  if(!isOpen&&toggle)toggle.hidden=false;
}

function setupUI(){
  const mobilePad=document.getElementById('mobileCameraPad');
  if(mobilePad){
    const release=button=>{const key=button?.dataset?.cameraKey;if(key){cameraMoveKeys.delete(key);button.classList.remove('is-pressed');}};
    mobilePad.querySelectorAll('button[data-camera-key]').forEach(button=>{
      button.addEventListener('pointerdown',event=>{event.preventDefault();const key=button.dataset.cameraKey;cameraMoveKeys.add(key);button.classList.add('is-pressed');try{button.setPointerCapture(event.pointerId);}catch{}requestSceneRender();});
      for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>release(button));
      button.addEventListener('contextmenu',event=>event.preventDefault());
    });
    window.addEventListener('blur',()=>mobilePad.querySelectorAll('.is-pressed').forEach(release));
  }

  document.getElementById('mobileInspectorToggle').addEventListener('click',()=>setMobileInspectorOpen(true));
  document.getElementById('mobileInspectorClose').addEventListener('click',()=>setMobileInspectorOpen(false));
  document.getElementById('mobileInspectorScrim').addEventListener('click',()=>setMobileInspectorOpen(false));
  document.getElementById('openBtn').onclick=()=>document.getElementById('fileInput').click();
  document.getElementById('historyUndoBtn').onclick=undoLastEdit;document.getElementById('batchReplaceBtn').onclick=openBatchReplace;
  document.getElementById('fileInput').addEventListener('change',async e=>{const file=e.target.files?.[0];e.target.value='';try{await importFile(file);}catch(error){console.error(error);toast('读取失败：'+error.message,'err');}});
  document.getElementById('exportBtn').onclick=exportFile;
  document.getElementById('chainCodeClose').onclick=closeChainCode;document.getElementById('chainCodeModal').addEventListener('click',e=>{if(e.target.id==='chainCodeModal')closeChainCode();});document.getElementById('chainCodeText').addEventListener('scroll',e=>{document.getElementById('chainLineNumbers').scrollTop=e.target.scrollTop;});
  document.getElementById('batchReplaceCancel').onclick=()=>document.getElementById('batchReplaceModal').classList.remove('on');document.getElementById('batchReplaceModal').addEventListener('click',e=>{if(e.target.id==='batchReplaceModal')e.currentTarget.classList.remove('on');});document.getElementById('replacePreviewBtn').onclick=previewBatchReplace;document.getElementById('replaceApplyBtn').onclick=applyBatchReplace;for(const id of ['replaceScope','replaceFind','replaceWith','replaceRegex','replaceCaseSensitive']){const control=document.getElementById(id),invalidate=()=>{batchReplacePreview=null;document.getElementById('replaceApplyBtn').disabled=true;document.getElementById('replacePreviewInfo').textContent='条件已更改，请重新预览';};control.addEventListener('input',invalidate);control.addEventListener('change',invalidate);}
  document.getElementById('applyTypeBtn').onclick=applyBlockType;document.getElementById('showAdjacentPicker').onclick=openAdjacentPicker;document.getElementById('findCommandChainBtn').onclick=findSelectedCommandChain;document.getElementById('adjacentPickerCancel').onclick=()=>document.getElementById('adjacentPickerModal').classList.remove('on');document.getElementById('adjacentPickerModal').addEventListener('click',e=>{if(e.target.id==='adjacentPickerModal')e.currentTarget.classList.remove('on');});document.querySelector('.adjacent-cross').addEventListener('click',e=>{const b=e.target.closest('button[data-dir]');if(b)placeAdjacent(b.dataset.dir);});document.getElementById('removeBlockBtn').onclick=removeSelected;document.getElementById('insertCommandBtn').onclick=insertCommandAfterSelected;
  document.getElementById('commandInput').addEventListener('input',updateCommandText);document.getElementById('autoInput').onchange=e=>updateCommandFlag('auto',e.target.checked);document.getElementById('conditionalInput').onchange=e=>updateCommandFlag('conditional',e.target.checked);document.getElementById('highlightInput').onchange=updateHighlight;document.getElementById('noteInput').addEventListener('input',updateNote);
  const idInput=document.getElementById('blockIdInput'),newIdInput=document.getElementById('newBlockIdInput');idInput.addEventListener('input',()=>showSuggestions(idInput));newIdInput.addEventListener('input',()=>showSuggestions(newIdInput));
  document.getElementById('idSuggestions').addEventListener('click',e=>{const item=e.target.closest('.suggestion');if(!item)return;const target=document.getElementById('idSuggestions').dataset.target;if(target==='newBlockIdInput'){newIdInput.value=item.dataset.id;lastBlockId=item.dataset.id;saveSnapshotDebounced();}else{idInput.value=item.dataset.id;}document.getElementById('idSuggestions').classList.remove('on');});
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('#idSuggestions')&&!e.target.closest('#blockIdInput')&&!e.target.closest('#newBlockIdInput'))document.getElementById('idSuggestions').classList.remove('on');});
  document.getElementById('conflictCancel').onclick=()=>{pendingInsert=null;document.getElementById('conflictModal').classList.remove('on');};document.getElementById('conflictReplace').onclick=()=>finishInsertCommand(true);document.getElementById('conflictModal').addEventListener('click',e=>{if(e.target.id==='conflictModal'){pendingInsert=null;e.currentTarget.classList.remove('on');}});
  const searchInput=document.getElementById('searchInput'),searchResults=document.getElementById('searchResults');searchInput.addEventListener('input',()=>scheduleSearchRefresh());document.getElementById('searchClear').onclick=()=>{searchInput.value='';updateSearchResults();searchInput.focus();};searchResults.addEventListener('click',e=>{const result=e.target.closest('.search-result');if(!result)return;const entry=searchResults._matches?.[Number(result.dataset.index)];if(entry)focusSearchResult(entry);});
  document.getElementById('themeToggle').onclick=()=>applyTheme(document.documentElement.dataset.theme==='light'?'dark':'light');
  window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){e.preventDefault();searchInput.focus();searchInput.select();return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){const el=document.activeElement,typing=el&&(el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.isContentEditable);if(!typing&&!modelLoadingActive){e.preventDefault();undoLastEdit();return;}}if(e.key==='Escape'){document.getElementById('searchResults').hidden=true;document.getElementById('adjacentPickerModal').classList.remove('on');closeChainCode();document.getElementById('batchReplaceModal').classList.remove('on');return;}if(document.activeElement!==canvas)return;const k=e.key.toLowerCase();if(['w','a','s','d',' ','shift'].includes(k)){if(k===' ')e.preventDefault();cameraMoveKeys.add(k);requestSceneRender();}});
  window.addEventListener('keyup',e=>{const k=e.key.toLowerCase();cameraMoveKeys.delete(k===' ' ? ' ' : k);});window.addEventListener('blur',()=>cameraMoveKeys.clear());
  window.addEventListener('pagehide',()=>{if(project){clearTimeout(saveTimer);saveSnapshot();}});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&project){clearTimeout(saveTimer);saveSnapshot();}});
}

(async function start(){setupUI();updateUndoButton();try{await initThree();const restored=await restoreLastSession();if(!restored)toast('请选择一个 .mcstructure 文件开始编辑');}catch(error){document.getElementById('loading').textContent='3D 引擎初始化失败：'+error.message;console.error(error);}})();

