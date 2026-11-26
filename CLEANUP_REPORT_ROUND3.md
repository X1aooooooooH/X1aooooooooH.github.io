# BlockFlow 第三轮清理与模块化报告

## 基线

- 输入：`BlockFlow_round2_cleaned (10).zip`（第二轮清理后的版本）。
- 工作副本：`BlockFlow/blockflow`，原项目完整备份在 `BlockFlow_backup_20261126`。
- 约束：保留现有 3D 视口、链识别/断链规则、导入导出格式、AI 会话与本地存储键；不改变产品行为。

## 结果总览

| 文件 | 清理前 | 清理后 | 说明 |
| --- | ---: | ---: | --- |
| `src/main.js` | 4323 行 | 521 行 | 只保留启动、事件装配、搜索、导入/导出与全局桥接 |
| `src/ai.js` | 2911 行 | 1827 行 | IIFE 改为 ES Module；提示词/API/技能/上下文/操作拆出 |
| `src/workspace.js` | 785 行 | 865 行 | 移除轮询；改为事件委托与生命周期驱动 |
| 应用 JS 文件数 | 3 | 30 | 新增 core / ui / ai 三个模块层 |
| CSS 字节数 | 136760 | 132416 | 删除 130 条被完全覆盖的声明、4 个未使用变量与返回提示样式 |
| 字体资源 | 28.27 MB TTF | **6.24 MB WOFF2** | 覆盖 BMP 汉字与全部 UI 符号 |

## 1. 删除的死代码

### 1.1 主编辑器

- `collapseExecuteBrokenPlaceholder()`：恒返回 `false` 的空操作，删除函数及 3 处调用。
- `pendingWrongBranches / pendingWrongKeys / finalizedWrong`：全项目没有任何代码向 `pendingWrongBranches` 写入；整段“错误朝向分支清理”、日志与 toast 分支不可达，删除约 44 行，并移除 `processCommands` 的 `notify` 钩子。
- `solidMaterialPool`：只写不读，删除。
- `app.parseWarnings`：只写不读，删除字段与赋值。
- `readmeLoadPromise`：只赋值不读取，删除。
- `openExportFormatModal()`：`#saveBtn` 的该处理器随后被 workspace 覆盖，modal 从未通过该入口打开；删除函数与对应的关闭/遮罩监听。`#exportFormatModal` 保留为 workspace 导出菜单的目标按钮宿主。
- 无引用参数：`showInfo(ci)`、`commitInspectorText` 相关多余参数、`workspace.bindFrame` 的 `shell/deck/body/currentChain/highlight`。

### 1.2 AI

- `modifyMessage()`、`applyStructurePatch()`、`extractJsonObject()` 以及 `handleMessageAction('modify')` 分支：UI 只会生成 `copy` 按钮，`modify` 路径不可达，删除约 95 行。
- 重复的 `addUsage()` 闭包（两份完全相同）合并为 `ai/api.mergeUsage()`。
- `chat.baseSystem`、`roleLabel.notice`：只写不读，删除。
- `openSettingsFromFab()`：单行转发，删除。
- 不存在的 `#aiKeyBtn`、`#textAiReadBtn` 查询与绑定分支：删除。
- 本地的 `endpoint()`、`endpointFor()`、`searchSkillIds()`、`loadSkill()` 与 `ai/api.js`、`ai/skill.js` 重复，删除本地副本，改为导入。

### 1.3 工作区

- `showReturnToast()` 及其 `window` 导出：没有任何调用方；删除函数与 `.return-toast` / `@keyframes returnDrop` 样式。
- 未使用的 `bindFrame` 参数和 `state.lastChain/lastBlock` 字段。

## 2. 重复业务逻辑合并

| 重复点 | 原状 | 统一实现 |
| --- | --- | --- |
| 链深拷贝 | main/ai 中 7 处手写 `app.chains.map(...)` | `core/model.cloneChain / cloneChains` |
| 历史快照 | 手写块字段白名单 | `core/model.snapshotChains / snapshotBlock` |
| 链边界计算 | 相机、视图预设各写一遍 min/max 循环 | `core/model.chainBounds` |
| 编辑后刷新 | 10+ 处 `renderAllBlocks(); updateStats(); renderChainManager()` | `editor.refreshChainsUI()` |
| Markdown | main 的 README 渲染器 + ai.js 的聊天渲染器两份 | `ui/markdown.js` 单一实现（标题 ID / 表格包裹为选项） |
| HTML 转义 | main / ai / 文本编辑器三份 | `ui/dom.escapeHtml` |
| Token 用量累加 | ai.js 两份相同 `addUsage` | `ai/api.mergeUsage` |
| 链计数 | 多处 `filter(isAirPlaceholder).length` | `core/model.countPhysicalBlocks` |
| 导出布局/链重排 | 原本已集中，保持 | `core/layout.js` |

## 3. 拆分结构

```text
src/
├── main.js                 # 启动、DOM 事件装配、搜索、导入/导出 UI、window 桥接
├── state.js                # 共享 app 对象
├── log.js                  # 运行日志
├── scene.js                # Three.js 视口、相机、拾取、材质、选择、渲染
├── inspector.js            # 方块检查器 DOM（缓存元素）
├── editor.js               # 链编辑、历史、自动保存、导入/导出、模式切换
├── ai.js                   # AI 会话、设置、聊天 UI 与发送编排
├── core/
│   ├── nbt.js              # TAG / Reader / Writer / T / cloneNBT
│   ├── structure.js        # mcstructure 解析、普通/网易导出、序列化
│   ├── broken-head.js      # 断链识别、相对坐标旋转、自闭环检测
│   ├── trace.js            # 链追踪、布局、processCommands
│   ├── layout.js           # 尺寸校验、链重排、导出拆分
│   ├── model.js            # 链/块克隆、快照、边界
│   ├── blocks.js / constants.js / textures.js / storage.js / util.js
├── ai/
│   ├── prompts.js          # 提示词、模型、slash 命令
│   ├── api.js              # OpenAI-compatible 请求、SSE、用量
│   ├── skill.js            # SKILL.md、浏览器技能运行时、ID 查询
│   ├── context.js          # 结构上下文、syntax/chain/inspect/verify 预检
│   └── actions.js          # blockflow-actions 操作执行与状态快照
└── ui/
    ├── dom.js / feedback.js / markdown.js / theme.js
    └── text-editor.js      # 文本模式、语法高亮、行号条件
```

## 4. 事件监听与生命周期

- **删除轮询定时器**
  - `ai.js` 的 800ms 文件上下文轮询：改为 `refresh()` 内调用 `ensureAiFileContext()`，由 `updateChainBar()` 驱动。
  - `workspace.js` 的 400ms 当前链文本轮询：改为 `updateChainBar()` / `selectBlock()` 主动刷新。
  - `workspace.js` 的 300ms 侧栏/模式轮询：改为 `updateChainBar()` + 链管理列表 `MutationObserver`，并用 `requestAnimationFrame` 合并侧栏重建。
- **上传页眼睛**
  - 之前全局 `pointermove` + 4.2s 语录定时器在进入编辑器后仍运行。
  - 改为监听 `#uploadView` 的 `class` 变化，仅在上传页启动，离开时移除指针监听、清除定时器并取消 rAF。
- **事件委托**
  - 侧栏链行：每行 9 个监听器 → 列表级 6 个委托监听器。
  - 链管理列表：每行 5 个监听器 → 列表级 6 个委托监听器。
  - 搜索结果：每个结果 1 个 `onclick` → 容器级 1 个委托监听器。
- **修复**
  - `undo()/redo()` 未调用 `updateHistoryBtns()`，导致撤销后“重做”按钮仍禁用；已修复。
  - 检查器 DOM 每次查询 → 模块内缓存。

## 5. 性能优化

- **AI 流式渲染**：启用 `stream: true`；流式 token 只更新最后一条 assistant 消息的正文/推理区，不再每帧 `renderChat()` 重建全部消息。
- **备注编辑不重建 3D**：`commitInspectorText('note')` 只写历史与日志，不再 `renderAllBlocks()`。
- **侧栏渲染合并**：同一帧内多次状态变化只重建一次。
- **文本模式**：行号/高亮仍在输入帧内测量；未改变现有交互。
- **字体路径修复**：`tokens.css` 原为 `textures/...`（相对 `styles/` 解析为 404），改为 `../textures/...`，自定义字体现在真正加载。
- **字体体积**：TTF 转换为 WOFF2，从 28.27 MB 降到 6.24 MB；保留 BMP 汉字、标点和全部 UI 符号，移除原始 TTF。
- **CSS 去重**：删除 130 条被后续同选择器声明覆盖的声明（editor 45、responsive 5、workspace 79、components 1），删除 `--ai-bg / --ai-warm / --ai-green / --frame-width` 与返回提示样式。

## 6. 验证

- 30 个应用 JS 文件全部通过 `node --check`。
- ESLint（`no-undef` + `no-unused-vars`）0 error / 0 warning。
- 浏览器回归（Edge headless + WebGL 2 / SwiftShader）：
  - 上传页 → 导入 `test.mcstructure`（8 块断链）→ 3D 渲染；
  - 选择方块、检查器编辑命令/备注、撤销/重做；
  - 新增链、复制链、拖拽排序、删除链；
  - 行内文本编辑、完整文本模式应用；
  - 导出新版/旧版/网易版，重新导入新版文件；
  - AI 设置、真实 SSE 流式分块更新、工具块（verify）二次请求、action 应用与取消；
  - 390×844 暗色移动端无横向溢出。
  - 以上流程控制台 0 error。
- CSS 去重前后对 1440×900 上传页/编辑器/检查器/链管理弹窗/ AI 设置的关键元素 `getBoundingClientRect` 完全一致（差异 0.1px 内）；像素差异仅来自 WebGL 相机取景与随机语录。

## 7. 保留项与边界

- `skills/be-cmd/scripts/lib/*` 与 `src/skill-runtime/lib/*` 内容相同，但分别服务 Node CLI 与浏览器运行时，属于有意镜像，未合并。
- `styles/workspace.css` 仍保留 124 个 `!important`，用于覆盖 `editor.css` 的旧编辑器外壳与内联样式（如 `#exitChainBtn.style.display`）。进一步收敛需要重写整个外壳样式层，超出本轮“可验证的安全清理”边界。
- `#exportFormatModal` 的弹窗外壳仍保留，作为 workspace 导出菜单点击的隐藏按钮宿主；其打开函数与关闭监听已删除。
- 字体已转换为 `LXGWWenKai-Light.woff2`（6.24 MB）；罕见 CJK 扩展字符会回退到系统字体，这是子集化的预期行为。

## 8. P0 性能补丁（2026-11-27）

### 8.1 文本模式行号布局

原实现逐行 `getBoundingClientRect()` 读高度后立即写 `style.height`，读写成对交错，100–500 行会触发数百次同步布局。

本轮改为：

- 新增 [ui/line-metrics.js](blockflow/src/ui/line-metrics.js) 行高缓存：按“行文本 + 容器宽度 + 字体度量”缓存，命中后不再测量；
- 先批量读所有脏行高度，再批量写行号高度，消除读写交错；
- 只更新内容发生变化的行 span 和条件 class，不再整块重建高亮/行号；
- 行高未变化时跳过 `scrollHeight` 读取和输入框高度写入；
- 字体加载、窗口尺寸变化时失效缓存并重排。

实测 200 行链编辑一行：`text-highlight-line` 的 `getBoundingClientRect` 调用从 200 次降到 **1 次**，同步处理约 0.7 ms；长命令换行后行号高度 98px 与高亮行一致。文本模式 200 行同样降为 **1 次**测量。

### 8.2 字体

- 用 `fontTools.subset` 生成 WOFF2，保留 ASCII、拉丁补充、常用标点、箭头/符号区、CJK 统一表意文字与全角形式；
- `tokens.css` 改为 `woff2`；
- 删除原始 28.27 MB TTF；
- 浏览器实测字体传输 6.24 MB，`document.fonts.check` 对中文和全部 UI 符号返回 `true`，无控制台错误。

### 8.3 本轮验证

- `node --check`：30 个应用 JS 通过；
- ESLint：0 error / 0 warning；
- 行高缓存/换行对齐/文本模式行高专项浏览器测试通过；
- 字体加载与上传页/编辑器截图正常。


## 9. 交付

- 最终项目：`BlockFlow/blockflow`
- 交付包：`BlockFlow_round3_cleaned.zip`（7.03 MB）
