**中文** | [English](README-en.md)

# 追踪建造者，而非网红

一个 AI 驱动的信息聚合工具，追踪 AI 领域最顶尖的建造者——研究员、创始人、产品经理和工程师——并将他们的最新动态整理成易于消化的摘要推送给你。

**理念：** 追踪那些真正在做产品、有独立见解的人，而非只会搬运信息的网红。

---

## ✨ 核心功能

### 📧 精美的 HTML 邮件推送

接收格式优美的摘要邮件，让阅读成为一种享受：

- **现代设计风格**：渐变背景配合简洁配色，视觉层次分明
- **响应式布局**：完美适配移动端和桌面端
- **专业排版**：适当的行间距和字间距，长时间阅读不疲劳
- **清晰的信息架构**：内容分区明确，重点突出

👐样例

<img width="1227" height="5531" alt="result" src="https://github.com/user-attachments/assets/3d1c0a36-100b-4f13-a012-b139d3e2515e" />

### 🤖 高质量摘要（纯程序化，无需 LLM API）

从海量信息中提炼核心价值，**完整保留原始内容**，绝不压缩成空话：

- **X/Twitter 洞察**：26 位精选 AI 建造者的最新动态，每条推文保留原文，附带话题分类（产品发布/技术深度/商业战略/行业观点）、互动数据、Quote Tweet 标注、关键数据高亮
- **播客摘要**：从转录稿中智能提取嘉宾背景介绍 + 带时间戳的核心要点段落，信息零损失
- **博客文章**：Anthropic Engineering、Claude Blog 的深度文章，含作者、摘要、正文摘录
- **中文优先**：默认中文输出，无需任何 AI 模型 API key

### ☁️ 零停机自动化

完全通过 GitHub Actions 云端运行，无需本地服务器：

- **GitHub 服务器执行**：每日自动运行，不受本地电脑状态影响
- **自动完成全流程**：从内容抓取到邮件发送，一键搞定
- **离线也能工作**：电脑关机也不影响邮件推送
- **灵活调度**：可自定义发送时间和频率

### 🛡️ 隐私优先设计

你的数据安全是我们的首要考虑：

- **加密存储**：所有配置通过 GitHub Secrets 安全管理
- **零个人数据暴露**：公开代码中不包含任何个人信息
- **仅处理公开内容**：只抓取和分析公开的博客、视频和社交帖子

---

## 🚀 快速开始

### 方式一：GitHub Actions（推荐）

这是最简单、最可靠的方式，无需在本地安装任何依赖：

1. **Fork 此仓库**到你的 GitHub 账户
2. **设置 GitHub Secrets**：
   - `SMTP_SERVER` — SMTP 服务器（如 `smtp.qq.com`）
   - `SMTP_PORT` — SMTP 端口（如 `587`）
   - `SMTP_USERNAME` — 邮箱地址
   - `SMTP_PASSWORD` — 邮箱密码/应用密码
   - `SMTP_SENDER` — 发件人邮箱
   - `SMTP_RECIPIENTS` — 收件人邮箱
3. **启用 GitHub Actions**
4. 摘要会自动每日推送到你的邮箱

### 方式二：本地安装

如果你需要在本地运行或调试：

```bash
git clone https://github.com/你的用户名/follow-builders.git
cd follow-builders/scripts && npm install
```

在 `~/.follow-builders/config.json` 创建配置文件：
```json
{
  "language": "zh",
  "frequency": "daily",
  "deliveryTime": "09:00",
  "timezone": "Asia/Shanghai",
  "delivery": {
    "method": "email",
    "email": "your@email.com"
  }
}
```

创建 `~/.follow-builders/.env` 文件：
```env
SMTP_SERVER=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=your@email.com
SMTP_PASSWORD=your-password
SMTP_SENDER=your@email.com
SMTP_RECIPIENTS=your@email.com
```

手动运行：
```bash
node scripts/auto-digest.js
```

---

## 📋 你会得到什么

每日摘要包含以下内容：

- 💬 **X/Twitter 洞察**：26 位精选 AI 建造者的关键观点和动态，**保留推文原文**，附话题分类、互动数据、Quote Tweet 上下文标注
- 📝 **博客文章**：AI 公司官方博客的技术深度文章（Anthropic Engineering、Claude Blog），含作者、摘要、正文摘录
- 🎙️ **播客摘要**：顶级 AI 播客新节目的精华内容，嘉宾背景介绍 + 带时间戳的核心要点段落
- 🔗 **原始链接**：所有内容都附带原文链接，方便深入阅读
- 🚫 **内容去重**：通过 `digest-state.json` 记录已推送 feed，避免同一批内容重复发送

---

## ⏰ 调度配置

GitHub Actions 默认每天 **09:00（北京时间）** 运行。

如需修改时间，编辑 `.github/workflows/generate-feed.yml`：

```yaml
cron: '0 1 * * *'  # 分钟 小时 日期 月份 星期（UTC时间1:00 = 北京时间9:00）
```

**示例：**
- `'0 1 * * *'` — 每天早上 9:00（北京时间）
- `'0 0 * * 1'` — 每周一早上 8:00（北京时间）

---

## 🎨 自定义邮件模板

邮件模板定义在 `scripts/auto-digest.js` 的 `markdownToHtml` 函数中。你可以轻松自定义：

- **颜色主题**：修改渐变和配色方案
- **字体大小**：调整标题和正文的字号
- **间距布局**：优化行间距和段落间距
- **响应式行为**：调整移动端显示效果

---

## 📝 默认信息源

### 播客（6个）
- [Latent Space](https://www.youtube.com/@LatentSpacePod)
- [Training Data](https://www.youtube.com/playlist?list=PLOhHNjZItNnMm5tdW61JpnyxeYH5NDDx8)
- [No Priors](https://www.youtube.com/@NoPriorsPodcast)
- [Unsupervised Learning](https://www.youtube.com/@RedpointAI)
- [The MAD Podcast with Matt Turck](https://www.youtube.com/@DataDrivenNYC)
- [AI & I by Every](https://www.youtube.com/playlist?list=PLuMcoKK9mKgHtW_o9h5sGO2vXrffKHwJL)

### X 上的 AI 建造者（26位）
[Andrej Karpathy](https://x.com/karpathy), [Swyx](https://x.com/swyx), [Josh Woodward](https://x.com/joshwoodward), [Boris Cherny](https://x.com/bcherny), [Thibault Sottiaux](https://x.com/thsottiaux), [Peter Yang](https://x.com/petergyang), [Nan Yu](https://x.com/thenanyu), [Madhu Guru](https://x.com/realmadhuguru), [Amanda Askell](https://x.com/AmandaAskell), [Cat Wu](https://x.com/_catwu), [Thariq](https://x.com/trq212), [Google Labs](https://x.com/GoogleLabs), [Amjad Masad](https://x.com/amasad), [Guillermo Rauch](https://x.com/rauchg), [Alex Albert](https://x.com/alexalbert__), [Aaron Levie](https://x.com/levie), [Ryo Lu](https://x.com/ryolu_), [Garry Tan](https://x.com/garrytan), [Matt Turck](https://x.com/mattturck), [Zara Zhang](https://x.com/zarazhangrui), [Nikunj Kothari](https://x.com/nikunj), [Peter Steinberger](https://x.com/steipete), [Dan Shipper](https://x.com/danshipper), [Aditya Agarwal](https://x.com/adityaag), [Sam Altman](https://x.com/sama), [Claude](https://x.com/claudeai)

### 官方博客（2个）
- [Anthropic Engineering](https://www.anthropic.com/engineering) — Anthropic 团队的技术深度文章
- [Claude Blog](https://claude.com/blog) — Claude 的产品公告与更新

💬可以自行添加其他信息源，如增添关注的博主、小宇宙上的播客等等
---

## 🔧 工作原理

整个系统分为四个核心步骤：

1. **中心化 Feed 生成**：[generate-feed.yml](.github/workflows/generate-feed.yml) 每天 09:00（北京时间）自动抓取所有信息源的最新内容，写入 `feed-x.json` / `feed-podcasts.json` / `feed-blogs.json`，并通过 `state-feed.json` 记录已抓取内容（防止同一推文/播客/博客被重复抓取）
2. **摘要生成**：[send-digest.yml](.github/workflows/send-digest.yml) 在 Feed 生成成功后自动触发，运行 `auto-digest.js` 用纯程序化逻辑生成中文摘要（保留原文 + 智能标注，无需 LLM API）
3. **内容去重**：通过 `digest-state.json` 记录已推送的 feed 批次时间戳，确保同一批内容不会被重复发送
4. **邮件推送**：格式化的 HTML 摘要通过 SMTP 发送到你的邮箱

---

## 🔒 隐私保护

我们重视你的隐私：

- **本地存储**：SMTP 凭据存储在 GitHub Secrets 或本地 `.env` 文件中
- **无个人数据泄露**：不会将你的个人数据提交到版本控制
- **仅处理公开信息**：只读取公开的博客文章、YouTube 视频和 X 帖子
- **配置私有化**：你的配置和偏好保持私密

---

## 📄 许可证

MIT License
