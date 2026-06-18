# 🌟 Star Launcher

[![Download](https://img.shields.io/badge/下载-v1.2.1-blue)](https://github.com/hutao-ai-makei/star/releases/latest)

> 第三方游戏启动器 — 极简玻璃拟态风格

基于 Electron 打造的轻量级游戏启动器，采用流行的 Glassmorphism（玻璃拟态）设计风格，让你优雅地管理和启动本地游戏。

## ✨ 功能特性

- 🎮 **游戏管理** — 添加、编辑、删除本地游戏，支持自定义名称和路径
- 🚀 **一键启动** — 快速启动游戏，记录最近游玩时间
- 🔄 **游戏更新** — 检测更新、断点续传下载、自动安装与回滚，支持预下载
- 🎨 **玻璃拟态 UI** — 毛玻璃效果界面，可拖拽无边框窗口
- ⚙️ **设置页面** — 自定义窗口大小、记住窗口位置、下载并发与限速
- 💾 **本地存储** — 游戏库数据保存在本地 JSON 文件中

## 🛠 技术栈

| 技术 | 说明 |
|------|------|
| [Electron 22](https://www.electronjs.org/) | 桌面应用框架 |
| HTML / CSS / JavaScript | 原生前端，无框架 |
| electron-builder | 打包构建 |
| electron-store (自定义) | 本地 JSON 数据持久化 |

## 📁 项目结构

```
star/
├── src/
│   ├── main/                 # Electron 主进程
│   │   ├── index.js          # 主进程入口，窗口管理 & IPC
│   │   ├── game-launcher.js  # 游戏启动模块
│   │   ├── update-checker.js # 更新检测
│   │   ├── download-engine.js# 通用下载引擎（断点续传 / 并发 / 限速）
│   │   ├── update-task.js    # 更新任务状态机
│   │   ├── install-manager.js# 更新安装与回滚
│   │   └── store.js          # 本地数据存储
│   ├── preload/
│   │   └── preload.js        # 预加载脚本（contextBridge）
│   └── renderer/             # 渲染进程（前端）
│       ├── index.html         # 主页面
│       ├── css/
│       │   ├── style.css      # 样式
│       │   └── glass.css      # 玻璃拟态效果
│       └── js/
│           ├── app.js         # 主逻辑 & 游戏库
│           ├── add-game.js    # 添加游戏
│           ├── detail.js      # 游戏详情
│           ├── library.js     # 游戏库列表
│           ├── settings.js    # 设置页
│           └── update-panel.js# 更新面板
├── resources/
│   └── icon.ico              # 应用图标
├── electron-builder.yml      # 打包配置
└── package.json
```

## 🚀 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) >= 16
- npm 或 yarn

### 安装依赖

```bash
npm install
```

### 开发运行

```bash
npm start
```

### 打包构建

```bash
npm run build
```

构建产物在 `dist/` 目录下，包含：
- **portable** — 绿色便携版（`.exe`）
- **zip** — 压缩包

## 📄 更新日志

### v1.2.1 (2026-06-18)

- 🐛 **修复更新系统关键 Bug**
  - 修复并行下载结果顺序错乱的问题
  - 修复断点续传在服务器返回 200 时覆盖已下载数据的问题
  - 修复下载文件大小异常时无法自动重试的问题
  - 修复预下载会直接把文件安装到游戏目录的问题
  - 修复回滚后 `currentVersion` 没有恢复的问题
  - 修复安装成功后备份被立即删除导致无法回滚的问题
  - 对不支持的 hdiff 差量包改为报错而不是静默跳过
  - 修复暂停后继续下载会清空缓存的问题
  - 修复活跃任务完成后未从内存中清理的问题
- ⚙️ **补齐下载设置 UI** — 在设置面板新增并发数、重试次数、下载限速
- 📁 **新增安装目录设置** — 添加游戏时自动推断安装根目录，设置面板可手动修改

### v1.2.0 (2026-06-18)

- 🔄 **更新系统重写** — 依据 Starward 更新逻辑规范化实现
  - 语义化版本比较、忽略版本、强制更新、预下载检测
  - 通用下载引擎：断点续传、重试、并发控制、限速、SHA256/MD5 校验
  - 更新任务状态机：`Pending → Downloading → Decompressing/Verifying → Finish`
  - 精确备份/回滚机制，避免全目录备份
  - 预下载完成标记与复用
- ⚙️ **新增下载设置字段** — 并发数、重试次数、下载限速

### v1.1.0 (2026-06-15)

- 🎯 **拖拽排序** — 游戏管理面板支持拖拽调整游戏顺序，替代原有的上下箭头按钮
- 🖱️ **拖拽手柄** — 新增 ⋮⋮ 拖拽手柄，悬停时高亮显示，拖拽时显示蓝色插入指示线
- 🔄 **排序引擎重写** — 后端采用 ID 数组批量排序，替代逐次交换的旧机制
- 🪟 **毛玻璃侧边栏** — 侧边栏现在使用 Frosted Glass 磨砂玻璃效果，视觉层次更丰富
- 🚀 **启动时检查更新** — 集成更新检测到启动流程中
- 🛠 **多项 UI 细节优化** — 隐藏折叠时的更新面板边框，优化添加游戏流程

### v1.0.0

- 初始发布

## 📄 License

MIT

---

Made with ❤️ and Electron
