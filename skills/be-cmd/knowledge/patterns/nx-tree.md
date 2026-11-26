# n 叉树（nx 树）指令遍历

“n 叉树”是基岩版用**执行上下文本身**当数据结构的遍历技巧：一条 `execute` 里反复
堆叠 `positioned ^^^d` 与 `rotated as @e[…​]`，每多一层，执行位置就按匹配到的实体数
分叉一次。位置数量指数增长，命令长度只线性增长——所以能用极少的命令方块枚举出
分形、射线、点阵、地块。

## 1. 核心机制

```text
execute as @a at @s anchored eyes      （片段：run 及之后的命令省略）
  positioned ^^^8
  rotated as @e[tag=dir]
  positioned ^^^4
  rotated as @e[tag=dir]
  positioned ^^^2
  run particle minecraft:endrod
```

- `positioned ^^^d`：沿**当前朝向**前进 d 格（局部坐标）。
- `rotated as <选择器>`：把执行朝向换成实体的朝向；选择器命中 n 个实体，后面的子命令
  就执行 n 次——这就是“分叉”。
- `anchored eyes`：把原点从脚部抬到眼睛高度，射线类效果必加。
- 树的深度 = 重复的 `positioned/rotated` 对数；广度 = 每次 `rotated as` 命中的实体数。

位置总数 ≈ n^深度。4 层、每层 2 个朝向载体 = 16 个落点，而命令仍只有一条。

## 2. 朝向载体

分叉需要“方向源”。常用：

| 载体 | 用法 |
|---|---|
| 玩家自己 | `rotated as @p`（不分支，只继承视角） |
| 带 tag 的实体 | `rotated as @e[tag=dir]`（按数量分支） |
| 盔甲架 | 预先摆好朝向，`summon armor_stand ... {Rotation:[...]}` |
| 拴绳结/雪球 | 命中点当下一级原点（配合 `at @e`） |

只用一个 tag，不要 `type=+name=+tag=` 叠参数——选择器越短越好。

## 3. 经典用法

### 3.1 射线 / 直线

```text
execute as @p at @s anchored eyes positioned ^^^8 rotated as @p positioned ^^^4 run particle minecraft:endrod
```

### 3.2 从命中点继续（穿墙判定）

```text
execute as @e[type=fishing_hook] at @s run tag @e[c=2] add gun
execute as @e[tag=gun] at @s rotated as @p run tp @s ^^^40 facing ^^^-10
```

先让“枪口实体”对准玩家反方向，再用它当下一级的 `rotated as` 源。

### 3.3 分形 / 点阵（不同步长）

```text
positioned ^^^8 rotated as @e[tag=d] positioned ^^^4 rotated as @e[tag=d] positioned ^^^2 rotated as @e[tag=d] positioned ^^^1
```

步长 8→4→2→1 是二进制细分，落点形成网格/分形。

### 3.4 地块枚举（色盲派对）

```text
execute as @e[tag=cell] at @s unless block ~~~ air run setblock ~~~ ...
```

把 `positioned` 枚举出的位置再交给 `unless block` 剪枝，只保留空气格。

## 4. 剪枝

树越大越要在**深层**剪枝，否则开销指数爆炸：

```text
... positioned ^^^4 unless block ~~~ air positioned ^^^2 ...
```

- `unless block ~~~ air`：只走非空气。
- `if entity @e[type=leash_knot,r=0.15]`：命中点附近有标记才继续。
- `c=1` / `c=2`：限制分支数，n 叉树默认每层全展开。

## 5. 与执行器的关系（对齐本项目规则）

| 写法 | 评价 |
|---|---|
| `execute as @a at @s positioned ...` | `as` 一次即可，后续用 `positioned` 推 |
| 每层都 `as @e[...]` | 贵；能用 `rotated as` / `at @e` 就不要 `as` |
| 多条 `execute` 各自 `as` | 合并成一条 execute 的多层子命令 |
| 用 `if entity` 代替 `as` | **不行**：`as` 改变执行者与上下文，`if entity` 只是条件 |

经验：**一条 execute 里 `as` 只出现一次**（最外层确定执行者），分叉靠
`rotated as` 与 `at @e`。

## 6. 性能与长度

- 深度每 +1，执行次数乘以分支数；4~6 层是常见上限。
- `positioned` 每层只加 ~20 字符，命令方块文本上限很长，但可读性会迅速下降，
  超过 6 层建议拆成两条链。
- 循环方块里跑 nx 树要控制频率：每 2~4 tick 一次通常够。
- 实体数量是主要成本；用完立刻 `tag remove` / `kill`。

## 7. 坑

| 现象 | 原因 |
|---|---|
| 只有一条线 | 方向源只有一个实体，`rotated as` 没分叉 |
| 落点全重叠 | 每层 `positioned` 的步长是 0，或 `rotated as` 用的是同一个朝上实体 |
| 位置偏移一格 | 忘了 `anchored eyes`，或把 `^^^` 当成了世界坐标 |
| 命令执行超时 | 分支爆炸；加 `c=` 或深层剪枝 |
| 链断了 | execute 子命令超过上限；拆成两条命令方块 |
