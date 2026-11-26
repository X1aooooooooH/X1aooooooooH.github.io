# VIP 系统

- 组成：2 条链 —— VIP 续费与等级、VIP 特权卡
- 说明：续费升级 + 每日特权卡。

## 初始化（本系统自带）

### 计分板

```text
/scoreboard objectives add currency dummy
/scoreboard objectives add vip dummy
/scoreboard objectives add vip_add dummy
/scoreboard objectives add vip_card dummy
/scoreboard objectives add vip_clm dummy
/scoreboard objectives add vip_days dummy
/scoreboard objectives add vip_dur dummy
/scoreboard objectives add vip_exp dummy
/scoreboard objectives add vip_pct dummy
/scoreboard objectives add vip_rem dummy
/scoreboard objectives add vip_snap dummy
/scoreboard objectives add vip_strt dummy
/scoreboard objectives add vip_t1 dummy
/scoreboard objectives add vip_t2 dummy
/scoreboard objectives add vip_t3 dummy
```

### 全局常量（settings）

```text
/scoreboard players set time_rday settings 1
/scoreboard players set vip_coin settings 300
/scoreboard players set vip_d1 settings 2
/scoreboard players set vip_d2 settings 12
/scoreboard players set vip_d3 settings 36
/scoreboard players set vip_d4 settings 76
/scoreboard players set vip_d5 settings 136
/scoreboard players set vip_d6 settings 256
/scoreboard players set vip_d7 settings 456
/scoreboard players set vip_d8 settings 776
/scoreboard players set vip_d9 settings 1376
/scoreboard players set vip_nd1 settings 100
/scoreboard players set vip_nd2 settings 600
/scoreboard players set vip_nd3 settings 1800
/scoreboard players set vip_nd4 settings 3800
/scoreboard players set vip_nd5 settings 6800
/scoreboard players set vip_nd6 settings 12800
/scoreboard players set vip_nd7 settings 22800
/scoreboard players set vip_nd8 settings 38800
/scoreboard players set vip_nd9 settings 68800
/scoreboard players set vip_pc1 settings 3
/scoreboard players set vip_pc2 settings 6
/scoreboard players set vip_pc3 settings 9
/scoreboard players set vip_pc4 settings 12
/scoreboard players set vip_pc5 settings 15
/scoreboard players set vip_pc6 settings 18
/scoreboard players set vip_pc7 settings 21
/scoreboard players set vip_pc8 settings 25
/scoreboard players set vip_pc9 settings 30
/scoreboard players set vip_x1 settings 100
/scoreboard players set vip_x2 settings 600
/scoreboard players set vip_x3 settings 1800
/scoreboard players set vip_x4 settings 3800
/scoreboard players set vip_x5 settings 6800
/scoreboard players set vip_x6 settings 12800
/scoreboard players set vip_x7 settings 22800
/scoreboard players set vip_x8 settings 38800
/scoreboard players set vip_x9 settings 68800
```

### 其他初始化

```text
/scoreboard players add @a vip_days 0
/scoreboard players add time_rday settings 0
```

### 用到的 tag

`vip_card`、vip_renew`

## 链 19：VIP 续费与等级

- 类型：`snake(testfor)`　命令方块：65　触发：玩家带 vip_renew

**步骤**

- 8–27：vip_add 1..9 选档
- 28–40：累加天数/经验
- 41–50：按阈值升级
- 51–59：按等级给百分比
- 60–64：重算剩余天数

**可复用**

- 升级用“从低到高依次覆盖”
- 百分比单存 `vip_pct`

```text
/testfor @a[tag=vip_renew]
[c] /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]
/scoreboard players add @a vip 0
/scoreboard players add @a vip_exp 0
/scoreboard players add @a vip_strt 0
/scoreboard players add @a vip_dur 0
/scoreboard players add @a vip_days 0
/execute as @a[tag=vip_renew] run /scoreboard players set @s vip_t1 0
/execute as @a[tag=vip_renew] run /scoreboard players set @s vip_t2 0
/execute as @a[tag=vip_renew] if score @s vip_add matches 1 run /scoreboard players operation @s vip_t1 = vip_d1 settings
/execute as @a[tag=vip_renew] if score @s vip_add matches 1 run /scoreboard players operation @s vip_t2 = vip_x1 settings
/execute as @a[tag=vip_renew] if score @s vip_add matches 2 run /scoreboard players operation @s vip_t1 = vip_d2 settings
/execute as @a[tag=vip_renew] if score @s vip_add matches 2 run /scoreboard players operation @s vip_t2 = vip_x2 settings
/execute as @a[tag=vip_renew] if score @s vip_add matches 3 run /scoreboard players operation @s vip_t1 = vip_d3 settings
/execute as @a[tag=vip_renew] if score @s vip_add matches 3 run /scoreboard players operation @s vip_t2 = vip_x3 settings
/execute as @a[tag=vip_renew] if score @s vip_add matches 4 run /scoreboard players operation @s vip_t1 = vip_d4 settings
/execute as @a[tag=vip_renew] if score @s vip_add matches 4 run /scoreboard players operation @s vip_t2 = vip_x4 settings
/execute as @a[tag=vip_renew] if score @s vip_add matches 5 run /scoreboard players operation @s vip_t1 = vip_d5 settings
/execute as @a[tag=vip_renew] if score @s vip_add matches 5 run /scoreboard players operation @s vip_t2 = vip_x5 settings
/execute as @a[tag=vip_renew] if score @s vip_add matches 6 run /scoreboard players operation @s vip_t1 = vip_d6 settings
/execute as @a[tag=vip_renew] if score @s vip_add matches 6 run /scoreboard players operation @s vip_t2 = vip_x6 settings
/execute as @a[tag=vip_renew] if score @s vip_add matches 7 run /scoreboard players operation @s vip_t1 = vip_d7 settings
/execute as @a[tag=vip_renew] if score @s vip_add matches 7 run /scoreboard players operation @s vip_t2 = vip_x7 settings
/execute as @a[tag=vip_renew] if score @s vip_add matches 8 run /scoreboard players operation @s vip_t1 = vip_d8 settings
/execute as @a[tag=vip_renew] if score @s vip_add matches 8 run /scoreboard players operation @s vip_t2 = vip_x8 settings
/execute as @a[tag=vip_renew] if score @s vip_add matches 9 run /scoreboard players operation @s vip_t1 = vip_d9 settings
/execute as @a[tag=vip_renew] if score @s vip_add matches 9 run /scoreboard players operation @s vip_t2 = vip_x9 settings
/execute as @a[tag=vip_renew] run /scoreboard players operation @s vip_t3 = @s vip_strt
/execute as @a[tag=vip_renew] run /scoreboard players operation @s vip_t3 += @s vip_dur
/execute as @a[tag=vip_renew] run /scoreboard players operation @s vip_t3 -= time_rday settings
/execute as @a[tag=vip_renew] run /scoreboard players operation @s vip_rem = @s vip_t3
/execute as @a[tag=vip_renew,scores={vip_t3=..0}] run /scoreboard players set @s vip_rem 0
/execute as @a[tag=vip_renew,scores={vip_add=1..9}] run /scoreboard players operation @s vip_days += @s vip_t1
/execute as @a[tag=vip_renew,scores={vip_add=1..9}] if score @s vip_t3 matches ..0 run /scoreboard players operation @s vip_strt = time_rday settings
/execute as @a[tag=vip_renew,scores={vip_add=1..9}] if score @s vip_t3 matches ..0 run /scoreboard players operation @s vip_dur = @s vip_t1
/execute as @a[tag=vip_renew,scores={vip_add=1..9}] if score @s vip_t3 matches 1.. run /scoreboard players operation @s vip_dur += @s vip_t1
/execute as @a[tag=vip_renew,scores={vip_add=1..9}] run /scoreboard players operation @s vip_exp += @s vip_t2
/execute as @a[tag=vip_renew] run /scoreboard players operation @s vip_snap = @s vip_exp
/execute as @a[tag=vip_renew] run /scoreboard players set @s vip_add 0
/execute as @a[tag=vip_renew] run /tag @s remove vip_renew
/scoreboard players set @a vip_pct 0
/execute as @a if score @s vip_exp >= vip_nd1 settings if score @s vip matches ..0 run /scoreboard players set @s vip 1
/execute as @a if score @s vip_exp >= vip_nd2 settings if score @s vip matches ..1 run /scoreboard players set @s vip 2
/execute as @a if score @s vip_exp >= vip_nd3 settings if score @s vip matches ..2 run /scoreboard players set @s vip 3
/execute as @a if score @s vip_exp >= vip_nd4 settings if score @s vip matches ..3 run /scoreboard players set @s vip 4
/execute as @a if score @s vip_exp >= vip_nd5 settings if score @s vip matches ..4 run /scoreboard players set @s vip 5
/execute as @a if score @s vip_exp >= vip_nd6 settings if score @s vip matches ..5 run /scoreboard players set @s vip 6
/execute as @a if score @s vip_exp >= vip_nd7 settings if score @s vip matches ..6 run /scoreboard players set @s vip 7
/execute as @a if score @s vip_exp >= vip_nd8 settings if score @s vip matches ..7 run /scoreboard players set @s vip 8
/execute as @a if score @s vip_exp >= vip_nd9 settings if score @s vip matches ..8 run /scoreboard players set @s vip 9
/execute as @a if score @s vip matches 1.. run /scoreboard players operation @s vip_pct = vip_pc1 settings
/execute as @a if score @s vip matches 2.. run /scoreboard players operation @s vip_pct = vip_pc2 settings
/execute as @a if score @s vip matches 3.. run /scoreboard players operation @s vip_pct = vip_pc3 settings
/execute as @a if score @s vip matches 4.. run /scoreboard players operation @s vip_pct = vip_pc4 settings
/execute as @a if score @s vip matches 5.. run /scoreboard players operation @s vip_pct = vip_pc5 settings
/execute as @a if score @s vip matches 6.. run /scoreboard players operation @s vip_pct = vip_pc6 settings
/execute as @a if score @s vip matches 7.. run /scoreboard players operation @s vip_pct = vip_pc7 settings
/execute as @a if score @s vip matches 8.. run /scoreboard players operation @s vip_pct = vip_pc8 settings
/execute as @a if score @s vip matches 9.. run /scoreboard players operation @s vip_pct = vip_pc9 settings
/execute as @a run /scoreboard players operation @s vip_rem = @s vip_strt
/execute as @a run /scoreboard players operation @s vip_rem += @s vip_dur
/execute as @a run /scoreboard players operation @s vip_rem -= time_rday settings
/execute as @a if score @s vip_rem matches ..-1 run /scoreboard players set @s vip_rem 0
/execute as @a if score @s vip_rem matches ..0 run /scoreboard players set @s vip_pct 0
```

## 链 20：VIP 特权卡

- 类型：`snake(testfor)`　命令方块：12　触发：玩家带 vip_card

**步骤**

- 3–5：卡到期
- 6–7：今天已领
- 8–11：发金币并记录日期

**可复用**

- 每日一次 = `vip_clm < time_rday`
- 次数存在 vip_card，支持多张卡

```text
/testfor @a[tag=vip_card]
[c] /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]
/scoreboard players add @a[tag=vip_card] vip_clm 0
/execute as @a[tag=vip_card,scores={vip_card=..0}] run /tellraw @s {"rawtext":[{"text":"[§c/§f] §f领取失败 特权卡已到期"}]}
/execute as @a[tag=vip_card,scores={vip_card=..0}] run /tag @s remove vip_card
/execute as @a[tag=vip_card] if score @s vip_clm = time_rday settings run /tellraw @s {"rawtext":[{"text":"[§c/§f] §f领取失败 今天已经领取过"}]}
/execute as @a[tag=vip_card] if score @s vip_clm = time_rday settings run /tag @s remove vip_card
/execute as @a[tag=vip_card,scores={vip_card=1..}] if score @s vip_clm < time_rday settings run /tellraw @s {"rawtext":[{"text":"[§a/§f] §f特权卡生效 获得 §e"},{"score":{"name":"vip_coin","objective":"settings"}},{"text":"§r§f 金币"}]}
/execute as @a[tag=vip_card,scores={vip_card=1..}] if score @s vip_clm < time_rday settings run /scoreboard players operation @s currency += vip_coin settings
/execute as @a[tag=vip_card,scores={vip_card=1..}] if score @s vip_clm < time_rday settings run /scoreboard players operation @s vip_clm = time_rday settings
/tag @a[tag=vip_card] remove vip_card
```
