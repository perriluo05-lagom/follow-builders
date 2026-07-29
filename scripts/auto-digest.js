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
const PROMPTS_DIR = join(SKILL_DIR, 'prompts');

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



async function readPromptFile(filename) {
  try {
    const filePath = join(PROMPTS_DIR, filename);
    if (existsSync(filePath)) {
      return await readFile(filePath, 'utf-8');
    }
  } catch {}
  return '';
}

async function callLLM(systemPrompt, userPrompt, config) {
  const apiKey = process.env.LLM_API_KEY;
  let apiBase = process.env.LLM_API_BASE || 'https://api.openai.com';
  let model = process.env.LLM_MODEL || 'gpt-4o-mini';
  
  if (!apiKey) {
    console.log('Warning: LLM_API_KEY not set, returning raw data');
    return null;
  }

  // 自动检测 Groq 并设置默认值
  const isGroq = apiBase.includes('groq.com') || (!process.env.LLM_API_BASE && process.env.GROQ_API_KEY);
  if (isGroq) {
    if (!process.env.LLM_API_BASE) apiBase = 'https://api.groq.com/openai';
    if (!process.env.LLM_MODEL) model = 'llama-3.3-70b-versatile';
  }

  // 规范化 base URL：去除末尾斜杠，避免 /v1 重复
  apiBase = apiBase.replace(/\/+$/, '');
  // 如果 base 已经包含 /v1，不再重复拼接
  const endpoint = apiBase.endsWith('/v1')
    ? `${apiBase}/chat/completions`
    : `${apiBase}/v1/chat/completions`;

  console.log(`LLM config: base=${apiBase}, model=${model}, key=${apiKey.slice(0, 8)}...`);
  console.log(`LLM endpoint: ${endpoint}`);
  console.log(`System prompt length: ${systemPrompt.length} chars`);
  console.log(`User prompt length: ${userPrompt.length} chars`);
  
  try {
    // 30秒超时保护
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 4096
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      const errText = await response.text();
      console.error(`LLM API error ${response.status}: ${errText.slice(0, 500)}`);
      return null;
    }
    
    const data = await response.json();
    console.log('LLM call succeeded, got response');
    return data.choices[0].message.content;
  } catch (err) {
    console.error('LLM call exception:', err.message);
    if (err.name === 'AbortError') {
      console.error('Request timed out after 30s');
    }
    return null;
  }
}

async function generateDigest(feedData, config) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  // 如果配置为中文，调用 LLM 生成中文摘要
  if (config.language === 'zh') {
    const summarizeTweetsPrompt = await readPromptFile('summarize-tweets.md');
    const summarizePodcastPrompt = await readPromptFile('summarize-podcast.md');
    const summarizeBlogsPrompt = await readPromptFile('summarize-blogs.md');
    const digestIntroPrompt = await readPromptFile('digest-intro.md');
    const translatePrompt = await readPromptFile('translate.md');
    
    // 构建原始 feed 数据文本
    let feedText = '';
    
    if (feedData.x && feedData.x.length > 0) {
      feedText += `# X/Twitter 原始数据\n\n`;
      for (const builder of feedData.x) {
        if (!builder.tweets || builder.tweets.length === 0) continue;
        feedText += `## ${builder.name}\n`;
        feedText += `身份: ${builder.bio || '未知'}\n\n`;
        for (const tweet of builder.tweets) {
          feedText += `推文内容: ${tweet.text}\n`;
          feedText += `链接: ${tweet.url}\n\n`;
        }
      }
    }
    
    if (feedData.blogs && feedData.blogs.length > 0) {
      feedText += `# 博客原始数据\n\n`;
      for (const blog of feedData.blogs) {
        feedText += `## ${blog.title}\n`;
        feedText += `来源: ${blog.source || ''}\n`;
        feedText += `链接: ${blog.url}\n`;
        if (blog.content) feedText += `内容: ${blog.content.slice(0, 1500)}\n\n`;
      }
    }
    
    if (feedData.podcasts && feedData.podcasts.length > 0) {
      feedText += `# 播客原始数据\n\n`;
      for (const podcast of feedData.podcasts) {
        feedText += `## ${podcast.title}\n`;
        feedText += `链接: ${podcast.url}\n`;
        if (podcast.transcript) {
          feedText += `转录稿: ${podcast.transcript.slice(0, 3000)}\n\n`;
        }
      }
    }
    
    // 构建结构化系统提示：整合所有 prompt 规则，明确要求直接中文输出
    const systemPrompt = `你是一位专业的 AI 行业资讯摘要作者。请根据提供的原始 Feed 数据，直接用中文撰写一份高质量的 AI Builders Digest。

## 语言要求（必须严格遵守）

${translatePrompt}

重要：不要先写英文再翻译。直接用中文思考和撰写，让内容读起来像原本就是用中文写的。

## X/Twitter 摘要规则

${summarizeTweetsPrompt}

## 播客摘要规则

${summarizePodcastPrompt}

## 博客摘要规则

${summarizeBlogsPrompt}

## 最终组装格式

${digestIntroPrompt}

## 关键提醒

- 每条内容后面必须附上原始链接
- 不要编造任何内容，只使用 Feed 数据中的真实信息
- 保持格式简洁清晰，方便在手机上阅读`;
    
    const userPrompt = `今天是 ${dateStr}。

以下是今天的原始 Feed 数据，请按照上述规则直接用中文生成 AI Builders Digest：

${feedText}`;
    
    console.log('Calling LLM to generate Chinese digest...');
    const llmResult = await callLLM(systemPrompt, userPrompt, config);
    
    if (llmResult) {
      return llmResult;
    }
    console.log('LLM call failed, falling back to raw data');
  }
  
  // 回退：直接输出原始数据
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
    const digest = await generateDigest(feedData, config);
    
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