# BlockFlow Atlas Rebuild

本版本已将结构编辑器使用的方块图集重新排列，并生成新的 BlockFlow.TextureAtlasMap 映射。

- 图集：`assets/textures/structure/block-atlas.png`（512 × 2048 RGBA）
- 映射：`assets/data/blockflow-atlas-map.json`（新 schema：`BlockFlow.TextureAtlasMap`，schemaVersion 1）
- 保留 1205 个纹理 ID（含 39 个坐标别名）
- 1166 个唯一纹理矩形重新布局，所有坐标均重新计算
- 每个提取纹理的 RGBA 像素与源区域逐像素一致
- 每个矩形边缘有 2px 外扩间距，防止相邻采样污染
- JS 加载 URL 版本号已更新至 `2.8.2-blockflow-atlas`，避免浏览器沿用旧缓存

替换数据只来源于 BlockFlow 自己的 `block-atlas.png` 和 `blockflow-atlas-map.json` 中实际引用的纹理矩形；未提取原图左上角 1024 × 1024 的区域，因为该区域没有任何 BlockFlow 映射引用。
