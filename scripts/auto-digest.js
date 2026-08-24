#!/usr/bin/env node

// ============================================================================
// Follow Builders — Auto Digest (纯程序化中文摘要，无需 LLM API)
// ----------------------------------------------------------------------------
// 设计哲学：保留原始内容，加智能标注，绝不压缩成空话。
//   • 推文：保留原文 + 话题分类 + 互动数据 + Quote Tweet 检测
//   • 播客：嘉宾背景 + 带时间戳的核心要点段落（从 transcript 提取）
//   • 博客：标题 + 描述 + 正文摘录 + 作者
// 所有内容附原始来源链接，无链接不收录。
//
// 运行可靠性（2026-08 新增）：
//   • 每次运行都会对比本地 feed 与 GitHub raw 上的 generatedAt，
//     自动采用更新的那份，避免"仓库里有旧文件就永远跳过抓取"的假阴性。
//   • 若 feed 文件整体过旧（> STALE_FEED_HOURS），空邮件会改为**告警级别**，
//     明确提示去查看 Generate Feeds Actions 日志，而不是假装"没有新推送"。
//   • 空邮件附带结构化诊断块：抓取总数 / 去重后新数 / feed 来源 / 状态窗口。
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

const FEED_X_URL = 'https://raw.githubusercontent.com/perriluo05-lagom/follow-builders/main/feed-x.json';
const FEED_PODCASTS_URL = 'https://raw.githubusercontent.com/perriluo05-lagom/follow-builders/main/feed-podcasts.json';
const FEED_BLOGS_URL = 'https://raw.githubusercontent.com/perriluo05-lagom/follow-builders/main/feed-blogs.json';
const FEED_NEWS_URL = 'https://raw.githubusercontent.com/perriluo05-lagom/follow-builders/main/feed-news.json';

// feed 文件超过这个时间视为过旧——说明 Generate Feeds 很可能连续失败了
const STALE_FEED_HOURS = 30;

loadEnv({ path: ENV_PATH });

// -- 网络拉取辅助 ------------------------------------------------------------

async function fetchJSON(url, label = '') {
  try {
    const start = Date.now();
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[fetchJSON] ${label || url} HTTP ${res.status} (${Date.now() - start}ms)`);
      return null;
    }
    const data = await res.json();
    console.error(`[fetchJSON] ${label || url} OK, generatedAt=${data?.generatedAt || 'N/A'} (${Date.now() - start}ms)`);
    return data;
  } catch (e) {
    console.error(`[fetchJSON] ${label || url} 异常: ${e.message}`);
    return null;
  }
}

// 比较两份 feed 哪份更新：返回更"新鲜"（generatedAt 更大）的那份
function pickFresherFeed(local, remote, name) {
  const localAt = local?.generatedAt ? new Date(local.generatedAt).getTime() : 0;
  const remoteAt = remote?.generatedAt ? new Date(remote.generatedAt).getTime() : 0;
  if (!remote && local) return { feed: local, source: 'local' };
  if (!local && remote) return { feed: remote, source: 'remote' };
  if (!local && !remote) return { feed: null, source: 'missing' };
  if (remoteAt > localAt) {
    console.error(`[freshness] ${name}: 远程更新 (${remote?.generatedAt} > ${local?.generatedAt})，采用远程`);
    return { feed: remote, source: 'remote' };
  }
  console.error(`[freshness] ${name}: 本地 >= 远程 (${local?.generatedAt} vs ${remote?.generatedAt})，采用本地`);
  return { feed: local, source: 'local' };
}

// -- 推送去重状态 ------------------------------------------------------------

async function loadDigestState() {
  if (!existsSync(DIGEST_STATE_PATH)) {
    return { lastSentAt: 0, feedTimestamps: {}, sentItemIds: [] };
  }
  try {
    const state = JSON.parse(await readFile(DIGEST_STATE_PATH, 'utf-8'));
    // 兼容旧版 state，确保 sentItemIds 存在
    if (!state.sentItemIds) state.sentItemIds = [];
    return state;
  } catch {
    return { lastSentAt: 0, feedTimestamps: {}, sentItemIds: [] };
  }
}

async function saveDigestState(state) {
  try {
    // 清理超过 14 天的旧 ID，防止文件无限增长
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    state.sentItemIds = (state.sentItemIds || []).filter(entry => entry.ts > cutoff);
    await writeFile(DIGEST_STATE_PATH, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('Warning: failed to save digest state:', e.message);
  }
}

// 从 feed 数据中提取所有内容 ID（推文 ID、播客 GUID、博客 URL、新闻 URL）
function extractContentIds(feedX, feedPodcasts, feedBlogs, feedNews) {
  const ids = [];
  // 推文 ID
  if (feedX?.x) {
    for (const builder of feedX.x) {
      if (builder.tweets) {
        for (const tweet of builder.tweets) {
          if (tweet.id) ids.push(`tweet:${tweet.id}`);
        }
      }
    }
  }
  // 播客 GUID
  if (feedPodcasts?.podcasts) {
    for (const pod of feedPodcasts.podcasts) {
      if (pod.guid) ids.push(`podcast:${pod.guid}`);
    }
  }
  // 博客 URL
  if (feedBlogs?.blogs) {
    for (const blog of feedBlogs.blogs) {
      if (blog.url) ids.push(`blog:${blog.url}`);
    }
  }
  // 新闻 URL
  if (feedNews?.news) {
    for (const item of feedNews.news) {
      if (item.url) ids.push(`news:${item.url}`);
    }
  }
  return ids;
}

// 基于内容 ID 过滤掉已推送过的项目，返回仅包含新内容的 feed 数据
function filterNewContent(feedX, feedPodcasts, feedBlogs, feedNews, sentItemIds) {
  const sentSet = new Set(sentItemIds.map(e => e.id));

  // 过滤推文：移除已发送的推文
  let filteredX = feedX;
  if (feedX?.x) {
    const newX = feedX.x.map(builder => {
      if (!builder.tweets) return builder;
      const newTweets = builder.tweets.filter(t => !sentSet.has(`tweet:${t.id}`));
      return { ...builder, tweets: newTweets };
    }).filter(builder => builder.tweets && builder.tweets.length > 0);
    filteredX = { ...feedX, x: newX };
  }

  // 过滤播客：移除已发送的剧集
  let filteredPodcasts = feedPodcasts;
  if (feedPodcasts?.podcasts) {
    const newPods = feedPodcasts.podcasts.filter(p => !sentSet.has(`podcast:${p.guid}`));
    filteredPodcasts = { ...feedPodcasts, podcasts: newPods };
  }

  // 过滤博客：移除已发送的文章
  let filteredBlogs = feedBlogs;
  if (feedBlogs?.blogs) {
    const newBlogs = feedBlogs.blogs.filter(b => !sentSet.has(`blog:${b.url}`));
    filteredBlogs = { ...feedBlogs, blogs: newBlogs };
  }

  // 过滤新闻：移除已发送的新闻
  let filteredNews = feedNews;
  if (feedNews?.news) {
    const newNews = feedNews.news.filter(n => !sentSet.has(`news:${n.url}`));
    filteredNews = { ...feedNews, news: newNews };
  }

  return { filteredX, filteredPodcasts, filteredBlogs, filteredNews };
}

// 检查过滤后是否还有任何新内容
function hasAnyNewContent(filteredX, filteredPodcasts, filteredBlogs, filteredNews) {
  const tweetCount = (filteredX?.x || []).reduce((s, b) => s + (b.tweets?.length || 0), 0);
  const podcastCount = (filteredPodcasts?.podcasts || []).length;
  const blogCount = (filteredBlogs?.blogs || []).length;
  const newsCount = (filteredNews?.news || []).length;
  return tweetCount + podcastCount + blogCount + newsCount > 0;
}

// -- Feed 读取 ---------------------------------------------------------------

function countFeedItems(feedX, feedPodcasts, feedBlogs, feedNews) {
  const tweets = (feedX?.x || []).reduce((s, b) => s + (b.tweets?.length || 0), 0);
  const podcasts = (feedPodcasts?.podcasts || []).length;
  const blogs = (feedBlogs?.blogs || []).length;
  const news = (feedNews?.news || []).length;
  return { tweets, podcasts, blogs, news, total: tweets + podcasts + blogs + news };
}

async function getFeedData() {
  const forceRemote = process.env.DIGEST_FORCE_REMOTE_FETCH === 'true';

  const feedXPath = join(SKILL_DIR, 'feed-x.json');
  const feedPodcastsPath = join(SKILL_DIR, 'feed-podcasts.json');
  const feedBlogsPath = join(SKILL_DIR, 'feed-blogs.json');
  const feedNewsPath = join(SKILL_DIR, 'feed-news.json');

  // 1) 读取本地
  let localX = null, localPod = null, localBlog = null, localNews = null;
  if (existsSync(feedXPath)) try { localX = JSON.parse(await readFile(feedXPath, 'utf-8')); } catch {}
  if (existsSync(feedPodcastsPath)) try { localPod = JSON.parse(await readFile(feedPodcastsPath, 'utf-8')); } catch {}
  if (existsSync(feedBlogsPath)) try { localBlog = JSON.parse(await readFile(feedBlogsPath, 'utf-8')); } catch {}
  if (existsSync(feedNewsPath)) try { localNews = JSON.parse(await readFile(feedNewsPath, 'utf-8')); } catch {}

  // 2) 并发拉远程（每次都拉；forceRemote 时忽略本地，只采用远程）
  console.error(`[feed] 正在并行获取 GitHub raw 上的 4 份 feed（forceRemote=${forceRemote}）...`);
  const [remoteX, remotePodcasts, remoteBlogs, remoteNews] = await Promise.all([
    fetchJSON(FEED_X_URL, 'feed-x (remote)'),
    fetchJSON(FEED_PODCASTS_URL, 'feed-podcasts (remote)'),
    fetchJSON(FEED_BLOGS_URL, 'feed-blogs (remote)'),
    fetchJSON(FEED_NEWS_URL, 'feed-news (remote)'),
  ]);

  // 3) 比较新鲜度，择优选用
  const chosenX = forceRemote
    ? { feed: remoteX ?? localX, source: remoteX ? 'remote(force)' : 'local(fallback)' }
    : pickFresherFeed(localX, remoteX, 'feed-x');
  const chosenPod = forceRemote
    ? { feed: remotePodcasts ?? localPod, source: remotePodcasts ? 'remote(force)' : 'local(fallback)' }
    : pickFresherFeed(localPod, remotePodcasts, 'feed-podcasts');
  const chosenBlog = forceRemote
    ? { feed: remoteBlogs ?? localBlog, source: remoteBlogs ? 'remote(force)' : 'local(fallback)' }
    : pickFresherFeed(localBlog, remoteBlogs, 'feed-blogs');
  const chosenNews = forceRemote
    ? { feed: remoteNews ?? localNews, source: remoteNews ? 'remote(force)' : 'local(fallback)' }
    : pickFresherFeed(localNews, remoteNews, 'feed-news');

  const feedX = chosenX.feed;
  const feedPodcasts = chosenPod.feed;
  const feedBlogs = chosenBlog.feed;
  const feedNews = chosenNews.feed;

  // 4) 新鲜度 / 过旧诊断
  const nowTs = Date.now();
  const ages = {
    x: feedX?.generatedAt ? (nowTs - new Date(feedX.generatedAt).getTime()) / 3_600_000 : Infinity,
    podcasts: feedPodcasts?.generatedAt ? (nowTs - new Date(feedPodcasts.generatedAt).getTime()) / 3_600_000 : Infinity,
    blogs: feedBlogs?.generatedAt ? (nowTs - new Date(feedBlogs.generatedAt).getTime()) / 3_600_000 : Infinity,
    news: feedNews?.generatedAt ? (nowTs - new Date(feedNews.generatedAt).getTime()) / 3_600_000 : Infinity,
  };
  const staleFeeds = Object.entries(ages)
    .filter(([, h]) => h > STALE_FEED_HOURS)
    .map(([k, h]) => `${k}(${h.toFixed(1)}h 前)`);

  const rawCounts = countFeedItems(feedX, feedPodcasts, feedBlogs, feedNews);
  console.error(`[feed] 原始抓取量: 推文 ${rawCounts.tweets} / 播客 ${rawCounts.podcasts} / 博客 ${rawCounts.blogs} / 新闻 ${rawCounts.news}`);
  if (staleFeeds.length > 0) {
    console.error(`[feed] ⚠️  存在过旧 feed (阈值 ${STALE_FEED_HOURS}h): ${staleFeeds.join(', ')}，Generate Feeds 可能连续失败！`);
  }

  // 5) 基于内容 ID 去重：过滤掉已推送过的项目
  const digestState = await loadDigestState();
  const { filteredX, filteredPodcasts, filteredBlogs, filteredNews } = filterNewContent(
    feedX, feedPodcasts, feedBlogs, feedNews, digestState.sentItemIds || [],
  );
  const newCounts = countFeedItems(filteredX, filteredPodcasts, filteredBlogs, filteredNews);
  console.error(`[feed] 去重后新量: 推文 ${newCounts.tweets} / 播客 ${newCounts.podcasts} / 博客 ${newCounts.blogs} / 新闻 ${newCounts.news}`);

  const diagnosis = {
    sources: { x: chosenX.source, podcasts: chosenPod.source, blogs: chosenBlog.source, news: chosenNews.source },
    generatedAt: {
      x: feedX?.generatedAt || null,
      podcasts: feedPodcasts?.generatedAt || null,
      blogs: feedBlogs?.generatedAt || null,
      news: feedNews?.generatedAt || null,
    },
    ageHours: {
      x: Number(ages.x.toFixed(1)),
      podcasts: Number(ages.podcasts.toFixed(1)),
      blogs: Number(ages.blogs.toFixed(1)),
      news: Number(ages.news.toFixed(1)),
    },
    staleFeeds,
    rawCounts,
    newCounts,
    sentItemCount: (digestState.sentItemIds || []).length,
    lastSentAt: digestState.lastSentAt || 0,
    forceRemote,
  };

  if (!hasAnyNewContent(filteredX, filteredPodcasts, filteredBlogs, filteredNews)) {
    const why = rawCounts.total === 0
      ? '上游 feed 本身为空（Generate Feeds 抓取后未收录任何条目）'
      : (staleFeeds.length > 0 ? `feed 过旧：${staleFeeds.join(', ')}；内容全部已在之前推送过` : '所有内容均在之前推送过（去重后为 0）');
    console.log(`[feed] 无新内容可发送 → 原因：${why}`);
    return {
      alreadySent: true,
      podcasts: [], x: [], blogs: [], news: [],
      _digestState: digestState,
      _feedX: feedX, _feedPod: feedPodcasts, _feedBlog: feedBlogs, _feedNews: feedNews,
      _diagnosis: diagnosis,
      _emptyReason: why,
    };
  }

  return {
    podcasts: filteredPodcasts?.podcasts || [],
    x: filteredX?.x || [],
    blogs: filteredBlogs?.blogs || [],
    news: filteredNews?.news || [],
    _digestState: digestState,
    _feedX: feedX, _feedPod: feedPodcasts, _feedBlog: feedBlogs, _feedNews: feedNews,
    _diagnosis: diagnosis,
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
      // 保留换行符，避免多行文本合并成一大块
      buffer.text += (buffer.text ? '\n' : '') + line.trim();
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
    // 兜底：按段落分开显示转录内容，避免堆成一大块
    block += `**📌 内容摘要：**\n\n`;
    // 按换行符分段，过滤空行和太短的段落
    const paragraphs = transcript
      .split(/\n+/)
      .map(p => p.trim())
      .filter(p => p.length >= 20);  // 跳过太短的行
    
    // 取前 5 段，每段截断到 200 字符
    const maxParagraphs = 5;
    const maxLen = 200;
    for (let i = 0; i < Math.min(paragraphs.length, maxParagraphs); i++) {
      const p = paragraphs[i];
      const excerpt = p.length > maxLen ? p.slice(0, maxLen) + '...' : p;
      block += `> ${excerpt}\n>\n`;
    }
    if (paragraphs.length > maxParagraphs) {
      block += `> *（还有 ${paragraphs.length - maxParagraphs} 段，请点击链接查看完整内容）*\n`;
    }
    block += `\n`;
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
// 程序化摘要 —— 新闻
// ============================================================================

const CATEGORY_LABELS = {
  tech: '🔧 技术',
  research: '🔬 研究',
  industry: '🏭 行业',
  community: ' 社区',
};

function renderNewsItem(item) {
  const title = item.title || '';
  const url = item.url || '';
  const name = item.name || '';
  const category = item.category || 'general';
  const description = item.description || '';
  const label = CATEGORY_LABELS[category] || '📌 资讯';

  let block = `### ${label} ${title}\n\n`;
  block += `**来源：** ${name}\n\n`;
  if (description) {
    const cleanDesc = description.replace(/<[^>]+>/g, '').trim();
    const excerpt = cleanDesc.length > 200 ? cleanDesc.slice(0, 200) + '...' : cleanDesc;
    if (excerpt) block += `> ${excerpt}\n\n`;
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

  // —— NEWS 板块 ——
  if (feedData.news && feedData.news.length > 0) {
    digest += `## 📰 AI 行业动态\n\n`;
    digest += `*来自 Hacker News、ArXiv、TechCrunch、Reddit 等社区的 AI 相关资讯*\n\n`;
    for (const item of feedData.news) {
      digest += renderNewsItem(item);
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
    digest += `## ️ PODCASTS 播客\n\n`;
    digest += `*顶级 AI 播客最新一期（嘉宾背景 + 带时间戳的核心要点）*\n\n`;
    for (const podcast of feedData.podcasts) {
      digest += renderPodcast(podcast);
    }
  }

  // —— 今日数据统计 ——
  const newsCount = feedData.news?.length || 0;
  const blogCount = feedData.blogs?.length || 0;
  const podcastCount = feedData.podcasts?.length || 0;

  digest += `##  今日数据\n\n`;
  digest += `- **行业动态：** ${newsCount} 条\n`;
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
    .container { max-width: 640px; margin: 0 auto; padding: 16px; }
    .header { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); border-radius: 12px 12px 0 0; padding: 28px 24px; color: white; }
    .header h1 { font-size: 20px; font-weight: 700; margin-bottom: 8px; }
    .header p { font-size: 13px; opacity: 0.9; line-height: 1.5; }
    .content { background: white; border-radius: 0 0 12px 12px; padding: 24px; box-shadow: 0 2px 12px rgba(0,0,0,0.04); }
    .content h1 { font-size: 18px; font-weight: 700; color: #1f2937; margin: 24px 0 16px; line-height: 1.4; }
    .content h2 { font-size: 16px; font-weight: 600; color: #1f2937; margin: 28px 0 14px; display: flex; align-items: center; gap: 8px; line-height: 1.4; }
    .content h2:first-child { margin-top: 0; }
    .content h2::before { content: ''; display: inline-block; width: 3px; height: 16px; background: #4f46e5; border-radius: 2px; flex-shrink: 0; }
    .content h3 { font-size: 14px; font-weight: 600; color: #374151; margin: 20px 0 10px; line-height: 1.4; }
    .content p { font-size: 14px; color: #4b5563; line-height: 1.8; margin: 12px 0; }
    .content ul, .content ol { margin: 14px 0; padding-left: 24px; }
    .content li { font-size: 14px; color: #4b5563; line-height: 1.8; margin: 8px 0; }
    .content strong { color: #1f2937; font-weight: 600; }
    .content a { color: #4f46e5; text-decoration: none; font-weight: 500; word-break: break-all; }
    .content a:hover { text-decoration: underline; }
    .content blockquote { border-left: 3px solid #4f46e5; padding: 12px 16px; margin: 16px 0; background: #f9fafb; border-radius: 0 8px 8px 0; }
    .content blockquote p { margin: 4px 0; color: #6b7280; font-size: 13px; line-height: 1.7; }
    .content hr { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
    .content em { color: #6b7280; font-size: 13px; }
    .divider { height: 8px; background: #f5f5f5; margin: 16px 0; border-radius: 4px; }
    .footer { text-align: center; padding: 20px 24px; color: #9ca3af; font-size: 12px; line-height: 1.6; }
    .footer a { color: #4f46e5; text-decoration: none; }
    @media (max-width: 600px) {
      .container { padding: 8px; }
      .header { padding: 20px 16px; }
      .header h1 { font-size: 17px; }
      .content { padding: 16px; }
      .content h2 { font-size: 15px; }
      .content p, .content li { font-size: 13px; }
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

async function sendEmail(text, toEmail, opts = {}) {
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
  const subjectPrefix = opts.isAlert ? '🚨 [ALERT] ' : '';
  const subjectSuffix = opts.subjectSuffix || '';
  const subject = `${subjectPrefix}AI Builders Digest — ${new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })}${subjectSuffix ? ` ${subjectSuffix}` : ''}`;

  await transporter.sendMail({
    from: `AI Builders Digest <${smtpSender}>`,
    to: toEmail,
    subject,
    text: text,
    html: html
  });
}

// 把诊断对象写到 GitHub Actions Summary（本地没有这个 env 时跳过）
async function writeActionsSummary(title, fields) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  try {
    let md = `## ${title}\n\n`;
    for (const [k, v] of Object.entries(fields)) {
      md += `- **${k}:** ${v}\n`;
    }
    md += `\n`;
    await writeFile(summaryPath, md, { flag: 'a' });
  } catch (e) {
    console.error('[summary] 写入 GITHUB_STEP_SUMMARY 失败:', e.message);
  }
}

// ============================================================================
// 主入口
// ============================================================================

// 生成"无新内容"的摘要（附带结构化诊断 + 过旧告警）
function generateEmptyDigest(config, extra = {}) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const { diagnosis, emptyReason, totalItems } = extra;
  const staleFeeds = diagnosis?.staleFeeds || [];
  const isAlert = staleFeeds.length > 0 || (diagnosis?.rawCounts?.total === 0);

  const headerLevel = isAlert ? '## 🚨 运行告警：今日无法确认是否有新内容' : '## 📭 今日暂无新内容';
  const actionHint = isAlert
    ? [
        '本邮件为**告警级**：上游抓取链路（Generate Feeds workflow）疑似未成功运行或产出为空，',
        '不代表 AI 建造者真的没有更新。请立即排查：',
        '',
        '1. 打开仓库 Actions 页，查看最近的 `Generate Feeds` 运行日志：',
        '   https://github.com/perriluo05-lagom/follow-builders/actions/workflows/generate-feed.yml',
        '2. 检查以下 Secret 是否有效：`X_BEARER_TOKEN`、`POD2TXT_API_KEY`、`pat_token`。',
        '3. 手动点击 Actions 中的 `Run workflow` 触发一次 `Generate Feeds`，然后再手动跑一次 `Send Daily Digest`。',
        '',
        `**自动判断原因：** ${emptyReason || '（未知）'}`,
        '',
      ].join('\n')
    : [
        '今日没有从关注的信息源中获取到新的推文、播客或博客文章。',
        '',
        `**自动判断原因：** ${emptyReason || '所有内容均已在之前推送过（去重后为 0）'}`,
        '',
      ].join('\n');

  let digest = `# 🤖 AI Builders 每日简报 — ${dateStr}\n\n`;
  digest += `> 本简报追踪 AI 领域顶尖建造者（研究员、创始人、产品经理、工程师）的最新动态。\n\n`;
  digest += `${headerLevel}\n\n`;
  digest += `${actionHint}\n`;
  digest += `可能的补充说明：\n`;
  digest += `- 关注的建造者今日暂未发布新内容\n`;
  digest += `- 播客/博客更新频率较低（通常每周或每月更新）\n`;
  digest += `- 信息源抓取可能遇到临时问题（具体见下表）\n\n`;

  // —— 结构化诊断表（关键！下次再收到空邮件时一眼就能定位）
  digest += `### 🔍 运行诊断\n\n`;
  if (diagnosis) {
    const { sources, generatedAt, ageHours, rawCounts, newCounts, sentItemCount, lastSentAt, forceRemote } = diagnosis;
    const fm = (d) => d ? new Date(d).toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' }) : '—';
    const lastSentStr = lastSentAt
      ? new Date(lastSentAt).toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })
      : '—';
    const tag = (s) => (s || '').startsWith('remote') ? '🌐远程' : (s === 'missing' ? '❌缺失' : '💾本地');
    digest += `| 类别  | 数据来源 | 生成时间 (UTC+8) | 距今(小时) | 抓取条目 | 去重后新条目 |\n`;
    digest += `| :---  | :------- | :--------------- | :--------- | :------- | :----------- |\n`;
    digest += `| 推文X | ${tag(sources.x)} ${sources.x || ''} | ${fm(generatedAt.x)} | ${Number.isFinite(ageHours.x) ? ageHours.x.toFixed(1) : '∞'} | ${rawCounts.tweets} | ${newCounts.tweets} |\n`;
    digest += `| 播客  | ${tag(sources.podcasts)} ${sources.podcasts || ''} | ${fm(generatedAt.podcasts)} | ${Number.isFinite(ageHours.podcasts) ? ageHours.podcasts.toFixed(1) : '∞'} | ${rawCounts.podcasts} | ${newCounts.podcasts} |\n`;
    digest += `| 博客  | ${tag(sources.blogs)} ${sources.blogs || ''} | ${fm(generatedAt.blogs)} | ${Number.isFinite(ageHours.blogs) ? ageHours.blogs.toFixed(1) : '∞'} | ${rawCounts.blogs} | ${newCounts.blogs} |\n\n`;
    digest += `- **已记录去重 ID 数：** ${sentItemCount}（超过 14 天会自动清理）\n`;
    digest += `- **上次成功发送简报：** ${lastSentStr}\n`;
    if (forceRemote) digest += `- **模式：** 强制远程抓取（DIGEST_FORCE_REMOTE_FETCH=true）\n`;
    if (totalItems !== undefined) digest += `- **已处理条目计数：** ${totalItems}\n`;
    if (staleFeeds.length > 0) digest += `- **⚠️ 过旧 feed（> ${STALE_FEED_HOURS}h）：** ${staleFeeds.join('，')}\n`;
  } else {
    digest += `_诊断数据缺失（可能是 sendWhenEmpty 走到了 totalItems===0 分支且未传递 diagnosis）_\n\n`;
  }

  digest += `\n`;
  digest += `请明日再查看，或访问 [Follow Builders](https://github.com/zarazhangrui/follow-builders) 了解更多信息。\n\n`;
  digest += `---\n\n`;
  digest += `Generated through the Follow Builders skill: https://github.com/zarazhangrui/follow-builders\n\n`;

  // 返回时额外携带邮件主题建议（主入口会覆盖 subject）
  return { text: digest, isAlert };
}

async function main() {
  try {
    let config = {
      language: 'zh',
      frequency: 'daily',
      deliveryTime: '09:00',
      timezone: 'Asia/Shanghai',
      delivery: { method: 'stdout', email: '' },
      sendWhenEmpty: true  // 默认发送"无更新"通知
    };

    if (existsSync(CONFIG_PATH)) {
      config = JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));
    }

    // 环境变量覆盖本地配置（用于 GitHub Actions 云端部署）
    const configOverrides = {
      language: process.env.DIGEST_LANGUAGE || config.language,
      timezone: process.env.DIGEST_TIMEZONE || config.timezone,
      deliveryTime: process.env.DIGEST_DELIVERY_TIME || config.deliveryTime,
      sendWhenEmpty: process.env.DIGEST_SEND_WHEN_EMPTY !== undefined
        ? process.env.DIGEST_SEND_WHEN_EMPTY === 'true'
        : (config.sendWhenEmpty !== undefined ? config.sendWhenEmpty : true),
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
    const diagnosis = feedData._diagnosis || null;

    // 同一批 feed 已推送过则跳过
    if (feedData.alreadySent) {
      console.log('此批 feed 已推送过，本次跳过不重复发送。');
      await writeActionsSummary('Digest Result — Already Sent / Empty', {
        '原因': feedData._emptyReason || 'all feed items deduped',
        '上游 feed 距今(推文/播客/博客)': diagnosis
          ? `${diagnosis.ageHours.x}h / ${diagnosis.ageHours.podcasts}h / ${diagnosis.ageHours.blogs}h`
          : 'N/A',
        '抓取总数': diagnosis ? `${diagnosis.rawCounts.tweets}/${diagnosis.rawCounts.podcasts}/${diagnosis.rawCounts.blogs}` : 'N/A',
        '去重后新数': diagnosis ? `${diagnosis.newCounts.tweets}/${diagnosis.newCounts.podcasts}/${diagnosis.newCounts.blogs}` : 'N/A',
        '过旧 feed': diagnosis?.staleFeeds?.length > 0 ? diagnosis.staleFeeds.join('，') : '无',
      });
      // 如果配置为发送空通知，则发送"无更新"邮件（带结构化诊断）
      if (config.sendWhenEmpty && toEmail) {
        console.log('sendWhenEmpty=true，发送"无更新"通知邮件（含诊断）...');
        const { text: emptyDigest, isAlert } = generateEmptyDigest(config, {
          diagnosis,
          emptyReason: feedData._emptyReason,
        });
        await sendEmail(emptyDigest, toEmail, {
          isAlert,
          subjectSuffix: isAlert ? '— 上游抓取疑似异常' : '— 暂无新推送',
        });
        console.log(`Empty digest email sent successfully (isAlert=${isAlert})`);
      }
      return;
    }

    // 内容全为空也跳过
    const totalItems =
      (feedData.x?.reduce((s, b) => s + (b.tweets?.length || 0), 0) || 0) +
      (feedData.podcasts?.length || 0) +
      (feedData.blogs?.length || 0);
    if (totalItems === 0) {
      console.log('今日没有新内容（0 条推文 / 0 集播客 / 0 篇博客），跳过发送。');
      await writeActionsSummary('Digest Result — Empty', {
        '原因': diagnosis?._emptyReason || 'totalItems===0',
        '上游 feed 距今(推文/播客/博客)': diagnosis
          ? `${diagnosis.ageHours.x}h / ${diagnosis.ageHours.podcasts}h / ${diagnosis.ageHours.blogs}h`
          : 'N/A',
        '抓取总数': diagnosis ? `${diagnosis.rawCounts.tweets}/${diagnosis.rawCounts.podcasts}/${diagnosis.rawCounts.blogs}` : 'N/A',
        '过旧 feed': diagnosis?.staleFeeds?.length > 0 ? diagnosis.staleFeeds.join('，') : '无',
      });
      // 如果配置为发送空通知，则发送"无更新"邮件
      if (config.sendWhenEmpty && toEmail) {
        console.log('sendWhenEmpty=true，发送"无更新"通知邮件（含诊断）...');
        const { text: emptyDigest, isAlert } = generateEmptyDigest(config, {
          diagnosis,
          emptyReason: '过滤后 totalItems===0：上游 feed 为空或全部被去重',
          totalItems: 0,
        });
        await sendEmail(emptyDigest, toEmail, {
          isAlert,
          subjectSuffix: isAlert ? '— 上游抓取疑似异常' : '— 暂无新推送',
        });
        console.log(`Empty digest email sent successfully (isAlert=${isAlert})`);
      }
      return;
    }

    console.log(`Generating digest (${totalItems} 条新内容)...`);
    const digest = generateDigest(feedData, config);

    await writeActionsSummary('Digest Result — Sent', {
      '新增内容': `${totalItems} 条（推文 ${(feedData.x || []).reduce((s, b) => s + (b.tweets?.length || 0), 0)} / 播客 ${feedData.podcasts?.length || 0} / 博客 ${feedData.blogs?.length || 0}）`,
      '上游 feed 距今(推文/播客/博客)': diagnosis
        ? `${diagnosis.ageHours.x}h / ${diagnosis.ageHours.podcasts}h / ${diagnosis.ageHours.blogs}h`
        : 'N/A',
      '数据来源': diagnosis ? `X=${diagnosis.sources.x} / 播客=${diagnosis.sources.podcasts} / 博客=${diagnosis.sources.blogs}` : 'N/A',
    });

    if (toEmail) {
      console.log(`Sending to ${toEmail}...`);
      await sendEmail(digest, toEmail);
      console.log('Email sent successfully!');
      // —— 发送成功后记录已推送的内容 ID，防止重复推送 ——
      const ds = feedData._digestState || { lastSentAt: 0, feedTimestamps: {}, sentItemIds: [] };
      ds.lastSentAt = Date.now();
      ds.feedTimestamps = {
        x: feedData._feedX?.generatedAt || ds.feedTimestamps?.x,
        podcasts: feedData._feedPod?.generatedAt || ds.feedTimestamps?.podcasts,
        blogs: feedData._feedBlog?.generatedAt || ds.feedTimestamps?.blogs,
      };
      // 记录本次发送的所有内容 ID（推文 ID、播客 GUID、博客 URL）
      const now = Date.now();
      const newItemIds = extractContentIds(feedData._feedX, feedData._feedPod, feedData._feedBlog);
      ds.sentItemIds = [
        ...(ds.sentItemIds || []),
        ...newItemIds.map(id => ({ id, ts: now }))
      ];
      await saveDigestState(ds);
      console.log(`已保存 digest-state.json，记录了 ${newItemIds.length} 个内容 ID，下次将跳过这些已推送内容。`);
    } else {
      console.log(digest);
    }

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();

// —— 本地诊断自测：DEBUG_DIAG_TEST=1 node auto-digest.js 即可打印 generateEmptyDigest 两个样例不发邮件
if (process.env.DEBUG_DIAG_TEST === '1') {
  (async () => {
    console.log('\n===== DEBUG 自测 1：过旧 feed + 全部被去重 → 应告警级 =====');
    const case1 = generateEmptyDigest({ language: 'zh' }, {
      diagnosis: {
        sources: { x: 'remote', podcasts: 'local', blogs: 'missing' },
        generatedAt: { x: '2026-07-27T07:26:55.001Z', podcasts: '2026-07-27T07:26:58.386Z', blogs: null },
        ageHours: { x: 648.0, podcasts: 648.0, blogs: Infinity },
        staleFeeds: ['x(648.0h 前)','podcasts(648.0h 前)'],
        rawCounts: { tweets: 21, podcasts: 1, blogs: 0, total: 22 },
        newCounts: { tweets: 0, podcasts: 0, blogs: 0, total: 0 },
        sentItemCount: 95,
        lastSentAt: 1786886460418,
        forceRemote: true,
      },
      emptyReason: 'feed 过旧：x(648h 前)、podcasts(648h 前)；内容全部已在之前推送过',
    });
    console.log('isAlert =', case1.isAlert);
    console.log(case1.text.split('\n').slice(0, 50).join('\n'));

    console.log('\n===== DEBUG 自测 2：feed 很新、真的没有内容 → 不应告警级 =====');
    const case2 = generateEmptyDigest({ language: 'zh' }, {
      diagnosis: {
        sources: { x: 'remote', podcasts: 'remote', blogs: 'remote' },
        generatedAt: { x: new Date().toISOString(), podcasts: new Date().toISOString(), blogs: new Date().toISOString() },
        ageHours: { x: 0.2, podcasts: 0.2, blogs: 0.2 },
        staleFeeds: [],
        rawCounts: { tweets: 0, podcasts: 0, blogs: 0, total: 0 },
        newCounts: { tweets: 0, podcasts: 0, blogs: 0, total: 0 },
        sentItemCount: 50,
        lastSentAt: Date.now() - 20*3600*1000,
        forceRemote: false,
      },
      emptyReason: '上游 feed 本身为空（Generate Feeds 抓取后未收录任何条目）',
    });
    console.log('isAlert =', case2.isAlert);
    console.log(case2.text.split('\n').slice(0, 45).join('\n'));
  })();
}
