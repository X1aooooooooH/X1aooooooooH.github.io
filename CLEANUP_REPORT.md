# BlockFlow 死代码清理记录

本次以 `BlockFlow_modified.zip`（上一轮确认的最新修改版）为清理基线。

## 已清理

- 删除静态引用检查确认无调用的 JavaScript 函数/变量，包括旧的未保存状态辅助函数、旧工作区辅助函数、未使用的 AI 会话辅助函数，以及局部未使用变量。
- 删除 HTML、JavaScript 和项目资源中均无引用的旧 CSS 选择器规则，覆盖 `ai.css`、`components.css`、`editor.css`、`upload.css`、`workspace.css`。
- 保留所有无法证明完全无用的运行时文件、技能数据、命令 ID 数据、Three.js 离线依赖、字体、图标、许可证及文档，避免破坏动态加载、AI 技能回退和 CLI 工具。

## 验证

- 全部 JavaScript 文件通过 `node --check`。
- 全部 CSS 文件通过 CSS 解析检查。
- HTML 中引用的本地脚本、样式和资源均存在。
- CSS 静态扫描未发现仍然没有源码引用的类选择器。
- `blockflow/skills/be-cmd` 自检：48/48 项通过。

## 清理边界

本次采用保守静态清理：不删除仅因静态扫描无法追踪而可能由运行时路径、数据文件或 CLI 加载的资源；也不重构仍在使用的业务逻辑。对依赖真实浏览器交互才能确认的流程，仍建议在实际页面中做一次回归测试。
