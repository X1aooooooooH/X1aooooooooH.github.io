# 玩家互传

- 组成：3 条链 —— 接受传送、拒绝与取消、传送超时
- 说明：接受、拒绝/取消、超时清理；与菜单的申请页共用 tpa 分数。

## 初始化（本系统自带）

### 计分板

```text
/scoreboard objectives add menu dummy
/scoreboard objectives add tpa dummy
/scoreboard objectives add tpa_tim dummy
```

### 其他初始化

```text
/scoreboard players set tp_record tpa 100
/scoreboard players add time_rday settings 0
```

## 链 28：接受传送

- 类型：`snake(testfor)`　命令方块：14　触发：tpa≤-40 且 menu=3

**步骤**

- 3：接受者挂起为 menu=101
- 4–5：把申请人 tpa 叠加、tp 到接受者
- 6–9：双向提示与音效
- 10–13：清 tpa_tim、接受者 tpa 归零

**可复用**

- 用 tpa 正负区分“申请人/被申请人”：负数=被申请
- 接受后申请人 tpa=0 表示已传送

```text
/testfor @a[scores={tpa=..-40,menu=3},rx=-88]
[c] /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]
/scoreboard players set @p[scores={menu=3,tpa=..-40},rx=-88] menu 101
/execute as @p[scores={menu=101}] run /scoreboard players operation @a[scores={menu=!101}] tpa += @s tpa
/tp @a[scores={tpa=0}] @p[scores={menu=101}]
/tellraw @p[scores={menu=101}] {"rawtext":[{"text":"§a# §7玩家互传 §f已接受§e"},{"selector":"@a[scores={tpa=0}]"},{"text":"§f的互传申请"}]}
/execute as @p[scores={menu=101}] run /tellraw @a[scores={tpa=0}] {"rawtext":[{"text":"§a# §7玩家互传 §f已将您传送至§e"},{"selector":"@s"}]}
/execute as @p[scores={tpa=0}] at @s run /playsound random.levelup
/execute as @p[scores={menu=101}] at @s run /playsound random.levelup
/scoreboard players set @p[scores={menu=101}] tpa_tim 0
/scoreboard players set @p[scores={tpa=0}] tpa_tim 0
/execute as @p[scores={menu=101}] run /scoreboard players operation @a[scores={menu=!101,tpa=!0}] tpa -= @s tpa
/scoreboard players set @p[scores={menu=101}] tpa 0
```

## 链 29：拒绝与取消

- 类型：`snake(testfor)`　命令方块：20　触发：tpa 越界（≤-40 或 ≥40）

**步骤**

- 3–7：低头（rxm=88）拒绝/取消并提示
- 8–15：menu+1000 标记发起人，通知对方
- 16–19：清理 tpa、menu

**可复用**

- `tpa=..-40` = 被申请方拒绝；`tpa=40..` = 申请方取消
- 用 menu+1000 当临时标记，处理完还原

```text
/testfor @a[scores={tpa=!-39..39}]
[c] /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]
/tellraw @a[scores={tpa=..-40},rxm=88] {"rawtext":[{"text":"§c# §7玩家互传 §f已拒绝对方的互传申请"}]}
/tellraw @a[scores={tpa=40..},rxm=88] {"rawtext":[{"text":"§c# §7玩家互传 §f已取消互传"}]}
/playsound random.toast @a[scores={tpa=..-40},rxm=88]
/playsound random.toast @a[scores={tpa=40..},rxm=88]
/scoreboard players set @a[scores={tpa=!0..39},rxm=88] tpa 0
/scoreboard players add @r[scores={tpa=!0..39}] menu 1000
/execute as @a[scores={menu=1000..}] run /scoreboard players operation @a[scores={menu=!1000..}] tpa += @s tpa
/execute as @a[scores={menu=1000..,tpa=40..}] unless entity @a[scores={tpa=0}] run /tellraw @s {"rawtext":[{"text":"§c# §7玩家互传 §f对方拒绝互传或离线"}]}
/execute as @a[scores={menu=1000..,tpa=..-40}] unless entity @a[scores={tpa=0}] run /tellraw @s {"rawtext":[{"text":"§c# §7玩家互传 §f对方取消互传或离线"}]}
/execute as @a[scores={menu=1000..,tpa=!-39..39}] unless entity @a[scores={tpa=0}] run /playsound random.anvil_land
/execute as @a[scores={menu=1000..,tpa=!-39..39}] unless entity @a[scores={tpa=0}] run /scoreboard players set @s tpa_tim 0
/execute as @a[scores={menu=1000..}] unless entity @a[scores={tpa=0}] run /scoreboard players add @s menu 1000
/execute as @a[scores={menu=1000..}] run /scoreboard players operation @a[scores={menu=!1000..}] tpa -= @s tpa
/scoreboard players set @a[scores={menu=2000..}] tpa 0
/scoreboard players remove @a[scores={menu=1000..}] menu 1000
/scoreboard players remove @a[scores={menu=1000..}] menu 1000
/scoreboard players set @a[scores={menu=100..}] menu 0
```

## 链 30：传送超时

- 类型：`snake(testfor)`　命令方块：8　触发：tpa_tim≥1

**步骤**

- 3：每秒 -1
- 4–7：到 0 提示 120s 超时、关闭菜单、清 tpa

**可复用**

- 请求有效期 = tpa_tim 600（20tps ≈ 30 秒倒计时，提示文案写 120s，按实际改）

```text
/testfor @a[scores={tpa_tim=1..}]
[c] /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]
/scoreboard players remove @a[scores={tpa=!-39..39,tpa_tim=1..}] tpa_tim 1
/execute as @a[scores={tpa=!-39..39,tpa_tim=0}] run /playsound random.anvil_land
/execute as @a[scores={tpa=!-39..39,tpa_tim=0}] run /tellraw @s {"rawtext":[{"text":"§c# §7玩家互传 §f传送发起超过120s，已自动取消"}]}
/execute as @a[scores={tpa=!-39..39,tpa_tim=0}] run /scoreboard players set @s menu 0
/execute as @a[scores={tpa=!-39..39,tpa_tim=0}] run /scoreboard players set @s tpa 0
```
