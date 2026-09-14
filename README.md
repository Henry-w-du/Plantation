# Plantation

Plantation 是一款移动端优先的学习计划 PWA。它用白色与清透蓝色呈现浅色模式，用近黑与深海军蓝呈现深色模式，并自动跟随系统。项目只有 HTML、CSS、JavaScript、JSON 和本地图标，可直接部署到 GitHub Pages，不需要 Node 后端、数据库、Vercel、ChatGPT Sites 或任何运行时 CDN。

## 功能

- iPhone 添加到主屏幕后以独立 Web App 方式运行
- 黑白系统主题映射为“白＋蓝”和“近黑＋深蓝”
- 学期计划 JSON 导入
- 每项计划独立打卡、取消打卡、今日完成率、连续行动和历史记录
- 临时或永久新增计划
- 临时删除单日计划，或永久删除整个重复系列
- 临时或永久修改名称、时间、地点、类型和备注；类型可自由输入并保留为常用选项
- `.ics` 日历导出，可选择范围、类型以及是否携带提前 10 分钟提醒
- IndexedDB 本机保存；不可用时自动回退到 localStorage
- 完整备份与恢复
- v1 扁平数据自动迁移到 v2 分层数据，旧 localStorage 键不会被删除
- Service Worker 离线缓存与新版本刷新提示
- GitHub Pages 仓库子路径兼容

## 隐私与边界

计划、备注、覆盖记录、提醒设置和打卡默认只保存在当前设备、当前站点来源的浏览器存储中，不会发给服务器。Service Worker 只缓存公开的应用文件与项目内示例 JSON，不会缓存用户通过文件选择器导入的私人数据。

清除 Safari 网站数据、删除主屏幕网页 App、浏览器自动清理站点数据或更换手机，都可能使本机记录消失。请定期导出完整备份。

项目内 `sample/Plantation-朋友学期计划.json` 已做匿名化，只保留相同的学期结构、单双周和复习节奏，课程名、班级、老师及教室均为示例值。真实课表应作为仓库外的本地导入文件单独交给使用者，**不要上传到 Public 仓库**。

## 文件结构

```text
plantation/
├── .nojekyll
├── index.html
├── manifest.webmanifest
├── service-worker.js
├── README.md
├── DEPLOY.md
├── assets/
│   ├── css/app.css
│   ├── js/
│   │   ├── storage.js
│   │   ├── schedule.js
│   │   ├── calendar.js
│   │   ├── backup.js
│   │   ├── ui.js
│   │   └── app.js
│   └── icons/
│       ├── icon-192.png
│       ├── icon-512.png
│       ├── maskable-192.png
│       ├── maskable-512.png
│       └── apple-touch-icon.png
├── sample/Plantation-朋友学期计划.json
├── docs/Plantation-iPhone网页版使用说明.md
└── tests/check-project.cjs
```

## 本地打开

双击 `index.html` 可以查看界面、导入 JSON、打卡和导出文件。浏览器的 `file://` 模式不能注册 Service Worker，因此不具备真正的 PWA 安装与离线缓存能力；部分 iPhone 文件预览器还会禁止脚本或持久化。

完整测试请在项目目录启动静态服务器，例如电脑已安装 Python 时：

```bash
python -m http.server 8000
```

然后访问 `http://localhost:8000/`。正式 iPhone PWA 必须通过 HTTPS 访问，GitHub Pages 自带 HTTPS。

## 部署到 GitHub Pages

把本目录中的全部内容上传到 GitHub 仓库根目录，再在仓库 `Settings → Pages` 中选择：

- Source：`Deploy from a branch`
- Branch：`main`
- Folder：`/ (root)`

完整图文式步骤见 [DEPLOY.md](./DEPLOY.md)。网址格式为：

```text
https://用户名.github.io/仓库名/
```

所有运行时路径均使用 `./`，Service Worker 也通过自己的 scope 计算绝对地址，兼容 `/plantation/` 等仓库子目录。

## iPhone 添加到主屏幕

```text
Safari 打开 Plantation
→ 分享
→ 添加到主屏幕
→ 开启“作为网页 App 打开”
→ 添加
```

然后从主屏幕进入，再导入学期计划。具体使用、日历导入、换机和数据清理说明见 [iPhone 使用说明](./docs/Plantation-iPhone网页版使用说明.md)。

## JSON 数据格式

当前格式版本为 `schemaVersion: 2`。完整备份会保存五个核心层：

```json
{
  "schemaVersion": 2,
  "semester": {
    "name": "2026 秋季学期",
    "startDate": "2026-09-07",
    "weekOneStart": "2026-09-07",
    "endDate": "2027-01-17",
    "timeZone": "Asia/Shanghai",
    "breaks": []
  },
  "baseSchedule": [],
  "permanentOverrides": [],
  "dateOverrides": [],
  "checkins": {},
  "reminderSettings": { "enabled": true, "minutesBefore": 10 }
}
```

`baseSchedule` 每个系列可使用两种表达：

```json
{
  "id": "course-001",
  "title": "高等数学",
  "kind": "课程",
  "weekday": 1,
  "weeks": [1, 2, 3, 4, 5],
  "startTime": "08:00",
  "endTime": "09:40",
  "location": "教学楼 A101",
  "note": "",
  "source": "imported"
}
```

也可以用 `dates: ["2026-09-07", "2026-09-14"]` 精确保留不规则日期。附带的匿名示例使用日期列表，以保留假期、单双周和分阶段复习结构，同时避免把真实课表发布到 GitHub。

数据解析顺序固定为：原始计划 → 当日已生效的永久修改 → 单日覆盖。App 新建的永久修改会作用于整个重复系列；数据层仍保留 `effectiveFrom`，便于兼容旧版“从某日开始”的覆盖。打卡使用稳定的 `系列 ID@日期` 关联，并保存标题和日期快照；修改或删除计划不会删除历史打卡。

计划类型不限于内置的“课程、六级、计算机、课程复习、自主学习、休息”。新增或修改计划时可以直接输入“社团、兼职、值班、约会”等任意类型（最多 30 个字符）；自定义类型会保存在本机，并自动出现在后续编辑建议与日历导出筛选中。

导入能力兼容：

- v2 完整备份或学期计划
- 旧版 `{ events, done, alarms }` Plantation JSON
- 简化的 `{ semester, plans }` JSON

“导入学期计划”保留当前历史打卡与提醒设置；“恢复完整备份”整体替换本机状态。任何导入都会先校验，失败时不会覆盖当前数据。

## 日历提醒

日历导出包含标题、北京时间对应的开始与结束时间、地点、备注、类型、稳定 UID，以及可选的 `VALARM`。ICS 使用 UTF-8、CRLF 和 75 字节折行。

> Plantation 内的提醒开关仅控制后续导出的日历内容，不会自动修改已经导入到 iPhone 系统日历中的事件，也不等于系统闹钟。

计划更改后，请重新导出，或手动修改/删除旧日历事件。推荐为 Plantation 新建一个专用系统日历，避免重复导入。

## 离线与更新

首次在线成功访问后，Service Worker 缓存 HTML、CSS、JavaScript、manifest、图标和示例 JSON。短时间离线时仍能打开应用并读取 IndexedDB 中的本机数据。

发布新版本时：

1. 修改 `service-worker.js` 中的 `CACHE_NAME`，例如从 `plantation-v2.0.0` 改为 `plantation-v2.0.1`。
2. 上传全部修改到 GitHub。
3. 新 Worker 安装后，页面会出现“Plantation 有新版本，点击刷新”。
4. 用户点击后才激活新版并刷新一次；激活时清理旧 Plantation 缓存。

## 国内网络环境

运行时不加载 Google Fonts、Google API、Firebase、Cloudflare CDN、cdnjs、unpkg、jsDelivr 或其他第三方脚本。字体使用系统字体，所有核心资源均在仓库中。GitHub Pages 本身在不同网络环境中的连通性可能波动，本项目无法绕过 GitHub 的网络可用性。

## 自检

项目不依赖 npm。电脑安装 Node.js 后可运行：

```bash
node tests/check-project.cjs
```

该脚本检查相对路径、manifest、图标尺寸、Service Worker 资源表、禁用 CDN、JSON 数据、单双周、覆盖优先级、备份迁移和 ICS 关键格式。真实 iPhone 上仍应做一次添加主屏幕、断网启动、下载备份和日历提醒测试。
