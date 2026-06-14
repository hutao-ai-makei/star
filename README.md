# 🌟 Star Launcher

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

## 📄 License

MIT

---

Made with ❤️ and Electron
