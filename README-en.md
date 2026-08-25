[中文](README.md) | **English**

# Follow Builders, Not Influencers

An AI-powered digest that tracks the top builders in AI — researchers, founders, PMs,
and engineers who are actually building things — and delivers curated summaries of
what they're saying.

**Philosophy:** Follow people who build products and have original opinions, not
influencers who regurgitate information.

## ✨ Key Features

### 📧 Beautiful HTML Email Delivery
Receive well-formatted digests with:
- Clean, modern design with smooth gradients
- Responsive layout for mobile and desktop
- Clear visual hierarchy with proper spacing
- Professional typography optimized for reading

### 🤖 High-Quality Summaries (Pure Programmatic, No LLM API Required)
- **AI Industry News:** Curated deep-dive content from Substack Newsletters — Ben's Bites, The Batch, Import AI, AI News
- **Podcast Summaries:** Guest background + timestamped key-point segments extracted from transcripts — zero information loss
- **Blog Articles:** Full articles from 12 curated AI tech blogs with author, summary, and body excerpts
- **Chinese-first:** Defaults to Chinese output — no AI model API key required

### ☁️ Zero-Downtime Automation
Run the digest entirely through GitHub Actions — **no local server required**:
- GitHub's servers execute the task daily
- Automatic feed generation and email delivery
- Works even when your computer is off
- Fully configurable schedule

### 🛡️ Privacy-First Design
- All configuration stored securely in GitHub Secrets
- No personal data exposed in public code
- SMTP credentials encrypted at rest
- Only public content is fetched and processed

## 🚀 Quick Start

### Option 1: GitHub Actions (Recommended)
1. **Fork this repository** to your GitHub account
2. **Set up GitHub Secrets** in your repository settings:
   - `SMTP_SERVER` — Your SMTP server (e.g., `smtp.qq.com`)
   - `SMTP_PORT` — SMTP port (e.g., `587`)
   - `SMTP_USERNAME` — Your email address
   - `SMTP_PASSWORD` — Your email password/app password
   - `SMTP_SENDER` — Sender email address
   - `SMTP_RECIPIENTS` — Recipient email address
3. **Enable GitHub Actions** in your fork
4. The digest will be delivered automatically every day

### Option 2: Local Installation
```bash
git clone https://github.com/your-username/follow-builders.git
cd follow-builders/scripts && npm install
```

Create a config file at `~/.follow-builders/config.json`:
```json
{
  "language": "bilingual",
  "frequency": "daily",
  "deliveryTime": "09:00",
  "timezone": "Asia/Shanghai",
  "sendWhenEmpty": true,
  "delivery": {
    "method": "email",
    "email": "your@email.com"
  }
}
```

> `sendWhenEmpty`: Whether to send a "no new content today" notification email when there are no updates. Defaults to `true`. Set to `false` to skip delivery on empty days.

Create `~/.follow-builders/.env` with your SMTP credentials:
```env
SMTP_SERVER=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=your@email.com
SMTP_PASSWORD=your-password
SMTP_SENDER=your@email.com
SMTP_RECIPIENTS=your@email.com
```

Run manually:
```bash
node scripts/auto-digest.js
```

## 📋 What You Get

A daily digest with:
- 💬 **X/Twitter Insights:** Key posts from 47 curated AI builders — **original tweet text preserved** with topic tags, engagement data, and Quote Tweet context
- 📝 **Blog Articles:** Full articles from 12 curated AI tech blogs with author, summary, and body excerpts
- 🎙️ **Podcast Summaries:** Top AI podcast episodes with guest background + timestamped key-point segments
- 🔗 **Links to all original content**
- 🚫 **Content Dedup:** `digest-state.json` records sent content IDs (tweet IDs, podcast GUIDs, blog URLs) to ensure each item is delivered only once
- 📭 **Empty Digest Notification:** Sends a "no new content today" email by default when there are no updates (disable with `sendWhenEmpty: false`)

## ⏰ Schedule Configuration

The GitHub Actions workflow runs daily at **09:00 Beijing time** (01:00 UTC).

To change the schedule, edit `.github/workflows/generate-feed.yml`:
```yaml
cron: '0 1 * * *'  # minute hour day month weekday (01:00 UTC = 09:00 Beijing time)
```

## 🎨 Customizing the Email Template

The email template is defined in `scripts/auto-digest.js` in the `markdownToHtml` function. You can customize:
- Colors and gradients
- Font sizes and spacing
- Layout and styling
- Responsive behavior

## 📝 Default Sources

### 📰 AI Industry News (4 Substack Newsletters)
- [Ben's Bites](https://bensbites.beehiiv.com/) — Ben Tossell's daily AI news + tools
- [The Batch](https://www.deeplearning.ai/the-batch/) — Andrew Ng's weekly AI deep analysis
- [Import AI](https://jack-clark.net/) — Jack Clark's weekly AI research + policy
- [AI News](https://www.ainews.co/) — Rob Toews' AI industry deep reporting

### 🎙️ Podcasts (11 - Xiaoyuzhou)
- [三点下班](https://www.xiaoyuzhoufm.com/podcast/62bd91adf288fd4eae3606ff)
- [Web3 101](https://www.xiaoyuzhoufm.com/podcast/62c2b6b3a61b9fd92a401b39)
- [硬地骇客](https://www.xiaoyuzhoufm.com/podcast/640ee2438be5d40013fe4a87)
- [难得正经](https://www.xiaoyuzhoufm.com/podcast/68c2889c9eff50753c639da0)
- [半拿铁](https://www.xiaoyuzhoufm.com/podcast/62382c1103bea1ebfffa1c00)
- [OnBoard!](https://www.xiaoyuzhoufm.com/podcast/65a4a7e04e4b3d837f4e3a5c)
- [硅谷早知道](https://www.xiaoyuzhoufm.com/podcast/62382c1103bea1ebfffa1c01)
- [张小珺Jùn｜商业访谈录](https://www.xiaoyuzhoufm.com/podcast/626b46ea9cbbf0451cf5a962)
- [商业就是这样](https://www.xiaoyuzhoufm.com/podcast/6022a180ef5fdaddc30bb101)
- [声东击西](https://www.xiaoyuzhoufm.com/podcast/5e2831ed418a84a046231c00)
- [忽左忽右](https://www.xiaoyuzhoufm.com/podcast/5e4ee557418a84a0466737b7)

### 📝 Official Blogs (12)
- [Anthropic Engineering](https://www.anthropic.com/engineering) — technical deep-dives from the Anthropic team
- [Claude Blog](https://claude.com/blog) — product announcements and updates from Claude
- [OpenAI Blog](https://openai.com/blog) — official OpenAI blog
- [Google DeepMind Blog](https://deepmind.google/blog/) — Google DeepMind research blog
- [Meta AI Blog](https://ai.meta.com/blog/) — Meta AI research blog
- [Hugging Face Blog](https://huggingface.co/blog) — Hugging Face technical blog
- [Microsoft Research Blog](https://www.microsoft.com/en-us/research/blog/) — Microsoft Research blog
- [NVIDIA AI Blog](https://blogs.nvidia.com/blog/category/deep-learning/) — NVIDIA AI blog
- [Lilian Weng's Blog](https://lilianweng.github.io/) — OpenAI researcher's personal blog
- [Jay Alammar's Blog](https://jalammar.github.io/) — AI visualization expert's personal blog
- [Sebastian Raschka's Blog](https://magazine.sebastianraschka.com/) — Lightning AI founder's technical blog
- [Chip Huyen's Blog](https://huyenchip.com/) — MLOps expert's personal blog

💬 You can also add other information sources, such as followed bloggers, Xiaoyuzhou podcasts, etc.

### 🔑 Data Source Configuration

**News Fetching**
- No API key required, fetched via RSS
- Supports Hacker News, ArXiv, TechCrunch, Reddit and other major tech communities

**Podcast Fetching**
- Xiaoyuzhou podcasts: no API key required, fetched via RSS
- English podcasts: require `POD2TXT_API_KEY` (pod2txt service), currently removed — only Xiaoyuzhou podcasts are retained

**Blog Fetching**
- No API key required, fetched via HTTP or RSS
- Supports both HTTP scraping and RSS modes

## 🔧 How It Works

1. **Central Feed Generation:** [generate-feed.yml](.github/workflows/generate-feed.yml) runs daily at 09:00 Beijing time, fetches the latest content from all sources into `feed-podcasts.json` / `feed-blogs.json` / `feed-news.json`, and tracks fetched items via `state-feed.json` (prevents re-fetching the same podcast/blog/news)
2. **Digest Generation:** [send-digest.yml](.github/workflows/send-digest.yml) is triggered automatically after feed generation completes; it runs `auto-digest.js` to generate Chinese summaries using pure programmatic logic (original content preserved + smart annotations — no LLM API needed)
3. **Content Dedup:** `digest-state.json` records sent content IDs (news URLs, podcast GUIDs, blog URLs) to ensure each item is delivered only once
4. **Email Delivery:** The formatted HTML digest is sent via SMTP to your inbox


## 🔒 Privacy

- All SMTP credentials are stored securely in GitHub Secrets or local `.env` file
- No personal data is committed to version control
- The skill only reads public content (public blog posts, public YouTube videos, public X posts)
- Your configuration and preferences stay private

## 📄 License

MIT
