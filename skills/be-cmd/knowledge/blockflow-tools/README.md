# BlockFlow 浏览器工具协议

BlockFlow 网页端没有 shell，但页面会在浏览器内执行 BlockFlow 工具。AI 不应要求用户运行 CLI，也不应声称“无法执行”。

## 只读工具

AI 可以在回复中输出：

```blockflow-tool
{"name":"search_commands","arguments":{"query":"test1","scope":"all","limit":80}}
```

页面执行后会把结果发回，AI 继续回答。可用工具：

| 工具 | 参数 | 说明 |
|---|---|---|
| `search_commands` | `query`, `regex`, `caseSensitive`, `scope`, `chain`, `limit` | 搜索命令文本，返回链/块位置 |
| `inspect` | `scope` | 输出链、方块、头命令、objectives、重复命令 |
| `check_syntax` | `scope` | 运行 skill 的 syntax.js |
| `check_chain` | `scope` | 运行链结构检查 |
| `verify` | `scope` | 汇总 PASS/FAIL |
| `lookup_id` | `query` | 查询 skill 的 ID 数据 |

只读工具不得修改结构。

## 修改：只用隐藏操作块

修改必须放在回复最末尾的隐藏块中，页面会把它解析成按钮并从正文隐藏：

```blockflow-actions
{"actions":[{"label":"修复上述 Bug","description":"说明","ops":[{"op":"replace","find":"test1","replace":"test2","scope":"all"}]}]}
```

用户点击按钮后，页面直接执行，不再次调用 AI。所有修改写入撤销历史。

`label` 必须具体说明修什么/新增什么、位置和结果，例如：

- `修复链3第2块 execute 缺少 run`
- `在第5链后新增压力板检测链（3块）`
- `把全部链中的 test1 替换为 test2`

禁止使用 `修改task1`、`修改task2`、`修复Bug` 这类泛化标题；`description` 要写清具体改动和影响。

### 操作类型

```json
{"op":"replace","find":"test1","replace":"test2","scope":"all","regex":false,"caseSensitive":false}
{"op":"update_command","chain":1,"block":0,"command":"/say hi"}
{"op":"insert_commands","chain":1,"at":3,"commands":["/say a","/say b"]}
{"op":"delete_blocks","chain":1,"blocks":[2,3]}
{"op":"create_chain","type":"snake","commands":["/setblock ~~~-1 chain_command_block","/say hi"],"at":2}
{"op":"replace_chain","chain":1,"type":"repeat","commands":["/say a","/say b"]}
{"op":"move_chain","from":1,"to":3}
```

`chain` 使用 1 起始编号，`block` 使用 0 起始编号。`create_chain` 的 `at` 也是 1 起始；省略时：

- 单链视图中插入当前链的下一条
- 总视图中追加到最后

新建链优先使用 `snake`，前提是命令中提供有效的断链头；否则使用 `repeat` 或 `impulse`。

### 简单接口优先

能用 `replace`、`update_command`、`insert_commands`、`delete_blocks`、`create_chain` 完成时，不要逐条人工改写。

如果用户要求复杂结构变化，AI 应先调用 `inspect` / `search_commands`，再在 `replace_chain` 中给出精确的完整命令列表。

### 注意

- 动作按钮是唯一允许修改结构的入口。
- 简单搜索替换必须使用 `replace` 操作，不要生成几十条 `update_command`。
- 所有操作会先整体校验，失败则不会部分应用。
- 页面执行后会刷新 3D 视图并写入撤销历史。
- 每个会话绑定一条链的稳定 UID。绑定链被删除后，后续发送或操作会在所有链末尾新建链并重新绑定；按钮中的旧链号会重映射到新链。
