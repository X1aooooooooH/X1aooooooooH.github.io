# 死亡系统

- 组成：4 条链 —— 死亡检测、死亡提示、复活保护、死亡坐标记录
- 说明：检测死亡 → 提示 → 复活保护 → 记录死亡坐标。

## 初始化（本系统自带）

### 计分板

```text
/scoreboard objectives add death dummy
/scoreboard objectives add death_cnt dummy
/scoreboard objectives add death_dim dummy
/scoreboard objectives add death_tit dummy
/scoreboard objectives add death_x dummy
/scoreboard objectives add death_y dummy
/scoreboard objectives add death_z dummy
/scoreboard objectives add lv dummy
/scoreboard objectives add pos_dim dummy
/scoreboard objectives add pos_x dummy
/scoreboard objectives add pos_y dummy
/scoreboard objectives add pos_z dummy
```

### 全局常量（settings）

```text
/scoreboard players set const_-1 settings -1
```

### 其他初始化

```text
/scoreboard players add time_rday settings 0
```

### 用到的 tag

`death`、death1`、lv`、pos`、posi`

## 链 10：死亡检测

- 类型：`repeat`　命令方块：6　触发：每 tick

**步骤**

- 0–1：全员加 death，再从实体玩家摘掉
- 2–3：death1 转 death=1
- 4–5：打 pos 标记

**可复用**

- `@a` 含死者、`@e[type=player]` 只含活人 → 差集就是死者（见 `special-patterns.md` §5）
- 死亡瞬间打 `death1`，重生进 `@e` 才兑现成 `death=1`，比 `deathCount` 准则省
- 开了立即重生（`doImmediateRespawn`）时差集恒为空，这套检测失效

```text
/tag @a[tag=!death] add death
/tag @e[type=player] remove death
/scoreboard players set @e[tag=death1] death 1
/tag @e[tag=death1] remove death1
/tag @a[tag=death,tag=!death1] add pos
/tag @a[tag=death,tag=!death1] add death1
```

## 链 11：死亡提示

- 类型：`snake(testfor)`　命令方块：28　触发：玩家 death=1

**步骤**

- 3–23：random 1..20 选一条
- 24–27：计次、打 lv、进入复活保护

**可复用**

- `random` + 多条 tellraw 是最省的随机提示
- 打 `lv` 让等级链扣级

```text
/testfor @a[scores={death=1}]
[c] /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]
/scoreboard players random @a[scores={death=1}] death_tit 1 20
/execute as @a[scores={death_tit=1}] run /tellraw @s {"rawtext":[{"text":"[§e/§f] 提示 §f"},{"text":"搭桥时按住§e潜行§f，防止§e掉下去§f。"}]}
/execute as @a[scores={death_tit=2}] run /tellraw @s {"rawtext":[{"text":"[§e/§f] 提示 §f"},{"text":"下矿带足§e火把§f，防止§e刷怪§f。"}]}
/execute as @a[scores={death_tit=3}] run /tellraw @s {"rawtext":[{"text":"[§e/§f] 提示 §f"},{"text":"附魔台周围放§e15 个书架§f，可达§e30 级§f。"}]}
/execute as @a[scores={death_tit=4}] run /tellraw @s {"rawtext":[{"text":"[§e/§f] 提示 §f"},{"text":"苦力怕靠近时§e后退两步§f再打。"}]}
/execute as @a[scores={death_tit=5}] run /tellraw @s {"rawtext":[{"text":"[§e/§f] 提示 §f"},{"text":"床可以设置你的§e重生点§f。"}]}
/execute as @a[scores={death_tit=6}] run /tellraw @s {"rawtext":[{"text":"[§e/§f] 提示 §f"},{"text":"用§e盾牌§f可以挡住大部分§e伤害§f。"}]}
/execute as @a[scores={death_tit=7}] run /tellraw @s {"rawtext":[{"text":"[§e/§f] 提示 §f"},{"text":"§e金苹果§f能快速回复§e血量§f。"}]}
/execute as @a[scores={death_tit=8}] run /tellraw @s {"rawtext":[{"text":"[§e/§f] 提示 §f"},{"text":"进§e下界§f前先喝§e抗火药水§f。"}]}
/execute as @a[scores={death_tit=9}] run /tellraw @s {"rawtext":[{"text":"[§e/§f] 提示 §f"},{"text":"用§e铁砧§f修理装备更划算。"}]}
/execute as @a[scores={death_tit=10}] run /tellraw @s {"rawtext":[{"text":"[§e/§f] 提示 §f"},{"text":"弓箭附魔§e无限§f可以省箭。"}]}
/execute as @a[scores={death_tit=11}] run /tellraw @s {"rawtext":[{"text":"[§e/§f] 提示 §f"},{"text":"夜晚§e睡觉§f可以跳过§e怪物§f。"}]}
/execute as @a[scores={death_tit=12}] run /tellraw @s {"rawtext":[{"text":"[§e/§f] 提示 §f"},{"text":"村民§e交易§f能换到好东西。"}]}
/execute as @a[scores={death_tit=13}] run /tellraw @s {"rawtext":[{"text":"[§e/§f] 提示 §f"},{"text":"用§e桶接水§f可以安全落地。"}]}
/execute as @a[scores={death_tit=14}] run /tellraw @s {"rawtext":[{"text":"[§e/§f] 提示 §f"},{"text":"钓鱼能钓到§e附魔书§f。"}]}
/execute as @a[scores={death_tit=15}] run /tellraw @s {"rawtext":[{"text":"[§e/§f] 提示 §f"},{"text":"附魔§e保护§f可以减少§e伤害§f。"}]}
/execute as @a[scores={death_tit=16}] run /tellraw @s {"rawtext":[{"text":"[§e/§f] 提示 §f"},{"text":"用§e船§f可以从高处安全落地。"}]}
/execute as @a[scores={death_tit=17}] run /tellraw @s {"rawtext":[{"text":"[§e/§f] 提示 §f"},{"text":"§e末影珍珠§f传送小心§e落点§f。"}]}
/execute as @a[scores={death_tit=18}] run /tellraw @s {"rawtext":[{"text":"[§e/§f] 提示 §f"},{"text":"§e潜行§f可以防止掉下§e悬崖§f。"}]}
/execute as @a[scores={death_tit=19}] run /tellraw @s {"rawtext":[{"text":"[§e/§f] 提示 §f"},{"text":"附魔§e耐久§f让工具更耐用。"}]}
/execute as @a[scores={death_tit=20}] run /tellraw @s {"rawtext":[{"text":"[§e/§f] 提示 §f"},{"text":"食物充足才能快速§e回血§f。"}]}
/scoreboard players set @a[scores={death=1}] death_tit 0
/scoreboard players add @a[scores={death=1}] death_cnt 1
/tag @a[scores={death=1}] add lv
/scoreboard players set @a[scores={death=1}] death 2
```

## 链 12：复活保护

- 类型：`snake(testfor)`　命令方块：13　触发：玩家 death=2..

**步骤**

- 3：每秒 +1
- 4：动作栏倒计时
- 5–10：保护药水
- 11–12：到点清理

**可复用**

- death 分数本身当计时器
- `effect … 0` 就是清除

```text
/testfor @a[scores={death=2..}]
[c] /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]
/scoreboard players add @a[scores={death=2..303}] death 1
/execute as @a[scores={death=2..302}] run /titleraw @s actionbar {"rawtext":[{"text":"§l<§r §f复活保护 §e§l"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={death=2..22}]"},{"text":"15"},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={death=23..42}]"},{"text":"14"},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={death=43..62}]"},{"text":"13"},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={death=63..82}]"},{"text":"12"},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={death=83..102}]"},{"text":"11"},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={death=103..122}]"},{"text":"10"},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={death=123..142}]"},{"text":"9"},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={death=143..162}]"},{"text":"8"},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={death=163..182}]"},{"text":"7"},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={death=183..202}]"},{"text":"6"},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={death=203..222}]"},{"text":"5"},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={death=223..242}]"},{"text":"4"},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={death=243..262}]"},{"text":"3"},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={death=263..282}]"},{"text":"2"},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={death=283..302}]"},{"text":"1"},{"text":""}]}},{"text":" §r§f秒 §7| §f无法攻击 §7| §f不会受伤 §7| §f死亡 §e"},{"score":{"name":"@s","objective":"death_cnt"}},{"text":" §f次 §l>§r"}]}
/effect @a[scores={death=3}] night_vision infinite 1 true
/effect @a[scores={death=3}] fire_resistance 15 1 true
/effect @a[scores={death=3}] resistance 15 255 true
/effect @a[scores={death=3}] weakness 15 255 true
/effect @a[scores={death=3}] instant_health 15 200 true
/effect @a[scores={death=3}] water_breathing 15 1 true
/effect @a[scores={death=300}] instant_health 0 255 true
/effect @a[scores={death=300}] night_vision 0 2 true
```

## 链 13：死亡坐标记录

- 类型：`snake(testfor)`　命令方块：113　触发：玩家 tag=pos+death

**步骤**

- 3–8：召唤游标
- 9–97：三轴推进
- 98–109：取反/维度/写回 death_*
- 110：坐标播报
- 111–112：清场

**可复用**

- 与位置编码同源，只是目标分数不同
- 维度用 `execute in <维度>` 判定

```text
/testfor @a[tag=pos]
[c] /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]
/execute as @a[tag=pos,tag=death] run /summon armor_stand posi ~~~
/tag @e[name=posi,type=armor_stand,z=~1,r=0] add posi
/execute as @a[x=0,y=0,z=0,tag=pos,tag=death] run /tp @e[tag=posi,z=~2,r=0,c=1] @s
/scoreboard players set @e[tag=posi] pos_x 0
/scoreboard players set @e[tag=posi] pos_y 0
/scoreboard players set @e[tag=posi] pos_z 0
/execute as @e[tag=posi] at @s align xyz facing 0 ~~ positioned ^^^-0.5 facing ~ 0 ~ positioned ^^^-0.5 facing ~~ 0 run /tp ^^^-0.5 facing 0 ~~
/execute as @e[tag=posi] at @s run /scoreboard players add @s[x=0.0,rm=524288] pos_x 524288
/execute as @e[tag=posi] at @s run /tp @s[x=0.0,rm=524288] ^^^524288
/execute as @e[tag=posi] at @s run /scoreboard players add @s[x=0.0,rm=262144] pos_x 262144
/execute as @e[tag=posi] at @s run /tp @s[x=0.0,rm=262144] ^^^262144
/execute as @e[tag=posi] at @s run /scoreboard players add @s[x=0.0,rm=131072] pos_x 131072
/execute as @e[tag=posi] at @s run /tp @s[x=0.0,rm=131072] ^^^131072
/execute as @e[tag=posi] at @s run /scoreboard players add @s[x=0.0,rm=65536] pos_x 65536
/execute as @e[tag=posi] at @s run /tp @s[x=0.0,rm=65536] ^^^65536
/execute as @e[tag=posi] at @s run /scoreboard players add @s[x=0.0,rm=32768] pos_x 32768
/execute as @e[tag=posi] at @s run /tp @s[x=0.0,rm=32768] ^^^32768
/execute as @e[tag=posi] at @s run /scoreboard players add @s[x=0.0,rm=16384] pos_x 16384
/execute as @e[tag=posi] at @s run /tp @s[x=0.0,rm=16384] ^^^16384
/execute as @e[tag=posi] at @s run /scoreboard players add @s[x=0.0,rm=8192] pos_x 8192
/execute as @e[tag=posi] at @s run /tp @s[x=0.0,rm=8192] ^^^8192
/execute as @e[tag=posi] at @s run /scoreboard players add @s[x=0.0,rm=4096] pos_x 4096
/execute as @e[tag=posi] at @s run /tp @s[x=0.0,rm=4096] ^^^4096
/execute as @e[tag=posi] at @s run /scoreboard players add @s[x=0.0,rm=2048] pos_x 2048
/execute as @e[tag=posi] at @s run /tp @s[x=0.0,rm=2048] ^^^2048
/execute as @e[tag=posi] at @s run /scoreboard players add @s[x=0.0,rm=1024] pos_x 1024
/execute as @e[tag=posi] at @s run /tp @s[x=0.0,rm=1024] ^^^1024
/execute as @e[tag=posi] at @s run /scoreboard players add @s[x=0.0,rm=512] pos_x 512
/execute as @e[tag=posi] at @s run /tp @s[x=0.0,rm=512] ^^^512
/execute as @e[tag=posi] at @s run /scoreboard players add @s[x=0.0,rm=256] pos_x 256
/execute as @e[tag=posi] at @s run /tp @s[x=0.0,rm=256] ^^^256
/execute as @e[tag=posi] at @s run /scoreboard players add @s[x=0.0,rm=128] pos_x 128
/execute as @e[tag=posi] at @s run /tp @s[x=0.0,rm=128] ^^^128
/execute as @e[tag=posi] at @s run /scoreboard players add @s[x=0.0,rm=64] pos_x 64
/execute as @e[tag=posi] at @s run /tp @s[x=0.0,rm=64] ^^^064
/execute as @e[tag=posi] at @s run /scoreboard players add @s[x=0.0,rm=32] pos_x 32
/execute as @e[tag=posi] at @s run /tp @s[x=0.0,rm=32] ^^^32
/execute as @e[tag=posi] at @s run /scoreboard players add @s[x=0.0,rm=16] pos_x 16
/execute as @e[tag=posi] at @s run /tp @s[x=0.0,rm=16] ^^^16
/execute as @e[tag=posi] at @s run /scoreboard players add @s[x=0.0,rm=8] pos_x 8
/execute as @e[tag=posi] at @s if entity @s[x=0.0,rm=4] unless entity @s[x=0.0,r=11.99,rm=8] run /scoreboard players add @s pos_x 4
/execute as @e[tag=posi] at @s if entity @s[x=0.0,rm=2] unless entity @s[x=0.0,r=5.99,rm=4] unless entity @s[x=0.0,r=9.99,rm=8] unless entity @s[x=0.0,r=13.99,rm=12] run /scoreboard players add @s pos_x 2
/execute as @e[tag=posi] at @s if entity @s[x=0.0,rm=1] unless entity @s[x=0.0,r=2.99,rm=2] unless entity @s[x=0.0,r=4.99,rm=4] unless entity @s[x=0.0,r=6.99,rm=6] unless entity @s[x=0.0,r=8.99,rm=8] unless entity @s[x=0.0,r=10.99,rm=10] unless entity @s[x=0.0,r=12.99,rm=12] unless entity @s[x=0.0,r=14.99,rm=14] run /scoreboard players add @s pos_x 1
/execute as @e[tag=posi] at @s run /tp @s[z=0.0,rm=16] ~~~ facing ~~ 0
/execute as @e[tag=posi] at @s run /scoreboard players add @s[z=0.0,rm=524288] pos_z 524288
/execute as @e[tag=posi] at @s run /tp @s[z=0.0,rm=524288] ^^^524288
/execute as @e[tag=posi] at @s run /scoreboard players add @s[z=0.0,rm=262144] pos_z 262144
/execute as @e[tag=posi] at @s run /tp @s[z=0.0,rm=262144] ^^^262144
/execute as @e[tag=posi] at @s run /scoreboard players add @s[z=0.0,rm=131072] pos_z 131072
/execute as @e[tag=posi] at @s run /tp @s[z=0.0,rm=131072] ^^^131072
/execute as @e[tag=posi] at @s run /scoreboard players add @s[z=0.0,rm=65536] pos_z 65536
/execute as @e[tag=posi] at @s run /tp @s[z=0.0,rm=65536] ^^^65536
/execute as @e[tag=posi] at @s run /scoreboard players add @s[z=0.0,rm=32768] pos_z 32768
/execute as @e[tag=posi] at @s run /tp @s[z=0.0,rm=32768] ^^^32768
/execute as @e[tag=posi] at @s run /scoreboard players add @s[z=0.0,rm=16384] pos_z 16384
/execute as @e[tag=posi] at @s run /tp @s[z=0.0,rm=16384] ^^^16384
/execute as @e[tag=posi] at @s run /scoreboard players add @s[z=0.0,rm=8192] pos_z 8192
/execute as @e[tag=posi] at @s run /tp @s[z=0.0,rm=8192] ^^^8192
/execute as @e[tag=posi] at @s run /scoreboard players add @s[z=0.0,rm=4096] pos_z 4096
/execute as @e[tag=posi] at @s run /tp @s[z=0.0,rm=4096] ^^^4096
/execute as @e[tag=posi] at @s run /scoreboard players add @s[z=0.0,rm=2048] pos_z 2048
/execute as @e[tag=posi] at @s run /tp @s[z=0.0,rm=2048] ^^^2048
/execute as @e[tag=posi] at @s run /scoreboard players add @s[z=0.0,rm=1024] pos_z 1024
/execute as @e[tag=posi] at @s run /tp @s[z=0.0,rm=1024] ^^^1024
/execute as @e[tag=posi] at @s run /scoreboard players add @s[z=0.0,rm=512] pos_z 512
/execute as @e[tag=posi] at @s run /tp @s[z=0.0,rm=512] ^^^512
/execute as @e[tag=posi] at @s run /scoreboard players add @s[z=0.0,rm=256] pos_z 256
/execute as @e[tag=posi] at @s run /tp @s[z=0.0,rm=256] ^^^256
/execute as @e[tag=posi] at @s run /scoreboard players add @s[z=0.0,rm=128] pos_z 128
/execute as @e[tag=posi] at @s run /tp @s[z=0.0,rm=128] ^^^128
/execute as @e[tag=posi] at @s run /scoreboard players add @s[z=0.0,rm=64] pos_z 64
/execute as @e[tag=posi] at @s run /tp @s[z=0.0,rm=64] ^^^064
/execute as @e[tag=posi] at @s run /scoreboard players add @s[z=0.0,rm=32] pos_z 32
/execute as @e[tag=posi] at @s run /tp @s[z=0.0,rm=32] ^^^32
/execute as @e[tag=posi] at @s run /scoreboard players add @s[z=0.0,rm=16] pos_z 16
/execute as @e[tag=posi] at @s run /tp @s[z=0.0,rm=16] ^^^16
/execute as @e[tag=posi] at @s run /scoreboard players add @s[z=0.0,rm=8] pos_z 8
/execute as @e[tag=posi] at @s if entity @s[z=0.0,rm=4] unless entity @s[z=0.0,r=11.99,rm=8] run /scoreboard players add @s pos_z 4
/execute as @e[tag=posi] at @s if entity @s[z=0.0,rm=2] unless entity @s[z=0.0,r=5.99,rm=4] unless entity @s[z=0.0,r=9.99,rm=8] unless entity @s[z=0.0,r=13.99,rm=12] run /scoreboard players add @s pos_z 2
/execute as @e[tag=posi] at @s if entity @s[z=0.0,rm=1] unless entity @s[z=0.0,r=2.99,rm=2] unless entity @s[z=0.0,r=4.99,rm=4] unless entity @s[z=0.0,r=6.99,rm=6] unless entity @s[z=0.0,r=8.99,rm=8] unless entity @s[z=0.0,r=10.99,rm=10] unless entity @s[z=0.0,r=12.99,rm=12] unless entity @s[z=0.0,r=14.99,rm=14] run /scoreboard players add @s pos_z 1
/execute as @e[tag=posi] at @s run /tp @s[y=0,rm=16] ~~~ facing ~ 0 ~
/execute as @e[tag=posi] at @s run /scoreboard players add @s[y=0,rm=256] pos_y 256
/execute as @e[tag=posi] at @s run /tp @s[y=0,rm=256] ^^^256
/execute as @e[tag=posi] at @s run /scoreboard players add @s[y=0,rm=128] pos_y 128
/execute as @e[tag=posi] at @s run /tp @s[y=0,rm=128] ^^^128
/execute as @e[tag=posi] at @s run /scoreboard players add @s[y=0,rm=64] pos_y 64
/execute as @e[tag=posi] at @s run /tp @s[y=0,rm=64] ^^^064
/execute as @e[tag=posi] at @s run /scoreboard players add @s[y=0,rm=32] pos_y 32
/execute as @e[tag=posi] at @s run /tp @s[y=0,rm=32] ^^^32
/execute as @e[tag=posi] at @s run /scoreboard players add @s[y=0,rm=16] pos_y 16
/execute as @e[tag=posi] at @s run /tp @s[y=0,rm=16] ^^^16
/execute as @e[tag=posi] at @s run /scoreboard players add @s[y=0,rm=8] pos_y 8
/execute as @e[tag=posi] at @s if entity @s[y=0,rm=4] unless entity @s[y=0,r=11.99,rm=8] run /scoreboard players add @s pos_y 4
/execute as @e[tag=posi] at @s if entity @s[y=0,rm=2] unless entity @s[y=0,r=5.99,rm=4] unless entity @s[y=0,r=9.99,rm=8] unless entity @s[y=0,r=13.99,rm=12] run /scoreboard players add @s pos_y 2
/execute as @e[tag=posi] at @s if entity @s[y=0,rm=1] unless entity @s[y=0,r=2.99,rm=2] unless entity @s[y=0,r=4.99,rm=4] unless entity @s[y=0,r=6.99,rm=6] unless entity @s[y=0,r=8.99,rm=8] unless entity @s[y=0,r=10.99,rm=10] unless entity @s[y=0,r=12.99,rm=12] unless entity @s[y=0,r=14.99,rm=14] run /scoreboard players add @s pos_y 1
/execute at @e[tag=posi] run /tp @e[tag=posi,r=0,c=1] 0 -500 0
/execute at @a[x=0,y=0,z=0,tag=pos,tag=death] run /tp @e[tag=posi,x=0,y=-500,z=0,r=1,c=1] ~~~
/execute as @e[tag=posi,scores={pos_x=1..}] at @s run /scoreboard players operation @s[x=-1000000,r=1000000] pos_x *= const_-1 settings
/execute as @e[tag=posi,scores={pos_y=1..}] at @s run /scoreboard players operation @s[y=-300,r=300] pos_y *= const_-1 settings
/execute as @e[tag=posi,scores={pos_z=1..}] at @s run /scoreboard players operation @s[z=-1000000,r=1000000] pos_z *= const_-1 settings
/execute in overworld run /scoreboard players set @e[tag=posi,rm=0] pos_dim 1
/execute in nether run /scoreboard players set @e[tag=posi,rm=0] pos_dim 2
/execute in the_end run /scoreboard players set @e[tag=posi,rm=0] pos_dim 3
/execute as @a[tag=death,tag=pos] at @s run /scoreboard players operation @s death_x = @e[tag=posi,r=0,c=1] pos_x
/execute as @a[tag=death,tag=pos] at @s run /scoreboard players operation @s death_y = @e[tag=posi,r=0,c=1] pos_y
/execute as @a[tag=death,tag=pos] at @s run /scoreboard players operation @s death_z = @e[tag=posi,r=0,c=1] pos_z
/execute as @a[tag=death,tag=pos] at @s run /scoreboard players operation @s death_dim = @e[tag=posi,r=0,c=1] pos_dim
/execute as @a[tag=pos,tag=death] run /tellraw @s {"rawtext":[{"text":"[§e/§f] §f"},{"text":"死亡坐标已记录\nx: "},{"score":{"name":"@s","objective":"death_x"}},{"text":"\ny: "},{"score":{"name":"@s","objective":"death_y"}},{"text":"\nz: "},{"score":{"name":"@s","objective":"death_z"}},{"text":"\n-维度: "},{"translate":"%%4","with":{"rawtext":[{"selector":"@s[scores={death_dim=..1}]"},{"selector":"@s[scores={death_dim=..2}]"},{"selector":"@s[scores={death_dim=..3}]"},{"text":"主世界"},{"text":"下界"},{"text":"末地"},{"text":"未知维度"}]}},{"text":"\n§f可以使用§a雪球菜单§f免费传送"}]}
/tag @a[tag=pos] remove pos
/kill @e[tag=posi]
```
