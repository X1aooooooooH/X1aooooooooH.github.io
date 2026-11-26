# 色块存储

- 组成：2 条链 —— 读卡器、数字显示器
- 说明：读卡器与数字显示器：分数 ↔ 彩色方块墙。

## 初始化（本系统自带）

### 计分板

```text
/scoreboard objectives add read dummy
/scoreboard objectives add trans dummy
/scoreboard objectives add trans_d1 dummy
/scoreboard objectives add trans_d2 dummy
/scoreboard objectives add trans_d3 dummy
/scoreboard objectives add trans_d4 dummy
/scoreboard objectives add trans_d5 dummy
/scoreboard objectives add trans_d6 dummy
/scoreboard objectives add trans_tmp dummy
```

### 全局常量（settings）

```text
/scoreboard players set const_-1 settings -1
/scoreboard players set const_10 settings 10
```

### 其他初始化

```text
/scoreboard players add time_rday settings 0
```

### 用到的 tag

`read`

## 链 14：读卡器

- 类型：`snake(testfor)`　命令方块：60　触发：实体带 read

**步骤**

- 3：清零
- 4–57：按层高与颜色累加位权
- 58：白色表示负数
- 59：摘 tag

**可复用**

- 颜色=0..9，层高=位权
- 方块墙当只读内存

```text
/testfor @e[tag=read]
[c] /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]
/scoreboard players set @e[tag=read] read 0
/execute as @e[tag=read] at @s if block ~ ~ ~ orange_concrete run /scoreboard players add @s read 1
/execute as @e[tag=read] at @s if block ~ ~ ~ magenta_concrete run /scoreboard players add @s read 2
/execute as @e[tag=read] at @s if block ~ ~ ~ light_blue_concrete run /scoreboard players add @s read 3
/execute as @e[tag=read] at @s if block ~ ~ ~ yellow_concrete run /scoreboard players add @s read 4
/execute as @e[tag=read] at @s if block ~ ~ ~ lime_concrete run /scoreboard players add @s read 5
/execute as @e[tag=read] at @s if block ~ ~ ~ pink_concrete run /scoreboard players add @s read 6
/execute as @e[tag=read] at @s if block ~ ~ ~ gray_concrete run /scoreboard players add @s read 7
/execute as @e[tag=read] at @s if block ~ ~ ~ light_gray_concrete run /scoreboard players add @s read 8
/execute as @e[tag=read] at @s if block ~ ~ ~ cyan_concrete run /scoreboard players add @s read 9
/execute as @e[tag=read] at @s if block ~ ~1 ~ orange_concrete run /scoreboard players add @s read 10
/execute as @e[tag=read] at @s if block ~ ~1 ~ magenta_concrete run /scoreboard players add @s read 20
/execute as @e[tag=read] at @s if block ~ ~1 ~ light_blue_concrete run /scoreboard players add @s read 30
/execute as @e[tag=read] at @s if block ~ ~1 ~ yellow_concrete run /scoreboard players add @s read 40
/execute as @e[tag=read] at @s if block ~ ~1 ~ lime_concrete run /scoreboard players add @s read 50
/execute as @e[tag=read] at @s if block ~ ~1 ~ pink_concrete run /scoreboard players add @s read 60
/execute as @e[tag=read] at @s if block ~ ~1 ~ gray_concrete run /scoreboard players add @s read 70
/execute as @e[tag=read] at @s if block ~ ~1 ~ light_gray_concrete run /scoreboard players add @s read 80
/execute as @e[tag=read] at @s if block ~ ~1 ~ cyan_concrete run /scoreboard players add @s read 90
/execute as @e[tag=read] at @s if block ~ ~2 ~ orange_concrete run /scoreboard players add @s read 100
/execute as @e[tag=read] at @s if block ~ ~2 ~ magenta_concrete run /scoreboard players add @s read 200
/execute as @e[tag=read] at @s if block ~ ~2 ~ light_blue_concrete run /scoreboard players add @s read 300
/execute as @e[tag=read] at @s if block ~ ~2 ~ yellow_concrete run /scoreboard players add @s read 400
/execute as @e[tag=read] at @s if block ~ ~2 ~ lime_concrete run /scoreboard players add @s read 500
/execute as @e[tag=read] at @s if block ~ ~2 ~ pink_concrete run /scoreboard players add @s read 600
/execute as @e[tag=read] at @s if block ~ ~2 ~ gray_concrete run /scoreboard players add @s read 700
/execute as @e[tag=read] at @s if block ~ ~2 ~ light_gray_concrete run /scoreboard players add @s read 800
/execute as @e[tag=read] at @s if block ~ ~2 ~ cyan_concrete run /scoreboard players add @s read 900
/execute as @e[tag=read] at @s if block ~ ~3 ~ orange_concrete run /scoreboard players add @s read 1000
/execute as @e[tag=read] at @s if block ~ ~3 ~ magenta_concrete run /scoreboard players add @s read 2000
/execute as @e[tag=read] at @s if block ~ ~3 ~ light_blue_concrete run /scoreboard players add @s read 3000
/execute as @e[tag=read] at @s if block ~ ~3 ~ yellow_concrete run /scoreboard players add @s read 4000
/execute as @e[tag=read] at @s if block ~ ~3 ~ lime_concrete run /scoreboard players add @s read 5000
/execute as @e[tag=read] at @s if block ~ ~3 ~ pink_concrete run /scoreboard players add @s read 6000
/execute as @e[tag=read] at @s if block ~ ~3 ~ gray_concrete run /scoreboard players add @s read 7000
/execute as @e[tag=read] at @s if block ~ ~3 ~ light_gray_concrete run /scoreboard players add @s read 8000
/execute as @e[tag=read] at @s if block ~ ~3 ~ cyan_concrete run /scoreboard players add @s read 9000
/execute as @e[tag=read] at @s if block ~ ~4 ~ orange_concrete run /scoreboard players add @s read 10000
/execute as @e[tag=read] at @s if block ~ ~4 ~ magenta_concrete run /scoreboard players add @s read 20000
/execute as @e[tag=read] at @s if block ~ ~4 ~ light_blue_concrete run /scoreboard players add @s read 30000
/execute as @e[tag=read] at @s if block ~ ~4 ~ yellow_concrete run /scoreboard players add @s read 40000
/execute as @e[tag=read] at @s if block ~ ~4 ~ lime_concrete run /scoreboard players add @s read 50000
/execute as @e[tag=read] at @s if block ~ ~4 ~ pink_concrete run /scoreboard players add @s read 60000
/execute as @e[tag=read] at @s if block ~ ~4 ~ gray_concrete run /scoreboard players add @s read 70000
/execute as @e[tag=read] at @s if block ~ ~4 ~ light_gray_concrete run /scoreboard players add @s read 80000
/execute as @e[tag=read] at @s if block ~ ~4 ~ cyan_concrete run /scoreboard players add @s read 90000
/execute as @e[tag=read] at @s if block ~ ~5 ~ orange_concrete run /scoreboard players add @s read 100000
/execute as @e[tag=read] at @s if block ~ ~5 ~ magenta_concrete run /scoreboard players add @s read 200000
/execute as @e[tag=read] at @s if block ~ ~5 ~ light_blue_concrete run /scoreboard players add @s read 300000
/execute as @e[tag=read] at @s if block ~ ~5 ~ yellow_concrete run /scoreboard players add @s read 400000
/execute as @e[tag=read] at @s if block ~ ~5 ~ lime_concrete run /scoreboard players add @s read 500000
/execute as @e[tag=read] at @s if block ~ ~5 ~ pink_concrete run /scoreboard players add @s read 600000
/execute as @e[tag=read] at @s if block ~ ~5 ~ gray_concrete run /scoreboard players add @s read 700000
/execute as @e[tag=read] at @s if block ~ ~5 ~ light_gray_concrete run /scoreboard players add @s read 800000
/execute as @e[tag=read] at @s if block ~ ~5 ~ cyan_concrete run /scoreboard players add @s read 900000
/execute as @e[tag=read] at @s if block ~ ~6 ~ white_concrete run /scoreboard players operation @s read *= const_-1 settings
/tag @e[tag=read] remove read
```

## 链 15：数字显示器

- 类型：`snake(testfor)`　命令方块：85　触发：实体带 trans

**步骤**

- 4–22：`%10` 拆六位
- 23–82：逐位 setblock 颜色
- 83：负数顶层白色
- 84：清场

**可复用**

- 与读卡器互为写/读两端
- `%10` 取位、`/10` 进位

```text
/testfor @e[tag=trans]
[c] /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]
/scoreboard players add @e[tag=trans] trans_tmp 0
/execute as @e[tag=trans] run /scoreboard players operation @s trans_tmp = @s trans
/execute as @e[tag=trans] if score @s trans_tmp matches ..-1 run /scoreboard players operation @s trans_tmp *= const_-1 settings
/execute as @e[tag=trans] run /scoreboard players operation @s trans_d1 = @s trans_tmp
/execute as @e[tag=trans] run /scoreboard players operation @s trans_d1 %= const_10 settings
/execute as @e[tag=trans] run /scoreboard players operation @s trans_tmp /= const_10 settings
/execute as @e[tag=trans] run /scoreboard players operation @s trans_d2 = @s trans_tmp
/execute as @e[tag=trans] run /scoreboard players operation @s trans_d2 %= const_10 settings
/execute as @e[tag=trans] run /scoreboard players operation @s trans_tmp /= const_10 settings
/execute as @e[tag=trans] run /scoreboard players operation @s trans_d3 = @s trans_tmp
/execute as @e[tag=trans] run /scoreboard players operation @s trans_d3 %= const_10 settings
/execute as @e[tag=trans] run /scoreboard players operation @s trans_tmp /= const_10 settings
/execute as @e[tag=trans] run /scoreboard players operation @s trans_d4 = @s trans_tmp
/execute as @e[tag=trans] run /scoreboard players operation @s trans_d4 %= const_10 settings
/execute as @e[tag=trans] run /scoreboard players operation @s trans_tmp /= const_10 settings
/execute as @e[tag=trans] run /scoreboard players operation @s trans_d5 = @s trans_tmp
/execute as @e[tag=trans] run /scoreboard players operation @s trans_d5 %= const_10 settings
/execute as @e[tag=trans] run /scoreboard players operation @s trans_tmp /= const_10 settings
/execute as @e[tag=trans] run /scoreboard players operation @s trans_d6 = @s trans_tmp
/execute as @e[tag=trans] run /scoreboard players operation @s trans_d6 %= const_10 settings
/execute as @e[tag=trans,scores={trans_d1=0}] at @s run /setblock ~ ~ ~ white_concrete
/execute as @e[tag=trans,scores={trans_d1=1}] at @s run /setblock ~ ~ ~ orange_concrete
/execute as @e[tag=trans,scores={trans_d1=2}] at @s run /setblock ~ ~ ~ magenta_concrete
/execute as @e[tag=trans,scores={trans_d1=3}] at @s run /setblock ~ ~ ~ light_blue_concrete
/execute as @e[tag=trans,scores={trans_d1=4}] at @s run /setblock ~ ~ ~ yellow_concrete
/execute as @e[tag=trans,scores={trans_d1=5}] at @s run /setblock ~ ~ ~ lime_concrete
/execute as @e[tag=trans,scores={trans_d1=6}] at @s run /setblock ~ ~ ~ pink_concrete
/execute as @e[tag=trans,scores={trans_d1=7}] at @s run /setblock ~ ~ ~ gray_concrete
/execute as @e[tag=trans,scores={trans_d1=8}] at @s run /setblock ~ ~ ~ light_gray_concrete
/execute as @e[tag=trans,scores={trans_d1=9}] at @s run /setblock ~ ~ ~ cyan_concrete
/execute as @e[tag=trans,scores={trans_d2=0}] at @s run /setblock ~ ~1 ~ white_concrete
/execute as @e[tag=trans,scores={trans_d2=1}] at @s run /setblock ~ ~1 ~ orange_concrete
/execute as @e[tag=trans,scores={trans_d2=2}] at @s run /setblock ~ ~1 ~ magenta_concrete
/execute as @e[tag=trans,scores={trans_d2=3}] at @s run /setblock ~ ~1 ~ light_blue_concrete
/execute as @e[tag=trans,scores={trans_d2=4}] at @s run /setblock ~ ~1 ~ yellow_concrete
/execute as @e[tag=trans,scores={trans_d2=5}] at @s run /setblock ~ ~1 ~ lime_concrete
/execute as @e[tag=trans,scores={trans_d2=6}] at @s run /setblock ~ ~1 ~ pink_concrete
/execute as @e[tag=trans,scores={trans_d2=7}] at @s run /setblock ~ ~1 ~ gray_concrete
/execute as @e[tag=trans,scores={trans_d2=8}] at @s run /setblock ~ ~1 ~ light_gray_concrete
/execute as @e[tag=trans,scores={trans_d2=9}] at @s run /setblock ~ ~1 ~ cyan_concrete
/execute as @e[tag=trans,scores={trans_d3=0}] at @s run /setblock ~ ~2 ~ white_concrete
/execute as @e[tag=trans,scores={trans_d3=1}] at @s run /setblock ~ ~2 ~ orange_concrete
/execute as @e[tag=trans,scores={trans_d3=2}] at @s run /setblock ~ ~2 ~ magenta_concrete
/execute as @e[tag=trans,scores={trans_d3=3}] at @s run /setblock ~ ~2 ~ light_blue_concrete
/execute as @e[tag=trans,scores={trans_d3=4}] at @s run /setblock ~ ~2 ~ yellow_concrete
/execute as @e[tag=trans,scores={trans_d3=5}] at @s run /setblock ~ ~2 ~ lime_concrete
/execute as @e[tag=trans,scores={trans_d3=6}] at @s run /setblock ~ ~2 ~ pink_concrete
/execute as @e[tag=trans,scores={trans_d3=7}] at @s run /setblock ~ ~2 ~ gray_concrete
/execute as @e[tag=trans,scores={trans_d3=8}] at @s run /setblock ~ ~2 ~ light_gray_concrete
/execute as @e[tag=trans,scores={trans_d3=9}] at @s run /setblock ~ ~2 ~ cyan_concrete
/execute as @e[tag=trans,scores={trans_d4=0}] at @s run /setblock ~ ~3 ~ white_concrete
/execute as @e[tag=trans,scores={trans_d4=1}] at @s run /setblock ~ ~3 ~ orange_concrete
/execute as @e[tag=trans,scores={trans_d4=2}] at @s run /setblock ~ ~3 ~ magenta_concrete
/execute as @e[tag=trans,scores={trans_d4=3}] at @s run /setblock ~ ~3 ~ light_blue_concrete
/execute as @e[tag=trans,scores={trans_d4=4}] at @s run /setblock ~ ~3 ~ yellow_concrete
/execute as @e[tag=trans,scores={trans_d4=5}] at @s run /setblock ~ ~3 ~ lime_concrete
/execute as @e[tag=trans,scores={trans_d4=6}] at @s run /setblock ~ ~3 ~ pink_concrete
/execute as @e[tag=trans,scores={trans_d4=7}] at @s run /setblock ~ ~3 ~ gray_concrete
/execute as @e[tag=trans,scores={trans_d4=8}] at @s run /setblock ~ ~3 ~ light_gray_concrete
/execute as @e[tag=trans,scores={trans_d4=9}] at @s run /setblock ~ ~3 ~ cyan_concrete
/execute as @e[tag=trans,scores={trans_d5=0}] at @s run /setblock ~ ~4 ~ white_concrete
/execute as @e[tag=trans,scores={trans_d5=1}] at @s run /setblock ~ ~4 ~ orange_concrete
/execute as @e[tag=trans,scores={trans_d5=2}] at @s run /setblock ~ ~4 ~ magenta_concrete
/execute as @e[tag=trans,scores={trans_d5=3}] at @s run /setblock ~ ~4 ~ light_blue_concrete
/execute as @e[tag=trans,scores={trans_d5=4}] at @s run /setblock ~ ~4 ~ yellow_concrete
/execute as @e[tag=trans,scores={trans_d5=5}] at @s run /setblock ~ ~4 ~ lime_concrete
/execute as @e[tag=trans,scores={trans_d5=6}] at @s run /setblock ~ ~4 ~ pink_concrete
/execute as @e[tag=trans,scores={trans_d5=7}] at @s run /setblock ~ ~4 ~ gray_concrete
/execute as @e[tag=trans,scores={trans_d5=8}] at @s run /setblock ~ ~4 ~ light_gray_concrete
/execute as @e[tag=trans,scores={trans_d5=9}] at @s run /setblock ~ ~4 ~ cyan_concrete
/execute as @e[tag=trans,scores={trans_d6=0}] at @s run /setblock ~ ~5 ~ white_concrete
/execute as @e[tag=trans,scores={trans_d6=1}] at @s run /setblock ~ ~5 ~ orange_concrete
/execute as @e[tag=trans,scores={trans_d6=2}] at @s run /setblock ~ ~5 ~ magenta_concrete
/execute as @e[tag=trans,scores={trans_d6=3}] at @s run /setblock ~ ~5 ~ light_blue_concrete
/execute as @e[tag=trans,scores={trans_d6=4}] at @s run /setblock ~ ~5 ~ yellow_concrete
/execute as @e[tag=trans,scores={trans_d6=5}] at @s run /setblock ~ ~5 ~ lime_concrete
/execute as @e[tag=trans,scores={trans_d6=6}] at @s run /setblock ~ ~5 ~ pink_concrete
/execute as @e[tag=trans,scores={trans_d6=7}] at @s run /setblock ~ ~5 ~ gray_concrete
/execute as @e[tag=trans,scores={trans_d6=8}] at @s run /setblock ~ ~5 ~ light_gray_concrete
/execute as @e[tag=trans,scores={trans_d6=9}] at @s run /setblock ~ ~5 ~ cyan_concrete
/execute as @e[tag=trans,scores={trans=..-1}] at @s run /setblock ~ ~6 ~ white_concrete
/kill @e[tag=trans]
```
