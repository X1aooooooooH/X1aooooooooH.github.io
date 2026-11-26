// Shared numeric limits, palette metadata and voxel-facing tables.
export const STD_Z = 32;
export const MAX_STRUCTURE_SIZE = 64;
// Import limits prevent oversized or adversarial NBT files from exhausting browser memory.
// 支持较大的 mcstructure；128 MiB 是文件字节上限，结构体积仍单独受 MAX_IMPORT_VOLUME 保护。
export const MAX_IMPORT_BYTES = 128 * 1024 * 1024;
export const MAX_IMPORT_VOLUME = 1_000_000;
export const MAX_NBT_DEPTH = 96;
export const MAX_NBT_LIST_ITEMS = 1_000_000;
export const MAX_NBT_ARRAY_ITEMS = 1_000_000;

export const BLOCK_COLOR = { command: 0xf59e0b, chain: 0x10b981, repeating: 0x8b5cf6 };
export const TYPE_LABEL = { command: '脉冲命令方块', chain: '链式命令方块', repeating: '重复命令方块' };
export const FACING_VEC = { 0: [0, -1, 0], 1: [0, 1, 0], 2: [0, 0, -1], 3: [0, 0, 1], 4: [-1, 0, 0], 5: [1, 0, 0] };
export const FACE_NORMAL = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
export const FACE_RIGHT = [[0, 0, -1], [0, 0, 1], [1, 0, 0], [1, 0, 0], [1, 0, 0], [-1, 0, 0]];
export const FACE_UP = [[0, 1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [0, 1, 0], [0, 1, 0]];
export const COMMAND_BLOCK_TYPES = Object.freeze(['command', 'repeating', 'chain']);
export const isCommandBlockType = type => COMMAND_BLOCK_TYPES.includes(type);
