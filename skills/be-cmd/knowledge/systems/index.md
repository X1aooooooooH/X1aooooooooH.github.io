# 系统知识库

12 个系统、31 条链，全部纯文本（无 `.mcstructure`）。每个文件可直接复制进命令方块。

## 阅读约定

| 标记 | 含义 |
|---|---|
| `[c] 命令` | 条件命令方块（conditional，前一条成功才执行） |
| `[air]` | 断链占位（虚拟空气格，导出为空气） |
| `[?]` | 原结构此处是空命令方块，没有命令 |

每个文件的结构：**初始化（本系统自带）** → 每条链的**步骤 / 可复用 / 完整指令**。
初始化已从全局链拆出，单独拿走一个文件也能跑。

## 通用约定

| 约定 | 说明 |
|---|---|
| `settings` 假玩家 | 全局常量（`const_7`、`vip_coin`、`time_step`…），共享只读 |
| 链头 | 脉冲链放初始化/高频逻辑，蛇形链用 `/testfor` 当开关 |
| tag 状态机 | `online_join`、`lv`、`death`、`pos`、`read`、`trans`、`sign_now`、`tp_now`… 每帧重置 |
| 临时分数 | `*_tmp`、`*_t1..t3`、`*_d1..d9` 当局部变量 |
| 每日/每分钟 | 用 `time_rday`、`time_min` 比较，不依赖真实时钟 |
| 提示 | 一律 `tellraw` + `score`/`translate` 组件 |

**选择器参数**：`@e[tag=posi,r=0,c=1]`、`@s[x=0.0,rm=4]` 这类 3–4 参数选择器是
结构性必需（位置编码靠“坐标 + 半径 + 数量”锁定实体），`check --only style` 的 rule2 告警属预期。

## 目录

| 文件 | 系统 | 链 | 说明 |
|---|---|---|---|
| [01-online-join.md](01-online-join.md) | 在线与进服 | 3, 4 | 人数统计、进出播报、新玩家引导 |
| [02-time.md](02-time.md) | 时间系统 | 5 | 年月日时分 + 闰年 + 每日重置 |
| [03-level.md](03-level.md) | 等级结算 | 6 | 等级与分数互转、死亡扣级 |
| [04-direction.md](04-direction.md) | 朝向方向号 | 7 | 视角 → 0..8 |
| [05-teleport.md](05-teleport.md) | 传送队列 | 8 | 排队 + 大坐标分段位移 |
| [06-position.md](06-position.md) | 位置编码 | 9 | 实体坐标写进分数 |
| [07-death.md](07-death.md) | 死亡系统 | 10–13 | 检测 → 提示 → 复活保护 → 记录坐标 |
| [08-block-memory.md](08-block-memory.md) | 色块存储 | 14–15 | 分数 ↔ 彩色方块墙 |
| [09-checkin.md](09-checkin.md) | 签到系统 | 16–18 | 签到、补签卡、宝箱发放 |
| [10-vip.md](10-vip.md) | VIP 系统 | 19–20 | 续费升级 + 每日特权卡 |
| [11-menu.md](11-menu.md) | 雪球菜单 | 21–27, 31 | 打字机开场、6 页菜单、坐标输入、锚点、模式 |
| [12-tpa.md](12-tpa.md) | 玩家互传 | 28–30 | 接受、拒绝/取消、超时 |

## 检查时会出现但**不是缺陷**的情况

| 现象 | 原因 |
|---|---|
| `tag-leak`：`fstjoin`、`posi`、`pot_cur` | 长期标记故意不摘；`posi` 用 `kill` 清理 |
| `value-dead`：`set … 0` | 归零复位赋值，本来就不该被判定 |
| `duplicate-command` | 不同链重复同一选择器属正常 |
| `testfor-not-head` | 通常出现在把多条系统链误合并为一条链时 |
| `unknown-sound`：`random.end_portal_travel` | 音效表快照未收录 |
