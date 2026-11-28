// 单一实现源：真实代码在 skills/be-cmd/scripts/lib/catalogue.js。
// 本目录原先保存了一份逐字节相同的副本，浏览器与 Node 各维护一份，
// 改一处忘另一处就会让界面判定和 AI 技能判定悄悄分叉。
// 现在这里只做转发，实际实现只有一份。
//
// 浏览器侧的 node:fs / node:path / node:url / node:zlib 由 index.html
// 的 importmap 映射到 src/skill-runtime/node-*.js，转发后依然生效。
export * from '../../../skills/be-cmd/scripts/lib/catalogue.js?v=r49-cleanup-20261129';
