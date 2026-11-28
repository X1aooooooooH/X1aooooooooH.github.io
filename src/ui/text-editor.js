import {
  getBrokenHeadKind,
  isBrokenChainPlaceholder,
  normalizeBrokenChainBlocks
} from '../core/broken-chain.js';
import { escapeHtml } from './dom.js';
import { appendImportedChains } from '../editor.js';

// 这里的工具供两处使用：工作区的内联文本编辑器，以及 TXT 文件导入。
// 旧的整屏文本编辑弹窗已经删除，链文本现在只在 workspace.js 的内联编辑器里编辑。

/**
 * 把 TXT 文件内容切成命令行数组。
 *
 * 文件末尾的单个换行是常规的行结束符，不再额外产生一个命令方块；
 * 中间的空行则保留为真实的空命令方块。要让末尾多一个空方块，文件须以两个换行结尾。
 */
function normalizeImportedCommands(text) {
  const source = String(text ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n');
  if (source.length === 0) return [];

  const normalized = source.endsWith('\n') ? source.slice(0, -1) : source;
  if (normalized.length === 0) return [];

  return normalized.split('\n').map((line) => line.trim());
}

/** 判断导入的命令链属于断链形式（snake）还是普通重复链。 */
function classifyTxtChain(commands) {
  const isSnake = getBrokenHeadKind(commands) || isBrokenChainPlaceholder(commands);
  return isSnake ? 'snake' : 'repeat';
}

/**
 * 把一行命令渲染成带语法高亮的 HTML。
 * 每个分支负责消费一段输入并前移游标 i，认不出的字符原样输出。
 */
function highlightCommandBody(source) {
  const text = String(source ?? '');
  let i = 0;
  let out = '';

  const append = (cls, value) => {
    const safe = escapeHtml(value);
    out += cls ? `<span class="${cls}">${safe}</span>` : safe;
  };

  while (i < text.length) {
    // 行注释：吞掉这一行剩下的内容
    if (text[i] === '#') {
      append('tok-comment', text.slice(i));
      break;
    }

    // 引号字符串，支持反斜杠转义
    if (text[i] === '"' || text[i] === "'") {
      const quote = text[i];
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === '\\') {
          j += 2;
          continue;
        }
        if (text[j] === quote) {
          j++;
          break;
        }
        j++;
      }
      append('tok-string', text.slice(i, j));
      i = j;
      continue;
    }

    // 命令名只出现在行首
    if (i === 0 && text[i] === '/') {
      const m = text.match(/^\/[A-Za-z0-9_.:-]+/);
      if (m) {
        append('tok-command', m[0]);
        i += m[0].length;
        continue;
      }
    }

    // 目标选择器 @a、@e[type=zombie]
    if (text[i] === '@') {
      const m = text.slice(i).match(/^@[A-Za-z][A-Za-z0-9_]*(?:\[[^\]]*\])?/);
      if (m) {
        append('tok-selector', m[0]);
        i += m[0].length;
        continue;
      }
    }

    // 相对坐标 ~ ~ ~1
    const coord = text.slice(i).match(/^[~^](?:-?(?:\d+(?:\.\d+)?|\.\d+))?/);
    if (coord) {
      append('tok-coordinate', coord[0]);
      i += coord[0].length;
      continue;
    }

    const number = text.slice(i).match(/^-?(?:\d+(?:\.\d+)?|\.\d+)/);
    if (number) {
      append('tok-number', number[0]);
      i += number[0].length;
      continue;
    }

    // 命名空间 ID 必须在 ':' 被当成标点之前匹配，
    // 这样也能认出 key=minecraft:block 里值的那一侧。
    const resourceId = text.slice(i).match(/^[A-Za-z0-9_.-]+:[A-Za-z0-9_./-]+/);
    if (resourceId) {
      append('tok-id', resourceId[0]);
      i += resourceId[0].length;
      continue;
    }

    if (/[\[\]{}(),:]/.test(text[i])) {
      append('tok-punc', text[i]);
      i++;
      continue;
    }

    const word = text.slice(i).match(/^[^\s\[\]{}(),:"']+/);
    if (word) {
      const value = word[0];
      if (/^(?:true|false|null)$/i.test(value)) {
        append('tok-keyword', value);
      } else if (/^[A-Za-z0-9_.-]+:[A-Za-z0-9_./-]+$/.test(value)) {
        append('tok-id', value);
      } else {
        append('', value);
      }
      i += value.length;
      continue;
    }

    // 兜底：逐字符前进，避免死循环
    append('', text[i]);
    i++;
  }

  return out || ' ';
}

/**
 * 渲染单行命令行，供内联编辑器的叠层使用。
 * highlightCommandBody 内部已做空值兜底，这里直接引用即可。
 */
const highlightTextEditorLine = highlightCommandBody;

/** 把 TXT 里的命令行包装成一条命令链；断链形式会自动归一化。 */
function buildTxtChains(commands) {
  const parsed = commands.map((cmd) => ({ cmd: String(cmd ?? '').trim(), cond: 0 }));
  const type = classifyTxtChain(parsed.map((item) => item.cmd));
  if (type === 'snake') normalizeBrokenChainBlocks(parsed, { applyCondition: true });

  const firstBlockType = type === 'impulse' ? 'command' : 'repeating';
  const blocks = parsed.map((item, index) => ({
    cmd: item.cmd,
    cond: item.cond ? 1 : 0,
    auto: 1,
    facing: 2,
    blockType: index === 0 ? firstBlockType : 'chain',
    isBrokenNormalized: !!item.isBrokenNormalized,
    marked: false,
    note: ''
  }));

  return [{ type, blocks }];
}

/** 从 TXT 文件导入一条命令链。 */
async function importChainFromTxt(file) {
  const text = await file.text();
  const commands = normalizeImportedCommands(text);
  if (!commands.length) throw new Error('TXT 文件中没有找到命令');

  const label = file.name.replace(/\.txt$/i, '') || 'TXT 指令';
  appendImportedChains(buildTxtChains(commands), label, { closeModal: true });
}

/** AI 的「文本范围」读取内联编辑器当前打开的链；没有打开时返回 -1。 */
export const getTextEditChain = () => {
  const state = window.getInlineEditState?.();
  return state && Number.isInteger(state.chain) ? state.chain : -1;
};

export { highlightTextEditorLine, importChainFromTxt };
