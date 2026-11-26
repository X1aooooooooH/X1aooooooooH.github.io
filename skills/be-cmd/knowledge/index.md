# AI 知识索引

用途：仅供 AI 在处理 Minecraft 基岩版命令、命令方块链、`.mcstructure` 与 BlockFlow 项目时检索。此目录不是面向用户的产品文档。项目指令入口为根目录 `SKILL.md`。

| 路径 | AI 知识范围 | 检索入口 |
|---|---|---|
| `workflow/` | 接手顺序、请求路由、审计报告解释 | `intake.md`、`audit.md` |
| `commands/` | 基岩版命令参数签名、语法、风格约束、易错点 | `command-syntax.md`、`style-rules.md`、`pitfalls.md` 和 `scripts/lib/catalogue.js` |
| `structure/` | `.mcstructure` 格式、断链标记、链布局与坐标规则 | `mcstructure-format.md`、`chain-rules.md` |
| `patterns/` | FMBE、nx树、计分板 UI 和特殊命令组合 | 对应主题文件 |
| `systems/` | 用户服务器已有系统、变量、状态机和链逻辑 | `systems/index.md` 与编号文件 |

## 事实来源优先级

1. 当前对话中用户提供的最新结构、命令与明确规则。
2. `data/ids/*.txt`：原版 ID 清单。
3. `scripts/lib/catalogue.js`、`syntax.js`、`chain.js`、`format.js` 等程序源代码：工具真实实现。
4. 本目录中的规则文件：项目约定、历史系统设计和分析流程。

冲突时不得静默覆盖用户最新要求；应指出冲突并以当前明确要求为准。ID 不得依靠模型记忆猜测，应读取原始清单或调用 `ids` 查询。
