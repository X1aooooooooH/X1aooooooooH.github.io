# 项目书写规范（五条硬规则）

所有给这个项目写的指令都要满足下面五条。`mcbe.js check --only style` 会检查 1–4 条。

## 规则 1：不用 `reset`，改 `objectives remove` + `add`

`/scoreboard players reset` 会把分数条目删掉而不是置零，还只作用于匹配到的目标。
统一改成“删目标 + 重建”：

```text
# 不写
/scoreboard players reset @a vip
/scoreboard players reset * menu

# 写
/scoreboard objectives remove vip
/scoreboard objectives add vip dummy
```

- 只有在**整张表都要清空**时用这招；单点清零用 `set @p vip 0`。
- `remove` 会让所有玩家、假玩家的该分数一起消失，这正是“重置”的语义。
- 重建时类型默认 `dummy`；如果原来是别的类型（如 `health`），要显式写回。
- 重建后要立刻补上初始值，否则接下来的 `test`/`remove` 会因为分数不存在而失败。

## 规则 2：选择器参数能少则少

```text
# 不写
@a[type=player,name="Steve",tag=vip,scores={menu=1..},rxm=88,ry=0,rym=90]

# 写
@a[tag=vip]
```

优先级：`tag` > `scores` > 其他。能用 tag 表达的，绝不堆三个参数；能用
`scores={x=1..}` 表达的，不要再用 `rx/ry` 重复限定。

- 同一条件不要在链条里反复写：用条件命令方块（`conditional_bit=1`）继承上一条的结果。
- 需要“非”条件时用 `tag=!x`、`scores={x=!0}`，不要写成两条相反的选择器。
- 选择器参数越少，匹配越快，出错面越小。

## 规则 3：少用 `as`，但**不要**用 `if entity` 顶替

```text
# 不写
/execute as @a run /execute as @s run /say hi

# 写
/tellraw @a {"rawtext":[{"text":"hi"}]}
```

```text
# 不写（as 只是为了让命令作用于玩家）
/execute as @a run /title @s actionbar {"rawtext":[{"text":"x"}]}

# 写
/title @a actionbar {"rawtext":[{"text":"x"}]}
```

关键区别：`as` 改变执行者、影响 `@s`、`^` 坐标与权限；`if entity` 只是判断存在，
**不会**改变上下文。所以“把 as 换成 if entity”在语义上是错的，正确做法是：

| 想做的事 | 正确写法 |
|---|---|
| 让命令作用于一群实体 | 直接把选择器写进命令：`/tag @a[tag=x] add y` |
| 需要实体位置 | `execute at @e[…]`（at，不是 as） |
| 需要实体朝向 | `execute rotated as @e[…]`（这是 nx 树的分叉点，保留） |
| 需要“存在才执行” | 条件命令方块，或 `execute if entity … run …` |
| 需要实体自己当执行者改自己的分数 | `execute as @p run scoreboard … @s …`（确实需要时才用） |

一条 execute 里 `as` 出现次数 ≤ 1；能不写就不写。

## 规则 4：少用 `/execute`

`execute` 是手段，不是目的。能用原生命令的选择器参数解决的，就不要包一层：

```text
# 不写
/execute as @a[scores={menu=1}] run /say hello
/execute if entity @a[tag=vip] run /say vip

# 写
/say hello                 # 但会广播给所有人，需要限定目标时用下一行
/tellraw @a[scores={menu=1}] {"rawtext":[{"text":"hello"}]}
```

常见替代：

| 原写法 | 替代 |
|---|---|
| `execute as @a run tag @s add x` | `tag @a add x` |
| `execute as @a run scoreboard players add @s x 1` | `scoreboard players add @a x 1` |
| `execute as @a at @s run tp @s …` | `tp @a …`（相对坐标按各自位置算） |
| `execute as @a run effect @s speed …` | `effect @a speed …` |
| `execute if entity @e[tag=x] run …` | 条件命令方块 + `testfor @e[tag=x]` |
| `execute as @e[tag=x] run kill @s` | `kill @e[tag=x]` |

保留 `execute` 的场合：需要 `positioned`/`rotated`/`anchored`（nx 树）、需要
`if score`/`if block` 做分支、需要把执行位置搬到实体处再跑相对坐标命令。

## 规则 5：测试链

用户要测试时，交付**一条脉冲链**，满足：

1. 只有一个链头（脉冲命令方块），链身全是连锁方块。
2. 第一次按下 = 初始化：删表重建、写欢迎语、`test=1`。
3. 之后每按一次：**先判定上一组**，再运行下一组，`test` 自增。
4. 每组样例都用 `tellraw` 说明：名称、做了什么、期望值、实际值、判定。
5. 判定不依赖可能失败的命令（否则条件链会断），用计分板算术算成 `1/0`。
6. 最后一组之后输出汇总，并把计分板删掉，下一次按下重新初始化。

生成器：

```bash
node scripts/mcbe.js test --spec cases.json --out bench.mcstructure
```

`cases.json` 结构：

```json
{
  "title": "样例回归测试",
  "objective": "test",
  "cases": [
    {
      "name": "加分",
      "note": "初始 5，加 3，期望 8",
      "setup": ["scoreboard players set @p test_val 5"],
      "run": ["scoreboard players add @p test_val 3"],
      "expect": {"objective": "test_val", "value": 8}
    },
    {
      "name": "手动指标",
      "run": ["scoreboard players add @p test_val 1"],
      "metrics": [{"label": "当前值", "objective": "test_val"}]
    }
  ]
}
```

- `expect` 存在 → 自动判定，输出 `1`（通过）/`0`（失败）。
- 只有 `metrics` → 把分数打给用户，自行判断。
- `setup` 在判定期之外，`run` 是被测命令本身。
