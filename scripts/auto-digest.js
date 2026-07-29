#!/usr/bin/env node

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

loadEnv({ path: ENV_PATH });

async function fetchJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function fetchText(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

async function getFeedData() {
  const FEED_X_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x.json';
  const FEED_PODCASTS_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-podcasts.json';
  const FEED_BLOGS_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-blogs.json';

  const feedXPath = join(SKILL_DIR, 'feed-x.json');
  const feedPodcastsPath = join(SKILL_DIR, 'feed-podcasts.json');
  const feedBlogsPath = join(SKILL_DIR, 'feed-blogs.json');

  const [feedXRemote, feedPodcastsRemote, feedBlogsRemote] = await Promise.all([
    fetchJSON(FEED_X_URL),
    fetchJSON(FEED_PODCASTS_URL),
    fetchJSON(FEED_BLOGS_URL)
  ]);

  let feedX = feedXRemote;
  let feedPodcasts = feedPodcastsRemote;
  let feedBlogs = feedBlogsRemote;

  if (!feedX && existsSync(feedXPath)) {
    feedX = JSON.parse(await readFile(feedXPath, 'utf-8'));
  }
  if (!feedPodcasts && existsSync(feedPodcastsPath)) {
    feedPodcasts = JSON.parse(await readFile(feedPodcastsPath, 'utf-8'));
  }
  if (!feedBlogs && existsSync(feedBlogsPath)) {
    feedBlogs = JSON.parse(await readFile(feedBlogsPath, 'utf-8'));
  }

  return {
    podcasts: feedPodcasts?.podcasts || [],
    x: feedX?.x || [],
    blogs: feedBlogs?.blogs || []
  };
}



function generateDigest(feedData, config) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  let digest = `# AI Builders Digest — ${dateStr}\n\n`;
  
  if (feedData.x && feedData.x.length > 0) {
    digest += '## 💬 X/Twitter 动态\n\n';
    
    for (const builder of feedData.x) {
      if (!builder.tweets || builder.tweets.length === 0) continue;
      
      digest += `### ${builder.name}（${builder.bio || ''}）\n\n`;
      
      for (const tweet of builder.tweets) {
        digest += `${tweet.text}\n\n${tweet.url}\n\n`;
      }
      
      digest += '---\n\n';
    }
  }
  
  if (feedData.podcasts && feedData.podcasts.length > 0) {
    digest += '## 🎙️ 播客\n\n';
    
    for (const podcast of feedData.podcasts) {
      digest += `### ${podcast.title}\n\n`;
      digest += `**来源链接：** ${podcast.url}\n\n`;
      digest += `**发布时间：** ${new Date(podcast.publishedAt).toLocaleString('zh-CN')}\n\n`;
      digest += '---\n\n';
    }
  }
  
  const podcastCount = feedData.podcasts?.length || 0;
  const builderCount = feedData.x?.length || 0;
  const totalTweets = (feedData.x || []).reduce((sum, b) => sum + (b.tweets?.length || 0), 0);
  
  digest += `## 📊 今日摘要\n\n`;
  digest += `- **播客内容：** ${podcastCount} 集\n`;
  digest += `- **X 动态：** ${builderCount} 位 Builder，共 ${totalTweets} 条推文\n`;
  digest += `- **语言：** ${config.language === 'zh' ? '中文' : config.language === 'bilingual' ? '双语' : 'English'}\n\n`;
  
  digest += `Generated through the Follow Builders skill: https://github.com/zarazhangrui/follow-builders`;
  
  return digest;
}

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
    .content h2 { font-size: 15px; font-weight: 600; color: #1f2937; margin: 20px 0 12px; display: flex; align-items: center; gap: 8px; }
    .content h2:first-child { margin-top: 0; }
    .content h2::before { content: ''; width: 3px; height: 14px; background: #4f46e5; border-radius: 2px; }
    .content h3 { font-size: 13px; font-weight: 600; color: #374151; margin: 16px 0 8px; }
    .content p { font-size: 13px; color: #5b6678; line-height: 1.7; margin: 8px 0; }
    .content ul, .content ol { margin: 10px 0; padding-left: 20px; }
    .content li { font-size: 13px; color: #5b6678; line-height: 1.7; margin: 6px 0; }
    .content strong { color: #1f2937; font-weight: 600; }
    .content a { color: #4f46e5; text-decoration: none; font-weight: 500; }
    .content a:hover { text-decoration: underline; }
    .content blockquote { border-left: 3px solid #4f46e5; padding: 10px 12px; margin: 12px 0; background: #f9fafb; border-radius: 0 6px 6px 0; }
    .content blockquote p { margin: 0; color: #6b7280; font-size: 12px; }
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

async function sendEmail(text, toEmail) {
  // 加载 .env 文件（本地开发用）
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

async function main() {
  try {
    let config = {
      language: 'en',
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
    
    console.log('Generating digest...');
    const digest = generateDigest(feedData, config);
    
    if (toEmail) {
      console.log(`Sending to ${toEmail}...`);
      await sendEmail(digest, toEmail);
      console.log('Email sent successfully!');
    } else {
      console.log(digest);
    }
    
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();