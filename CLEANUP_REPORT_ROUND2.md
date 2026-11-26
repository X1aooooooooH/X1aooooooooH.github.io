# BlockFlow 第二轮死代码清理报告

## 清理基线

本轮以 `BlockFlow_cleaned.zip`（第一轮清理后的项目）为唯一输入，不回退到更早版本。

## 本轮改动

### 1. 删除无法从当前 HTML / JavaScript 找到引用的 CSS 规则

共删除 15 条过期选择器规则：

- `styles/ai.css`
  - `.ai-key-fab.configured .ai-key-fab-dot`
  - `.ai-chat-hint .ai-kbd`
- `styles/workspace.css`
  - `.editor-shell.ws-chain-expanded` 两处旧布局规则
  - `#wsChainCountToggle`
  - `.input-popover.on`、`.input-popover.above::before`
  - 旧版 `.ws-chain-mark.*` 状态样式
  - 旧版 `.ws-chain-toggle.open` 样式
  - 旧版 `.ws-textbar-inner` 下的 `chain-action-area`、`chain-action-buttons`、`ws-hidden` 组合规则
  - 旧版 overview 模式的 `chain-text-mode-btn` 规则

判断依据：这些选择器依赖的类名或 ID 在当前 `index.html` 与 `src/**/*.js` 中均找不到对应引用；保留仍有静态或动态引用的通用规则。

### 2. 重复代码检查

- 检查 `main.js`、`workspace.js`、`ai.js` 的函数声明，未发现可安全删除的零引用函数。
- 未发现函数体完全相同、可以直接合并的重复函数。
- CSS 未发现同一规则块内完全重复的声明。
- `skills/be-cmd/scripts/lib/` 与 `src/skill-runtime/lib/` 存在同内容文件，但它们分别服务 Node CLI 与浏览器技能运行时的独立路径，属于有意的运行时镜像，本轮保留，避免破坏离线浏览器环境。

## 验证

- JavaScript 语法检查：通过。
- CSS 解析检查：通过。
- `node scripts/mcbe.js selftest`：48/48 通过。
- `node scripts/mcbe.js selftest --docs`：49/49 通过，文档命令示例 0 error。

## 安全边界

本轮只删除可由静态引用证据确认的 CSS 规则。没有合并具有不同覆盖顺序的 CSS 选择器，也没有重构业务逻辑、事件监听或技能运行时副本。静态检查不能完全证明所有运行时分支均不可达，因此不对“整个项目绝无死代码”作绝对保证。
