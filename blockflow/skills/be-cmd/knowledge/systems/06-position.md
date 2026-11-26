# 位置编码

- 组成：1 条链 —— 位置编码（实体）
- 说明：把实体坐标写进分数。

## 初始化（本系统自带）

### 计分板

```text
/scoreboard objectives add death dummy
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

`pos`、posi`

## 链 9：位置编码（实体）

- 类型：`snake(testfor)`　命令方块：112　触发：实体带 tag=pos

**步骤**

- 3–8：召唤游标
- 9：对齐到方块中心
- 10–45：x 轴推进
- 46–82：z 轴
- 83–97：y 轴
- 98–109：取反/判维度/写回
- 110–111：清场

**可复用**

- `rm=` 判“是否越过这一档”
- 低三位用 `if entity … rm=4 / r=11.99` 二分

```text
/testfor @e[tag=pos,tag=!death]
[c] /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]
/execute as @e[tag=pos,tag=!death] run /summon armor_stand posi
/tag @e[name=posi,type=armor_stand,z=~1,r=0] add posi
/execute as @e[x=0,y=0,z=0,tag=pos,tag=!death] run /tp @e[tag=posi,z=~2,r=0,c=1] @s
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
/execute at @e[x=0,y=0,z=0,tag=pos,tag=!death] run /tp @e[tag=posi,x=0,y=-500,z=0,r=1,c=1] ~~~
/execute as @e[tag=posi,scores={pos_x=1..}] at @s run /scoreboard players operation @s[x=-1000000,r=1000000] pos_x *= const_-1 settings
/execute as @e[tag=posi,scores={pos_y=1..}] at @s run /scoreboard players operation @s[y=-300,r=300] pos_y *= const_-1 settings
/execute as @e[tag=posi,scores={pos_z=1..}] at @s run /scoreboard players operation @s[z=-1000000,r=1000000] pos_z *= const_-1 settings
/execute in overworld run /scoreboard players set @e[tag=posi,rm=0] pos_dim 1
/execute in nether run /scoreboard players set @e[tag=posi,rm=0] pos_dim 2
/execute in the_end run /scoreboard players set @e[tag=posi,rm=0] pos_dim 3
/execute as @e[tag=!death,tag=pos] at @s run /scoreboard players operation @s pos_x = @e[tag=posi,r=0,c=1] pos_x
/execute as @e[tag=!death,tag=pos] at @s run /scoreboard players operation @s pos_y = @e[tag=posi,r=0,c=1] pos_y
/execute as @e[tag=!death,tag=pos] at @s run /scoreboard players operation @s pos_z = @e[tag=posi,r=0,c=1] pos_z
/execute as @e[tag=!death,tag=pos] at @s run /scoreboard players operation @s pos_dim = @e[tag=posi,r=0,c=1] pos_dim
/tag @e[tag=pos] remove pos
/kill @e[tag=posi]
```
