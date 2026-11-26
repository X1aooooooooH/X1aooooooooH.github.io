# 计分板 UI 与系统模式

这是 BlockFlow 项目里最常用的结构：一条循环链每秒轮询若干条件，用 `menu`
分数当状态机，用 `tellraw`/`titleraw` 画界面，用 tag 和计分板存玩家数据。

## 1. 状态机约定

```text
menu       当前界面 ID（0 = 关闭）
menu_pl    当前页
menu_pot   光标位置
menu_tpx/y/z  菜单传送目标
```

- 一个 ID 一个条件：`/testfor @a[scores={menu=43..48}]` 决定这一段链是否执行。
- 进入界面：`/scoreboard players set @s menu 43`。
- 退出：`/scoreboard players set @s menu 0`。
- 用**区间**而不是等值，方便一个 ID 覆盖多页（43..48）。
- 界面切换后，把上一段链的条件立刻失效（改分数），避免同 tick 内两段都执行。

## 2. 防御性轮询

循环方块里的第一条永远是最便宜的判断：

```text
z=31 /testfor @a[scores={menu=43..48}]
z=30 /setblock ~~~-1 chain_command_block [...]     cond=1
z=29 /setblock ~~~ chain_command_block [...]      cond=0
z=28 /titleraw @a[scores={menu=43}] actionbar ...
```

- `testfor` 的 `conditional_bit=1`，后面的连锁方块默认条件执行，条件不满足就整段
  跳过——这比在每条命令里重复写选择器便宜得多。
- 每 tick 只允许**一条**链输出 `titleraw`，否则聊天栏/动作栏会闪烁。
- 需要“每 20 tick 执行一次”时，用计分板计时器 + 取模判断，而不是再加循环方块：

```text
/scoreboard players add #tick settings 1
/execute if score #tick settings matches 20.. run /scoreboard players set #tick settings 0
```

## 3. 动作栏 HUD

```text
/titleraw @a[scores={menu=0}] actionbar {"rawtext":[{"text":"§7在线 §f"},{"score":{"name":"@s","objective":"online_min"}},{"text":"§7 分  §e金币 §f"},{"score":{"name":"@s","objective":"currency"}}]}
```

- `actionbar` 每 tick 覆盖，不会刷屏；`title`/`subtitle` 有淡入淡出，不适合常驻。
- 分数组件会随计分板实时变化，不需要重建 JSON。
- 长文本注意：NBT 字符串上限 65535 字节，但动作栏可读长度远小于此，控制在
  60 个字符以内。
- 中文与 `§` 混排时，`§` 只影响其后字符直到下一个 `§` 或字符串结束。

## 4. 可点击菜单

```text
/tellraw @a[scores={menu=43}] {"rawtext":[{"text":"§8======== §6主菜单 §8========\n"},{"text":"§e[ 传送 ]","clickEvent":{"action":"run_command","value":"/scoreboard players set @s menu 44"},"hoverEvent":{"action":"show_text","contents":{"rawtext":[{"text":"打开传送菜单"}]}}},{"text":"  "},{"text":"§c[ 关闭 ]","clickEvent":{"action":"run_command","value":"/scoreboard players set @s menu 0"}}]}
```

- `clickEvent.action` 支持 `run_command`、`open_url`、`suggest_command`（版本相关）。
- 点击执行的是**玩家身份**的命令，`@s` 可用。
- 不要用 `tellraw` 每次重画整屏：只在 `menu` 变化时输出一次，用 `testfor` 的
  条件位控制。

## 5. 数据寄存

| 数据 | 存放 | 说明 |
|---|---|---|
| 金钱、等级 | 计分板 | 32 位整数，注意上下限 |
| 是否 VIP | tag + 到期时间分数 | `vip_lday` 存最后登录日 |
| 坐标 | 三个分数 `pos_x/y/z` + `pos_dim` | 传送前先保存 |
| 冷却 | 分数倒计时 | 每 tick `remove` 1，`0..` 判断可用 |
| 临时状态 | `#` 开头假玩家 | 全局单例，不会被玩家命中 |

- 需要小数时用“放大 100 倍存整数”的约定，显示时再除。
- 需要字符串时只能用 `tellraw` 的 `score` 组件显示数字，基岩版没有字符串变量。

## 6. 在线时长

```text
/scoreboard players add @a online_min 1
/execute as @a[scores={online_min=60..}] run /scoreboard players add @s online_hr 1
/execute as @a[scores={online_min=60..}] run /scoreboard players set @s online_min 0
/execute as @a[scores={online_hr=24..}] run /tag @s add online_day
```

注意先加再判断的顺序，以及把 `@a` 换成 `@s`：在 `execute as` 内改分数必须用
`@s`，否则会对所有玩家重复执行。

## 7. 传送队列（tpa）

```text
/testfor @e[tag=trans]
/scoreboard players add @e[tag=trans] trans_tmp 0
/execute as @e[tag=trans,scores={trans_d1=8}] at @s run /tp @s ...
```

- 用实体 tag 承载队列，避免用假玩家存坐标。
- 每个 tick 只处理队首一个（用 `c=1` 或分数最小者）。
- 传送前检查目标区块已加载（`/tickingarea` 或先 `/execute if entity`）。
- 传送后清 tag，防止重复执行。

## 8. 性能清单

1. 循环方块越少越好：一个 `@a` 轮询链能覆盖的功能不要拆成三条。
2. 条件链（`cond=1`）比在命令里重复写 `if` 便宜。
3. `tellraw` 只在状态变化时执行；常驻信息用 `actionbar`。
4. 避免每 tick 遍历 `@e`；用 tag 缩小范围。
5. 大范围 `fill`/`clone` 放进脉冲链，不要放进循环链。
6. 一条链最多一个循环方块；需要多个周期时用计时器分数。
