# `.mcstructure` 二进制格式

基岩版结构文件 = **小端 NBT**（根是匿名 compound），外层再包一层 zlib。所有字段
名都区分大小写。

## 1. 外层根标签

| 标签 | 类型 | 说明 |
|---|---|---|
| `format_version` | int | 1 = 旧版/网易版；2 = 现行版本 |
| `size` | list[int] ×3 | `[X, Y, Z]`，每个都必须 > 0 |
| `structure_world_origin` | list[int] ×3 | 结构在世界中的原点，导出到游戏时决定落点 |
| `compression` | int | 仅 v2 存在，固定 `1`（zlib） |
| `structure` | compound 或 byte_array | v1 = compound；v2 = zlib 压缩后的 compound 字节 |

v2 的读取步骤：

```js
import fs from 'node:fs';
import { inflateSync } from 'node:zlib';
import * as format from '../../scripts/lib/format.js';

const root = format.parseNbt(fs.readFileSync(inputPath));
const inner = format.parseNbt(inflateSync(root.get('structure').value));
```

## 2. 内层 structure compound

```text
structure
├── block_indices        # v1: List<List<Int>>   v2: List<IntArray>
├── entities             # List<Compound>，一般为空
└── palette
    └── default
        ├── block_palette        # List<Compound>，调色板
        └── block_position_data  # Compound，键 = 线性索引的十进制字符串
```

### block_indices

两层（历史遗留）。**主层**长度必须等于 `X*Y*Z`，**次层**全为 `-1`（基岩版不用
第二层表示方块，保留它是为了兼容）。索引顺序：

```text
lin = x * (Y * Z) + y * Z + z
x = lin // (Y*Z);  rem = lin % (Y*Z);  y = rem // Z;  z = rem % Z
```

`-1` 表示该位置没有方块（等同空气）。

### block_palette

```text
{ name: "minecraft:chain_command_block",
  states: { conditional_bit: byte, facing_direction: int },
  version: int }        # 方块状态版本，BlockFlow 用 18168865
```

`facing_direction` 是六值枚举：

```text
0 down (+Y 负方向)   1 up        2 north (-Z)
3 south (+Z)         4 west (-X) 5 east (+X)
```

命令方块与 `conditional_bit` 组合：BlockFlow 导出固定 37 项调色板：

```text
index = offset + cond*6 + facing
offset: command=0, chain=12, repeating=24
index 36 = minecraft:air
```

### block_position_data

键是**线性索引字符串**，值为：

```text
{ block_entity_data: { 21 个命令方块实体字段 } }
```

实体字段（缺一个都可能导致方块“没命令”或行为异常）：

```text
BlockEntityVersion int      Command str          CustomName str
ExecuteOnFirstTick byte     LPCommandMode int    LPCondionalMode byte
LPRedstoneMode byte         LastExecution long   LastOutput str
LastOutputParams list<str>  SuccessCount int     TickDelay int
TrackOutput byte            Version int          auto byte
conditionMet byte           conditionalMode byte id str("CommandBlock")
powered byte                x/y/z int（结构内局部坐标）
```

注意拼写陷阱：旧版实体把 conditional 写成 `LPCondionalMode`（少一个 `o`），
新版是 `conditionalMode`。读取时两个都要认，写入时两个都写。

## 3. v1 与 v2 的差别

| | v1（旧版/网易） | v2（现行） |
|---|---|---|
| `compression` | 无 | `1` |
| `structure` | compound（未压缩） | byte_array（zlib） |
| `block_indices` | `List<List<Int>>` | `List<IntArray>` |
| 体积 | 大（未压缩） | 小 |

两种格式都能被游戏读取；v2 更小，v1 兼容更老的版本与网易版。`.mcstructure` 的
扩展名相同，靠 `format_version` 区分。

## 4. 坐标与尺寸

- 导出时把 `min(x)` 归零，`y/z` 保持布局值；`size = (spanX, size_y, max(32, size_z))`。
- `structure_world_origin` 不是布局坐标，而是结构放置到世界时的锚点；同一套链
  换坐标时通常保留原 origin。
- 命令方块实体里的 `x/y/z` 是**结构内局部坐标**，不是世界坐标。写错会导致游戏
  里命令方块实体被丢弃。

## 5. 校验清单

读入一个文件后至少确认：

1. `size` 三个值 > 0，且 `len(main_layer) == X*Y*Z`。
2. 主层索引都在 `[-1, len(palette))` 内。
3. `block_position_data` 的键都是十进制整数且 < 体积。
4. 每个有命令的方块都能在调色板里找到 `name` 与 `states`。
5. 压缩结构能完整解压（zlib 报错通常意味着文件被截断）。

工具里的 `mcbe.js inspect` 与 `mcbe.js selftest` 覆盖了这些检查。

## 6. 常见错误

| 现象 | 原因 |
|---|---|
| 游戏读不出结构 | 根不是 compound，或 `size` 与实际索引长度不符 |
| 命令方块变空气 | `block_indices` 索引越界 / 指向了 air |
| 命令方块有方块没命令 | `block_position_data` 键错位，或 `Command` 字段类型不是 str |
| 结构方向整体反了 | 相对坐标被二次旋转（见 chain-rules.md 第 6 条） |
| 导入 BlockFlow 后链被拆碎 | 把 `fill/clone` 的相对坐标误判成断链标记 |
