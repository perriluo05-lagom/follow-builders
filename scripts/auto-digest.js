#!/usr/bin/env node

// ============================================================================
// Follow Builders — Auto Digest (纯程序化中文摘要，无需 LLM API)
// ----------------------------------------------------------------------------
// 设计哲学：保留原始内容，加智能标注，绝不压缩成空话。
//   • 推文：保留原文 + 话题分类 + 互动数据 + Quote Tweet 检测
//   • 播客：嘉宾背景 + 带时间戳的核心要点段落（从 transcript 提取）
//   • 博客：标题 + 描述 + 正文摘录 + 作者
// 所有内容附原始来源链接，无链接不收录。
// ============================================================================

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { config as loadEnv } from 'dotenv';
import { createTransport } from 'nodemailer';
import { marked } from 'marked';

const USER_DIR = join(homedir(), '.follow-builders');
const CONFIG_PATH = join(USER_DIR, 'config.json');
const ENV_PATH = join(USER_DIR, '.env');
const SCRIPT_DIR = process.cwd();
const SKILL_DIR = join(SCRIPT_DIR, '..');
const DIGEST_STATE_PATH = join(SKILL_DIR, 'digest-state.json');

loadEnv({ path: ENV_PATH });

// -- 网络拉取辅助 ------------------------------------------------------------

async function fetchJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// -- 推送去重状态 ------------------------------------------------------------

async function loadDigestState() {
  if (!existsSync(DIGEST_STATE_PATH)) {
    return { lastSentAt: 0, feedTimestamps: {} };
  }
  try {
    return JSON.parse(await readFile(DIGEST_STATE_PATH, 'utf-8'));
  } catch {
    return { lastSentAt: 0, feedTimestamps: {} };
  }
}

async function saveDigestState(state) {
  try {
    await writeFile(DIGEST_STATE_PATH, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('Warning: failed to save digest state:', e.message);
  }
}

// 比较三类 feed 的 generatedAt 与上次记录，判断是否同一批已推送过
function isFeedAlreadySent(digestState, feedX, feedPodcasts, feedBlogs) {
  const tsX = feedX?.generatedAt;
  const tsPod = feedPodcasts?.generatedAt;
  const tsBlog = feedBlogs?.generatedAt;
  const prev = digestState.feedTimestamps || {};
  const hasNew =
    (tsX && tsX !== prev.x) ||
    (tsPod && tsPod !== prev.podcasts) ||
    (tsBlog && tsBlog !== prev.blogs);
  return !hasNew && (prev.x || prev.podcasts || prev.blogs);
}

// -- Feed 读取 ---------------------------------------------------------------

async function getFeedData() {
  const feedXPath = join(SKILL_DIR, 'feed-x.json');
  const feedPodcastsPath = join(SKILL_DIR, 'feed-podcasts.json');
  const feedBlogsPath = join(SKILL_DIR, 'feed-blogs.json');

  let feedX = null;
  let feedPodcasts = null;
  let feedBlogs = null;

  if (existsSync(feedXPath)) {
    try { feedX = JSON.parse(await readFile(feedXPath, 'utf-8')); } catch {}
  }
  if (existsSync(feedPodcastsPath)) {
    try { feedPodcasts = JSON.parse(await readFile(feedPodcastsPath, 'utf-8')); } catch {}
  }
  if (existsSync(feedBlogsPath)) {
    try { feedBlogs = JSON.parse(await readFile(feedBlogsPath, 'utf-8')); } catch {}
  }

  // 本地缺失则远程兜底
  if (!feedX || !feedPodcasts || !feedBlogs) {
    const FEED_X_URL = 'https://raw.githubusercontent.com/perriluo05-lagom/follow-builders/main/feed-x.json';
    const FEED_PODCASTS_URL = 'https://raw.githubusercontent.com/perriluo05-lagom/follow-builders/main/feed-podcasts.json';
    const FEED_BLOGS_URL = 'https://raw.githubusercontent.com/perriluo05-lagom/follow-builders/main/feed-blogs.json';

    const [remoteX, remotePodcasts, remoteBlogs] = await Promise.all([
      !feedX ? fetchJSON(FEED_X_URL) : Promise.resolve(null),
      !feedPodcasts ? fetchJSON(FEED_PODCASTS_URL) : Promise.resolve(null),
      !feedBlogs ? fetchJSON(FEED_BLOGS_URL) : Promise.resolve(null)
    ]);

    if (!feedX && remoteX) feedX = remoteX;
    if (!feedPodcasts && remotePodcasts) feedPodcasts = remotePodcasts;
    if (!feedBlogs && remoteBlogs) feedBlogs = remoteBlogs;
  }

  // —— 同一批 feed 已推送过则直接跳过 ——
  const digestState = await loadDigestState();
  if (isFeedAlreadySent(digestState, feedX, feedPodcasts, feedBlogs)) {
    console.log('检测到这批 feed 已在之前推送过，为避免重复将终止本次发送。若需强制重发请删除 digest-state.json 或使用 workflow_dispatch');
    return { alreadySent: true, podcasts: [], x: [], blogs: [], _digestState: digestState, _feedX: feedX, _feedPod: feedPodcasts, _feedBlog: feedBlogs };
  }

  return {
    podcasts: feedPodcasts?.podcasts || [],
    x: feedX?.x || [],
    blogs: feedBlogs?.blogs || [],
    _digestState: digestState,
    _feedX: feedX,
    _feedPod: feedPodcasts,
    _feedBlog: feedBlogs
  };
}

// ============================================================================
// 程序化摘要 —— 推文
// ============================================================================

// 从 bio 字段提取作者身份标签，例："ceo @replit. civilizationist" → "Replit CEO"
function extractAuthorRole(bio) {
  if (!bio) return '';
  // 去除 URL
  let b = bio.replace(/https?:\/\/\S+/g, '').trim();
  // 常见模式：role @company / role at company / company - role
  const m1 = b.match(/^(.*?)\s*[@@]\s*([a-zA-Z0-9_]+)/);
  if (m1) {
    const role = m1[1].trim().replace(/[._]$/, '');
    const company = m1[2];
    if (role && company) {
      return `${capitalize(company)} ${capitalize(role)}`;
    }
  }
  // 截断到第一个句号/竖线前
  const m2 = b.split(/[|.]/)[0].trim();
  return m2 ? capitalize(m2) : b;
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// 话题分类：根据关键词判断这条推文在讲什么
function classifyTopic(text) {
  const t = text.toLowerCase();
  const tags = [];

  // 产品/功能发布
  if (/\b(launch|announc|releas|new|ship|launching|introducing|unveil)\b/.test(t)) tags.push('🚀 产品发布');
  // 技术深度
  if (/\b(model|llm|gpu|chip|train|inference|reason|rag|prompt|token|agent|fine-tun|benchmark|context window|scaling law)\b/.test(t)) tags.push('🧠 技术深度');
  // 商业/战略
  if (/\b(revenue|funding|round|valuation|ipo|acquisition|partner|market|strategy|competit)\b/.test(t)) tags.push('💼 商业战略');
  // 行业观察/观点
  if (/\b(think|believe|predict|future|phase|era|will|going to|never|always)\b/.test(t)) tags.push('🎯 行业观点');
  // 数据/数字
  if (/\$\d|\d{2,3}%|\d+[bmx]|billion|million/.test(t)) tags.push('📊 关键数据');

  return tags.length ? tags.join('  ') : '📌 动态';
}

// 判断推文是否有实质内容（过滤水帖）
function isSubstantive(text) {
  if (!text) return false;
  // 纯链接或极短
  if (text.replace(/https?:\/\/\S+/g, '').trim().length < 10) return false;
  // 纯 emoji
  if (/^[\p{Emoji}\s]+$/u.test(text)) return false;
  return true;
}

// 从推文文本中提取关键数字/百分比/产品名（用于突出显示）
function extractHighlights(text) {
  const highlights = [];
  // 百分比
  const pct = text.match(/\d+\.?\d*%/g);
  if (pct) highlights.push(...pct.slice(0, 3));
  // 金额
  const money = text.match(/\$[\d.]+[bmx]?/gi);
  if (money) highlights.push(...money.slice(0, 3));
  // 大数字（含单位）
  const bigNum = text.match(/\d+[\s,]*\d{3}\+?(?:\s*(?:billion|million|thousand|亿|万))?/gi);
  if (bigNum) highlights.push(...bigNum.slice(0, 2));
  return highlights.length ? `**关键数据：** ${highlights.join(' / ')}` : '';
}

// 渲染单条推文（中文引导 + 英文原文，绝不压缩信息）
function renderTweet(tweet, builder) {
  const text = tweet.text || '';
  const tags = classifyTopic(text);
  const isQuote = tweet.isQuote;
  const likes = tweet.likes || 0;
  const retweets = tweet.retweets || 0;

  // 话题标签 + 互动数据（中文）
  let block = `**${tags}**`;
  if (likes >= 1000 || retweets >= 100) block += `  🔥热门(${formatNum(likes)}赞)`;
  if (isQuote) block += `  💬引用回应`;
  block += `\n\n`;

  // 推文原文（完整保留，不翻译、不压缩）
  block += `> ${text}\n\n`;

  // 关键数据高亮（如有，用中文标注）
  const hl = extractHighlights(text);
  if (hl) block += `${hl}\n\n`;

  block += `🔗 原文链接：${tweet.url}\n\n`;
  return block;
}

function formatNum(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

// 渲染一位作者的推文区块（中文标题+引导 + 英文原文）
function renderBuilder(builder) {
  if (!builder.tweets || builder.tweets.length === 0) return '';

  const role = extractAuthorRole(builder.bio);
  const handle = builder.handle;
  const header = role
    ? `### ${builder.name}（${role}，@${handle}）`
    : `### ${builder.name}（@${handle}）`;

  let block = `${header}\n\n`;
  // 中文引导说明
  block += `*以下是 ${builder.name} 近期发布的 ${builder.tweets.length} 条推文原文：*\n\n`;
  for (const tweet of builder.tweets) {
    if (!isSubstantive(tweet.text)) continue;
    block += renderTweet(tweet, builder);
  }
  block += '---\n\n';
  return block;
}

// ============================================================================
// 程序化摘要 —— 播客
// ============================================================================

// 从 transcript 中提取关键段落（带时间戳）
function extractPodcastKeyPoints(transcript, maxPoints = 6) {
  if (!transcript) return [];

  const lines = transcript.split('\n');
  const points = [];
  let buffer = { time: '', text: '' };

  for (const line of lines) {
    // 匹配 "Speaker 1 | 00:19 - 00:30" 这类时间戳前缀
    const m = line.match(/^(Speaker \d+)\s*\|\s*(\d{2}:\d{2}(?::\d{2})?)\s*-\s*(\d{2}:\d{2}(?::\d{2})?)\s*(.*)$/);
    if (m) {
      // 上一段累积完成
      if (buffer.text.trim()) {
        points.push({ time: buffer.time, text: buffer.text.trim() });
      }
      buffer = { time: m[2], text: m[4] || '' };
    } else {
      buffer.text += (buffer.text ? ' ' : '') + line.trim();
    }
  }
  if (buffer.text.trim()) points.push({ time: buffer.time, text: buffer.text.trim() });

  // 过滤掉太短的（"hi" "thank you" 等）和纯寒暄
  const substantive = points.filter(p => p.text.length >= 80);

  // 从中挑选最有信息量的几段：优先含数字、产品名、强观点的
  const scored = substantive.map(p => {
    let score = 0;
    if (/\d+/.test(p.text)) score += 2;
    if (/\b(announce|launch|new|first|never|always|believe|predict|worry|concern|strategy)\b/i.test(p.text)) score += 2;
    if (p.text.length > 150) score += 1;
    if (/\$\d|%|billion|million/.test(p.text)) score += 2;
    return { ...p, score };
  }).sort((a, b) => b.score - a.score);

  return scored.slice(0, maxPoints).sort((a, b) => {
    // 按时间戳恢复原顺序
    if (!a.time || !b.time) return 0;
    return a.time.localeCompare(b.time);
  });
}

// 从 transcript 开头几段提取嘉宾介绍
function extractGuestIntro(transcript) {
  if (!transcript) return '';
  // 嘉宾介绍通常在前 2 分钟，扫描前 1500 字符
  const head = transcript.slice(0, 1500);
  // 匹配 "I'm ... welcome to ... my guest today is X, who ..."
  const m = head.match(/(?:my guest today is|guest today is|I'm joined by|welcome[^.]*?([^,.]+?),\s+who\s+([^.]+))/i);
  if (m) return m[0].trim();
  return '';
}

function renderPodcast(podcast) {
  const title = podcast.title || '';
  const url = podcast.url || '';
  const name = podcast.name || '';
  const transcript = podcast.transcript || '';

  let block = `### 🎙️ ${name}：${title}\n\n`;

  // 嘉宾介绍（如能从 transcript 提取到）
  const intro = extractGuestIntro(transcript);
  if (intro) {
    block += `**嘉宾背景：** ${intro.slice(0, 200)}\n\n`;
  }

  // 核心要点（带时间戳）
  const points = extractPodcastKeyPoints(transcript);
  if (points.length > 0) {
    block += `**📌 核心要点**\n\n`;
    for (const p of points) {
      block += `- **[${p.time || '–'}]** ${p.text}\n`;
    }
    block += `\n`;
  } else if (transcript) {
    // 兜底：直接给前 800 字符的转录摘录
    block += `**📌 转录摘录：**\n\n> ${transcript.slice(0, 800).replace(/\n/g, ' ')}...\n\n`;
  } else {
    // 无 transcript（如小宇宙播客），提示内容来源
    block += `*本期节目暂无转录稿，请点击下方链接收听完整内容。*\n\n`;
  }

  block += `🔗 单集链接：${url}\n\n`;
  block += '---\n\n';
  return block;
}

// ============================================================================
// 程序化摘要 —— 博客
// ============================================================================

function renderBlog(blog) {
  const title = blog.title || '';
  const url = blog.url || '';
  const name = blog.name || '';
  const author = blog.author || '';
  const description = blog.description || '';
  const content = blog.content || '';

  let block = `### 📝 ${name}：${title}\n\n`;
  if (author) block += `**作者：** ${author}\n\n`;
  if (description) block += `**摘要：** ${description}\n\n`;

  // 正文摘录（取最有信息量的段落，跳过导航/页脚噪音）
  if (content) {
    // 按双换行分段，挑前 3 段有实质内容的
    const paragraphs = content.split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length >= 60)  // 跳过太短的
      .slice(0, 3);
    if (paragraphs.length > 0) {
      block += `**正文摘录：**\n\n`;
      for (const p of paragraphs) {
        // 每段截断到 400 字符
        const excerpt = p.length > 400 ? p.slice(0, 400) + '...' : p;
        block += `> ${excerpt}\n\n`;
      }
    }
  }

  block += `🔗 原文链接：${url}\n\n`;
  block += '---\n\n';
  return block;
}

// ============================================================================
// 主摘要生成
// ============================================================================

function generateDigest(feedData, config) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  let digest = `# 🤖 AI Builders 每日简报 — ${dateStr}\n\n`;
  digest += `> 本简报追踪 AI 领域顶尖建造者（研究员、创始人、产品经理、工程师）的最新动态，保留原文不压缩，附中文标注。\n\n`;

  // —— X / TWITTER 板块 ——
  if (feedData.x && feedData.x.length > 0) {
    const buildersWithTweets = feedData.x.filter(b => b.tweets && b.tweets.length > 0);
    if (buildersWithTweets.length > 0) {
      digest += `## 💬 X / TWITTER 推文动态\n\n`;
      digest += `*追踪 ${buildersWithTweets.length} 位 AI 建造者的最新推文（原文保留，附话题分类与关键数据高亮）*\n\n`;
      for (const builder of buildersWithTweets) {
        digest += renderBuilder(builder);
      }
    }
  }

  // —— OFFICIAL BLOGS 板块 ——
  if (feedData.blogs && feedData.blogs.length > 0) {
    digest += `## 📝 OFFICIAL BLOGS 官方博客\n\n`;
    digest += `*AI 公司官方博客深度文章（含作者、摘要、正文摘录）*\n\n`;
    for (const blog of feedData.blogs) {
      digest += renderBlog(blog);
    }
  }

  // —— PODCASTS 板块 ——
  if (feedData.podcasts && feedData.podcasts.length > 0) {
    digest += `## 🎙️ PODCASTS 播客\n\n`;
    digest += `*顶级 AI 播客最新一期（嘉宾背景 + 带时间戳的核心要点）*\n\n`;
    for (const podcast of feedData.podcasts) {
      digest += renderPodcast(podcast);
    }
  }

  // —— 今日数据统计 ——
  const builderCount = feedData.x?.length || 0;
  const totalTweets = (feedData.x || []).reduce((sum, b) => sum + (b.tweets?.length || 0), 0);
  const podcastCount = feedData.podcasts?.length || 0;
  const blogCount = feedData.blogs?.length || 0;

  digest += `## 📊 今日数据\n\n`;
  digest += `- **X 动态：** ${builderCount} 位 Builder，共 ${totalTweets} 条推文\n`;
  digest += `- **博客文章：** ${blogCount} 篇\n`;
  digest += `- **播客内容：** ${podcastCount} 集\n\n`;

  digest += `---\n\n`;
  digest += `Generated through the Follow Builders skill: https://github.com/zarazhangrui/follow-builders\n\n`;

  return digest;
}

// ============================================================================
// HTML 渲染（邮件用）
// ============================================================================

function markdownToHtml(markdownText) {
  const htmlContent = marked.parse(markdownText);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Builders Digest</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif; background: #f5f5f5; -webkit-font-smoothing: antialiased; }
    .container { max-width: 600px; margin: 0 auto; padding: 16px; }
    .header { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); border-radius: 12px 12px 0 0; padding: 24px 20px; color: white; }
    .header h1 { font-size: 18px; font-weight: 600; margin-bottom: 6px; }
    .header p { font-size: 12px; opacity: 0.85; }
    .content { background: white; border-radius: 0 0 12px 12px; padding: 20px; box-shadow: 0 2px 12px rgba(0,0,0,0.04); }
    .content h1 { font-size: 17px; font-weight: 700; color: #1f2937; margin: 16px 0 12px; }
    .content h2 { font-size: 15px; font-weight: 600; color: #1f2937; margin: 20px 0 12px; display: flex; align-items: center; gap: 8px; }
    .content h2:first-child { margin-top: 0; }
    .content h2::before { content: ''; width: 3px; height: 14px; background: #4f46e5; border-radius: 2px; }
    .content h3 { font-size: 13px; font-weight: 600; color: #374151; margin: 16px 0 8px; }
    .content p { font-size: 13px; color: #5b6678; line-height: 1.7; margin: 8px 0; }
    .content ul, .content ol { margin: 10px 0; padding-left: 20px; }
    .content li { font-size: 13px; color: #5b6678; line-height: 1.7; margin: 6px 0; }
    .content strong { color: #1f2937; font-weight: 600; }
    .content a { color: #4f46e5; text-decoration: none; font-weight: 500; word-break: break-all; }
    .content a:hover { text-decoration: underline; }
    .content blockquote { border-left: 3px solid #4f46e5; padding: 10px 12px; margin: 12px 0; background: #f9fafb; border-radius: 0 6px 6px 0; }
    .content blockquote p { margin: 0; color: #6b7280; font-size: 12px; }
    .content hr { border: none; border-top: 1px solid #e5e7eb; margin: 16px 0; }
    .divider { height: 8px; background: #f5f5f5; margin: 16px 0; border-radius: 4px; }
    .footer { text-align: center; padding: 16px 20px; color: #9ca3af; font-size: 11px; }
    .footer a { color: #4f46e5; text-decoration: none; }
    @media (max-width: 600px) {
      .container { padding: 8px; }
      .header { padding: 18px 14px; }
      .header h1 { font-size: 16px; }
      .content { padding: 14px; }
      .content h2 { font-size: 14px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🤖 AI Builders Digest</h1>
      <p>${new Date().toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </div>
    <div class="content">
      ${htmlContent}
    </div>
    <div class="footer">
      <p>AI Builders Digest — Track the top builders in AI</p>
      <p style="margin-top: 6px;">回复邮件调整设置</p>
    </div>
  </div>
</body>
</html>`;
}

// ============================================================================
// 邮件发送
// ============================================================================

async function sendEmail(text, toEmail) {
  if (existsSync(ENV_PATH)) {
    loadEnv({ path: ENV_PATH });
  }

  const smtpServer = process.env.SMTP_SERVER || 'smtp.qq.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587');
  const smtpUsername = process.env.SMTP_USERNAME;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const smtpSender = process.env.SMTP_SENDER || smtpUsername;

  if (!smtpUsername || !smtpPassword) {
    throw new Error('SMTP credentials missing');
  }

  const transporter = createTransport({
    host: smtpServer,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUsername,
      pass: smtpPassword
    }
  });

  const html = markdownToHtml(text);

  await transporter.sendMail({
    from: `AI Builders Digest <${smtpSender}>`,
    to: toEmail,
    subject: `AI Builders Digest — ${new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    })}`,
    text: text,
    html: html
  });
}

// ============================================================================
// 主入口
// ============================================================================

async function main() {
  try {
    let config = {
      language: 'zh',
      frequency: 'daily',
      deliveryTime: '09:00',
      timezone: 'Asia/Shanghai',
      delivery: { method: 'stdout', email: '' }
    };

    if (existsSync(CONFIG_PATH)) {
      config = JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));
    }

    // 环境变量覆盖本地配置（用于 GitHub Actions 云端部署）
    const configOverrides = {
      language: process.env.DIGEST_LANGUAGE || config.language,
      timezone: process.env.DIGEST_TIMEZONE || config.timezone,
      deliveryTime: process.env.DIGEST_DELIVERY_TIME || config.deliveryTime,
      delivery: {
        method: process.env.DIGEST_DELIVERY_METHOD || config.delivery?.method || 'stdout',
        email: process.env.DIGEST_EMAIL || config.delivery?.email || ''
      }
    };
    config = { ...config, ...configOverrides };

    const smtpRecipients = process.env.SMTP_RECIPIENTS;
    const toEmail = smtpRecipients || config.delivery.email;

    console.log('Fetching feed data...');
    const feedData = await getFeedData();

    // 同一批 feed 已推送过则跳过
    if (feedData.alreadySent) {
      console.log('此批 feed 已推送过，本次跳过不重复发送。');
      return;
    }

    // 内容全为空也跳过
    const totalItems =
      (feedData.x?.reduce((s, b) => s + (b.tweets?.length || 0), 0) || 0) +
      (feedData.podcasts?.length || 0) +
      (feedData.blogs?.length || 0);
    if (totalItems === 0) {
      console.log('今日没有新内容（0 条推文 / 0 集播客 / 0 篇博客），跳过发送。');
      return;
    }

    console.log(`Generating digest (${totalItems} 条新内容)...`);
    const digest = generateDigest(feedData, config);

    if (toEmail) {
      console.log(`Sending to ${toEmail}...`);
      await sendEmail(digest, toEmail);
      console.log('Email sent successfully!');
      // —— 发送成功后记录 feed 时间戳，防止重复推送 ——
      const ds = feedData._digestState || { lastSentAt: 0, feedTimestamps: {} };
      ds.lastSentAt = Date.now();
      ds.feedTimestamps = {
        x: feedData._feedX?.generatedAt || ds.feedTimestamps?.x,
        podcasts: feedData._feedPod?.generatedAt || ds.feedTimestamps?.podcasts,
        blogs: feedData._feedBlog?.generatedAt || ds.feedTimestamps?.blogs,
      };
      await saveDigestState(ds);
      console.log('已保存 digest-state.json，下次将跳过这批已推送内容。');
    } else {
      console.log(digest);
    }

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
