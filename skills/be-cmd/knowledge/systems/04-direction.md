# 朝向方向号

- 组成：1 条链 —— 朝向→方向号
- 说明：把视角映射成 0..8。

## 初始化（本系统自带）

### 计分板

```text
/scoreboard objectives add dir dummy
```

### 其他初始化

```text
/scoreboard players add time_rday settings 0
```

## 链 7：朝向→方向号

- 类型：`snake(testfor)`　命令方块：13　触发：玩家带 dir

**步骤**

- 3–12：九段区间各给一个 dir

**可复用**

- `ry/rym` 是读朝向的唯一手段

```text
/testfor @a[tag=dir]
[c] /setblock ~~~-1 chain_command_block ["conditional_bit"=false,"facing_direction"=2]
/setblock ~~~ chain_command_block ["conditional_bit"=false,"facing_direction"=1]
/scoreboard players set @a[tag=dir,rym=-180,ry=-144] dir 1
/scoreboard players set @a[tag=dir,rym=-144,ry=-108] dir 2
/scoreboard players set @a[tag=dir,rym=-108,ry=-72] dir 3
/scoreboard players set @a[tag=dir,rym=-72,ry=-36] dir 4
/scoreboard players set @a[tag=dir,rym=-36,ry=0] dir 5
/scoreboard players set @a[tag=dir,rym=0,ry=36] dir 6
/scoreboard players set @a[tag=dir,rym=36,ry=72] dir 7
/scoreboard players set @a[tag=dir,rym=72,ry=108] dir 8
/scoreboard players set @a[tag=dir,rym=108,ry=144] dir 9
/scoreboard players set @a[tag=dir,rym=144,ry=180] dir 0
```
