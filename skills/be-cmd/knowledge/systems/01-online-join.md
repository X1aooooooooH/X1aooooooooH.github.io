# 在线与进服

- 组成：2 条链 —— 在线人数与上下线、进服引导
- 说明：人数统计、进出播报，以及新玩家的引导与初始化。

## 初始化（本系统自带）

### 计分板

```text
/scoreboard objectives add online_cur dummy
/scoreboard objectives add online_day dummy
/scoreboard objectives add online_hr dummy
/scoreboard objectives add online_join dummy
/scoreboard objectives add online_min dummy
/scoreboard objectives add online_mth dummy
/scoreboard objectives add online_ody dummy
/scoreboard objectives add online_ohr dummy
/scoreboard objectives add online_omn dummy
/scoreboard objectives add online_omt dummy
/scoreboard objectives add online_orm dummy
/scoreboard objectives add online_oyr dummy
/scoreboard objectives add online_rmn dummy
/scoreboard objectives add online_sum dummy
/scoreboard objectives add online_ttl dummy
/scoreboard objectives add online_uid dummy
/scoreboard objectives add online_yr dummy
/scoreboard objectives add qd_lst dummy
/scoreboard objectives add qd_sum dummy
/scoreboard objectives add time_pmd dummy
/scoreboard objectives add time_pmt dummy
/scoreboard objectives add time_pyr dummy
/scoreboard objectives add time_t1 dummy
/scoreboard objectives add time_t2 dummy
/scoreboard objectives add time_t3 dummy
/scoreboard objectives add vip dummy
/scoreboard objectives add vip_card dummy
/scoreboard objectives add vip_clm dummy
/scoreboard objectives add vip_days dummy
/scoreboard objectives add vip_dur dummy
/scoreboard objectives add vip_exp dummy
/scoreboard objectives add vip_lday dummy
/scoreboard objectives add vip_pct dummy
/scoreboard objectives add vip_rem dummy
/scoreboard objectives add vip_strt dummy
/scoreboard objectives add vip_t1 dummy
```

### 全局常量（settings）

```text
/scoreboard players set const_-1 settings -1
/scoreboard players set const_100 settings 100
/scoreboard players set const_4 settings 4
/scoreboard players set const_400 settings 400
/scoreboard players set cur_players settings 0
/scoreboard players set last_players settings 0
/scoreboard players set time_day settings 1
/scoreboard players set time_hr settings 0
/scoreboard players set time_min settings 0
/scoreboard players set time_mth settings 1
/scoreboard players set time_rday settings 1
/scoreboard players set time_rmin settings 1440
/scoreboard players set time_step settings 60
/scoreboard players set time_yr settings 0
/scoreboard players set vip_dly settings 20
```

### 其他初始化

```text
/scoreboard players add @a vip_days 0
/scoreboard players add time_rday settings 0
```

### 用到的 tag

`fstjoin`、online_join`、vip_card`、vip_renew`

## 链 3：在线人数与上下线

- 类型：`repeat`　命令方块：19　触发：每 tick

**步骤**

- 0–2：链头
- 3–7：人数统计，变化时重排 UID
- 8–13：差值播报 +N/−N
- 14–18：重置 online_join

**可复用**

- 假玩家 `cur_players` 当场算人数
- 差值 `last -= cur`：正=进，负=退

```text
/scoreboard players test time_step settings 1
[c] /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]
/scoreboard players set cur_players settings 0
/execute as @a run /scoreboard players add cur_players settings 1
/execute unless score last_players settings = cur_players settings run /scoreboard players set @a online_uid -1
/execute unless score last_players settings = cur_players settings run /scoreboard players operation @a online_uid -= @a[scores={online_uid=..-1}] online_uid
/execute unless score last_players settings = cur_players settings run /title @a title §r
/scoreboard players operation last_players settings -= cur_players settings
/execute if score last_players settings matches 1.. run /titleraw @a subtitle {"rawtext":[{"text":"在线人数 §c-"},{"score":{"name":"last_players","objective":"settings"}}]}
/execute if score last_players settings matches ..-1 run /scoreboard players operation last_players settings *= const_-1 settings
[c] /titleraw @a subtitle {"rawtext":[{"text":"在线人数 §a+"},{"score":{"name":"last_players","objective":"settings"}}]}
/execute unless score last_players settings matches 0 as @a at @s run /playsound note.harp
/scoreboard players operation last_players settings = cur_players settings
/scoreboard players add @a online_join 0
/execute as @a[scores={online_join=0}] run /tag @s add online_join
/scoreboard objectives remove online_join
/scoreboard objectives add online_join dummy
/scoreboard players set @a online_join 1
```

## 链 4：进服引导

- 类型：`snake(testfor)`　命令方块：123　触发：新玩家带 online_join

**步骤**

- 3–8：禁移动、标题、抗性、相机
- 9–12：抬头后解锁并初始化分数
- 13–32：VIP/签到分数补齐
- 33–44：首次加入与欢迎
- 45–47：VIP 展示
- 48–91：离线时长借位
- 92–122：分级欢迎语与清 tag

**可复用**

- `rx` 当“已完成动作”的判定
- 借位用 `matches ..-1` 判定后补位

```text
/testfor @a[tag=online_join]
[c] /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]
/inputpermission set @a[tag=online_join] movement disabled
/title @a[tag=online_join] times 0 100 10
/titleraw @a[tag=online_join] title {"rawtext":[{"text":"◆"}]}
/titleraw @a[tag=online_join] subtitle {"rawtext":[{"text":"请抬头以进入游戏..."}]}
/effect @a[tag=online_join] resistance 1 255 true
/camera @a[tag=online_join] fade time 0 1 1 color 0 0 0
/inputpermission set @a[tag=online_join,rx=-80] movement enabled
/execute as @a[tag=online_join,rx=-80] run /scoreboard players set @s online_ttl 0
/execute as @a[tag=online_join,rx=-80] run /scoreboard players add @s online_sum 0
/execute as @a[tag=online_join,rx=-80] run /scoreboard players add @s online_cur 0
/execute as @a[tag=online_join,rx=-80,scores={online_ttl=0}] run /scoreboard players add @s vip 0
/execute as @a[tag=online_join,rx=-80,scores={online_ttl=0}] run /scoreboard players add @s vip_exp 0
/execute as @a[tag=online_join,rx=-80,scores={online_ttl=0}] run /scoreboard players add @s vip_lday 0
/execute as @a[tag=online_join,rx=-80,scores={online_ttl=0}] run /scoreboard players add @s vip_pct 0
/execute as @a[tag=online_join,rx=-80,scores={online_ttl=0}] run /scoreboard players add @s vip_strt 0
/execute as @a[tag=online_join,rx=-80,scores={online_ttl=0}] run /scoreboard players add @s vip_dur 0
/execute as @a[tag=online_join,rx=-80,scores={online_ttl=0}] run /scoreboard players add @s vip_days 0
/execute as @a[tag=online_join,rx=-80,scores={online_ttl=0}] run /scoreboard players add @s vip_rem 0
/execute as @a[tag=online_join,rx=-80,scores={online_ttl=0}] run /scoreboard players operation @s vip_t1 = @s vip_strt
/execute as @a[tag=online_join,rx=-80,scores={online_ttl=0}] run /scoreboard players operation @s vip_t1 += @s vip_dur
/execute as @a[tag=online_join,rx=-80,scores={online_ttl=0}] run /scoreboard players operation @s vip_t1 -= time_rday settings
/execute as @a[tag=online_join,rx=-80,scores={online_ttl=0}] run /scoreboard players operation @s vip_rem = @s vip_t1
/execute as @a[tag=online_join,rx=-80,scores={online_ttl=0}] if score @s vip_rem matches ..-1 run /scoreboard players set @s vip_rem 0
/execute as @a[tag=online_join,rx=-80,scores={online_ttl=0}] if score @s vip_rem matches ..0 run /scoreboard players set @s vip_pct 0
/execute as @a[tag=online_join,rx=-80,scores={online_ttl=0}] if score @s vip_lday < time_rday settings if score @s vip matches 1.. run /scoreboard players operation @s vip_exp += vip_dly settings
/execute as @a[tag=online_join,rx=-80,scores={online_ttl=0}] if score @s vip_lday < time_rday settings if score @s vip matches 1.. run /tag @s add vip_renew
/execute as @a[tag=online_join,rx=-80,scores={online_ttl=0}] if score @s vip_lday < time_rday settings run /scoreboard players operation @s vip_lday = time_rday settings
/execute as @a[tag=online_join,rx=-80,scores={online_ttl=0}] run /scoreboard players add @s vip_card 0
/execute as @a[tag=online_join,rx=-80,scores={online_ttl=0}] run /scoreboard players add @s vip_clm 0
/execute as @a[tag=online_join,rx=-80,scores={online_ttl=0}] if score @s vip_card matches 1.. if score @s vip_clm < time_rday settings run /tag @s add vip_card
/execute as @a[tag=online_join,rx=-80,scores={online_sum=0}] run /tag @s add fstjoin
/execute as @a[tag=online_join,rx=-80,scores={online_sum=0}] run /scoreboard players set @s online_ttl 5
/execute as @a[tag=online_join,rx=-80,scores={online_sum=0}] run /scoreboard players operation @s online_yr = time_yr settings
/execute as @a[tag=online_join,rx=-80,scores={online_sum=0}] run /scoreboard players operation @s online_mth = time_mth settings
/execute as @a[tag=online_join,rx=-80,scores={online_sum=0}] run /scoreboard players operation @s online_day = time_day settings
/execute as @a[tag=online_join,rx=-80,scores={online_sum=0}] run /scoreboard players operation @s online_hr = time_hr settings
/execute as @a[tag=online_join,rx=-80,scores={online_sum=0}] run /scoreboard players operation @s online_min = time_min settings
/execute as @a[tag=online_join,rx=-80,scores={online_sum=0}] run /scoreboard players operation @s online_rmn = time_rmin settings
/execute as @a[tag=online_join,rx=-80,scores={online_sum=0}] run /tellraw @s {"rawtext":[{"text":"欢迎首次加入本服务器"}]}
/execute as @a[tag=online_join,rx=-80,scores={online_sum=0}] run /playsound random.chestopen @s
/execute as @a[tag=online_join,rx=-80,scores={online_sum=0}] run /scoreboard players set @s online_sum 1
/execute as @a[tag=online_join,rx=-80,scores={online_sum=0}] run /scoreboard players add @s online_cur 1
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1,online_ttl=5,vip_rem=1..}] run /tellraw @s {"rawtext": [{"text": "[§e/§f] VIP系统\n§f"}, {"text": "VIP 等级：§e"}, {"score": {"name": "@s", "objective": "vip"}}, {"text": "\n§r§f剩余：§e"}, {"score": {"name": "@s", "objective": "vip_rem"}}, {"text": "§r§f 天\n累计开通：§e"}, {"score": {"name": "@s", "objective": "vip_days"}}, {"text": "§r§f 天\n特权卡剩余：§e"}, {"score": {"name": "@s", "objective": "vip_card"}}, {"text": "§r§f 次"}]}
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1,online_ttl=5,vip_rem=..0}] run /tellraw @s {"rawtext": [{"text": "[§e/§f] VIP系统\n§f"}, {"text": "VIP 等级：§e"}, {"score": {"name": "@s", "objective": "vip"}}, {"text": "\n§r§f尚未开通VIP\n累计开通：§e"}, {"score": {"name": "@s", "objective": "vip_days"}}, {"text": "§r§f 天\n特权卡剩余：§e"}, {"score": {"name": "@s", "objective": "vip_card"}}, {"text": "§r§f 次"}]}
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1,online_ttl=5}] run /tag @s remove online_join
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] run /scoreboard players operation @s time_t1 = time_min settings
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] run /scoreboard players operation @s time_t2 = time_hr settings
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] run /scoreboard players operation @s time_t3 = time_day settings
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] run /scoreboard players operation @s time_pmt = time_mth settings
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] run /scoreboard players operation @s time_pyr = time_yr settings
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] run /scoreboard players operation @s online_omn = @s time_t1
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] run /scoreboard players operation @s online_omn -= @s online_min
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_omn matches ..-1 run /scoreboard players remove @s time_t2 1
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_omn matches ..-1 run /scoreboard players add @s online_omn 60
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] run /scoreboard players operation @s online_ohr = @s time_t2
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] run /scoreboard players operation @s online_ohr -= @s online_hr
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_ohr matches ..-1 run /scoreboard players remove @s time_t3 1
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_ohr matches ..-1 run /scoreboard players add @s online_ohr 24
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] run /scoreboard players operation @s online_ody = @s time_t3
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] run /scoreboard players operation @s online_ody -= @s online_day
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_ody matches ..-1 run /scoreboard players remove @s time_pmt 1
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_ody matches ..-1 if score @s time_pmt matches 0 run /scoreboard players set @s time_pmt 12
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_ody matches ..-1 if score @s time_pmt matches 12 run /scoreboard players remove @s time_pyr 1
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_ody matches ..-1 run /scoreboard players set @s time_pmd 31
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_ody matches ..-1 if score @s time_pmt matches 4 run /scoreboard players set @s time_pmd 30
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_ody matches ..-1 if score @s time_pmt matches 6 run /scoreboard players set @s time_pmd 30
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_ody matches ..-1 if score @s time_pmt matches 9 run /scoreboard players set @s time_pmd 30
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_ody matches ..-1 if score @s time_pmt matches 11 run /scoreboard players set @s time_pmd 30
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_ody matches ..-1 if score @s time_pmt matches 2 run /scoreboard players set @s time_pmd 28
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_ody matches ..-1 if score @s time_pmt matches 2 run /scoreboard players set @s time_t2 0
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_ody matches ..-1 if score @s time_pmt matches 2 run /scoreboard players operation @s time_t1 = @s time_pyr
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_ody matches ..-1 if score @s time_pmt matches 2 run /scoreboard players operation @s time_t1 %= const_4 settings
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_ody matches ..-1 if score @s time_pmt matches 2 if score @s time_t1 matches 0 run /scoreboard players set @s time_t2 1
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_ody matches ..-1 if score @s time_pmt matches 2 run /scoreboard players operation @s time_t1 = @s time_pyr
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_ody matches ..-1 if score @s time_pmt matches 2 run /scoreboard players operation @s time_t1 %= const_100 settings
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_ody matches ..-1 if score @s time_pmt matches 2 if score @s time_t1 matches 0 run /scoreboard players set @s time_t2 0
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_ody matches ..-1 if score @s time_pmt matches 2 run /scoreboard players operation @s time_t1 = @s time_pyr
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_ody matches ..-1 if score @s time_pmt matches 2 run /scoreboard players operation @s time_t1 %= const_400 settings
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_ody matches ..-1 if score @s time_pmt matches 2 if score @s time_t1 matches 0 run /scoreboard players set @s time_t2 1
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_ody matches ..-1 if score @s time_pmt matches 2 if score @s time_t2 matches 1 run /scoreboard players set @s time_pmd 29
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_ody matches ..-1 run /scoreboard players operation @s online_ody += @s time_pmd
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] run /scoreboard players operation @s online_omt = @s time_pmt
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] run /scoreboard players operation @s online_omt -= @s online_mth
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_omt matches ..-1 run /scoreboard players remove @s time_pyr 1
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_omt matches ..-1 run /scoreboard players add @s online_omt 12
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] run /scoreboard players operation @s online_oyr = @s time_pyr
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] run /scoreboard players operation @s online_oyr -= @s online_yr
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] run /scoreboard players operation @s online_orm = time_rmin settings
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] run /scoreboard players operation @s online_orm -= @s online_rmn
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0,online_orm=0..10,online_oyr=0,online_omt=0,online_ody=0,online_ohr=0}] run /tellraw @s {"rawtext":[{"text":"欢迎回来！"}]}
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0,online_orm=0..10,online_oyr=0,online_omt=0,online_ody=0,online_ohr=0}] run /scoreboard players operation @s online_yr = time_yr settings
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0,online_orm=0..10,online_oyr=0,online_omt=0,online_ody=0,online_ohr=0}] run /scoreboard players operation @s online_mth = time_mth settings
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0,online_orm=0..10,online_oyr=0,online_omt=0,online_ody=0,online_ohr=0}] run /scoreboard players operation @s online_day = time_day settings
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0,online_orm=0..10,online_oyr=0,online_omt=0,online_ody=0,online_ohr=0}] run /scoreboard players operation @s online_hr = time_hr settings
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0,online_orm=0..10,online_oyr=0,online_omt=0,online_ody=0,online_ohr=0}] run /scoreboard players operation @s online_min = time_min settings
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0,online_orm=0..10,online_oyr=0,online_omt=0,online_ody=0,online_ohr=0}] run /scoreboard players operation @s online_rmn = time_rmin settings
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0,online_orm=0..10,online_oyr=0,online_omt=0,online_ody=0,online_ohr=0,vip_rem=1..}] run /tellraw @s {"rawtext": [{"text": "[§e/§f] §fVIP系统\n"}, {"text": "VIP 等级：§e"}, {"score": {"name": "@s", "objective": "vip"}}, {"text": "\n§r§f剩余：§e"}, {"score": {"name": "@s", "objective": "vip_rem"}}, {"text": "§r§f 天\n累计开通：§e"}, {"score": {"name": "@s", "objective": "vip_days"}}, {"text": "§r§f 天\n特权卡剩余：§e"}, {"score": {"name": "@s", "objective": "vip_card"}}, {"text": "§r§f 次"}]}
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0,online_orm=0..10,online_oyr=0,online_omt=0,online_ody=0,online_ohr=0,vip_rem=..0}] run /tellraw @s {"rawtext": [{"text": "[§e/§f] §fVIP系统\n"}, {"text": "VIP 等级：§e"}, {"score": {"name": "@s", "objective": "vip"}}, {"text": "\n§r§f尚未开通VIP\n累计开通：§e"}, {"score": {"name": "@s", "objective": "vip_days"}}, {"text": "§r§f 天\n特权卡剩余：§e"}, {"score": {"name": "@s", "objective": "vip_card"}}, {"text": "§r§f 次"}]}
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0,online_orm=0..10,online_oyr=0,online_omt=0,online_ody=0,online_ohr=0}] run /playsound random.chestopen @s
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0,online_orm=0..10,online_oyr=0,online_omt=0,online_ody=0,online_ohr=0}] run /tag @s remove online_join
/scoreboard players add @a qd_lst 0
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_oyr matches 1.. run /scoreboard players set @s online_ttl 4
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_omt matches 1.. run /scoreboard players set @s online_ttl 4
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_oyr matches 0 if score @s online_omt matches 0 if score @s online_ody matches 4.. run /scoreboard players set @s online_ttl 3
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=0}] if score @s online_oyr matches 0 if score @s online_omt matches 0 if score @s online_ody matches 0..3 run /scoreboard players set @s online_ttl 2
/scoreboard players add @a qd_sum 0
/execute as @a[tag=online_join,rx=-80,scores={online_ttl=2}] run /tellraw @s {"rawtext":[{"text":"[§e/§f] §f"},{"text":"离线时间 "},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_oyr=1..}]"},{"score":{"name":"@s","objective":"online_oyr"}},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_oyr=1..}]"},{"text":"年"},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_omt=1..}]"},{"score":{"name":"@s","objective":"online_omt"}},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_omt=1..}]"},{"text":"月"},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_ody=1..}]"},{"score":{"name":"@s","objective":"online_ody"}},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_ody=1..}]"},{"text":"天"},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_ohr=1..}]"},{"score":{"name":"@s","objective":"online_ohr"}},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_ohr=1..}]"},{"text":"时"},{"text":"§7"}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_omn=1..}]"},{"score":{"name":"@s","objective":"online_omn"}},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_omn=1..}]"},{"text":"分"},{"text":""}]}},{"text":"\n欢迎回来，继续冒险吧！"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_cur=0}]"},{"text":"\n今日首次登录，祝你游戏愉快！"},{"text":""}]}}]}
/execute as @a[tag=online_join,rx=-80,scores={online_ttl=3}] run /tellraw @s {"rawtext":[{"text":"[§e/§f] §f"},{"text":"离线时间："},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_oyr=1..}]"},{"score":{"name":"@s","objective":"online_oyr"}},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_oyr=1..}]"},{"text":"年"},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_omt=1..}]"},{"score":{"name":"@s","objective":"online_omt"}},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_omt=1..}]"},{"text":"月"},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_ody=1..}]"},{"score":{"name":"@s","objective":"online_ody"}},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_ody=1..}]"},{"text":"天"},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_ohr=1..}]"},{"score":{"name":"@s","objective":"online_ohr"}},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_ohr=1..}]"},{"text":"时"},{"text":"§7"}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_omn=1..}]"},{"score":{"name":"@s","objective":"online_omn"}},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_omn=1..}]"},{"text":"分"},{"text":""}]}},{"text":"\n好久不见，服务器一直为你留着位置！"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_cur=0}]"},{"text":"\n今日首次登录，祝你游戏愉快！"},{"text":""}]}}]}
/execute as @a[tag=online_join,rx=-80,scores={online_ttl=4}] run /tellraw @s {"rawtext":[{"text":"[§e/§f] §f"},{"text":"离线时间："},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_oyr=1..}]"},{"score":{"name":"@s","objective":"online_oyr"}},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_oyr=1..}]"},{"text":"年"},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_omt=1..}]"},{"score":{"name":"@s","objective":"online_omt"}},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_omt=1..}]"},{"text":"月"},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_ody=1..}]"},{"score":{"name":"@s","objective":"online_ody"}},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_ody=1..}]"},{"text":"天"},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_ohr=1..}]"},{"score":{"name":"@s","objective":"online_ohr"}},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_ohr=1..}]"},{"text":"时"},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_omn=1..}]"},{"score":{"name":"@s","objective":"online_omn"}},{"text":""}]}},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_omn=1..}]"},{"text":"分"},{"text":""}]}},{"text":"\n欢迎回归，新的旅程等你开启！"},{"translate":"%%2","with":{"rawtext":[{"selector":"@s[scores={online_cur=0}]"},{"text":"\n今日首次登录，祝你游戏愉快！"},{"text":""}]}}]}
/execute as @a[tag=online_join,rx=-80,scores={online_ttl=2..4,vip_rem=1..}] run /tellraw @s {"rawtext": [{"text": "[§e/§f] VIP系统\n§f"}, {"text": "VIP 等级：§e"}, {"score": {"name": "@s", "objective": "vip"}}, {"text": "\n§r§f剩余：§e"}, {"score": {"name": "@s", "objective": "vip_rem"}}, {"text": "§r§f 天\n累计开通：§e"}, {"score": {"name": "@s", "objective": "vip_days"}}, {"text": "§r§f 天\n特权卡剩余：§e"}, {"score": {"name": "@s", "objective": "vip_card"}}, {"text": "§r§f 次"}]}
/execute as @a[tag=online_join,rx=-80,scores={online_ttl=2..4,vip_rem=..0}] run /tellraw @s {"rawtext": [{"text": "[§e/§f] §fVIP系统\n"}, {"text": "VIP 等级：§e"}, {"score": {"name": "@s", "objective": "vip"}}, {"text": "\n§r§f尚未开通VIP\n累计开通：§e"}, {"score": {"name": "@s", "objective": "vip_days"}}, {"text": "§r§f 天\n特权卡剩余：§e"}, {"score": {"name": "@s", "objective": "vip_card"}}, {"text": "§r§f 次"}]}
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=2..4}] run /scoreboard players operation @s online_yr = time_yr settings
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=2..4}] run /scoreboard players operation @s online_mth = time_mth settings
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=2..4}] run /scoreboard players operation @s online_day = time_day settings
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=2..4}] run /scoreboard players operation @s online_hr = time_hr settings
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=2..4}] run /scoreboard players operation @s online_min = time_min settings
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=2..4}] run /scoreboard players operation @s online_rmn = time_rmin settings
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=2..4}] run /playsound random.chestopen @s
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=2..4,online_cur=0}] run /scoreboard players add @s online_cur 1
/execute as @a[tag=online_join,rx=-80,scores={online_sum=1..,online_ttl=2..4}] run /tag @s remove online_join
```
