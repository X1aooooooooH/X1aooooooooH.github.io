# 时间系统

- 组成：1 条链 —— 时间系统
- 说明：虚拟时钟：年月日时分 + 闰年，驱动每日重置。

## 初始化（本系统自带）

### 计分板

```text
/scoreboard objectives add online_cur dummy
/scoreboard objectives add online_day dummy
/scoreboard objectives add online_hr dummy
/scoreboard objectives add online_join dummy
/scoreboard objectives add online_min dummy
/scoreboard objectives add online_mth dummy
/scoreboard objectives add online_rmn dummy
/scoreboard objectives add online_sum dummy
/scoreboard objectives add online_yr dummy
/scoreboard objectives add qd dummy
/scoreboard objectives add qd_ch1 dummy
/scoreboard objectives add qd_ch2 dummy
/scoreboard objectives add time_t1 dummy
/scoreboard objectives add vip_card dummy
/scoreboard objectives add vip_cday dummy
/scoreboard objectives add vip_cflg dummy
/scoreboard objectives add vip_cgap dummy
/scoreboard objectives add vip_dur dummy
/scoreboard objectives add vip_exp dummy
/scoreboard objectives add vip_pct dummy
/scoreboard objectives add vip_rem dummy
/scoreboard objectives add vip_snap dummy
/scoreboard objectives add vip_strt dummy
```

### 全局常量（settings）

```text
/scoreboard players set const_100 settings 100
/scoreboard players set const_1440 settings 1440
/scoreboard players set const_24 settings 24
/scoreboard players set const_4 settings 4
/scoreboard players set const_400 settings 400
/scoreboard players set const_60 settings 60
/scoreboard players set qd_cnt settings 0
/scoreboard players set time_day settings 1
/scoreboard players set time_hr settings 0
/scoreboard players set time_leap settings 1
/scoreboard players set time_mday settings 31
/scoreboard players set time_min settings 0
/scoreboard players set time_mth settings 1
/scoreboard players set time_rday settings 1
/scoreboard players set time_rmin settings 1440
/scoreboard players set time_step settings 60
/scoreboard players set time_yr settings 0
```

### 其他初始化

```text
/scoreboard players add time_rday settings 0
```

### 用到的 tag

`sign_now`、vip_renew`

## 链 5：时间系统

- 类型：`impulse`　命令方块：76　触发：每 tick

**步骤**

- 0–5：分钟→天数
- 6–15：每日 0 点重置
- 16–24：分→时→日进位
- 25–45：月份/闰年/当月天数
- 46–51：同步给玩家
- 52–66：VIP 卡按天扣减
- 67–75：剩余天数与快照

**可复用**

- `%1440==0` 触发每日重置
- 闰年 = `%4==0 && (%100!=0 || %400==0)`

```text
/scoreboard players add time_rmin settings 1
/scoreboard players operation time_t1 settings = time_rmin settings
/scoreboard players operation time_t1 settings /= const_1440 settings
/scoreboard players operation time_rday settings = time_t1 settings
/scoreboard players operation time_t1 settings = time_rmin settings
/scoreboard players operation time_t1 settings %= const_1440 settings
/execute if score time_t1 settings matches 0 run /scoreboard objectives remove online_cur
/execute if score time_t1 settings matches 0 run /scoreboard objectives add online_cur dummy
/execute if score time_t1 settings matches 0 run /scoreboard objectives remove qd
/execute if score time_t1 settings matches 0 run /scoreboard objectives add qd dummy
/execute if score time_t1 settings matches 0 run /scoreboard players set qd_cnt settings 0
/execute if score time_t1 settings matches 0 run /scoreboard players set @a qd_ch1 0
/execute if score time_t1 settings matches 0 run /scoreboard players set @a qd_ch2 0
/tag @a[tag=sign_now,tag=!qd] remove sign_now
/scoreboard players add @a[tag=!online_join] online_cur 1
/scoreboard players add @a[tag=!online_join] online_sum 1
/scoreboard players operation time_min settings += time_step settings
/scoreboard players operation time_t1 settings = time_min settings
/scoreboard players operation time_t1 settings /= const_60 settings
/scoreboard players operation time_hr settings += time_t1 settings
/scoreboard players operation time_min settings %= const_60 settings
/scoreboard players operation time_t1 settings = time_hr settings
/scoreboard players operation time_t1 settings /= const_24 settings
/scoreboard players operation time_day settings += time_t1 settings
/scoreboard players operation time_hr settings %= const_24 settings
/execute if score time_day settings > time_mday settings run /scoreboard players add time_mth settings 1
/execute if score time_day settings > time_mday settings run /scoreboard players set time_day settings 1
/execute if score time_mth settings matches 13.. run /scoreboard players add time_yr settings 1
/execute if score time_mth settings matches 13.. run /scoreboard players set time_mth settings 1
/scoreboard players set time_leap settings 0
/scoreboard players operation time_t1 settings = time_yr settings
/scoreboard players operation time_t1 settings %= const_4 settings
/execute if score time_t1 settings matches 0 run /scoreboard players set time_leap settings 1
/scoreboard players operation time_t1 settings = time_yr settings
/scoreboard players operation time_t1 settings %= const_100 settings
/execute if score time_t1 settings matches 0 run /scoreboard players set time_leap settings 0
/scoreboard players operation time_t1 settings = time_yr settings
/scoreboard players operation time_t1 settings %= const_400 settings
/execute if score time_t1 settings matches 0 run /scoreboard players set time_leap settings 1
/scoreboard players set time_mday settings 31
/execute if score time_mth settings matches 4 run /scoreboard players set time_mday settings 30
/execute if score time_mth settings matches 6 run /scoreboard players set time_mday settings 30
/execute if score time_mth settings matches 9 run /scoreboard players set time_mday settings 30
/execute if score time_mth settings matches 11 run /scoreboard players set time_mday settings 30
/execute if score time_mth settings matches 2 run /scoreboard players set time_mday settings 28
/execute if score time_mth settings matches 2 if score time_leap settings matches 1 run /scoreboard players set time_mday settings 29
/scoreboard players operation @a[tag=!online_join] online_yr = time_yr settings
/scoreboard players operation @a[tag=!online_join] online_mth = time_mth settings
/scoreboard players operation @a[tag=!online_join] online_day = time_day settings
/scoreboard players operation @a[tag=!online_join] online_hr = time_hr settings
/scoreboard players operation @a[tag=!online_join] online_min = time_min settings
/scoreboard players operation @a[tag=!online_join] online_rmn = time_rmin settings
/scoreboard players add @a vip_card 0
/scoreboard players add @a vip_cday 0
/scoreboard players add @a vip_cflg 0
/scoreboard players add @a vip_cgap 0
/execute as @a[scores={vip_card=..0}] run /scoreboard players set @s vip_cflg 1
/execute as @a[scores={vip_card=1..,vip_cflg=1}] run /scoreboard players operation @s vip_cday = time_rday settings
/execute as @a[scores={vip_card=1..,vip_cflg=1}] run /scoreboard players set @s vip_cflg 0
/execute as @a[scores={vip_card=1..,vip_cday=..0}] run /scoreboard players operation @s vip_cday = time_rday settings
/execute as @a[scores={vip_card=1..}] run /scoreboard players operation @s vip_cgap = time_rday settings
/execute as @a[scores={vip_card=1..}] run /scoreboard players operation @s vip_cgap -= @s vip_cday
/execute as @a[scores={vip_card=1..,vip_cgap=1..}] run /scoreboard players operation @s vip_card -= @s vip_cgap
/execute as @a[scores={vip_card=..-1}] run /scoreboard players set @s vip_card 0
/execute as @a[scores={vip_card=..0}] run /scoreboard players operation @s vip_cday = time_rday settings
/execute as @a[scores={vip_card=..0}] run /scoreboard players set @s vip_cflg 1
/execute as @a[scores={vip_card=1..,vip_cgap=1..}] run /scoreboard players operation @s vip_cday = time_rday settings
/execute as @a run /scoreboard players operation @s vip_rem = @s vip_strt
/execute as @a run /scoreboard players operation @s vip_rem += @s vip_dur
/execute as @a run /scoreboard players operation @s vip_rem -= time_rday settings
/execute as @a if score @s vip_rem matches ..-1 run /scoreboard players set @s vip_rem 0
/execute as @a if score @s vip_rem matches ..0 run /scoreboard players set @s vip_pct 0
/scoreboard players add @a vip_exp 0
/scoreboard players add @a vip_snap 0
/execute as @a unless score @s vip_exp = @s vip_snap run /tag @s add vip_renew
/execute as @a unless score @s vip_exp = @s vip_snap run /scoreboard players operation @s vip_snap = @s vip_exp
```
