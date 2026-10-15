# BlockFlow 特殊方块模型实现说明

版本：v2.11.2

本版本对告示牌、拉杆、按钮、火把、中继器、比较器和红石粉采用状态驱动的实体几何构建。设计参考 Bedrock 方块状态及其他结构查看器对这些状态的表现，用于核对方块朝向、连接和开关语义；BlockFlow 的模型结构、几何构建、材质组合、坐标变换和代码实现均独立编写。

## 状态覆盖

- 告示牌：落地旋转 0–15、墙面朝向、悬挂/墙面悬挂、attached 状态、正反面文字、颜色和发光状态。
- 拉杆：8 种 `lever_direction`、`open_bit`/供电状态。
- 按钮：6 种 `facing_direction`、`button_pressed_bit`、木质/石质材质区分。
- 火把：`torch_facing_direction`、红石火把亮/灭、灵魂/铜火把外观。
- 中继器：方向、`repeater_delay` 0–3、输入/输出火把及通电状态。
- 比较器：方向、`output_subtract_bit`、`output_lit_bit`。
- 红石粉：`redstone_signal` 0–15、四方向 none/side/up 连接。

## 独立实现边界

模型几何由 `assets/js/structure-app.js` 中的 BlockFlow 构建器创建，后续由 BlockFlow 几何烘焙器合并为 Chunk 网格。没有加载或调用外部结构查看器的模型数据库、预烘焙网格、Worker、WASM 或 JavaScript 模型构建函数。普通方块使用项目自己的 atlas 和映射表取表面材质。

## 测试

`node --test tests/*.test.cjs` 覆盖状态解析、模型路径、Three.js 真实几何对象构建、安装方向、按钮按压位移、拉杆状态、中继器延迟、比较器模式、告示牌旋转和图集映射。

自动化测试不替代实际浏览器的视觉检查；不同 Minecraft 版本的 block entity NBT 变体、字体渲染、光照和 GPU 结果仍建议用真实结构样本复核。
