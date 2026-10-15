# BlockFlow 特殊方块模型实现说明

版本：v2.11.4

本版本直接提取项目作者提供的 Dislink 烘焙模型网格，转换为 BlockFlow 自己的静态模型资产格式，并重新打包模型所用纹理切片。运行时不加载 Dislink WASM、Emscripten 运行时、模型数据库或原始 Worker。

模型文件：
- `assets/data/blockflow-special-models.json`（513 个状态模型条目）
- `assets/textures/structure/blockflow-special-atlas.png`（重新打包的 256 × 256 特殊模型纹理图集）

BlockFlow 自己负责 Bedrock 状态到模型键的映射、安装方向变换、告示牌 NBT 文字覆盖、模型缓存、Chunk 装配和资源释放。

## 覆盖项目

- 拉杆：八种安装方向、开/关状态。
- 告示牌：落地、墙面、悬挂、墙面悬挂；木种、朝向、连接状态和正反面 NBT 文字。
- 按钮：木质/石质，六面安装及按下/释放状态。
- 普通、灵魂、铜、红石及墙面火把。
- 中继器四方向、四档延迟和供电状态。
- 比较器四方向、比较/减法和输出状态。
- 绊线钩、绊线。
- 红石粉仍走 BlockFlow 的连接状态几何生成逻辑，因为提取到的来源网格在 81 种连接状态下相同，不能正确表达实际连接差异。

## 安装定位修正

模型局部坐标以方块中心为原点。落地告示牌和顶部安装拉杆的底部锚点为 `y=-0.5`；父组位于 `(x+0.5,y+0.5,z+0.5)`，模型最低点因此恰好落在该方块坐标的 `y` 平面，即下方支撑方块顶面。悬挂告示牌的顶部锚点为 `y=+0.5`，对应上方支撑方块底面。没有 `lever_direction` 时默认 `up_north_south`，避免选用天花板安装模型。

墙面告示牌的局部 `-X` 面旋转到目标墙面；墙面悬挂告示牌的提取网格安装面有 `0.375` 的内缩，BlockFlow 会沿朝墙方向补偿该偏移，使安装面落到 `x/z=±0.5` 边界。墙面火把、按钮同样以各自的实际支撑面定位。

测试：
- `tests/extracted-model-assets.test.cjs`
- `tests/extracted-model-selection.test.cjs`
- `tests/special-model-runtime.test.cjs`

自动化测试不替代真实浏览器视觉回归。
