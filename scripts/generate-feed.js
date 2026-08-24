#!/usr/bin/env node

// ============================================================================
// Follow Builders — Central Feed Generator
// ============================================================================
// Runs on GitHub Actions (daily at 6am UTC) to fetch content and publish
// feed-x.json, feed-podcasts.json, and feed-blogs.json.
//
// Deduplication: tracks previously seen tweet IDs, episode GUIDs, and article
// URLs in state-feed.json so content is never repeated across runs.
//
// Usage: node generate-feed.js [--tweets-only | --podcasts-only | --blogs-only]
// Env vars needed: X_BEARER_TOKEN, POD2TXT_API_KEY
// ============================================================================

import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

// -- Constants ---------------------------------------------------------------

const POD2TXT_BASE = "https://pod2txt.vercel.app/api";
const X_API_BASE = "https://api.x.com/2";
// Some RSS hosts (notably Substack) block non-browser user agents from cloud IPs.
// Using a real Chrome UA avoids 403 errors in GitHub Actions.
const RSS_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TWEET_LOOKBACK_HOURS = 24;
const PODCAST_LOOKBACK_HOURS = 336; // 14 days — podcasts publish weekly/biweekly, not daily
const BLOG_LOOKBACK_HOURS = 72;
const NEWS_LOOKBACK_HOURS = 24; // News: last 24 hours
const MAX_TWEETS_PER_USER = 3;
const MAX_ARTICLES_PER_BLOG = 3;
const MAX_NEWS_PER_SOURCE = 5; // Top 5 items per news source
const X_USER_LOOKUP_BATCH_SIZE = 5;
const X_RETRY_STATUSES = new Set([500, 502, 503, 504]);
const X_RETRY_ATTEMPTS = 3;

// State file lives in the repo root so it gets committed by GitHub Actions
// 使用 process.cwd() 而非 new URL('.', import.meta.url).pathname，避免 Windows 上路径解析错误
const SCRIPT_DIR = process.cwd();
const STATE_PATH = join(SCRIPT_DIR, "..", "state-feed.json");

// -- State Management --------------------------------------------------------

// Tracks which tweet IDs and video IDs we've already included in feeds
// so we never send the same content twice across runs.

async function loadState() {
  if (!existsSync(STATE_PATH)) {
    return { seenTweets: {}, seenVideos: {}, seenArticles: {}, seenNews: {} };
  }
  try {
    const state = JSON.parse(await readFile(STATE_PATH, "utf-8"));
    // Ensure new fields exist for older state files
    if (!state.seenArticles) state.seenArticles = {};
    if (!state.seenNews) state.seenNews = {};
    return state;
  } catch {
    return { seenTweets: {}, seenVideos: {}, seenArticles: {}, seenNews: {} };
  }
}

async function saveState(state) {
  // Prune entries older than 7 days to prevent the file from growing forever
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const [id, ts] of Object.entries(state.seenTweets)) {
    if (ts < cutoff) delete state.seenTweets[id];
  }
  for (const [id, ts] of Object.entries(state.seenVideos)) {
    if (ts < cutoff) delete state.seenVideos[id];
  }
  for (const [id, ts] of Object.entries(state.seenArticles || {})) {
    if (ts < cutoff) delete state.seenArticles[id];
  }
  for (const [id, ts] of Object.entries(state.seenNews || {})) {
    if (ts < cutoff) delete state.seenNews[id];
  }
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2));
}

// -- Load Sources ------------------------------------------------------------

async function loadSources() {
  const sourcesPath = join(SCRIPT_DIR, "..", "config", "default-sources.json");
  return JSON.parse(await readFile(sourcesPath, "utf-8"));
}

// -- Podcast Fetching (RSS + pod2txt) ----------------------------------------

// Parses an RSS feed XML string and returns episode objects with
// title, publishedAt, guid, and link. RSS feeds list newest first.
function parseRssFeed(xml) {
  const episodes = [];
  // Match each <item> block in the RSS feed
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let itemMatch;
  while ((itemMatch = itemRegex.exec(xml)) !== null) {
    const block = itemMatch[1];

    // Extract title (inside CDATA or plain text)
    const titleMatch =
      block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
      block.match(/<title>([\s\S]*?)<\/title>/);
    const title = titleMatch ? titleMatch[1].trim() : "Untitled";

    // Extract GUID (unique episode identifier), stripping CDATA wrapper if present
    const guidMatch =
      block.match(/<guid[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/guid>/) ||
      block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/);
    const guid = guidMatch ? guidMatch[1].trim() : null;

    // Extract publish date
    const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const publishedAt = pubDateMatch
      ? new Date(pubDateMatch[1].trim()).toISOString()
      : null;

    // Extract episode link (for the feed output URL)
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
    const link = linkMatch ? linkMatch[1].trim() : null;

    // Extract description/shownotes (CDATA or plain, used for xiaoyuzhou podcasts)
    const descMatch =
      block.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/) ||
      block.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/) ||
      block.match(/<itunes:summary><!\[CDATA\[([\s\S]*?)\]\]><\/itunes:summary>/) ||
      block.match(/<itunes:summary>([\s\S]*?)<\/itunes:summary>/) ||
      block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ||
      block.match(/<description>([\s\S]*?)<\/description>/);
    const description = descMatch ? descMatch[1].trim() : "";

    if (guid) {
      episodes.push({ title, guid, publishedAt, link, description });
    }
  }
  return episodes;
}

// 把 RSS shownotes 里常见的 HTML tag / 双重 HTML entity 转成可读中文文本，
// 避免 feed-podcasts.json.transcript 里出现 `&lt;p&gt;`、`<br>` 这类垃圾字符。
function cleanShownotes(raw) {
  if (!raw) return "";
  // 先处理 HTML entity（RSS 里可能被双重转义）
  let s = String(raw);
  for (let i = 0; i < 2; i++) {
    s = s
      .replace(/&nbsp;/g, " ")
      .replace(/&#160;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  }
  // 换行/段落标签变成换行，其它 HTML 标签直接去掉
  s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<\/div>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  // 压缩多余空白，但保留段落
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

// -- YouTube Episode URL Lookup ----------------------------------------------
// Podcast RSS feeds don't know about YouTube, so to get the exact YouTube
// video URL for an episode we look up the channel's recent videos and match
// by title. Free, no API key required. Tries Atom RSS first (stable but
// returns 500 for some channels), falls back to scraping the /videos page.

// Derives a YouTube Atom feed URL from a channel or playlist URL.
// Handles three URL shapes: /@handle, /channel/UCxxx, /playlist?list=PLxxx.
async function getYouTubeFeedUrl(channelUrl) {
  if (!channelUrl || !channelUrl.includes("youtube.com")) return null;

  const playlistMatch = channelUrl.match(/[?&]list=([A-Za-z0-9_-]+)/);
  if (playlistMatch) {
    return `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistMatch[1]}`;
  }

  const channelIdMatch = channelUrl.match(/\/channel\/(UC[A-Za-z0-9_-]+)/);
  if (channelIdMatch) {
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelIdMatch[1]}`;
  }

  // /@handle URLs need a round-trip: fetch the channel page and pull the
  // channelId out of its HTML. YouTube embeds it in several places; the
  // "channelId":"UC..." pattern in the JSON blob is the most reliable.
  if (channelUrl.match(/\/@[A-Za-z0-9_.-]+/)) {
    try {
      const res = await fetch(channelUrl, {
        headers: {
          "User-Agent": RSS_USER_AGENT,
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return null;
      const html = await res.text();
      const idMatch =
        html.match(/"channelId":"(UC[A-Za-z0-9_-]{20,})"/) ||
        html.match(
          /<meta\s+itemprop="(?:identifier|channelId)"\s+content="(UC[A-Za-z0-9_-]{20,})"/,
        );
      if (idMatch) {
        return `https://www.youtube.com/feeds/videos.xml?channel_id=${idMatch[1]}`;
      }
    } catch {
      return null;
    }
  }
  return null;
}

// Scrapes recent videos from a YouTube channel's /videos page by parsing
// the ytInitialData JSON embedded in the HTML. Used as a fallback when the
// Atom RSS endpoint is unavailable. YouTube's internal data shapes change
// occasionally, so we defensively navigate both the rich-grid (channel page)
// and playlist-video-list (playlist page) structures.
function parseYouTubePageData(html) {
  const videos = [];
  const m = html.match(/var\s+ytInitialData\s*=\s*({[\s\S]*?});\s*<\/script>/);
  if (!m) return videos;

  let data;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return videos;
  }

  const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
  for (const tab of tabs) {
    const gridItems =
      tab?.tabRenderer?.content?.richGridRenderer?.contents || [];
    for (const it of gridItems) {
      const v = it?.richItemRenderer?.content?.videoRenderer;
      if (v?.videoId) {
        const title = v.title?.runs?.[0]?.text || v.title?.simpleText || "";
        if (title) {
          videos.push({
            title,
            url: `https://www.youtube.com/watch?v=${v.videoId}`,
          });
        }
      }
    }
    if (videos.length > 0) break;

    const playlistItems =
      tab?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]
        ?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer
        ?.contents || [];
    for (const it of playlistItems) {
      const v = it?.playlistVideoRenderer;
      if (v?.videoId) {
        const title = v.title?.runs?.[0]?.text || v.title?.simpleText || "";
        if (title) {
          videos.push({
            title,
            url: `https://www.youtube.com/watch?v=${v.videoId}`,
          });
        }
      }
    }
    if (videos.length > 0) break;
  }
  return videos;
}

// Fetches recent videos for a YouTube channel/playlist URL. Tries the Atom
// feed first, then scrapes the /videos page if the feed is unavailable.
async function fetchYouTubeVideos(channelUrl) {
  const feedUrl = await getYouTubeFeedUrl(channelUrl);
  if (feedUrl) {
    try {
      const res = await fetch(feedUrl, {
        headers: { "User-Agent": RSS_USER_AGENT },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const videos = parseYouTubeFeed(await res.text());
        if (videos.length > 0) return videos;
      }
    } catch {
      // fall through to scraping
    }
  }

  if (!channelUrl || !channelUrl.includes("youtube.com")) return [];
  // Playlist URLs should not be mutated; channel URLs need /videos appended
  // so we hit the uploads grid rather than the channel home/shorts page.
  const videosPageUrl = channelUrl.includes("/playlist?")
    ? channelUrl
    : channelUrl.replace(/\/$/, "") + "/videos";
  try {
    const res = await fetch(videosPageUrl, {
      headers: {
        "User-Agent": RSS_USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    return parseYouTubePageData(await res.text());
  } catch {
    return [];
  }
}

// Parses a YouTube Atom feed and returns { title, url } for each entry.
function parseYouTubeFeed(xml) {
  const videos = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let entryMatch;
  while ((entryMatch = entryRegex.exec(xml)) !== null) {
    const block = entryMatch[1];
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    const videoIdMatch = block.match(/<yt:videoId>([\s\S]*?)<\/yt:videoId>/);
    if (titleMatch && videoIdMatch) {
      videos.push({
        title: titleMatch[1].trim(),
        url: `https://www.youtube.com/watch?v=${videoIdMatch[1].trim()}`,
      });
    }
  }
  return videos;
}

// Lowercase, strip punctuation, collapse whitespace — so minor title
// differences between a podcast feed and its YouTube upload don't block a match.
function normalizeTitle(t) {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Finds the YouTube video whose title best matches the podcast episode title.
// Uses substring match first, then token overlap (>=50% of episode's content
// words must appear in the video title). Returns null if no confident match.
async function findYouTubeEpisodeUrl(channelUrl, episodeTitle) {
  const videos = await fetchYouTubeVideos(channelUrl);
  if (videos.length === 0) return null;

  const needle = normalizeTitle(episodeTitle);
  const needleTokens = new Set(needle.split(" ").filter((w) => w.length > 2));
  if (needleTokens.size === 0) return null;

  let bestUrl = null;
  let bestScore = 0;
  for (const v of videos) {
    const hay = normalizeTitle(v.title);
    if (hay && (hay.includes(needle) || needle.includes(hay))) {
      return v.url;
    }
    const hayTokens = new Set(hay.split(" ").filter((w) => w.length > 2));
    let overlap = 0;
    for (const tok of needleTokens) if (hayTokens.has(tok)) overlap++;
    const score = overlap / needleTokens.size;
    if (score > bestScore) {
      bestScore = score;
      bestUrl = v.url;
    }
  }
  return bestScore >= 0.5 ? bestUrl : null;
}

// Fetches a transcript from pod2txt. The API is async: first request may
// return "processing", so we poll until "ready" (up to 5 attempts, ~2.5 min).
async function fetchPod2txtTranscript(rssUrl, guid, apiKey) {
  const maxAttempts = 5;
  const pollInterval = 30000; // 30 seconds between polls

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`${POD2TXT_BASE}/transcript`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedurl: rssUrl, guid, apikey: apiKey }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { error: `HTTP ${res.status}: ${text}` };
    }

    const data = await res.json();

    if (data.status === "ready" && data.url) {
      // Transcript is ready — fetch the text from the provided URL
      const txtRes = await fetch(data.url);
      if (!txtRes.ok)
        return {
          error: `Failed to fetch transcript text: HTTP ${txtRes.status}`,
        };
      const transcript = await txtRes.text();
      return { transcript };
    }

    if (data.status === "processing") {
      console.error(
        `      pod2txt: processing (attempt ${attempt}/${maxAttempts}), waiting ${pollInterval / 1000}s...`,
      );
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, pollInterval));
      }
      continue;
    }

    // Unexpected status or error from the API
    return { error: data.message || `Unexpected status: ${data.status}` };
  }

  return { error: "Timed out waiting for transcript processing" };
}

// Main podcast fetching function. For each podcast:
// 1. Fetches the RSS feed to discover episodes
// 2. Filters by lookback window and dedup
// 3. Fetches transcript via pod2txt for the newest unseen episode
async function fetchPodcastContent(podcasts, apiKey, state, errors) {
  const cutoff = new Date(Date.now() - PODCAST_LOOKBACK_HOURS * 60 * 60 * 1000);
  const allCandidates = [];

  // Step 1: Discover episodes from each podcast's RSS feed
  for (const podcast of podcasts) {
    if (!podcast.rssUrl) {
      errors.push(`Podcast: No rssUrl configured for ${podcast.name}`);
      continue;
    }

    try {
      console.error(`  Fetching RSS for ${podcast.name}...`);
      const rssRes = await fetch(podcast.rssUrl, {
        headers: {
          "User-Agent": RSS_USER_AGENT,
          Accept: "application/rss+xml, application/xml, text/xml, */*",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
        signal: AbortSignal.timeout(30000), // 30 second timeout for large feeds
      });

      if (!rssRes.ok) {
        console.error(
          `  ${podcast.name}: RSS fetch failed — HTTP ${rssRes.status}`,
        );
        errors.push(
          `Podcast: Failed to fetch RSS for ${podcast.name}: HTTP ${rssRes.status}`,
        );
        continue;
      }

      const rssXml = await rssRes.text();
      const episodes = parseRssFeed(rssXml);
      console.error(
        `  ${podcast.name}: found ${episodes.length} episodes in RSS feed`,
      );

      // Check the 3 most recent episodes, skip already-seen ones
      for (const episode of episodes.slice(0, 3)) {
        if (state.seenVideos[episode.guid]) {
          console.error(`    Skipping "${episode.title}" (already seen)`);
          continue;
        }

        console.error(
          `    Candidate: "${episode.title}" published=${episode.publishedAt || "unknown"}`,
        );
        allCandidates.push({ podcast, ...episode });
      }
    } catch (err) {
      errors.push(`Podcast: Error processing ${podcast.name}: ${err.message}`);
    }
  }

  console.error(
    `  Total candidates: ${allCandidates.length}, cutoff: ${cutoff.toISOString()}`,
  );

  // Step 2: Filter by lookback window, sort newest first
  const withinWindow = allCandidates
    .filter((v) => !v.publishedAt || new Date(v.publishedAt) >= cutoff)
    .sort((a, b) => {
      // Newest first; dateless ones go to the end
      if (a.publishedAt && b.publishedAt)
        return new Date(b.publishedAt) - new Date(a.publishedAt);
      if (a.publishedAt) return -1;
      if (b.publishedAt) return 1;
      return 0;
    });

  console.error(`  Within window: ${withinWindow.length} episode(s)`);
  for (const v of withinWindow) {
    console.error(`    - "${v.title}" published=${v.publishedAt || "unknown"}`);
  }

  // Step 3: Try each candidate until we get a transcript
  for (const selected of withinWindow) {
    // 小宇宙播客：跳过 pod2txt 转写，直接用 RSS 中的 shownotes 作为内容（无需任何 API key）。
    if (selected.podcast.platform === "xiaoyuzhou") {
      console.error(`    [小宇宙] Using RSS shownotes for "${selected.title}" (skip pod2txt)`);
      state.seenVideos[selected.guid] = Date.now();
      const shownotes = cleanShownotes(selected.description || selected.summary || "");
      // shownotes 可能非常短（主播只写了一句话/免责声明），此时仍然返回但提示一下，
      // 让下游 digest 一眼知道是 shownotes 不是 transcript。
      if (shownotes.length < 80) {
        console.warn(`    [小宇宙] Shownotes 很短 (${shownotes.length} chars)，内容可能不完整`);
      }
      return [
        {
          source: "podcast",
          name: selected.podcast.name,
          title: selected.title,
          guid: selected.guid,
          url: selected.link || selected.podcast.url,
          publishedAt: selected.publishedAt,
          transcript: shownotes.slice(0, 1500), // 限制长度避免 token 过大
        },
      ];
    }

    // 非 xiaoyuzhou 播客必须靠 pod2txt 把音频转成文字；没 key 时直接跳过，避免对 pod2txt 做
    // 一个 apikey 为空的 POST 请求（会 401 / 抛错然后把 podcast 板块也污染成 0）。
    if (!apiKey) {
      console.error(
        `    No POD2TXT_API_KEY; skip non-xiaoyuzhou podcast "${selected.title}"`,
      );
      errors.push(
        `Podcast: skipped "${selected.title}" (${selected.podcast.name}) — POD2TXT_API_KEY not set`,
      );
      // 注意：不 mark seen，这样用户以后加上 POD2TXT_API_KEY 再跑还能补抓。
      continue;
    }

    // 其他播客：使用 pod2txt 获取 transcript
    console.error(`    Fetching transcript for "${selected.title}"...`);

    const result = await fetchPod2txtTranscript(
      selected.podcast.rssUrl,
      selected.guid,
      apiKey,
    );

    // Mark as seen regardless so we don't retry failed episodes daily
    state.seenVideos[selected.guid] = Date.now();

    if (result.error) {
      console.error(
        `    Transcript error: ${result.error} — skipping to next candidate`,
      );
      errors.push(
        `Podcast: Transcript error for "${selected.title}": ${result.error}`,
      );
      continue;
    }

    if (!result.transcript) {
      console.error(
        `    Empty transcript for "${selected.title}" — skipping to next candidate`,
      );
      continue;
    }

    console.error(
      `    Selected: "${selected.title}" (transcript: ${result.transcript.length} chars)`,
    );

    // Try to resolve the exact YouTube video URL for this episode. If the
    // lookup fails (no YouTube channel configured, no title match, network
    // error), fall back to the channel URL so the feed still works.
    const youtubeUrl = await findYouTubeEpisodeUrl(
      selected.podcast.url,
      selected.title,
    );
    if (youtubeUrl) {
      console.error(`    Matched YouTube episode URL: ${youtubeUrl}`);
    } else {
      console.error(
        `    No YouTube episode match found — falling back to channel URL`,
      );
    }

    return [
      {
        source: "podcast",
        name: selected.podcast.name,
        title: selected.title,
        guid: selected.guid,
        url: youtubeUrl || selected.podcast.url,
        publishedAt: selected.publishedAt,
        transcript: result.transcript,
      },
    ];
  }

  console.error(`    No candidates had transcripts available`);
  return [];
}

// -- X/Twitter Fetching (Official API v2) ------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchXWithRetry(url, options) {
  let lastResponse;
  for (let attempt = 1; attempt <= X_RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, options);
      lastResponse = res;
      if (!X_RETRY_STATUSES.has(res.status) || attempt === X_RETRY_ATTEMPTS) {
        return res;
      }
    } catch (err) {
      if (attempt === X_RETRY_ATTEMPTS) throw err;
    }
    await sleep(1000 * attempt);
  }
  return lastResponse;
}

async function fetchXContent(xAccounts, bearerToken, state, errors) {
  const results = [];
  const cutoff = new Date(Date.now() - TWEET_LOOKBACK_HOURS * 60 * 60 * 1000);

  // Batch lookup user IDs. Smaller batches make one flaky X response less likely
  // to wipe out the whole feed.
  // NOTE: handles and userMap are declared at module-level scope via the
  // returned object so that main() can access them for diagnostics.
  const handles = xAccounts.map((a) => a.handle);
  const userMap = {};

  for (let i = 0; i < handles.length; i += X_USER_LOOKUP_BATCH_SIZE) {
    const batch = handles.slice(i, i + X_USER_LOOKUP_BATCH_SIZE);
    try {
      const res = await fetchXWithRetry(
        `${X_API_BASE}/users/by?usernames=${batch.join(",")}&user.fields=name,description`,
        { headers: { Authorization: `Bearer ${bearerToken}` } },
      );

      if (!res.ok) {
        errors.push(
          `X API: User lookup failed for ${batch.join(",")}: HTTP ${res.status}`,
        );
        continue;
      }

      const data = await res.json();
      for (const user of data.data || []) {
        userMap[user.username.toLowerCase()] = {
          id: user.id,
          name: user.name,
          description: user.description || "",
        };
      }
      if (data.errors) {
        for (const err of data.errors) {
          errors.push(`X API: User not found: ${err.value || err.detail}`);
        }
      }
    } catch (err) {
      errors.push(`X API: User lookup error: ${err.message}`);
    }
  }

  // Fetch recent tweets per user (max 3, exclude retweets/replies)
  for (const account of xAccounts) {
    const userData = userMap[account.handle.toLowerCase()];
    if (!userData) continue;

    try {
      const res = await fetchXWithRetry(
        `${X_API_BASE}/users/${userData.id}/tweets?` +
          `max_results=5` + // fetch 5, then filter to 3 new ones
          `&tweet.fields=created_at,public_metrics,referenced_tweets,note_tweet` +
          `&exclude=retweets,replies` +
          `&start_time=${cutoff.toISOString()}`,
        { headers: { Authorization: `Bearer ${bearerToken}` } },
      );

      if (!res.ok) {
        if (res.status === 429) {
          errors.push(`X API: Rate limited, skipping remaining accounts`);
          break;
        }
        errors.push(
          `X API: Failed to fetch tweets for @${account.handle}: HTTP ${res.status}`,
        );
        continue;
      }

      const data = await res.json();
      const allTweets = data.data || [];

      // Filter out already-seen tweets, cap at 3
      const newTweets = [];
      for (const t of allTweets) {
        if (state.seenTweets[t.id]) continue; // dedup
        if (newTweets.length >= MAX_TWEETS_PER_USER) break;

        newTweets.push({
          id: t.id,
          // note_tweet.text has the full untruncated text for long tweets (>280 chars)
          text: t.note_tweet?.text || t.text,
          createdAt: t.created_at,
          url: `https://x.com/${account.handle}/status/${t.id}`,
          likes: t.public_metrics?.like_count || 0,
          retweets: t.public_metrics?.retweet_count || 0,
          replies: t.public_metrics?.reply_count || 0,
          isQuote:
            t.referenced_tweets?.some((r) => r.type === "quoted") || false,
          quotedTweetId:
            t.referenced_tweets?.find((r) => r.type === "quoted")?.id || null,
        });

        // Mark as seen
        state.seenTweets[t.id] = Date.now();
      }

      if (newTweets.length === 0) continue;

      results.push({
        source: "x",
        name: account.name,
        handle: account.handle,
        bio: userData.description,
        tweets: newTweets,
      });

      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      errors.push(`X API: Error fetching @${account.handle}: ${err.message}`);
    }
  }

  return { results, userMap, handles };
}

// -- Blog Fetching (HTML scraping) -------------------------------------------

// Scrapes the Anthropic Engineering blog index page.
// The page is a Next.js app that embeds article data as JSON in <script> tags.
// We parse that JSON to extract article metadata (title, slug, date, summary).
// Falls back to regex-based HTML parsing if the JSON approach fails.
function parseAnthropicEngineeringIndex(html) {
  const articles = [];

  // Strategy 1: Look for article data in Next.js __NEXT_DATA__ script tag
  const nextDataMatch = html.match(
    /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i,
  );
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1]);
      // Navigate the Next.js page props to find article entries
      const pageProps = data?.props?.pageProps;
      const posts =
        pageProps?.posts || pageProps?.articles || pageProps?.entries || [];
      for (const post of posts) {
        const slug = post.slug?.current || post.slug || "";
        articles.push({
          title: post.title || "Untitled",
          url: `https://www.anthropic.com/engineering/${slug}`,
          publishedAt:
            post.publishedOn || post.publishedAt || post.date || null,
          description: post.summary || post.description || "",
        });
      }
      if (articles.length > 0) return articles;
    } catch {
      // JSON parsing failed, fall through to regex approach
    }
  }

  // Strategy 2: Regex-based extraction from the rendered HTML.
  // Anthropic engineering articles follow the pattern /engineering/<slug>
  const linkRegex = /href="\/engineering\/([a-z0-9-]+)"/gi;
  const seenSlugs = new Set();
  let linkMatch;
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    const slug = linkMatch[1];
    if (seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);
    articles.push({
      title: "", // Will be filled when we fetch the article page
      url: `https://www.anthropic.com/engineering/${slug}`,
      publishedAt: null,
      description: "",
    });
  }
  return articles;
}

// Scrapes the Claude Blog index page (claude.com/blog).
// This is a Webflow site. We extract article links, titles, and dates
// from the HTML structure.
function parseClaudeBlogIndex(html) {
  const articles = [];
  const seenSlugs = new Set();

  // Match blog post links — they follow the pattern /blog/<slug>
  // We capture surrounding context to extract titles and dates
  const linkRegex = /href="\/blog\/([a-z0-9-]+)"/gi;
  let linkMatch;
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    const slug = linkMatch[1];
    if (seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);
    articles.push({
      title: "", // Will be filled when we fetch the article page
      url: `https://claude.com/blog/${slug}`,
      publishedAt: null,
      description: "",
    });
  }
  return articles;
}

// Extracts the main text content from an Anthropic Engineering article page.
// Tries the embedded JSON first (Next.js SSR data), then falls back to
// stripping HTML tags from the article body.
function extractAnthropicArticleContent(html) {
  let title = "";
  let author = "";
  let publishedAt = null;
  let content = "";

  // Try to get structured data from Next.js __NEXT_DATA__
  const nextDataMatch = html.match(
    /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i,
  );
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1]);
      const pageProps = data?.props?.pageProps;
      const post =
        pageProps?.post || pageProps?.article || pageProps?.entry || pageProps;
      title = post?.title || "";
      author = post?.author?.name || post?.authors?.[0]?.name || "";
      publishedAt =
        post?.publishedOn || post?.publishedAt || post?.date || null;

      // Extract text from the body blocks (Sanity CMS portable text format)
      const body = post?.body || post?.content || [];
      if (Array.isArray(body)) {
        const textParts = [];
        for (const block of body) {
          if (block._type === "block" && block.children) {
            const text = block.children.map((c) => c.text || "").join("");
            if (text.trim()) textParts.push(text.trim());
          }
        }
        content = textParts.join("\n\n");
      }
      if (content) return { title, author, publishedAt, content };
    } catch {
      // Fall through to HTML stripping
    }
  }

  // Fallback: extract title from <h1> and body from <article> or main content
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) title = h1Match[1].replace(/<[^>]+>/g, "").trim();

  // Try to find the article body and strip HTML tags
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const bodyHtml = articleMatch ? articleMatch[1] : html;

  // Strip script/style tags first, then all remaining HTML tags
  content = bodyHtml
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { title, author, publishedAt, content };
}

// Extracts the main text content from a Claude Blog article page.
// Uses JSON-LD schema data if present, then falls back to the rich text body.
function extractClaudeBlogArticleContent(html) {
  let title = "";
  let author = "";
  let publishedAt = null;
  let content = "";

  // Try JSON-LD structured data first (most reliable for metadata)
  const jsonLdRegex =
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let jsonLdMatch;
  while ((jsonLdMatch = jsonLdRegex.exec(html)) !== null) {
    try {
      const ld = JSON.parse(jsonLdMatch[1]);
      if (ld["@type"] === "BlogPosting" || ld["@type"] === "Article") {
        title = ld.headline || ld.name || "";
        author = ld.author?.name || "";
        publishedAt = ld.datePublished || null;
        break;
      }
    } catch {
      // Not valid JSON-LD, skip
    }
  }

  // Extract body text from the Webflow rich text container
  const richTextMatch =
    html.match(
      /<div[^>]*class="[^"]*u-rich-text-blog[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
    ) ||
    html.match(/<div[^>]*class="[^"]*w-richtext[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

  if (richTextMatch) {
    content = richTextMatch[1]
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // If rich text extraction failed, try a broader approach
  if (!content) {
    // Get title from <h1> if not already found
    if (!title) {
      const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      if (h1Match) title = h1Match[1].replace(/<[^>]+>/g, "").trim();
    }

    // Strip the whole page down to text as a last resort
    content = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return { title, author, publishedAt, content };
}

// Parse RSS blog feed (for blogs like Lilian Weng, Jay Alammar, etc.)
function parseRssBlogFeed(xml, articleBaseUrl) {
  const articles = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let itemMatch;
  
  while ((itemMatch = itemRegex.exec(xml)) !== null) {
    const block = itemMatch[1];
    
    // Extract title
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    const title = titleMatch ? titleMatch[1].trim() : "";
    
    // Extract link
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
    let url = linkMatch ? linkMatch[1].trim() : "";
    
    // If URL is relative, prepend base URL
    if (url && !url.startsWith('http')) {
      url = articleBaseUrl.replace(/\/$/, '') + '/' + url.replace(/^\//, '');
    }
    
    // Extract publication date
    const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const publishedAt = pubDateMatch ? new Date(pubDateMatch[1].trim()).toISOString() : null;
    
    // Extract description
    const descMatch = block.match(/<description>([\s\S]*?)<\/description>/);
    const description = descMatch ? descMatch[1].trim() : "";
    
    if (url) {
      articles.push({ title, url, publishedAt, description });
    }
  }
  
  return articles;
}

// Parse generic blog index page
function parseGenericBlogIndex(html, articleBaseUrl) {
  const articles = [];
  
  // Try to find article links using common patterns
  // Pattern 1: <a href="/blog/slug"> or <a href="blog/slug">
  const linkRegex = /<a[^>]+href=["']([^"']*\/(?:blog|posts|articles)\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let linkMatch;
  
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    let url = linkMatch[1];
    const linkText = linkMatch[2].replace(/<[^>]+>/g, '').trim();
    
    // If URL is relative, prepend base URL
    if (!url.startsWith('http')) {
      url = articleBaseUrl.replace(/\/$/, '') + '/' + url.replace(/^\//, '');
    }
    
    // Extract title from link text or nearby heading
    const title = linkText || '';
    
    if (url && title) {
      articles.push({ title, url, publishedAt: null, description: '' });
    }
  }
  
  // Pattern 2: Look for structured data (JSON-LD)
  const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jsonLdMatch;
  
  while ((jsonLdMatch = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(jsonLdMatch[1]);
      if (data['@type'] === 'BlogPosting' || data['@type'] === 'Article') {
        const url = data.url || '';
        const title = data.headline || data.name || '';
        const publishedAt = data.datePublished || null;
        const description = data.description || '';
        
        if (url && title) {
          articles.push({ title, url, publishedAt, description });
        }
      }
    } catch {
      // Invalid JSON, skip
    }
  }
  
  return articles;
}

// Extract content from generic article page
function extractGenericArticleContent(html) {
  let title = '';
  let author = '';
  let publishedAt = null;
  let content = '';
  
  // Try JSON-LD structured data first
  const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jsonLdMatch;
  
  while ((jsonLdMatch = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(jsonLdMatch[1]);
      if (data['@type'] === 'BlogPosting' || data['@type'] === 'Article') {
        title = data.headline || data.name || '';
        author = data.author?.name || '';
        publishedAt = data.datePublished || null;
        break;
      }
    } catch {
      // Invalid JSON, skip
    }
  }
  
  // Extract title from <h1> if not found
  if (!title) {
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match) {
      title = h1Match[1].replace(/<[^>]+>/g, '').trim();
    }
  }
  
  // Try to extract main content from common article containers
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const contentMatch = html.match(/<div[^>]+class=["'][^"']*(?:content|article|post|entry)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  
  const contentHtml = articleMatch?.[1] || mainMatch?.[1] || contentMatch?.[1] || '';
  
  if (contentHtml) {
    // Clean HTML tags and normalize whitespace
    content = contentHtml
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  // Fallback: extract from body if no content found
  if (!content) {
    content = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  return { title, author, publishedAt, content };
}

// -- News Fetching (RSS) -----------------------------------------------------

// Fetches news items from RSS feeds (Hacker News, ArXiv, TechCrunch, Reddit)
async function fetchNewsContent(newsSources, state, errors) {
  const results = [];
  const cutoff = new Date(Date.now() - NEWS_LOOKBACK_HOURS * 60 * 60 * 1000);

  for (const source of newsSources) {
    console.error(`  Processing news: ${source.name}...`);

    try {
      const rssRes = await fetch(source.rssUrl, {
        headers: { "User-Agent": RSS_USER_AGENT },
        signal: AbortSignal.timeout(15000),
      });

      if (!rssRes.ok) {
        errors.push(`News: Failed to fetch RSS for ${source.name}: HTTP ${rssRes.status}`);
        continue;
      }

      const rssXml = await rssRes.text();
      const items = parseRssNewsFeed(rssXml);
      console.error(`  ${source.name}: found ${items.length} items in RSS feed`);

      // Filter by lookback window and dedup
      const newItems = [];
      for (const item of items.slice(0, MAX_NEWS_PER_SOURCE)) {
        if (state.seenNews[item.url]) continue;
        if (item.publishedAt && new Date(item.publishedAt) < cutoff) continue;
        newItems.push(item);
        if (newItems.length >= MAX_NEWS_PER_SOURCE) break;
      }

      if (newItems.length === 0) {
        console.error(`    No new items from ${source.name}`);
        continue;
      }

      console.error(`    Found ${newItems.length} new item(s) from ${source.name}`);

      for (const item of newItems) {
        results.push({
          source: "news",
          name: source.name,
          category: source.category || "general",
          title: item.title,
          url: item.url,
          publishedAt: item.publishedAt,
          description: item.description || "",
        });
        state.seenNews[item.url] = Date.now();
      }
    } catch (err) {
      errors.push(`News: Error processing ${source.name}: ${err.message}`);
    }
  }

  return results;
}

// Parses RSS feed for news items
function parseRssNewsFeed(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let itemMatch;

  while ((itemMatch = itemRegex.exec(xml)) !== null) {
    const block = itemMatch[1];

    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    const title = titleMatch ? titleMatch[1].trim() : "";

    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
    const url = linkMatch ? linkMatch[1].trim() : "";

    const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const publishedAt = pubDateMatch ? new Date(pubDateMatch[1].trim()).toISOString() : null;

    const descMatch = block.match(/<description>([\s\S]*?)<\/description>/);
    const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "";

    if (url) {
      items.push({ title, url, publishedAt, description });
    }
  }

  return items;
}

// Main blog fetching orchestrator.
// For each blog source in the config, discovers new articles, deduplicates
// against previously seen URLs, fetches full article content, and returns
// the results for feed-blogs.json.
async function fetchBlogContent(blogs, state, errors) {
  const results = [];
  const cutoff = new Date(Date.now() - BLOG_LOOKBACK_HOURS * 60 * 60 * 1000);

  for (const blog of blogs) {
    console.error(`  Processing blog: ${blog.name}...`);
    let candidates = [];

    try {
      // 根据 fetchMethod 选择不同的解析方式
      if (blog.fetchMethod === "rss") {
        // RSS 类型的博客（如 Lilian Weng、Jay Alammar 等）
        const rssRes = await fetch(blog.indexUrl, {
          headers: { "User-Agent": "FollowBuilders/1.0 (feed aggregator)" },
        });
        if (!rssRes.ok) {
          errors.push(
            `Blog: Failed to fetch RSS for ${blog.name}: HTTP ${rssRes.status}`,
          );
          continue;
        }
        const rssXml = await rssRes.text();
        candidates = parseRssBlogFeed(rssXml, blog.articleBaseUrl);
      } else {
        // HTTP 抓取类型的博客
        const indexRes = await fetch(blog.indexUrl, {
          headers: { "User-Agent": "FollowBuilders/1.0 (feed aggregator)" },
        });
        if (!indexRes.ok) {
          errors.push(
            `Blog: Failed to fetch index for ${blog.name}: HTTP ${indexRes.status}`,
          );
          continue;
        }
        const indexHtml = await indexRes.text();

        // Use the right parser based on which blog this is
        if (blog.indexUrl.includes("anthropic.com")) {
          candidates = parseAnthropicEngineeringIndex(indexHtml);
        } else if (blog.indexUrl.includes("claude.com")) {
          candidates = parseClaudeBlogIndex(indexHtml);
        } else {
          // 通用博客解析器
          candidates = parseGenericBlogIndex(indexHtml, blog.articleBaseUrl);
        }
      }

      // Step 2: Filter to unseen articles, cap at MAX_ARTICLES_PER_BLOG.
      // Blog index pages list articles newest-first. We only consider the
      // first few entries (MAX_INDEX_SCAN) to avoid crawling the entire
      // backlog on first run. Articles with a known date must fall within
      // the lookback window; articles without dates are accepted if they
      // appear near the top of the listing (likely recent).
      const MAX_INDEX_SCAN = MAX_ARTICLES_PER_BLOG; // only look at the N most recent entries
      const newArticles = [];
      for (const article of candidates.slice(0, MAX_INDEX_SCAN)) {
        if (state.seenArticles[article.url]) continue; // already seen
        // If we have a date, check it's within the lookback window
        if (article.publishedAt && new Date(article.publishedAt) < cutoff)
          continue;
        newArticles.push(article);
        if (newArticles.length >= MAX_ARTICLES_PER_BLOG) break;
      }

      if (newArticles.length === 0) {
        console.error(`    No new articles found`);
        continue;
      }

      console.error(
        `    Found ${newArticles.length} new article(s), fetching content...`,
      );

      // Step 3: Fetch full article content for each new article
      for (const article of newArticles) {
        try {
          // Fetch the full article page
          const articleRes = await fetch(article.url, {
            headers: { "User-Agent": "FollowBuilders/1.0 (feed aggregator)" },
          });
          if (!articleRes.ok) {
            errors.push(
              `Blog: Failed to fetch article ${article.url}: HTTP ${articleRes.status}`,
            );
            continue;
          }
          const articleHtml = await articleRes.text();

          // Use the right content extractor based on the blog
          let extracted;
          if (article.url.includes("anthropic.com/engineering")) {
            extracted = extractAnthropicArticleContent(articleHtml);
          } else if (article.url.includes("claude.com/blog")) {
            extracted = extractClaudeBlogArticleContent(articleHtml);
          } else {
            // 通用内容提取器
            extracted = extractGenericArticleContent(articleHtml);
          }

          if (!extracted || !extracted.content) {
            errors.push(`Blog: No content extracted from ${article.url}`);
            continue;
          }

          // Merge extracted data with what we already have from the index
          results.push({
            source: "blog",
            name: blog.name,
            title: extracted.title || article.title || "Untitled",
            url: article.url,
            publishedAt: extracted.publishedAt || article.publishedAt || null,
            author: extracted.author || "",
            description: article.description || "",
            content: extracted.content,
          });

          // Mark as seen
          state.seenArticles[article.url] = Date.now();

          // Small delay between article fetchs to be polite
          await new Promise((r) => setTimeout(r, 500));
        } catch (err) {
          errors.push(
            `Blog: Error fetching article ${article.url}: ${err.message}`,
          );
        }
      }
    } catch (err) {
      errors.push(`Blog: Error processing ${blog.name}: ${err.message}`);
    }
  }

  return results;
}

// -- Main --------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const podcastsOnly = args.includes("--podcasts-only");
  const blogsOnly = args.includes("--blogs-only");
  const newsOnly = args.includes("--news-only");

  // If a specific --*-only flag is set, only that feed type runs.
  // If no flag is set, all three run.
  let runPodcasts = podcastsOnly || (!blogsOnly && !newsOnly);
  let runBlogs = blogsOnly || (!podcastsOnly && !newsOnly);
  let runNews = newsOnly || (!podcastsOnly && !blogsOnly);

  const pod2txtKey = process.env.POD2TXT_API_KEY;
  const sources = await loadSources();

  // POD2TXT_API_KEY 缺失时：
  //  - 小宇宙 / platform === "xiaoyuzhou" 的节目完全不依赖 pod2txt，直接用 RSS shownotes 当摘要，
  //    因此 fork 下来没有 pod2txt key 的用户依然可以稳定获得中文播客板块；
  //  - 只有英文 / 非 xiaoyuzhou 播客会被跳过（它们必须用 pod2txt 转写音频）。
  // 所以此处不再粗暴设置 runPodcasts=false，而是在 fetchPodcastContent 内部按平台分支处理。
  if (runPodcasts && !pod2txtKey) {
    const hasXiaoyuzhou = sources.podcasts?.some((p) => p.platform === "xiaoyuzhou");
    if (!hasXiaoyuzhou) {
      console.error("POD2TXT_API_KEY not set, and no xiaoyuzhou podcasts configured — skipping podcasts");
      runPodcasts = false;
    } else {
      console.warn(
        "POD2TXT_API_KEY not set — non-xiaoyuzhou podcasts will be skipped, " +
          "but xiaoyuzhou podcasts will still be ingested using RSS shownotes " +
          "(no API key required for xiaoyuzhou).",
      );
    }
  }

  const state = await loadState();
  const errors = [];

  // Fetch podcasts
  if (runPodcasts) {
    console.error("Fetching podcast content (RSS + pod2txt)...");
    const podcasts = await fetchPodcastContent(
      sources.podcasts,
      pod2txtKey,
      state,
      errors,
    );
    console.error(`  Found ${podcasts.length} new episodes`);

    const podcastFeed = {
      generatedAt: new Date().toISOString(),
      lookbackHours: PODCAST_LOOKBACK_HOURS,
      podcasts,
      stats: { podcastEpisodes: podcasts.length },
      errors:
        errors.filter((e) => e.startsWith("Podcast")).length > 0
          ? errors.filter((e) => e.startsWith("Podcast"))
          : undefined,
    };
    await writeFile(
      join(SCRIPT_DIR, "..", "feed-podcasts.json"),
      JSON.stringify(podcastFeed, null, 2),
    );
    console.error(`  feed-podcasts.json: ${podcasts.length} episodes`);
  }

  // Fetch blog posts
  if (runBlogs && sources.blogs && sources.blogs.length > 0) {
    console.error("Fetching blog content...");
    const blogContent = await fetchBlogContent(sources.blogs, state, errors);
    console.error(`  Found ${blogContent.length} new blog post(s)`);

    const blogFeed = {
      generatedAt: new Date().toISOString(),
      lookbackHours: BLOG_LOOKBACK_HOURS,
      blogs: blogContent,
      stats: { blogPosts: blogContent.length },
      errors:
        errors.filter((e) => e.startsWith("Blog")).length > 0
          ? errors.filter((e) => e.startsWith("Blog"))
          : undefined,
    };
    await writeFile(
      join(SCRIPT_DIR, "..", "feed-blogs.json"),
      JSON.stringify(blogFeed, null, 2),
    );
    console.error(`  feed-blogs.json: ${blogContent.length} posts`);
  }

  // Fetch news
  if (runNews && sources.news && sources.news.length > 0) {
    console.error("Fetching news content (RSS)...");
    const newsContent = await fetchNewsContent(sources.news, state, errors);
    console.error(`  Found ${newsContent.length} new news item(s)`);

    const newsFeed = {
      generatedAt: new Date().toISOString(),
      lookbackHours: NEWS_LOOKBACK_HOURS,
      news: newsContent,
      stats: { newsItems: newsContent.length },
      errors:
        errors.filter((e) => e.startsWith("News")).length > 0
          ? errors.filter((e) => e.startsWith("News"))
          : undefined,
    };
    await writeFile(
      join(SCRIPT_DIR, "..", "feed-news.json"),
      JSON.stringify(newsFeed, null, 2),
    );
    console.error(`  feed-news.json: ${newsContent.length} items`);
  }

  // Save dedup state
  await saveState(state);

  if (errors.length > 0) {
    console.error(`  ${errors.length} non-fatal errors`);
  }
}

main().catch((err) => {
  console.error("Feed generation failed:", err.message);
  process.exit(1);
});
