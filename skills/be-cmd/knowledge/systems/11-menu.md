# 雪球菜单系统

- 组成：8 条链 —— 雪球发放与 tpa 序号、雪球翻页、打字机开场、主菜单与确认、坐标输入页、锚点页、申请传送页、模式菜单
- 说明：雪球翻页 + 打字机开场 + 6 页菜单（主菜单/传送/坐标输入/锚点/申请/模式）。

## 初始化（本系统自带）

### 计分板

```text
/scoreboard objectives add dir dummy
/scoreboard objectives add menu dummy
/scoreboard objectives add menu_cl dummy
/scoreboard objectives add menu_pl dummy
/scoreboard objectives add menu_pot dummy
/scoreboard objectives add menu_tpx dummy
/scoreboard objectives add menu_tpy dummy
/scoreboard objectives add menu_tpz dummy
/scoreboard objectives add pot_cdim dummy
/scoreboard objectives add pot_cx dummy
/scoreboard objectives add pot_cy dummy
/scoreboard objectives add pot_cz dummy
/scoreboard objectives add pot_ddim dummy
/scoreboard objectives add pot_dx dummy
/scoreboard objectives add pot_dy dummy
/scoreboard objectives add pot_dz dummy
/scoreboard objectives add tp_dim dummy
/scoreboard objectives add tp_que dummy
/scoreboard objectives add tp_x dummy
/scoreboard objectives add tp_y dummy
/scoreboard objectives add tp_z dummy
/scoreboard objectives add tpa dummy
/scoreboard objectives add tpa_tim dummy
```

### 全局常量（settings）

```text
/scoreboard players set const_-1 settings -1
/scoreboard players set const_10 settings 10
```

### 其他初始化

```text
/scoreboard players set tp_record tpa 100
/scoreboard players add time_rday settings 0
```

### 用到的 tag

`dir`、menu_kill`、pot_cur`

## 链 21：雪球发放与 tpa 序号

- 类型：`snake(testfor)`　命令方块：16　触发：每 tick 有玩家

**步骤**

- 3：给第 9 格补雪球（item_lock，死亡不掉）
- 4–10：tpa 序号 0..39 同步；人数变化时把 menu 31..42 拉回 30
- 11–15：重复序号修复

**可复用**

- tpa 分数 = 玩家序号，menu 31..42 直接映射到序号
- 雪球用 `replaceitem ... slot.hotbar 8`

```text
/testfor @a
[c] /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]
/replaceitem entity @a slot.hotbar 8 snowball 7 0 {"minecraft:item_lock":{"mode":"lock_in_slot"}}
/scoreboard players add @a tpa 0
/scoreboard players set online tpa 0
/execute as @a[scores={tpa=0..39}] run /scoreboard players add online tpa 1
/execute unless score tp tpa = online tpa run /scoreboard players set @a[scores={tpa=0..39}] tpa -1
/execute unless score tp tpa = online tpa run /scoreboard players operation @a[scores={tpa=-1..39}] tpa -= @a[scores={tpa=-1}] tpa
/execute unless score tp tpa = online tpa run /scoreboard players set @a[scores={menu=31..42,tpa=0..39}] menu 30
/execute unless score tp tpa = online tpa run /scoreboard players operation tp tpa = online tpa
/scoreboard players set test tpa 0
/execute as @a[scores={tpa=0}] run /scoreboard players add test tpa 1
/execute if score test tpa matches 2..40 run /scoreboard players set @a[scores={tpa=0..39}] tpa -1
/execute if score test tpa matches 2..40 run /scoreboard players operation @a[scores={tpa=-1..39}] tpa -= @a[scores={tpa=-1}] tpa
/execute if score test tpa matches 2..40 run /scoreboard players set @a[scores={menu=31..42,tpa=0..39}] menu 31
```

## 链 22：雪球翻页

- 类型：`snake(testfor)`　命令方块：16　触发：有雪球实体

**步骤**

- 3–5：确保 menu/menu_pl 存在；menu=0 且 menu_pl=0 → menu_pl=1（打开）
- 6–9：menu_pl=0 时 menu+1，播音，杀雪球
- 10–15：页尾回绕（10→2、16→12、24→18、29→26、42→31、48→44）

**可复用**

- menu 是绝对选项号，menu_pl 只是“菜单是否已打开”
- 回绕是 6 条独立 set，便于逐页调整

```text
/testfor @e[type=snowball]
[c] /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]
/execute as @e[type=snowball] at @s as @p run /scoreboard players add @s menu 0
/execute as @e[type=snowball] at @s as @p run /scoreboard players add @s menu_pl 0
/execute as @e[type=snowball] at @s as @p run /scoreboard players set @s[scores={menu=0,menu_pl=0}] menu_pl 1
/execute as @e[type=snowball] at @s as @p run /playsound break.amethyst_block @s[scores={menu=1..,menu_pl=0}]
/execute as @e[type=snowball] at @s as @p run /playsound note.bd @s[scores={menu=1..,menu_pl=0}]
/execute as @e[type=snowball] at @s as @p run /scoreboard players add @s[scores={menu=1..,menu_pl=0}] menu 1
/execute as @e[type=snowball] at @s as @p run /kill @e[type=snowball,c=1]
/scoreboard players set @a[scores={menu=10,menu_pl=0}] menu 2
/scoreboard players set @a[scores={menu=16,menu_pl=0}] menu 12
/scoreboard players set @a[scores={menu=24,menu_pl=0}] menu 18
/scoreboard players set @a[scores={menu=29,menu_pl=0}] menu 26
/scoreboard players set @a[scores={menu=42,menu_pl=0}] menu 31
/scoreboard players set @a[scores={menu=48,menu_pl=0}] menu 44
```

## 链 23：打字机开场

- 类型：`snake(testfor)`　命令方块：41　触发：menu_pl≥1

**步骤**

- 3–4：menu_pl 1..32 每秒 +1 并播放按键音
- 5–36：第 N 帧显示前 N 个字符（33 帧打出标题+首屏）
- 37–40：收尾音效、粒子，menu=2、menu_pl=0 进入主菜单

**可复用**

- 用分数当动画帧，逐帧替换 actionbar 文本
- 帧命令只差末尾几个字，可脚本生成

```text
/testfor @a[scores={menu_pl=1..}]
[c] /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]
/scoreboard players add @a[scores={menu_pl=1..32}] menu_pl 1
/execute as @a[scores={menu_pl=1..32}] at @s run /playsound ui.hardcore_toggle_press
/execute as @a[scores={menu_pl=1}] run /titleraw @s actionbar {"rawtext":[{"text":"§b◁"}]}
/execute as @a[scores={menu_pl=2}] run /titleraw @s actionbar {"rawtext":[{"text":"§b◁§7｛"}]}
/execute as @a[scores={menu_pl=3}] run /titleraw @s actionbar {"rawtext":[{"text":"§b◁§7｛§f 雪"}]}
/execute as @a[scores={menu_pl=4}] run /titleraw @s actionbar {"rawtext":[{"text":"§b◁§7｛§f 雪球"}]}
/execute as @a[scores={menu_pl=5}] run /titleraw @s actionbar {"rawtext":[{"text":"§b◁§7｛§f 雪球菜"}]}
/execute as @a[scores={menu_pl=6}] run /titleraw @s actionbar {"rawtext":[{"text":"§b◁§7｛§f 雪球菜单"}]}
/execute as @a[scores={menu_pl=7}] run /titleraw @s actionbar {"rawtext":[{"text":"§b◁§7｛§f 雪球菜单 "}]}
/execute as @a[scores={menu_pl=8}] run /titleraw @s actionbar {"rawtext":[{"text":"§b◁§7｛§f 雪球菜单 │"}]}
/execute as @a[scores={menu_pl=9}] run /titleraw @s actionbar {"rawtext":[{"text":"§b◁§7｛§f 雪球菜单 │ "}]}
/execute as @a[scores={menu_pl=10}] run /titleraw @s actionbar {"rawtext":[{"text":"§b◁§7｛§f 雪球菜单 │ Ｓ"}]}
/execute as @a[scores={menu_pl=11}] run /titleraw @s actionbar {"rawtext":[{"text":"§b◁§7｛§f 雪球菜单 │ Ｓｎ"}]}
/execute as @a[scores={menu_pl=12}] run /titleraw @s actionbar {"rawtext":[{"text":"§b◁§7｛§f 雪球菜单 │ Ｓｎｏ"}]}
/execute as @a[scores={menu_pl=13}] run /titleraw @s actionbar {"rawtext":[{"text":"§b◁§7｛§f 雪球菜单 │ Ｓｎｏｗ"}]}
/execute as @a[scores={menu_pl=14}] run /titleraw @s actionbar {"rawtext":[{"text":"§b◁§7｛§f 雪球菜单 │ Ｓｎｏｗｂ"}]}
/execute as @a[scores={menu_pl=15}] run /titleraw @s actionbar {"rawtext":[{"text":"§b◁§7｛§f 雪球菜单 │ Ｓｎｏｗｂａ"}]}
/execute as @a[scores={menu_pl=16}] run /titleraw @s actionbar {"rawtext":[{"text":"§b◁§7｛§f 雪球菜单 │ Ｓｎｏｗｂａｌ"}]}
/execute as @a[scores={menu_pl=17}] run /titleraw @s actionbar {"rawtext":[{"text":"§b◁§7｛§f 雪球菜单 │ Ｓｎｏｗｂａｌｌ"}]}
/execute as @a[scores={menu_pl=18}] run /titleraw @s actionbar {"rawtext":[{"text":"§b◁§7｛§f 雪球菜单 │ Ｓｎｏｗｂａｌｌ "}]}
/execute as @a[scores={menu_pl=19}] run /titleraw @s actionbar {"rawtext":[{"text":"§b◁§7｛§f 雪球菜单 │ Ｓｎｏｗｂａｌｌ Ｍ"}]}
/execute as @a[scores={menu_pl=20}] run /titleraw @s actionbar {"rawtext":[{"text":"§b◁§7｛§f 雪球菜单 │ Ｓｎｏｗｂａｌｌ Ｍｅ"}]}
/execute as @a[scores={menu_pl=21}] run /titleraw @s actionbar {"rawtext":[{"text":"§b◁§7｛§f 雪球菜单 │ Ｓｎｏｗｂａｌｌ Ｍｅｎ"}]}
/execute as @a[scores={menu_pl=22}] run /titleraw @s actionbar {"rawtext":[{"text":"§b◁§7｛§f 雪球菜单 │ Ｓｎｏｗｂａｌｌ Ｍｅｎｕ"}]}
/execute as @a[scores={menu_pl=23}] run /titleraw @s actionbar {"rawtext":[{"text":"§b◁§7｛§f 雪球菜单 │ Ｓｎｏｗｂａｌｌ Ｍｅｎｕ "}]}
/execute as @a[scores={menu_pl=24}] run /titleraw @s actionbar {"rawtext":[{"text":"§b◁§7｛§f 雪球菜单 │ Ｓｎｏｗｂａｌｌ Ｍｅｎｕ §7｝"}]}
/execute as @a[scores={menu_pl=25}] run /titleraw @s actionbar {"rawtext":[{"text":"§b◁§7｛§f 雪球菜单 │ Ｓｎｏｗｂａｌｌ Ｍｅｎｕ §7｝§b▷"}]}
/execute as @a[scores={menu_pl=26}] run /titleraw @s actionbar {"rawtext":[{"text":"   §b◁§7｛§f 雪球菜单 │ Ｓｎｏｗｂａｌｌ Ｍｅｎｕ §7｝§b▷"},{"text":"\n§7◇------------------§6✧§7-----------------◇§f\n"}]}
/execute as @a[scores={menu_pl=27}] run /titleraw @s actionbar {"rawtext":[{"text":"   §b◁§7｛§f 雪球菜单 │ Ｓｎｏｗｂａｌｌ Ｍｅｎｕ §7｝§b▷"},{"text":"\n§7◇------------------§6✧§7-----------------◇§f\n"},{"text":"                定点传送\n"}]}
/execute as @a[scores={menu_pl=28}] run /titleraw @s actionbar {"rawtext":[{"text":"   §b◁§7｛§f 雪球菜单 │ Ｓｎｏｗｂａｌｌ Ｍｅｎｕ §7｝§b▷"},{"text":"\n§7◇------------------§6✧§7-----------------◇§f\n"},{"text":"                定点传送\n"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={tpa=0..}]"},{"text":"                玩家互传\n"}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={tpa=..-40}]"},{"text":"                接受互传\n"}]}}]}
/execute as @a[scores={menu_pl=29}] run /titleraw @s actionbar {"rawtext":[{"text":"   §b◁§7｛§f 雪球菜单 │ Ｓｎｏｗｂａｌｌ Ｍｅｎｕ §7｝§b▷"},{"text":"\n§7◇------------------§6✧§7-----------------◇§f\n"},{"text":"                定点传送\n"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={tpa=0..}]"},{"text":"                玩家互传\n"}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={tpa=..-40}]"},{"text":"                接受互传\n"}]}},{"text":"                更改模式\n"}]}
/execute as @a[scores={menu_pl=30}] run /titleraw @s actionbar {"rawtext":[{"text":"   §b◁§7｛§f 雪球菜单 │ Ｓｎｏｗｂａｌｌ Ｍｅｎｕ §7｝§b▷"},{"text":"\n§7◇------------------§6✧§7-----------------◇§f\n"},{"text":"                定点传送\n"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={tpa=0..}]"},{"text":"                玩家互传\n"}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={tpa=..-40}]"},{"text":"                接受互传\n"}]}},{"text":"                更改模式\n"},{"text":"                快速重生"}]}
/execute as @a[scores={menu_pl=31}] run /titleraw @s actionbar {"rawtext":[{"text":"   §b◁§7｛§f 雪球菜单 │ Ｓｎｏｗｂａｌｌ Ｍｅｎｕ §7｝§b▷"},{"text":"\n§7◇------------------§6✧§7-----------------◇§f\n"},{"text":"                定点传送\n"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={tpa=0..}]"},{"text":"                玩家互传\n"}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={tpa=..-40}]"},{"text":"                接受互传\n"}]}},{"text":"                更改模式\n"},{"text":"                快速重生"},{"text":"\n§7◇------------------§6✧§7-----------------◇§f\n"}]}
/execute as @a[scores={menu_pl=32}] run /titleraw @s actionbar {"rawtext":[{"text":"   §b◁§7｛§f 雪球菜单 │ Ｓｎｏｗｂａｌｌ Ｍｅｎｕ §7｝§b▷"},{"text":"\n§7◇------------------§6✧§7-----------------◇§f\n"},{"text":"                定点传送\n"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={tpa=0..}]"},{"text":"                玩家互传\n"}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={tpa=..-40}]"},{"text":"                接受互传\n"}]}},{"text":"                更改模式\n"},{"text":"                快速重生"},{"text":"\n§7◇------------------§6✧§7-----------------◇§f\n"},{"text":"    传送至特定坐标,建筑和自定义锚点\n"}]}
/execute as @a[scores={menu_pl=33}] at @s run /playsound random.chestopen
/execute as @a[scores={menu_pl=33}] at @s run /particle minecraft:sonic_explosion ^^1.5^1
/scoreboard players set @a[scores={menu_pl=33}] menu 2
/scoreboard players set @a[scores={menu_pl=33}] menu_pl 0
```

## 链 24：主菜单与确认

- 类型：`snake(testfor)`　命令方块：40　触发：menu≥1

**步骤**

- 3–6：低头（rxm=88）关闭菜单
- 7–8：menu 1..5 / 6..9 两页主菜单（translate 条件拼接高亮）
- 9：抬头音效
- 10–11：选“定点传送”→ menu 11
- 12–14：menu=12 直接传送主城并关闭
- 15–16：menu=13 进入坐标输入（menu 17）
- 17：menu=14 进入锚点页（menu 25）
- 18–24：menu=15 死亡传送（读 pot_d* 写 tp_* 入队）
- 25–29：menu=3 申请/被申请分支
- 30：menu=4 进模式菜单（43）
- 31–39：menu=5 快速重生（临时切生存→kill→还原创造）

**可复用**

- 一页内多个选项用 `menu=1..5` + `translate %%2` 条件拼接高亮
- 确认统一用 `rx=-88` 抬头

```text
/testfor @a[scores={menu=1..}]
[c] /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]
/execute as @a[scores={menu=2..},rxm=88] run /playsound random.chestclosed
/execute as @a[scores={menu=2..},rxm=88] run /playsound random.screenshot
/execute as @a[scores={menu=2..},rxm=88] run /titleraw @s actionbar {"rawtext":[{"text":"§b◁§7｛§f 菜单关闭 │ Ｍｅｎｕ ＯＦＦ§7 ｝§b▷§f"}]}
/execute as @a[scores={menu=2..},rxm=88] run /scoreboard players set @s menu 0
/execute as @a[scores={menu=1..5}] run /titleraw @s actionbar {"rawtext":[{"text":"   §b◁§7｛§f 雪球菜单 │ Ｓｎｏｗｂａｌｌ Ｍｅｎｕ §7｝§b▷§f"},{"text":"\n§7◇------------------§6✧§7-----------------◇§f\n"},{"text":"              §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=2}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=2}]"},{"text":"▍§f "},{"text":"  "}]}},{"text":"定点传送\n"},{"text":"              §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=3}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=3}]"},{"text":"▍§f "},{"text":"  "}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=1..5,tpa=0..}]"},{"text":"玩家互传\n"}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=1..5,tpa=..-40}]"},{"text":"接受互传\n"}]}},{"text":"              §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=4}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=4}]"},{"text":"▍§f "},{"text":"  "}]}},{"text":"更改模式\n"},{"text":"              §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=5}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=5}]"},{"text":"▍§f "},{"text":"  "}]}},{"text":"快速重生"},{"text":"\n§7◇------------------§6✧§7-----------------◇§f\n"},{"translate":"%%6","with":{"rawtext":[{"selector":"@s[scores={menu=..1}]"},{"selector":"@s[scores={menu=..2}]"},{"selector":"@s[scores={menu=..3}]"},{"selector":"@s[scores={menu=..4}]"},{"selector":"@s[scores={menu=..5}]"},{"text":"           投掷雪球以进入菜单\n"},{"text":"    传送至特定坐标,建筑和自定义锚点\n"},{"text":"           申请传送至另一玩家"},{"text":"         改变您现在的游戏模式\n"},{"text":"           快速返回您的重生点\n"}]}}]}
/execute as @a[scores={menu=6..9}] run /titleraw @s actionbar {"rawtext":[{"text":"   §b◁§7｛§f 雪球菜单 │ Ｓｎｏｗｂａｌｌ Ｍｅｎｕ §7｝§b▷§f"},{"text":"\n§7◇------------------§6✧§7-----------------◇§f\n"},{"text":"              §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=6}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=6}]"},{"text":"▍§f "},{"text":"  "}]}},{"text":"签到有奖\n"},{"text":"              §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=7}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=7}]"},{"text":"▍§f "},{"text":"  "}]}},{"text":"玩家转账\n"},{"text":"              §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=8}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=8}]"},{"text":"▍§f "},{"text":"  "}]}},{"text":"连锁挖矿\n"},{"text":"              §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=9}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=9}]"},{"text":"▍§f "},{"text":"  "}]}},{"text":"个人信息"},{"text":"\n§7◇------------------§6✧§7-----------------◇§f\n"},{"translate":"%%5","with":{"rawtext":[{"selector":"@s[scores={menu=..6}]"},{"selector":"@s[scores={menu=..7}]"},{"selector":"@s[scores={menu=..8}]"},{"selector":"@s[scores={menu=..9}]"},{"text":"            领取每日签到奖励\n"},{"text":"            玩家之间相互转帐"},{"text":"           开/关连锁挖矿系统\n"},{"text":"            查看您的个人信息\n"}]}}]}
/execute as @a[scores={menu=2..,menu=!11,menu=!17,menu=!18..23,menu=!25,menu=!30..42},rx=-88] at @s run /playsound random.orb
/scoreboard players set @a[scores={menu=2},rx=-88] menu 11
/execute as @a[scores={menu=11..15}] run /titleraw @s actionbar {"rawtext":[{"text":"   §b◁§7｛§f 传送菜单 │ Ｔｅｌｅｐｏｒｔ Ｍｅｎｕ §7｝§b▷§f"},{"text":"\n§7◇------------------§6✧§7-----------------◇§f\n"},{"text":"              §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=12}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=12}]"},{"text":"▍§f "},{"text":"  "}]}},{"text":"传送主城\n"},{"text":"              §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=13}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=13}]"},{"text":"▍§f "},{"text":"  "}]}},{"text":"坐标传送\n"},{"text":"              §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=14}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=14}]"},{"text":"▍§f "},{"text":"  "}]}},{"text":"锚点传送\n"},{"text":"              §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=15}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=15}]"},{"text":"▍§f "},{"text":"  "}]}},{"text":"死亡传送"},{"text":"\n§7◇------------------§6✧§7-----------------◇§f\n"},{"translate":"%%6","with":{"rawtext":[{"selector":"@s[scores={menu=..11}]"},{"selector":"@s[scores={menu=..12}]"},{"selector":"@s[scores={menu=..13}]"},{"selector":"@s[scores={menu=..14}]"},{"selector":"@s[scores={menu=..15}]"},{"text":"           投掷雪球以进入菜单\n"},{"text":"            传送到服务器主城\n"},{"text":"         输入您想传送到的坐标"},{"text":"          设置/传送到您的锚点\n"},{"text":"             传送到死亡地点\n"}]}}]}
/tp @a[scores={menu=12},rx=-88] 0 -60 0
/execute as @a[scores={menu=12},rx=-88] run /titleraw @s actionbar {"rawtext":[{"text":"§b◁§7｛§f 传送成功 │ Ｔｅｌｅｐｏｒｔ §aＳＵＣＣＥＥＤ§7 ｝§b▷§f"}]}
/scoreboard players set @a[scores={menu=12},rx=-88] menu 0
/scoreboard players set @a[scores={menu=13},rx=-88] menu_pot 1
/scoreboard players set @a[scores={menu=13},rx=-88] menu 17
/scoreboard players set @a[scores={menu=14},rx=-88] menu 25
/execute as @a[scores={menu=15},rx=-88,c=1] run /scoreboard players operation @s tp_x = @s pot_dx
/execute as @a[scores={menu=15},rx=-88,c=1] run /scoreboard players operation @s tp_y = @s pot_dy
/execute as @a[scores={menu=15},rx=-88,c=1] run /scoreboard players operation @s tp_z = @s pot_dz
/execute as @a[scores={menu=15},rx=-88,c=1] run /scoreboard players operation @s tp_dim = @s pot_ddim
/execute as @a[scores={menu=15},rx=-88,c=1] run /scoreboard players operation @s tp_que = cnt tp_que
/titleraw @a[scores={menu=15},rx=-88,c=1] actionbar {"rawtext":[{"text":"§b◁§7｛§f 传送成功 │ Ｔｅｌｅｐｏｒｔ §aＳＵＣＣＥＥＤ§7 ｝§b▷§f"}]}
/scoreboard players set @a[scores={menu=15},rx=-88] menu 0
/scoreboard players set @p[scores={menu=3,tpa=0..39},rx=-88] menu 30
/scoreboard players set @p[scores={menu=3,tpa=..-40},rx=-88] menu 101
/execute as @p[scores={menu=3},rx=-88] run /tellraw @s {"rawtext":[{"text":"§c# §f您有尚待回应的传送请求，请先处理"}]}
/execute as @p[scores={menu=3},rx=-88] run /playsound random.anvil_land
/scoreboard players set @p[scores={menu=3},rx=-88] menu 0
/scoreboard players set @a[scores={menu=4,menu_pl=0},rx=-88] menu 43
/tag @a[scores={menu=5},rx=-88,m=c] add menu_kill
/execute if entity @a[scores={menu=5},rx=-88] run /gamerule sendcommandfeedback false
/gamemode survival @a[scores={menu=5},rx=-88,m=c,tag=menu_kill]
/kill @a[scores={menu=5},rx=-88]
/gamemode creative @a[tag=menu_kill]
/tag @a remove menu_kill
/execute if entity @a[scores={menu=5},rx=-88] run /gamerule sendcommandfeedback true
/tellraw @a[scores={menu=5},rx=-88,m=c] {"rawtext":[{"text":"§a# §f成功返回出生点"}]}
/scoreboard players set @a[scores={menu=5},rx=-88] menu 0
```

## 链 25：坐标输入页

- 类型：`snake(testfor)`　命令方块：46　触发：menu 17..23

**步骤**

- 3：整页显示（数字键盘、xyz、按钮）
- 4–5：维护 dir tag（视角方向 0..8）
- 6：抬头音效
- 7–16：按 menu_pot 选位（1=x/2=y/3=z），`×10 ±dir` 输入数字
- 17–25：范围校验（|x|,|z|≤1e6、y∈[-64,320]），越界回退
- 26–30：menu=18 继续输入 / menu=21 撤销一位
- 31–36：menu=19/20 切换编辑位（回绕）
- 37–40：menu=22 正负号
- 41–45：menu=23 立即传送（写 tp_que/tp_x/y/z）

**可复用**

- 数字输入 = `×10 ± dir`，dir 由视角方向给
- 四位校验用 `scores=…=!范围` 做越界检测

```text
/testfor @a[scores={menu=17..23}]
[c] /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]
/execute as @a[scores={menu=17..23}] run /titleraw @s actionbar {"rawtext":[{"text":"   §b◁§7｛§f 传送菜单 │ Ｔｅｌｅｐｏｒｔ Ｍｅｎｕ §7｝§b▷§f"},{"text":"\n§7◇------------------§6✧§7-----------------◇§f\n\n"},{"text":"      §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=18,dir=1}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"text":"1 "},{"text":"  §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=18,dir=2}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"text":"2 "},{"text":"  §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=18,dir=3}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"text":"3"},{"text":"          §f"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu_pot=1}]"},{"text":"> "},{"text":"  "}]}},{"text":"§fx:§a"},{"score":{"name":"@s","objective":"menu_tpx"}},{"text":"\n      §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=18,dir=4}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"text":"4 "},{"text":"  §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=18,dir=5}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"text":"5 "},{"text":"  §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=18,dir=6}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"text":"6"},{"text":"          §f"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu_pot=2}]"},{"text":"> "},{"text":"  "}]}},{"text":"§fy:§a"},{"score":{"name":"@s","objective":"menu_tpy"}},{"text":"\n      §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=18,dir=7}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"text":"7 "},{"text":"  §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=18,dir=8}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"text":"8 "},{"text":"  §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=18,dir=9}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"text":"9"},{"text":"          §f"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu_pot=3}]"},{"text":"> "},{"text":"  "}]}},{"text":"§fz:§a"},{"score":{"name":"@s","objective":"menu_tpz"}},{"text":"\n          §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=18,dir=0}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"text":"0\n\n"},{"text":"    §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=19}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"text":"返回上一坐标"},{"text":"       §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=20}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"text":"切换下一坐标\n"},{"text":"      §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=21}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"text":"撤销输入"},{"text":"           §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=22}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"text":"切换正负§f\n\n"},{"text":"                §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=23}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"text":"立即传送§f"},{"text":"\n\n§7◇------------------§6✧§7-----------------◇§f"},{"text":"\n   §f左右移动视角选择数字，抬头锁定数字\n            雪球控制右侧按钮\n\n\n\n\n\n\n\n\n\n"}]}
/tag @a[scores={menu=17..23,menu=!18}] remove dir
/tag @a[scores={menu=18}] add dir
/execute as @a[scores={menu=18..23},rx=-88] at @s run /playsound random.orb
/execute as @a[scores={menu=18},rx=-88] run /scoreboard players add @s menu_pot 0
/execute as @a[scores={menu=18,menu_pot=1},rx=-88] run /scoreboard players operation @s menu_tpx *= const_10 settings
/execute as @a[scores={menu=18,menu_pot=1,menu_tpx=0..},rx=-88] run /scoreboard players operation @s menu_tpx += @s dir
/execute as @a[scores={menu=18,menu_pot=1,menu_tpx=..-1},rx=-88] run /scoreboard players operation @s menu_tpx -= @s dir
/execute as @a[scores={menu=18,menu_pot=2},rx=-88] run /scoreboard players operation @s menu_tpy *= const_10 settings
/execute as @a[scores={menu=18,menu_pot=2,menu_tpy=0..},rx=-88] run /scoreboard players operation @s menu_tpy += @s dir
/execute as @a[scores={menu=18,menu_pot=2,menu_tpy=..-1},rx=-88] run /scoreboard players operation @s menu_tpy -= @s dir
/execute as @a[scores={menu=18,menu_pot=3},rx=-88] run /scoreboard players operation @s menu_tpz *= const_10 settings
/execute as @a[scores={menu=18,menu_pot=3,menu_tpz=0..},rx=-88] run /scoreboard players operation @s menu_tpz += @s dir
/execute as @a[scores={menu=18,menu_pot=3,menu_tpz=..-1},rx=-88] run /scoreboard players operation @s menu_tpz -= @s dir
/execute as @a[scores={menu=18,menu_pot=1,menu_tpx=!-1000000..1000000},rx=-88] run /tellraw @s {"rawtext":[{"text":"§c#§f 当前坐标绝对值不能超过1，000，000"}]}
/execute as @a[scores={menu=18,menu_pot=1,menu_tpx=!-1000000..1000000},rx=-88] run /scoreboard players operation @s menu_tpx /= const_10 settings
/execute as @a[scores={menu=18,menu_pot=1,menu_tpx=!-1000000..1000000},rx=-88] at @s run /playsound random.anvil_land
/execute as @a[scores={menu=18,menu_pot=2,menu_tpy=320..},rx=-88] run /tellraw @s {"rawtext":[{"text":"§c#§f 当前坐标正方向不能超过320"}]}
/execute as @a[scores={menu=18,menu_pot=2,menu_tpy=!-64..320},rx=-88] at @s run /playsound random.anvil_land
/execute as @a[scores={menu=18,menu_pot=2,menu_tpy=!-64..320},rx=-88] run /scoreboard players operation @s menu_tpy /= const_10 settings
/execute as @a[scores={menu=18,menu_pot=3,menu_tpz=!-1000000..1000000},rx=-88] run /tellraw @s {"rawtext":[{"text":"§c#§f 当前坐标绝对值不能超过1，000，000"}]}
/execute as @a[scores={menu=18,menu_pot=3,menu_tpz=!-1000000..1000000},rx=-88] at @s run /playsound random.anvil_land
/execute as @a[scores={menu=18,menu_pot=3,menu_tpz=!-1000000..1000000},rx=-88] run /scoreboard players operation @s menu_tpz /= const_10 settings
/execute as @a[scores={menu=18},rx=-88] run /scoreboard players set @s menu 17
/execute as @a[scores={menu=21,menu_pot=1},rx=-88] run /scoreboard players operation @s menu_tpx /= const_10 settings
/execute as @a[scores={menu=21,menu_pot=2},rx=-88] run /scoreboard players operation @s menu_tpy /= const_10 settings
/execute as @a[scores={menu=21,menu_pot=3},rx=-88] run /scoreboard players operation @s menu_tpz /= const_10 settings
/execute as @a[scores={menu=21},rx=-88] run /scoreboard players set @s menu 17
/execute as @a[scores={menu=19,menu_pot=1..},rx=-88] run /scoreboard players remove @s menu_pot 1
/execute as @a[scores={menu=19,menu_pot=0},rx=-88] run /scoreboard players set @s menu_pot 3
/execute as @a[scores={menu=19},rx=-88] run /scoreboard players set @s menu 17
/execute as @a[scores={menu=20,menu_pot=1..},rx=-88] run /scoreboard players add @s menu_pot 1
/execute as @a[scores={menu=20,menu_pot=4},rx=-88] run /scoreboard players set @s menu_pot 1
/execute as @a[scores={menu=20},rx=-88] run /scoreboard players set @s menu 17
/execute as @a[scores={menu=22,menu_pot=1},rx=-88] run /scoreboard players operation @s menu_tpx *= const_-1 settings
/execute as @a[scores={menu=22,menu_pot=2},rx=-88] run /scoreboard players operation @s menu_tpy *= const_-1 settings
/execute as @a[scores={menu=22,menu_pot=3},rx=-88] run /scoreboard players operation @s menu_tpz *= const_-1 settings
/execute as @a[scores={menu=22},rx=-88] run /scoreboard players set @s menu 17
/execute as @a[scores={menu=23},rx=-88] run /scoreboard players operation @s tp_que = cnt tp_que
/execute as @a[scores={menu=23},rx=-88] run /scoreboard players operation @s tp_x = @s menu_tpx
/execute as @a[scores={menu=23},rx=-88] run /scoreboard players operation @s tp_y = @s menu_tpy
/execute as @a[scores={menu=23},rx=-88] run /scoreboard players operation @s tp_z = @s menu_tpz
/execute as @a[scores={menu=23},rx=-88] run /scoreboard players set @s menu 0
```

## 链 26：锚点页

- 类型：`snake(testfor)`　命令方块：16　触发：menu 25..28

**步骤**

- 3：显示三个选项
- 4–5：menu=26 查看锚点坐标（pot_c*）并回到 25
- 6–8：menu=27 设置锚点（打 pot_cur tag）
- 9–15：menu=28 传送锚点（写 tp_que/tp_x/y/z/dim）

**可复用**

- 锚点存 pot_cx/cy/cz/cdim，设置时由别处写
- 传送统一走 tp_que 队列

```text
/testfor @a[scores={menu=25..28}]
[c] /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]
/execute as @a[scores={menu=25..28}] run /titleraw @s actionbar {"rawtext":[{"text":"   §b◁§7｛§f 传送菜单 │ Ｔｅｌｅｐｏｒｔ Ｍｅｎｕ §7｝§b▷§f"},{"text":"\n§7◇------------------§6✧§7-----------------◇§f\n"},{"text":"              §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=26}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=26}]"},{"text":"▍§f "},{"text":"  "}]}},{"text":"查看锚点\n"},{"text":"              §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=27}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=27}]"},{"text":"▍§f "},{"text":"  "}]}},{"text":"设置锚点\n"},{"text":"              §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=28}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=28}]"},{"text":"▍§f "},{"text":"  "}]}},{"text":"传送锚点\n"},{"text":"§7◇------------------§6✧§7-----------------◇§f\n"},{"translate":"%%5","with":{"rawtext":[{"selector":"@s[scores={menu=..25}]"},{"selector":"@s[scores={menu=..26}]"},{"selector":"@s[scores={menu=..27}]"},{"selector":"@s[scores={menu=..28}]"},{"text":"            投掷雪球进入菜单\n"},{"text":"            查询您的锚点坐标\n"},{"text":"            设置您的锚点坐标\n"},{"text":"             传送到您的锚点\n"}]}}]}
/execute as @a[scores={menu=26},rx=-88] run /tellraw @s {"rawtext":[{"text":"§a#§f 当前锚点坐标 §7"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={pot_cdim=1}]"},{"text":"主世界"},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={pot_cdim=2}]"},{"text":"地狱"},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={pot_cdim=3}]"},{"text":"末地"},{"text":""}]}},{"text":"§f\nx §e-->§f "},{"score":{"name":"@s","objective":"pot_cx"}},{"text":"\ny §e-->§f "},{"score":{"name":"@s","objective":"pot_cy"}},{"text":"\nz §e-->§f "},{"score":{"name":"@s","objective":"pot_cz"}},{"text":""}]}
/scoreboard players set @a[scores={menu=26},rx=-88] menu 25
/tag @a[scores={menu=27},rx=-88] add pot_cur
/titleraw @a[scores={menu=27},rx=-88] actionbar {"rawtext":[{"text":"§b◁§7｛§f 记录成功 │ Ｒｅｃｏｒｄ §aＳＵＣＣＥＥＤ§7 ｝§b▷§f"}]}
/scoreboard players set @a[scores={menu=27},rx=-88] menu 0
/scoreboard players operation @a[scores={menu=28},rx=-88,c=1] tp_que = cnt tp_que
/titleraw @a[scores={menu=28},rx=-88,c=1] actionbar {"rawtext":[{"text":"§b◁§7｛§f 传送成功 │ Ｔｅｌｅｐｏｒｔ §aＳＵＣＣＥＥＤ§7 ｝§b▷§f"}]}
/execute as @a[scores={menu=28},rx=-88,c=1] run /scoreboard players operation @s tp_x = @s pot_cx
/execute as @a[scores={menu=28},rx=-88,c=1] run /scoreboard players operation @s tp_y = @s pot_cy
/execute as @a[scores={menu=28},rx=-88,c=1] run /scoreboard players operation @s tp_z = @s pot_cz
/execute as @a[scores={menu=28},rx=-88,c=1] run /scoreboard players operation @s tp_dim = @s pot_cdim
/scoreboard players set @a[scores={menu=28},rx=-88,c=1] menu 0
```

## 链 27：申请传送页

- 类型：`snake(testfor)`　命令方块：26　触发：menu 30..41

**步骤**

- 3：tpa 不合法直接关闭
- 4：玩家列表（序号 0..9 → menu 31..40，41 刷新）
- 5–7：menu=41 刷新列表（tpa 轮转一位）
- 8–20：选玩家：+31 偏移、禁自传、双向提示、tpa_tim=600、对方打 menu 100
- 21–25：menu=100 分配新 tpa 序号（tp_record 计数）

**可复用**

- 用“临时 +31 / -31”把 menu 值映射到 tpa 序号
- 刷新 = 把 tpa 序号整体轮转

```text
/testfor @a[scores={menu=30..41}]
[c] /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]
/scoreboard players set @a[scores={tpa=!0..39,menu=30..41}] menu 0
/execute as @a[scores={menu=30..41}] run /titleraw @s actionbar {"rawtext":[{"text":"§b▎ §f雪球菜单 §d۞ §f申请传送 §b▎\n§7 - Select player for TPA -§r§7\n--------------------------\n"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=31}]"},{"text":"§e■ "},{"text":"§b□§7 "}]}},{"selector":"@a[scores={tpa=0}]"},{"text":"§7\n"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=32}]"},{"text":"§e■ "},{"text":"§b□§7 "}]}},{"selector":"@a[scores={tpa=1}]"},{"text":"§7\n"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=33}]"},{"text":"§e■ "},{"text":"§b□§7 "}]}},{"selector":"@a[scores={tpa=2}]"},{"text":"§7\n"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=34}]"},{"text":"§e■ "},{"text":"§b□§7 "}]}},{"selector":"@a[scores={tpa=3}]"},{"text":"§7\n"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=35}]"},{"text":"§e■ "},{"text":"§b□§7 "}]}},{"selector":"@a[scores={tpa=4}]"},{"text":"§7\n"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=36}]"},{"text":"§e■ "},{"text":"§b□§7 "}]}},{"selector":"@a[scores={tpa=5}]"},{"text":"§7\n"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=37}]"},{"text":"§e■ "},{"text":"§b□§7 "}]}},{"selector":"@a[scores={tpa=6}]"},{"text":"§7\n"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=38}]"},{"text":"§e■ "},{"text":"§b□§7 "}]}},{"selector":"@a[scores={tpa=7}]"},{"text":"§7\n"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=39}]"},{"text":"§e■ "},{"text":"§b□§7 "}]}},{"selector":"@a[scores={tpa=8}]"},{"text":"§7\n"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=40}]"},{"text":"§e■ "},{"text":"§b□§7 "}]}},{"selector":"@a[scores={tpa=9}]"},{"text":"\n"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=41}]"},{"text":"§e■"},{"text":"§6□§7"}]}},{"text":" Ｒｅｆｒｅｓｈ - 刷新列表"},{"text":"§7\n--------------------------\n§l〈§r§a抬头确定§7§l〉§r§b ● §l§7〈§r§c低头关闭§7§l〉\n\n\n\n\n\n\n\n\n\n"}]}
/execute as @a[scores={menu=41},rx=-88] unless entity @p[scores={menu=31..40},rx=-88] run /scoreboard players operation @a[scores={tpa=1}] tpa >< @a[scores={tpa=0..39}] tpa
/execute as @a[scores={menu=41},rx=-88] run /tellraw @s {"rawtext":[{"text":"§a# §7玩家互传 §f刷新成功"}]}
/execute as @a[scores={menu=41},rx=-88] unless entity @p[scores={menu=31..40},rx=-88] run /scoreboard players set @a[scores={menu=31..42}] menu 30
/execute as @p[scores={menu=31..40},rx=-88,x=0,y=0,z=0] run /scoreboard players add @a tpa 31
/execute as @p[scores={menu=31..40},rx=-88,x=0,y=0,z=0] if score @s tpa = @s menu run /tellraw @s {"rawtext":[{"text":"§c# §7玩家互传 §f不可以向自己申请互传"}]}
/execute as @p[scores={menu=31..40},rx=-88,x=0,y=0,z=0] if score @s tpa = @s menu run /playsound random.anvil_land
/execute as @p[scores={menu=31..40},rx=-88,x=0,y=0,z=0] unless score @s tpa = @s menu as @a if score @s tpa = @p[scores={menu=31..40},rx=-88,x=0,y=0,z=0] menu run /tellraw @p[scores={menu=31..40},rx=-88,x=0,y=0,z=0] {"rawtext":[{"text":"§a# §7玩家互传 §f已向§e"},{"selector":"@s"},{"text":"§f申请互传\n§7低头可取消互传申请§f"}]}
/execute as @p[scores={menu=31..40},rx=-88,x=0,y=0,z=0] unless score @s tpa = @s menu as @a if score @s tpa = @p[scores={menu=31..40},rx=-88,x=0,y=0,z=0] menu run /tellraw @s {"rawtext":[{"text":"§a# §7玩家互传 §f玩家§e"},{"selector":"@p[scores={menu=31..40},rx=-88,x=0,y=0,z=0]"},{"text":"§f向你发出互传申请\n§7打开雪球菜单接受传送\n§7低头即可拒绝"}]}
/execute as @p[scores={menu=31..40},rx=-88,x=0,y=0,z=0] unless score @s tpa = @s menu as @a if score @s tpa = @p[scores={menu=31..40},rx=-88,x=0,y=0,z=0] menu run /playsound random.levelup
/execute as @p[scores={menu=31..40},rx=-88,x=0,y=0,z=0] unless score @s tpa = @s menu as @a if score @s tpa = @p[scores={menu=31..40},rx=-88,x=0,y=0,z=0] menu run /playsound random.levelup @p[scores={menu=31..40},rx=-88,x=0,y=0,z=0]
/execute as @p[scores={menu=31..40},rx=-88,x=0,y=0,z=0] unless score @s tpa = @s menu as @a if score @s tpa = @p[scores={menu=31..40},rx=-88,x=0,y=0,z=0] menu run /scoreboard players set @s tpa_tim 600
/execute as @p[scores={menu=31..40},rx=-88,x=0,y=0,z=0] unless score @s tpa = @s menu as @a if score @s tpa = @p[scores={menu=31..40},rx=-88,x=0,y=0,z=0] menu run /scoreboard players set @p[scores={menu=31..40},rx=-88,x=0,y=0,z=0] tpa_tim 600
/execute as @p[scores={menu=31..40},rx=-88,x=0,y=0,z=0] unless score @s tpa = @s menu as @a if score @s tpa = @p[scores={menu=31..40},rx=-88,x=0,y=0,z=0] menu run /scoreboard players set @s menu 100
/execute as @p[scores={menu=31..40},rx=-88,x=0,y=0,z=0] unless score @s tpa = @s menu unless entity @a[scores={menu=100}] run /tellraw @s {"rawtext":[{"text":"§c# §7玩家互传 §f你要申请的玩家不存在"}]}
/execute as @p[scores={menu=31..40},rx=-88,x=0,y=0,z=0] unless score @s tpa = @s menu unless entity @a[scores={menu=100}] run /playsound random.anvil_land
/execute as @p[scores={menu=31..40},rx=-88,x=0,y=0,z=0] run /scoreboard players remove @a tpa 31
/execute as @a[scores={menu=100}] run /scoreboard players operation @s tpa = tp_record tpa
/execute as @a[scores={menu=100}] run /scoreboard players add tp_record tpa 1
/scoreboard players operation @p[scores={menu=31..40},rx=-88,x=0,y=0,z=0] tpa = @a[scores={menu=100}] tpa
/execute as @p[scores={menu=31..40},rx=-88,x=0,y=0,z=0] run /scoreboard players set @s menu 0
/scoreboard players operation @a[scores={menu=100}] tpa *= const_-1 settings
```

## 链 31：模式菜单

- 类型：`snake(testfor)`　命令方块：19　触发：menu 43..48

**步骤**

- 3：显示四种模式
- 4–9：抬头切换（关/开命令反馈）
- 10–15：无权限（非创造/非旁观）提示并退回 43
- 16–18：成功提示与关闭

**可复用**

- 创造/旁观要求 `tag=§kop`，避免普通玩家提权
- 切换时临时关 sendcommandfeedback 防刷屏

```text
/testfor @a[scores={menu=43..48}]
[c] /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]
/execute as @a[scores={menu=43..47}] run /titleraw @s actionbar {"rawtext":[{"text":"   §b◁§7｛§f 模式菜单 │ Ｇａｍｅｍｏｄｅ Ｍｅｎｕ §7｝§b▷§f"},{"text":"\n§7◇------------------§6✧§7-----------------◇§f\n"},{"text":"              §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=44}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=44}]"},{"text":"▍§f "},{"text":"  "}]}},{"text":"生存模式\n"},{"text":"              §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=45}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=45}]"},{"text":"▍§f "},{"text":"  "}]}},{"text":"访客模式\n"},{"text":"              §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=46}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=46}]"},{"text":"▍§f "},{"text":"  "}]}},{"text":"创造模式\n"},{"text":"              §"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=47}]"},{"score":{"name":"@s","objective":"menu_cl"}},{"text":"f"}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={menu=47}]"},{"text":"▍§f "},{"text":"  "}]}},{"text":"旁观模式"},{"text":"\n§7◇------------------§6✧§7-----------------◇§f\n"},{"translate":"%%6","with":{"rawtext":[{"selector":"@s[scores={menu=..43}]"},{"selector":"@s[scores={menu=..44}]"},{"selector":"@s[scores={menu=..45}]"},{"selector":"@s[scores={menu=..46}]"},{"selector":"@s[scores={menu=..47}]"},{"text":"            投掷雪球进入菜单\n"},{"text":"           切换游戏模式为生存\n"},{"text":"           切换游戏模式为冒险"},{"text":"           切换游戏模式为创造\n"},{"text":"           切换游戏模式为旁观\n"}]}}]}
/execute if entity @a[scores={menu=44..47},rx=-88] run /gamerule sendcommandfeedback false
/gamemode survival @a[scores={menu=44},rx=-88]
/gamemode adventure @a[scores={menu=45},rx=-88]
/gamemode creative @a[scores={menu=46},rx=-88,tag=§kop]
/gamemode spectator @a[scores={menu=47},rx=-88,tag=§kop]
/execute if entity @a[scores={menu=44..47},rx=-88] run /gamerule sendcommandfeedback true
/tellraw @a[scores={menu=46},rx=-88,m=!c] {"rawtext":[{"text":"§c# §f您没有切换§e创造模式§f的权限！"}]}
/tellraw @a[scores={menu=47},rx=-88,m=!spectator] {"rawtext":[{"text":"§c# §f您没有切换§e旁观模式§f的权限！"}]}
/playsound random.anvil_land @a[scores={menu=46},rx=-88,m=!c]
/playsound random.anvil_land @a[scores={menu=47},rx=-88,m=!s]
/scoreboard players set @a[scores={menu=46},rx=-88,m=!c] menu 43
/scoreboard players set @a[scores={menu=47},rx=-88,m=!spectator] menu 43
/playsound random.levelup @a[scores={menu=44..47},rx=-88]
/execute as @a[scores={menu=44..47},rx=-88] run /tellraw @s {"rawtext":[{"text":"§a# §f成功切换到"},{"translate":"%%5","with":{"rawtext":[{"selector":"@s[scores={menu=..44}]"},{"selector":"@s[scores={menu=..45}]"},{"selector":"@s[scores={menu=..46}]"},{"selector":"@s[scores={menu=..47}]"},{"text":"生存模式\n"},{"text":"冒险模式"},{"text":"创造模式"},{"text":"旁观模式"}]}}]}
/scoreboard players set @a[scores={menu=44..47},rx=-88] menu 0
```
