// Single shared application model. UI modules import and mutate this object.
export const app = {
  mode: 'overview',
  chains: [],
  history: [],
  historyIndex: -1,
  savedHistoryIndex: -1,
  selectedChain: -1,
  selectedBlock: -1,
  fileName: 'structure',
  camera: null,
  theme: 'dark',
  forceView: false,
  overviewCamera: null,
  singleChain: false,
  originalRoot: null,
  originalSize: null,
  sourceOrigin: [0, 0, 0],
  autosaveTimer: null,
  autosaveKey: 'BlockFlow.autosave.v1',
  currentAction: '空闲',
  logs: [],
  saved: true
};
