# Star Launcher — 游戏更新与预下载系统设计

> 日期: 2026-06-14 | 状态: 待审批

## 目标

为 Star Launcher 新增游戏版本更新和预下载功能，使启动器能独立管理游戏版本，不依赖第三方平台客户端。

## 参考

- [Starward](https://github.com/Scighost/Starward) — 米家游戏第三方启动器，借鉴其分块下载、增量更新、预下载轮询、统一 API 设计

---

## 一、数据模型

### 游戏字段扩展 (library.json)

```js
{
  // ===== 原有字段 =====
  id: "uuid",
  name: "游戏名",
  exePath: "C:/games/genshin/GenshinImpact.exe",
  coverPath: "",
  iconPath: "",
  backgroundPath: "",
  videoPath: "",
  mediaDir: "",
  tags: [],
  addedAt: "2026-06-14T...",
  lastPlayedAt: null,
  totalPlayTime: 0,
  notes: "",
  rating: 0,

  // ===== 新增字段 =====
  packageId: "",           // 游戏包 ID，用于查询统一 API
  apiBase: "",             // API 基础 URL（可全局配置，见 settings）
  currentVersion: "",      // 本地已安装版本号，如 "5.2.0"
  targetVersion: "",       // 下载目标版本号
  updateStatus: "idle",    // idle | checking | downloading | installing | done | error
  updateMode: "full",      // full | delta（增量）
  downloadProgress: {
    totalBytes: 0,         // 总大小
    downloadedBytes: 0,    // 已下载
    speed: 0,              // 字节/秒
    chunks: [{ index: 0, start: 0, end: 0, done: false }]
  },
  updateLog: "",           // 本次更新日志
  installDir: "",          // 游戏安装根目录（解压目标）
  isPreDownload: false,    // 是否处于预下载阶段
}
```

### 全局设置扩展

```js
settings: {
  // ...原有字段
  defaultApiBase: "",      // 默认 API 基础 URL
  autoCheckUpdate: true,   // 启动器启动时自动检查更新
  preDownloadPollMinutes: 30, // 预下载轮询间隔（分钟）
  maxConcurrentChunks: 4,  // 最大并行分块数
}
```

---

## 二、远端 API 格式

Star Launcher 通过统一的 REST API 获取游戏版本信息。API 地址由全局设置 `defaultApiBase` 或游戏级 `apiBase` 决定。

### 请求

```
GET /api/game-packages?package_ids=genshin_cn,hkrpg_cn
Authorization: Bearer <token>  （可选）
```

### 响应

```json
{
  "packages": [
    {
      "packageId": "genshin_cn",
      "name": "原神",
      "currentVersion": "5.4.0",
      "gameExecutable": "GenshinImpact.exe",

      "preDownload": {
        "available": true,
        "version": "5.5.0",
        "size": 4194304000,
        "chunks": 8,
        "url": "https://cdn.example.com/predownload/5.5.0/",
        "sha256": "abc123..."
      },

      "forceUpdate": false,

      "update": {
        "version": "5.3.0",
        "size": 2097152000,
        "chunks": 4,
        "url": "https://cdn.example.com/update/5.3.0/",
        "sha256": "abc123...",
        "delta": {
          "fromVersion": "5.2.0",
          "size": 524288000,
          "chunks": 2,
          "url": "https://cdn.example.com/delta/5.2.0-5.3.0/",
          "sha256": "def456..."
        }
      },

      "updateLog": "## 5.3.0 更新\r\n- 新角色「芙宁娜」登场\r\n- 修复了xxx问题"
    }
  ]
}
```

### 预下载与更新的区别

| | 预下载 (preDownload) | 更新 (update) |
|---|---|---|
| 触发时机 | 后台定时轮询 | 用户点「启动」时 |
| 安装时机 | 版本正式上线后 | 下载完成即可安装 |
| 版本对比 | preDownload.version > currentVersion | update.version > currentVersion |

---

## 三、模块架构

### 文件结构

```
src/main/
├── index.js              ← 修改：新增 IPC handlers
├── store.js              ← 修改：游戏字段扩展
├── game-launcher.js      ← 修改：启动前触发版本检查
├── update-checker.js     ← 新建：版本检查
├── download-manager.js   ← 新建：分块下载
└── install-manager.js    ← 新建：安装与回滚

src/renderer/
├── index.html            ← 修改：新增更新面板 DOM
├── css/style.css         ← 修改：更新面板样式
└── js/
    ├── app.js            ← 修改：集成更新流程
    └── update-panel.js   ← 新建：更新面板 UI 组件

src/preload/preload.js    ← 修改：暴露新 IPC API
```

### 模块职责

#### 3.1 update-checker.js — 版本检查

```
checkForUpdate(gameId) → { hasUpdate, manifest, isPreDownload }
```
- 读取游戏的 packageId + apiBase → 构造 API 请求
- HTTP GET 拉取清单，对比版本号
- 返回是否有更新、是否为预下载

```
pollPreDownloads() → void
```
- 遍历 isPreDownload=true 的游戏
- 按 settings.preDownloadPollMinutes 定时轮询
- 检测到 preDownload.available → 静默触发下载

#### 3.2 download-manager.js — 分块下载

```
download(gameId, url, chunks, totalSize, sha256, onProgress) → { filePath }
```
- HTTP Range 请求分块并行下载（最大并行数由 settings 控制）
- `onProgress({ total, downloaded, speed })` 实时回调，通过 IPC 推送到渲染进程
- 支持暂停/取消（通过 AbortController）
- 合并分块 → 校验 SHA256 → 写入 `{installDir}/.downloads/`

```
pause(gameId) → void
cancel(gameId) → void     // 删除临时下载文件
```

#### 3.3 install-manager.js — 安装与回滚

```
install(gameId, zipPath) → void
```
- 将旧版文件备份到 `{installDir}/.backup/{oldVersion}/`
- 从 zip 解压覆盖到 installDir
- 更新 game.currentVersion
- 清理下载缓存

```
rollback(gameId) → void
```
- 从 `.backup/` 恢复旧版本文件
- 删除目标版本的部分文件

### 数据流

```
┌──────────┐
│ 启动游戏  │
└────┬─────┘
     ▼
┌──────────────┐    无更新    ┌──────────┐
│ 版本检查 API │────────────→│ 直接启动  │
└──────┬───────┘              └──────────┘
       │ 有更新
       ▼
┌──────────────────┐
│ forceUpdate?     │
└───┬──────────┬───┘
    │ true     │ false
    ▼          ▼
┌──────────┐ ┌──────────┐  跳过   ┌──────────┐
│强制更新面板│ │普通更新面板│────────→│ 直接启动  │
│(不可跳过) │ │(可跳过)   │         └──────────┘
└────┬─────┘ └────┬─────┘
     │ 必须更新   │ 确认更新
       ▼
┌──────────────┐
│ 分块并行下载  │←── onProgress → UI 进度条
└──────┬───────┘
       ▼
┌──────────────┐    失败     ┌──────────┐
│ SHA256 校验  │───────────→│ 提示错误  │
└──────┬───────┘              └──────────┘
       │ 通过
       ▼
┌──────────────┐
│ 备份 → 解压  │
└──────┬───────┘
       ▼
┌──────────────┐    失败     ┌──────────┐
│ 标记版本号    │───────────→│ 自动回滚  │
└──────┬───────┘              └──────────┘
       │ 成功
       ▼
┌──────────┐
│ 启动游戏  │
└──────────┘
```

### 预下载流程（独立于启动流程）

```
启动器空闲
  → pollPreDownloads()
  → 定时检查 API（每 30 分钟）
  → 检测到 preDownload.available
  → 静默下载（不阻塞 UI）
  → 下载完成 → updateStatus = 'done'
  → 通知用户「预下载完成，等待版本上线」
  → 用户稍后手动点「安装」
```

---

## 四、IPC 接口

### 渲染→主进程（invoke）

| 方法 | 参数 | 返回 |
|------|------|------|
| `check-update` | gameId | `{ hasUpdate, manifest }` |
| `start-download` | gameId, mode('full'\|'delta') | void |
| `pause-download` | gameId | void |
| `cancel-download` | gameId | void |
| `start-install` | gameId | void |
| `rollback-game` | gameId | void |
| `poll-predownload` | - (启动轮询) | void |

### 主→渲染进程（send/on）

| 事件 | payload |
|------|---------|
| `update-status-change` | `{ gameId, status, message }` |
| `download-progress` | `{ gameId, total, downloaded, speed }` |
| `update-error` | `{ gameId, error }` |
| `predownload-ready` | `{ gameId, version }` |

---

## 五、UI 设计

### 更新面板

在游戏详情区（封面和启动按钮之间）插入可展开/收起的更新面板，复用现有玻璃拟态样式。

#### 状态：检测到强制更新（forceUpdate=true）

```
┌─────────────────────────────────────────────┐
│ ⚠️ 原神 需要强制更新后才可以启动               │
│ 当前版本 5.2.0  →  新版本 5.4.0              │
│                                              │
│ 更新内容：                                    │
│ - 修复了严重安全漏洞                           │
│ - 新增反作弊模块                              │
│                                              │
│ 更新大小：2.0 GB（增量包 512 MB）              │
│                                              │
│  [📥 完整更新]  [📦 增量更新]                  │
│  （必须更新，不可跳过）                          │
└─────────────────────────────────────────────┘
```

#### 状态：检测到普通更新（forceUpdate=false）

```
┌─────────────────────────────────────────────┐
│ 🌟 原神 有可用更新                           │
│ 当前版本 5.2.0  →  新版本 5.3.0              │
│                                              │
│ 更新内容：                                    │
│ - 新角色「芙宁娜」登场                         │
│ - 修复了xxx问题                               │
│                                              │
│ 更新大小：2.0 GB（增量包 512 MB）              │
│                                              │
│  [📥 完整更新]  [📦 增量更新]  [⏭ 跳过]        │
└─────────────────────────────────────────────┘
```

#### 状态：下载中

```
┌─────────────────────────────────────────────┐
│ 📥 正在下载...  ████████░░░░░░  67%          │
│                                              │
│ 已下载 1.34 GB / 2.0 GB                      │
│ 速度 12.5 MB/s · 剩余约 52 秒                 │
│                                              │
│  [⏸ 暂停]  [✕ 取消]                          │
└─────────────────────────────────────────────┘
```

#### 状态：预下载就绪

```
┌─────────────────────────────────────────────┐
│ 📦 预下载完成！版本 5.5.0 已准备就绪          │
│ 等待版本上线后即可安装                          │
│                                              │
│  [🔧 立即安装]  [🗑 删除]                      │
└─────────────────────────────────────────────┘
```

#### 状态：错误

```
┌─────────────────────────────────────────────┐
│ ❌ 更新失败                                   │
│ 错误：SHA256 校验不匹配，请重试                │
│                                              │
│  [🔄 重试]  [↩ 回滚到旧版本]                  │
└─────────────────────────────────────────────┘
```

### 位置与动画

- 位于 `#detail-area` 中，封面下方、启动按钮上方
- `max-height: 0 → max-height: 300px` 的 CSS transition，300ms ease-out
- 进度条使用 `--accent` 色（`#667eea`）渐变填充
- 面板外层使用 `.glass-card` 类复用现有样式

### 侧边栏状态标记

在游戏列表项上用小圆点标记更新状态：

| 颜色 | 含义 |
|------|------|
| 🔵 蓝点 | 有可更新版本 |
| 🟡 黄点 | 正在下载 |
| 🟢 绿点 | 预下载完成，待安装 |
| 🔴 红点 | 更新出错 |

---

## 六、错误处理

| 场景 | 处理 |
|------|------|
| 网络断开 | 显示"网络错误"，保留已下载进度，支持断点续传 |
| API 返回 404/500 | 提示"无法获取更新信息"，允许跳过直接启动 |
| SHA256 不匹配 | 删除已下载文件，提示用户重试 |
| 磁盘空间不足 | 下载前预估空间，不足时提示并拒绝下载 |
| 安装失败 | 自动从 `.backup/` 回滚，标记 updateStatus=error |
| 游戏正在运行 | 禁止安装，提示"请先关闭游戏" |

---

## 七、待定 / 延后

- [ ] **API 认证** — 暂不需要。API 先设计为开放接口，后续如需 Token 可在 `apiBase` 配置中追加 `headers` 字段
- [ ] **多 CDN** — 暂不需要。API 响应中的 `url` 只返回单个地址，后续可扩展为 `urls: []` 数组
- [x] **强制更新** — 已纳入设计。`forceUpdate=true` 时隐藏「跳过」按钮，用户必须更新后才能启动

---

## 八、实施影响范围

| 文件 | 操作 |
|------|------|
| `src/main/store.js` | 修改默认游戏字段 |
| `src/main/update-checker.js` | **新建** |
| `src/main/download-manager.js` | **新建** |
| `src/main/install-manager.js` | **新建** |
| `src/main/index.js` | 新增 6 个 IPC handler |
| `src/main/game-launcher.js` | 启动前调用 update-checker |
| `src/preload/preload.js` | 新增 8 个 IPC 通道 |
| `src/renderer/js/update-panel.js` | **新建** — 更新面板组件 |
| `src/renderer/js/app.js` | 集成更新流程入口 |
| `src/renderer/index.html` | 新增更新面板 DOM |
| `src/renderer/css/style.css` | 新增更新面板样式 |
