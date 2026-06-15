# 🌟 Star Launcher

[![Download](https://img.shields.io/badge/下载-v1.1.0-blue)](https://github.com/hutao-ai-makei/star/releases/latest)

> 第三方游戏启动器 — 极简玻璃拟态风格

基于 Electron 打造的轻量级游戏启动器，采用流行的 Glassmorphism（玻璃拟态）设计风格，让你优雅地管理和启动本地游戏。

## ✨ 功能特性

- 🎮 **游戏管理** — 添加、编辑、删除本地游戏，支持自定义名称和路径
- 🚀 **一键启动** — 快速启动游戏，记录最近游玩时间
- 🎨 **玻璃拟态 UI** — 毛玻璃效果界面，可拖拽无边框窗口
- ⚙️ **设置页面** — 自定义窗口大小、记住窗口位置
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
│           └── settings.js    # 设置页
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
