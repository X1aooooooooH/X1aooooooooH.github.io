# 特殊指令模式

这些是项目里反复用到、但原版资料中很少明确说明的写法。每一条都写了“原理 / 注意事项 /
什么时候不要用”，因为它们的可靠性都依赖选择器的求值顺序。

---

## 0. 先记住：多目标选择器怎么展开

一条命令里出现多目标选择器时，游戏按下面的规则展开：

```text
目标（写在命令主语位置）  逐个执行
源（operation 的右侧、if score 的右侧）  对每个源再执行一次
```

顺序规则：**先按距离从近到远，距离相同则随机**。这条规则是下面所有技巧的基础，
也是它们唯一的不可靠来源——需要稳定顺序时，用 `c=1`、`r=0` 或不同的摆放距离固定它。

`operation` 的完整语义是笛卡尔积：

```text
operation A <obj> <op> B <obj>
等价于
for a in A:
    for b in B:
        a.obj = a.obj <op> b.obj
```

---

## 1. 自然掉落物：`@e[type=item,ry=0,rym=0]`

```text
/kill @e[type=item,ry=0,rym=0]
```

**用途**：只清理“自然产生”的掉落物，不碰玩家主动丢出的物品。

**原理**：物品实体的水平朝向 `ry` 在自然生成（方块破坏、箱子、生物掉落、结构里
预置）时默认为 0；玩家丢出时朝向跟随玩家视角，几乎不会是 0。

**注意事项**：

- 玩家站在正南/正北视角丢东西时 `ry` 可能接近 0，仍会被误伤——这只能降低概率，
  不是严格区分。
- 被水流、活塞、漏斗推动后朝向不变，所以自然物仍能被选中。
- 附加包/脚本如果改写了物品朝向，这条选择器就失效。
- 需要“绝对只处理自然物”时，改用 tag：生成时打标，玩家丢出的用
  `execute as @a at @s` 范围内的物品剔除。

---

## 2. 配对：`as … at … if score @s = @p`（本质是笛卡尔积）

```text
/execute as @a[tag=1] at @a[tag=2] if score @s A = @p A run /say @s 与 @p 配对成功
```

它展开成的是**双重循环**，不是一一对应：

```text
for i in @a[tag=1]:
    for j in @a[tag=2]:
        if i.A == j.A:
            <run 后面那一条命令>      # @s = i，@p = j
```

- `as @a[tag=1]`：`@s` 是某一个 tag=1 玩家；
- `at @a[tag=2]`：位置搬到某一个 tag=2 玩家身上（执行者不变）；
- `if score @s A = @p A`：`@p` 站在 j 的坐标上取最近玩家，就是 j 本人（距离 0）；
- 条件成立才执行 `run`。

**`@p` 选的就是 tag=2 的那位**——因为 `at` 把位置精确放在了 j 身上，`@p` 取最近
玩家即 j 自己。只有两个玩家坐标完全重合时才可能取到别人，实际可以忽略。

### 真正的问题：一次匹配只能写一侧

`run` 后面只能接**一条**命令，而一条命令的目标位只有一个：

```text
/tag @s add ok        # 只标记 tag=1 那一侧
/tag @p add ok        # 只标记 tag=2 那一侧
```

`@p` 能出现在参数里当“源”（如 `operation @s partner = @p A`），但改不了它自己的
数据。所以 n 个 tag=1 × m 个 tag=2 同时存在时：

1. 分数相同的每一对都会触发一次，一共最多 **n×m 次**；
2. 每次只能给其中一侧留下标记，另一侧“配上了但没有痕迹”；
3. 同一个玩家可能被多个对触发（重复标记/重复播报）。

### 可选路线

| 需求 | 做法 |
|---|---|
| 只标记一侧（最常见） | 就按原样写，`/tag @s add ok` 标记 tag=1，后续用 `@a[tag=ok]` 反查 |
| 只写一侧、但要知道对面是谁 | 把对方的标识写进自己：`/scoreboard players operation @s partner = @p A`，后续按 `partner` 反查 |
| 两侧都要留痕 | 拆成两条镜像链（第二条 `as @a[tag=2] at @a[tag=1]`），各写一次 |
| 严格一对一、且两侧都可能多人 | 先 `@r`/`c=1` 挑一个，再用分数差筛对面（即下面的旧写法），或每 tick 只配一对 |

**每 tick 只配一对**的写法（两侧都加 `c=1`，配合 `paired` 防重复）：

```text
/execute as @a[tag=1,tag=!paired,c=1] at @a[tag=2,tag=!paired,c=1] if score @s A = @p A run /tag @s add paired
```

`c=1` 让两侧各只取最近的一个，`paired` 让配过的人不再被选中，于是每 tick 只处理
一对。注意它仍然只给 tag=1 一侧打标记；tag=2 一侧要么再写一条镜像链，要么先用
`operation @s partner = @p A` 把对方标识存下来。

### 它替代的旧写法（tag-diff）

```text
/tag @a[tag=1] remove diff
/tag @r[tag=1] add diff
/execute as @a[tag=2] run /scoreboard players operation @s tmp = @s A
/execute as @a[tag=2] run /scoreboard players operation @s tmp -= @a[tag=diff] A
/execute as @a[tag=2,scores={tmp=0}] run /say @a[tag=diff] 与 @s 配对成功
```

旧写法用 `@r` 随机只挑**一个** tag=1，所以每 tick 天然只有一对；代价是 5 条命令
和一个临时 tag。新写法省指令，但把“多对多”的展开暴露给了你。

**选型**：tag=2 只有一个人（房主 vs 多个挑战者）→ 用新写法最省；两侧都可能多人
且要求严格一对一 → 用旧写法或 `c=1 + paired`。

### 遍历方案：diff tag 还是排队

上面旧写法的 `@r` + `diff` 其实是**通用的遍历器**：每 tick 只挑一个玩家处理，处理完
摘标记。它和传送用的 `tp_que` 队列是同一件事的两种规模方案：

| 并发人数 | 方案 | 每人被处理的间隔 | 说明 |
|---|---|---|---|
| ≤ 10 | diff tag（`@r` 随机挑一个） | 约 N tick（10 人 ≈ 0.5 s） | 遍历本身只有 3 条命令；随机可能短时间内重复抽到同一个人 |
| > 10 | `tp_que` 队列 | 严格一轮 N tick，先到先服务 | 需要 `tp_now` 防重入、同分去重、`cnt` 计数 |

**为什么分界是 10**：20 tps 下，10 个人平均每人每 10 tick（0.5 秒）轮到一次，玩家
感知不到延迟；再往上，轮到一次要 1 秒以上，且 `@r` 是随机抽取，可能有人连续几轮
抽不到（饿死），体验会明显变差。

**diff tag 版（≤10 人）**：

```text
/tag @a[tag=1] remove diff
/tag @r[tag=1] add diff
/execute as @a[tag=2] run /scoreboard players operation @s tmp = @s A
/execute as @a[tag=2] run /scoreboard players operation @s tmp -= @a[tag=diff] A
/execute as @a[tag=2,scores={tmp=0}] run /say @a[tag=diff] 与 @s 配对成功
```

每 tick 只处理一个 tag=1 玩家，处理完这一轮不再留 `diff`，下一 tick 重新抽。

**队列版（>10 人）**：见 `systems/05-teleport.md` 的传送队列（链 8）——`tp_que` 分数
排队、`tp_now` 防重入、`cnt` 处理同分、每 tick 只出队一个。优点是先到先服务、
不会饿死，还能给玩家播报“前面还有 X 人”。

**选型口诀**：人少用 diff tag（省命令块），人多用队列（保公平）。

---

## 3. 一次 tick 完成：求最值、分配 UID、轮换分数

### 3.1 求最大 / 最小值

```text
/scoreboard players operation max tmp > @e tmp
/scoreboard players operation min tmp < @e tmp
```

**原理**：`>` 是“取较大者”，`<` 是“取较小者”。源选择器命中多个实体时按 §0 的
笛卡尔积逐次执行，于是 `max` 最终等于全体最大值，`min` 等于全体最小值。
同理 `+=` 是求和、`*=` 是累乘（注意累乘会迅速溢出 32 位）。

**注意事项**：

- `max` / `min` 这两个假玩家必须先有值，否则以 0 参与比较，负数结果会错。
- 求平均要再做一次 `/= @e[c=1]` 之类的计数除法。

### 3.2 1 gt 分配 UID

```text
/scoreboard players set @e tmp -1
/scoreboard players operation @e tmp -= @e[scores={tmp=..-1}] tmp
```

**原理**：第一遍把所有实体置为 -1。第二遍对每个实体 `a`，减去“当前仍是 -1 的
实体”的 `tmp` 之和。关键在于**已处理过的实体不再是 -1**，会立刻退出源集合，
于是每个实体减掉的次数不同，得到互不相同的值。

得到的是降序编号（最近的实体值最大）。需要 0..n-1 的升序编号时再补一步：

```text
/scoreboard players operation @e tmp *= #neg1 tmp
```

**注意事项**：

- 结果依赖实体顺序（距离优先、同距随机），每次运行可能不同；只要“互不相同”就够用。
- 这里成立的前提是**源集合会被动态求值**（处理过的实体立刻退出 `tmp=..-1`）。
  如果你的版本里源集合在整条命令开始时就被固定，结果会重复——上线前用测试台
  跑一次，确认 N 个实体的 `tmp` 互不相同。
- 实体数量变化时编号会整体变化，不能当持久 ID 存盘。
- 只对同一维度、已被加载的实体有效；跨维度请分维度各跑一次。

### 3.3 三个盔甲架的分数轮换

```text
/scoreboard players set @e[tag=x,c=1] tmp 1
/scoreboard players set @e[tag=x,c=1,rm=1] tmp 2
/scoreboard players set @e[tag=x,c=1,rm=2] tmp 3
/scoreboard players operation @e[c=1] tmp >< @e tmp
```

**原理**：`><` 是交换。目标只有最近的 1 个实体，源是全部实体，于是“最近的那个”
依次与每一个实体交换 `tmp`，整体效果是数值在实体之间轮转一格。

**注意事项**：

- 轮换方向与顺序由“距离优先、同距随机”决定，同距摆放时每次方向可能不同。
- 想稳定：把三个盔甲架摆在不同距离，或用 `c=1` 逐个点名。
- 这是唯一一个**不依赖红石**的轮换写法，适合做轮询、轮流执行。

---

## 4. 同名检测：用 `if blocks` 读命令方块的输出

**需求**：玩家叫 `abcd`，地上有个掉落物也叫 `abcd`，判断两者是否同名。

**思路**：命令不能读 NBT，但命令方块**执行后会写回自己的输出**（`SuccessCount`、
`LastOutput`、`LastExecution`）。把“命令有没有成功”变成“两个命令方块的输出是否
相同”，再用 `if blocks` 比较它们——这就是命令方块体系里少数能“读结果”的手段。

```text
# 1. 玩家打身份标记 pl，玩家与掉落物都打 diff
/tag @a[tag=pl] add diff
/tag @e[tag=diff] add diff

# 2. 两个一模一样的命令方块，内容都是：
/execute as @a[tag=pl] at @s run /tag @e[tag=diff,c=1,r=3] remove diff

# 3. 第三个命令方块比较这两个命令方块：
/execute if blocks ~~~-1 ~~~-1 ~~~-2 all run /tag @a add hit
```

`/tag @a add hit` 就是“判定成功”的标记（换成 `scoreboard players set` 也行）。
紧跟一条反向判断即可分出两条分支：

```text
/execute unless entity @a[tag=hit] run /say 未命中
/tag @a remove hit
```

**原理**：

- 基岩版的 `if blocks`（等价于 `/testforblocks`）比较的是方块**连同方块实体数据**，
  命令方块是方块实体，所以 `SuccessCount` / `LastOutput` 的差异会被比出来。
  （Java 版的 `testforblocks` 只比方块 ID 与状态，网上很多说法不适用于基岩版。）
- 两个方块放同一串命令：第一个执行时会改变世界状态（把 `diff` 移掉），第二个再跑
  就找不到目标，`SuccessCount` 变成 0。于是“第一条成功了没有”就体现为“两个方块
  的输出是否相同”。
- 用 `if blocks` 读这个差异，等于读到了一个布尔值，再交给 `if` / `unless` 分流。

**注意事项**：

- 两个命令方块必须同类型、同朝向、同条件位，只有执行结果不同——否则比较结果没有
  意义。
- `if blocks` 的坐标是**方块角**，`~~~-1` 到 `~~~-1` 才是单个方块；写成
  `~~~-1 ~~~-2` 会变成一条线，容易多比或少比。
- 极性取决于你把哪块放在前面：`if blocks` 成立表示“两块输出相同”，通常对应
  “第一条也没能改动世界”（配对失败）；不成立才是“第一条成功”。落地时在测试台上
  按一次确认极性，别凭记忆接线。
- 输出会一直留在方块里，判断完要把参与比较的方块复位（重写命令或换一组方块），
  否则下一次读到的是上一次的结果。
- `TrackOutput` 关掉时 `LastOutput` 不更新，但 `SuccessCount` 仍然会变，所以判断
  依然成立。

## 5. 死亡检测：`@a` 与 `@e[type=player]` 的差集

**基岩版的两个选择器语义不同**（这点和 Java 直觉相反，容易记反）：

| 选择器 | 选中谁 |
|---|---|
| `@a` | **全体玩家，包含已经死亡、还没重生的** |
| `@e[type=player]` | **只包含活着的玩家** |

于是“死者”= `@a` 里但不在 `@e` 里的玩家。一个 tick 内做差集：

```text
/tag @a[tag=!death] add death        # 全体（含死者）补 death
/tag @e[type=player] remove death    # 活着的摘掉
```

跑完这一对，身上还带 `death` 的就是死者；活人一律没有。

**为什么不能直接读死亡事件**：命令没有死亡回调，`deathCount` 准则又要额外清零、
跨维度还有延迟。tag 差集是一 tick 就能拿到的布尔值，比准则省。

把“死者”兑现成“死亡提示”再走两步：

```text
/scoreboard players set @e[tag=death1] death 1   # 重生后（进入 @e）才兑现
/tag @e[tag=death1] remove death1
/tag @a[tag=death,tag=!death1] add pos           # 死者打 pos，给位置编码用
/tag @a[tag=death,tag=!death1] add death1
```

- 死后 `death1` 一直挂在死者身上，`@e` 匹配不到他，所以第 1 条不执行；
- 重生那一刻玩家回到 `@e`，`death=1` 才被写下去，链 11 的死亡提示随后触发；
- `pos` 让位置编码链（链 9/13）把死亡坐标写进分数。

**注意事项**：

- 开了 `doImmediateRespawn`（立即重生）时，“死亡”窗口为 0 个 tick，
  `@a` 与 `@e` 同一 tick 就重合，差集恒为空——这套检测会失效。要检测就必须
  关掉立即重生，或改用 `deathCount` 准则 + 自清零。
- 玩家死亡后退出游戏，`death` / `death1` 会留在存档里，下次上线由
  `@e[type=player]` 那一条摘掉，不会永久泄漏。
- 差集只能告诉你“他死过”，拿不到死因和死亡坐标；坐标要在死前记（`pos` 链）。
- 同一 tick 里 `@a` 与 `@e` 的结果必须都取一次；拆成两条链、跨了 tick 就会漏人。

