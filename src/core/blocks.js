import { FACING_VEC } from './constants.js';

export function blockTypeFromName(name){
  if(name==='minecraft:command_block')return'command';
  if(name==='minecraft:repeating_command_block')return'repeating';
  if(name==='minecraft:chain_command_block')return'chain';
  if(name==='minecraft:air')return'air';
  return'other';
}
export function blockKey(x,y,z){return`${x},${y},${z}`;}
export function isAirPlaceholderBlock(b){return !!b?.isAirPlaceholder;}
export function getOffsetPosition(b,facing,step=1){
  const F=FACING_VEC[facing];
  if(!F)return null;
  return{x:b.x+F[0]*step,y:b.y+F[1]*step,z:b.z+F[2]*step};
}
