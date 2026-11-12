# Star Launcher

第三方游戏启动器 —— 极简玻璃拟态风格。

一个本地游戏库管理器：添加游戏、自动抓取 exe 图标、设置封面/背景、一键启动，并内置完整的游戏更新系统（断点续传、增量更新、备份回滚、预下载）。

## 功能特性

- **游戏库管理**：添加 / 删除 / 拖拽排序，侧边栏图标优先用 exe 提取的图标
- **沉浸式封面区**：16:9 封面图 / 背景视频，状态徽章 + 上次游玩 / 总时长
- **游戏启动**：一键启动，自动监控进程，记录游玩时长
- **更新系统**
  - 断点续传下载（HTTP Range）+ 指数退避重试 + 令牌桶限速 + 并发控制
  - SHA256 / MD5 校验，完整包 / 增量包
  - 安装前自动备份，失败自动回滚，保留最近 3 份备份
  - 预下载（版本上线前提前拉取）
  - 暂停 / 继续 / 取消 / 回滚
- **玻璃拟态 UI**：侧边栏导航、Hero 封面区、浮层更新卡片、右侧滑出设置面板
- **无障碍**：键盘上下切换游戏、Esc 关闭设置、`prefers-reduced-motion` 降级

## 技术栈

- Electron 22
- 原生 JavaScript（无前端框架）
- CSS 玻璃拟态 + 设计令牌
- electron-builder（打包 portable exe / zip）

## 项目结构

```
src/
├── main/                  # 主进程
│   ├── index.js           # 入口、IPC handlers、窗口管理
│   ├── store.js           # 数据持久化（library.json）
│   ├── game-launcher.js   # 游戏启动与进程监控
│   ├── download-engine.js # 断点续传下载引擎（重试/限速/并发/校验）
│   ├── install-manager.js # 安装 / 备份 / 回滚
│   ├── update-checker.js  # 版本检查（语义化版本比较）
│   └── update-task.js     # 更新任务状态机
├── preload/
│   └── preload.js         # contextBridge 暴露面（sandbox）
└── renderer/              # 渲染层
    ├── index.html
    ├── css/               # style.css + glass.css
    └── js/                # app / library / detail / settings / update-panel / add-game / util
```

## 快速开始

```bash
npm install
npm start
```

## 打包

```bash
npm run build
```

产物输出到 `dist/`：
- `Star Launcher <version>.exe` —— portable 单文件版，双击即用
- `Star Launcher-<version>-win.zip` —— 解包版

## 已知问题

**某些 Windows 环境启动报错**：`Unable to move the cache: 拒绝访问 (0x5)` → `GPU process isn't usable. Goodbye.`

这是 Electron 22 的 cache 迁移问题，与具体应用无关。解决方法：

```bash
npm start -- --disable-gpu
```

或在 `package.json` 的 `start` 脚本里加上 `--disable-gpu`（会使用软件渲染，性能略降但可正常启动）。

## License

MIT
