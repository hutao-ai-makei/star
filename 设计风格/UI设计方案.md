# Star Launcher 界面设计方案 V1

> 配套高保真设计稿：`star-launcher-redesign-v1.html`（浏览器打开即可交互体验）

## 一、设计目标

| 目标 | 落点 |
|------|------|
| 美观 | 延续品牌玻璃拟态语言，封面区升级为沉浸式 Hero 展示 |
| 易用 | 符合游戏启动器用户习惯（Steam / Epic 心智模型）：左侧选游戏 → 右侧看封面 → 一键启动 |
| 不打断 | 下载/更新以浮层卡片呈现，浏览游戏时进度始终可见但不遮挡核心操作 |

## 二、信息架构与布局

```
┌────────┬──────────────────────────────────────────┐
│        │  标题栏（拖拽区）面包屑        ─  □  ✕   │
│  侧    ├──────────────────────────────────────────┤
│  边    │                                          │
│  栏    │         Hero 游戏封面（可切换媒体）        │  ← 下载浮层卡片（右上）
│  88px  │                                          │
│  ·Logo │  ◀                                  ▶    │
│  ·游戏 │                                          │
│  图标  │  [状态徽章] [版本]                        │
│  ·添加 │  游戏名（42px 大标题）                     │
│  ·设置 │  上次游玩 / 总时长          [ⓘ][📁][▶启动游戏] │
└────────┴──────────────────────────────────────────┘
```

**关键决策**

1. **侧边栏从「纯图标栏」升级为带明确选中态的导航**
   - 选中游戏：白色描边 + 发光外环 + 左侧渐变指示条，三重反馈，扫一眼就知道当前选中谁
   - 更新中的游戏在图标右上角显示琥珀色角标，无需点进去就能发现更新
2. **封面区信息层级重排**：状态徽章 → 游戏名 → 元信息（上次游玩/总时长）→ 操作。用户在启动前最关心的「我上次玩到什么时候」放在标题正下方。（成就系统已移除，不展示）
3. **启动按钮强化**：54px 高白色胶囊按钮，放在右下（符合 Fitts 定律，距离封面视觉焦点近），启动后变为「■ 停止」深色玻璃态
4. **更新面板改为右上浮层卡片**：进度环 + 速度 + 剩余时间 + 暂停/取消，不遮挡封面和启动按钮
5. **设置面板保持右侧滑出**，但增加毛玻璃遮罩、Esc 关闭、分类图标化

## 三、设计令牌（与现有代码兼容）

| 令牌 | 值 | 说明 |
|------|-----|------|
| `--text` | `#2D2B55` | 主文字（沿用现有） |
| `--text-light` | `rgba(45,43,85,0.55)` | 次要文字 |
| `--accent` / `--accent-deep` | `#667eea` / `#764ba2` | 品牌渐变（沿用现有） |
| `--glass` / `--glass-border` | `rgba(255,255,255,0.55)` / `0.65` | 浅色玻璃材质 |
| `--glass-dark` | `rgba(20,16,48,0.28)` | **新增**：封面上的深色玻璃（徽章、箭头、圆形按钮） |
| `--success` / `--warning` / `--danger` | `#22b07d` / `#f59e0b` / `#e5484d` | 语义色：已安装 / 更新中 / 关闭·删除 |
| 间距 | 4 / 8 / 12 / 16 / 24 / 32px | 4px 基准网格 |
| 圆角 | 10 / 14 / 18 / 24px | 组件从小到大递增 |
| 动效 | 150ms / 280ms `cubic-bezier(.4,0,.2,1)` | 微交互 / 面板级 |

## 四、组件规范要点

- **游戏图标** 52px、圆角 18px；hover 上浮 2px + 放大 1.06 倍；active 态加 2px 白色描边 + `--accent` 外发光环
- **状态徽章**：绿色呼吸灯 = 已安装，琥珀色 = 更新中；徽章为深色玻璃底白字，保证在任意封面图上可读
- **媒体箭头**：默认隐藏，鼠标进入主区才淡入（opacity 过渡），减少视觉噪音
- **启动按钮状态机**：`启动游戏 → 正在启动…（禁用）→ ■ 停止`，全程 Toast 反馈
- **下载卡片**：进度环使用品牌渐变描边，暂停按钮可交互
- **设置行**：游戏封面缩略图 + 名称/版本 + 自动更新开关 + 移除按钮；开关支持键盘（Enter/Space）操作

## 五、无障碍（WCAG AA）

- 封面文字均位于深色 scrim 之上，白字对比度 ≥ 4.5:1
- 所有图标按钮带 `aria-label`；开关使用 `role="switch"` + `aria-checked`
- `:focus-visible` 显示 2px `--accent` 外轮廓
- `prefers-reduced-motion` 下禁用全部过渡动画
- 触控目标最小 30px（主按钮 46–54px）

## 六、落地建议（对现有代码的改造点）

1. `index.html`：封面区 `#game-info` 内增加状态徽章行与元信息（上次游玩/总时长，不含成就）；`#launch-btn` 移至右下角操作组
2. `update-panel`：从封面内嵌改为右上浮层卡片（对应 `#download-card`），复用现有 `update-panel.js` 的数据源即可
3. `glass.css`：追加 `--glass-dark` 深色玻璃令牌与 `.status-chip`、`.dl-ring` 两个新组件
4. 侧边栏选中指示条用 `.game-icon.active::before` 纯 CSS 实现，无需改 JS 逻辑

## 七、已确认决策

- ✅ 封面图比例：**16:9**，Hero 区 `background-size: cover` + `background-position: center` 居中裁切
- ✅ Hero 区**不加社交信息**（成就进度条、好友在玩等均不做）
- ✅ 侧边栏游戏图标：**从 exe 文件提取**（现有实现已满足，见下节）
- ⏳ 深色主题版本：令牌已预留切换结构，后续扩展 `[data-theme="dark"]`

## 八、封面与图标数据流（在哪换图）

| 界面元素 | 数据字段 | 更换入口 | 存储位置 |
|---|---|---|---|
| Hero 大封面（16:9） | `backgroundPath` | 设置 → 游戏管理 → 展开游戏 →「游戏背景」→ 浏览 | `userData/data/library.json` |
| 封面轮播（可选） | `mediaDir` / `videoPath` | 同上，「媒体目录」/「背景视频」 | 同上 |
| 侧边栏游戏图标 | `iconPath` | **自动**：添加游戏时从 exe 提取；**手动**：设置 →「提取图标」按钮 | `userData/icons/<gameId>.png` |

**图标抓 exe 已是现有实现**：`main/index.js` 的 `extract-exe-icon` 通过 `app.getFileIcon(exePath, { size: 'large' })` 生成 PNG 缓存；`add-game.js` 在添加游戏后自动调用；设置编辑面板保留手动「提取图标」按钮。新设计稿的侧边栏图标即绑定 `iconPath`。

⚠️ **两处命名易混淆，建议随新 UI 一并修正**：

1. 设置里的「游戏图标」字段实际写入 `coverPath`，而 `coverPath` 在侧边栏渲染（`library.js`）中优先级**高于** `iconPath` —— 手动设置它会覆盖 exe 图标。新 UI 建议：侧边栏图标固定使用 `iconPath`，该字段更名为「自定义图标（可选，留空则使用 exe 图标）」。
2. 「游戏背景」(`backgroundPath`) 才是主界面大封面。新 UI 设置面板中更名为「封面图（16:9）」。
3. `app.getFileIcon` 在 Windows 上 large 尺寸为 32×32，放在 52px 图标位会略糊。如需高清图标，后续可改为解析 exe 内嵌图标资源（如 PowerShell `System.Drawing.Icon.ExtractAssociatedIcon`）提取 256×256。

## 九、代码实现状态（已落地）

按本方案重写渲染层，保留全部现有 IPC 与更新生命周期逻辑，仅做最小必要改动接入新 DOM：

| 文件 | 改动 |
|---|---|
| `src/renderer/index.html` | 重构为侧边栏 + Hero 封面区 + 启动按钮组 + 浮层更新面板 + 滑出设置面板；移除成就相关结构 |
| `src/renderer/css/style.css` | 落地设计令牌（新增 `--accent-deep`/`--glass-dark`/`--success`/`--warning`/`--danger`/间距/圆角）；重排布局；更新面板改为右上浮层卡片；`#settings-panel` 改为右侧滑出 |
| `src/renderer/css/glass.css` | 新增 Hero 信息层、状态徽章、启动按钮（白色胶囊）、圆形操作按钮；保留轻量更新面板样式；补充 `:focus-visible` 与 `prefers-reduced-motion` |
| `src/renderer/js/library.js` | 图标优先级改为 `iconPath`（exe 提取）> `coverPath` > emoji；更新中游戏显示角标 |
| `src/renderer/js/detail.js` | 填充上次游玩/总时长/版本/状态徽章；移除 `#game-last-played`；接管媒体指示点渲染 |
| `src/renderer/js/app.js` | 启动按钮改用 `#launch-icon`/`#launch-text` 双 span；运行态改深色玻璃；`📁` 按钮真正打开安装目录 |
| `src/renderer/js/settings.js` | 每行新增「更换封面 🖼 / 重取 exe 图标 ⟳」快捷按钮；面板滑入动画 + Esc 关闭；字段标签按建议重命名 |
| `src/main/index.js` | 新增 `open-path` IPC（在资源管理器打开安装目录）；引入 `shell` |
| `src/preload/preload.js` | 暴露 `openPath` |

所有 JS 已通过 `node --check` 语法校验。运行：`npm start`（Electron）。
