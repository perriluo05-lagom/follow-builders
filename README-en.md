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
- **X/Twitter Insights:** Curated posts from 26 AI builders — full original text preserved with topic tags (product launch / technical depth / business strategy / opinion), engagement data, Quote Tweet annotations, and key-number highlighting
- **Podcast Summaries:** Guest background + timestamped key-point segments extracted from transcripts — zero information loss
- **Blog Articles:** Full articles from official AI company blogs (Anthropic Engineering, Claude Blog) with author, summary, and body excerpts
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
  "delivery": {
    "method": "email",
    "email": "your@email.com"
  }
}
```

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
- 💬 **X/Twitter Insights:** Key posts from 26 curated AI builders — **original tweet text preserved** with topic tags, engagement data, and Quote Tweet context
- 📝 **Blog Articles:** Full articles from official AI company blogs (Anthropic Engineering, Claude Blog) with author, summary, and body excerpts
- 🎙️ **Podcast Summaries:** Top AI podcast episodes with guest background + timestamped key-point segments
- 🔗 **Links to all original content**
- 🚫 **Content Dedup:** `digest-state.json` records sent feed batches to prevent duplicate delivery

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

### Podcasts (6)
- [Latent Space](https://www.youtube.com/@LatentSpacePod)
- [Training Data](https://www.youtube.com/playlist?list=PLOhHNjZItNnMm5tdW61JpnyxeYH5NDDx8)
- [No Priors](https://www.youtube.com/@NoPriorsPodcast)
- [Unsupervised Learning](https://www.youtube.com/@RedpointAI)
- [The MAD Podcast with Matt Turck](https://www.youtube.com/@DataDrivenNYC)
- [AI & I by Every](https://www.youtube.com/playlist?list=PLuMcoKK9mKgHtW_o9h5sGO2vXrffKHwJL)

### AI Builders on X (26)
[Andrej Karpathy](https://x.com/karpathy), [Swyx](https://x.com/swyx), [Josh Woodward](https://x.com/joshwoodward), [Boris Cherny](https://x.com/bcherny), [Thibault Sottiaux](https://x.com/thsottiaux), [Peter Yang](https://x.com/petergyang), [Nan Yu](https://x.com/thenanyu), [Madhu Guru](https://x.com/realmadhuguru), [Amanda Askell](https://x.com/AmandaAskell), [Cat Wu](https://x.com/_catwu), [Thariq](https://x.com/trq212), [Google Labs](https://x.com/GoogleLabs), [Amjad Masad](https://x.com/amasad), [Guillermo Rauch](https://x.com/rauchg), [Alex Albert](https://x.com/alexalbert__), [Aaron Levie](https://x.com/levie), [Ryo Lu](https://x.com/ryolu_), [Garry Tan](https://x.com/garrytan), [Matt Turck](https://x.com/mattturck), [Zara Zhang](https://x.com/zarazhangrui), [Nikunj Kothari](https://x.com/nikunj), [Peter Steinberger](https://x.com/steipete), [Dan Shipper](https://x.com/danshipper), [Aditya Agarwal](https://x.com/adityaag), [Sam Altman](https://x.com/sama), [Claude](https://x.com/claudeai)

### Official Blogs (2)
- [Anthropic Engineering](https://www.anthropic.com/engineering) — technical deep-dives from the Anthropic team
- [Claude Blog](https://claude.com/blog) — product announcements and updates from Claude

## 🔧 How It Works

1. **Central Feed Generation:** [generate-feed.yml](.github/workflows/generate-feed.yml) runs daily at 09:00 Beijing time, fetches the latest content from all sources into `feed-x.json` / `feed-podcasts.json` / `feed-blogs.json`, and tracks fetched items via `state-feed.json` (prevents re-fetching the same tweet/podcast/blog)
2. **Digest Generation:** [send-digest.yml](.github/workflows/send-digest.yml) is triggered automatically after feed generation completes; it runs `auto-digest.js` to generate Chinese summaries using pure programmatic logic (original content preserved + smart annotations — no LLM API needed)
3. **Content Dedup:** `digest-state.json` records sent feed-batch timestamps so the same batch is never sent twice
4. **Email Delivery:** The formatted HTML digest is sent via SMTP to your inbox

**Why no LLM API?**
LLMs tend to compress "Sam Altman shared ChatGPT's specific experiment results in XX scenario" into generic statements like "Sam Altman discussed AI's potential and applications", losing all concrete information. This project preserves the original tweet/podcast/blog content and only adds smart annotations (topic classification, key-number highlighting, Quote Tweet detection, guest background extraction) — zero information loss, and no AI model API key required.

## 🔒 Privacy

- All SMTP credentials are stored securely in GitHub Secrets or local `.env` file
- No personal data is committed to version control
- The skill only reads public content (public blog posts, public YouTube videos, public X posts)
- Your configuration and preferences stay private

## 📄 License

MIT
