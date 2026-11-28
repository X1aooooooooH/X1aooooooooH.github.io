import { BLOCK_COLOR, FACING_VEC, FACE_NORMAL, FACE_RIGHT, FACE_UP } from './core/constants.js?v=r51-ai-modules-20261129';
import { isAirPlaceholderBlock } from './core/blocks.js?v=r51-ai-modules-20261129';
import { chainBounds } from './core/model.js?v=r51-ai-modules-20261129';
import { TEX_FILES } from './core/textures.js?v=r51-ai-modules-20261129';
import { isInputFocused } from './ui/dom.js?v=r51-ai-modules-20261129';
import { app } from './state.js?v=r51-ai-modules-20261129';
import { logInfo } from './log.js?v=r51-ai-modules-20261129';
import { dot3, easeInOutQuad } from './core/util.js?v=r51-ai-modules-20261129';
import { hideInfo, showInfo } from './inspector.js?v=r51-ai-modules-20261129';

const texCache = {};
let texLoaded = false;
let texturesAvailable = false;
const keysDown = {};

const sceneHooks = { enterChainMode: null, afterRender: null };
export function setSceneHandlers(handlers = {}) {
  if (handlers.enterChainMode) sceneHooks.enterChainMode = handlers.enterChainMode;
  if (handlers.afterRender) sceneHooks.afterRender = handlers.afterRender;
}

let three = null;
let scene, camera, renderer, controls, raycaster;
let blockGroup = null;
let selectionHelper = null,
  selectionGlow = null;
let selectionPulseTime = 0;
let lastSelectionPulseMark = 0;
let previewReady = false;
let currentBounds = null;
let cameraAnim = null;
// Skip unnecessary WebGL draws when the scene and camera have not changed.
let renderDirty = true;
export function markRenderDirty() {
  renderDirty = true;
}

let sharedBlockGeo = null;
let sharedEdgeGeo = null;
let sharedEdgeMat = null;
const matArrayCache = new Map();
const solidMaterialCache = new Map();
// Batched renderer state: one InstancedMesh per visual material key instead of
// one Mesh + one edge object per command block.
let pickMeshes = [];
const pickIndexMap = new Map();
let blockBatchMeta = [];
let placeholderBatchMeta = [];
let edgeLineSegments = null;
let edgeLineGeometry = null;
let edgePositionsByChain = [];
let visibleBlockChain = -1;

export async function ensureThree() {
  if (three) return three;
  const localThree = window.BlockFlowThree;
  if (!localThree || !localThree.THREE || !localThree.OrbitControls) {
    throw new Error('本地 Three.js 依赖未加载。请在离线打包器中重新生成 offline-release。');
  }
  three = { THREE: localThree.THREE, OrbitControls: localThree.OrbitControls };
  window._sceneReady = true;
  return three;
}
export async function preloadTextures() {
  if (texLoaded) return;
  const { THREE } = three;
  const loader = new THREE.TextureLoader();
  const load = (url) =>
    new Promise((r) =>
      loader.load(
        url,
        (t) => {
          t.magFilter = THREE.NearestFilter;
          t.minFilter = THREE.NearestFilter;
          t.colorSpace = THREE.SRGBColorSpace;
          t.needsUpdate = true;
          r(t);
        },
        undefined,
        () => r(null)
      )
    );
  const entries = Object.entries(TEX_FILES);
  const results = await Promise.all(entries.map(([, u]) => load(u)));
  let ok = 0;
  entries.forEach(([k], i) => {
    if (results[i]) {
      texCache[k] = results[i];
      ok++;
    }
  });
  texLoaded = true;
  texturesAvailable = ok > 0;
}
export function updateSceneTheme() {
  if (!scene) return;
  const { THREE } = three;
  const dark = app.theme === 'dark';
  scene.background = new THREE.Color(dark ? 0x141a24 : 0xdce4ee);
  markRenderDirty();
}
export function initScene() {
  const wrap = document.getElementById('canvasWrap');
  const w = wrap.clientWidth,
    h = wrap.clientHeight;
  const { THREE, OrbitControls } = three;
  scene = new THREE.Scene();
  updateSceneTheme();
  camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 5000);

  const mainCanvas = document.createElement('canvas');
  mainCanvas.className = 'main-canvas';
  wrap.appendChild(mainCanvas);
  renderer = new THREE.WebGLRenderer({
    canvas: mainCanvas,
    antialias: true,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance'
  });
  // Cap HiDPI render cost: 2x DPR quadruples the drawing-buffer pixels.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(w, h);
  renderer.shadowMap.enabled = false;

  document.getElementById('loading').classList.add('hide');

  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x6b7280, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(80, 150, 60);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdde6ff, 0.45);
  fill.position.set(-60, 80, -80);
  scene.add(fill);
  const amb = new THREE.AmbientLight(0xffffff, 0.25);
  scene.add(amb);

  controls = new OrbitControls(camera, mainCanvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  controls.enablePan = true;
  controls.rotateSpeed = 0.5;
  controls.minDistance = 1;
  controls.maxDistance = 5000;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: -1
  };
  controls.addEventListener('change', () => {
    saveCamera();
    markRenderDirty();
  });

  mainCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
  mainCanvas.addEventListener('auxclick', (e) => {
    if (e.button === 2) e.preventDefault();
  });

  raycaster = new THREE.Raycaster();
  setupPicking();
  setupWheelNavigation();
  setupKeyboardMovement();

  let lastTime = performance.now();
  (function anim(now) {
    requestAnimationFrame(anim);
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    updateCameraAnim(now);
    updateSelectionPulse(dt);
    updateKeyboardMovement(dt);
    controls.update();
    renderFrames();
  })(lastTime);
  previewReady = true;
}

export function setupKeyboardMovement() {
  document.addEventListener('keydown', (e) => {
    if (isInputFocused()) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('button,select,a,[role="button"],[contenteditable="true"]')) return;
    if (document.querySelector('.feature-modal.on,.chain-add-modal.on,.ai-modal.on,.ws-chain-modal.on,.ws-seek-overlay.on')) return;
    if (e.code === 'Space') e.preventDefault();
    keysDown[e.code] = true;
  });
  document.addEventListener('keyup', (e) => {
    keysDown[e.code] = false;
  });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(keysDown)) keysDown[k] = false;
  });
}
let keyboardMoveScratch = null;
export function updateKeyboardMovement(dt) {
  if (!camera || !controls || cameraAnim) return;
  // Avoid allocating vectors or asking the camera for its direction on idle frames.
  if (
    !keysDown['KeyW'] &&
    !keysDown['KeyS'] &&
    !keysDown['KeyA'] &&
    !keysDown['KeyD'] &&
    !keysDown['Space'] &&
    !keysDown['ShiftLeft'] &&
    !keysDown['ShiftRight']
  )
    return;

  const { THREE } = three;
  if (!keyboardMoveScratch) {
    keyboardMoveScratch = {
      camDir: new THREE.Vector3(),
      forward: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      move: new THREE.Vector3()
    };
  }
  const { camDir, forward, right, up, move } = keyboardMoveScratch;
  const speed = 18 * dt;
  camera.getWorldDirection(camDir);
  forward.set(camDir.x, 0, camDir.z);
  if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
  forward.normalize();
  right.crossVectors(forward, up).normalize();
  move.set(0, 0, 0);
  if (keysDown['KeyW']) move.add(forward);
  if (keysDown['KeyS']) move.sub(forward);
  if (keysDown['KeyD']) move.add(right);
  if (keysDown['KeyA']) move.sub(right);
  if (keysDown['Space']) move.y += 1;
  if (keysDown['ShiftLeft'] || keysDown['ShiftRight']) move.y -= 1;
  if (move.lengthSq() === 0) return;
  move.normalize().multiplyScalar(speed);
  camera.position.add(move);
  controls.target.add(move);
  markRenderDirty();
}
export function renderFrames(force = false) {
  if (!renderer || !scene || !camera || !blockGroup) return;
  if (!force && !renderDirty) return;
  renderer.render(scene, camera);
  renderDirty = false;
}

let chainPickBox = null,
  chainPickPoint = null;
// In chain mode, test only the selected chain's unit block bounds. This avoids
// calling InstancedMesh.raycast for every instance in every material batch.
export function rayHitsAirPlaceholderInChain(chainIndex) {
  const chain = app.chains[chainIndex];
  if (!chain || !chain.blocks || !raycaster || !three) return false;
  const { THREE } = three;
  if (!chainPickBox) {
    chainPickBox = new THREE.Box3();
    chainPickPoint = new THREE.Vector3();
  }
  for (const b of chain.blocks) {
    if (!isAirPlaceholderBlock(b)) continue;
    chainPickBox.min.set(b.x, b.y, b.z);
    chainPickBox.max.set(b.x + 1, b.y + 1, b.z + 1);
    if (raycaster.ray.intersectBox(chainPickBox, chainPickPoint)) return true;
  }
  return false;
}
export function pickBlockInChain(chainIndex) {
  const chain = app.chains[chainIndex];
  if (!chain || !chain.blocks || !raycaster || !three) return null;
  const { THREE } = three;
  if (!chainPickBox) {
    chainPickBox = new THREE.Box3();
    chainPickPoint = new THREE.Vector3();
  }
  let picked = null,
    bestDistance = Infinity;
  const origin = raycaster.ray.origin;
  for (let index = 0; index < chain.blocks.length; index++) {
    const b = chain.blocks[index];
    if (isAirPlaceholderBlock(b)) continue;
    chainPickBox.min.set(b.x, b.y, b.z);
    chainPickBox.max.set(b.x + 1, b.y + 1, b.z + 1);
    const point = raycaster.ray.intersectBox(chainPickBox, chainPickPoint);
    if (!point) continue;
    const distance = origin.distanceToSquared(point);
    if (distance < bestDistance) {
      bestDistance = distance;
      picked = { chain: chainIndex, index };
    }
  }
  return picked;
}
export function setupPicking() {
  let downPos = null,
    downTime = 0;
  const dom = renderer.domElement;
  dom.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    downPos = { x: e.clientX, y: e.clientY };
    downTime = Date.now();
  });
  dom.addEventListener('pointerup', (e) => {
    if (e.button !== 0 || !downPos) return;
    const dx = e.clientX - downPos.x,
      dy = e.clientY - downPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy),
      dt = Date.now() - downTime;
    downPos = null;
    if (dist > 6 || dt > 600) return;
    const rect = dom.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera({ x: mx, y: my }, camera);
    if (!blockGroup || pickMeshes.length === 0) return;

    let picked = null;
    if (app.mode === 'chain' && app.selectedChain >= 0) {
      picked = pickBlockInChain(app.selectedChain);
    } else {
      const hits = raycaster.intersectObjects(pickMeshes, false);
      for (const hit of hits) {
        const rec = hit.object?.userData?.blockRecords?.[hit.instanceId];
        if (!rec) continue;
        picked = { chain: rec.chain, index: rec.index };
        break;
      }
    }
    if (!picked) {
      if (app.mode === 'chain' && !rayHitsAirPlaceholderInChain(app.selectedChain)) deselect();
      return;
    }
    if (app.mode === 'overview' && !app.singleChain) sceneHooks.enterChainMode?.(picked.chain);
    else selectBlock(picked);
  });
}
export function setupWheelNavigation() {
  const dom = renderer.domElement;
  dom.addEventListener(
    'wheel',
    (e) => {
      if (app.mode === 'overview' && !app.singleChain) return;
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      cycleBlock(e.deltaY > 0 ? 1 : -1);
    },
    { capture: true, passive: false }
  );
}

export function disposeTexturedMaterialCache() {
  const sharedTextures = new Set(Object.values(texCache).filter(Boolean));
  for (const mats of matArrayCache.values()) {
    for (const m of mats) {
      if (m.map && !sharedTextures.has(m.map)) m.map.dispose();
      m.dispose();
    }
  }
  matArrayCache.clear();
}
export function clearScene() {
  disposeTexturedMaterialCache();
  if (blockGroup && scene) {
    // Removing an InstancedMesh from the scene does not release its per-instance
    // GPU buffers. Dispose only the instance objects here; base geometry and
    // materials are shared caches and must remain alive.
    blockGroup.traverse((o) => {
      if (o.isInstancedMesh && typeof o.dispose === 'function') o.dispose();
      if (o.userData?.isAirPlaceholderVisual && o.material) o.material.dispose();
    });
    scene.remove(blockGroup);
    blockGroup = null;
  }

  pickMeshes.length = 0;
  pickIndexMap.clear();
  blockBatchMeta.length = 0;
  placeholderBatchMeta.length = 0;
  edgePositionsByChain.length = 0;
  edgeLineSegments = null;
  if (edgeLineGeometry) {
    edgeLineGeometry.dispose();
    edgeLineGeometry = null;
  }
  visibleBlockChain = -1;

  if (selectionHelper && scene) {
    scene.remove(selectionHelper);
    selectionHelper.geometry.dispose();
    selectionHelper.material.dispose();
    selectionHelper = null;
  }
  if (selectionGlow && scene) {
    scene.remove(selectionGlow);
    selectionGlow.geometry.dispose();
    selectionGlow.material.dispose();
    selectionGlow = null;
  }
}

export function getEdgeMat() {
  if (sharedEdgeMat) return sharedEdgeMat;
  const { THREE } = three;
  sharedEdgeMat = new THREE.LineBasicMaterial({ color: 0x1e293b, transparent: true, opacity: 0.18 });
  return sharedEdgeMat;
}
export function buildBlockMaterials(blockType, cond, facing, marked) {
  const key = blockType + '_' + cond + '_' + facing + '_' + (marked ? 1 : 0);
  if (matArrayCache.has(key)) return matArrayCache.get(key);
  const { THREE } = three;
  const frontTex = texCache[blockType + '_front'] || null;
  const backTex = texCache[blockType + '_back'] || null;
  let sideKey = blockType + '_side';
  if (cond) {
    const cs = blockType + '_conditional_side';
    if (texCache[cs]) sideKey = cs;
  }
  const sideTex = texCache[sideKey] || null;
  const F = FACING_VEC[facing] || [0, 0, 1];
  const baseColor = BLOCK_COLOR[blockType] || 0xf59e0b;
  const em = marked ? 0xfbbf24 : 0x000000,
    ei = marked ? 0.45 : 0;
  const mats = [];
  for (let f = 0; f < 6; f++) {
    const N = FACE_NORMAL[f],
      d = dot3(N, F);
    let map = null,
      color = baseColor;
    if (d > 0.5) {
      if (frontTex) {
        map = frontTex;
        color = 0xffffff;
      } else color = 0xff00ff;
    } else if (d < -0.5) {
      if (backTex) {
        map = backTex;
        color = 0xffffff;
      } else color = 0xff00ff;
    } else {
      if (sideTex) {
        const u = FACE_RIGHT[f],
          v = FACE_UP[f];
        const uC = dot3(F, u),
          vC = dot3(F, v);
        let rot = Math.atan2(-uC, vC);

        const t = sideTex.clone();
        t.needsUpdate = true;
        t.center.set(0.5, 0.5);
        t.rotation = rot;
        t.magFilter = THREE.NearestFilter;
        t.minFilter = THREE.NearestFilter;
        t.colorSpace = THREE.SRGBColorSpace;
        map = t;
        color = 0xffffff;
      } else color = 0xff00ff;
    }
    mats.push(
      new THREE.MeshStandardMaterial({
        map,
        color,
        roughness: 0.55,
        metalness: 0.05,
        emissive: em,
        emissiveIntensity: ei
      })
    );
  }
  matArrayCache.set(key, mats);
  return mats;
}

export function updateEdgeVisibility(chainIndex = -1) {
  if (!edgeLineGeometry || !edgeLineGeometry.getAttribute('position')) return;
  const attr = edgeLineGeometry.getAttribute('position');
  let writeOffset = 0;
  if (chainIndex >= 0) {
    const src = edgePositionsByChain[chainIndex];
    if (!src || !src.length) {
      edgeLineGeometry.setDrawRange(0, 0);
      return;
    }
    attr.array.set(src, 0);
    writeOffset = src.length;
  } else {
    for (const src of edgePositionsByChain) {
      if (!src || !src.length) continue;
      attr.array.set(src, writeOffset);
      writeOffset += src.length;
    }
  }
  // The buffer is sized for all edges and reused, so changing chains does not
  // allocate/dispose GPU buffers on every navigation action.
  attr.needsUpdate = true;
  edgeLineGeometry.setDrawRange(0, writeOffset / 3);
}
export function setBlockVisibility(chainIndex = -1) {
  visibleBlockChain = Number.isInteger(chainIndex) ? chainIndex : -1;
  if (!blockGroup) return;
  const { THREE } = three;
  const matrix = new THREE.Matrix4();
  for (const batch of blockBatchMeta) {
    const mesh = batch.mesh;
    if (visibleBlockChain < 0) {
      // Restore original instance order and count for overview raycasting.
      for (let i = 0; i < batch.records.length; i++) {
        const rec = batch.records[i];
        matrix.makeTranslation(rec.block.x + 0.5, rec.block.y + 0.5, rec.block.z + 0.5);
        mesh.setMatrixAt(i, matrix);
      }
      mesh.count = batch.records.length;
      mesh.userData.blockRecords = batch.records;
    } else {
      // Compact only the selected chain's instances to the front of each batch
      // and lower mesh.count. Zero-scale instances still cost instance processing.
      const visibleRecords = [];
      let writeIndex = 0;
      for (const rec of batch.records) {
        if (rec.chain !== visibleBlockChain) continue;
        matrix.makeTranslation(rec.block.x + 0.5, rec.block.y + 0.5, rec.block.z + 0.5);
        mesh.setMatrixAt(writeIndex, matrix);
        visibleRecords.push(rec);
        writeIndex++;
      }
      mesh.count = writeIndex;
      mesh.userData.blockRecords = visibleRecords;
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  for (const item of placeholderBatchMeta)
    item.mesh.visible = visibleBlockChain < 0 || item.chain === visibleBlockChain;
  updateEdgeVisibility(visibleBlockChain);
  markRenderDirty();
}

export function renderAllBlocks() {
  if (!previewReady) return;
  cameraAnim = null;
  if (controls) controls.enabled = true;
  const { THREE } = three;
  clearScene();
  hideInfo();

  blockGroup = new THREE.Group();
  pickMeshes = [];
  blockBatchMeta = [];
  edgePositionsByChain = Array.from({ length: app.chains.length }, () => new Float32Array(0));
  if (!sharedBlockGeo) sharedBlockGeo = new THREE.BoxGeometry(1, 1, 1);
  if (!sharedEdgeGeo) sharedEdgeGeo = new THREE.EdgesGeometry(sharedBlockGeo);
  const geo = sharedBlockGeo;
  const edgeGeo = sharedEdgeGeo;
  const edgeMat = getEdgeMat();
  const getSolidMat = (bt, cond, marked) => {
    const k = bt + '_' + cond + '_' + (marked ? 1 : 0);
    if (solidMaterialCache.has(k)) return solidMaterialCache.get(k);
    const c = BLOCK_COLOR[bt] || 0xf59e0b;
    const m = new THREE.MeshStandardMaterial({
      color: c,
      roughness: 0.55,
      metalness: 0.05,
      emissive: marked ? 0xfbbf24 : 0x000000,
      emissiveIntensity: marked ? 0.45 : 0
    });
    solidMaterialCache.set(k, m);
    return m;
  };

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  const batchMap = new Map();
  const localEdgePos = edgeGeo.attributes.position.array;
  // Allocate one edge buffer per chain up front. Filling these directly avoids
  // creating one temporary Float32Array per block on every scene rebuild.
  edgePositionsByChain = app.chains.map(
    (chain) =>
      new Float32Array(
        (chain.blocks || []).filter((b) => !isAirPlaceholderBlock(b)).length * localEdgePos.length
      )
  );
  const edgeWriteOffsets = Array.from({ length: app.chains.length }, () => 0);
  const totalEdgeFloats = edgePositionsByChain.reduce((n, a) => n + a.length, 0);
  const matrixPlaceholder = new THREE.Matrix4();

  for (let ci = 0; ci < app.chains.length; ci++) {
    const chain = app.chains[ci];
    const placeholderBlocks = [];
    for (let bi = 0; bi < chain.blocks.length; bi++) {
      const b = chain.blocks[bi];
      if (isAirPlaceholderBlock(b)) {
        placeholderBlocks.push(b);
        if (b.x < minX) minX = b.x;
        if (b.x + 1 > maxX) maxX = b.x + 1;
        if (b.y < minY) minY = b.y;
        if (b.y + 1 > maxY) maxY = b.y + 1;
        if (b.z < minZ) minZ = b.z;
        if (b.z + 1 > maxZ) maxZ = b.z + 1;
        continue;
      }
      const matKey = texturesAvailable
        ? `${b.blockType}_${b.cond ? 1 : 0}_${b.facing}_${b.marked ? 1 : 0}`
        : `${b.blockType}_${b.cond ? 1 : 0}_${b.marked ? 1 : 0}`;
      let batch = batchMap.get(matKey);
      if (!batch) {
        const material = texturesAvailable
          ? buildBlockMaterials(b.blockType, b.cond, b.facing, b.marked)
          : getSolidMat(b.blockType, b.cond, b.marked);
        batch = { key: matKey, material, records: [] };
        batchMap.set(matKey, batch);
      }
      const rec = { chain: ci, index: bi, block: b };
      batch.records.push(rec);
      pickIndexMap.set(`${ci}:${bi}`, { chain: ci, index: bi });

      const cx = b.x + 0.5,
        cy = b.y + 0.5,
        cz = b.z + 0.5;
      const edgeBuffer = edgePositionsByChain[ci],
        edgeOffset = edgeWriteOffsets[ci];
      for (let p = 0; p < localEdgePos.length; p += 3) {
        edgeBuffer[edgeOffset + p] = localEdgePos[p] + cx;
        edgeBuffer[edgeOffset + p + 1] = localEdgePos[p + 1] + cy;
        edgeBuffer[edgeOffset + p + 2] = localEdgePos[p + 2] + cz;
      }
      edgeWriteOffsets[ci] += localEdgePos.length;

      if (b.x < minX) minX = b.x;
      if (b.x + 1 > maxX) maxX = b.x + 1;
      if (b.y < minY) minY = b.y;
      if (b.y + 1 > maxY) maxY = b.y + 1;
      if (b.z < minZ) minZ = b.z;
      if (b.z + 1 > maxZ) maxZ = b.z + 1;
    }
    if (placeholderBlocks.length) {
      const blankMat = new THREE.MeshBasicMaterial({
        color: 0x94a3b8,
        wireframe: true,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const blankMesh = new THREE.InstancedMesh(geo, blankMat, placeholderBlocks.length);
      blankMesh.name = `air-placeholder-chain-${ci}`;
      blankMesh.userData.isAirPlaceholderVisual = true;
      if (THREE.DynamicDrawUsage !== undefined) blankMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let pi = 0; pi < placeholderBlocks.length; pi++) {
        const b = placeholderBlocks[pi];
        matrixPlaceholder.makeTranslation(b.x + 0.5, b.y + 0.5, b.z + 0.5);
        blankMesh.setMatrixAt(pi, matrixPlaceholder);
      }
      blankMesh.instanceMatrix.needsUpdate = true;
      blankMesh.computeBoundingSphere();
      blockGroup.add(blankMesh);
      placeholderBatchMeta.push({ mesh: blankMesh, chain: ci });
    }
  }

  // Material-compatible blocks are sent as instances. This reduces the main
  // block draw calls from O(block count) to O(material variants).
  const matrix = new THREE.Matrix4();
  for (const batch of batchMap.values()) {
    const mesh = new THREE.InstancedMesh(geo, batch.material, batch.records.length);
    mesh.name = `block-batch-${batch.key}`;
    mesh.userData.blockRecords = batch.records;
    if (THREE.DynamicDrawUsage !== undefined) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < batch.records.length; i++) {
      const b = batch.records[i].block;
      matrix.makeTranslation(b.x + 0.5, b.y + 0.5, b.z + 0.5);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    blockGroup.add(mesh);
    pickMeshes.push(mesh);
    blockBatchMeta.push({ mesh, records: batch.records, key: batch.key });
  }

  edgeLineGeometry = new THREE.BufferGeometry();
  edgeLineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(totalEdgeFloats), 3));
  edgeLineGeometry.setDrawRange(0, 0);
  edgeLineSegments = new THREE.LineSegments(edgeLineGeometry, edgeMat);
  edgeLineSegments.frustumCulled = false;
  blockGroup.add(edgeLineSegments);

  if (minX === Infinity) {
    minX = 0;
    maxX = 1;
    minY = 0;
    maxY = 1;
    minZ = 0;
    maxZ = 1;
  }
  scene.add(blockGroup);
  currentBounds = {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    cz: (minZ + maxZ) / 2,
    X: maxX - minX,
    Y: maxY - minY,
    Z: maxZ - minZ
  };
  if (edgeLineGeometry && edgeLineSegments) {
    const radius =
      Math.sqrt(
        currentBounds.X * currentBounds.X +
          currentBounds.Y * currentBounds.Y +
          currentBounds.Z * currentBounds.Z
      ) /
        2 +
      0.01;
    edgeLineGeometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(currentBounds.cx, currentBounds.cy, currentBounds.cz),
      radius
    );
    edgeLineSegments.frustumCulled = true;
  }
  resizeRenderer();

  setBlockVisibility(
    app.mode === 'chain' && app.selectedChain >= 0 && !app.singleChain ? app.selectedChain : -1
  );

  if (app.forceView) {
    app.forceView = false;
    app.camera = null;
    if (app.mode === 'chain' && app.selectedChain >= 0) applyChainCamera();
    else setViewPreset('side');
  } else if (app.camera) {
    camera.position.set(app.camera.px, app.camera.py, app.camera.pz);
    controls.target.set(app.camera.tx, app.camera.ty, app.camera.tz);
    camera.updateProjectionMatrix();
    controls.update();
  } else {
    if (app.mode === 'chain' && app.selectedChain >= 0) applyChainCamera();
    else setViewPreset('side');
  }
  markRenderDirty();
  sceneHooks.afterRender?.();
}

export function animateCameraTo(pos, target, duration = 600) {
  const { THREE } = three;
  cameraAnim = {
    startTime: performance.now(),
    duration,
    startPos: camera.position.clone(),
    endPos: new THREE.Vector3(pos[0], pos[1], pos[2]),
    startTarget: controls.target.clone(),
    endTarget: new THREE.Vector3(target[0], target[1], target[2])
  };
  controls.enabled = false;
  markRenderDirty();
}
export function updateCameraAnim(now) {
  if (!cameraAnim) return;
  const t = Math.min(1, (now - cameraAnim.startTime) / cameraAnim.duration);
  const e = easeInOutQuad(t);
  camera.position.lerpVectors(cameraAnim.startPos, cameraAnim.endPos, e);
  controls.target.lerpVectors(cameraAnim.startTarget, cameraAnim.endTarget, e);
  camera.updateProjectionMatrix();
  markRenderDirty();
  if (t >= 1) {
    cameraAnim = null;
    controls.enabled = true;
    saveCamera();
  }
}
export function applyChainCamera() {
  const ci = app.selectedChain;
  if (ci < 0 || ci >= app.chains.length) return;
  const chain = app.chains[ci];
  if (!chain?.blocks?.length) return;
  // Use the full occupied bounds (block coordinates plus the unit block size),
  // not the last block's x coordinate, so irregular chains center correctly.
  const bounds = chainBounds(chain, true);
  if (!bounds) return;
  const cx = (bounds.minX + bounds.maxX) / 2,
    cy = (bounds.minY + bounds.maxY) / 2,
    cz = (bounds.minZ + bounds.maxZ) / 2;
  const X = Math.max(1, bounds.X),
    Y = Math.max(1, bounds.Y),
    Z = Math.max(1, bounds.Z);
  const d = Math.max(X, Y, Z, 8) * 1.4;
  animateCameraTo([cx + d, cy, cz], [cx, cy, cz], 600);
}

export function selectBlock(ud) {
  const { THREE } = three;
  const chain = app.chains[ud.chain];
  if (!chain) return;
  const b = chain.blocks[ud.index];
  if (!b || isAirPlaceholderBlock(b)) return;
  app.selectedChain = ud.chain;
  app.selectedBlock = ud.index;
  removeSelectionVisuals();
  const glowGeo = new THREE.BoxGeometry(1.14, 1.14, 1.14);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x6366f1,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    side: THREE.BackSide
  });
  selectionGlow = new THREE.Mesh(glowGeo, glowMat);
  selectionGlow.position.set(b.x + 0.5, b.y + 0.5, b.z + 0.5);
  scene.add(selectionGlow);
  const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.08, 1.08, 1.08));
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x1e1b4b, linewidth: 2 });
  selectionHelper = new THREE.LineSegments(edgeGeo, edgeMat);
  selectionHelper.position.set(b.x + 0.5, b.y + 0.5, b.z + 0.5);
  scene.add(selectionHelper);
  selectionPulseTime = 0;
  lastSelectionPulseMark = 0;
  markRenderDirty();
  showInfo(ud.chain, ud.index, b);
  window.renderWorkspaceSidebar?.();
  window.renderInlineText?.();
  logInfo(
    `选中链 ${ud.chain + 1} 的第 ${ud.index} 号方块：${String(b.cmd || '（空命令）').slice(0, 120)}`,
    '选择命令方块'
  );
}
let selectionPulseColor1 = null,
  selectionPulseColor2 = null;
export function updateSelectionPulse(dt) {
  selectionPulseTime += dt;
  if (!selectionGlow || !selectionHelper) return;
  const now = performance.now();
  if (now - lastSelectionPulseMark < 33) return;
  lastSelectionPulseMark = now;
  const pulse = 0.5 + 0.5 * Math.sin(selectionPulseTime * 4);
  const s = 1.02 + pulse * 0.08;
  selectionGlow.scale.set(s, s, s);
  selectionGlow.material.opacity = 0.2 + pulse * 0.25;
  if (!selectionPulseColor1) selectionPulseColor1 = new three.THREE.Color(0x6366f1);
  if (!selectionPulseColor2) selectionPulseColor2 = new three.THREE.Color(0xffffff);
  selectionHelper.material.color.copy(selectionPulseColor1).lerp(selectionPulseColor2, pulse);
  markRenderDirty();
}
export function removeSelectionVisuals() {
  let removed = false;
  if (selectionHelper && scene) {
    removed = true;
    scene.remove(selectionHelper);
    selectionHelper.geometry.dispose();
    selectionHelper.material.dispose();
    selectionHelper = null;
  }
  if (selectionGlow && scene) {
    removed = true;
    scene.remove(selectionGlow);
    selectionGlow.geometry.dispose();
    selectionGlow.material.dispose();
    selectionGlow = null;
  }
  if (removed) markRenderDirty();
}
export function reselectCurrent() {
  const ci = app.selectedChain,
    bi = app.selectedBlock;
  if (ci < 0 || bi < 0 || !blockGroup) return;
  const rec = pickIndexMap.get(`${ci}:${bi}`);
  if (rec) selectBlock(rec);
}
export function deselect() {
  removeSelectionVisuals();
  app.selectedBlock = -1;
  hideInfo();
}

export function captureOverviewCamera() {
  if (!camera || !controls) return app.overviewCamera;
  // If the user switches modes during a preset animation, preserve the
  // camera's actual on-screen position rather than an older snapshot.
  if (cameraAnim) {
    cameraAnim = null;
    controls.enabled = true;
  }
  const snapshot = {
    px: camera.position.x,
    py: camera.position.y,
    pz: camera.position.z,
    tx: controls.target.x,
    ty: controls.target.y,
    tz: controls.target.z
  };
  app.overviewCamera = { ...snapshot };
  app.camera = { ...snapshot };
  return snapshot;
}

export function cycleBlock(dir) {
  if (app.chains.length === 0) return;
  const ci = app.selectedChain >= 0 ? app.selectedChain : 0;
  const chain = app.chains[ci];
  if (!chain || chain.blocks.length === 0) return;
  const length = chain.blocks.length;
  let idx = app.selectedChain === ci && app.selectedBlock >= 0 ? app.selectedBlock : dir > 0 ? -1 : 0;
  for (let step = 0; step < length; step++) {
    idx = (idx + dir + length) % length;
    if (isAirPlaceholderBlock(chain.blocks[idx])) continue;
    const rec = pickIndexMap.get(`${ci}:${idx}`);
    if (rec) {
      selectBlock(rec);
      return;
    }
  }
}

export function setViewPreset(p) {
  if (!camera || !controls || !currentBounds) return;
  cameraAnim = null;
  controls.enabled = true;
  if (p === 'default' && app.mode !== 'overview') {
    app.mode = 'overview';
    app.selectedChain = -1;
    if (blockGroup) setBlockVisibility(-1);
    markRenderDirty();
  }
  document
    .querySelectorAll('[data-preset]')
    .forEach((b) => b.classList.toggle('active', b.dataset.preset === p));
  let cx, cy, cz, X, Y, Z;
  if (app.mode === 'chain' && app.selectedChain >= 0 && app.chains[app.selectedChain]) {
    const bounds = chainBounds(app.chains[app.selectedChain], true);
    if (bounds) {
      cx = (bounds.minX + bounds.maxX) / 2;
      cy = (bounds.minY + bounds.maxY) / 2;
      cz = (bounds.minZ + bounds.maxZ) / 2;
      X = Math.max(1, bounds.X);
      Y = Math.max(1, bounds.Y);
      Z = Math.max(1, bounds.Z);
    } else ({ cx, cy, cz, X, Y, Z } = currentBounds);
  } else {
    ({ cx, cy, cz, X, Y, Z } = currentBounds);
  }
  const d = Math.max(X, Y, Z, 8) * 1.4;
  let px, py, pz;
  switch (p) {
    case 'front':
      px = cx;
      py = cy;
      pz = cz + d;
      break;
    case 'side':
      px = cx + d;
      py = cy;
      pz = cz;
      break;
    case 'top':
      px = cx;
      py = cy + d;
      pz = cz + 0.01;
      break;
    default:
      px = cx + d * 0.55;
      py = cy + d * 0.75;
      pz = cz + d * 1.05;
      break;
  }
  camera.position.set(px, py, pz);
  camera.lookAt(cx, cy, cz);
  camera.updateProjectionMatrix();
  controls.target.set(cx, cy, cz);
  controls.update();
  markRenderDirty();
  saveCamera();
}
export function saveCamera() {
  if (!camera || !controls || cameraAnim) return;
  const snapshot = {
    px: camera.position.x,
    py: camera.position.y,
    pz: camera.position.z,
    tx: controls.target.x,
    ty: controls.target.y,
    tz: controls.target.z
  };
  app.camera = snapshot;
  if (app.mode === 'overview') app.overviewCamera = { ...snapshot };
}
export function resizeRenderer() {
  if (!previewReady || !renderer) return;
  const wrap = document.getElementById('canvasWrap');
  const w = wrap.clientWidth,
    h = wrap.clientHeight;
  if (w === 0 || h === 0) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  markRenderDirty();
}

window.addEventListener('resize', resizeRenderer);

export const hasTextures = () => texturesAvailable;
export const isPreviewReady = () => previewReady;
export const getPickRecord = (chain, block) => pickIndexMap.get(`${chain}:${block}`) || null;
