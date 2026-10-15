# BlockFlow

BlockFlow 是面向 Minecraft Bedrock 的结构编辑器与命令链编辑器。项目作为静态网站部署到 GitHub Pages；不需要本地服务器或构建步骤。

## 在线发布

1. 将项目根目录内全部文件和文件夹提交到 GitHub 仓库根目录。
2. 在仓库 **Settings → Pages** 中选择 `Deploy from a branch`。
3. 选择 `main` 分支和 `/(root)` 目录并保存。
4. 发布完成后，从 GitHub Pages 地址打开根目录 `index.html`。

请保留 `.nojekyll`，避免 GitHub Pages 对静态资源目录应用 Jekyll 处理。

## 页面入口

- `index.html`：网站导航页。
- `CommandEditor/index.html`：命令链编辑器。
- `StructureEditor/index.html`：结构方块编辑器。

## 结构三维烘焙

`assets/js/blockflow-baker.js` 是 BlockFlow 自己的三维几何烘焙器。它不加载预烘焙模型数据库，也不调用外部原生烘焙模块。主要工作包括：

- 为结构建立坐标索引，并按渲染层组织方块。
- 对普通立方体执行邻面遮挡剔除；透明和 alpha-test 材质采用单独的遮挡规则。
- 调用结构编辑器的特殊形状构建器生成楼梯、门、铁轨、红石元件、植物、告示牌等非完整立方体模型。
- 将模型顶点、法线和 UV 变换到结构坐标，并把纹理变换、颜色等信息烘焙进顶点数据。
- 普通方块按材质批次生成索引化 `BufferGeometry`：相同位置、法线、UV 和颜色的顶点可复用；根据顶点数量自动选择 `Uint16Array` 或 `Uint32Array` 索引。
- 透明、Alpha Test 和不透明材质使用不同的遮挡规则；特殊方块形状沿用 BlockFlow 自己的形状构建器。
- 按 16 × 16 × 16 方块划分 Chunk，每个 Chunk 独立生成网格并启用 Three.js 视锥剔除。
- 几何面剔除、索引合并、Chunk 输出和 LOD 网格在 `assets/workers/geometry-baker.js` 后台 Worker 中执行；主线程每处理一批方块就让出事件循环，准备特殊方块形状后再把纯数据交给 Worker。
- 单方块修改使用按层、按 Chunk 的方块索引，只重新计算变更 Chunk 和相邻边界 Chunk；邻区数据只作为面剔除上下文，不会被重新输出。
- 当某一数据层达到 1800 个方块时，为 Chunk 生成 1×、2×、4×、8× 四级细节；Three.js 按摄像机距离在 72、168、336 个世界单位处切换。
- 过期任务可取消；后台 Worker 通过可转移 TypedArray 将生成的顶点和索引缓冲区交回主线程。

LOD 说明：2×、4×、8×是基于体素占用的远景近似网格，不保证与完整模型逐面一致，细小孔洞和稀疏结构可能被近似填充。特殊方块的几何在各 LOD 中保留原细节，以避免门、楼梯、红石元件等远距离消失；因此它们不会因 LOD 获得同等程度的面数缩减。16³ Chunk 可改善视锥剔除和局部更新，但会增加 Chunk 边界处的 Mesh 管理开销。实际帧率仍取决于结构形态、材质种类、GPU 和浏览器。

模型贴图使用 `assets/textures/structure/block-atlas.png`；纹理坐标映射由 `assets/data/blockflow-atlas-map.json` 提供。

## 原生 JavaScript 文件格式引擎

`assets/workers/format.js` 是轻量 Worker 通信入口，实际文件解析和转换由 `assets/workers/format-engine.js` 完成。该引擎使用项目自己的 NBT 读写器、方块调色板、紧凑位字段读写、几何索引和序列化逻辑，独立完成支持格式的解析与转换。

### 导入格式

| 格式 | 当前支持范围 |
|---|---|
| `.mcstructure` | 基岩版结构 NBT，包含方块调色板、方块索引和方块实体 |
| `.litematic` | Litematica 区域及紧凑方块状态数据；多区域文件当前读取首个区域 |
| `.schem` | Sponge v2/v3 结构及方块实体 |
| `.schematic` | 经典 MCEdit 结构；额外识别 BlockFlow 自有状态扩展 |
| `.wsmr` | BlockFlow WSMR v2 |
| `.nbt` | Java 结构模板 |
| `.bdx` | 支持未压缩和 BDZ/GZIP 的部分 BDX 操作码；运行时方块池、内嵌 NBT 等未支持操作会明确报错。BD@/Brotli 取决于浏览器原生解压支持 |
| `.mca` | 读取现代 `block_states` 调色板区块；不完整迁移实体、方块实体和旧版区块 |
| `.zip`、`.mcpack`、`.mcaddon` | 从容器中提取支持的独立结构文件 |
| `.mcworld` | 仅能提取容器内独立结构文件；不解析 LevelDB 世界数据库 |

### 导出格式

- `.mcstructure`：Minecraft Bedrock 结构。
- `.litematic`：Litematica 结构。
- `.schem`：Sponge / WorldEdit 结构。
- `.schematic`：经典 MCEdit 结构，附加 BlockFlow 扩展以便本项目保留较新的方块状态。
- `.wsmr`：BlockFlow 自有中间格式 v2。

BDX 和 `.mcworld` 当前只保留导入入口，未提供导出选项：BDX 导出需要完整运行时方块 ID 映射及 Brotli 编码；`.mcworld` 导出需要 LevelDB 世界数据库写入器。项目不会生成看似成功但实际不兼容的文件。

### 数据保真提醒

Java 格式无法表达 Bedrock 的所有双层共位方块数据；转换到不支持双层结构的格式时会发出警告并优先保留主层。经典 `.schematic` 无法表达大部分现代方块状态，BlockFlow 扩展只保证 BlockFlow 自身的往返识别，不保证其他工具读取该扩展。

## 自动化测试

开发环境安装 Node.js 后，在项目根目录执行：

```bash
node --test tests/*.test.cjs
```

当前自动化测试共 49 项：

- `native-baker.test.cjs`（22 项）：普通方块邻面剔除、透明与 cutout 遮挡、索引几何、UV 变换、特殊模型编译、资源释放、LOD、进度、取消任务、局部 Chunk 边界更新。
- `geometry-worker.test.cjs`（9 项）：Worker 输出、16³ Chunk、跨 Chunk 面剔除、局部输出、负坐标、特殊模型 LOD、UV 属性对齐，以及后台任务中途取消。
- `format-engine.test.cjs`（10 项）：NBT 解析/序列化、格式往返、命令方块 NBT 转换和错误输入处理。
- `format-worker.test.cjs`（4 项）：后台格式引擎初始化、实际转换和错误输入处理。
- `atlas-map.test.cjs`（4 项）：新图集尺寸、1205 个纹理 ID、坐标边界、唯一矩形不重叠以及编辑器加载路径。

## 公共资源目录

```text
BlockFlow/
├── index.html
├── .nojekyll
├── README.md
├── CommandEditor/
│   └── index.html
├── StructureEditor/
│   └── index.html
├── tests/
└── assets/
    ├── css/
    ├── data/
    ├── icons/
    ├── js/
    ├── textures/structure/
    ├── vendor/
    └── workers/
```

## 手机端操作

- 3D 视图：单指旋转，双指捏合缩放、双指拖动平移。
- 方向键：左右移动摄像机，上下升降摄像机。
- 选择方块后，属性面板会使用适配手机屏幕的抽屉布局。

## 第三方组件

项目包含 Three.js 运行时；其上游许可证声明保留在 `assets/vendor/three-runtime.js` 中。其他资源及数据文件应按其各自来源和授权要求管理。
