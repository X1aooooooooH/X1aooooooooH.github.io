# X1aooooooooH · Projects

GitHub Pages 项目导航站点。当前包含 BlockFlow。

- 站点根目录：`/`
- BlockFlow：`/blockflow/`
- AI 技能：`/blockflow/skills/be-cmd/`

## 目录结构

```text
/
├── index.html              # 项目导航页
├── assets/
│   └── blockflow-thumb.png
├── src/
│   ├── root.js             # 从 projects.js 渲染列表和搜索
│   └── projects.js         # 项目列表（新增项目只需要改这里）
├── blockflow/              # BlockFlow 应用
│   ├── index.html          # 只保留挂载点
│   ├── styles/
│   ├── src/
│   │   ├── main.js         # 启动、事件装配、搜索/导入/导出 UI
│   │   ├── ai.js           # AI 会话入口
│   │   ├── ai/             # 提示词、API、技能、上下文与操作
│   │   ├── core/           # NBT、结构、链识别与布局
│   │   ├── ui/             # DOM、反馈、Markdown、文本编辑
│   │   ├── data/
│   │   └── skill-runtime/  # 浏览器内技能运行时
│   ├── skills/be-cmd/      # 内置 AI 技能
│   ├── textures/
│   ├── vendor/
│   └── README.md
```

## 新增项目

编辑 `src/projects.js`，在 `projects` 数组里追加对象：

```js
{
  name: 'Project Name',
  subtitle: 'Short subtitle',
  description: 'Description',
  href: './project-dir/',
  icon: './project-dir/icon.png',
  image: './assets/project-thumb.png',
  version: 'V1.0',
  status: '可用',
  tags: ['Tag'],
  comingSoon: false
}
```

## BlockFlow AI

BlockFlow 的 AI 功能由用户自己的 API Key 驱动，Key 只保存在当前浏览器。AI 会加载 `blockflow/skills/be-cmd/SKILL.md` 作为内置技能，对当前结构或当前链进行阅读分析。

> GitHub Pages 是纯静态托管，无法隐藏共享密钥。请只使用用户自己的 Key，不要把公共 Key 写入仓库。

## 开发

项目使用原生 ES Modules，没有构建步骤：

```bash
python -m http.server 8765
```

打开 `http://127.0.0.1:8765/`。BlockFlow 的所有状态都保存在浏览器本地；`blockflow/skills/be-cmd/` 是随项目部署的内置 AI 技能。

## UI

界面保持原有 BlockFlow 视觉版本。本轮只调整工程结构、AI 操作和内部实现，不改变原有界面设计。
