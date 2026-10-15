# BlockFlow

BlockFlow 是面向 Minecraft Bedrock 的结构编辑器与命令链编辑器。当前结构编辑器**仅支持 `.mcstructure` 导入和导出**，不提供其他结构格式解析、转换或导出功能。项目是静态网页，可部署在 GitHub Pages；无需构建步骤。

## 在线发布

1. 将项目根目录内全部文件和文件夹提交到 GitHub 仓库根目录。
2. 在仓库 **Settings → Pages** 中选择 `Deploy from a branch`。
3. 选择 `main` 分支和 `/(root)` 目录并保存。
4. 发布后，从 GitHub Pages 地址打开根目录 `index.html`。

请保留 `.nojekyll`，避免 GitHub Pages 对静态资源目录应用 Jekyll 处理。

## 页面入口

- `index.html`：BlockFlow 导航页。
- `CommandEditor/index.html`：命令链编辑器。
- `StructureEditor/index.html`：结构编辑器。

## 结构文件支持范围

| 操作 | 支持范围 |
|---|---|
| 导入 | Minecraft Bedrock `.mcstructure` |
| 导出 | Minecraft Bedrock `.mcstructure` |
| 其他格式 | 不提供导入、转换或导出入口 |

导入时会检查 `.mcstructure` 扩展名，并由 `assets/js/structure-core.js` 解析 Bedrock NBT、结构尺寸、方块调色板、方块索引、方块实体和命令方块数据。导出时由同一核心模块序列化为 `.mcstructure`。编辑期间的自动保存和撤销快照也使用 MCStructure 数据，不经过额外格式转换层。

## 结构三维渲染

`assets/js/blockflow-baker.js` 是 BlockFlow 自己的三维几何烘焙器，不加载预烘焙模型数据库，也不调用原生模型烘焙模块。主要工作包括：

- 为结构建立坐标索引，并按渲染层组织方块。
- 对普通立方体执行邻面遮挡剔除；透明和 Alpha Test 材质采用单独的遮挡规则。
- 对普通方块按材质批次生成索引化 `BufferGeometry`，复用相同位置、法线、UV 和颜色的顶点；按顶点数量选择 16 位或 32 位索引。
- 按 16 × 16 × 16 方块划分 Chunk，每个 Chunk 独立生成网格并启用 Three.js 视锥剔除。
- 几何面剔除、索引合并、Chunk 输出和 LOD 网格在 `assets/workers/geometry-baker.js` 后台 Worker 中执行；主线程负责准备特殊方块几何和 Three.js 对象装配。
- 单方块修改通过按层、按 Chunk 的索引定位，只重建变更 Chunk 和相邻边界 Chunk。
- 当某一数据层达到 1800 个方块时，为 Chunk 生成 1×、2×、4×、8× 四级细节；摄像机距离达到 72、168、336 个世界单位时切换。
- 过期任务可以取消；Worker 使用 Transferable TypedArray 返回几何缓冲区。

### 特殊方块模型

告示牌、红石火把、普通火把、灵魂火把、铜火把、拉杆、按钮、中继器、比较器和红石粉使用独立的三维形状构建逻辑，而不是把整块方块绘制成一张平面贴图。

- **告示牌**：使用实体板面、边框、支架/挂链、固定件和双面文字几何；文字从方块实体 NBT 的 `FrontText`、`BackText` 或旧版 `Text1` 至 `Text4` 读取。文字先栅格化为像素轮廓，再生成有厚度的三维小面片几何，最终不是 Canvas 贴图材质。
- **红石火把及其他火把**：使用圆柱形木杆、金属箍、灯芯/火焰几何；红石火把根据点亮状态显示发光头或熄灭帽，墙面火把根据朝向旋转整个模型。
- **拉杆**：使用底座、安装螺钉、转轴、杆体和手柄几何，并读取朝向和通电状态调整安装面及杆体姿态。
- **按钮**：使用安装底板、压边、实体按钮帽和固定件，并根据按下状态改变按钮突出高度。
- **红石中继器/比较器**：使用实体底座、边缘、导轨、端点和独立红石火把几何；比较器读取减法状态，中继器读取延迟及输出状态。
- **红石粉**：依据四个方向的连接状态生成中心节点和立体连线，并按照信号强度调整颜色。

其他楼梯、门、铁轨、栅栏、墙、玻璃板、植物、活板门等也由对应形状构建器生成几何。普通方块仍使用纹理图集提供表面材质；这与把特殊方块整体绘制成平面贴图不同。

纹理图集：`assets/textures/structure/block-atlas.png`。对应映射：`assets/data/blockflow-atlas-map.json`。图集中的纹理 ID 保持稳定，坐标由新的 BlockFlow 图集映射提供。

### 性能架构

- `assets/workers/geometry-baker.js`：后台执行面剔除、索引几何合并、Chunk 和 LOD 数据生成。
- `assets/js/blockflow-baker.js`：准备烘焙输入、特殊模型和主线程对象装配。
- Chunk 尺寸为 16³；单块编辑只更新目标及必要的边界 Chunk。
- 大型数据层使用近似体素占用 LOD。粗 LOD 可能填补细小孔洞或改变稀疏轮廓；特殊模型保留完整细节，因此特殊方块较多时 LOD 收益会降低。
- 真实帧率取决于结构分布、材质数量、GPU 和浏览器。自动化测试不等于真实设备 FPS 测试。

## 方块数据与模型

- `assets/js/structure-core.js`：Bedrock MCStructure NBT 解析、方块调色板/索引处理、方块实体读写和 MCStructure 序列化。
- `assets/js/structure-app.js`：结构编辑器界面、三维场景、特殊方块几何、编辑操作和相机控制。
- `assets/js/blockflow-baker.js`：BlockFlow 几何烘焙调度与结果装配。
- `assets/workers/geometry-baker.js`：后台几何 Worker。
- `assets/workers/snapshot.js`：自动保存与快照序列化 Worker。
- `assets/workers/batch.js`：批量查找/替换 Worker。
- `assets/js/broken-chain-core.js`：命令链断链识别共享逻辑。
- `assets/js/command-editor.js`：命令链编辑器主程序。
- `assets/js/worker-factory.js`：创建和管理后台 Worker。

## 自动化测试

在安装 Node.js 的开发环境中，从项目根目录执行：

```bash
node --test tests/*.test.cjs
```

测试覆盖：普通方块遮挡、索引几何、Chunk 边界、LOD、Worker 取消、图集坐标、仅 MCStructure 文件入口，以及告示牌/火把/拉杆/按钮/中继器/比较器/红石粉的专用几何模型实现。

## 项目目录

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

项目包含 Three.js 运行时；其上游许可证声明保留在 `assets/vendor/three-runtime.js` 中。其他资源及数据文件按各自来源和授权要求管理。
