# FMBE（Fox MBE）方块展示体

FMBE = **Fox MBE**，用一只狐狸 + `playanimation` 的 Molang 表达式，把主手物品渲染成
“方块展示体”。纯原版指令实现，是基岩版做 3D 投影、模型、UI 的主流手段。

来源：[Bedrock Wiki — FMBE](https://wiki.bedrock.dev/commands/display-entities)（BCC 社区，
pipi_Spamton、siratama 等）。

## 1. 原理

- 狐狸的骨骼可以被动画驱动：`playanimation` 把 Molang 表达式写进 `v.*` 变量，改变
  头部/身体的位置与旋转。
- 狐狸主手拿的物品会被渲染成“方块/物品”的样子，并且能缩放到任意大小。
- 每个展示体 = 1 只狐狸。狐狸多了会卡，按需生成、及时清除。

## 2. 最少要跑的系统（五条命令）

```text
playanimation @e[tag=fmbe] animation.player.sleeping none 0 "" controller.animation.fox.move
playanimation @e[tag=fmbe] animation.creeper.swelling none 0 "v.swelling_scale1=...;v.swelling_scale2=..." wiki.scale
playanimation @e[tag=fmbe] animation.ender_dragon.neck_head_movement none 0 "v.head_position_x=...;..." wiki.pos
playanimation @e[tag=fmbe] animation.warden.move none 0 "v.body_x_rot=...;" wiki.xrot
playanimation @e[tag=fmbe] animation.player.attack.rotations none 0 "v.attack_body_rot_y=...;" wiki.zrot
```

语法：

```text
playanimation <实体> <动画名> <next> <blendout> <Molang 表达式> <controller 名>
```

- 第 4 个参数是表达式字符串，用双引号包住；`v.xxx=...;v.yyy=...;` 用分号分隔。
- 最后一个参数是 controller 名，**给不同动画用不同 controller 才能叠加**，否则后一条
  会覆盖前一条。第一条例外：必须是 `controller.animation.fox.move`。
- 动画名必须是原版存在的（`animation.player.sleeping`、`animation.creeper.swelling`、
  `animation.ender_dragon.neck_head_movement`、`animation.warden.move`、
  `animation.player.attack.rotations`、`animation.parrot.moving`、`animation.parrot.dance`、
  `animation.minecart.move.v1.0`）。

## 3. 变量表

| 变量 | 含义 | 单位 |
|---|---|---|
| `v.xpos` `v.ypos` `v.zpos` | 相对偏移 | 1/16 格 |
| `v.xrot` `v.yrot` `v.zrot` | 旋转 | 度 |
| `v.scale` | 整体缩放 | 倍数 |
| `v.xzscale` `v.yscale` | 分轴缩放 | 倍数 |
| `v.xbasepos` `v.ybasepos` `v.zbasepos` | 基准偏移（跟随旋转） | 1/16 格 |

`v.zbasepos=16` 相当于局部坐标 `^^^1`。位置/基准偏移都是 **1/16 格**，换算时不要
把 1 当成 1 格。

## 4. 生成与使用

```text
/summon fox ~ ~ ~ minecraft:as_adult "fmbe:name"   （名字当标记）
/replaceitem entity @e[name="fmbe:name"] slot.weapon.mainhand 0 stone
/tag @e[name="fmbe:name"] add fmbe
```

- 用 `name` 或 `tag` 标记这一批展示体，`playanimation` 只作用于带 tag 的狐狸。
- 改显示方块：`replaceitem entity @e[tag=fmbe] slot.weapon.mainhand 0 <item>`。
- 动态取脚下方块（需要一只拿精准采集镐的盔甲架）：

```text
execute as @e[name="fmbe_pickaxe"] at @e[tag=fmbe,name="fmbe_target"] run loot replace entity @n slot.weapon.mainhand 0 mine ~~-1~ mainhand
```

- 保存/加载：`structure save fmbe:slot ...`，加载后重新 `tag add fmbe`。
- 消音：`stopsound @a mob.fox.*`（spit/sniff/sleep/screech/hurt/eat/death/bite/ambient/aggro）。

## 5. 在命令链里的组织方式

FMBE 不产生逻辑，只是“渲染层”。推荐：

```text
[数据层] 计分板算位置/角度/缩放
[渲染层] 一组 playanimation（固定 5~8 条，循环方块）
[生成层] 脉冲链 summon + replaceitem + tag
```

- 渲染层用**一个循环方块**，每 tick 或每 2 tick 跑一次；不要每条动画一个循环方块。
- 生成层用脉冲链，避免每 tick 重复 summon。
- 变量清零要显式做（`v.xpos=0;...`），否则上一次的值会残留。

## 6. 简化版（3 条命令）

只改缩放、不改分轴缩放时，可以把位置/旋转/缩放压成两条：

```text
playanimation @e[tag=fmbe] animation.player.sleeping none 0 "" controller.animation.fox.move
playanimation @e[tag=fmbe] animation.creeper.swelling none 0 "v.scale=1;v.adscale=math.sqrt(v.scale);..." wiki.scale
playanimation @e[tag=fmbe] animation.ender_dragon.neck_head_movement none 0 "v.adjust_xz=...;v.head_position_x=...;" wiki.posrot
```

## 7. 坑

| 现象 | 原因 |
|---|---|
| 展示体不动 | 没有 `controller.animation.fox.move` 打底，或 controller 名重复互相覆盖 |
| 位置差 16 倍 | 把 1/16 格当成了 1 格 |
| 抖动/闪烁 | 同一 tick 跑了两次渲染，或多条链同时 playanimation |
| 卡顿 | 狐狸数量过多；用 `c=1` 限制、按距离清理 |
| 区块卸载后消失 | 没加 `tickingarea` |
| 材质变透明/穿模 | 2D 方块（梯子、花）与 3D 方块需要不同的高级矩阵，普通版只适合 3D 方块 |
