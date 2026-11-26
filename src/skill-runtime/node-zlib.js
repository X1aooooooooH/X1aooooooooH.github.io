// The browser skill runtime only needs command analysis; mcstructure
// compression helpers are not available in this static page.
export function inflateSync() { throw new Error('浏览器技能运行时暂不支持 zlib 解压'); }
export function deflateSync() { throw new Error('浏览器技能运行时暂不支持 zlib 压缩'); }
export default { inflateSync, deflateSync };
