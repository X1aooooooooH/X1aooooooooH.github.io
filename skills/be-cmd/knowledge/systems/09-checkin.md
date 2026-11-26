# 签到系统

- 组成：3 条链 —— 签到、补签卡、宝箱发放
- 说明：签到、补签卡、宝箱发放。

## 初始化（本系统自带）

### 计分板

```text
/scoreboard objectives add chest dummy
/scoreboard objectives add currency dummy
/scoreboard objectives add online_cur dummy
/scoreboard objectives add qd dummy
/scoreboard objectives add qd_base dummy
/scoreboard objectives add qd_card dummy
/scoreboard objectives add qd_ch1 dummy
/scoreboard objectives add qd_ch2 dummy
/scoreboard objectives add qd_lst dummy
/scoreboard objectives add qd_make dummy
/scoreboard objectives add qd_mday dummy
/scoreboard objectives add qd_mile dummy
/scoreboard objectives add qd_prev dummy
/scoreboard objectives add qd_sum dummy
/scoreboard objectives add qd_tmp dummy
/scoreboard objectives add qd_tmp2 dummy
/scoreboard objectives add qd_tmp3 dummy
/scoreboard objectives add qd_tmp4 dummy
/scoreboard objectives add qd_yday dummy
/scoreboard objectives add vip_pct dummy
/scoreboard objectives add vip_t1 dummy
/scoreboard objectives add vip_t2 dummy
```

### 全局常量（settings）

```text
/scoreboard players set const_2000 settings 2000
/scoreboard players set const_3000 settings 3000
/scoreboard players set const_5000 settings 5000
/scoreboard players set const_7 settings 7
/scoreboard players set const_8 settings 8
/scoreboard players set qd_bs settings 500
/scoreboard players set qd_cnt settings 0
/scoreboard players set qd_r1 settings 300
/scoreboard players set qd_r2 settings 200
/scoreboard players set qd_r3 settings 100
/scoreboard players set time_rday settings 1
/scoreboard players set vip_hund settings 100
```

### 其他初始化

```text
/scoreboard players add @a qd_base 0
/scoreboard players add time_rday settings 0
```

### 用到的 tag

`qd`、qd_card`、sign_now`

## 链 16：签到

- 类型：`snake(testfor)`　命令方块：66　触发：玩家带 qd

**步骤**

- 4：闸门
- 5–10：在线不足 10 分钟
- 11–16：今日已签
- 17–29：基础 + 连签倍率
- 30–34：3/7/14 天里程碑
- 35–41：VIP 百分比加成
- 42–53：宝箱 1..4
- 54–65：播报与收尾

**可复用**

- 连签：`上次签到日 - 今天 == -1`
- 概率用 1..10000 随机数配区间

```text
/testfor @a[tag=qd]
[c] /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]
/scoreboard players add @a[tag=qd] qd 0
/execute unless entity @a[tag=sign_now] as @a[tag=qd,c=1] run /tag @s add sign_now
/execute as @a[tag=sign_now,scores={online_cur=..9,qd=0}] run /title @s title §c✘
/execute as @a[tag=sign_now,scores={online_cur=..9,qd=0}] run /title @s subtitle §f签到失败
/execute as @a[tag=sign_now,scores={online_cur=..9,qd=0}] run /playsound random.anvil_land @s
/execute as @a[tag=sign_now,scores={online_cur=..9,qd=0}] run /tellraw @s {"rawtext":[{"text":"[§c/§f] §f今日在线时间尚未满 §e10§r§f 分钟\n§7不妨先游玩吧，还有很多地方等待探索"}]}
/execute as @a[tag=sign_now,scores={online_cur=..9,qd=0}] run /tag @s remove qd
/execute as @a[tag=sign_now,scores={online_cur=..9,qd=0}] run /tag @s remove sign_now
/execute as @a[tag=sign_now,scores={qd=1..}] run /title @s title §c✘
/execute as @a[tag=sign_now,scores={qd=1..}] run /title @s subtitle §f签到失败
/execute as @a[tag=sign_now,scores={qd=1..}] run /playsound random.anvil_land @s
/execute as @a[tag=sign_now,scores={qd=1..}] run /tellraw @s {"rawtext":[{"text":"[§c/§f] §f您今日已签到\n§7不要一直薅羊毛啦，试试别的玩法吧"}]}
/execute as @a[tag=sign_now,scores={qd=1..}] run /tag @s remove qd
/execute as @a[tag=sign_now,scores={qd=1..}] run /tag @s remove sign_now
/execute as @a[tag=sign_now,scores={qd=0}] run /scoreboard players operation @s qd_base = qd_bs settings
/execute if score qd_cnt settings matches 0 as @a[tag=sign_now,scores={qd=0}] run /scoreboard players operation @s qd_base += qd_r1 settings
/execute if score qd_cnt settings matches 1 as @a[tag=sign_now,scores={qd=0}] run /scoreboard players operation @s qd_base += qd_r2 settings
/execute if score qd_cnt settings matches 2 as @a[tag=sign_now,scores={qd=0}] run /scoreboard players operation @s qd_base += qd_r3 settings
/execute as @a[tag=sign_now,scores={qd=0}] run /scoreboard players add qd_cnt settings 1
/execute as @a[tag=sign_now,scores={qd=0}] run /scoreboard players operation @s qd_prev = @s qd_lst
/execute as @a[tag=sign_now,scores={qd=0}] run /scoreboard players operation @s qd_lst -= time_rday settings
/execute as @a[tag=sign_now,scores={qd=0,qd_lst=-1}] run /scoreboard players add @s qd_sum 1
/execute as @a[tag=sign_now,scores={qd=0}] unless score @s qd_lst matches -1 run /scoreboard players set @s qd_sum 1
/execute as @a[tag=sign_now,scores={qd=0}] run /scoreboard players operation @s qd_tmp2 = @s qd_sum
/execute as @a[tag=sign_now,scores={qd=0}] run /scoreboard players operation @s qd_tmp2 /= const_8 settings
/execute as @a[tag=sign_now,scores={qd=0}] run /scoreboard players add @s qd_tmp2 1
/execute as @a[tag=sign_now,scores={qd=0}] run /scoreboard players operation @s qd_base *= @s qd_tmp2
/execute as @a[tag=sign_now,scores={qd=0,qd_sum=3}] run /scoreboard players operation @s qd_base += const_2000 settings
/execute as @a[tag=sign_now,scores={qd=0,qd_sum=7}] run /scoreboard players operation @s qd_base += const_5000 settings
/execute as @a[tag=sign_now,scores={qd=0,qd_sum=14..}] run /scoreboard players operation @s qd_mile = @s qd_sum
/execute as @a[tag=sign_now,scores={qd=0,qd_sum=14..}] run /scoreboard players operation @s qd_mile %= const_7 settings
/execute as @a[tag=sign_now,scores={qd=0,qd_sum=14..}] if score @s qd_mile matches 0 run /scoreboard players operation @s qd_base += const_3000 settings
/execute as @a[tag=sign_now,scores={qd=0}] run /scoreboard players operation @s vip_t1 = vip_hund settings
/execute as @a[tag=sign_now,scores={qd=0}] run /scoreboard players operation @s vip_t1 += @s vip_pct
/execute as @a[tag=sign_now,scores={qd=0}] run /scoreboard players operation @s vip_t2 = @s qd_base
/execute as @a[tag=sign_now,scores={qd=0}] run /scoreboard players operation @s vip_t2 *= @s vip_t1
/execute as @a[tag=sign_now,scores={qd=0}] run /scoreboard players operation @s vip_t2 /= vip_hund settings
/execute as @a[tag=sign_now,scores={qd=0}] run /scoreboard players operation @s currency += @s vip_t2
/execute as @a[tag=sign_now,scores={qd=0}] run /scoreboard players operation @s qd_tmp = @s vip_t2
/execute as @a[tag=sign_now,scores={qd=0}] run /scoreboard players set @s qd_ch1 0
/execute as @a[tag=sign_now,scores={qd=0}] run /scoreboard players set @s qd_ch2 0
/execute as @a[tag=sign_now,scores={qd=0}] unless score qd_cnt settings matches 1..3 run /scoreboard players random @s qd_ch1 1 10000
/execute as @a[tag=sign_now,scores={qd=0}] if score qd_cnt settings matches 1..3 run /scoreboard players random @s qd_ch2 1 10000
/execute as @a[tag=sign_now,scores={qd=0,qd_ch1=10000}] run /scoreboard players set @s chest 4
/execute as @a[tag=sign_now,scores={qd=0,qd_ch1=1..8000}] run /scoreboard players set @s chest 1
/execute as @a[tag=sign_now,scores={qd=0,qd_ch1=8001..9700}] run /scoreboard players set @s chest 2
/execute as @a[tag=sign_now,scores={qd=0,qd_ch1=9701..9999}] run /scoreboard players set @s chest 3
/execute as @a[tag=sign_now,scores={qd=0,qd_ch2=10000}] run /scoreboard players set @s chest 4
/execute as @a[tag=sign_now,scores={qd=0,qd_ch2=1..6000}] run /scoreboard players set @s chest 1
/execute as @a[tag=sign_now,scores={qd=0,qd_ch2=6001..9200}] run /scoreboard players set @s chest 2
/execute as @a[tag=sign_now,scores={qd=0,qd_ch2=9201..9999}] run /scoreboard players set @s chest 3
/execute as @a[tag=sign_now,scores={qd=0}] run /title @s title §a✔
/execute as @a[tag=sign_now,scores={qd=0}] run /title @s subtitle §f签到成功
/execute as @a[tag=sign_now,scores={qd=0}] run /playsound random.chestopen @s
/execute as @a[tag=sign_now,scores={qd=0}] run /playsound random.levelup @s
/execute as @a[tag=sign_now,scores={qd=0}] run /tellraw @s {"rawtext":[{"text":"[§a/§f] §f签到成功\n§f今日第 §e"},{"score":{"name":"qd_cnt","objective":"settings"}},{"text":"§r§f 位签到\n§f连续 §e"},{"score":{"name":"@s","objective":"qd_sum"}},{"text":"§r§f 天\n§f基础 §e"},{"score":{"name":"@s","objective":"qd_base"}},{"text":"§r§f\n§f获得 §e"},{"score":{"name":"@s","objective":"qd_tmp"}},{"text":"§r§f 金币"}]}
/execute as @a[tag=sign_now,scores={qd=0,qd_sum=3}] run /tellraw @s {"rawtext":[{"text":"[§a/§f] §f成就 连签 §e3§r§f 天 §7| §f额外 §e2000§r§f 金币"}]}
/execute as @a[tag=sign_now,scores={qd=0,qd_sum=7}] run /tellraw @s {"rawtext":[{"text":"[§a/§f] §f成就 连签 §e7§r§f 天 §7| §f额外 §e5000§r§f 金币"}]}
/execute as @a[tag=sign_now,scores={qd=0,qd_sum=14..}] if score @s qd_mile matches 0 run /tellraw @s {"rawtext":[{"text":"[§a/§f] §f成就 连签 §e"},{"score":{"name":"@s","objective":"qd_sum"}},{"text":"§r§f 天 §7| §f额外 §e3000§r§f 金币"}]}
/execute as @a[tag=sign_now,scores={qd=0}] run /scoreboard players operation @s qd_lst = time_rday settings
/execute as @a[tag=sign_now,scores={qd=0}] run /scoreboard players set @s qd 1
/tag @a[tag=sign_now] remove qd
/tag @a[tag=sign_now] remove sign_now
```

## 链 17：补签卡

- 类型：`snake(testfor)`　命令方块：52　触发：玩家带 qd_card

**步骤**

- 4–8：算昨天/是否补过
- 10–18：三种失败分支
- 19–42：补签奖励
- 43–48：更新连签与日期
- 49–51：播报与清 tag

**可复用**

- `qd_make` 是请求存活开关
- 先判失败再执行，避免半途改状态

```text
/testfor @a[tag=qd_card]
[c] /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]
/scoreboard players add @a[tag=qd_card] qd_card 0
/execute as @a[tag=qd_card] run /scoreboard players operation @s qd_tmp4 = time_rday settings
/execute as @a[tag=qd_card] run /scoreboard players remove @s qd_tmp4 1
/execute as @a[tag=qd_card] run /scoreboard players set @s qd_yday 0
/execute as @a[tag=qd_card] if score @s qd_lst = @s qd_tmp4 run /scoreboard players set @s qd_yday 1
/execute as @a[tag=qd_card,scores={qd=1}] if score @s qd_prev = @s qd_tmp4 run /scoreboard players set @s qd_yday 1
/execute as @a[tag=qd_card] run /scoreboard players set @s qd_make 1
/execute as @a[tag=qd_card,scores={qd_make=1}] if score @s qd_card matches ..0 run /tellraw @s {"rawtext":[{"text":"[§c/§f] §f补签失败：没有补签卡"}]}
/execute as @a[tag=qd_card,scores={qd_make=1}] if score @s qd_card matches ..0 run /scoreboard players set @s qd_make 0
/execute as @a[tag=qd_card,scores={qd_make=1}] if score @s qd_card matches ..0 run /tag @s remove qd_card
/execute as @a[tag=qd_card,scores={qd_make=1}] if score @s qd_mday = time_rday settings run /tellraw @s {"rawtext":[{"text":"[§c/§f] §f补签失败：今天已经补签过昨天"}]}
/execute as @a[tag=qd_card,scores={qd_make=1}] if score @s qd_mday = time_rday settings run /scoreboard players set @s qd_make 0
/execute as @a[tag=qd_card,scores={qd_make=1}] if score @s qd_mday = time_rday settings run /tag @s remove qd_card
/execute as @a[tag=qd_card,scores={qd_make=1}] if score @s qd_yday matches 1 run /tellraw @s {"rawtext":[{"text":"[§c/§f] §f补签失败：昨天已经签到"}]}
/execute as @a[tag=qd_card,scores={qd_make=1}] if score @s qd_yday matches 1 run /scoreboard players set @s qd_make 0
/execute as @a[tag=qd_card,scores={qd_make=1}] if score @s qd_yday matches 1 run /tag @s remove qd_card
/execute as @a[tag=qd_card,scores={qd_make=1}] run /scoreboard players operation @s qd_base = qd_bs settings
/execute as @a[tag=qd_card,scores={qd_make=1}] run /scoreboard players operation @s qd_tmp2 = @s qd_tmp4
/execute as @a[tag=qd_card,scores={qd_make=1}] run /scoreboard players remove @s qd_tmp2 1
/execute as @a[tag=qd_card,scores={qd_make=1}] if score @s qd_lst = @s qd_tmp2 run /scoreboard players operation @s qd_tmp3 = @s qd_sum
/execute as @a[tag=qd_card,scores={qd_make=1}] if score @s qd_lst = @s qd_tmp2 run /scoreboard players add @s qd_tmp3 1
/execute as @a[tag=qd_card,scores={qd_make=1}] unless score @s qd_lst = @s qd_tmp2 run /scoreboard players set @s qd_tmp3 1
/execute as @a[tag=qd_card,scores={qd_make=1}] run /scoreboard players operation @s qd_tmp2 = @s qd_tmp3
/execute as @a[tag=qd_card,scores={qd_make=1}] run /scoreboard players operation @s qd_tmp2 /= const_8 settings
/execute as @a[tag=qd_card,scores={qd_make=1}] run /scoreboard players add @s qd_tmp2 1
/execute as @a[tag=qd_card,scores={qd_make=1}] run /scoreboard players operation @s qd_base *= @s qd_tmp2
/execute as @a[tag=qd_card,scores={qd_make=1}] if score @s qd_tmp3 matches 3 run /scoreboard players operation @s qd_base += const_2000 settings
/execute as @a[tag=qd_card,scores={qd_make=1}] if score @s qd_tmp3 matches 7 run /scoreboard players operation @s qd_base += const_5000 settings
/execute as @a[tag=qd_card,scores={qd_make=1}] if score @s qd_tmp3 matches 14.. run /scoreboard players operation @s qd_mile = @s qd_tmp3
/execute as @a[tag=qd_card,scores={qd_make=1}] if score @s qd_tmp3 matches 14.. run /scoreboard players operation @s qd_mile %= const_7 settings
/execute as @a[tag=qd_card,scores={qd_make=1}] if score @s qd_tmp3 matches 14.. if score @s qd_mile matches 0 run /scoreboard players operation @s qd_base += const_3000 settings
/execute as @a[tag=qd_card,scores={qd_make=1}] run /scoreboard players operation @s currency += @s qd_base
/execute as @a[tag=qd_card,scores={qd_make=1}] run /scoreboard players operation @s qd_tmp = @s qd_base
/execute as @a[tag=qd_card,scores={qd_make=1}] run /scoreboard players set @s qd_ch1 0
/execute as @a[tag=qd_card,scores={qd_make=1}] run /scoreboard players random @s qd_ch1 1 10000
/execute as @a[tag=qd_card,scores={qd_make=1,qd_ch1=10000}] run /scoreboard players set @s chest 4
/execute as @a[tag=qd_card,scores={qd_make=1,qd_ch1=1..8000}] run /scoreboard players set @s chest 1
/execute as @a[tag=qd_card,scores={qd_make=1,qd_ch1=8001..9700}] run /scoreboard players set @s chest 2
/execute as @a[tag=qd_card,scores={qd_make=1,qd_ch1=9701..9999}] run /scoreboard players set @s chest 3
/execute as @a[tag=qd_card,scores={qd_make=1}] run /scoreboard players operation @s qd_sum = @s qd_tmp3
/execute as @a[tag=qd_card,scores={qd_make=1}] run /scoreboard players operation @s qd_lst = time_rday settings
/execute as @a[tag=qd_card,scores={qd_make=1}] run /scoreboard players remove @s qd_lst 1
/execute as @a[tag=qd_card,scores={qd_make=1}] if score @s qd matches 1 run /scoreboard players add @s qd_sum 1
/execute as @a[tag=qd_card,scores={qd_make=1}] if score @s qd matches 1 run /scoreboard players operation @s qd_lst = time_rday settings
/execute as @a[tag=qd_card,scores={qd_make=1}] run /scoreboard players remove @s qd_card 1
/execute as @a[tag=qd_card,scores={qd_make=1}] run /scoreboard players operation @s qd_mday = time_rday settings
/execute as @a[tag=qd_card,scores={qd_make=1}] run /tellraw @s {"rawtext":[{"text":"[§a/§f] §f补签成功\n§f连续 §e"},{"score":{"name":"@s","objective":"qd_tmp3"}},{"text":"§r§f 天\n§f获得 §e"},{"score":{"name":"@s","objective":"qd_tmp"}},{"text":"§r§f 金币"}]}
/execute as @a[tag=qd_card,scores={qd_make=1}] run /scoreboard players set @s qd_make 0
/tag @a[tag=qd_card] remove qd_card
```

## 链 18：宝箱发放

- 类型：`snake(testfor)`　命令方块：21　触发：玩家 chest≥1

**步骤**

- 3–20：chest 1..4 四种奖励

**可复用**

- 奖励先写 chest，由此链统一发放
- 活动/补偿都往 chest 写

```text
/testfor @a[scores={chest=1..}]
[c] /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]
/execute as @a[scores={chest=1}] run /scoreboard players set @s chest 0
/execute as @a[scores={chest=1}] run /playsound random.chestopen @s
/execute as @a[scores={chest=1}] run /tellraw @s {"rawtext":[{"text":"[§a/§f] §f"},{"text":"签到宝箱 开出 §a海晶灯碎片§f ×8"}]}
/execute as @a[scores={chest=1}] run /give @s prismarine_crystals 8
/execute as @a[scores={chest=2}] run /scoreboard players set @s chest 0
/execute as @a[scores={chest=2}] run /playsound random.levelup @s
/execute as @a[scores={chest=2}] run /tellraw @s {"rawtext":[{"text":"[§a/§f] §f"},{"text":"签到宝箱 开出 §b海绵§f ×1"}]}
/execute as @a[scores={chest=2}] run /give @s sponge 1
/execute as @a[scores={chest=3}] run /scoreboard players set @s chest 0
/execute as @a[scores={chest=3}] run /playsound random.orb @s
/execute as @a[scores={chest=3}] run /playsound random.levelup @s
/execute as @a[scores={chest=3}] run /tellraw @s {"rawtext":[{"text":"[§a/§f] §f"},{"text":"签到宝箱 开出 §c深层绿宝石矿§f ×1"}]}
/execute as @a[scores={chest=3}] run /give @s deepslate_emerald_ore 1
/execute as @a[scores={chest=4}] run /scoreboard players set @s chest 0
/execute as @a[scores={chest=4}] run /playsound random.totem @s
/execute as @a[scores={chest=4}] run /playsound random.end_portal_travel @s
/execute as @a[scores={chest=4}] run /tellraw @s {"rawtext":[{"text":"[§a/§f] §f"},{"text":"签到宝箱 开出 §6玩家头颅§f ×1"}]}
/execute as @a[scores={chest=4}] run /give @s player_head 1
```
