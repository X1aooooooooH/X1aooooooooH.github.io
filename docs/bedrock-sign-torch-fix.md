# Bedrock 告示牌与火把逻辑修复（v2.12.1）

## 告示牌
- 使用 `hanging` 状态区分墙挂与顶挂：`true` 为墙挂，`false` 为顶挂。
- `attached_bit` 只决定模型选择的链条连接样式。
- 墙面告示牌的 `facing_direction` 是告示牌正面方向；提取模型的局部安装面在 `-X`，因此旋转时把 `-X` 对准正面方向的反向。
- 墙挂告示牌内缩补偿沿支撑方向移动。
- 正面文字放在板材朝外的实际表面，背面文字放在相反表面。

## 火把
- Bedrock `torch_facing_direction` 表示火把附着的支撑面，不使用通用 `facing_direction` 枚举。
- 数值映射：`0=unknown`、`1=west`、`2=east`、`3=north`、`4=south`、`5=top`。
- `top`/`unknown` 使用立式模型；四个水平面使用对应墙式模型，模型顶端指向支撑面反方向。
- `redstone_torch` 使用点亮模型；`unlit_redstone_torch` 使用熄灭模型。

## 未修改
- 拉杆模型数据、八种安装方向、通电姿态和安装位置均未修改。
