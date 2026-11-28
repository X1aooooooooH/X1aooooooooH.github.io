import { getBrokenHeadKind, isBrokenChainPlaceholder, normalizeBrokenChainBlocks } from '../core/broken-head.js';
import { escapeHtml } from './dom.js';
import { appendImportedChains } from '../editor.js';

// Shared text helpers used by the workspace inline editor and by TXT import.
// The old full-screen text modal is gone; the inline editor in workspace.js is
// the only place a chain is edited as text.

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

function highlightCommandBody(source){
  const text=String(source??'');
  let i=0,out='';
  const append=(cls,value)=>{out+=cls?`<span class="${cls}">${escapeHtml(value)}</span>`:escapeHtml(value);};
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

function buildTxtChains(commands){
  const parsed=commands.map(cmd=>({cmd:String(cmd??'').trim(),cond:0}));
  const type=classifyTxtChain(parsed.map(item=>item.cmd));
  if(type==='snake')normalizeBrokenChainBlocks(parsed,{applyCondition:true});
  const firstBlockType=type==='impulse'?'command':'repeating';
  const blocks=parsed.map((item,index)=>({
    cmd:item.cmd,
    cond:item.cond?1:0,
    auto:1,
    facing:2,
    blockType:index===0?firstBlockType:'chain',
    isBrokenNormalized:!!item.isBrokenNormalized,
    marked:false,
    note:''
  }));
  return [{type,blocks}];
}

async function importChainFromTxt(file){
  const text=await file.text();
  const commands=normalizeImportedCommands(text);
  if(!commands.length)throw new Error('TXT 文件中没有找到命令');
  const chains=buildTxtChains(commands);
  const label=file.name.replace(/\.txt$/i,'')||'TXT 指令';
  appendImportedChains(chains,label,{closeModal:true});
}

// AI scopes that ask for "the text being edited" now read the inline editor.
export const getTextEditChain = () => {
  const state=window.getInlineEditState?.();
  return state&&Number.isInteger(state.chain)?state.chain:-1;
};
export {
  highlightTextEditorLine, importChainFromTxt
};
