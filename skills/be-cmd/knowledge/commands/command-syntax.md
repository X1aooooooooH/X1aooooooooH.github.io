# 基岩版指令速查

> 逐命令的可机读签名唯一来源是 `scripts/lib/catalogue.js`；`scripts/lib/syntax.js` 使用该定义执行检查。本文件保存语法语义与组合规则，供 AI 检索。

以 1.20 / 1.21 现行语法为准。命令方块里的命令带不带 `/` 都能执行；写在 `.mcfunction`
或聊天栏时带 `/`。

## 1. 坐标

| 写法 | 含义 |
|---|---|
| `10 64 -3` | 绝对坐标 |
| `~ ~1 ~` | 相对命令方块自身，`~1` = +1 格 |
| `^ ^ ^1` | 相对**视线方向**（局部坐标），`^1 ^ ^` = 右方 1 格 |

命令方块里常用 `~ ~ ~`、`~~~-1`。注意空格写法与紧凑写法等价，但**坐标之间必须有
分隔**，`~~~-1` 是合法的紧凑三元组。

## 2. 选择器

```text
@a  所有玩家      @p  最近玩家      @r  随机玩家
@s  执行者自身    @e  所有实体      @initiator（NPC 对话内）
```

> 基岩版语义差异：`@a` **包含已经死亡、还没重生的玩家**；`@e[type=player]`
> 只包含活着的玩家。两者的差集常用来检测死亡（见 `special-patterns.md` §5）。

常用参数（都是方括号里的逗号分隔项）：

| 参数 | 例子 | 说明 |
|---|---|---|
| `type` | `type=snowball` | 实体类型，支持 `type=!zombie` |
| `name` | `name="Steve"` | 名称，含空格要引号 |
| `tag` | `tag=vip` / `tag=!vip` | 计分板外的第二种标记 |
| `scores` | `scores={menu=1..5,vip=!0}` | 分数区间，`..` 表示开区间端点 |
| `rx/rxm` | `rxm=88` | 垂直视角（-90..90），`rx=-88` 等 |
| `ry/rym` | `ry=0,rym=90` | 水平朝向 |
| `r/rm` | `r=10,rm=5` | 半径范围 |
| `x,y,z,dx,dy,dz` | `x=0,y=64,z=0,dx=10` | 体积范围 |
| `m` | `m=!creative` | 游戏模式 |
| `c` | `c=1` | 数量限制（配合 @e/@a 排序） |
| `hasitem` | `hasitem={item=diamond,quantity=1..}` | 背包物品 |
| `family` | `family=monster` | 实体族 |
| `slot` | `slot.weapon.mainhand` | 配合 `replaceitem`/`hasitem` |

**基岩版没有 `nbt=` 选择器参数**，不要照搬 Java 写法。

## 3. 计分板

```text
/scoreboard objectives add vip dummy "VIP"
/scoreboard objectives list
/scoreboard objectives remove vip
/scoreboard objectives setdisplay sidebar vip
/scoreboard objectives setdisplay list vip
/scoreboard objectives setdisplay belowname vip

/scoreboard players set @a vip 0
/scoreboard players add @a vip 1
/scoreboard players remove @a vip 1
/scoreboard players reset @a vip      # 语法合法，但项目规则 1 禁用（见 style-rules.md）
/scoreboard players get @a vip
/scoreboard players test @a vip 1 10
/scoreboard players random @a vip 1 100
/scoreboard players operation @a vip = @a online_min
/scoreboard players operation @a vip += #global vip
```

基岩版的 `objectives add` 固定使用 `dummy`；其他 Java 版计分板类型不属于基岩版语法。

- 假玩家用 `#` 前缀（`#global`、`#timer`）是社区惯例，不会被玩家选择器命中。
- 目标名（objective）只能包含字母、数字、下划线，最长 16 字符。
- `scores={x=..5}` 表示 ≤5，`scores={x=5..}` 表示 ≥5，`scores={x=!5}` 表示 ≠5。
- 计分板分数是 32 位有符号整数，溢出会回绕。

## 4. execute

现行语法（1.19.80+）是子命令链，最后必须 `run`：

```text
/execute as @a at @s run /say hi
/execute as @a[scores={menu=1}] at @s run /tp @s ~ ~1 ~
/execute if entity @a[tag=vip] run /say 有 VIP
/execute unless score @s vip matches 0 run /say 非零
/execute if score @s vip >= #lim vip run /say 达标    # 比较式也成立
/execute if block ~ ~-1 ~ minecraft:stone run /say 站在石头上
/execute positioned as @a run /setblock ~ ~ ~ stone
/execute align xyz positioned ~ ~ ~ run /summon lightning_bolt ~ ~ ~
/execute as @e[type=zombie] at @s run /particle minecraft:explosion_particle ~ ~1 ~
```

要点：

- `as` 改变执行者，`at` 改变位置/朝向，`positioned` 只改位置。
- `if`/`unless` 后面可以接 `entity`、`block`、`blocks`、`score`、`biome`（版本相关）。
- **`at @` 出现在 `run` 之前时，这条命令不是断链头**（BlockFlow 规则的判断点）。
- 旧语法 `/execute @a ~ ~ ~ say hi` 在 1.19.80 之后被移除；网易旧版仍在使用。

## 5. 文本输出

`/tellraw` 与 `/titleraw` 都要求 `rawtext` JSON：

```text
/tellraw @a {"rawtext":[{"text":"§a提示：§f你好"}]}
/titleraw @a title {"rawtext":[{"text":"§6标题"}]}
/titleraw @a subtitle {"rawtext":[{"text":"§7副标题"}]}
/titleraw @a actionbar {"rawtext":[{"text":"§e分数：§f"}]}
```

组合组件：

```json
{"rawtext":[
  {"text":"§a[系统] §f"},
  {"selector":"@s"},
  {"text":" 的分数是 "},
  {"score":{"name":"@s","objective":"vip"}},
  {"text":"\n"},
  {"translate":"%multiplayer.player.joined","with":["Steve"]}
]}
```

可点击：

```json
{"rawtext":[{"text":"§b[点击传送]","clickEvent":{"action":"run_command","value":"/tp @s 0 64 0"},"hoverEvent":{"action":"show_text","contents":{"rawtext":[{"text":"传送到主城"}]}}}]}
```

- 换行用 `\n`，颜色用 `§` + 字符（`§c` 红、`§a` 绿、`§7` 灰、`§l` 粗体、`§r` 重置）。
- `§` 在 JSON 里直接写即可（不需要转义成 `\u00a7`，但写成 `\u00a7` 也合法）。
- JSON 必须严格合法：不能有尾逗号、不能有注释，字符串里的引号要转义。
- 命令方块里的双引号不需要额外转义；但如果用 `.mcfunction` 或命令参数嵌套，注意
  转义层级。

## 6. 常用命令

签名（参数顺序、可选值）以 `scripts/lib/catalogue.js` 为准，
和检查器同源。这里只给能直接跑的例子：

```text
/setblock ~ ~ ~ stone
/fill ~ ~ ~ ~5 ~ ~ stone hollow
/clone ~ ~ ~ ~5 ~5 ~5 ~ ~10 ~
/structure save myslot ~ ~ ~ 10 10 10
/structure load myslot ~ ~ ~
/structure delete myslot
/tickingarea add ~ ~ ~ ~10 ~10 ~10
/tickingarea remove myarea
/gamerule doDaylightCycle false
/time set day
/weather clear 1000
/tag @a add vip
/effect @a speed 10 2 true
/gamemode survival @a
/tp @s 0 64 0
/summon minecraft:armor_stand ~ ~1 ~
/playsound random.levelup @a
/particle minecraft:huge_explosion_emitter ~ ~ ~
/replaceitem entity @a slot.hotbar 0 diamond 1
/clear @a minecraft:dirt
/damage @s 5
/xp 10 @a
```

## 7. 版本与网易差异

| 项 | 现行基岩版 | 网易旧版 |
|---|---|---|
| execute | 子命令 + `run` | `execute <目标> <坐标> <命令>` |
| testfor | 仍可用（做断链头） | 常用 |
| title/tellraw | `titleraw`/`tellraw` + rawtext | 同，但部分 JSON 组件缺失 |
| 结构文件 | `format_version=2` | 常见 `format_version=1` |
| 坐标写法 | `~ ~1 ~` 与 `~~~1` 都行 | 多用 `~~~1` |

写新东西时默认用现行语法；只有明确面向网易版时才用旧 `execute` 语法，并在
BlockFlow 里把导出格式选成“网易版”。

## 8. 命令方块本身

| 类型 | 触发 | 用途 |
|---|---|---|
| 脉冲 `command_block` | 红石一次 | 链头，一次性逻辑 |
| 循环 `repeating_command_block` | 每 tick（20 次/秒） | 链头，轮询条件 |
| 连锁 `chain_command_block` | 前一个执行后 | 链身 |

- `条件`（conditional）为真时，只有前一个方块执行成功才运行。
- `保持开启`（auto / 无需红石）只对循环方块有意义。
- 循环方块 + `testfor` 是最常见的“轮询触发器”：条件不满足时后续连锁全部跳过。
