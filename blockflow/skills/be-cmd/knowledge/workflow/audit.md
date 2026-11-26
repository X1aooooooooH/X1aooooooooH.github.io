# 全量检查（check）

`mcbe.js check` 把四层检查一次跑完，并按类别汇总：

```bash
node scripts/mcbe.js check main.mcstructure --report audit.md
node scripts/mcbe.js check main.mcstructure --json      # 给脚本用
node scripts/mcbe.js check main.mcstructure --verbose   # 连 info 一起打印
node scripts/mcbe.js check main.mcstructure --strict    # 有 error 时退出码 1
node scripts/mcbe.js check main.mcstructure --only chain   # 只看一组（syntax/chain/style/system）
```

| 层 | 查什么 | 典型问题 |
|---|---|---|
| 语法 | 命令名、参数、坐标、选择器参数、execute 子命令、rawtext JSON、原版 ID | 拼错、缺参数、Java 专属写法 |
| 链 | 断链标记、marker 模板、条件位、重复循环方块、空命令方块、自闭环 | 链断了、标记朝向错 |
| 风格 | 规则 1–4：`reset`、选择器参数过多、`as` 过多、`execute` 过密 | 写法不合项目规范 |
| 系统 | 结构级一致性（见下） | 表没建、常量没赋值、tag 泄漏 |

## 系统级检查清单

| code | 级别 | 含义 |
|---|---|---|
| `objective-missing` | error | 命令引用了某个计分板，但全结构没有 `objectives add` |
| `constant-missing` | error | 读了 `X settings` 却没有任何地方给 `X` 赋值 |
| `divide-by-zero` | error | 对值为 0 的常量做 `/=` 或 `%=` |
| `tag-leak` | warn | tag 只 `add` 从未 `remove`，会一直挂在实体上 |
| `tag-orphan` | info | tag 只 `remove` 从未 `add`，清理是空转 |
| `objective-unused` | info | 建了表但没人用（通常是没写完的系统） |
| `constant-unused` | info | 常量赋了值但没人读 |
| `value-dead` | info | 某个分数被赋了值，但没有任何选择器判定它（死状态） |
| `duplicate-command` | info | 同一条链里出现完全相同的命令（可能复制粘贴重复） |

### 判定口径

- **objective / constant 使用**：按名字在命令里出现来算——`players` 的第三个参数、
  `scores={x=..}` 的键、`if score ... obj`、`operation` 的源操作数（`= @s b` 里的 `b`），
  以及 `tellraw/titleraw` 的 `{"score":{"objective":"x"}}` 组件。
- **objective 定义**：只有 `objectives add` 算定义；被引用但没定义是 error。
- **value-dead**：只统计字面量赋值（`players set <t> <obj> <n>`），再和
  `scores={obj=a..b}`、`if score ... matches` 的区间比对；被区间覆盖才算“可达”。
- **tag 生命周期**：全结构统计 add/remove 次数，不看执行顺序。
- **duplicate-command**：同一链内完全相同（含空格）的命令。

## 怎么读报告

1. 先看 `error`：`objective-missing` / `constant-missing` 一定是漏了初始化；
   `divide-by-zero` 会让整条链的后续运算失效。
2. 再看 `warn`：`tag-leak` 要补 remove；`empty-command` 先当缺陷查——空命令方块
   多半是命令被清空，而不是占位（占位要显式标 `[?]`）。
3. `info` 里最有用的是 `objective-unused`——建了表没用，通常说明某套系统没接完。
4. 风格类 warn 会很多（尤其是位置编码这类必须多参数的选择器），看计数不看单条；
   `knowledge/systems/index.md` 末表列了哪些是“已知但不算缺陷”。

## 知识文件自检

知识文件里的 `/` 命令行有独立门禁，修改后运行：

```bash
node scripts/mcbe.js selftest --docs
```

它扫描 `knowledge/` 与根目录 `SKILL.md` 中的命令示例；行尾注释、括号注记会先剥掉再判定。
