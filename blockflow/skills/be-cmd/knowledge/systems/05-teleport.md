# 传送队列

- 组成：1 条链 —— 传送队列
- 说明：排队 + 大坐标分段位移。

## 初始化（本系统自带）

### 计分板

```text
/scoreboard objectives add tp_que dummy
/scoreboard objectives add tp_x dummy
/scoreboard objectives add tp_y dummy
/scoreboard objectives add tp_z dummy
```

### 全局常量（settings）

```text
/scoreboard players set cominput settings 0
```

### 其他初始化

```text
/scoreboard players add time_rday settings 0
```

### 用到的 tag

`tp_back`、tp_now`

## 链 8：传送队列

- 类型：`snake(testfor)`　命令方块：214　触发：有实体 tp_que≥1

**步骤**

- 3–4：队首打 tp_now，后来者+1
- 5–11：同分去重
- 12–13：清屏反馈、tp_back 归零
- 14–53：+x 分段
- 54–93：−x 分段
- 94–117：+z 分段
- 118–173：−z 分段
- 174–191：+y 分段
- 192–209：−y 分段
- 210–213：收尾

**可复用**

- 每段“判据→tp→扣分”，分数归零即完成
- `tp_back` 先归零再加 = 绝对坐标

```text
/testfor @e[scores={tp_que=1..}]
[c] /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]
/execute unless entity @e[scores={tp_que=1},tag=tp_now] run /tag @e[scores={tp_que=1},tag=!tp_now] add tp_now
/execute unless entity @e[scores={tp_que=1}] as @e[scores={tp_que=2..}] run /scoreboard players remove @s tp_que 1
/scoreboard players set cnt tp_que 0
/execute as @e[scores={tp_que=1}] run /scoreboard players add cnt tp_que 1
/execute if score cnt tp_que matches 2.. run /scoreboard players set @e[scores={tp_que=1},c=1] tp_que -1
/execute if score cnt tp_que matches 2.. run /scoreboard players set @e[scores={tp_que=1}] tp_que 2
/execute if score cnt tp_que matches 2.. run /tag @e[scores={tp_que=2}] remove tp_now
/execute if score cnt tp_que matches 2.. run /scoreboard players set @e[scores={tp_que=-1}] tp_que 1
/execute if score cnt tp_que matches 0 as @e[scores={tp_que=2..}] run /scoreboard players remove @s tp_que 1
/execute if entity @e[scores={tp_que=1},tag=tp_now] run /gamerule sendcommandfeedback false
/tp @e[scores={tp_que=1},tag=tp_now,tag=tp_back] 0 0 0
/execute as @e[scores={tp_que=1,tp_x=524288..},tag=tp_now] at @s run /tp @s ~524288~~
/scoreboard players remove @e[scores={tp_que=1,tp_x=524288..},tag=tp_now] tp_x 524288
/execute as @e[scores={tp_que=1,tp_x=262144..},tag=tp_now] at @s run /tp @s ~262144~~
/scoreboard players remove @e[scores={tp_que=1,tp_x=262144..},tag=tp_now] tp_x 262144
/execute as @e[scores={tp_que=1,tp_x=131072..},tag=tp_now] at @s run /tp @s ~131072~~
/scoreboard players remove @e[scores={tp_que=1,tp_x=131072..},tag=tp_now] tp_x 131072
/execute as @e[scores={tp_que=1,tp_x=65536..},tag=tp_now] at @s run /tp @s ~65536~~
/scoreboard players remove @e[scores={tp_que=1,tp_x=65536..},tag=tp_now] tp_x 65536
/execute as @e[scores={tp_que=1,tp_x=32768..},tag=tp_now] at @s run /tp @s ~32768~~
/scoreboard players remove @e[scores={tp_que=1,tp_x=32768..},tag=tp_now] tp_x 32768
/execute as @e[scores={tp_que=1,tp_x=16384..},tag=tp_now] at @s run /tp @s ~16384~~
/scoreboard players remove @e[scores={tp_que=1,tp_x=16384..},tag=tp_now] tp_x 16384
/execute as @e[scores={tp_que=1,tp_x=8192..},tag=tp_now] at @s run /tp @s ~8192~~
/scoreboard players remove @e[scores={tp_que=1,tp_x=8192..},tag=tp_now] tp_x 8192
/execute as @e[scores={tp_que=1,tp_x=4096..},tag=tp_now] at @s run /tp @s ~4096~~
/scoreboard players remove @e[scores={tp_que=1,tp_x=4096..},tag=tp_now] tp_x 4096
/execute as @e[scores={tp_que=1,tp_x=2048..},tag=tp_now] at @s run /tp @s ~2048~~
/scoreboard players remove @e[scores={tp_que=1,tp_x=2048..},tag=tp_now] tp_x 2048
/execute as @e[scores={tp_que=1,tp_x=1024..},tag=tp_now] at @s run /tp @s ~1024~~
/scoreboard players remove @e[scores={tp_que=1,tp_x=1024..},tag=tp_now] tp_x 1024
/execute as @e[scores={tp_que=1,tp_x=512..},tag=tp_now] at @s run /tp @s ~512~~
/scoreboard players remove @e[scores={tp_que=1,tp_x=512..},tag=tp_now] tp_x 512
/execute as @e[scores={tp_que=1,tp_x=256..},tag=tp_now] at @s run /tp @s ~256~~
/scoreboard players remove @e[scores={tp_que=1,tp_x=256..},tag=tp_now] tp_x 256
/execute as @e[scores={tp_que=1,tp_x=128..},tag=tp_now] at @s run /tp @s ~128~~
/scoreboard players remove @e[scores={tp_que=1,tp_x=128..},tag=tp_now] tp_x 128
/execute as @e[scores={tp_que=1,tp_x=64..},tag=tp_now] at @s run /tp @s ~64~~
/scoreboard players remove @e[scores={tp_que=1,tp_x=64..},tag=tp_now] tp_x 64
/execute as @e[scores={tp_que=1,tp_x=32..},tag=tp_now] at @s run /tp @s ~32~~
/scoreboard players remove @e[scores={tp_que=1,tp_x=32..},tag=tp_now] tp_x 32
/execute as @e[scores={tp_que=1,tp_x=16..},tag=tp_now] at @s run /tp @s ~16~~
/scoreboard players remove @e[scores={tp_que=1,tp_x=16..},tag=tp_now] tp_x 16
/execute as @e[scores={tp_que=1,tp_x=8..},tag=tp_now] at @s run /tp @s ~8~~
/scoreboard players remove @e[scores={tp_que=1,tp_x=8..},tag=tp_now] tp_x 8
/execute as @e[scores={tp_que=1,tp_x=4..},tag=tp_now] at @s run /tp @s ~4~~
/scoreboard players remove @e[scores={tp_que=1,tp_x=4..},tag=tp_now] tp_x 4
/execute as @e[scores={tp_que=1,tp_x=2..},tag=tp_now] at @s run /tp @s ~2~~
/scoreboard players remove @e[scores={tp_que=1,tp_x=2..},tag=tp_now] tp_x 2
/execute as @e[scores={tp_que=1,tp_x=1..},tag=tp_now] at @s run /tp @s ~1~~
/scoreboard players remove @e[scores={tp_que=1,tp_x=1..},tag=tp_now] tp_x 1
/execute as @e[scores={tp_que=1,tp_x=..-524288},tag=tp_now] at @s run /tp @s ~-524288~~
/scoreboard players add @e[scores={tp_que=1,tp_x=..-524288},tag=tp_now] tp_x 524288
/execute as @e[scores={tp_que=1,tp_x=..-262144},tag=tp_now] at @s run /tp @s ~-262144~~
/scoreboard players add @e[scores={tp_que=1,tp_x=..-262144},tag=tp_now] tp_x 262144
/execute as @e[scores={tp_que=1,tp_x=..-131072},tag=tp_now] at @s run /tp @s ~-131072~~
/scoreboard players add @e[scores={tp_que=1,tp_x=..-131072},tag=tp_now] tp_x 131072
/execute as @e[scores={tp_que=1,tp_x=..-65536},tag=tp_now] at @s run /tp @s ~-65536~~
/scoreboard players add @e[scores={tp_que=1,tp_x=..-65536},tag=tp_now] tp_x 65536
/execute as @e[scores={tp_que=1,tp_x=..-32768},tag=tp_now] at @s run /tp @s ~-32768~~
/scoreboard players add @e[scores={tp_que=1,tp_x=..-32768},tag=tp_now] tp_x 32768
/execute as @e[scores={tp_que=1,tp_x=..-16384},tag=tp_now] at @s run /tp @s ~-16384~~
/scoreboard players add @e[scores={tp_que=1,tp_x=..-16384},tag=tp_now] tp_x 16384
/execute as @e[scores={tp_que=1,tp_x=..-8192},tag=tp_now] at @s run /tp @s ~-8192~~
/scoreboard players add @e[scores={tp_que=1,tp_x=..-8192},tag=tp_now] tp_x 8192
/execute as @e[scores={tp_que=1,tp_x=..-4096},tag=tp_now] at @s run /tp @s ~-4096~~
/scoreboard players add @e[scores={tp_que=1,tp_x=..-4096},tag=tp_now] tp_x 4096
/execute as @e[scores={tp_que=1,tp_x=..-2048},tag=tp_now] at @s run /tp @s ~-2048~~
/scoreboard players add @e[scores={tp_que=1,tp_x=..-2048},tag=tp_now] tp_x 2048
/execute as @e[scores={tp_que=1,tp_x=..-1024},tag=tp_now] at @s run /tp @s ~-1024~~
/scoreboard players add @e[scores={tp_que=1,tp_x=..-1024},tag=tp_now] tp_x 1024
/execute as @e[scores={tp_que=1,tp_x=..-512},tag=tp_now] at @s run /tp @s ~-512~~
/scoreboard players add @e[scores={tp_que=1,tp_x=..-512},tag=tp_now] tp_x 512
/execute as @e[scores={tp_que=1,tp_x=..-256},tag=tp_now] at @s run /tp @s ~-256~~
/scoreboard players add @e[scores={tp_que=1,tp_x=..-256},tag=tp_now] tp_x 256
/execute as @e[scores={tp_que=1,tp_x=..-128},tag=tp_now] at @s run /tp @s ~-128~~
/scoreboard players add @e[scores={tp_que=1,tp_x=..-128},tag=tp_now] tp_x 128
/execute as @e[scores={tp_que=1,tp_x=..-64},tag=tp_now] at @s run /tp @s ~-64~~
/scoreboard players add @e[scores={tp_que=1,tp_x=..-64},tag=tp_now] tp_x 64
/execute as @e[scores={tp_que=1,tp_x=..-32},tag=tp_now] at @s run /tp @s ~-32~~
/scoreboard players add @e[scores={tp_que=1,tp_x=..-32},tag=tp_now] tp_x 32
/execute as @e[scores={tp_que=1,tp_x=..-16},tag=tp_now] at @s run /tp @s ~-16~~
/scoreboard players add @e[scores={tp_que=1,tp_x=..-16},tag=tp_now] tp_x 16
/execute as @e[scores={tp_que=1,tp_x=..-8},tag=tp_now] at @s run /tp @s ~-8~~
/scoreboard players add @e[scores={tp_que=1,tp_x=..-8},tag=tp_now] tp_x 8
/execute as @e[scores={tp_que=1,tp_x=..-4},tag=tp_now] at @s run /tp @s ~-4~~
/scoreboard players add @e[scores={tp_que=1,tp_x=..-4},tag=tp_now] tp_x 4
/execute as @e[scores={tp_que=1,tp_x=..-2},tag=tp_now] at @s run /tp @s ~-2~~
/scoreboard players add @e[scores={tp_que=1,tp_x=..-2},tag=tp_now] tp_x 2
/execute as @e[scores={tp_que=1,tp_x=..-1},tag=tp_now] at @s run /tp @s ~-1~~
/scoreboard players add @e[scores={tp_que=1,tp_x=..-1},tag=tp_now] tp_x 1
/execute as @e[scores={tp_que=1,tp_z=524288..},tag=tp_now] at @s run /tp @s ~~~524288
/scoreboard players remove @e[scores={tp_que=1,tp_z=524288..},tag=tp_now] tp_z 524288
/execute as @e[scores={tp_que=1,tp_z=262144..},tag=tp_now] at @s run /tp @s ~~~262144
/scoreboard players remove @e[scores={tp_que=1,tp_z=262144..},tag=tp_now] tp_z 262144
/execute as @e[scores={tp_que=1,tp_z=131072..},tag=tp_now] at @s run /tp @s ~~~131072
/scoreboard players remove @e[scores={tp_que=1,tp_z=131072..},tag=tp_now] tp_z 131072
/execute as @e[scores={tp_que=1,tp_z=65536..},tag=tp_now] at @s run /tp @s ~~~65536
/scoreboard players remove @e[scores={tp_que=1,tp_z=65536..},tag=tp_now] tp_z 65536
/execute as @e[scores={tp_que=1,tp_z=32768..},tag=tp_now] at @s run /tp @s ~~~32768
/scoreboard players remove @e[scores={tp_que=1,tp_z=32768..},tag=tp_now] tp_z 32768
/execute as @e[scores={tp_que=1,tp_z=16384..},tag=tp_now] at @s run /tp @s ~~~16384
/scoreboard players remove @e[scores={tp_que=1,tp_z=16384..},tag=tp_now] tp_z 16384
/execute as @e[scores={tp_que=1,tp_z=8192..},tag=tp_now] at @s run /tp @s ~~~8192
/scoreboard players remove @e[scores={tp_que=1,tp_z=8192..},tag=tp_now] tp_z 8192
/execute as @e[scores={tp_que=1,tp_z=4096..},tag=tp_now] at @s run /tp @s ~~~4096
/scoreboard players remove @e[scores={tp_que=1,tp_z=4096..},tag=tp_now] tp_z 4096
/execute as @e[scores={tp_que=1,tp_z=2048..},tag=tp_now] at @s run /tp @s ~~~2048
/scoreboard players remove @e[scores={tp_que=1,tp_z=2048..},tag=tp_now] tp_z 2048
/execute as @e[scores={tp_que=1,tp_z=1024..},tag=tp_now] at @s run /tp @s ~~~1024
/scoreboard players remove @e[scores={tp_que=1,tp_z=1024..},tag=tp_now] tp_z 1024
/execute as @e[scores={tp_que=1,tp_z=512..},tag=tp_now] at @s run /tp @s ~~~512
/scoreboard players remove @e[scores={tp_que=1,tp_z=512..},tag=tp_now] tp_z 512
/execute as @e[scores={tp_que=1,tp_z=256..},tag=tp_now] at @s run /tp @s ~~~256
/scoreboard players remove @e[scores={tp_que=1,tp_z=256..},tag=tp_now] tp_z 256
/execute as @e[scores={tp_que=1,tp_z=128..},tag=tp_now] at @s run /tp @s ~~~128
/scoreboard players remove @e[scores={tp_que=1,tp_z=128..},tag=tp_now] tp_z 128
/execute as @e[scores={tp_que=1,tp_z=64..},tag=tp_now] at @s run /tp @s ~~~64
/scoreboard players remove @e[scores={tp_que=1,tp_z=64..},tag=tp_now] tp_z 64
/execute as @e[scores={tp_que=1,tp_z=32..},tag=tp_now] at @s run /tp @s ~~~32
/scoreboard players remove @e[scores={tp_que=1,tp_z=32..},tag=tp_now] tp_z 32
/execute as @e[scores={tp_que=1,tp_z=16..},tag=tp_now] at @s run /tp @s ~~~16
/scoreboard players remove @e[scores={tp_que=1,tp_z=16..},tag=tp_now] tp_z 16
/execute as @e[scores={tp_que=1,tp_z=8..},tag=tp_now] at @s run /tp @s ~~~8
/scoreboard players remove @e[scores={tp_que=1,tp_z=8..},tag=tp_now] tp_z 8
/execute as @e[scores={tp_que=1,tp_z=4..},tag=tp_now] at @s run /tp @s ~~~4
/scoreboard players remove @e[scores={tp_que=1,tp_z=4..},tag=tp_now] tp_z 4
/execute as @e[scores={tp_que=1,tp_z=2..},tag=tp_now] at @s run /tp @s ~~~2
/scoreboard players remove @e[scores={tp_que=1,tp_z=2..},tag=tp_now] tp_z 2
/execute as @e[scores={tp_que=1,tp_z=1..},tag=tp_now] at @s run /tp @s ~~~1
/scoreboard players remove @e[scores={tp_que=1,tp_z=1..},tag=tp_now] tp_z 1
/execute as @e[scores={tp_que=1,tp_z=..-524288},tag=tp_now] at @s run /tp @s ~~~-524288
/scoreboard players add @e[scores={tp_que=1,tp_z=..-524288},tag=tp_now] tp_z 524288
/execute as @e[scores={tp_que=1,tp_z=..-262144},tag=tp_now] at @s run /tp @s ~~~-262144
/scoreboard players add @e[scores={tp_que=1,tp_z=..-262144},tag=tp_now] tp_z 262144
/execute as @e[scores={tp_que=1,tp_z=..-131072},tag=tp_now] at @s run /tp @s ~~~-131072
/scoreboard players add @e[scores={tp_que=1,tp_z=..-131072},tag=tp_now] tp_z 131072
/execute as @e[scores={tp_que=1,tp_z=..-65536},tag=tp_now] at @s run /tp @s ~~~-65536
/scoreboard players add @e[scores={tp_que=1,tp_z=..-65536},tag=tp_now] tp_z 65536
/execute as @e[scores={tp_que=1,tp_z=..-32768},tag=tp_now] at @s run /tp @s ~~~-32768
/scoreboard players add @e[scores={tp_que=1,tp_z=..-32768},tag=tp_now] tp_z 32768
/execute as @e[scores={tp_que=1,tp_z=..-16384},tag=tp_now] at @s run /tp @s ~~~-16384
/scoreboard players add @e[scores={tp_que=1,tp_z=..-16384},tag=tp_now] tp_z 16384
/execute as @e[scores={tp_que=1,tp_z=..-8192},tag=tp_now] at @s run /tp @s ~~~-8192
/scoreboard players add @e[scores={tp_que=1,tp_z=..-8192},tag=tp_now] tp_z 8192
/execute as @e[scores={tp_que=1,tp_z=..-4096},tag=tp_now] at @s run /tp @s ~~~-4096
/scoreboard players add @e[scores={tp_que=1,tp_z=..-4096},tag=tp_now] tp_z 4096
/execute as @e[scores={tp_que=1,tp_z=..-2048},tag=tp_now] at @s run /tp @s ~~~-2048
/scoreboard players add @e[scores={tp_que=1,tp_z=..-2048},tag=tp_now] tp_z 2048
/execute as @e[scores={tp_que=1,tp_z=..-1024},tag=tp_now] at @s run /tp @s ~~~-1024
/scoreboard players add @e[scores={tp_que=1,tp_z=..-1024},tag=tp_now] tp_z 1024
/execute as @e[scores={tp_que=1,tp_z=..-512},tag=tp_now] at @s run /tp @s ~~~-512
/scoreboard players add @e[scores={tp_que=1,tp_z=..-512},tag=tp_now] tp_z 512
/execute as @e[scores={tp_que=1,tp_z=..-256},tag=tp_now] at @s run /tp @s ~~~-256
/scoreboard players add @e[scores={tp_que=1,tp_z=..-256},tag=tp_now] tp_z 256
/execute as @e[scores={tp_que=1,tp_z=..-128},tag=tp_now] at @s run /tp @s ~~~-128
/scoreboard players add @e[scores={tp_que=1,tp_z=..-128},tag=tp_now] tp_z 128
/execute as @e[scores={tp_que=1,tp_z=..-64},tag=tp_now] at @s run /tp @s ~~~-64
/scoreboard players add @e[scores={tp_que=1,tp_z=..-64},tag=tp_now] tp_z 64
/execute as @e[scores={tp_que=1,tp_z=..-32},tag=tp_now] at @s run /tp @s ~~~-32
/scoreboard players add @e[scores={tp_que=1,tp_z=..-32},tag=tp_now] tp_z 32
/execute as @e[scores={tp_que=1,tp_z=..-16},tag=tp_now] at @s run /tp @s ~~~-16
/scoreboard players add @e[scores={tp_que=1,tp_z=..-16},tag=tp_now] tp_z 16
/execute as @e[scores={tp_que=1,tp_z=..-8},tag=tp_now] at @s run /tp @s ~~~-8
/scoreboard players add @e[scores={tp_que=1,tp_z=..-8},tag=tp_now] tp_z 8
/execute as @e[scores={tp_que=1,tp_z=..-4},tag=tp_now] at @s run /tp @s ~~~-4
/scoreboard players add @e[scores={tp_que=1,tp_z=..-4},tag=tp_now] tp_z 4
/execute as @e[scores={tp_que=1,tp_z=..-2},tag=tp_now] at @s run /tp @s ~~~-2
/scoreboard players add @e[scores={tp_que=1,tp_z=..-2},tag=tp_now] tp_z 2
/execute as @e[scores={tp_que=1,tp_z=..-1},tag=tp_now] at @s run /tp @s ~~~-1
/scoreboard players add @e[scores={tp_que=1,tp_z=..-1},tag=tp_now] tp_z 1
/execute as @e[scores={tp_que=1,tp_y=256..},tag=tp_now] at @s run /tp @s ~ ~256 ~
/scoreboard players remove @e[scores={tp_que=1,tp_y=256..},tag=tp_now] tp_y 256
/execute as @e[scores={tp_que=1,tp_y=128..},tag=tp_now] at @s run /tp @s ~ ~128 ~
/scoreboard players remove @e[scores={tp_que=1,tp_y=128..},tag=tp_now] tp_y 128
/execute as @e[scores={tp_que=1,tp_y=64..},tag=tp_now] at @s run /tp @s ~ ~64 ~
/scoreboard players remove @e[scores={tp_que=1,tp_y=64..},tag=tp_now] tp_y 64
/execute as @e[scores={tp_que=1,tp_y=32..},tag=tp_now] at @s run /tp @s ~ ~32 ~
/scoreboard players remove @e[scores={tp_que=1,tp_y=32..},tag=tp_now] tp_y 32
/execute as @e[scores={tp_que=1,tp_y=16..},tag=tp_now] at @s run /tp @s ~ ~16 ~
/scoreboard players remove @e[scores={tp_que=1,tp_y=16..},tag=tp_now] tp_y 16
/execute as @e[scores={tp_que=1,tp_y=8..},tag=tp_now] at @s run /tp @s ~ ~8 ~
/scoreboard players remove @e[scores={tp_que=1,tp_y=8..},tag=tp_now] tp_y 8
/execute as @e[scores={tp_que=1,tp_y=4..},tag=tp_now] at @s run /tp @s ~ ~4 ~
/scoreboard players remove @e[scores={tp_que=1,tp_y=4..},tag=tp_now] tp_y 4
/execute as @e[scores={tp_que=1,tp_y=2..},tag=tp_now] at @s run /tp @s ~ ~2 ~
/scoreboard players remove @e[scores={tp_que=1,tp_y=2..},tag=tp_now] tp_y 2
/execute as @e[scores={tp_que=1,tp_y=1..},tag=tp_now] at @s run /tp @s ~ ~1 ~
/scoreboard players remove @e[scores={tp_que=1,tp_y=1..},tag=tp_now] tp_y 1
/execute as @e[scores={tp_que=1,tp_y=..-256},tag=tp_now] at @s run /tp @s ~ ~-256 ~
/scoreboard players add @e[scores={tp_que=1,tp_y=..-256},tag=tp_now] tp_y 256
/execute as @e[scores={tp_que=1,tp_y=..-128},tag=tp_now] at @s run /tp @s ~ ~-128 ~
/scoreboard players add @e[scores={tp_que=1,tp_y=..-128},tag=tp_now] tp_y 128
/execute as @e[scores={tp_que=1,tp_y=..-64},tag=tp_now] at @s run /tp @s ~ ~-64 ~
/scoreboard players add @e[scores={tp_que=1,tp_y=..-64},tag=tp_now] tp_y 64
/execute as @e[scores={tp_que=1,tp_y=..-32},tag=tp_now] at @s run /tp @s ~ ~-32 ~
/scoreboard players add @e[scores={tp_que=1,tp_y=..-32},tag=tp_now] tp_y 32
/execute as @e[scores={tp_que=1,tp_y=..-16},tag=tp_now] at @s run /tp @s ~ ~-16 ~
/scoreboard players add @e[scores={tp_que=1,tp_y=..-16},tag=tp_now] tp_y 16
/execute as @e[scores={tp_que=1,tp_y=..-8},tag=tp_now] at @s run /tp @s ~ ~-8 ~
/scoreboard players add @e[scores={tp_que=1,tp_y=..-8},tag=tp_now] tp_y 8
/execute as @e[scores={tp_que=1,tp_y=..-4},tag=tp_now] at @s run /tp @s ~ ~-4 ~
/scoreboard players add @e[scores={tp_que=1,tp_y=..-4},tag=tp_now] tp_y 4
/execute as @e[scores={tp_que=1,tp_y=..-2},tag=tp_now] at @s run /tp @s ~ ~-2 ~
/scoreboard players add @e[scores={tp_que=1,tp_y=..-2},tag=tp_now] tp_y 2
/execute as @e[scores={tp_que=1,tp_y=..-1},tag=tp_now] at @s run /tp @s ~ ~-1 ~
/scoreboard players add @e[scores={tp_que=1,tp_y=..-1},tag=tp_now] tp_y 1
/scoreboard players set @e[scores={tp_que=1},tag=tp_now] tp_que 0
/tag @e[scores={tp_que=0},tag=tp_now] remove tp_now
/tag @e[scores={tp_que=0}] remove tp_back
/execute if score cominput settings matches 0 run /gamerule sendcommandfeedback true
```
