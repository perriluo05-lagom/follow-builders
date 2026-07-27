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

### 🤖 High-Quality Summaries
- **Podcast Summaries:** Key points extracted directly from transcripts
- **X/Twitter Insights:** Curated posts from 26 AI builders with topic analysis
- **Blog Articles:** Full articles from official AI company blogs
- Available in English, Chinese, or bilingual

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
- Summaries of new podcast episodes from top AI podcasts
- Key posts and insights from 26 curated AI builders on X/Twitter
- Full articles from official AI company blogs (Anthropic Engineering, Claude Blog)
- Links to all original content
- Available in English, Chinese, or bilingual

## ⏰ Schedule Configuration

The GitHub Actions workflow runs daily at **06:17 UTC** (14:17 Beijing time by default).

To change the schedule, edit `.github/workflows/generate-feed.yml`:
```yaml
cron: '17 6 * * *'  # minute hour day month weekday
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

1. **Central Feed Generation:** A GitHub Actions workflow updates feeds daily with the latest content from all sources
2. **Local/Cloud Processing:** The digest script fetches the feed and generates summaries
3. **Email Delivery:** The formatted HTML digest is sent via SMTP to your inbox
4. **Zero Maintenance:** Once configured, everything runs automatically

## 🔒 Privacy

- All SMTP credentials are stored securely in GitHub Secrets or local `.env` file
- No personal data is committed to version control
- The skill only reads public content (public blog posts, public YouTube videos, public X posts)
- Your configuration and preferences stay private

## 📄 License

MIT