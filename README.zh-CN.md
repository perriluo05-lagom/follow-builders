[English](README.md) | **中文**

# 追踪建造者，而非网红

一个 AI 驱动的信息聚合工具，追踪 AI 领域最顶尖的建造者——研究员、创始人、产品经理和工程师——并将他们的最新动态整理成易于消化的摘要推送给你。

**理念：** 追踪那些真正在做产品、有独立见解的人，而非只会搬运信息的网红。

## ✨ 核心功能

### 📧 精美的 HTML 邮件推送
接收格式优美的摘要邮件：
- 现代简洁的设计风格，渐变背景
- 响应式布局，适配移动端和桌面端
- 清晰的视觉层次和适当的间距
- 专业的排版，优化阅读体验

### 🤖 高质量摘要
- **播客摘要：** 直接从字幕中提取核心要点
- **X/Twitter 洞察：** 26 位 AI 建造者的精选帖子，附带主题分析
- **博客文章：** AI 公司官方博客的完整文章
- 支持英文、中文或双语版本

### ☁️ 零停机自动化
完全通过 GitHub Actions 运行——**不需要本地服务器**：
- GitHub 的服务器每日自动执行任务
- 自动生成 feed 并发送邮件
- 电脑关机也能正常工作
- 完全可配置的调度计划

### 🛡️ 隐私优先设计
- 所有配置安全存储在 GitHub Secrets
- 公开代码中不暴露任何个人数据
- SMTP 凭据加密存储
- 仅抓取和处理公开内容

## 🚀 快速开始

### 方式一：GitHub Actions（推荐）
1. **Fork 此仓库**到你的 GitHub 账户
2. **设置 GitHub Secrets**：
   - `SMTP_SERVER` — SMTP 服务器（如 `smtp.qq.com`）
   - `SMTP_PORT` — SMTP 端口（如 `587`）
   - `SMTP_USERNAME` — 邮箱地址
   - `SMTP_PASSWORD` — 邮箱密码/应用密码
   - `SMTP_SENDER` — 发件人邮箱
   - `SMTP_RECIPIENTS` — 收件人邮箱
3. **启用 GitHub Actions**
4. 摘要会自动每日推送

### 方式二：本地安装
```bash
git clone https://github.com/你的用户名/follow-builders.git
cd follow-builders/scripts && npm install
```

在 `~/.follow-builders/config.json` 创建配置文件：
```json
{
  "language": "bilingual",
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

## 📋 你会得到什么

每日摘要包含：
- 顶级 AI 播客新节目的精华摘要
- 26 位精选 AI 建造者在 X/Twitter 上的关键观点和洞察
- AI 公司官方博客的完整文章（Anthropic Engineering、Claude Blog）
- 所有原始内容的链接
- 支持英文、中文或双语版本

## ⏰ 调度配置

GitHub Actions 默认每天 **06:17 UTC**（北京时间 14:17）运行。

修改时间请编辑 `.github/workflows/generate-feed.yml`：
```yaml
cron: '17 6 * * *'  # 分钟 小时 日期 月份 星期
```

## 🎨 自定义邮件模板

邮件模板定义在 `scripts/auto-digest.js` 的 `markdownToHtml` 函数中。可自定义：
- 颜色和渐变
- 字体大小和间距
- 布局和样式
- 响应式行为

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

## 🔧 工作原理

1. **中心化 Feed 生成：** GitHub Actions 每日更新所有信息源的最新内容
2. **本地/云端处理：** 摘要脚本获取 feed 并生成摘要
3. **邮件推送：** 格式化的 HTML 摘要通过 SMTP 发送到你的邮箱
4. **零维护：** 配置完成后自动运行

## 🔒 隐私

- 所有 SMTP 凭据安全存储在 GitHub Secrets 或本地 `.env` 文件
- 个人数据不会提交到版本控制
- Skill 只读取公开内容（公开的博客文章、YouTube 视频和 X 帖子）
- 你的配置和偏好保持私密

## 📄 许可证

MIT