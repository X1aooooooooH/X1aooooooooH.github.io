# BlockFlow

BlockFlow 是用于 Minecraft Bedrock 的结构编辑器与命令链编辑器。

## 在线使用

项目以 GitHub Pages 为目标环境。发布后通过仓库对应的 Pages 地址打开根目录 `index.html`，再从导航页进入命令链编辑器或结构编辑器。

## GitHub Pages 发布

1. 将项目根目录中的全部文件和文件夹提交到 GitHub 仓库根目录。
2. 在仓库 **Settings → Pages** 中，将发布来源设为 `Deploy from a branch`。
3. 选择 `main` 分支和 `/(root)` 目录并保存。
4. 等待 GitHub Pages 完成发布，然后打开显示的站点地址。

不需要本地服务器或构建步骤。请保留 `.nojekyll`，避免 GitHub Pages 对静态资源目录应用 Jekyll 处理。

## 页面

- `index.html`：网站导航入口。
- `CommandEditor/index.html`：命令链编辑器。
- `StructureEditor/index.html`：结构编辑器。

## 在线加载优化

- Three.js 和断链识别核心由两个编辑器共用，通过浏览器缓存复用。
- 页面样式、页面脚本、后台 Worker、WASM 和模型数据拆分为独立静态文件，可分别缓存。
- 模型数据和 WASM 按需请求：只有使用结构模型或格式转换功能时才下载；支持 `DecompressionStream` 的浏览器优先获取 gzip 压缩版本，并保留原始文件回退路径。
- 方块贴图使用项目自行生成的单张 RGBA 图集及 UV 索引，不再逐个请求上千张 PNG。
- 普通界面使用系统字体栈，避免首次加载 27 MB 字体文件。
- 版本查询参数用于在发布更新后刷新静态资源缓存。

## 手机端操作

- 3D 视图：单指旋转，双指捏合缩放、双指拖动平移。
- 左下角方向键：左右平移摄像机，上下升降摄像机。按住持续移动，松开立即停止。
- 命令链编辑器顶栏可以左右滑动。
- 选择方块后，属性面板使用适配手机屏幕的抽屉布局。

## 项目结构

```text
BlockFlow/
├── index.html
├── .nojekyll
├── assets/
│   ├── css/
│   ├── data/
│   ├── icons/
│   ├── js/
│   ├── textures/structure/block-atlas.png
│   ├── vendor/
│   └── workers/
├── CommandEditor/index.html
├── StructureEditor/index.html
└── README.md
```

## 第三方组件

项目包含 Three.js（MIT License）以及格式转换和模型运行组件。相关第三方组件仍受其各自许可证约束，分发或通过网络提供服务时应遵守相应许可证要求。
