# GitHub Pages 发布教程

这份教程适合第一次使用 GitHub。Plantation 是纯静态网站，上传文件并开启 Pages 即可，不需要购买服务器，也不需要运行 Node 后端。

## 发布前先确认隐私

GitHub 的公开仓库和 GitHub Pages 页面可以被任何拿到链接的人访问。项目内 `sample/Plantation-朋友学期计划.json` 已经匿名化，可用于演示；它不是她的真实课表。

交付目录中、`plantation` 文件夹外的真实计划 JSON 只用于在她的手机上选择导入。不要把真实计划、使用 Plantation 后导出的完整备份或私人备注上传到公开仓库。

## 第 1 步：创建 GitHub repository

1. 打开 [GitHub](https://github.com/) 并登录。
2. 点右上角 `+`，选择 `New repository`。
3. `Repository name` 填仓库名，例如 `plantation`。
4. 为了免费且方便使用 GitHub Pages，可选择 `Public`。如果选择 `Private`，请先确认你的 GitHub 方案支持私有仓库 Pages。
5. 不要勾选自动添加 README、`.gitignore` 或 License，避免与本项目文件冲突。
6. 点 `Create repository`。

## 第 2 步：上传全部 Plantation 文件

1. 在新仓库页面点 `uploading an existing file`；如果已经有文件，则点 `Add file → Upload files`。
2. 打开交付的 `plantation` 文件夹。
3. 选中该文件夹**里面的全部内容**并拖到上传区域。不要只上传外层 `plantation` 文件夹。
4. 上传完成后，仓库首页根目录应直接看到：

```text
index.html
manifest.webmanifest
service-worker.js
README.md
DEPLOY.md
assets/
sample/
docs/
```

5. 页面底部提交说明可填 `Upload Plantation PWA`。
6. 点 `Commit changes`。如果页面让你选择分支，提交到 `main`。

注意：`.nojekyll` 是一个正常的隐藏文件。网页上传界面如果没有显示它通常也不影响此项目，但保留它更稳妥。

## 第 3 步：打开 Settings

进入这个仓库后，点顶部的 `Settings`。如果屏幕窄，可能需要先展开顶部菜单。

## 第 4 步：打开 Pages

在 Settings 左侧找到 `Code and automation`，点其中的 `Pages`。

## 第 5 步：选择 Deploy from a branch

在 `Build and deployment` 区域：

1. 找到 `Source`。
2. 选择 `Deploy from a branch`。

## 第 6 步：Branch 选择 main

在 Branch 一栏，第一个下拉框选择 `main`。

如果看不到 `main`，回到仓库首页确认文件已经提交，并检查默认分支名称。若仓库使用的是别的分支，可以使用实际分支，但本教程推荐 `main`。

## 第 7 步：Folder 选择 / (root)

第二个下拉框选择 `/ (root)`。这表示 GitHub 直接从仓库根目录读取 `index.html`。

不要选择 `/docs`，因为本项目的网页入口不在 `docs` 文件夹。

## 第 8 步：Save

点 `Save`。GitHub 会开始构建 Pages 页面。

## 第 9 步：等待 GitHub Pages 地址生成

通常等待几分钟，然后刷新 `Settings → Pages`。成功后会显示可访问地址：

```text
https://用户名.github.io/仓库名/
```

例如 GitHub 用户名为 `xiaoming`，仓库名为 `plantation`：

```text
https://xiaoming.github.io/plantation/
```

用 Safari 打开这个**带结尾斜杠**的地址即可。首次发布或更新后，GitHub 缓存可能需要几分钟才完全生效。

## 第 10 步：在 iPhone 安装

1. 用 Safari 打开 GitHub Pages 地址。
2. 点“分享”。
3. 点“添加到主屏幕”。如果列表里没有，可点“编辑操作”把它加回来。
4. 开启“作为网页 App 打开”。
5. 名称保持 `Plantation`，点“添加”。
6. 从主屏幕打开，再导入计划。

完整使用方法见 `docs/Plantation-iPhone网页版使用说明.md`。

## 后续更新网站

1. 在电脑上修改文件。
2. 如果修改了 HTML、CSS、JavaScript、manifest、图标或示例文件，请同时把 `service-worker.js` 中的缓存名升级，例如：

```javascript
const CACHE_NAME = 'plantation-v2.0.1';
```

3. 回到仓库，打开对应文件，点铅笔图标编辑；文件较多时用 `Add file → Upload files` 上传覆盖。
4. 提交到 `main`。
5. 等待 Pages 重新发布。用户再次进入后会看到新版提示，点“点击刷新”。

不要只改缓存名却漏传资源，也不要更新资源却长期沿用旧缓存名。

## 常见问题

### 打开后是 404

- 确认仓库根目录直接存在 `index.html`。
- 确认 Pages 选择的是 `main` 和 `/ (root)`。
- 确认访问地址里包含仓库名。
- 等待几分钟后再刷新。

### 页面没有样式或按钮没反应

- 确认 `assets/css/app.css` 和 `assets/js/` 文件都已上传。
- 不要把 `assets` 单独放到别的目录。
- 本项目路径均以 `./` 开头，适用于仓库子路径；不要擅自改为 `/assets/...`。

### 仍然看到旧版本

- 等待页面顶部出现“有新版本”，点“点击刷新”。
- 确认更新时修改了 `CACHE_NAME`。
- 完整备份后，可关闭并重新打开主屏幕 App。最后手段才是清除网站数据，因为这会删除没有备份的计划和打卡。

### GitHub Pages 地址在网络中打不开

本项目没有第三方 CDN，但网页仍由 GitHub Pages 提供。中国大陆不同网络和时段的 GitHub 连通性可能不稳定。可尝试切换运营商网络或稍后再试；若长期不可用，需要迁移到国内可访问的静态托管服务，源码本身无需改后端。

### 朋友能看到我的打卡吗

不能。打卡和私人修改只在使用者手机里。只有仓库内文件会公开；不要把“完整备份 JSON”提交到公开仓库。
