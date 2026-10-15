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

## 结构编辑器的原生几何烘焙

结构编辑器的三维网格生成由 `assets/js/blockflow-baker.js` 独立实现，不再加载旧的 `blockmesh.js`、`models.bin` 或 `structure-model-registry.json`。原生烘焙流程包括：

- 按结构层整理方块，并建立坐标索引。
- 对普通立方体执行相邻面遮挡剔除，减少不可见三角形。带透明度或 alpha-test 的材质不会被误判为完全遮挡。
- 使用结构编辑器自己的状态化形状构建器生成楼梯、门、铁轨、红石元件、植物、告示牌等非完整立方体模型，再将其顶点、法线和 UV 转换到结构坐标。
- 将纹理平移、缩放等 UV 变换烘焙进顶点数据，将材质染色烘焙进顶点颜色。
- 按纹理和渲染状态合并网格，减少场景中的 Mesh 数量。
- 分批让出浏览器事件循环，并支持取消过期重建任务。

模型贴图仍使用 `assets/textures/structure/block-atlas.png` 与 `assets/data/legacy-atlas-map.json`。这些是 BlockFlow 自己的渲染资源，不是外部模型烘焙运行时。

## 文件格式引擎与烘焙的边界

`assets/workers/format.js` 仍加载 `assets/data/core.wasm`，但现在只绑定格式转换及内存管理所需的接口：转换名称、转换入口、裁剪转换、输出大小/指针/边界框/错误信息，以及 `malloc/free` 和线性内存。结构渲染不再调用 WASM 的网格统计、顶点/UV/索引读取、命令块构建或分层切片接口。

本版本对 WASM 做了基于真实调用图的保守裁剪：移除了 59 个非格式转换公开导出，并将 128 个不在格式转换可达闭包中的函数体替换为 `unreachable` 陷阱桩，其中 95 个属于旧 API 独占调用路径，另外 33 个是其他不可达函数。调用图同时考虑直接调用和 `call_indirect` 的函数签名兼容目标；格式转换路径实际使用的接口保持可用。

**限制说明：** 原始 WASM 没有附带 C/C++ 源码或可复现构建脚本。与格式转换共享、或可能通过兼容间接调用到达的底层函数体被保留，以免破坏文件转换。因此这次已移除旧烘焙 API 的公开入口，并禁用了可明确归属旧 API 的独占函数体，但不宣称对整个 WASM 做了源码级重建，也不声称所有共享机器码都已物理删除。结构编辑器的模型网格烘焙本身由 `blockflow-baker.js` 的 BlockFlow 实现负责。

## 原生烘焙算法自测

开发环境安装 Node.js 后，在项目根目录执行：

```bash
node tests/native-baker.test.cjs
node tests/wasm-boundary.test.cjs
```

第一个测试覆盖普通方块邻面剔除、透明与 cutout 遮挡、材质批次合并、UV 变换、特殊模型几何编译、源几何释放、分批进度、取消任务及 1000 方块规模的基础场景；测试使用项目内实际 Three.js 运行时代码。第二个测试检查压缩与未压缩转换引擎一致、WASM 可编译、公开导出仅保留格式转换和内存管理接口、59 个旧 API 导出已移除、128 个非转换可达函数体已中和（其中 95 个属于旧 API 独占路径）、旧模型资源已移除。

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

项目包含 Three.js（MIT License）及文件格式处理相关的预编译组件。分发或通过网络提供服务时，请遵守各自许可证及相关声明。
