# 游戏启动器设计文档

**日期**：2026-06-07
**状态**：待评审

---

## 1. 项目概述

一个 Windows 桌面游戏启动器，管理本地独立游戏（`.exe` 文件），提供极简的游戏库浏览和启动体验。

## 2. 用户体验

### 2.1 核心界面

**主窗口**：无框毛玻璃风格窗口，左右分区。

**左侧图标栏（52-56px）**：
- 垂直排列游戏图标（40×40，圆角 12px）
- 当前选中游戏：蓝紫色高亮描边（`rgba(102,126,234,0.55)` + 背景 `rgba(102,126,234,0.2)`）
- 未选中游戏：半透明图标（opacity 0.55）
- 底部添加按钮（+）与游戏列表之间用分隔线隔开
- 侧栏自身有毛玻璃效果

**右侧封面区**：
- 整张游戏封面图铺满整个右侧空间
- 左上角：游戏名称（22px，白色，加粗）+ 上次游玩时间（12px，半透白）
- 底部居中：毛玻璃启动按钮（14px 上下内边距，28px 圆角，半透白背景 `rgba(255,255,255,0.15)`，backdrop-filter: blur(16px)，白色描边）
- 底部渐变遮罩：`linear-gradient(transparent, rgba(0,0,0,0.6))` 覆盖下方 50% 高度

### 2.2 添加游戏流程

用户点击 + → 弹出文件选择对话框（系统原生）→ 选择 `.exe` → 自动填充名称 → 确认添加。

### 2.3 交互行为

- 点击左侧图标 → 右侧切换对应游戏
- 键盘 ↑↓ → 切换游戏
- 启动按钮 → spawn 游戏进程 → 后台记录开始时间 → 监听进程退出 → 更新总时长和上次游玩时间
- 关闭窗口 → 记住尺寸和位置

### 2.4 边界情况

- **exe 路径失效**：详情页显示"找不到文件"，提供"重新定位"按钮
- **启动失败**：弹出提示，不闪退
- **空库**：右侧引导页"还没有游戏，点击左侧 + 添加"
- **封面缺失**：显示默认渐变底图 + 游戏名大字居中
- **窗口最小尺寸**：640×420

## 3. 技术架构

### 3.1 选型

- **框架**：Electron
- **前端**：原生 HTML/CSS/JS（无框架）
- **数据存储**：electron-store（本地 JSON 文件）
- **打包工具**：electron-builder（Windows NSIS 安装包）

### 3.2 项目结构

```
star-launcher/
├── package.json
├── electron-builder.yml
├── src/
│   ├── main/
│   │   ├── index.js          # 创建窗口、注册 IPC
│   │   ├── store.js          # electron-store 读写
│   │   ├── game-launcher.js  # 启动/监控游戏进程
│   │   └── file-scanner.js   # 扫描目录发现 .exe
│   ├── preload/
│   │   └── preload.js        # contextBridge 暴露 API
│   └── renderer/
│       ├── index.html
│       ├── css/
│       │   ├── style.css      # 全局 + 窗口布局
│       │   └── glass.css      # 毛玻璃组件
│       ├── js/
│       │   ├── app.js         # 入口
│       │   ├── library.js     # 左侧图标栏
│       │   ├── detail.js      # 右侧详情区
│       │   └── add-game.js    # 添加游戏
│       └── assets/
└── resources/
```

### 3.3 数据模型

```json
{
  "games": [
    {
      "id": "uuid",
      "name": "ELDEN RING",
      "exePath": "D:\\Games\\ELDEN RING\\Game\\eldenring.exe",
      "coverPath": "C:\\Users\\...\\AppData\\Roaming\\star-launcher\\covers\\eldenring.jpg",
      "tags": [],
      "addedAt": "2026-06-07T10:30:00Z",
      "lastPlayedAt": "2026-06-06T20:15:00Z",
      "totalPlayTime": 43200,
      "notes": "",
      "rating": 0
    }
  ],
  "settings": {
    "windowWidth": 900,
    "windowHeight": 600,
    "windowX": null,
    "windowY": null,
    "scanDirs": [],
    "autoScan": false
  }
}
```

**字段说明**：
- `id`：唯一标识
- `name`：游戏名称，显示在封面区左上角
- `exePath`：可执行文件绝对路径
- `coverPath`：封面图存储路径（添加时复制到 AppData 下）
- `tags`：分类标签（预留）
- `addedAt`：添加时间
- `lastPlayedAt`：上次启动时间，用于排序和显示
- `totalPlayTime`：累计游玩秒数
- `notes`：用户备注
- `rating`：评分 1-5（0 表示未评分）
- `settings.scanDirs`：自动扫描目录列表
- `settings.autoScan`：是否启用自动扫描

### 3.4 进程架构

```
Main Process (Node.js)
  ├── 创建 BrowserWindow（frame: false）
  ├── IPC Handler：launchGame(id)
  │     → 读取 exePath
  │     → child_process.spawn()
  │     → 计时
  │     → 监听 exit → 更新 totalPlayTime
  ├── IPC Handler：addGame(exePath)
  │     → 解析名称
  │     → 复制封面到 AppData
  │     → 写入 store
  ├── IPC Handler：selectExeFile()
  │     → dialog.showOpenDialog()
  └── IPC Handler：getGames / saveSettings / ...

Renderer Process (Chromium)
  ├── 通过 window.electronAPI 调用 Main
  ├── 渲染 UI（毛玻璃 CSS）
  ├── 响应键盘事件（↑↓）
  └── 不直接访问 Node.js API
```

### 3.5 安全

- `contextIsolation: true`，Node.js API 不暴露给渲染进程
- `preload.js` 通过 `contextBridge` 暴露受限接口
- 游戏进程以子进程方式启动，不注入、不 hook

## 4. 视觉风格

- 毛玻璃/玻璃拟态（Glassmorphism）
- 浅色渐变背景（参考 `设计风格/glassmorphism-components-light.html`）
- 色彩系统：
  - 主题色：`#667eea`（蓝紫）
  - 文字主色：`#2D2B55`
  - 玻璃面板：`rgba(255,255,255,0.55)` + `backdrop-filter: blur(20px)`
  - 边框：`rgba(255,255,255,0.65)`

## 5. 不做的功能

- Mod 管理
- 存档管理
- 云同步
- 成就追踪
- 手柄映射
- Steam/Epic 等平台集成
- 模拟器 ROM 管理
