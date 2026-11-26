# 等级结算

- 组成：1 条链 —— 等级结算
- 说明：等级与分数互转，死亡扣级。

## 初始化（本系统自带）

### 计分板

```text
/scoreboard objectives add death dummy
/scoreboard objectives add lv dummy
/scoreboard objectives add lv_tmp dummy
/scoreboard objectives add online_sum dummy
```

### 全局常量（settings）

```text
/scoreboard players set const_2 settings 2
```

### 其他初始化

```text
/scoreboard players add time_rday settings 0
```

### 用到的 tag

`lv`

## 链 6：等级结算

- 类型：`snake(testfor)`　命令方块：70　触发：玩家带 lv

**步骤**

- 3–33：`xp -NL` 逐位抽等级
- 34：存 lv
- 35–37：死亡惩罚（在线 ≥720 分才扣半）
- 38–67：逐位还原
- 68–69：扣半与清 tag

**可复用**

- `lm=` 逐位试探是读等级的唯一办法
- 新手保护用 `online_sum=..719`

```text
/testfor @a[tag=lv]
[c] /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]
/execute as @a[tag=lv] run /scoreboard players set @s lv_tmp 0
/execute as @a[tag=lv,lm=16384] run /scoreboard players add @s lv_tmp 16384
/execute as @a[tag=lv,lm=16384] run /xp -16384L @s
/execute as @a[tag=lv,lm=8192] run /scoreboard players add @s lv_tmp 8192
/execute as @a[tag=lv,lm=8192] run /xp -8192L @s
/execute as @a[tag=lv,lm=4096] run /scoreboard players add @s lv_tmp 4096
/execute as @a[tag=lv,lm=4096] run /xp -4096L @s
/execute as @a[tag=lv,lm=2048] run /scoreboard players add @s lv_tmp 2048
/execute as @a[tag=lv,lm=2048] run /xp -2048L @s
/execute as @a[tag=lv,lm=1024] run /scoreboard players add @s lv_tmp 1024
/execute as @a[tag=lv,lm=1024] run /xp -1024L @s
/execute as @a[tag=lv,lm=512] run /scoreboard players add @s lv_tmp 512
/execute as @a[tag=lv,lm=512] run /xp -512L @s
/execute as @a[tag=lv,lm=256] run /scoreboard players add @s lv_tmp 256
/execute as @a[tag=lv,lm=256] run /xp -256L @s
/execute as @a[tag=lv,lm=128] run /scoreboard players add @s lv_tmp 128
/execute as @a[tag=lv,lm=128] run /xp -128L @s
/execute as @a[tag=lv,lm=64] run /scoreboard players add @s lv_tmp 64
/execute as @a[tag=lv,lm=64] run /xp -64L @s
/execute as @a[tag=lv,lm=32] run /scoreboard players add @s lv_tmp 32
/execute as @a[tag=lv,lm=32] run /xp -32L @s
/execute as @a[tag=lv,lm=16] run /scoreboard players add @s lv_tmp 16
/execute as @a[tag=lv,lm=16] run /xp -16L @s
/execute as @a[tag=lv,lm=8] run /scoreboard players add @s lv_tmp 8
/execute as @a[tag=lv,lm=8] run /xp -8L @s
/execute as @a[tag=lv,lm=4] run /scoreboard players add @s lv_tmp 4
/execute as @a[tag=lv,lm=4] run /xp -4L @s
/execute as @a[tag=lv,lm=2] run /scoreboard players add @s lv_tmp 2
/execute as @a[tag=lv,lm=2] run /xp -2L @s
/execute as @a[tag=lv,lm=1] run /scoreboard players add @s lv_tmp 1
/execute as @a[tag=lv,lm=1] run /xp -1L @s
/execute as @a[tag=lv] run /scoreboard players operation @s lv = @s lv_tmp
/execute as @a[tag=lv,scores={death=1..,online_sum=720..}] run /scoreboard players operation @s lv_tmp /= const_2 settings
/execute as @a[tag=lv,scores={death=1..,online_sum=720..}] run /tellraw @s {"rawtext":[{"text":"[§c/§f] §f死亡惩罚 "},{"text":"您已死亡，扣除经验共计 "},{"score":{"name":"@s","objective":"lv_tmp"}},{"text":" 级"}]}
/execute as @a[tag=lv,scores={death=1..,online_sum=..719}] run /tellraw @s {"rawtext":[{"text":"[§e/§f] §f新手保护 "},{"text":"您本次死亡不会扣除经验"}]}
/execute as @a[tag=lv,scores={lv_tmp=16384..}] run /xp 16384L @s
/execute as @a[tag=lv,scores={lv_tmp=16384..}] run /scoreboard players remove @s lv_tmp 16384
/execute as @a[tag=lv,scores={lv_tmp=8192..}] run /xp 8192L @s
/execute as @a[tag=lv,scores={lv_tmp=8192..}] run /scoreboard players remove @s lv_tmp 8192
/execute as @a[tag=lv,scores={lv_tmp=4096..}] run /xp 4096L @s
/execute as @a[tag=lv,scores={lv_tmp=4096..}] run /scoreboard players remove @s lv_tmp 4096
/execute as @a[tag=lv,scores={lv_tmp=2048..}] run /xp 2048L @s
/execute as @a[tag=lv,scores={lv_tmp=2048..}] run /scoreboard players remove @s lv_tmp 2048
/execute as @a[tag=lv,scores={lv_tmp=1024..}] run /xp 1024L @s
/execute as @a[tag=lv,scores={lv_tmp=1024..}] run /scoreboard players remove @s lv_tmp 1024
/execute as @a[tag=lv,scores={lv_tmp=512..}] run /xp 512L @s
/execute as @a[tag=lv,scores={lv_tmp=512..}] run /scoreboard players remove @s lv_tmp 512
/execute as @a[tag=lv,scores={lv_tmp=256..}] run /xp 256L @s
/execute as @a[tag=lv,scores={lv_tmp=256..}] run /scoreboard players remove @s lv_tmp 256
/execute as @a[tag=lv,scores={lv_tmp=128..}] run /xp 128L @s
/execute as @a[tag=lv,scores={lv_tmp=128..}] run /scoreboard players remove @s lv_tmp 128
/execute as @a[tag=lv,scores={lv_tmp=64..}] run /xp 64L @s
/execute as @a[tag=lv,scores={lv_tmp=64..}] run /scoreboard players remove @s lv_tmp 64
/execute as @a[tag=lv,scores={lv_tmp=32..}] run /xp 32L @s
/execute as @a[tag=lv,scores={lv_tmp=32..}] run /scoreboard players remove @s lv_tmp 32
/execute as @a[tag=lv,scores={lv_tmp=16..}] run /xp 16L @s
/execute as @a[tag=lv,scores={lv_tmp=16..}] run /scoreboard players remove @s lv_tmp 16
/execute as @a[tag=lv,scores={lv_tmp=8..}] run /xp 8L @s
/execute as @a[tag=lv,scores={lv_tmp=8..}] run /scoreboard players remove @s lv_tmp 8
/execute as @a[tag=lv,scores={lv_tmp=4..}] run /xp 4L @s
/execute as @a[tag=lv,scores={lv_tmp=4..}] run /scoreboard players remove @s lv_tmp 4
/execute as @a[tag=lv,scores={lv_tmp=2..}] run /xp 2L @s
/execute as @a[tag=lv,scores={lv_tmp=2..}] run /scoreboard players remove @s lv_tmp 2
/execute as @a[tag=lv,scores={lv_tmp=1..}] run /xp 1L @s
/execute as @a[tag=lv,scores={lv_tmp=1..}] run /scoreboard players remove @s lv_tmp 1
/execute as @a[tag=lv,scores={death=1..,online_sum=720..}] run /scoreboard players operation @s lv /= const_2 settings
/tag @a remove lv
```
