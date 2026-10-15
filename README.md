# BlockFlow

BlockFlow 是面向 Minecraft Bedrock 的本地结构与命令链编辑工具集。

## 使用

- 网站入口：`index.html`
- 命令链编辑器：`CommandEditor/index.html`
- 结构编辑器：`StructureEditor/index.html`

结构编辑器已经整合为单 HTML：页面所需 CSS、主线程 JavaScript、解析/格式转换核心及后台 Worker 脚本均内嵌在 `StructureEditor/index.html` 中。模型二进制和 WebAssembly 运行数据也嵌入 HTML；贴图、图标和字体集中放在根目录 `assets/`。

## 本地运行

- 结构编辑器可以直接双击 `StructureEditor/index.html`，无需启动本地服务器。
- 整站和命令链编辑器可双击根目录 `启动BlockFlow.bat`，或用任意静态 HTTP 服务打开根目录 `index.html`。
- 浏览器需要支持 WebGL、Web Worker、WebAssembly、IndexedDB 和现代 JavaScript。

## 手机端

- 结构编辑器：单指旋转视角，双指捏合缩放并平移；左下角四向键可移动视角。
- 命令链编辑器：窄屏顶栏可左右滑动，属性面板和代码窗口使用手机布局。

## 文件输出

结构编辑器和命令链编辑器输出文件均采用原文件名（不含扩展名）加六位随机数字，再加目标扩展名的方式生成，避免覆盖已有文件。

## 项目目录

```text
BlockFlow/
├── index.html
├── .nojekyll
├── assets/
│   ├── fonts/
│   ├── icons/
│   └── textures/
├── css/
├── js/
├── vendor/
├── tools/
├── StructureEditor/
│   └── index.html
├── CommandEditor/
│   └── index.html
├── README.md
└── 启动BlockFlow.bat
```

## 第三方组件说明

项目使用 Three.js（MIT License）。结构格式转换与模型引擎包含依据 GNU Affero General Public License version 3.0（AGPL-3.0）发布的第三方二进制组件。相关组件的来源和许可义务应随分发版本一并遵守；若以网络服务形式提供，发布方需要按 AGPL-3.0 要求提供对应源代码或取得适用的授权。此说明不代表本项目拥有这些第三方组件的原始著作权。
