# 接手流程：先分类请求，再走固定管线

同一个技能要接七类请求。先判断属于哪一类，再照对应的管线走；不要一上来就写命令。
所有管线最后都过同一组门禁。

## 0. 通用门禁（每条管线收尾都跑）

```bash
node scripts/mcbe.js check FILE --strict                 # 四组全过：0 error
node scripts/mcbe.js verify FILE                         # OK
node scripts/mcbe.js check FILE --only syntax --strict   # 只查语法
node scripts/mcbe.js check FILE --only style  --strict   # 只查风格（rule2 结构性参数除外）
node scripts/mcbe.js selftest                            # 48/48
node scripts/mcbe.js selftest --docs                     # 改了 AI 知识规则才需要
```

文本（`.txt`）和结构（`.mcstructure`）走同一套命令，`check` 都认；文本只跑语法 + 风格两组。

---

## 1. 用户给指令文本或结构文件：读入 → 修复 → 重新导出

### 1.1 先过机器门禁，不做人工判断

```bash
node scripts/mcbe.js check main.mcstructure --report audit.md   # 结构
node scripts/mcbe.js check cmds.txt --only syntax --strict       # 文本
node scripts/mcbe.js ids --search  <可疑 id>                      # ID 拼写
```

`check` 一次跑完 语法 / 链 / 风格 / 系统 四组检查，**先看 error，再看 warn**。
warn 里的 `unknown-sound`、`tag-leak` 之类要先对 `knowledge/systems/index.md` 末表，
确认不是“已知但不算缺陷”再动手。

### 1.2 按系统切开

一条结构里通常混着几个系统。切分依据（组合使用）：

- 链头条件：`testfor @a[tag=…]` / `[scores={…}]` 同属一个状态机的归一组；
- 共享的 objective、`settings` 常量、tag 前缀；
- 时间基准：每 tick / 每分钟 / 每日。

产出一张表再动手：

| 系统 | 链号 | 触发 | 状态变量 |
|---|---|---|---|
| 在线与进服 | 4 | `tag=online_join` | `online_sum/ttl/cur` |
| 位置编码 | 9 | `tag=pos` | `pos_x/y/z/dim` |

### 1.3 逐系统做逻辑检查

机器能查的交给 `check`，人要看的是下面这些：

| 检查 | 典型症状 | 谁报 |
|---|---|---|
| 初始化完整 | 用了 `const_7` 但从没赋值；objective 没建 | `check` 系统组 |
| tag 生命周期 | 只 add 不 remove（leak）、只 remove 不 add（orphan） | `check` |
| 分数覆盖 | 写进来从不判定（value-dead）、读了从没写过 | `check` |
| 复位时机 | 每 tick 该清的没清，状态跨 tick 泄漏 | 人工 |
| 条件链时序 | 前一条改了选择器集合，后一条结果就变了 | 人工 |
| 执行者 | `@s` 用在没有 `as` 的上下文；`as` 对象不是要操作的那个 | 人工 |
| 键位/ID | 音效、粒子、effect 拼错 | `check --only syntax` + `ids` |

**判断标准**：以服务器实际运行的 `main.mcstructure` 为准；AI 知识文件（`knowledge/systems/*.md`）记录系统约定，两者不一致时先查是谁漂移了（链 9 的 `tp32` 就是
结构被清空、知识文件还留着）。

### 1.4 按五条规则重写

`knowledge/commands/style-rules.md`。机械部分直接跑：

```bash
node scripts/mcbe.js check cmds.txt --fix --out fixed.txt
```

### 1.5 重新导出成 BlockFlow 格式

```bash
node scripts/mcbe.js build --text fixed.txt --out out.mcstructure --head testfor --head-command "/testfor @a" --format new
node scripts/mcbe.js layout in.mcstructure --out out.mcstructure --format new
```

导出前确认三件事：断链标记原样、链整体摆到 -Z、X 跨度 >64 时只在链之间分片。
相对坐标见下一节。

---

## 2. 相对坐标与 -Z（每次导出都要过一遍）

判定顺序（规范与旋转表见 `chain-rules.md` §3、§6）：

1. 找基准：`~` 相对**执行这条命令的命令方块自己**（`/setblock ~~~-1` 里的 `~~~`）。
2. 找原方向：`inspect FILE --chain N` 看链头 `facing`（0 下 / 1 上 / 2 -Z / 3 +Z / 4 -X / 5 +X）。
3. 按整链方向旋转一次。
4. 两个断链标记永远写 `~~~-1` 和 `~~~`，不随布局改写。
5. `^` 不随 `~` 走：命令方块里的 `^x^y^z` 先换算成 `~` 再旋转；
   `execute … rotated as …` 里的 `^^^d` 保持原样。
6. 只旋转一次；重排 → 导出 → 再导入若文本变了，`verify` 会报 MISSING/EXTRA。

---

## 3. 用户请求生成指令

1. **先查系统知识**：先检索 `knowledge/systems/`（12 个系统）和 `knowledge/patterns/`，不要把测试夹具当成当前系统实现。
   ```bash
   grep -rn "关键词" knowledge/systems knowledge/patterns
   ```
2. **参考现有规则 + 联网查证**：语法/ID 拿不准就 `web_search` + 官方 wiki，
   别凭记忆写。
3. **生成后过检**：`check FILE --only syntax --strict` → `check FILE --only style` → 需要时 `check FILE`。
   没过的命令不许进回复、不许进结构。

---

## 4. 用户请求生成测试组

1. 读**上下文里最后一版**指令（当前对话最近给出的那份），没有就问。
2. 按逻辑拆 case：每个 case = 前置状态 + 动作 + 期望结果。
3. 用单脉冲测试台：

```bash
node scripts/mcbe.js test --spec cases.json --out bench.mcstructure --plan
```

第一次按下初始化，之后每次按下判上一组、跑下一组；每个 case 有一条 `tellraw` 说明，
通过/失败写成 `1/0` 分数。`case` 的字段见 `knowledge/commands/style-rules.md`。

---

## 5. 用户请求获取 ID

```bash
node scripts/mcbe.js ids --list
node scripts/mcbe.js ids --category effect --search 速度
node scripts/mcbe.js ids --search 僵尸
```

不要猜、不要编。ID 拼错在内置表里是 error（原版枚举）或 warn（附加包可扩展）。

---

## 6. 用户请求教学指令

- 命令签名唯一权威来源：`scripts/lib/catalogue.js`；
- 文字讲解：`knowledge/commands/command-syntax.md`（选择器、分数、execute、titleraw）；
- 易错点：`knowledge/commands/pitfalls.md`；
- 每个例子都先过 `check --only syntax`。

---

## 7. 用户请求评价指令系统

1. `check` 出报告，按 语法/链/风格/系统 四组给结论；
2. 补人工判断：哪些是结构性必需（rule2 参数）、哪些是真缺陷；
3. 输出“可保留 / 建议修改 / 风险”三类，每条带位置和改法。

---

## 8. 断链细分：把玩家给的内容重新分链

“加断链”不等于“一条链一个头”。玩家的内容里往往有好几条逻辑上可以合并的链，也存在
一条链长到触发就卡的链。细分就是在两端之间选：

- **合并**：常驻循环方块变少（常态省），但触发时一次跑完的峰值变长（瞬间卡）。
- **拆分**：峰值变短、可按条件分别触发，但多一个循环方块常驻，而且拆开的两段**不保证
  同一 gt 完成**（基岩版多个循环方块同 tick 抢执行预算，顺序不保证），原本一 gt 做完的
  事可能拖到下一 gt。

### 8.1 先让工具把可决策的东西提取出来

```bash
node scripts/mcbe.js group main.mcstructure --split-at 96 --report group.md
```

输出四块：

1. **每条链**：类型、方块数、命令数、空块、触发；
2. **同目标的链**：同一个选择器读同一组 objective 的链（`@a[scores={menu=…}]` 这种），
   给出「现状 n 个循环方块 / 峰值 X」与「合并后 1 个 / 峰值 Y」，并标注区间是互斥还是重叠；
3. **超出阈值的链**：命令数 > `--split-at` 的链，给出建议段数；
4. **要作者决定的问题**：每条候选一句话，带代价数字。

### 8.2 判据（用频率把“峰值”算成“平均负载”）

| 触发频率 | 单次可接受峰值 | 说明 |
|---|---|---|
| 每 tick | ≤ 32 | 常驻负载 = 峰值，最贵 |
| 玩家动作 / 每秒 | ≤ 96 | 平时不跑，峰值可稍大 |
| 每分钟 | ≤ 160 | 平均负载低 |
| 每日 / 一次性 | 不限 | 卡一下无所谓 |

平均负载 ≈ Σ(触发频率 × 该链命令数)；稳态开销 = 循环方块个数（每个每 tick 一条 testfor）。
两个数字都算出来给用户看，而不是只给“建议合并”。

### 8.3 不能合并 / 不能拆的硬条件

- 触发频率不同（一条每 tick、一条每日）——合并后高频会拖着低频内容一起跑；
- 区间重叠（`menu=1..` 覆盖 `menu=17..23`）——合并必须先重写条件，否则语义变了；
- 有同 gt 顺序依赖（前一条改状态、后一条读）——拆开就跨 gt，必须保留在一条链里；
- 拆分点压在状态机中间（分数读到一半、tag 刚 add 还没 remove）——只能切在阶段边界；
- 单链拆出来的段数 > 2 时，先确认用户的机器扛得住几个循环方块。

### 8.4 向用户提问的固定六问

1. 每条链的触发频率分别是多少？
2. 合并后是否要求同一 gt 内全部完成（有没有顺序依赖）？
3. 单次触发可接受的命令数上限（默认 96）？
4. 拆出来的链允许同 gt 并行（常态多一个循环方块）吗？
5. 拆分点是否压在逻辑阶段边界上？
6. 触发后允许延迟 1 gt 吗？

先给候选表 + 代价数字 + 这六问，等用户拍板再动手；不要自作主张合并或拆。

### 8.5 一次生成多条断链链：`build` 的多链文本

细分方案定下来后，用一份带 `#@ head` 指令的文本一次生成整组链（`build` 会自动识别多链格式）：

```text
#@ name 菜单打开
#@ head /testfor @a[scores={menu=1..}]
/say menu open
[c] /scoreboard players set @s menu_open 1

#@ name 传送
#@ head /execute as @e[tag=tp_que] run /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/say tp
```

- `#@ name`：给**下一条**链起名，可省；
- `#@ head`：开一条新链。`/testfor …` → testfor 断链头（自动补两个标记）；
  `/execute … run /setblock ~~~-1 …` → execute 断链头（自动补一个标记）；其他命令 →
  普通脉冲链；
- `[c]` 前缀 = 条件命令方块；`#` 开头是普通注释。

```bash
node scripts/mcbe.js build --text plan.txt --out plan.mcstructure
```

execute 头的 `run` 之前不能出现 `at @`（那会变成普通命令，见 chain-rules §2），
`build` 遇到会直接报错。生成后照样 `check` + `verify`。

### 8.6 动手时的操作序列

只维护一份：`chain-rules.md` §2「加/拆断链的步骤」与 §3。这里不再重复。
