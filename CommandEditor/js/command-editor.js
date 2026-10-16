
'use strict';

const TAG={END:0,BYTE:1,SHORT:2,INT:3,LONG:4,FLOAT:5,DOUBLE:6,BYTE_ARRAY:7,STRING:8,LIST:9,COMPOUND:10,INT_ARRAY:11,LONG_ARRAY:12};
class Reader{
  constructor(buf){this.dv=new DataView(buf);this.p=0;this.dec=new TextDecoder('utf-8');}
  remaining(){return this.dv.byteLength-this.p;}
  i8(){const v=this.dv.getInt8(this.p);this.p+=1;return v;}
  u8(){const v=this.dv.getUint8(this.p);this.p+=1;return v;}
  i16(){const v=this.dv.getInt16(this.p,true);this.p+=2;return v;}
  u16(){const v=this.dv.getUint16(this.p,true);this.p+=2;return v;}
  i32(){const v=this.dv.getInt32(this.p,true);this.p+=4;return v;}
  u32(){const v=this.dv.getUint32(this.p,true);this.p+=4;return v;}
  i64(){const lo=BigInt(this.u32());const hi=BigInt(this.u32());return BigInt.asIntN(64,(hi<<32n)|lo);}
  f32(){const v=this.dv.getFloat32(this.p,true);this.p+=4;return v;}
  f64(){const v=this.dv.getFloat64(this.p,true);this.p+=8;return v;}
  bytes(n){if(!Number.isInteger(n)||n<0||n>this.remaining())throw new Error('NBT 字节数组长度非法或数据不完整');const o=new Uint8Array(this.dv.buffer,this.dv.byteOffset+this.p,n).slice();this.p+=n;return o;}
  str(){const len=this.u16();return this.dec.decode(this.bytes(len));}
  body(t,depth=0){
    if(depth>MAX_NBT_DEPTH)throw new Error(`NBT 嵌套深度超过安全上限 ${MAX_NBT_DEPTH}`);
    switch(t){
      case TAG.END:return null;
      case TAG.BYTE:return{type:t,value:this.i8()};
      case TAG.SHORT:return{type:t,value:this.i16()};
      case TAG.INT:return{type:t,value:this.i32()};
      case TAG.LONG:return{type:t,value:this.i64()};
      case TAG.FLOAT:return{type:t,value:this.f32()};
      case TAG.DOUBLE:return{type:t,value:this.f64()};
      case TAG.BYTE_ARRAY:{const n=this.i32();if(n<0||n>MAX_IMPORT_BYTES)throw new Error('NBT ByteArray 长度超过安全上限');return{type:t,value:this.bytes(n)};}
      case TAG.STRING:return{type:t,value:this.str()};
      case TAG.LIST:{
        const et=this.u8(),n=this.i32();
        if(n<0||n>MAX_NBT_LIST_ITEMS|| (et===TAG.END&&n!==0) || (et!==TAG.END&&n>this.remaining()))throw new Error('NBT 列表长度非法、超过安全上限或数据不完整');
        const items=[];for(let i=0;i<n;i++)items.push(this.body(et,depth+1));
        return{type:t,value:{elementType:et,items}};
      }
      case TAG.COMPOUND:{const o={};while(true){const ct=this.u8();if(ct===TAG.END)break;const name=this.str();o[name]=this.body(ct,depth+1);}return{type:t,value:o};}
      case TAG.INT_ARRAY:{const n=this.i32();if(n<0||n>MAX_NBT_ARRAY_ITEMS||n>Math.floor(this.remaining()/4))throw new Error('NBT IntArray 长度非法、超过安全上限或数据不完整');const a=new Array(n);for(let i=0;i<n;i++)a[i]=this.i32();return{type:t,value:a};}
      case TAG.LONG_ARRAY:{const n=this.i32();if(n<0||n>MAX_NBT_ARRAY_ITEMS||n>Math.floor(this.remaining()/8))throw new Error('NBT LongArray 长度非法、超过安全上限或数据不完整');const a=new Array(n);for(let i=0;i<n;i++)a[i]=this.i64();return{type:t,value:a};}
    }
    throw new Error('Unknown tag: '+t);
  }
  root(){const t=this.u8();this.str();return this.body(t,0);}
}
const T={
  byte:v=>({type:TAG.BYTE,value:v}),int:v=>({type:TAG.INT,value:v}),
  long:v=>({type:TAG.LONG,value:typeof v==='bigint'?v:BigInt(v)}),
  str:v=>({type:TAG.STRING,value:v}),ia:a=>({type:TAG.INT_ARRAY,value:a}),
  list:(et,items)=>({type:TAG.LIST,value:{elementType:et,items}}),
  comp:o=>({type:TAG.COMPOUND,value:o}),
};
class Writer{
  constructor(){this.parts=[];this.enc=new TextEncoder();}
  push(a){this.parts.push(a);}
  u8(v){const b=new Uint8Array(1);b[0]=v&0xff;this.push(b);}
  i8(v){const b=new Uint8Array(1);new DataView(b.buffer).setInt8(0,v);this.push(b);}
  i16(v){const b=new Uint8Array(2);new DataView(b.buffer).setInt16(0,v,true);this.push(b);}
  u16(v){const b=new Uint8Array(2);new DataView(b.buffer).setUint16(0,v,true);this.push(b);}
  i32(v){const b=new Uint8Array(4);new DataView(b.buffer).setInt32(0,v,true);this.push(b);}
  i64(v){const b=new Uint8Array(8);const dv=new DataView(b.buffer);const bi=typeof v==='bigint'?v:BigInt(v);dv.setUint32(0,Number(bi&0xffffffffn),true);dv.setUint32(4,Number((bi>>32n)&0xffffffffn),true);this.push(b);}
  f32(v){const b=new Uint8Array(4);new DataView(b.buffer).setFloat32(0,v,true);this.push(b);}
  f64(v){const b=new Uint8Array(8);new DataView(b.buffer).setFloat64(0,v,true);this.push(b);}
  bytes(a){this.push(new Uint8Array(a));}
  str(s){const e=this.enc.encode(String(s??''));if(e.length>0xFFFF)throw new Error(`NBT 字符串 UTF-8 长度为 ${e.length} 字节，超过 65535 字节上限`);this.u16(e.length);this.bytes(e);}
  body(t,v){
    switch(t){
      case TAG.END:break;
      case TAG.BYTE:this.i8(v);break;
      case TAG.SHORT:this.i16(v);break;
      case TAG.INT:this.i32(v);break;
      case TAG.LONG:this.i64(v);break;
      case TAG.FLOAT:this.f32(v);break;
      case TAG.DOUBLE:this.f64(v);break;
      case TAG.BYTE_ARRAY:this.i32(v.length);this.bytes(v);break;
      case TAG.STRING:this.str(v);break;
      case TAG.LIST:this.u8(v.elementType);this.i32(v.items.length);for(const it of v.items)this.body(v.elementType,it.value);break;
      case TAG.COMPOUND:for(const n of Object.keys(v)){const c=v[n];this.u8(c.type);this.str(n);this.body(c.type,c.value);}this.u8(TAG.END);break;
      case TAG.INT_ARRAY:this.i32(v.length);for(const x of v)this.i32(x);break;
      case TAG.LONG_ARRAY:this.i32(v.length);for(const x of v)this.i64(x);break;
    }
  }
  serialize(root){this.u8(root.type);this.str('');this.body(root.type,root.value);let total=0;for(const p of this.parts)total+=p.length;const out=new Uint8Array(total);let off=0;for(const p of this.parts){out.set(p,off);off+=p.length;}return out;}
}

const BLOCK_COLOR={command:0xf59e0b,chain:0x10b981,repeating:0x8b5cf6};
const TYPE_LABEL={command:'脉冲命令方块',chain:'链式命令方块',repeating:'重复命令方块'};
const STD_Z=32;
const MAX_STRUCTURE_SIZE=64;
                                                                                           
                                                                   
const MAX_IMPORT_BYTES=128*1024*1024;
const MAX_IMPORT_VOLUME=1_000_000;
const MAX_NBT_DEPTH=96;
const MAX_NBT_LIST_ITEMS=1_000_000;
const MAX_NBT_ARRAY_ITEMS=1_000_000;
const TEX_VERSION='13';
const TEX_FILES=(()=>{
  const raw={
    command_front:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAAAFzUkdCAK7OHOkAAAEmSURBVDjLYzhe5/8fhmcl2/9vCDH7f7I37T+yOD55BnTJ88u6wfSeci+smtHlGdAlYRhZET55BmySMGyuIv7fWVsaTGOTB+ljwKU5ysPm/6Xzt/6fPXX1/9FDZ8F8dDVnppX8ZwAFCLohIMXnTl/7v3nDTjieP3c5iiEgzWAXwAIJZgi65kV6OnD2xP6ZYHmYZpDlDMghDfIryNnINqNjkCEgdbCoRDHAXlMK7GeQwkPtdmC6zdkRTH9OiAHT5SUN/31N1bCnA5DJMANwYZABIHU40wHIj6AAg2nwyzFC0QwLSLzpAKQI5Fd0m9GjkmA6ABkC0ohNM950AJME+RUUYNhSIko6APkF2RCY5Kbq8P8bC93/r8xxxiqPkg5ghiBLIkcxLnkAbpecDO0X8zsAAAAASUVORK5CYII=',
    command_back:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAAAFzUkdCAK7OHOkAAAFKSURBVDjLYzhe5/8fhmcl2/9vCDH7f7I37T+yOD55BnTJ88u6wfSeci+smtHlGdAlYRhZET55BmTJrRMr/0d52MCxuYr4f2dtaTCNLA5SBzOEAdlkkOTVS3f/Xzp/C47Pnrr6/+ihsygYpA6k/sy0kv8MoACBGQKSOHf62v/NG3bixCuWrgerA2kGuwAWSCAOsgErQgLB9CI9HTDtl2MEpufPXf4/0tEIHhsMyCEN8ivI2fhcMLF/JlgdLCpRDLDXlAL7GaTwULsdmD5XVQ6mz1qZgenykob/vqZq2NMByGSYAbgwyACQOqzpABQGoFAGKWxSVUZxwZrMdLgBIHVY0wGyAfhcAItGrOkAZAAoqkChDQowkAZ0jDMdIKdEUFSB/AoKMGwpESUdgPyC7BKY5Kbq8P8bC93/r8xxxiqPkg5ghiBLIkcxLnkAjROOTsvB9asAAAAASUVORK5CYII=',
    command_side:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAAAFzUkdCAK7OHOkAAAE+SURBVDjLYzhe5/8fhmcl2/9vCDH7f7I37T+yOD55BnTJ88u6wfSeci+smtHlGdAlYRimKNxcCa88AzZJGDZXEf9/9tRVMI1NHqSPAZfmKA+b/5fO3/q/ecPO/0cPnQXz0dWcmVbynwEUIOiGgBRfvXQXrBmG0Q0BaQa7ABZIMEPQNTepKsPZ8+cuB8vDNIMsZ0AOaZBfYc7GhSf2zwSrg0UligH2mlLgQAMpPNRuB6bPVZWD6c8JMWC6vKThv6+pGvZ0AAt1fC4AGQBShzUdgPwHCiyQwhXenhA6JBBMJ0FdBDIApA5rOkA2AJ8LYLGBkQ5gBqxYuh4c4qAAA2lAxzADMNLB1omVYEkQjnQ0AvsVFGAgGiYOwiB1KOkA5Bdkl8AkN1WH/99Y6P5/ZY4zVnmUdAAzBFkSOYpxyQMApOOVgb1KYyYAAAAASUVORK5CYII=',
    chain_front:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAAAFzUkdCAK7OHOkAAAEnSURBVDjLYyjbNP0/DMd0lf33K07+37Z90X9kcXzyDOiSCw9vAdP5K/qxakaXZ0CXhGFkRfjkGbBJwrCSkfZ/DRtjMI1NHqSPAZdmt1C//5fO3/p/9tTV/0cPnQXz0dVM2LPyPwMoQNANASk+d/ra/80bdsLx/LnLUQwBaQa7ABZIMEPQNTepKsPZE/tnguVhmkGWMyCHNMivIGcj24yOQYaA1MGiEsUANUsDsJ9BCg+124Hpc1XlYPqslRmYLi9p+G/kZoc9HYBMhhmAC4MMAKnDmQ5AfgQFGExDEtQlMM2wgMSbDkCKQH5Ftxk9KgmmA5AhII3YNONNBzBJkF9BAYYtJaKkA5BfkA2BSZYs6vufOa/9f8r0RqzyKOkAZgiyJHIU45IHABnnss4BV0zjAAAAAElFTkSuQmCC',
    chain_back:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAAAFzUkdCAK7OHOkAAAFISURBVDjLYyjbNP0/DMd0lf33K07+37Z90X9kcXzyDOiSCw9vAdP5K/qxakaXZ0CXhGFkRfjkGZAle1bN/e8W6gfHSkba/zVsjME0sjhIHcwQBmSTQZJXL939f+n8LTg+e+rq/6OHzqJgkDqQ+gl7Vv5nAAUIzBCQxLnT1/5v3rATJ16xdD1YHUgz2AWwQAJxkA04V1UOphfp6YBpvxwjMD1/7vL/dkGe8NhgQA5pkF9Bzsbngon9M8HqYFGJYoCapQHYzyCFh9rtwHSbsyOY/pwQA6bLSxr+G7nZYU8HIJNhBuDCIANA6rCmA1AYgEIZ2e9rMtNRXAIyAKQOazpANgCfC2DRiDUdgAwARRUotEEBBtKAjnGmA+SUCIoqkF9BAYYtJaKkA5BfkF0CkyxZ1Pc/c177/5TpjVjlUdIBzBBkSeQoxiUPAC1MoXq7zn9MAAAAAElFTkSuQmCC',
    chain_side:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAAAFzUkdCAK7OHOkAAAE4SURBVDjLYyjbNP0/DMd0lf33K07+37Z90X9kcXzyDOiSCw9vAdP5K/qxakaXZ0CXhGGYImNfJ7zyDNgkYVjJSPv/2VNXwTQ2eZA+Blya3UL9/l86f+v/5g07/x89dBbMR1czYc/K/wygAEE3BKT46qW7YM0wjG4ISDPYBbBAghmCrvlESBCcPX/ucrA8TDPIcgbkkAb5FeZsXHhi/0ywOlhUohigZmkADjSQwkPtdmC6zdkRTH9OiAHT5SUN/43c7LCnA1io43MByACQOqzpAOQ/UGAh+x3mgiSoi0AGgNRhTQfIBuBzASw2MNIBzIAVS9eDQxwUYCAN6BhmAEY66Fk1FywJwnZBnmC/ggIMRMPEQRikDiUdgPyC7BKYZMmivv+Z89r/p0xvxCqPkg5ghiBLIkcxLnkALCeqM7an4U0AAAAASUVORK5CYII=',
    chain_conditional_side:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAAAFzUkdCAK7OHOkAAAFBSURBVDjLYyjbNP0/DMd0lf33K07+37Z90X9kcXzyDOiSCw9vAdP5K/qxakaXZ0CXhGGYImNfJ7zyDNgkYVjJSPv/2VNXwTQ2eZA+Blya3UL9/l86f+v/5g07/x89dBbMR1czYc/K/wygAEE3BKT46qW7YM0wjG4ISDPYBbBAghmCrvlESBCcPX/ucrA8TDPIcgbkkAb5FeZsXHhi/0ywOlhUohigZmkADjSQwkPtdmC6zdkRTH9OiAHT5SUN/43c7LCnA1io43MByACQOqzpAOQ/UGAhKwY5GTlMQGIgdVjTAbIBIIXa9mb/jbwdwDTMEJgBWNMBzACQrSB2yvTG/y4pYWAaJodsAEY66Fk1FywJwrVLJoM1p/bWgGlkORAbJR2A/ILsEphkyaK+/5nz2sEuwCaPkg5ghiBLIkcxLnkAhrWpqAvLmkMAAAAASUVORK5CYII=',
    repeating_front:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAAAFzUkdCAK7OHOkAAAEmSURBVDjLY8jyP/4fhkPsZ/33MGv4X5t28j+yOD55BnTJ2d3nwXSK1x6smtHlGdAlYRhZET55BmySMCwvbv5fRdoZTGOTB+ljwKXZ2Sbq/6Xzt/6fPXX1/9FDZ8F8dDXtJWf+M4ACBN0QkOJzp6/937xhJxzPn7scxRCQZrALYIEEMwRdc5OqMpw9sX8mWB6mGWQ5A3JIg/wKcjayzegYZAhIHSwqUQxQkrIH+xmkcHaOEZg+V1UOpj8nxIDp8pKG//pqvtjTAchkmAG4MMgAkDqc6QDkR1CAwTQktduhaIYFJN50AFIE8iu6zehRSTAdgAwBacSmGW86gEmC/AoKMGwpESUdgPyCbAhMMid80/94943/o51XYpVHSQcwQ5AlkaMYlzwAmceSG0y3FB4AAAAASUVORK5CYII=',
    repeating_back:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAAAFzUkdCAK7OHOkAAAFFSURBVDjLY8jyP/4fhkPsZ/33MGv4X5t28j+yOD55BnTJ2d3nwXSK1x6smtHlGdAlYRhZET55BmTJ9sqt/51touBYXtz8v4q0M5hGFgepgxnCgGwySPLqpbv/L52/BcdnT139f/TQWRQMUge2sOTMfwZQgMAMAUmcO33t/+YNO3HiFUvXQ1wB1Ax2ASyQQBxkA9ZkpoPpRXo6YDqp3Q5Mz5+7/L+1USQ8NhiQQxrkV5Cz8blgYv9MsDpYVKIYoCRlD/YzSOHsHCOIk0MCwfQSPW0wXV7S8F9fzRd7OgCZDDMAFwYZAFKHNR2AwgAUysh+h4UFzCUgA0DqsKYDZAPwuQAWjVjTAcgAUFSBQhsUYCAN6BhnOkBOiaCoAvkVFGDYUiJKOgD5BdklMMmc8E3/4903/o92XolVHiUdwAxBlkSOYlzyAHzlhHG6LwSPAAAAAElFTkSuQmCC',
    repeating_side:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAAAFzUkdCAK7OHOkAAAE7SURBVDjLY8jyP/4fhkPsZ/33MGv4X5t28j+yOD55BnTJ2d3nwXSK1x6smtHlGdAlYRimSE8pHK88AzZJGJYXN/9/9tRVMI1NHqSPAZdmZ5uo/5fO3/q/ecPO/0cPnQXz0dW0l5z5zwAKEHRDQIqvXroL1gzD6IaANINdAAskmCHomptUleHs+XOXg+VhmkGWMyCHNMivMGfjwhP7Z4LVwaISxQAlKXtwoIEUHmq3A9NrMtPB9FkrMzBdXtLwX1/NF3s6gIU6PheADACpw5oOQP4DBRay389VlYPpjrUpcANA6rCmA2QD8LkAFhsY6QBmwIql68EhDgowkAZ0DDMAIx20V24FS4KwtVEk2K+gAAPRMHFwNALVoaQDkF+QXQKTzAnf9D/efeP/aOeVWOVR0gHMEGRJ5CjGJQ8AYVCLnKELfqsAAAAASUVORK5CYII=',
  };
  const out={};for(const k of Object.keys(raw))out[k]=raw[k].startsWith('data:')?raw[k]:raw[k]+'?v='+TEX_VERSION;return out;
})();
const FACING_VEC={0:[0,-1,0],1:[0,1,0],2:[0,0,-1],3:[0,0,1],4:[-1,0,0],5:[1,0,0]};
const FACE_NORMAL=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const FACE_RIGHT=[[0,0,-1],[0,0,1],[1,0,0],[1,0,0],[1,0,0],[-1,0,0]];
const FACE_UP=[[0,1,0],[0,1,0],[0,0,-1],[0,0,1],[0,1,0],[0,1,0]];

const app={
  mode:'overview',
  chains:[],
  history:[],historyIndex:-1,savedHistoryIndex:-1,
  selectedChain:-1,selectedBlock:-1,
  fileName:'structure',
  camera:null,
  theme:'dark',
  forceView:false,
  chainCamera:null,
  singleChain:false,
  originalRoot:null,
  originalSize:null,
  sourceOrigin:[0,0,0],
  parseWarnings:0,
  autosaveTimer:null,
  autosaveKey:'BlockFlow.autosave.v1',
  currentAction:'空闲',
  logs:[],
  saved:true,
};
const texCache={};let texLoaded=false,texturesAvailable=false;
const keysDown={};

function storageGet(key){try{return window.localStorage.getItem(key);}catch{return null;}}
function storageSet(key,value){try{window.localStorage.setItem(key,value);return true;}catch{return false;}}
function storageRemove(key){try{window.localStorage.removeItem(key);return true;}catch{return false;}}
function toast(msg,type,duration){
  const el=document.getElementById('toast');
  el.textContent=msg;el.className='toast on '+(type||'');
  clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('on'),duration||3000);
}
function rand6(){return String(Math.floor(Math.random()*1e6)).padStart(6,'0');}
function download(blob,name){
  const url=URL.createObjectURL(blob);const a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();
  document.body.removeChild(a);setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function dot3(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function easeInOutQuad(t){return t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2;}
function isInputFocused(){
  const el=document.activeElement;
  if(!el)return false;
  const tag=el.tagName;
  return tag==='INPUT'||tag==='TEXTAREA'||el.isContentEditable;
}

function setTheme(t){
  app.theme=t;document.documentElement.setAttribute('data-theme',t);
  storageSet('mcs-theme',t);
  if(window._sceneReady)updateSceneTheme();
}
document.getElementById('themeBtn').onclick=()=>{setCurrentAction('切换主题');setTheme(app.theme==='dark'?'light':'dark');logOk(`已切换为${app.theme==='dark'?'深色':'浅色'}模式`,'切换主题');setCurrentAction('空闲');};
(function(){
  const s=storageGet('mcs-theme');
  if(s==='dark'||s==='light')setTheme(s);
  else if(typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches)setTheme('dark');
  else setTheme('light');
})();

function extractBlockIndexLayers(node){
                                                       
                                          
                                    
  if(node?.type===TAG.INT_ARRAY&&Array.isArray(node.value))return[node.value];
  if(node?.type!==TAG.LIST||!node.value||!Array.isArray(node.value.items))return null;
  const items=node.value.items;
  if(items.length<1||items.length>2)return null;

                         
  if(node.value.elementType===TAG.INT_ARRAY&&
     items.every(item=>item?.type===TAG.INT_ARRAY&&Array.isArray(item.value))){
    return items.map(item=>item.value);
  }

                                                              
  if(node.value.elementType===TAG.LIST&&items.every(item=>
    item?.type===TAG.LIST&&item.value?.elementType===TAG.INT&&
    Array.isArray(item.value.items)&&item.value.items.every(value=>value?.type===TAG.INT)
  )){
    return items.map(item=>item.value.items.map(value=>value.value));
  }
  return null;
}

function normalizeImportedCommandText(value){
  const text=String(value??'').trimStart();
  if(!text.trim())return '';
  return text.startsWith('/')?text:'/'+text;
}
function classifyImportedCommandHead(value){
  const classifier=window.BlockFlowBrokenChainCore?.classifyChainCommand;
  return typeof classifier==='function'?classifier(value):'other';
}
function isSupportedBrokenHeadCandidate(value){
  return ['setblock','fill','clone','structure_load','testfor','execute'].includes(classifyImportedCommandHead(value));
}
function blockTypeFromName(name){
  if(name==='minecraft:command_block')return'command';
  if(name==='minecraft:repeating_command_block')return'repeating';
  if(name==='minecraft:chain_command_block')return'chain';
  if(name==='minecraft:air')return'air';
  return'other';
}
function blockKey(x,y,z){return`${x},${y},${z}`;}
function getOffsetPosition(b,facing,step=1){
  const F=FACING_VEC[facing];
  if(!F)return null;
  return{x:b.x+F[0]*step,y:b.y+F[1]*step,z:b.z+F[2]*step};
}
                                                                         
                                                                             
                                                                               
function detectSelfClosedCycles(blockMap,maxCycleSize=4){
  const cycles=[];
  const signatures=new Set();
  if(!(blockMap instanceof Map))return{cycles,keys:new Set(),oversized:[]};
  const oversized=[];
  for(const start of blockMap.values()){
    if(!start||start.type!=='chain')continue;
    const path=[];
    const position=new Map();
    let current=start;
    let guard=0;
    while(current&&current.type==='chain'&&guard++<Math.min(blockMap.size+1,10000)){
      const key=blockKey(current.x,current.y,current.z);
      if(position.has(key)){
        const keys=path.slice(position.get(key));
                                                                          
                                                                            
        const markerCycle=keys.some(cycleKey=>{
          const node=blockMap.get(cycleKey);
          return isSetblockFirstMarker(node?.cmd||'')||isSetblockSecondMarker(node?.cmd||'');
        });
        if(keys.length>=2&&keys.length<=maxCycleSize&&!markerCycle){
          const signature=[...keys].sort().join('|');
          if(!signatures.has(signature)){signatures.add(signature);cycles.push(keys);}
        }else if(keys.length>maxCycleSize&&!markerCycle){
          const signature=[...keys].sort().join('|');
          if(!signatures.has('oversized:'+signature)){signatures.add('oversized:'+signature);oversized.push(keys);}
        }
        break;
      }
      position.set(key,path.length);path.push(key);
      const p=getOffsetPosition(current,current.facing,1);
      current=p?blockMap.get(blockKey(p.x,p.y,p.z)):null;
      if(current&&current.type!=='chain')break;
    }
  }
  return{cycles,keys:new Set(cycles.flat()),oversized};
}
const BROKEN_CHAIN_SETBLOCK_1='/setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]';
const BROKEN_CHAIN_SETBLOCK_2='/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]';
function isChainPlacementSetblock(cmd){
  const s=normalizeImportedCommandText(cmd);
  return /^\/?setblock\b[\s\S]*?\bchain_command_block\b/i.test(s)||
    /^\/?execute\b[\s\S]*?\brun\s+\/?setblock\b[\s\S]*?\bchain_command_block\b/i.test(s);
}
                                                                                 
                                                                                        
function identifyBrokenHeadGeometry(root,getExact,isMarker){
  if(!root||root.blockType==='chain'||typeof getExact!=='function'||typeof isMarker!=='function')return null;
  const cmd=String(root.cmd||'').trim();
  if(classifyImportedCommandHead(cmd)==='testfor'){
    const first=getExact(root,root.facing,1);
    if(!isMarker(first))return null;
    const direction=FACING_VEC[first.facing]?first.facing:root.facing;
    const secondDirect=getExact(first,direction,1);
    if(isMarker(secondDirect))return{
      kind:'testfor-direct',direction,wrongFacingBlock:secondDirect,
      previous:first,gap:null,blocks:[first,secondDirect],skipped:null
    };
    const secondGap=getExact(first,direction,2);
    if(isMarker(secondGap))return{
      kind:'testfor-gap',direction,wrongFacingBlock:secondGap,
      previous:first,gap:secondDirect,blocks:[first,secondGap],skipped:secondDirect
    };
    return null;
  }
  if(classifyImportedCommandHead(cmd)==='execute'){
    const direction=root.facing;
    const first=getExact(root,direction,1);
    if(isMarker(first))return{
      kind:'execute-direct',direction,wrongFacingBlock:first,
      previous:root,gap:null,blocks:[first],skipped:null
    };
    const second=getExact(root,direction,2);
    if(isMarker(second))return{
      kind:'execute-gap',direction,wrongFacingBlock:second,
      previous:root,gap:first,blocks:[second],skipped:first
    };
  }
  return null;
}
function isBrokenHeadMarkerBlock(b){
  return !!b&&b.type==='chain'&&String(b.cmd||'').trim()!==''&&isChainPlacementSetblock(b.cmd||'');
}
function findBrokenChainSetblockIndexes(items){
  const list=Array.isArray(items)?items:[];
  const found=[];
  for(let i=0;i<Math.min(3,list.length);i++){
    const value=typeof list[i]==='string'?String(list[i]||'').trim():String(list[i]?.cmd||'').trim();
    if(isChainPlacementSetblock(value)){
      found.push(i);
      if(found.length===2)break;
    }
  }
  return found;
}
function isSetblockFirstMarker(cmd){return /^\/?setblock\s+~~~-1\s+chain_command_block\b/i.test(String(cmd||'').trim());}
function isSetblockSecondMarker(cmd){return /^\/?setblock\s+~~~\s+chain_command_block\b/i.test(String(cmd||'').trim())&&!/^\/?setblock\s+~~~-1\s+chain_command_block\b/i.test(String(cmd||'').trim());}
function replaceBrokenChainSetblock(cmd,replacement){
  const source=String(cmd??'').trim();
  const executeRun=source.match(/^(\/?execute\b[\s\S]*?\brun\s+)\/?setblock\b[\s\S]*$/i);
  return executeRun?executeRun[1]+replacement:replacement;
}
                                                                              
                                                                            
                                                            
function getBrokenHeadKind(items){
  if(!Array.isArray(items)||items.length<2)return null;
  const cmdAt=i=>String(typeof items[i]==='string'?items[i]:items[i]?.cmd||'').trim();
  const first=cmdAt(0);
  const indexes=findBrokenChainSetblockIndexes(items);
  if(classifyImportedCommandHead(first)==='execute'&&indexes[0]===0&&indexes[1]===1)return 'execute';
  if(classifyImportedCommandHead(first)==='testfor'&&indexes[0]===1&&indexes[1]===2)return 'testfor';
  return null;
}
function isBrokenChainPlaceholder(items){
  if(!Array.isArray(items)||items.length<3||String(typeof items[0]==='string'?items[0]:items[0]?.cmd||'').trim()!=='')return false;
  return isSetblockFirstMarker(items[1]?.cmd??items[1])&&isSetblockSecondMarker(items[2]?.cmd??items[2]);
}
function collapseExecuteBrokenPlaceholder(blocks){
                                                                            
                                                                            
                                                                          
  if(getBrokenHeadKind(blocks)!=='execute'||!Array.isArray(blocks)||blocks.length<3)return false;
  if(isSetblockFirstMarker(blocks[1]?.cmd??blocks[1])&&isSetblockSecondMarker(blocks[2]?.cmd??blocks[2])){
    blocks.splice(2,1);
    return true;
  }
  return false;
}
function normalizeBrokenChainBlocks(blocks,options={}){
  if(!Array.isArray(blocks))return false;
  const kind=getBrokenHeadKind(blocks);
  if(!kind)return false;
  const indexes=findBrokenChainSetblockIndexes(blocks);
  if(indexes.length<2)return false;
  const [firstIndex,secondIndex]=indexes;
  blocks[firstIndex].cmd=replaceBrokenChainSetblock(blocks[firstIndex].cmd,BROKEN_CHAIN_SETBLOCK_1);
  blocks[secondIndex].cmd=replaceBrokenChainSetblock(blocks[secondIndex].cmd,BROKEN_CHAIN_SETBLOCK_2);
  if(options.applyCondition!==false){
    blocks[firstIndex].cond=kind==='testfor'?1:0;
    blocks[secondIndex].cond=0;
  }
  return true;
}
function buildStructureBlockMap(X,Y,Z,blockIndices,paletteList){
  const map=new Map();
  const volume=Math.min(blockIndices.length,X*Y*Z);
  for(let lin=0;lin<volume;lin++){
    const palIdx=blockIndices[lin];
    if(palIdx===undefined||palIdx<0)continue;
    const pe=paletteList[palIdx]?.value;
    if(!pe)continue;
    const name=pe.name?.value||'';
    const type=blockTypeFromName(name);
    if(type==='air')continue;
    const x=Math.floor(lin/(Y*Z));
    const rem=lin%(Y*Z);
    const y=Math.floor(rem/Z);
    const z=rem%Z;
    const states=pe.states?.value||{};
    const facingRaw=states.facing_direction?.value;
                                                                                  
                                                                                   
                                                                                  
    map.set(blockKey(x,y,z),{
      x,y,z,type,name,blockType:type,cmd:'',
      cond:states.conditional_bit?.value?1:0,auto:1,
      facing:facingRaw===undefined?2:facingRaw,paletteIndex:palIdx
    });
  }
  return map;
}
function parseMcstructure(buf){
  if(!buf||!Number.isFinite(buf.byteLength))throw new Error('文件数据无效');
  if(buf.byteLength>MAX_IMPORT_BYTES)throw new Error(`文件超过 ${Math.round(MAX_IMPORT_BYTES/1024/1024)} MB 的导入上限`);
  const root=new Reader(buf).root();
  if(root.type!==TAG.COMPOUND)throw new Error('根标签不是 Compound');
  const rv=root.value;
  if(!rv.size)throw new Error('缺少 size');
  const si=rv.size.value.items;
  if(!Array.isArray(si)||si.length!==3)throw new Error('size 必须恰好包含三个整数');
  const X=si[0]?.value,Y=si[1]?.value,Z=si[2]?.value;
  if(!Number.isInteger(X)||!Number.isInteger(Y)||!Number.isInteger(Z)||X<=0||Y<=0||Z<=0)throw new Error(`尺寸非法: ${X}×${Y}×${Z}`);
  let origin=[0,0,0];
  if(rv.structure_world_origin){
    const oi=rv.structure_world_origin.value?.items;
    if(oi&&oi.length>=3)origin=[oi[0].value,oi[1].value,oi[2].value];
  }
  if(!rv.structure)throw new Error('缺少 structure');
  const sv=rv.structure.value;
  const blockIndicesNode=sv.block_indices;
  const blockIndexLayers=extractBlockIndexLayers(blockIndicesNode);
  if(!blockIndexLayers)throw new Error('block_indices 必须是包含一层（旧格式）或两层整数数组的列表');
  const blockIndices=blockIndexLayers[0];
  const volume=X*Y*Z;
  if(!Number.isSafeInteger(volume)||volume<=0||volume>MAX_IMPORT_VOLUME)throw new Error(`结构体积 ${X}×${Y}×${Z} 超出安全导入上限（最多 ${MAX_IMPORT_VOLUME.toLocaleString()} 个方块位置）`);
  if(blockIndices.length!==volume)throw new Error(`block_indices 主层长度 ${blockIndices.length} 与结构体积 ${volume} 不一致`);
  if(blockIndexLayers&&blockIndexLayers.length===2&&blockIndexLayers[1].length!==volume)throw new Error(`block_indices 次层长度 ${blockIndexLayers[1].length} 与结构体积 ${volume} 不一致`);
  if(!sv.palette||!sv.palette.value)throw new Error('缺少 palette');
  const pv=sv.palette.value;
  if(!pv.default||!pv.default.value)throw new Error('缺少 palette.default');
  const dv=pv.default.value;
  const paletteNode=dv.block_palette;
  const bpdNode=dv.block_position_data;
  if(!paletteNode?.value||!Array.isArray(paletteNode.value.items))throw new Error('block_palette 无效');
  if(!bpdNode?.value||typeof bpdNode.value!=='object')throw new Error('block_position_data 无效');
  const paletteList=paletteNode.value.items;
  const bpd=bpdNode.value;
  const validatePaletteIndices=(indices,label)=>{
    for(let i=0;i<indices.length;i++){
      const value=indices[i];
      if(!Number.isInteger(value)||value < -1||value>=paletteList.length)throw new Error(`block_indices ${label}第 ${i} 项的调色板索引 ${value} 无效（调色板长度 ${paletteList.length}）`);
    }
  };
  validatePaletteIndices(blockIndices,'主层');
  if(blockIndexLayers&&blockIndexLayers.length===2)validatePaletteIndices(blockIndexLayers[1],'次层');
  const blockMap=buildStructureBlockMap(X,Y,Z,blockIndices,paletteList);
  let parseWarnings=0;
  const commandTypes=new Set(['command','repeating','chain']);
                                                                                   
                                                                                    
  for(const key of Object.keys(bpd)){
    try{
      const entry=bpd[key]?.value;
      if(!entry||!entry.block_entity_data?.value)continue;
      if(!/^(0|[1-9]\d*)$/.test(key)){parseWarnings++;continue;}
      const lin=Number(key);
      if(!Number.isSafeInteger(lin)||lin<0||lin>=blockIndices.length){parseWarnings++;continue;}
      const palIdx=blockIndices[lin];
      if(palIdx===undefined||palIdx<0)continue;
      const pe=paletteList[palIdx]?.value;
      if(!pe)continue;
      const name=pe.name?.value||'';
      const blockType=blockTypeFromName(name);
                                                                                         
      if(!commandTypes.has(blockType))continue;
      const bed=entry.block_entity_data.value;
      const cmdRaw=typeof bed.Command?.value==='string'?bed.Command.value:'';
      const cmdStr=normalizeImportedCommandText(cmdRaw);
      const x=Math.floor(lin/(Y*Z)),rem=lin%(Y*Z);
      const y=Math.floor(rem/Z),z=rem%Z;
      const states=pe.states?.value||{};
      const facingRaw=states.facing_direction?.value;
      const facing=(facingRaw!==undefined)?facingRaw:2;
                                                                         
                                                                 
      const condRaw=bed.conditionalMode?.value??bed.LPCondionalMode?.value??states.conditional_bit?.value??0;
      const cond=condRaw?1:0;
      const auto=bed.auto?.value!==undefined?(bed.auto.value?1:0):1;
      const command={x,y,z,cmd:cmdStr,cond,auto,facing,blockType};
      const mapped=blockMap.get(blockKey(x,y,z));
      if(mapped){
        mapped.cmd=cmdStr;
        mapped.cond=cond;
        mapped.auto=auto;
        mapped.blockType=blockType;
        mapped.facing=facing;
      }else{
        blockMap.set(blockKey(x,y,z),{...command,type:blockType});
      }
    }catch(err){parseWarnings++;}
  }
                                                                            
                                                                                
  const commands=[...blockMap.values()]
    .filter(b=>commandTypes.has(b.type||b.blockType))
    .map(b=>({
      ...b,
      cmd:typeof b.cmd==='string'?b.cmd:'',
      cond:b.cond?1:0,
      auto:b.auto!==0?1:0,
      facing:Number.isInteger(b.facing)?b.facing:2,
      blockType:b.blockType||b.type
    }));
  return{root,X,Y,Z,origin,commands,blockMap,blockIndices,paletteList,parseWarnings};
}
function traceChain(root,context,owner){
  const {blockMap,discarded,pendingWrongBranches,blockedKeys,rootKeys}=context;
  const ordered=[];
  const orderedIndex=new Map();
  const local=new Set();
  const emptyPathByTarget=new Map();
  const rememberSkippedEmpty=(target,path)=>{
    if(!target||!Array.isArray(path)||path.length===0)return;
                                                                                
                                                                                  
    emptyPathByTarget.set(blockKey(target.x,target.y,target.z),path.slice());
  };
  const isCommandType=t=>t==='command'||t==='repeating'||t==='chain';
  const isEmptyChain=b=>b?.type==='chain'&&String(b.cmd||'').trim()==='';
  const getExact=(b,facing,step=1)=>{
    const p=getOffsetPosition(b,facing,step);
    if(!p)return null;
    return blockMap.get(blockKey(p.x,p.y,p.z))||null;
  };
  const getLogical=(b,facing,step=1)=>{
    let candidate=getExact(b,facing,step);
    const seen=new Set();
    const skippedEmpty=[];
    while(candidate){
      const k=blockKey(candidate.x,candidate.y,candidate.z);
      if(discarded?.has(k)||blockedKeys?.has(k)||owner.has(k)||rootKeys?.has(k)||seen.has(k)){
                                                                               
                                                                         
        if(skippedEmpty.length){
          const terminal=skippedEmpty[skippedEmpty.length-1];
          const terminalKey=blockKey(terminal.x,terminal.y,terminal.z);
          if(!discarded?.has(terminalKey)&&!blockedKeys?.has(terminalKey)&&!owner.has(terminalKey)&&!rootKeys?.has(terminalKey)){
            if(skippedEmpty.length>1)rememberSkippedEmpty(terminal,skippedEmpty.slice(0,-1));
            return terminal;
          }
        }
        return null;
      }
      if(!isEmptyChain(candidate)){
        if(skippedEmpty.length)rememberSkippedEmpty(candidate,skippedEmpty);
        return candidate;
      }
      seen.add(k);
      skippedEmpty.push(candidate);
      candidate=getExact(candidate,candidate.facing,1);
    }
                                                                                
                                                                                  
    if(skippedEmpty.length){
      const terminal=skippedEmpty[skippedEmpty.length-1];
      if(skippedEmpty.length>1)rememberSkippedEmpty(terminal,skippedEmpty.slice(0,-1));
      return terminal;
    }
    return null;
  };
  const claim=(b,includeEmpty=false)=>{
    if(!b||b.type==='air'||(isEmptyChain(b)&&!includeEmpty))return false;
    const k=blockKey(b.x,b.y,b.z);
    if(local.has(k)||blockedKeys?.has(k)||owner.has(k)||discarded?.has(k))return false;
    owner.set(k,root);
    local.add(k);
    const copy={...b,cmd:String(b.cmd||'')};
    ordered.push(copy);
    orderedIndex.set(k,copy);
    return true;
  };
                                                                              
                                                                              
  const claimLogical=b=>{
    if(!b)return false;
    const k=blockKey(b.x,b.y,b.z);
    for(const empty of emptyPathByTarget.get(k)||[]){
      const ek=blockKey(empty.x,empty.y,empty.z);
      if(local.has(ek)||owner.has(ek)||discarded?.has(ek)||blockedKeys?.has(ek))continue;
      claim(empty,true);
    }
    return claim(b,isEmptyChain(b));
  };
  const discardWrongBranch=start=>{
    if(!start)return 0;
    let current=start,count=0;
    const seen=new Set();
    const keys=[];
    while(current&&isCommandType(current.type)){
      const k=blockKey(current.x,current.y,current.z);
      if(seen.has(k)||owner.has(k)||discarded?.has(k)||rootKeys?.has(k))break;
      seen.add(k);
      keys.push(k);
      count++;
      current=getExact(current,current.facing,1);
    }
    if(keys.length)pendingWrongBranches.push({start,keys});
    return count;
  };
  const isBrokenExecuteRoot=b=>/^\/execute\b[\s\S]*?\brun\s+\/setblock\b/i.test(String(b?.cmd||'').trim());
  const isTestforRoot=b=>/^\/testfor\b/i.test(String(b?.cmd||'').trim());
  const blockWrongBranchExact=(start,protectedKeys=new Set())=>{
    if(!start)return;
    let current=start;const seen=new Set();const keys=[];
    while(current&&isCommandType(current.type)){
      const k=blockKey(current.x,current.y,current.z);
                                                                              
                                                                         
                                                                   
      if(protectedKeys.has(k)||seen.has(k)||local.has(k)||owner.has(k)||discarded?.has(k)||rootKeys?.has(k))break;
      seen.add(k);keys.push(k);
      const next=getExact(current,current.facing,1);
      const nextKey=next?blockKey(next.x,next.y,next.z):null;
      if(nextKey&&protectedKeys.has(nextKey))break;
      current=next;
    }
    if(blockedKeys)for(const k of keys)blockedKeys.add(k);
    if(keys.length)pendingWrongBranches?.push({start,keys});
  };
  const matchBrokenHeadExact=()=>{
    const pattern=identifyBrokenHeadGeometry(root,getExact,isBrokenHeadMarkerBlock);
    if(!pattern)return null;
    if(pattern.kind==='testfor-gap'||pattern.kind==='execute-gap'){
      const skipped=pattern.skipped;
      const wrong=pattern.wrongFacingBlock;
      const skippedKey=skipped?blockKey(skipped.x,skipped.y,skipped.z):null;
      const pointsBackToSkipped=!!skipped&&isCommandType(skipped.type)&&(()=>{
        const p=getOffsetPosition(wrong,wrong.facing,1);
        return !!p&&blockKey(p.x,p.y,p.z)===skippedKey;
      })();
      if(skipped&&isCommandType(skipped.type)&&!pointsBackToSkipped){
        const protectedKeys=pattern.kind==='testfor-gap'
          ?new Set([
            blockKey(root.x,root.y,root.z),
            blockKey(pattern.blocks[0].x,pattern.blocks[0].y,pattern.blocks[0].z),
            blockKey(wrong.x,wrong.y,wrong.z)
          ])
          :new Set([blockKey(root.x,root.y,root.z),blockKey(wrong.x,wrong.y,wrong.z)]);
                                                                                  
                                                                               
                                                                               
                                      
        blockWrongBranchExact(skipped,protectedKeys);
      }
    }
    return pattern;
  };
  const brokenHead=matchBrokenHeadExact();
                                                                            
                                                                           
                                                                 
  if(!brokenHead&&isSupportedBrokenHeadCandidate(root.cmd)){
    const shared=window.BlockFlowBrokenChainCore;
    if(shared?.identifyCommandChain){
      const adapted=context._sharedChainRecords||(context._sharedChainRecords=new Map());
      const coreRecord=b=>{
        const k=blockKey(b.x,b.y,b.z);
        if(adapted.has(k))return adapted.get(k);
        const rec={...b,layer:0,name:b.name||'',command:isCommandType(b.type),conditional:!!b.cond};
        adapted.set(k,rec);return rec;
      };
                                                                               
                                                                        
      for(const b of blockMap.values())coreRecord(b);
      const rootKey=blockKey(root.x,root.y,root.z);
      const coreRoot=adapted.get(rootKey);
      const getCoreAt=(x,y,z,layer=0)=>{
        if(layer!==0)return null;
        const k=blockKey(x,y,z);
        if(discarded?.has(k)||blockedKeys?.has(k))return null;
        const owned=owner.get(k);
        if(owned&&owned!==root)return null;
        return adapted.get(k)||null;
      };
      const result=coreRoot?shared.identifyCommandChain(coreRoot,getCoreAt):null;
      const sourceKey=result?.source?blockKey(result.source.x,result.source.y,result.source.z):'';
      if(result?.ok&&sourceKey===rootKey&&Array.isArray(result.chain)&&result.chain.length>1){
                                                                                
                                                                                  
                                                               
        const hasBrokenGeometry=result.chain.some(item=>item.status==='broken-facing-continuation')||
          (result.boundaries||[]).some(item=>item.type==='wrong-facing-target-ignored'||item.type==='wrong-facing-empty-target');
        if(hasBrokenGeometry){
          for(const item of result.chain){
            const b=item?.block;if(!b)continue;
            const original=blockMap.get(blockKey(b.x,b.y,b.z));
            if(!original)break;
            if(!claim(original,isEmptyChain(original)))break;
            ordered[ordered.length-1].traceStatus=item.status||'normal';
          }
          if(ordered.length>1){
            ordered._coreBrokenDetected=true;
            ordered._coreSourceKind=result.sourceKind||classifyImportedCommandHead(root.cmd);
            ordered._coreStopReason=result.stopReason||'end';
            ordered._coreBoundaries=result.boundaries||[];
            return ordered;
          }
        }
      }
    }
  }
  const fallbackHead=!brokenHead&&( /^\/testfor\b/i.test(String(root.cmd||'').trim())||/^\/execute\b[\s\S]*?\brun\s+\/?setblock\b/i.test(String(root.cmd||'').trim())||isChainPlacementSetblock(root.cmd||'') );
  if(brokenHead){
    if(!claim(root))return[];
    for(const b of brokenHead.blocks)claim(b);
    const headTail=ordered[ordered.length-1]||root;
    const firstAfterHead=getLogical(headTail,brokenHead.direction,1);
    let current=firstAfterHead;
    if(current&&!claimLogical(current))current=null;
    let guard=0;
    while(current&&guard++<10000){
      const next=getLogical(current,current.facing,1);
      if(!next||next.type!=='chain')break;
      const nk=blockKey(next.x,next.y,next.z);
      if(owner.has(nk)||discarded?.has(nk)||blockedKeys?.has(nk)||!claimLogical(next))break;
      current=next;
    }
    ordered._brokenMatched=true;
    ordered._brokenMatch=brokenHead.kind;
    return ordered;
  }

  if(fallbackHead){
    if(!claim(root))return[];
    let current=ordered[0];let guard=0;
    while(current&&guard++<10000){
      const next=getLogical(current,current.facing,1);
      if(!next||next.type!=='chain')break;
      const nk=blockKey(next.x,next.y,next.z);
      if(owner.has(nk)||discarded?.has(nk)||blockedKeys?.has(nk)||!claimLogical(next))break;
      current=next;
    }
    ordered._brokenCandidate=true;
    ordered._fallbackGroup=true;
    return ordered;
  }

  if(!claim(root))return[];
  let mainIndex=0;
  let current=ordered[0];

  const directRootNext=getLogical(root,root.facing,1);
  if(!directRootNext){
    for(const facing of Object.keys(FACING_VEC).map(Number)){
      const candidate=getLogical(root,facing,1);
      if(!candidate||candidate.type!=='chain'||!isSetblockFirstMarker(candidate.cmd))continue;
      const candidateNext=getLogical(candidate,candidate.facing,1);
      if(candidateNext&&candidateNext.type==='chain'&&isSetblockSecondMarker(candidateNext.cmd)){
        const ck=blockKey(candidate.x,candidate.y,candidate.z);
        if(!owner.has(ck)&&!discarded?.has(ck)){
          claimLogical(candidate);
          current=ordered[ordered.length-1]||current;
          mainIndex=1;
        }
        break;
      }
    }
  }

  const mainSeen=new Set();
  while(true){
    const currentKey=blockKey(current.x,current.y,current.z);
    if(mainSeen.has(currentKey))break;
    mainSeen.add(currentKey);

    const special=(mainIndex===0||mainIndex===1)&&isChainPlacementSetblock(current.cmd);
    if(special){
      const skipped=getExact(current,current.facing,1);
      if(skipped){
        if(skipped.type==='chain'&&String(skipped.cmd||'').trim()!==''&&(isSetblockFirstMarker(skipped.cmd)||isSetblockSecondMarker(skipped.cmd))){
          if(!local.has(blockKey(skipped.x,skipped.y,skipped.z))&&!owner.has(blockKey(skipped.x,skipped.y,skipped.z)))claim(skipped);
          const branch=getLogical(skipped,skipped.facing,1);
          if(branch&&isCommandType(branch.type)&&!local.has(blockKey(branch.x,branch.y,branch.z)))discardWrongBranch(branch);
        }else if(!isEmptyChain(skipped)&&isCommandType(skipped.type)){
          const branch=getLogical(skipped,skipped.facing,1);
          if(branch&&isCommandType(branch.type))discardWrongBranch(skipped);
        }
      }
      const next=getLogical(current,current.facing,2);
      if(next&&next.type==='chain'){
        if(owner.has(blockKey(next.x,next.y,next.z))||discarded?.has(blockKey(next.x,next.y,next.z)))break;
        if(!claim(next))break;
        current=ordered[ordered.length-1]||next;
        mainIndex++;
        continue;
      }
      break;
    }

    const next=getLogical(current,current.facing,1);
    if(!next||next.type!=='chain')break;
    const nk=blockKey(next.x,next.y,next.z);
    if(owner.has(nk)||discarded?.has(nk))break;
    if(!claimLogical(next))break;
    current=orderedIndex.get(nk)||next;
    mainIndex++;
  }
  return ordered;
}
function chainSort(a,b){
  return(b.x-a.x)||(a.y-b.y)||(a.z-b.z);
}
function detectChainType(ordered){
  if(!ordered||ordered.length===0)return'impulse';
  if(getBrokenHeadKind(ordered)||isBrokenChainPlaceholder(ordered))return'snake';
  if(ordered[0].blockType==='repeating')return'repeat';
  return'impulse';
}
function relayoutBlocks(ordered,chainType,xCol){
  if(!ordered||ordered.length===0)return[];
  const headKind=chainType==='snake'?(getBrokenHeadKind(ordered)||(ordered?._coreSourceKind==='execute'?'execute':ordered?._coreSourceKind==='testfor'?'testfor':null)):null;
  const placeholder=chainType==='snake'&&!headKind&&isBrokenChainPlaceholder(ordered);
                                                                            
                                                                             
                                                                            
  const firstCapacity=STD_Z;
  const otherCapacity=chainType==='snake'
    ?(headKind==='execute'?30:29)
    :31;
  const firstBlockType=chainType==='impulse'?'command':chainType==='repeat'?'repeating':(ordered[0].blockType==='command'||ordered[0].blockType==='repeating'?ordered[0].blockType:'repeating');
  const positions=new Array(ordered.length);
  const firstRowEndZ=STD_Z-firstCapacity;
  const snakeRowStartZ=firstRowEndZ;
  const snakeRowEndZ=snakeRowStartZ+otherCapacity-1;
  for(let i=0;i<ordered.length;i++){
    let y,z;
    if(i<firstCapacity){
      y=0;z=STD_Z-1-i;
    }else{
      const idx=i-firstCapacity;
      const layerIdx=Math.floor(idx/otherCapacity);
      const posInLayer=idx%otherCapacity;
      y=1+layerIdx;
      if(chainType==='snake')z=layerIdx%2===0?snakeRowStartZ+posInLayer:snakeRowEndZ-posInLayer;
      else z=layerIdx%2===0?posInLayer:otherCapacity-1-posInLayer;
    }
    positions[i]={y,z};
  }
  const blocks=[];
  for(let i=0;i<ordered.length;i++){
    const pos=positions[i];
    const np=positions[i+1];
    let facing;
    if(np){
      const dx=np.z-pos.z,dy=np.y-pos.y;
      if(dx===0&&dy>0)facing=1;
      else if(dx<0)facing=2;
      else if(dx>0)facing=3;
      else facing=dy<0?0:2;
    }else if(i<firstCapacity){
      facing=2;
    }else{
      const idx=i-firstCapacity;
      const layerIdx=Math.floor(idx/otherCapacity);
      facing=layerIdx%2===0?3:2;
    }
    const src=ordered[i];
    blocks.push({x:xCol,y:pos.y,z:pos.z,facing,blockType:i===0?firstBlockType:'chain',cmd:String(src.cmd||''),cond:src.cond?1:0,auto:src.auto!==0?1:0,marked:!!src.marked,note:src.note||''});
  }
                                                                             
                                                                              
                                                                                 
  if(chainType==='snake'&&(headKind||placeholder)){
    const markerIndexes=findBrokenChainSetblockIndexes(ordered);
    const wrongFacingIndex=markerIndexes[1];
    if(Number.isInteger(wrongFacingIndex)&&blocks[wrongFacingIndex])blocks[wrongFacingIndex].facing=1;
  }
  return blocks;
}
function processCommands(commands,context={}){
  if(!commands||commands.length===0)return[];
  const blockMap=context.blockMap instanceof Map
    ?context.blockMap
    :new Map(commands.map(b=>[blockKey(b.x,b.y,b.z),{...b,type:b.blockType}]));
  const selfClosedDetection=detectSelfClosedCycles(blockMap,4);
  const selfClosedCycleKeys=selfClosedDetection.keys;
  const discarded=new Set();
  const graphContext={...context,blockMap,discarded,selfClosedCycleKeys};
  const roots=[...commands];
  const owner=new Map();
  const rootKeys=new Set(roots.filter(b=>b.blockType==='command'||b.blockType==='repeating').map(b=>blockKey(b.x,b.y,b.z)));
  const pendingWrongBranches=[];
  graphContext.pendingWrongBranches=pendingWrongBranches;
  graphContext.rootKeys=rootKeys;
  const pendingWrongKeys=new Set();
  const blockedKeys=new Set();
  const getExactFromMap=(b,facing,step=1)=>{
    const p=getOffsetPosition(b,facing,step);
    return p?(blockMap.get(blockKey(p.x,p.y,p.z))||null):null;
  };
  const isCommandBlockRecord=b=>!!b&&(b.type==='command'||b.type==='repeating'||b.type==='chain');
                                                                         
                                                                             
                                                                         
                                                                          
                                        
  const inspectBrokenHead=(root)=>identifyBrokenHeadGeometry(root,getExactFromMap,isBrokenHeadMarkerBlock);
                                                                         
                                                                       
  const rootReachesSelfClosedCycle=root=>{
    let current=root;const seen=new Set();
    for(let i=0;i<blockMap.size&&i<10000;i++){
      const p=getOffsetPosition(current,current.facing,1);if(!p)return false;
      const next=blockMap.get(blockKey(p.x,p.y,p.z));if(!next||next.type!=='chain')return false;
      const k=blockKey(next.x,next.y,next.z);
      if(selfClosedCycleKeys.has(k))return true;
      if(seen.has(k))return false;seen.add(k);current=next;
    }
    return false;
  };
                                                                               
                                                                              
  const rootMeta=new Map();
  for(const root of roots){
    const brokenPattern=inspectBrokenHead(root);
    const traceableRoot=root.blockType!=='chain';
    rootMeta.set(root,{
      brokenPattern,
      broken:brokenPattern?0:1,
      reachesCycle:traceableRoot&&rootReachesSelfClosedCycle(root)?0:1,
      rootType:(root.blockType==='command'||root.blockType==='repeating')?0:1,
      commandHead:isSupportedBrokenHeadCandidate(root.cmd)?0:1
    });
  }
  roots.sort((a,b)=>{
    const ma=rootMeta.get(a),mb=rootMeta.get(b);
    return (ma.broken-mb.broken)||(ma.reachesCycle-mb.reachesCycle)||
      (ma.rootType-mb.rootType)||(ma.commandHead-mb.commandHead)||chainSort(a,b);
  });
  for(const root of roots){
    const pattern=rootMeta.get(root)?.brokenPattern||null;
    if(!pattern)continue;
    const source=pattern.wrongFacingBlock;
                                                                               
                                                                    
    if(!source||source.facing===pattern.direction)continue;
    const target=getExactFromMap(source,source.facing,1);
    if(!isCommandBlockRecord(target))continue;
    const previousKeys=new Set([
      blockKey(pattern.previous.x,pattern.previous.y,pattern.previous.z),
      pattern.gap&&isCommandBlockRecord(pattern.gap)?blockKey(pattern.gap.x,pattern.gap.y,pattern.gap.z):null
    ].filter(Boolean));
    if(previousKeys.has(blockKey(target.x,target.y,target.z)))continue;
                                                                          
                                                                                  
    blockedKeys.add(blockKey(target.x,target.y,target.z));
  }
  graphContext.blockedKeys=blockedKeys;
  const chains=[];
  for(const root of roots){
    if(root.blockType==='chain')continue;
    const k=blockKey(root.x,root.y,root.z);
    if(owner.has(k)||discarded.has(k)||blockedKeys.has(k))continue;
    const branchStart=pendingWrongBranches.length;
    const ordered=traceChain(root,graphContext,owner);
    for(const branch of pendingWrongBranches.slice(branchStart))for(const key of branch.keys)if(!rootKeys.has(key))pendingWrongKeys.add(key);
    if(!ordered.length)continue;
    let type=detectChainType(ordered);
    const rootCmd=String(root.cmd||'').trim();
    const rootCommandKind=classifyImportedCommandHead(rootCmd);
    const rootLooksBroken=rootCommandKind==='testfor'||rootCommandKind==='execute';
    const coreBrokenDetected=!!ordered._coreBrokenDetected;
    const brokenIndexes=findBrokenChainSetblockIndexes(ordered);
    const canonicalPair=brokenIndexes.length>=2&&isSetblockFirstMarker(ordered[brokenIndexes[0]]?.cmd||'')&&isSetblockSecondMarker(ordered[brokenIndexes[1]]?.cmd||'');
    const brokenHeadKind=getBrokenHeadKind(ordered);
    const matchedBroken=!!ordered._brokenMatched;
                                                                             
                                                                     
    if(!matchedBroken&&!canonicalPair&&!brokenHeadKind&&!coreBrokenDetected&&(rootLooksBroken||brokenIndexes.length>0))type='repeat';
    if(matchedBroken||brokenHeadKind||coreBrokenDetected)type='snake';
    if(type==='snake')normalizeBrokenChainBlocks(ordered);
    const orderedKeys=new Set(ordered.map(b=>blockKey(b.x,b.y,b.z)));
    const closedCycles=selfClosedDetection.cycles.filter(cycle=>cycle.every(key=>orderedKeys.has(key)));
    const selfClosed=closedCycles.length>0;
    const selfClosedKeys=new Set(closedCycles.flat());
    if(selfClosed){
      for(const b of ordered)b.selfClosedCycle=selfClosedKeys.has(blockKey(b.x,b.y,b.z));
    }
    if(selfClosedDetection.oversized.some(cycle=>cycle.some(key=>orderedKeys.has(key)))){
      logWarn('检测到超过 4 个方块的闭环；该结构不属于受支持的自闭链，布局可能无法保持原样','读取命令链');
    }
    chains.push({type,blocks:ordered,rootKey:k,selfClosed,selfClosedCycleKeys:[...selfClosedKeys]});
  }
  const finalizedWrong=new Set();
  for(const branch of pendingWrongBranches){
    let count=0;
    for(const key of branch.keys){
      if(owner.has(key)||rootKeys.has(key)||finalizedWrong.has(key))continue;
      discarded.add(key);
      finalizedWrong.add(key);
      count++;
    }
    if(count){
      const first=branch.keys.find(key=>!owner.has(key))||branch.keys[0];
      logWarn(`检测到错误朝向的命令链分支，已删除错误分支中 ${first} 起仍未归属正常链的 ${count} 个命令方块`,'读取命令链');
      toast(`已删除错误朝向分支 ${count} 个命令方块（详见日志）`,'warn',6000);
    }
  }
                                                                           
                                                                                 
                                                                                
                                                                     
  const filtered=chains;
  const represented=new Set(filtered.flatMap(c=>(c.blocks||[]).map(b=>blockKey(b.x,b.y,b.z))));
                                                                                 
                                                                           
  for(const cycle of selfClosedDetection.cycles){
    if(cycle.some(k=>represented.has(k)||blockedKeys.has(k)||discarded.has(k)||pendingWrongKeys.has(k)))continue;
    const cycleBlocks=cycle.map(k=>blockMap.get(k)).filter(Boolean).map(b=>({
      ...b,cmd:String(b.cmd??''),blockType:b.blockType||b.type,selfClosedCycle:true
    }));
    if(cycleBlocks.length!==cycle.length)continue;
    filtered.push({type:'repeat',selfClosed:true,selfClosedCycleKeys:cycle.slice(),preservePhysicalType:true,blocks:cycleBlocks});
    for(const k of cycle)represented.add(k);
  }
                                                                                 
                                                                                    
                                                                     
  for(const b of blockMap.values()){
    if(b?.type!=='chain'||String(b.cmd??'').trim()!=='')continue;
    const k=blockKey(b.x,b.y,b.z);
    if(represented.has(k)||blockedKeys.has(k)||discarded.has(k)||pendingWrongKeys.has(k))continue;
    filtered.push({type:'repeat',preservePhysicalType:true,blocks:[{...b,cmd:'',blockType:'chain',facing:Number.isInteger(b.facing)?b.facing:2}]});
    represented.add(k);
  }
  filtered.sort((a,b)=>chainSort(a.blocks[0],b.blocks[0]));
  for(const c of filtered)delete c.rootKey;
  return filtered;
}
function reflowAllChains(){
  reflowChainsForSize(app.chains);
}

function cloneNBT(node){
  if(node==null)return node;
  if(Array.isArray(node))return node.map(cloneNBT);
  if(typeof node!=='object')return node;
  if(node instanceof Uint8Array)return node.slice();
  const out={};
  for(const k of Object.keys(node))out[k]=cloneNBT(node[k]);
  return out;
}
function buildBed(cmd,cond,wx,wy,wz,auto=1){
  const autoValue=auto===0?0:1;
  return T.comp({BlockEntityVersion:T.int(0),Command:T.str(cmd),CustomName:T.str(''),
    ExecuteOnFirstTick:T.byte(0),LPCommandMode:T.int(2),LPCondionalMode:T.byte(cond),
    LPRedstoneMode:T.byte(0),LastExecution:T.long(0n),LastOutput:T.str(''),
    LastOutputParams:T.list(TAG.STRING,[]),SuccessCount:T.int(0),TickDelay:T.int(0),
    TrackOutput:T.byte(1),Version:T.int(50),auto:T.byte(autoValue),conditionMet:T.byte(0),
    conditionalMode:T.byte(cond),id:T.str('CommandBlock'),powered:T.byte(0),
    x:T.int(wx),y:T.int(wy),z:T.int(wz)});
}
function buildOutput(){
  const layout=buildExportLayout(app.chains);
  const allBlocks=layout.blocks;
  if(allBlocks.length===0)throw new Error('没有命令方块');
                                                                             
                                                                          
  const minX=allBlocks.reduce((min,b)=>Math.min(min,b.x),Infinity);
  const spanX=layout.spanX;
  const maxY=layout.sizeY;
  const maxZ=layout.sizeZ;
  const mk=(name,cond,facing)=>T.comp({name:T.str(name),
    states:T.comp({conditional_bit:T.byte(cond),facing_direction:T.int(facing)}),
    version:T.int(18168865)});
  const palette=[];
                                                                 
                                                                              
  for(const nm of ['minecraft:command_block','minecraft:chain_command_block','minecraft:repeating_command_block'])
    for(let c=0;c<=1;c++)for(let f=0;f<=5;f++)palette.push(mk(nm,c,f));
  const airIndex=palette.length;
  palette.push(T.comp({name:T.str('minecraft:air'),states:T.comp({}),version:T.int(18168865)}));
  const volume=spanX*maxY*maxZ;
  const mainIndices=new Array(volume).fill(airIndex);
                                                                                    
                                                                                
  const secondaryIndices=new Array(volume).fill(-1);
  const bpd={};
  const offsets={command:0,chain:12,repeating:24};
  for(const b of allBlocks){
    const lx=b.x-minX;
    const lin=lx*(maxY*maxZ)+b.y*maxZ+b.z;
    if(!Number.isInteger(lin)||lin<0||lin>=volume)throw new Error(`命令方块坐标越界：${b.x}, ${b.y}, ${b.z}`);
    const cond=b.cond?1:0;
    const facing=Number(b.facing);
    const offset=offsets[b.blockType];
    const paletteIndex=Number.isInteger(offset)&&Number.isInteger(facing)&&facing>=0&&facing<=5?offset+cond*6+facing:-1;
    if(paletteIndex<0||paletteIndex>=airIndex)throw new Error(`无法导出命令方块类型或朝向：${b.blockType}/${b.facing}`);
    mainIndices[lin]=paletteIndex;
    bpd[String(lin)]=T.comp({block_entity_data:buildBed(b.cmd,cond,lx,b.y,b.z,b.auto)});
  }
  const base=app.originalRoot?cloneNBT(app.originalRoot):T.comp({});
  const rootValue=base.value||{};
                                                                      
                                                                          
                                                             
  rootValue.format_version=T.int(2);
  rootValue.size=T.list(TAG.INT,[T.int(spanX),T.int(maxY),T.int(maxZ)]);
  const originalStructure=rootValue.structure?.value?cloneNBT(rootValue.structure.value):{};
  originalStructure.block_indices=T.list(TAG.INT_ARRAY,[T.ia(mainIndices),T.ia(secondaryIndices)]);
                                                                                   
                                                                                 
  originalStructure.entities=T.list(TAG.COMPOUND,[]);
  originalStructure.palette=T.comp({default:T.comp({block_palette:T.list(TAG.COMPOUND,palette),block_position_data:T.comp(bpd)})});
  rootValue.structure=T.comp(originalStructure);
  const origin=Array.isArray(app.sourceOrigin)&&app.sourceOrigin.length>=3?app.sourceOrigin:[0,0,0];
  rootValue.structure_world_origin=T.list(TAG.INT,[T.int(origin[0]||0),T.int(origin[1]||0),T.int(origin[2]||0)]);
  return T.comp(rootValue);
}

let three=null;
let scene,camera,renderer,controls,raycaster;
let blockGroup=null;
let selectionHelper=null,selectionGlow=null;
let selectionPulseTime=0;
let lastSelectionPulseMark=0;
let previewReady=false;
let currentBounds=null;
let cameraAnim=null;
                                                                           
let renderDirty=true;
function markRenderDirty(){renderDirty=true;}

let sharedBlockGeo=null;
let sharedEdgeGeo=null;
let sharedEdgeMat=null;
const matArrayCache=new Map();
const solidMaterialCache=new Map();
const solidMaterialPool=new Set();
                                                                               
                                                
let pickMeshes=[];
const pickIndexMap=new Map();
let blockBatchMeta=[];
let edgeLineSegments=null;
let edgeLineGeometry=null;
let edgePositionsByChain=[];
let visibleBlockChain=-1;

async function ensureThree(){
  if(three)return three;
  const localThree=window.BlockFlowThree;
  if(!localThree||!localThree.THREE||!localThree.OrbitControls){
    throw new Error('Three.js 引擎未加载。请检查根目录 assets/vendor/three-runtime.js 是否存在并可访问。');
  }
  three={THREE:localThree.THREE,OrbitControls:localThree.OrbitControls};
  window._sceneReady=true;
  return three;
}
async function preloadTextures(){
  if(texLoaded)return;
  const {THREE}=three;
  const loader=new THREE.TextureLoader();
  const load=(url)=>new Promise(r=>loader.load(url,t=>{
    t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter;
    t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;r(t);
  },undefined,()=>r(null)));
  const entries=Object.entries(TEX_FILES);
  const results=await Promise.all(entries.map(([,u])=>load(u)));
  let ok=0;
  entries.forEach(([k],i)=>{
    if(results[i]){texCache[k]=results[i];ok++;}
  });
  texLoaded=true;texturesAvailable=ok>0;
}
function updateSceneTheme(){
  if(!scene)return;
  const {THREE}=three;
  const dark=app.theme==='dark';
  scene.background=new THREE.Color(dark?0x141a24:0xdce4ee);
  markRenderDirty();
}
function initScene(){
  const wrap=document.getElementById('canvasWrap');
  const w=wrap.clientWidth,h=wrap.clientHeight;
  const {THREE,OrbitControls}=three;
  scene=new THREE.Scene();updateSceneTheme();
  camera=new THREE.PerspectiveCamera(45,w/h,0.1,5000);

  const mainCanvas=document.createElement('canvas');
  mainCanvas.className='main-canvas';
  wrap.appendChild(mainCanvas);
  renderer=new THREE.WebGLRenderer({canvas:mainCanvas,antialias:true,preserveDrawingBuffer:false,powerPreference:'high-performance'});
                                                                        
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  renderer.setSize(w,h);
  renderer.shadowMap.enabled=false;

  document.getElementById('loading').classList.add('hide');

  const hemi=new THREE.HemisphereLight(0xcfe3ff,0x6b7280,0.9);
  scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xffffff,1.4);
  sun.position.set(80,150,60);scene.add(sun);
  const fill=new THREE.DirectionalLight(0xdde6ff,0.45);
  fill.position.set(-60,80,-80);scene.add(fill);
  const amb=new THREE.AmbientLight(0xffffff,0.25);
  scene.add(amb);

  controls=new OrbitControls(camera,mainCanvas);
  controls.touches.ONE=THREE.TOUCH.ROTATE;controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
  controls.enableDamping=true;controls.dampingFactor=0.08;
  controls.screenSpacePanning=true;
  controls.enablePan=true;
  controls.rotateSpeed=0.5;
  controls.minDistance=1;controls.maxDistance=5000;
  controls.mouseButtons={
    LEFT:THREE.MOUSE.ROTATE,
    MIDDLE:THREE.MOUSE.DOLLY,
    RIGHT:-1,
  };
  controls.addEventListener('change',()=>{saveCamera();markRenderDirty();});

  mainCanvas.addEventListener('contextmenu',e=>e.preventDefault());
  mainCanvas.addEventListener('auxclick',e=>{if(e.button===2)e.preventDefault();});

  raycaster=new THREE.Raycaster();
  setupPicking();
  setupWheelNavigation();
  setupKeyboardMovement();
  setupMobileCameraPad();
  setupChainBar();

  let lastTime=performance.now();
  (function anim(now){
    requestAnimationFrame(anim);
    const dt=Math.min(0.1,(now-lastTime)/1000);
    lastTime=now;
    updateCameraAnim(now);
    updateSelectionPulse(dt);
    updateKeyboardMovement(dt);
    controls.update();
    renderFrames();
  })(lastTime);
  previewReady=true;
}

function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function updateChainBar(){
  const bar=document.getElementById('chainBar');
  if(!bar)return;
  const inChain=app.mode==='chain';
  bar.classList.toggle('chain-view',inChain);
  const help=document.getElementById('viewportHelp');
  if(help){
    help.innerHTML=inChain
      ? '<b>WASD</b> 移动<br><b>空格/Shift</b> 升降<br><b>左键</b> 旋转视角<br><b>Ctrl+鼠标滚轮</b> 缩放'
      : '<b>WASD</b> 移动<br><b>空格/Shift</b> 升降<br><b>左键</b> 旋转视角<br><b>鼠标滚轮</b> 缩放';
  }
    const commandBar=document.querySelector('.command-bar');
  if(commandBar)commandBar.classList.toggle('chain-mode',inChain);
  const exitBtn=document.getElementById('exitChainBtn');
  if(exitBtn)exitBtn.style.display=(inChain&&!app.singleChain)?'flex':'none';
  const manager=document.getElementById('chainManager');
  if(inChain&&manager)manager.classList.remove('on');
}
function setupChainBar(){
  document.getElementById('chainManage').onclick=()=>{if(app.mode==='overview')toggleChainManager(true);};
  document.getElementById('chainTextModeBtn').onclick=()=>{if(app.mode==='chain'&&app.selectedChain>=0)openTextEditorForChain(app.selectedChain);};
  document.getElementById('chainDeleteBtn').onclick=()=>{if(app.mode==='chain'&&app.selectedChain>=0&&app.selectedChain<app.chains.length)deleteChainAt(app.selectedChain);};
  document.getElementById('chainManagerClose').onclick=()=>toggleChainManager(false);
  document.getElementById('chainAddBtn').onclick=openChainAddModal;
  document.getElementById('chainAddClose').onclick=closeChainAddModal;
  document.getElementById('chainAddModal').addEventListener('click',e=>{if(e.target.id==='chainAddModal')closeChainAddModal();});
  document.querySelectorAll('[data-add-chain-type]').forEach(btn=>btn.addEventListener('click',()=>addChainOfType(btn.dataset.addChainType)));
  const mcstructureInput=document.getElementById('importMcstructureInput');
  const txtInput=document.getElementById('importTxtInput');
  document.getElementById('importMcstructureBtn').onclick=()=>mcstructureInput?.click();
  document.getElementById('importTxtBtn').onclick=()=>txtInput?.click();
  mcstructureInput?.addEventListener('change',async()=>{
    const file=mcstructureInput.files?.[0];
    mcstructureInput.value='';
    if(!file)return;
    try{await importChainFromMcstructure(file);}
    catch(e){toast('导入失败：'+e.message,'err');}
  });
  txtInput?.addEventListener('change',async()=>{
    const file=txtInput.files?.[0];
    txtInput.value='';
    if(!file)return;
    try{await importChainFromTxt(file);}
    catch(e){toast('导入失败：'+e.message,'err');}
  });

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

function toggleChainManager(show){
  const panel=document.getElementById('chainManager');
  if(!panel)return;
  panel.classList.toggle('on',!!show);
  if(show)renderChainManager();
}
function openChainAddModal(){
  const m=document.getElementById('chainAddModal');if(m){rememberModalFocus('chainAddModal');m.classList.add('on');m.setAttribute('aria-hidden','false');setTimeout(()=>m.querySelector('.chain-import-btn')?.focus(),0);}
}
function closeChainAddModal(){
  const m=document.getElementById('chainAddModal');if(m){m.classList.remove('on');m.setAttribute('aria-hidden','true');restoreModalFocus('chainAddModal');}
}
function normalizeImportedCommands(text){
  const source=String(text??'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
                                                                           
                                                                           
                                                                               
  if(source.length===0)return[];
  const normalized=source.endsWith('\n')?source.slice(0,-1):source;
  if(normalized.length===0)return[];
  return normalized.split('\n').map(line=>normalizeImportedCommandText(line));
}
function classifyTxtChain(commands){
  return (getBrokenHeadKind(commands)||isBrokenChainPlaceholder(commands))?'snake':'repeat';
}
function serializeTextEditorBlocks(blocks){
                                                                                    
                                                                             
  return (Array.isArray(blocks)?blocks:[]).map(b=>String(b?.cmd??'').trim()).join('\n');
}
function cloneChainForTextEditor(chain){
  const blocks=(chain?.blocks||[]).map(b=>({
    x:b.x,y:b.y,z:b.z,facing:b.facing,cmd:String(b.cmd||''),cond:b.cond?1:0,
    auto:b.auto!==0?1:0,blockType:b.blockType,marked:!!b.marked,note:b.note||''
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
    blocks,
    text:serializeTextEditorBlocks(blocks),
    conditionLines:blocks.map(b=>!!b.cond)
  };
}
function openTextEditorNew(initialText='',title='新建文本链'){
  const text=String(initialText||'').replace(/^\uFEFF/,'');
  const rawLines=text.replace(/\r/g,'').split('\n');
  const parsed=rawLines.map(line=>({cmd:normalizeImportedCommandText(line),cond:0}));
  const type=classifyTxtChain(parsed.map(x=>x.cmd));
  if(type==='snake'){
    collapseExecuteBrokenPlaceholder(parsed);
    normalizeBrokenChainBlocks(parsed,{applyCondition:true});
  }
  textEditChain=-1;
  textEditIsNew=true;
  const normalizedLines=parsed;
  textEditDraft={
    type,
    firstBlockType:'repeating',
    blocks:normalizedLines.map(item=>({cmd:item.cmd,cond:item.cond,auto:1,facing:2,blockType:'chain',marked:false,note:''})),
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
function escapeTextEditorHtml(value){
  return String(value??'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function highlightCommandBody(source){
  const text=String(source??'');
  let i=0,out='';
  const append=(cls,value)=>{out+=cls?`<span class="${cls}">${escapeTextEditorHtml(value)}</span>`:escapeTextEditorHtml(value);};
  while(i<text.length){
    const rest=text.slice(i);
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
  if(value)highlight.innerHTML=lines.map(line=>`<span class="text-highlight-line">${highlightTextEditorLine(line)}</span>`).join('');
  else highlight.innerHTML='';
  const conditionLines=textEditDraft?.conditionLines||[];
  numbers.innerHTML=lines.map((_,i)=>`<span class="text-line-number${conditionLines[i]?' is-conditional':''}" data-line="${i}">${i+1}</span>`).join('');
  main.classList.toggle('is-empty',!value);
  requestAnimationFrame(()=>{
    const lineNodes=[...highlight.querySelectorAll('.text-highlight-line')];
    const numNodes=[...numbers.querySelectorAll('.text-line-number')];
    for(let i=0;i<numNodes.length;i++){
      const h=lineNodes[i]?.getBoundingClientRect().height;
      numNodes[i].style.height=h?`${h}px`:'1.75em';
    }
    const contentHeight=Math.max(main.clientHeight,highlight.scrollHeight+2);
    input.style.height=`${contentHeight}px`;
    highlight.style.minHeight=`${contentHeight}px`;
    numbers.style.minHeight=`${contentHeight}px`;
    main.scrollTop=scrollTop;
    main.scrollLeft=scrollLeft;
    numbers.style.transform=`translateY(${-main.scrollTop}px)`;
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
  const parsed=lines.map((line,i)=>({cmd:normalizeImportedCommandText(line),cond:!!conditionLines[i]}));
  if(!parsed.length)throw new Error('文本内容中没有可表示的命令方块');
  const inferred=classifyTxtChain(parsed.map(item=>item.cmd));
  if(inferred==='snake'){
    collapseExecuteBrokenPlaceholder(parsed);
    normalizeBrokenChainBlocks(parsed,{applyCondition:false});
  }
  const type=inferred==='snake'?'snake':(textEditDraft.type==='impulse'||textEditDraft.firstBlockType==='command'?'impulse':'repeat');
  const sourceBlocks=textEditDraft.blocks||[];
  const firstBlockType=textEditDraft.firstBlockType==='command'?'command':'repeating';
                                                                          
                                                                               
                                                                                  
  const preserveCycleGeometry=!!textEditDraft.selfClosed&&parsed.length===sourceBlocks.length&&
    sourceBlocks.length>=2&&sourceBlocks.every(b=>b&&
      [b.x,b.y,b.z].every(Number.isInteger)&&Number.isInteger(b.facing)&&b.facing>=0&&b.facing<=5&&
      (b.blockType==='chain'||b.blockType==='command'||b.blockType==='repeating'));
  const blocks=parsed.map((item,i)=>{
    const old=sourceBlocks[i]||{};
    return{
      ...(preserveCycleGeometry?{x:old.x,y:old.y,z:old.z}:{}),
      cmd:item.cmd,
      cond:item.cond?1:0,
      auto:old.auto!==undefined?(old.auto!==0?1:0):1,
      facing:preserveCycleGeometry?old.facing:2,
      blockType:preserveCycleGeometry?old.blockType:(i===0?firstBlockType:'chain'),
      selfClosedCycle:preserveCycleGeometry&&!!old.selfClosedCycle,
      marked:!!old.marked,
      note:old.note||''
    };
  });
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
    const nextChains=app.chains.map(c=>({type:c.type,selfClosed:!!c.selfClosed,preservePhysicalType:!!c.preservePhysicalType,selfClosedCycleKeys:Array.isArray(c.selfClosedCycleKeys)?c.selfClosedCycleKeys.slice():[],blocks:c.blocks.map(b=>({...b}))}));
    nextChains.splice(ci,1,...segments);
    reflowChainsForSize(nextChains);
    ensureStructureSize(nextChains,'文本修改后结构');
    saveCamera();
    app.chains=nextChains;
    app.selectedChain=ci;
    app.selectedBlock=-1;
    app.singleChain=app.chains.length===1;
    pushHistory();
    renderAllBlocks();
    updateStats();
    updateChainBar();
    renderChainManager();
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

function getStructureDimensions(chains){
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
function ensureStructureSize(chains,label='结构'){
                                                                               
                                                                                
                                                                             
                                                                    
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

const EXPORT_LAYER_CHAIN_LIMIT=32;
const EXPORT_LAYER_GAP=4;
function buildExportLayout(chains){
  const nonEmpty=(Array.isArray(chains)?chains:[]).filter(c=>Array.isArray(c?.blocks)&&c.blocks.length>0);
  if(!nonEmpty.length)return{blocks:[],spanX:0,sizeY:0,sizeZ:STD_Z,layerCount:0};
  const blocks=[];
  const occupied=new Set();
  let yOffset=0;
  let layerCount=0;
  for(let start=0;start<nonEmpty.length;start+=EXPORT_LAYER_CHAIN_LIMIT){
    const group=nonEmpty.slice(start,start+EXPORT_LAYER_CHAIN_LIMIT);
    let layerMaxY=-1;
    for(let j=0;j<group.length;j++){
      const chain=group[j];
      const source=chain.blocks;
      const anchorX=Number(source[0]?.x);
      if(!Number.isInteger(anchorX))throw new Error(`导出失败：第 ${start+j+1} 条链的起始 X 坐标无效`);
      const normalized=source.map((b,k)=>{
        const dx=Number(b.x)-anchorX,localY=Number(b.y),z=Number(b.z);
        if(![dx,localY,z].every(Number.isInteger)||localY<0||z<0||z>=STD_Z){
          throw new Error(`导出失败：第 ${start+j+1} 条链包含无效坐标 (${b.x}, ${b.y}, ${b.z})；Y 必须非负，Z 必须在 0 到 ${STD_Z-1} 之间`);
        }
        return{b,dx,localY,z,k};
      });
                                                                              
                                                                             
      const ownKeys=new Set();
      for(const item of normalized){
        const key=blockKey(item.dx,item.localY,item.z);
        if(ownKeys.has(key))throw new Error(`导出失败：第 ${start+j+1} 条链内部存在重复方块坐标`);
        ownKeys.add(key);
      }
      const preferred=-2*j;
      const candidateColumns=[preferred];
      for(let d=1;d<=MAX_STRUCTURE_SIZE;d++)candidateColumns.push(preferred-d,preferred+d);
      let chosen=null;
      for(const exportColumn of candidateColumns){
        const trial=normalized.map(({b,dx,localY,z})=>({...b,x:exportColumn+dx,y:localY+yOffset,z,exportChainIndex:start+j,exportLayer:layerCount}));
        let collides=false;
        for(const b of trial){if(occupied.has(blockKey(b.x,b.y,b.z))){collides=true;break;}}
        if(collides)continue;
        let minX=Infinity,maxX=-Infinity;
        for(const b of blocks){minX=Math.min(minX,b.x);maxX=Math.max(maxX,b.x);}
        for(const b of trial){minX=Math.min(minX,b.x);maxX=Math.max(maxX,b.x);}
        if(maxX-minX+1>MAX_STRUCTURE_SIZE)continue;
        chosen=trial;break;
      }
      if(!chosen)throw new Error(`导出失败：无法为第 ${start+j+1} 条链分配不重叠的 X 坐标（结构 X 尺寸上限 ${MAX_STRUCTURE_SIZE} 格）`);
      for(const b of chosen){
        blocks.push(b);
        occupied.add(blockKey(b.x,b.y,b.z));
        layerMaxY=Math.max(layerMaxY,b.y-yOffset);
      }
    }
    const layerHeight=layerMaxY+1;
    layerCount++;
    if(start+EXPORT_LAYER_CHAIN_LIMIT<nonEmpty.length)yOffset+=layerHeight+EXPORT_LAYER_GAP;
  }
  let minX=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for(const b of blocks){minX=Math.min(minX,b.x);maxX=Math.max(maxX,b.x);maxY=Math.max(maxY,b.y);maxZ=Math.max(maxZ,b.z);}
  const spanX=maxX-minX+1,sizeY=maxY+1,sizeZ=Math.max(STD_Z,maxZ+1);
  if(spanX>MAX_STRUCTURE_SIZE){
    throw new Error(`导出后 X 尺寸为 ${spanX}，超过 ${MAX_STRUCTURE_SIZE} 格。请检查每条命令链的 X 坐标布局。`);
  }
  if(sizeY>MAX_STRUCTURE_SIZE){
    throw new Error(`导出分层后 Y 尺寸为 ${sizeY}，超过 Minecraft 结构支持的 ${MAX_STRUCTURE_SIZE} 格。当前共 ${layerCount} 层，请减少命令链数量或每层链的高度。`);
  }
  if(sizeZ>MAX_STRUCTURE_SIZE){
    throw new Error(`导出后 Z 尺寸为 ${sizeZ}，超过 ${MAX_STRUCTURE_SIZE} 格。`);
  }
                                                                         
  if(occupied.size!==blocks.length)throw new Error('导出失败：结构中存在重复方块坐标');
  return{blocks,spanX,sizeY,sizeZ,layerCount};
}
                                                                        
                                                                          
                                                         
function resolveChainCoordinateOverlaps(chains){
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
                                                                              
                                                                           
    while(collides(dx))dx--;
    if(dx)for(const b of blocks)b.x=Number(b.x)+dx;
                                                                              
                                                                              
                            
    if(Array.isArray(chains[i].selfClosedCycleKeys)||blocks.some(b=>b.selfClosedCycle)){
      chains[i].selfClosedCycleKeys=blocks.filter(b=>b.selfClosedCycle).map(b=>blockKey(Number(b.x),Number(b.y),Number(b.z)));
    }
    for(const b of blocks)occupied.add(blockKey(Number(b.x),Number(b.y),Number(b.z)));
  }
  return chains;
}

function reflowChainsForSize(chains){
  for(let i=0;i<chains.length;i++){
    const chain=chains[i];
                                                                                
                                                                           
                                                                         
    const localBlockMap=new Map((chain.blocks||[]).map(b=>[blockKey(Number(b.x),Number(b.y),Number(b.z)),{...b,type:b.blockType}]));
    const localCycles=detectSelfClosedCycles(localBlockMap,4);
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
    collapseExecuteBrokenPlaceholder(chain.blocks);
    const headKind=getBrokenHeadKind(chain.blocks);
    const placeholder=chain.type==='snake'&&isBrokenChainPlaceholder(chain.blocks);
    if(headKind){
                                                                       
                                                           
      normalizeBrokenChainBlocks(chain.blocks,{applyCondition:false});
      chain.type='snake';
    }else if(placeholder){
      chain.type='snake';
    }else{
      chain.type=chain.blocks[0]?.blockType==='command'?'impulse':'repeat';
    }
    const src=chain.blocks.map(b=>({cmd:b.cmd,cond:b.cond,auto:b.auto!==0?1:0,blockType:b.blockType}));
    const newBlocks=relayoutBlocks(src,chain.type,-2*i);
    for(let j=0;j<newBlocks.length;j++){
      newBlocks[j].marked=chain.blocks[j]?.marked||false;
      newBlocks[j].note=chain.blocks[j]?.note||'';
    }
    chain.blocks=newBlocks;
  }
  resolveChainCoordinateOverlaps(chains);
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
      selfClosedCycle:!!b.selfClosedCycle,
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
  renderAllBlocks();
  updateStats();
  updateChainBar();
  renderChainManager();
  if(closeModal)closeChainAddModal();
  if(!silentToast)toast(`已导入 ${imported.length} 条链`,'ok');
}
async function importChainFromTxt(file){
  const text=await file.text();
  const commands=normalizeImportedCommands(text);
  if(!commands.length)throw new Error('TXT 文件中没有找到命令');
  closeChainAddModal();
  openTextEditorNew(commands.join('\n'),file.name.replace(/\.txt$/i,''));
}
async function importChainFromMcstructure(file){
  const buf=await file.arrayBuffer();
  const parsed=parseMcstructure(buf);
  const chains=processCommands(parsed.commands,{blockMap:parsed.blockMap,X:parsed.X,Y:parsed.Y,Z:parsed.Z});
  appendImportedChains(chains,'结构文件',{closeModal:true});
}
let textEditChain=-1;
let textEditIsNew=false;
let textEditDraft=null;
function addChainOfType(type){
  setCurrentAction('新增命令链');
  try{
    saveCamera();
    let blocks;
    if(type==='snake'){
      blocks=[
        {cmd:'',cond:0,auto:1,facing:2,blockType:'repeating',marked:false,note:''},
        {cmd:'/setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]',cond:1,auto:1,facing:2,blockType:'chain',marked:false,note:''},
        {cmd:'/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]',cond:0,auto:1,facing:1,blockType:'chain',marked:false,note:''}
      ];
    }else if(type==='repeat'){
      blocks=[{cmd:'',cond:0,auto:1,facing:2,blockType:'repeating',marked:false,note:''}];
    }else{
      blocks=[{cmd:'',cond:0,auto:1,facing:2,blockType:'command',marked:false,note:''}];
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
    renderAllBlocks();
    updateStats();
    updateChainBar();
    renderChainManager();
    closeChainAddModal();
    toast(type==='snake'?'已新增断链':type==='repeat'?'已新增循环链':'已新增脉冲链','ok');
    logOk(type==='snake'?'新增断链完成':type==='repeat'?'新增循环链完成':'新增脉冲链完成','新增命令链');
  }catch(e){
    logError(e?.stack||e?.message||String(e),'新增命令链');
    toast(e.message,'err');
  }finally{
    setCurrentAction('空闲');
  }
}

function renderChainManager(){
  const list=document.getElementById('chainManagerList');
  if(!list)return;
  list.innerHTML=app.chains.map((c,i)=>{
    const active=i===app.selectedChain?' active':'';
    const firstBlock=c.blocks?.[0]||{};
    const firstCmd=escapeHtml(String(firstBlock.cmd??''));
    const isIndependentEmpty=!!c.preservePhysicalType&&!c.selfClosed&&c.blocks?.length===1&&
      (firstBlock.blockType==='chain'||firstBlock.type==='chain')&&String(firstBlock.cmd??'').trim()==='';
    const title=isIndependentEmpty?'独立空命令方块':(c.selfClosed?'自闭链':`链 ${i+1}`);
    const subtitle=isIndependentEmpty
      ?`1 个空命令方块 · 朝向 ${Number.isInteger(firstBlock.facing)?firstBlock.facing:'未知'}`
      :`${(c.blocks?.length??0)} 个命令方块${c.selfClosed?' · 保留闭环位置与朝向':''}`;
    const preview=isIndependentEmpty?'（空命令 · 物理节点已保留）':(firstCmd||'（无命令）');
    return `<div class="chain-item${active}" draggable="true" data-chain-index="${i}"><span class="chain-drag" title="拖动排序">⠿</span><span class="chain-order">${i+1}</span><div class="chain-item-main"><div class="chain-item-title">${title}</div><div class="chain-item-sub">${subtitle}</div><div class="chain-item-command">${preview}</div></div><button type="button" class="chain-item-copy" data-copy-chain="${i}" title="复制这条链">复制</button><button type="button" class="chain-item-delete" data-delete-chain="${i}" title="删除这条链">删除</button></div>`;
  }).join('');
  list.querySelectorAll('.chain-item').forEach(item=>{
    item.addEventListener('click',()=>{
      const ci=Number(item.dataset.chainIndex);
      if(Number.isInteger(ci)&&ci>=0&&ci<app.chains.length){
        app.selectedChain=ci;
        app.selectedBlock=-1;
        if(!app.singleChain){
          app.mode='chain';
          setBlockVisibility(ci);
          markRenderDirty();
          applyChainCamera();
          document.getElementById('exitChainBtn').style.display='flex';
        }
        updateChainBar();renderChainManager();
      }
    });
    item.addEventListener('dragstart',e=>{item.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',item.dataset.chainIndex);});
    item.addEventListener('dragend',()=>{item.classList.remove('dragging');list.querySelectorAll('.drop-target').forEach(x=>x.classList.remove('drop-target'));});
    item.addEventListener('dragover',e=>{e.preventDefault();item.classList.add('drop-target');e.dataTransfer.dropEffect='move';});
    item.addEventListener('dragleave',()=>item.classList.remove('drop-target'));
    item.addEventListener('drop',e=>{
      e.preventDefault();item.classList.remove('drop-target');
      const from=Number(e.dataTransfer.getData('text/plain'));const to=Number(item.dataset.chainIndex);
      if(Number.isInteger(from)&&Number.isInteger(to)&&from!==to)reorderChains(from,to);
    });
  });
  list.querySelectorAll('[data-copy-chain]').forEach(btn=>{
    btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const ci=Number(btn.dataset.copyChain);if(Number.isInteger(ci))duplicateChainAt(ci);});
  });
  list.querySelectorAll('[data-delete-chain]').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.preventDefault();
      e.stopPropagation();
      const ci=Number(btn.dataset.deleteChain);
      if(Number.isInteger(ci))deleteChainAt(ci);
    });
  });
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
  renderAllBlocks();
  updateStats();
  updateChainBar();
  renderChainManager();
  toast(`已将链移动到第 ${to+1} 位`,'ok');
}
function deleteChainAt(ci){
  if(!Number.isInteger(ci)||ci<0||ci>=app.chains.length)return;
  saveCamera();
  if(!confirm(`确定删除第 ${ci+1} 条链（共 ${app.chains.length} 条）吗？`))return;
  app.chains.splice(ci,1);
  app.selectedBlock=-1;
  app.singleChain=app.chains.length===1;
  app.mode=app.singleChain?'chain':'overview';
  app.selectedChain=app.singleChain?0:-1;
  app.camera=null;
  app.chainCamera=null;
  toggleChainManager(false);
  if(app.chains.length===0){
    if(previewReady)renderAllBlocks();
    pushHistory();
    updateStats();
    updateChainBar();
    renderChainManager();
    document.getElementById('exitChainBtn').style.display='none';
                                                                                   
    toast('已删除最后一条链（可使用 Ctrl+Z 撤销）','ok');
    return;
  }
  reflowAllChains();
  pushHistory();
  renderAllBlocks();
  updateStats();
  updateChainBar();
  renderChainManager();
  if(app.singleChain)setTimeout(()=>setViewPreset('top'),30);
  toast(`已删除链 ${ci+1}`,'ok');
}

function setupMobileCameraPad(){
  const pad=document.getElementById('mobileCameraPad');
  if(!pad)return;
  const keyMap={up:'Space',down:'ShiftLeft',left:'KeyA',right:'KeyD'};
  const release=button=>{const code=keyMap[button?.dataset?.cameraKey];if(code){keysDown[code]=false;button.classList.remove('is-pressed');}};
  pad.querySelectorAll('button[data-camera-key]').forEach(button=>{
    button.addEventListener('pointerdown',event=>{event.preventDefault();const code=keyMap[button.dataset.cameraKey];if(!code)return;keysDown[code]=true;button.classList.add('is-pressed');try{button.setPointerCapture(event.pointerId);}catch{}});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>release(button));
    button.addEventListener('contextmenu',event=>event.preventDefault());
  });
  window.addEventListener('blur',()=>pad.querySelectorAll('.is-pressed').forEach(release));
}

function setupKeyboardMovement(){
  document.addEventListener('keydown',e=>{
    if(isInputFocused())return;
    if(e.code==='Space')e.preventDefault();
    keysDown[e.code]=true;
  });
  document.addEventListener('keyup',e=>{keysDown[e.code]=false;});
  window.addEventListener('blur',()=>{for(const k of Object.keys(keysDown))keysDown[k]=false;});
}
let keyboardMoveScratch=null;
function updateKeyboardMovement(dt){
  if(!camera||!controls||cameraAnim)return;
                                                                                    
  if(!keysDown['KeyW']&&!keysDown['KeyS']&&!keysDown['KeyA']&&!keysDown['KeyD']&&
     !keysDown['Space']&&!keysDown['ShiftLeft']&&!keysDown['ShiftRight'])return;

  const {THREE}=three;
  if(!keyboardMoveScratch){
    keyboardMoveScratch={
      camDir:new THREE.Vector3(),forward:new THREE.Vector3(),right:new THREE.Vector3(),
      up:new THREE.Vector3(0,1,0),move:new THREE.Vector3(),
    };
  }
  const {camDir,forward,right,up,move}=keyboardMoveScratch;
  const speed=18*dt;
  camera.getWorldDirection(camDir);
  forward.set(camDir.x,0,camDir.z);
  if(forward.lengthSq()<0.0001)forward.set(0,0,-1);
  forward.normalize();
  right.crossVectors(forward,up).normalize();
  move.set(0,0,0);
  if(keysDown['KeyW'])move.add(forward);
  if(keysDown['KeyS'])move.sub(forward);
  if(keysDown['KeyD'])move.add(right);
  if(keysDown['KeyA'])move.sub(right);
  if(keysDown['Space'])move.y+=1;
  if(keysDown['ShiftLeft']||keysDown['ShiftRight'])move.y-=1;
  if(move.lengthSq()===0)return;
  move.normalize().multiplyScalar(speed);
  camera.position.add(move);
  controls.target.add(move);
  markRenderDirty();
}
function renderFrames(force=false){
  if(!renderer||!scene||!camera||!blockGroup)return;
  if(!force&&!renderDirty)return;
  renderer.render(scene,camera);
  renderDirty=false;
}

let chainPickBox=null,chainPickPoint=null;
                                                                               
                                                                            
function pickBlockInChain(chainIndex){
  const chain=app.chains[chainIndex];
  if(!chain||!chain.blocks||!raycaster||!three)return null;
  const {THREE}=three;
  if(!chainPickBox){chainPickBox=new THREE.Box3();chainPickPoint=new THREE.Vector3();}
  let picked=null,bestDistance=Infinity;
  const origin=raycaster.ray.origin;
  for(let index=0;index<chain.blocks.length;index++){
    const b=chain.blocks[index];
    chainPickBox.min.set(b.x,b.y,b.z);
    chainPickBox.max.set(b.x+1,b.y+1,b.z+1);
    const point=raycaster.ray.intersectBox(chainPickBox,chainPickPoint);
    if(!point)continue;
    const distance=origin.distanceToSquared(point);
    if(distance<bestDistance){bestDistance=distance;picked={chain:chainIndex,index};}
  }
  return picked;
}
function setupPicking(){
  let downPos=null,downTime=0;
  const dom=renderer.domElement;
  dom.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    downPos={x:e.clientX,y:e.clientY};downTime=Date.now();
  });
  dom.addEventListener('pointerup',e=>{
    if(e.button!==0||!downPos)return;
    const dx=e.clientX-downPos.x,dy=e.clientY-downPos.y;
    const dist=Math.sqrt(dx*dx+dy*dy),dt=Date.now()-downTime;
    downPos=null;
    if(dist>6||dt>600)return;
    const rect=dom.getBoundingClientRect();
    const mx=((e.clientX-rect.left)/rect.width)*2-1;
    const my=-((e.clientY-rect.top)/rect.height)*2+1;
    raycaster.setFromCamera({x:mx,y:my},camera);
    if(!blockGroup||pickMeshes.length===0)return;

    let picked=null;
    if(app.mode==='chain'&&app.selectedChain>=0){
      picked=pickBlockInChain(app.selectedChain);
    }else{
      const hits=raycaster.intersectObjects(pickMeshes,false);
      for(const hit of hits){
        const rec=hit.object?.userData?.blockRecords?.[hit.instanceId];
        if(!rec)continue;
        picked={chain:rec.chain,index:rec.index};
        break;
      }
    }
    if(!picked){if(app.mode==='chain')deselect();return;}
    if(app.mode==='overview'&&!app.singleChain)enterChainMode(picked.chain);
    else selectBlock(picked);
  });
}
function setupWheelNavigation(){
  const dom=renderer.domElement;
  dom.addEventListener('wheel',e=>{
    if(app.mode==='overview'&&!app.singleChain)return;
    if(e.ctrlKey||e.metaKey)return;
    e.preventDefault();e.stopPropagation();
    cycleBlock(e.deltaY>0?1:-1);
  },{capture:true,passive:false});
}

function disposeTexturedMaterialCache(){
  const sharedTextures=new Set(Object.values(texCache).filter(Boolean));
  for(const mats of matArrayCache.values()){
    for(const m of mats){
      if(m.map&&!sharedTextures.has(m.map))m.map.dispose();
      m.dispose();
    }
  }
  matArrayCache.clear();
}
function clearScene(){
  disposeTexturedMaterialCache();
  if(blockGroup&&scene){
                                                                                 
                                                                             
                                                         
    blockGroup.traverse(o=>{
      if(o.isInstancedMesh&&typeof o.dispose==='function')o.dispose();
    });
    scene.remove(blockGroup);
    blockGroup=null;
  }

  pickMeshes.length=0;
  pickIndexMap.clear();
  blockBatchMeta.length=0;
  edgePositionsByChain.length=0;
  edgeLineSegments=null;
  if(edgeLineGeometry){edgeLineGeometry.dispose();edgeLineGeometry=null;}
  visibleBlockChain=-1;

  if(selectionHelper&&scene){
    scene.remove(selectionHelper);
    selectionHelper.geometry.dispose();selectionHelper.material.dispose();
    selectionHelper=null;
  }
  if(selectionGlow&&scene){
    scene.remove(selectionGlow);
    selectionGlow.geometry.dispose();selectionGlow.material.dispose();
    selectionGlow=null;
  }
}

function getEdgeMat(){
  if(sharedEdgeMat)return sharedEdgeMat;
  const {THREE}=three;
  sharedEdgeMat=new THREE.LineBasicMaterial({color:0x1e293b,transparent:true,opacity:0.18});
  return sharedEdgeMat;
}
function buildBlockMaterials(blockType,cond,facing,marked){
  const key=blockType+'_'+cond+'_'+facing+'_'+(marked?1:0);
  if(matArrayCache.has(key))return matArrayCache.get(key);
  const {THREE}=three;
  const frontTex=texCache[blockType+'_front']||null;
  const backTex=texCache[blockType+'_back']||null;
  let sideKey=blockType+'_side';
  if(cond){const cs=blockType+'_conditional_side';if(texCache[cs])sideKey=cs;}
  const sideTex=texCache[sideKey]||null;
  const F=FACING_VEC[facing]||[0,0,1];
  const baseColor=BLOCK_COLOR[blockType]||0xf59e0b;
  const em=marked?0xfbbf24:0x000000,ei=marked?0.45:0;
  const mats=[];
  for(let f=0;f<6;f++){
    const N=FACE_NORMAL[f],d=dot3(N,F);
    let map=null,color=baseColor;
    if(d>0.5){if(frontTex){map=frontTex;color=0xffffff;}else color=0xff00ff;}
    else if(d<-0.5){if(backTex){map=backTex;color=0xffffff;}else color=0xff00ff;}
    else{
      if(sideTex){
        const u=FACE_RIGHT[f],v=FACE_UP[f];
        const uC=dot3(F,u),vC=dot3(F,v);
        let rot=Math.atan2(-uC,vC);
        
        const t=sideTex.clone();
        t.needsUpdate=true;t.center.set(0.5,0.5);t.rotation=rot;
        t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter;
        t.colorSpace=THREE.SRGBColorSpace;
        map=t;color=0xffffff;
      }else color=0xff00ff;
    }
    mats.push(new THREE.MeshStandardMaterial({
      map,color,roughness:0.55,metalness:0.05,
      emissive:em,emissiveIntensity:ei,
    }));
  }
  matArrayCache.set(key,mats);
  return mats;
}

function updateEdgeVisibility(chainIndex=-1){
  if(!edgeLineGeometry||!edgeLineGeometry.getAttribute('position'))return;
  const attr=edgeLineGeometry.getAttribute('position');
  let writeOffset=0;
  if(chainIndex>=0){
    const src=edgePositionsByChain[chainIndex];
    if(!src||!src.length){edgeLineGeometry.setDrawRange(0,0);return;}
    attr.array.set(src,0);writeOffset=src.length;
  }else{
    for(const src of edgePositionsByChain){
      if(!src||!src.length)continue;
      attr.array.set(src,writeOffset);writeOffset+=src.length;
    }
  }
                                                                              
                                                             
  attr.needsUpdate=true;
  edgeLineGeometry.setDrawRange(0,writeOffset/3);
}
function setBlockVisibility(chainIndex=-1){
  visibleBlockChain=Number.isInteger(chainIndex)?chainIndex:-1;
  if(!blockGroup)return;
  const {THREE}=three;
  const matrix=new THREE.Matrix4();
  for(const batch of blockBatchMeta){
    const mesh=batch.mesh;
    if(visibleBlockChain<0){
                                                                           
      for(let i=0;i<batch.records.length;i++){
        const rec=batch.records[i];
        matrix.makeTranslation(rec.block.x+0.5,rec.block.y+0.5,rec.block.z+0.5);
        mesh.setMatrixAt(i,matrix);
      }
      mesh.count=batch.records.length;
      mesh.userData.blockRecords=batch.records;
    }else{
                                                                               
                                                                                   
      const visibleRecords=[];
      let writeIndex=0;
      for(const rec of batch.records){
        if(rec.chain!==visibleBlockChain)continue;
        matrix.makeTranslation(rec.block.x+0.5,rec.block.y+0.5,rec.block.z+0.5);
        mesh.setMatrixAt(writeIndex,matrix);
        visibleRecords.push(rec);
        writeIndex++;
      }
      mesh.count=writeIndex;
      mesh.userData.blockRecords=visibleRecords;
    }
    mesh.instanceMatrix.needsUpdate=true;
  }
  updateEdgeVisibility(visibleBlockChain);
  markRenderDirty();
}

function renderAllBlocks(){
  if(!previewReady)return;
  cameraAnim=null;
  if(controls)controls.enabled=true;
  const {THREE}=three;
  clearScene();
  hideInfo();

  blockGroup=new THREE.Group();
  pickMeshes=[];
  blockBatchMeta=[];
  edgePositionsByChain=Array.from({length:app.chains.length},()=>new Float32Array(0));
  if(!sharedBlockGeo)sharedBlockGeo=new THREE.BoxGeometry(1,1,1);
  if(!sharedEdgeGeo)sharedEdgeGeo=new THREE.EdgesGeometry(sharedBlockGeo);
  const geo=sharedBlockGeo;
  const edgeGeo=sharedEdgeGeo;
  const edgeMat=getEdgeMat();
  const getSolidMat=(bt,cond,marked)=>{
    const k=bt+'_'+cond+'_'+(marked?1:0);
    if(solidMaterialCache.has(k))return solidMaterialCache.get(k);
    const c=BLOCK_COLOR[bt]||0xf59e0b;
    const m=new THREE.MeshStandardMaterial({
      color:c,roughness:0.55,metalness:0.05,
      emissive:marked?0xfbbf24:0x000000,emissiveIntensity:marked?0.45:0});
    solidMaterialCache.set(k,m);
    solidMaterialPool.add(m);
    return m;
  };

  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
  const batchMap=new Map();
  const localEdgePos=edgeGeo.attributes.position.array;
                                                                               
                                                                          
  edgePositionsByChain=app.chains.map(chain=>new Float32Array((chain.blocks?.length||0)*localEdgePos.length));
  const edgeWriteOffsets=Array.from({length:app.chains.length},()=>0);
  const totalEdgeFloats=edgePositionsByChain.reduce((n,a)=>n+a.length,0);

  for(let ci=0;ci<app.chains.length;ci++){
    const chain=app.chains[ci];
    for(let bi=0;bi<chain.blocks.length;bi++){
      const b=chain.blocks[bi];
      const matKey=texturesAvailable
        ?`${b.blockType}_${b.cond?1:0}_${b.facing}_${b.marked?1:0}`
        :`${b.blockType}_${b.cond?1:0}_${b.marked?1:0}`;
      let batch=batchMap.get(matKey);
      if(!batch){
        const material=texturesAvailable
          ?buildBlockMaterials(b.blockType,b.cond,b.facing,b.marked)
          :getSolidMat(b.blockType,b.cond,b.marked);
        batch={key:matKey,material,records:[]};
        batchMap.set(matKey,batch);
      }
      const rec={chain:ci,index:bi,block:b};
      batch.records.push(rec);
      pickIndexMap.set(`${ci}:${bi}`,{chain:ci,index:bi});

      const cx=b.x+0.5,cy=b.y+0.5,cz=b.z+0.5;
      const edgeBuffer=edgePositionsByChain[ci],edgeOffset=edgeWriteOffsets[ci];
      for(let p=0;p<localEdgePos.length;p+=3){
        edgeBuffer[edgeOffset+p]=localEdgePos[p]+cx;
        edgeBuffer[edgeOffset+p+1]=localEdgePos[p+1]+cy;
        edgeBuffer[edgeOffset+p+2]=localEdgePos[p+2]+cz;
      }
      edgeWriteOffsets[ci]+=localEdgePos.length;

      if(b.x<minX)minX=b.x;
      if(b.x+1>maxX)maxX=b.x+1;
      if(b.y<minY)minY=b.y;
      if(b.y+1>maxY)maxY=b.y+1;
      if(b.z<minZ)minZ=b.z;
      if(b.z+1>maxZ)maxZ=b.z+1;
    }
  }

                                                                            
                                                                  
  const matrix=new THREE.Matrix4();
  for(const batch of batchMap.values()){
    const mesh=new THREE.InstancedMesh(geo,batch.material,batch.records.length);
    mesh.name=`block-batch-${batch.key}`;
    mesh.userData.blockRecords=batch.records;
    if(THREE.DynamicDrawUsage!==undefined)mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for(let i=0;i<batch.records.length;i++){
      const b=batch.records[i].block;
      matrix.makeTranslation(b.x+0.5,b.y+0.5,b.z+0.5);
      mesh.setMatrixAt(i,matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;
    mesh.computeBoundingSphere();
    blockGroup.add(mesh);
    pickMeshes.push(mesh);
    blockBatchMeta.push({mesh,records:batch.records,key:batch.key});
  }

  edgeLineGeometry=new THREE.BufferGeometry();
  edgeLineGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(totalEdgeFloats),3));
  edgeLineGeometry.setDrawRange(0,0);
  edgeLineSegments=new THREE.LineSegments(edgeLineGeometry,edgeMat);
  edgeLineSegments.frustumCulled=false;
  blockGroup.add(edgeLineSegments);

  if(minX===Infinity){minX=0;maxX=1;minY=0;maxY=1;minZ=0;maxZ=1;}
  scene.add(blockGroup);
  currentBounds={cx:(minX+maxX)/2,cy:(minY+maxY)/2,cz:(minZ+maxZ)/2,X:maxX-minX,Y:maxY-minY,Z:maxZ-minZ};
  if(edgeLineGeometry&&edgeLineSegments){
    const radius=Math.sqrt(currentBounds.X*currentBounds.X+currentBounds.Y*currentBounds.Y+currentBounds.Z*currentBounds.Z)/2+0.01;
    edgeLineGeometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(currentBounds.cx,currentBounds.cy,currentBounds.cz),radius);
    edgeLineSegments.frustumCulled=true;
  }
  resizeRenderer();

  setBlockVisibility(app.mode==='chain'&&app.selectedChain>=0&&!app.singleChain?app.selectedChain:-1);

  if(app.forceView){
    app.forceView=false;app.camera=null;
    if(app.mode==='chain'&&app.selectedChain>=0)applyChainCamera();
    else setViewPreset('side');
  }else if(app.camera){
    camera.position.set(app.camera.px,app.camera.py,app.camera.pz);
    controls.target.set(app.camera.tx,app.camera.ty,app.camera.tz);
    camera.updateProjectionMatrix();controls.update();
  }else{
    if(app.mode==='chain'&&app.selectedChain>=0)applyChainCamera();
    else setViewPreset('side');
  }
  updateChainBar();
  markRenderDirty();
}

function animateCameraTo(pos,target,duration=600){
  const {THREE}=three;
  cameraAnim={
    startTime:performance.now(),
    duration,
    startPos:camera.position.clone(),
    endPos:new THREE.Vector3(pos[0],pos[1],pos[2]),
    startTarget:controls.target.clone(),
    endTarget:new THREE.Vector3(target[0],target[1],target[2]),
  };
  controls.enabled=false;
  markRenderDirty();
}
function updateCameraAnim(now){
  if(!cameraAnim)return;
  const t=Math.min(1,(now-cameraAnim.startTime)/cameraAnim.duration);
  const e=easeInOutQuad(t);
  camera.position.lerpVectors(cameraAnim.startPos,cameraAnim.endPos,e);
  controls.target.lerpVectors(cameraAnim.startTarget,cameraAnim.endTarget,e);
  camera.updateProjectionMatrix();
  markRenderDirty();
  if(t>=1){cameraAnim=null;controls.enabled=true;saveCamera();}
}
function applyChainCamera(){
  const ci=app.selectedChain;
  if(ci<0||ci>=app.chains.length)return;
  const chain=app.chains[ci];
  if(!chain?.blocks?.length)return;
                                                                               
                                                                             
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const b of chain.blocks){
    minX=Math.min(minX,b.x);maxX=Math.max(maxX,b.x+1);
    minY=Math.min(minY,b.y);maxY=Math.max(maxY,b.y+1);
    minZ=Math.min(minZ,b.z);maxZ=Math.max(maxZ,b.z+1);
  }
  const cx=(minX+maxX)/2,cy=(minY+maxY)/2,cz=(minZ+maxZ)/2;
  const d=Math.max(maxX-minX,maxY-minY,maxZ-minZ,8)*1.4;
  animateCameraTo([cx+d,cy,cz],[cx,cy,cz],600);
}

function selectBlock(ud){
  const {THREE}=three;
  const chain=app.chains[ud.chain];if(!chain)return;
  const b=chain.blocks[ud.index];if(!b)return;
  app.selectedChain=ud.chain;app.selectedBlock=ud.index;
  removeSelectionVisuals();
  const glowGeo=new THREE.BoxGeometry(1.14,1.14,1.14);
  const glowMat=new THREE.MeshBasicMaterial({
    color:0x6366f1,transparent:true,opacity:0.35,
    depthWrite:false,side:THREE.BackSide});
  selectionGlow=new THREE.Mesh(glowGeo,glowMat);
  selectionGlow.position.set(b.x+0.5,b.y+0.5,b.z+0.5);
  scene.add(selectionGlow);
  const edgeGeo=new THREE.EdgesGeometry(new THREE.BoxGeometry(1.08,1.08,1.08));
  const edgeMat=new THREE.LineBasicMaterial({color:0x1e1b4b,linewidth:2});
  selectionHelper=new THREE.LineSegments(edgeGeo,edgeMat);
  selectionHelper.position.set(b.x+0.5,b.y+0.5,b.z+0.5);
  scene.add(selectionHelper);
  selectionPulseTime=0;
  lastSelectionPulseMark=0;
  markRenderDirty();
  showInfo(ud.chain,ud.index,b);
}
let selectionPulseColor1=null,selectionPulseColor2=null;
function updateSelectionPulse(dt){
  selectionPulseTime+=dt;
  if(!selectionGlow||!selectionHelper)return;
  const now=performance.now();
  if(now-lastSelectionPulseMark<33)return;
  lastSelectionPulseMark=now;
  const pulse=0.5+0.5*Math.sin(selectionPulseTime*4);
  const s=1.02+pulse*0.08;
  selectionGlow.scale.set(s,s,s);
  selectionGlow.material.opacity=0.20+pulse*0.25;
  if(!selectionPulseColor1)selectionPulseColor1=new three.THREE.Color(0x6366f1);
  if(!selectionPulseColor2)selectionPulseColor2=new three.THREE.Color(0xffffff);
  selectionHelper.material.color.copy(selectionPulseColor1).lerp(selectionPulseColor2,pulse);
  markRenderDirty();
}
function removeSelectionVisuals(){
  let removed=false;
  if(selectionHelper&&scene){
    removed=true;
    scene.remove(selectionHelper);
    selectionHelper.geometry.dispose();selectionHelper.material.dispose();
    selectionHelper=null;
  }
  if(selectionGlow&&scene){
    removed=true;
    scene.remove(selectionGlow);
    selectionGlow.geometry.dispose();selectionGlow.material.dispose();
    selectionGlow=null;
  }
  if(removed)markRenderDirty();
}
function reselectCurrent(){
  const ci=app.selectedChain,bi=app.selectedBlock;
  if(ci<0||bi<0||!blockGroup)return;
  const rec=pickIndexMap.get(`${ci}:${bi}`);
  if(rec)selectBlock(rec);
}
function deselect(){
  removeSelectionVisuals();
  app.selectedBlock=-1;
  hideInfo();
}

function enterChainMode(ci){
  if(ci<0||ci>=app.chains.length)return;
  if(app.singleChain)return;
  app.mode='chain';
  app.selectedChain=ci;
  app.selectedBlock=-1;
  hideInfo();

  if(camera&&controls){
    app.chainCamera={
      px:camera.position.x,py:camera.position.y,pz:camera.position.z,
      tx:controls.target.x,ty:controls.target.y,tz:controls.target.z,
    };
  }

  if(blockGroup){
    setBlockVisibility(ci);
    markRenderDirty();
  }
  applyChainCamera();

  document.getElementById('exitChainBtn').style.display='flex';
  updateStats();
  updateChainBar();
}
function exitChainMode(){
  toggleChainManager(false);
  if(app.mode==='overview'&&!app.singleChain){
    setViewPreset('default');
    return;
  }
  app.mode='overview';
  app.selectedChain=-1;
  app.selectedBlock=-1;
  hideInfo();
  deselect();

  if(blockGroup){
    setBlockVisibility(-1);
    markRenderDirty();
  }
  if(app.chainCamera){
    animateCameraTo(
      [app.chainCamera.px,app.chainCamera.py,app.chainCamera.pz],
      [app.chainCamera.tx,app.chainCamera.ty,app.chainCamera.tz],
      600
    );
    app.chainCamera=null;
  }

  document.getElementById('exitChainBtn').style.display='none';
  updateStats();
  updateChainBar();
}

function cycleBlock(dir){
  if(app.chains.length===0)return;
  const ci=app.selectedChain>=0?app.selectedChain:0;
  const chain=app.chains[ci];if(!chain||chain.blocks.length===0)return;
  let idx;
  if(app.selectedChain===ci&&app.selectedBlock>=0)
    idx=(app.selectedBlock+dir+chain.blocks.length)%chain.blocks.length;
  else idx=dir>0?0:chain.blocks.length-1;
  const rec=pickIndexMap.get(`${ci}:${idx}`);
  if(rec)selectBlock(rec);
}

function setViewPreset(p){
  if(!camera||!controls||!currentBounds)return;
  cameraAnim=null;
  controls.enabled=true;
  if(p==='default' && app.mode!=='overview'){
    app.mode='overview';app.selectedChain=-1;
    if(blockGroup)setBlockVisibility(-1);
    markRenderDirty();
    updateChainBar();
  }
  document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('active',b.dataset.preset===p));
  updateChainBar();
  let cx,cy,cz,X,Y,Z;
  if(app.mode==='chain'&&app.selectedChain>=0&&app.chains[app.selectedChain]){
    const chain=app.chains[app.selectedChain];
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(const b of chain.blocks){
      minX=Math.min(minX,b.x);maxX=Math.max(maxX,b.x);
      minY=Math.min(minY,b.y);maxY=Math.max(maxY,b.y);
      minZ=Math.min(minZ,b.z);maxZ=Math.max(maxZ,b.z);
    }
    cx=(minX+maxX+1)/2;cy=(minY+maxY+1)/2;cz=(minZ+maxZ+1)/2;
    X=Math.max(1,maxX-minX+1);Y=Math.max(1,maxY-minY+1);Z=Math.max(1,maxZ-minZ+1);
  }else{
    ({cx,cy,cz,X,Y,Z}=currentBounds);
  }
  const d=Math.max(X,Y,Z,8)*1.4;
  let px,py,pz;
  switch(p){
    case'front':px=cx;py=cy;pz=cz+d;break;
    case'side':px=cx+d;py=cy;pz=cz;break;
    case'top':px=cx;py=cy+d;pz=cz+0.01;break;
    default:px=cx+d*0.55;py=cy+d*0.75;pz=cz+d*1.05;break;
  }
  camera.position.set(px,py,pz);
  camera.lookAt(cx,cy,cz);
  camera.updateProjectionMatrix();
  controls.target.set(cx,cy,cz);controls.update();
  markRenderDirty();
  saveCamera();
}
function saveCamera(){
  if(!camera||!controls||cameraAnim)return;
  app.camera={
    px:camera.position.x,py:camera.position.y,pz:camera.position.z,
    tx:controls.target.x,ty:controls.target.y,tz:controls.target.z,
  };
}
function resizeRenderer(){
  if(!previewReady||!renderer)return;
  const wrap=document.getElementById('canvasWrap');
  const w=wrap.clientWidth,h=wrap.clientHeight;
  if(w===0||h===0)return;
  camera.aspect=w/h;camera.updateProjectionMatrix();
  renderer.setSize(w,h);
  markRenderDirty();
}
window.addEventListener('resize',resizeRenderer);
window.addEventListener('beforeunload',e=>{if(app.saved===false){e.preventDefault();e.returnValue='';}});

function resizeInspectorTextarea(el,baseHeight){
  if(!el)return;
  el.style.height='auto';
  const h=Math.max(baseHeight||0,el.scrollHeight);
  el.style.height=h+'px';
}

function refreshInspectorTextareaHeights(){
  resizeInspectorTextarea(document.getElementById('infoCmd'),112);
  resizeInspectorTextarea(document.getElementById('infoNote'),74);
}



function showInfo(ci,bi,b){
  document.getElementById('infoIdx').textContent='#'+bi;
  document.getElementById('infoMarkBadge').classList.toggle('on',!!b.marked);
  const typeEl=document.getElementById('infoType');
  typeEl.textContent=b.cond?`${TYPE_LABEL[b.blockType]} · 有条件`:TYPE_LABEL[b.blockType];
  const typeSelect=document.getElementById('infoBlockType');
  if(typeSelect)typeSelect.value=b.blockType;
  const mb=document.getElementById('infoMark');
  mb.textContent=b.marked?'取消标记':'标记';
  mb.classList.toggle('active',!!b.marked);
  const condSelect=document.getElementById('infoCond');
  const autoSelect=document.getElementById('infoAuto');
  if(condSelect)condSelect.value=b.cond?'1':'0';
  if(autoSelect)autoSelect.value=b.auto!==0?'1':'0';
  document.getElementById('infoPanel').classList.add('on');
  const cmdEl=document.getElementById('infoCmd');
  const noteEl=document.getElementById('infoNote');
  if(cmdEl&&document.activeElement!==cmdEl)cmdEl.value=b.cmd||'';
  if(noteEl&&document.activeElement!==noteEl)noteEl.value=b.note||'';
  requestAnimationFrame(refreshInspectorTextareaHeights);
}
function hideInfo(){document.getElementById('infoPanel').classList.remove('on');}

function changeSelectedBlockType(type){
  const ci=app.selectedChain,bi=app.selectedBlock;
  if(ci<0||bi<0||!['command','chain','repeating'].includes(type))return;
  const nextChains=app.chains.map(c=>({type:c.type,selfClosed:!!c.selfClosed,preservePhysicalType:!!c.preservePhysicalType,selfClosedCycleKeys:Array.isArray(c.selfClosedCycleKeys)?c.selfClosedCycleKeys.slice():[],blocks:c.blocks.map(b=>({...b}))}));
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
      renderAllBlocks();updateStats();updateChainBar();renderChainManager();
      setTimeout(reselectCurrent,20);
      toast(type==='command'?'已切换为脉冲命令方块':'已切换为重复命令方块','ok');
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
    renderAllBlocks();updateStats();updateChainBar();renderChainManager();
    if(app.mode==='chain')applyChainCamera();
    toast(type==='command'?'已拆分为新脉冲链':'已拆分为新循环链','ok');
    return;
  }
  current.blockType='chain';
  try{reflowChainsForSize(nextChains);ensureStructureSize(nextChains,'类型修改后结构');}
  catch(e){toast(e.message,'err');const sel=document.getElementById('infoBlockType');if(sel)sel.value=app.chains[ci]?.blocks[bi]?.blockType||'chain';return;}
  saveCamera();
  app.chains=nextChains;
  pushHistory();
  renderAllBlocks();updateStats();updateChainBar();renderChainManager();
  setTimeout(reselectCurrent,20);
  toast('已切换为链式命令方块','ok');
}
document.getElementById('infoBlockType').addEventListener('change',e=>changeSelectedBlockType(e.target.value));
function commitInspectorText(kind,value){
  const ci=app.selectedChain,bi=app.selectedBlock;
  if(ci<0||bi<0)return;
  const current=app.chains[ci]?.blocks?.[bi];if(!current)return;
  const v=String(value??'');
  if(kind==='cmd'){
    if(current.cmd===v)return;
    const nextChains=app.chains.map(c=>({type:c.type,selfClosed:!!c.selfClosed,preservePhysicalType:!!c.preservePhysicalType,selfClosedCycleKeys:Array.isArray(c.selfClosedCycleKeys)?c.selfClosedCycleKeys.slice():[],blocks:c.blocks.map(b=>({...b}))}));
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
    renderAllBlocks();updateStats();updateChainBar();renderChainManager();
    setTimeout(reselectCurrent,20);
    if(app.chains[ci]?.type==='snake'&&beforeType!=='snake')toast('已识别断链头，自动切换为断链布局','ok');
    else if(beforeType==='snake'&&app.chains[ci]?.type!=='snake')toast('断链头格式已解除，恢复普通链布局','ok');
  }else{
    if((current.note||'')===v)return;
    current.note=v;
    pushHistory();
    renderAllBlocks();updateStats();
    setTimeout(reselectCurrent,20);
  }
}

function updateStats(){
  let total=0;
  for(const c of app.chains) total+=c.blocks.length;
  const fileEl=document.getElementById('tbarFile');
  const cmdEl=document.getElementById('tbarCommands');
  const chainEl=document.getElementById('tbarChains');
  if(fileEl)fileEl.textContent=app.fileName&&app.fileName!=='structure'?app.fileName:'未加载结构';
  if(cmdEl)cmdEl.textContent=String(total);
  if(chainEl)chainEl.textContent=String(app.chains.length);
}

function snapshot(){
  return app.chains.map(c=>({type:c.type,selfClosed:!!c.selfClosed,preservePhysicalType:!!c.preservePhysicalType,selfClosedCycleKeys:Array.isArray(c.selfClosedCycleKeys)?c.selfClosedCycleKeys.slice():[],blocks:c.blocks.map(b=>({
    x:b.x,y:b.y,z:b.z,cmd:b.cmd,cond:b.cond,auto:b.auto!==0?1:0,
    facing:b.facing,blockType:b.blockType,selfClosedCycle:!!b.selfClosedCycle,
    marked:!!b.marked,note:b.note||''}))}));
}
const AUTOSAVE_NBT_TYPE='__blockflow_autosave_nbt_type__';
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
function scheduleAutosave(){
  clearTimeout(app.autosaveTimer);
  app.autosaveTimer=setTimeout(()=>{
    if(!app.chains.length){clearAutosave();return;}
    const base={fileName:app.fileName,chains:snapshot(),theme:app.theme,updatedAt:Date.now(),originalSize:app.originalSize,sourceOrigin:app.sourceOrigin,hasOriginalRoot:false};
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
    }catch(e){
                                                                                          
      storageRemove(autosaveRootKey());
      base.hasOriginalRoot=false;
      if(!storageSet(app.autosaveKey,JSON.stringify(base))){
        logWarn('自动保存失败：浏览器存储不可用或空间不足','自动保存');
        toast('自动保存失败：浏览器存储不可用或空间不足','warn',6000);
      }else if(app.originalRoot){
        logWarn('自动保存空间不足：已保留命令链，但未能保留原始 NBT 元数据','自动保存');
        toast('自动保存空间不足：命令链已保存，原始 NBT 元数据未保存','warn',6000);
      }
    }
  },250);
}
function clearAutosave(){
  clearTimeout(app.autosaveTimer);app.autosaveTimer=null;
  storageRemove(app.autosaveKey);storageRemove(autosaveRootKey());
  const bar=document.getElementById('resumeBar');if(bar)bar.hidden=true;
}

function syncSavedState(){app.saved=app.historyIndex<0||app.historyIndex===app.savedHistoryIndex;}
function hasUnsavedChanges(){return app.saved===false;}
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
                                                                                 
                                                                    
        return{x,y,z,cmd:String(b.cmd??''),cond:b.cond?1:0,auto:b.auto!==0?1:0,
          facing:Number.isInteger(facing)&&facing>=0&&facing<=5?facing:2,
          blockType,selfClosedCycle:!!b.selfClosedCycle,marked:!!b.marked,note:String(b.note??'')};
      });
      if(blocks.length===0)throw new Error(`自动保存中的第 ${ci+1} 条链没有命令方块`);
      const type=['impulse','repeat','snake'].includes(chain.type)?chain.type:
        (blocks[0].blockType==='command'?'impulse':'repeat');
                                                                           
      return{type,blocks,selfClosed:!!chain.selfClosed,preservePhysicalType:!!chain.preservePhysicalType,
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
                                                                                
      app.originalRoot=data.originalRoot;
    }
    app.originalSize=data.originalSize||null;
    app.sourceOrigin=data.sourceOrigin||[0,0,0];
    app.singleChain=app.chains.length===1;
    app.mode=app.singleChain?'chain':'overview';
    app.selectedChain=app.singleChain?0:-1;
    app.selectedBlock=-1;
    app.history=[snapshot()];
    app.historyIndex=0;
    app.savedHistoryIndex=-1;
    app.saved=false;
    setTheme(app.theme);
    document.getElementById('uploadView').classList.remove('on');
    document.getElementById('editorView').classList.add('on');
    hideInfo();
    if(!previewReady){
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
    logOk(`恢复完成：${app.chains.length} 条链，共 ${app.chains.reduce((n,c)=>n+c.blocks.length,0)} 个命令方块`,'恢复自动保存');
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
  const s=snapshot();
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
function applySnap(s){app.chains=s.map(c=>({type:c.type,selfClosed:!!c.selfClosed,preservePhysicalType:!!c.preservePhysicalType,selfClosedCycleKeys:Array.isArray(c.selfClosedCycleKeys)?c.selfClosedCycleKeys.slice():[],blocks:c.blocks.map(b=>({...b}))}));}
function updateHistoryBtns(){
  document.getElementById('undoBtn').disabled=app.historyIndex<=0;
  document.getElementById('redoBtn').disabled=app.historyIndex>=app.history.length-1;
}
function syncHistoryScreen(){
  const upload=document.getElementById('uploadView');
  const editor=document.getElementById('editorView');
  if(!upload||!editor)return;
  const empty=app.chains.length===0;
                                                                                 
                                                                                  
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
  renderAllBlocks();updateStats();deselect();renderChainManager();scheduleAutosave();
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
  renderAllBlocks();updateStats();deselect();renderChainManager();scheduleAutosave();
}

function appendLog(level,message,action){
  const now=new Date();
  const time=now.toLocaleTimeString('zh-CN',{hour12:false});
  app.logs=Array.isArray(app.logs)?app.logs:[];
  app.logs.push({time,level,message:String(message||''),action:String(action||app.currentAction||'空闲')});
  if(app.logs.length>300)app.logs.splice(0,app.logs.length-300);
}
function setCurrentAction(action){app.currentAction=String(action||'空闲');}
function logInfo(message,action){appendLog('info',message,action);}
function logOk(message,action){appendLog('ok',message,action);}
function logWarn(message,action){appendLog('warn',message,action);}
function logError(message,action){appendLog('error',message,action);}
function formatLogText(){
  const lines=['BlockFlow 运行日志','当前执行：'+(app.currentAction||'空闲'),''];
  for(const item of (app.logs||[]))lines.push(`[${item.time}] [${item.level.toUpperCase()}] [${item.action}] ${item.message}`);
  return lines.join('\n');
}
async function copyLogs(){
  const textValue=formatLogText();
  try{
    if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(textValue);
    else{const ta=document.createElement('textarea');ta.value=textValue;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}
    toast('日志已复制','ok');
  }catch(e){toast('复制日志失败：'+e.message,'err');}
}
function openLogs(){
  const m=document.getElementById('diagnosticModal');if(!m)return;
  const body=document.getElementById('diagnosticBody');
  const logs=app.logs||[];
  body.innerHTML=`<div class="log-toolbar"><span>当前执行：${escapeHtml(app.currentAction||'空闲')} · 共 ${logs.length} 条</span><button id="logClear" class="log-clear" type="button">清空日志</button></div><div class="log-list">${logs.length?logs.map(x=>`<div class="log-entry"><div class="log-entry-top"><span class="log-time">${escapeHtml(x.time)}</span><span class="log-level ${x.level}">${x.level==='error'?'错误':x.level==='warn'?'警告':x.level==='ok'?'完成':'信息'}</span><span class="log-action">${escapeHtml(x.action)}</span></div><div class="log-message">${escapeHtml(x.message)}</div></div>`).join(''):'<div class="log-empty">暂时没有日志</div>'}</div>`;
  body.querySelector('#logClear')?.addEventListener('click',()=>{app.logs=[];openLogs();});
  rememberModalFocus('diagnosticModal');
  m.classList.add('on');m.setAttribute('aria-hidden','false');
  const list=body.querySelector('.log-list');if(list)requestAnimationFrame(()=>{list.scrollTop=list.scrollHeight;});
  setTimeout(()=>body.querySelector('button,input,select,textarea')?.focus(),0);
}
window.addEventListener('error',event=>{
  const reason=event.error?.stack||event.message||'未知运行错误';
  logError(reason,app.currentAction||'未知执行');
});
window.addEventListener('unhandledrejection',event=>{
  const reason=event.reason?.stack||event.reason?.message||String(event.reason||'未知异步错误');
  logError(reason,app.currentAction||'未知异步执行');
});
function closeFeatureModal(id){const m=document.getElementById(id);if(m){m.classList.remove('on');m.setAttribute('aria-hidden','true');restoreModalFocus(id);}}
const modalFocusStack=new Map();
function rememberModalFocus(id){const m=document.getElementById(id);if(m)modalFocusStack.set(id,document.activeElement);}
function modalFocusable(m){return Array.from(m?.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')||[]).filter(el=>el.offsetParent!==null);}
function restoreModalFocus(id){const el=modalFocusStack.get(id);modalFocusStack.delete(id);if(el&&typeof el.focus==='function')setTimeout(()=>el.focus(),0);}
function setupModalFocusTrap(){
  document.addEventListener('keydown',e=>{
    if(e.key!=='Tab')return;
    const activeModal=[...document.querySelectorAll('[role="dialog"].on')].pop();
    if(!activeModal)return;
    const items=modalFocusable(activeModal);
    if(!items.length)return;
    const first=items[0],last=items[items.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  },{capture:true});
}
setupModalFocusTrap();

const searchInput=document.getElementById('blockSearch');
const searchClear=document.getElementById('searchClear');
const searchResults=document.getElementById('searchResults');
function renderSearchResults(){
  const q=searchInput.value.trim().toLowerCase();
  searchResults.innerHTML='';
  if(!q){searchResults.classList.remove('on');return;}
  const hits=[];
  for(let ci=0;ci<app.chains.length;ci++){
    const chain=app.chains[ci];
    for(let bi=0;bi<chain.blocks.length;bi++){
      const b=chain.blocks[bi];
      const cmd=String(b.cmd||''),note=String(b.note||'');
      if(cmd.toLowerCase().includes(q)||note.toLowerCase().includes(q)){hits.push({ci,bi,b});}
      if(hits.length>=80)break;
    }
    if(hits.length>=80)break;
  }
  if(!hits.length){searchResults.innerHTML='<div class="search-empty">没有找到匹配内容</div>';searchResults.classList.add('on');return;}
  for(const h of hits){
    const item=document.createElement('div');item.className='search-result';
    item.innerHTML=`<div class="search-result-meta">链${h.ci+1} #${h.bi}</div><div class="search-result-text">${escapeHtml(h.b.cmd||h.b.note||'')}</div>`;
    item.onclick=()=>{
      searchResults.classList.remove('on');
      if(!app.singleChain&&!(app.mode==='chain'&&app.selectedChain===h.ci))enterChainMode(h.ci);
      const rec=pickIndexMap.get(`${h.ci}:${h.bi}`);
      if(rec)selectBlock(rec);
      else {app.selectedChain=h.ci;app.selectedBlock=h.bi;renderAllBlocks();setTimeout(()=>{const nextRec=pickIndexMap.get(`${h.ci}:${h.bi}`);if(nextRec)selectBlock(nextRec);},0);}
    };
    searchResults.appendChild(item);
  }
  searchResults.classList.add('on');
}
searchInput.addEventListener('input',()=>{searchClear.classList.toggle('on',!!searchInput.value);renderSearchResults();});
searchInput.addEventListener('focus',()=>{searchInput.placeholder='搜索命令或注释';if(searchInput.value)renderSearchResults();});
searchInput.addEventListener('blur',()=>{searchInput.placeholder='搜索命令或...';});
searchInput.addEventListener('keydown',e=>{if(e.key==='Escape'){searchInput.value='';searchClear.classList.remove('on');searchResults.classList.remove('on');searchInput.blur();}});
searchClear.onclick=()=>{searchInput.value='';searchClear.classList.remove('on');searchResults.classList.remove('on');searchInput.focus();};
document.addEventListener('click',e=>{if(!e.target.closest('.search-wrap')&&!e.target.closest('#searchResults'))searchResults.classList.remove('on');});

const dropzone=document.getElementById('dropzone');
const fileInput=document.getElementById('fileInput');
async function handleFile(file){
  if(!file){toast('没有选择文件','err');return;}
  if(Number.isFinite(file.size)&&file.size>MAX_IMPORT_BYTES){toast(`文件超过 ${Math.round(MAX_IMPORT_BYTES/1024/1024)} MB 的导入上限，已取消读取`,'err',6000);return;}
  setCurrentAction('导入结构文件');
  logInfo(`开始读取 ${file.name}`,'导入结构文件');
  try{
    const buf=await file.arrayBuffer();
    logInfo(`文件读取完成：${buf.byteLength} 字节`,'导入结构文件');
    await loadMcstructure(file,buf);
    logOk(`导入完成：${app.chains.length} 条链，共 ${app.chains.reduce((n,c)=>n+c.blocks.length,0)} 个命令方块`,'导入结构文件');
  }catch(e){
    logError(e?.stack||e?.message||String(e),'导入结构文件');
    toast('加载失败：'+e.message,'err');
  }finally{
    setCurrentAction('空闲');
  }
}
function hasCurrentChain(){return app.mode==='chain'&&app.selectedChain>=0&&app.selectedChain<app.chains.length;}
function getReplaceMatches(find,scope){
  if(!find)return[];
  if(scope==='current'&&!hasCurrentChain())return[];
  const list=[];
  const start=scope==='current'?app.selectedChain:0;
  const end=scope==='current'?app.selectedChain+1:app.chains.length;
  for(let ci=start;ci<end;ci++)for(let bi=0;bi<app.chains[ci].blocks.length;bi++){const b=app.chains[ci].blocks[bi];if(String(b.cmd||'').includes(find))list.push({ci,bi});}
  return list;
}
function getReplaceEmptyResultCount(find,replacement,scope){
  if(!find)return 0;
  return getReplaceMatches(find,scope).filter(({ci,bi})=>{
    const cmd=String(app.chains[ci]?.blocks?.[bi]?.cmd??'');
    return cmd.split(find).join(replacement).trim()===''&&cmd.trim()!=='';
  }).length;
}
function updateReplacePreview(){
  const find=document.getElementById('replaceFind')?.value||'';
  const replacement=document.getElementById('replaceWith')?.value||'';
  const scope=document.querySelector('input[name="replaceScope"]:checked')?.value||'all';
  const hits=getReplaceMatches(find,scope);
  const el=document.getElementById('replacePreview');
  if(!el)return;
  if(scope==='current'&&!hasCurrentChain()){el.textContent='请先进入一条链后再使用“当前链”';return;}
  if(!find){el.textContent='输入查找内容后会显示匹配数量';return;}
  const empties=getReplaceEmptyResultCount(find,replacement,scope);
  el.textContent=`匹配 ${hits.length} 个物理命令方块${empties?`；${empties} 个替换后将成为空命令方块（仍保留节点）`:''}`;
}
function openReplaceModal(){const m=document.getElementById('replaceModal');if(!m)return;rememberModalFocus('replaceModal');const current=document.querySelector('input[name="replaceScope"][value="current"]');if(current){current.disabled=!hasCurrentChain();if(current.disabled){const all=document.querySelector('input[name="replaceScope"][value="all"]');if(all)all.checked=true;}}document.getElementById('replaceFind').value='';document.getElementById('replaceWith').value='';updateReplacePreview();m.classList.add('on');m.setAttribute('aria-hidden','false');setTimeout(()=>document.getElementById('replaceFind')?.focus(),0);}
function applyBatchReplace(){
  setCurrentAction('批量替换命令');
  logInfo('开始批量替换命令','批量替换命令');
  try{
    const find=document.getElementById('replaceFind').value;
    const rep=document.getElementById('replaceWith').value;
    const scope=document.querySelector('input[name="replaceScope"]:checked')?.value||'all';
    if(!find){toast('请输入查找内容','err');return;}
    const hits=getReplaceMatches(find,scope);
    if(!hits.length){toast('没有找到匹配命令','err');return;}
    const becomeEmpty=getReplaceEmptyResultCount(find,rep,scope);
    if(becomeEmpty&&!confirm(`本次替换会让 ${becomeEmpty} 个命令变为空命令方块，但会保留这些物理节点和它们的朝向。确定继续吗？`))return;
    const nextChains=app.chains.map(c=>({type:c.type,selfClosed:!!c.selfClosed,preservePhysicalType:!!c.preservePhysicalType,selfClosedCycleKeys:Array.isArray(c.selfClosedCycleKeys)?c.selfClosedCycleKeys.slice():[],blocks:c.blocks.map(b=>({...b}))}));
    for(const h of hits){const b=nextChains[h.ci].blocks[h.bi];b.cmd=String(b.cmd||'').split(find).join(rep);}
    reflowChainsForSize(nextChains);
    ensureStructureSize(nextChains,'批量替换后结构');
    app.chains=nextChains;
    pushHistory();renderAllBlocks();updateStats();updateChainBar();renderChainManager();closeFeatureModal('replaceModal');toast(`已替换 ${hits.length} 个物理节点${becomeEmpty?`，其中 ${becomeEmpty} 个为空命令`:''}`,'ok');
    logOk(`完成替换：${hits.length} 个物理节点，其中 ${becomeEmpty} 个成为空命令`,'批量替换命令');
  }catch(e){
    logError(e?.stack||e?.message||String(e),'批量替换命令');
    toast('替换失败：'+(e?.message||String(e)),'err');
  }finally{
    setCurrentAction('空闲');
  }
}

function duplicateChainAt(ci){
  if(ci<0||ci>=app.chains.length)return;
  const next=app.chains.map(c=>({type:c.type,selfClosed:!!c.selfClosed,preservePhysicalType:!!c.preservePhysicalType,selfClosedCycleKeys:Array.isArray(c.selfClosedCycleKeys)?c.selfClosedCycleKeys.slice():[],blocks:c.blocks.map(b=>({...b}))}));
  const clone=next[ci].blocks.map(b=>({...b}));
  next.splice(ci+1,0,{type:next[ci].type,selfClosed:!!next[ci].selfClosed,preservePhysicalType:!!next[ci].preservePhysicalType,selfClosedCycleKeys:Array.isArray(next[ci].selfClosedCycleKeys)?next[ci].selfClosedCycleKeys.slice():[],blocks:clone});
  try{reflowChainsForSize(next);ensureStructureSize(next,'复制链后结构');}catch(e){toast(e.message,'err');return;}
  saveCamera();app.chains=next;app.selectedChain=ci+1;app.selectedBlock=-1;app.mode=app.chains.length===1?'chain':'overview';app.singleChain=app.chains.length===1;pushHistory();renderAllBlocks();updateStats();updateChainBar();renderChainManager();toast('已复制链','ok');
}
async function loadMcstructure(file,buf){
  setCurrentAction('解析 mcstructure');
  const p=parseMcstructure(buf);
  logInfo(`解析完成：发现 ${p.commands.length} 个命令方块，解析异常 ${p.parseWarnings||0} 个`);
  if(p.commands.length===0)throw new Error('未找到命令方块');
  app.fileName=file.name.replace(/\.mcstructure$/i,'')||'structure';
  app.originalRoot=cloneNBT(p.root);
  app.originalSize=[p.X,p.Y,p.Z];
  app.sourceOrigin=Array.isArray(p.origin)?p.origin.slice(0,3):[0,0,0];
  app.parseWarnings=p.parseWarnings||0;
  app.chains=processCommands(p.commands,{blockMap:p.blockMap,X:p.X,Y:p.Y,Z:p.Z});
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
  app.camera=null;app.chainCamera=null;app.forceView=true;
  app.history=[snapshot()];app.historyIndex=0;app.savedHistoryIndex=0;
  app.selectedBlock=-1;
  syncSavedState();
  clearAutosave();
  updateStats();
  await switchToEditor();
  syncSavedState();
  const tb=app.chains.reduce((s,c)=>s+c.blocks.length,0);
  toast(`已加载 ${app.chains.length} 条链，共 ${tb} 个方块`,'ok');
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
      if(!previewReady)initScene();
      else resizeRenderer();
      resizeRenderer();
      renderAllBlocks();
      updateStats();
      updateHistoryBtns();
      updateChainBar();
      if(!texturesAvailable)toast('未检测到 textures/ 文件夹，使用纯色显示','ok');
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
document.getElementById('backBtn').onclick=()=>{
  if(hasUnsavedChanges()&&!confirm('当前有尚未导出的修改。返回上传页面会放弃这些修改，确定继续吗？'))return;
  saveCamera();
  document.getElementById('uploadView').classList.add('on');
  document.getElementById('editorView').classList.remove('on');
  fileInput.value='';
  clearAutosave();
  app.savedHistoryIndex=app.historyIndex;
  syncSavedState();
};
dropzone.addEventListener('dragover',e=>{e.preventDefault();dropzone.classList.add('drag');});
dropzone.addEventListener('dragleave',()=>dropzone.classList.remove('drag'));
dropzone.addEventListener('drop',e=>{
  e.preventDefault();dropzone.classList.remove('drag');
  const f=e.dataTransfer.files[0];if(f)handleFile(f);
});
fileInput.addEventListener('change',()=>{if(fileInput.files[0])handleFile(fileInput.files[0]);});

document.querySelectorAll('[data-preset]').forEach(b=>{b.onclick=()=>setViewPreset(b.dataset.preset);});
document.getElementById('undoBtn').onclick=undo;
document.getElementById('redoBtn').onclick=redo;
document.getElementById('exitChainBtn').onclick=()=>{exitChainMode();setViewPreset('default');};
document.getElementById('saveBtn').onclick=()=>{
  const exportNotice='导出说明：新文件只会保留本编辑器识别并编辑的命令链方块。原结构中的普通方块、实体及其他非命令方块内容不会保留。为满足结构尺寸限制，导出时每层最多放置 32 条链，超出的链会放到更高的 Y 层（层与层之间留 4 格）。3D 编辑视图不受影响，所有链仍保持在同一高度并沿 X 方向排列。\n\n确定继续导出吗？';
  if(!confirm(exportNotice))return;
  setCurrentAction('导出命令链结构');
  logInfo('开始构建命令链导出结构','导出命令链结构');
  try{
    const root=buildOutput();
    const buf=new Writer().serialize(root);
    const out=app.fileName+rand6()+'.mcstructure';
    download(new Blob([buf],{type:'application/octet-stream'}),out);
    toast('已保存 '+out,'ok');
    logOk('导出完成：'+out,'导出命令链结构');
    app.savedHistoryIndex=app.historyIndex;
    syncSavedState();
    clearAutosave();
  }catch(e){
    logError(e?.stack||e?.message||String(e),'导出命令链结构');
    toast('导出失败：'+e.message,'err');
  }finally{
    setCurrentAction('空闲');
  }
};

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
};
document.getElementById('infoInsAfter').onclick=()=>{
  setCurrentAction('后插命令方块');
  try{
    const ci=app.selectedChain,bi=app.selectedBlock;
    if(ci<0||bi<0)return;
    const c=app.chains[ci];if(!c)return;
    const nextChains=app.chains.map(chain=>({type:chain.type,blocks:chain.blocks.map(b=>({...b}))}));
    nextChains[ci].blocks.splice(bi+1,0,{cmd:'/say new',cond:0,auto:1,facing:2,blockType:'chain',marked:false,note:''});
    reflowChainsForSize(nextChains);
    ensureStructureSize(nextChains,'插入后结构');
    app.chains=nextChains;
    pushHistory();
    app.selectedChain=ci;app.selectedBlock=bi+1;
    renderAllBlocks();updateStats();
    setTimeout(reselectCurrent,50);toast('已插入','ok');
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
  const c=app.chains[ci];if(!c)return;
  let chainRemoved=false;
  if(c.blocks.length<=1){
    app.chains.splice(ci,1);
    chainRemoved=true;
    deselect();

    if(app.chains.length===0){
      app.singleChain=false;
      app.mode='overview';
      app.selectedChain=-1;
      app.selectedBlock=-1;
      app.camera=null;
      app.chainCamera=null;
      document.getElementById('exitChainBtn').style.display='none';
      pushHistory();
      renderAllBlocks();
      updateStats();
      updateChainBar();
      renderChainManager();
                                                                                 
      toast('已删除最后一个命令方块（可使用 Ctrl+Z 撤销）','ok');
      return;
    }

    if(app.chains.length===1){
      app.singleChain=true;
      app.mode='chain';
      app.selectedChain=0;
      app.selectedBlock=-1;
      app.camera=null;
      app.chainCamera=null;
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
                                                                                   
                                                                                             
  if(chainRemoved&&app.chains.length>0){
    reflowAllChains();
    app.singleChain=app.chains.length===1;
    app.mode=app.singleChain?'chain':'overview';
    app.selectedChain=app.singleChain?0:-1;
    app.selectedBlock=-1;
  }
  deselect();pushHistory();renderAllBlocks();updateStats();updateChainBar();renderChainManager();
  if(chainRemoved&&app.chains.length>0){
    setTimeout(()=>setViewPreset('top'),30);
  }
  toast('已删除','ok');
};
document.getElementById('infoClose').onclick=()=>deselect();

(function setupFeatureBindings(){
  document.getElementById('diagnoseBtn').onclick=openLogs;
  document.getElementById('logCopy').onclick=copyLogs;
  document.getElementById('diagnosticClose').onclick=()=>closeFeatureModal('diagnosticModal');
  document.getElementById('diagnosticModal').addEventListener('click',e=>{if(e.target.id==='diagnosticModal')closeFeatureModal('diagnosticModal');});
  document.getElementById('replaceBtn').onclick=openReplaceModal;
  document.getElementById('replaceClose').onclick=()=>closeFeatureModal('replaceModal');
  document.getElementById('replaceCancel').onclick=()=>closeFeatureModal('replaceModal');
  document.getElementById('replaceApply').onclick=applyBatchReplace;
  document.getElementById('replaceFind').addEventListener('input',updateReplacePreview);
  document.getElementById('replaceWith').addEventListener('input',updateReplacePreview);
  document.querySelectorAll('input[name="replaceScope"]').forEach(r=>r.addEventListener('change',updateReplacePreview));
  document.getElementById('replaceModal').addEventListener('click',e=>{if(e.target.id==='replaceModal')closeFeatureModal('replaceModal');});
})();

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    const textEditor=document.getElementById('textEditorOverlay');
    if(textEditor&&textEditor.classList.contains('on')){closeTextEditor();return;}
    const addModal=document.getElementById('chainAddModal');
    if(addModal&&addModal.classList.contains('on')){closeChainAddModal();return;}
    for(const id of ['diagnosticModal','replaceModal']){const m=document.getElementById(id);if(m&&m.classList.contains('on')){closeFeatureModal(id);return;}}
    if(app.mode==='chain'&&!app.singleChain)exitChainMode();
    return;
  }
  if(!isInputFocused()&&app.mode==='chain'&&(e.key==='['||e.key===']')){
    e.preventDefault();cycleBlock(e.key===']'?1:-1);return;
  }
                                                                              
                                                                          
  if(isInputFocused())return;
  if(!document.getElementById('editorView')?.classList.contains('on'))return;
  if(document.querySelector('.feature-modal.on,.chain-add-modal.on,.text-editor-overlay.on'))return;
  const mod=e.ctrlKey||e.metaKey;
  if(!mod)return;
  if(e.key==='z'&&!e.shiftKey){e.preventDefault();undo();}
  else if(e.key==='y'||(e.key==='z'&&e.shiftKey)){e.preventDefault();redo();}
});

window.addEventListener('load',()=>{
  const bar=document.getElementById('resumeBar');
  try{
    const raw=storageGet(app.autosaveKey);
    const data=raw?JSON.parse(raw):null;
    if(bar&&data&&Array.isArray(data.chains)&&data.chains.length&&document.getElementById('uploadView').classList.contains('on'))bar.hidden=false;
  }catch{}
  document.getElementById('resumeBtn').onclick=()=>restoreAutosave();
  document.getElementById('resumeDismiss').onclick=()=>{clearAutosave();app.savedHistoryIndex=app.historyIndex;syncSavedState();};
  setTimeout(()=>{const w=document.getElementById('canvasWrap');if(w)resizeRenderer();},100);
});

(function setupInspectorTextareas(){
  const cmdEl=document.getElementById('infoCmd');
  const noteEl=document.getElementById('infoNote');
  if(cmdEl){
    cmdEl.addEventListener('input',()=>resizeInspectorTextarea(cmdEl,112));
    cmdEl.addEventListener('change',()=>commitInspectorText('cmd',cmdEl.value));
  }
  if(noteEl){
    noteEl.addEventListener('input',()=>resizeInspectorTextarea(noteEl,74));
    noteEl.addEventListener('change',()=>commitInspectorText('note',noteEl.value));
  }
  requestAnimationFrame(refreshInspectorTextareaHeights);
})();
