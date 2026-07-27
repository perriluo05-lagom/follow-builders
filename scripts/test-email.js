#!/usr/bin/env node

import { join } from 'path';
import { homedir } from 'os';
import { config as loadEnv } from 'dotenv';
import { createTransport } from 'nodemailer';
import { marked } from 'marked';

const USER_DIR = join(homedir(), '.follow-builders');
const ENV_PATH = join(USER_DIR, '.env');
loadEnv({ path: ENV_PATH });

const digestText = `# AI Builders Digest — 2026年7月27日

## 💬 X/Twitter 动态

### Thibault Sottiaux（OpenAI Codex & ChatGPT）

Thibault 分享了对 OpenAI 当前状态的乐观看法，称"氛围很强，从未见过 OpenAI 如此专注和高效"。他还介绍了 ChatGPT 的实用场景——从谈判网费到清理垃圾邮件，从找优惠到规划行程，只需一个 prompt 就能完成。他表示 ChatGPT 每天至少帮他完成 20 件事，依然令人惊讶。

https://x.com/thsottiaux/status/2081534792903147881
https://x.com/thsottiaux/status/2081444811647963244

---

### Peter Yang（AI 教程博主）

Peter 提到一个重要的用户信任问题：在加拿大与非 AI 从业者交流时，人们最关心的不是 token 不够用，而是"我是否足够信任 ChatGPT 来访问我的 Gmail、日历、Google Workspace、Microsoft Office 等数据"。

https://x.com/petergyang/status/2081555286817648738

---

### Madhu Guru（Meta AI 高级总监）

Madhu 对"AI 尚未在产品中产生实际影响"的观点提出反驳。他认为目前处于第一阶段——拥有用户渠道的公司正在快速扩展到相邻领域，AI 帮助他们快速执行并构建以前需要大量定制软件才能实现的功能。第二阶段将出现更多全新功能和创新，届时 AI 对软件生态的影响将不可否认。

https://x.com/realmadhuguru/status/2081437850466451736

---

### Amjad Masad（Replit CEO）

Amjad 分享了一个前 Anthropic 员工的爆料：黑客更倾向于使用实验室提供的大量补贴 AI 订阅来发起攻击，而不是使用开源模型。

https://x.com/amasad/status/2081576172656456076

---

### Guillermo Rauch（Vercel CEO）

Guillermo 宣布 Vercel 签署了"开放权重与美国 AI 领导力"公开信，强调开源、数据、协议和研究是技术进步的基础。他还分享了将 Vercel CLI 从 TypeScript 编译到原生的成果：二进制文件仅 1.28MB，启动时间 1.5ms，编译时间 2.94s，完全静态且无需嵌入 v8/QuickJS。

https://x.com/rauchg/status/2081546513885622760
https://x.com/rauchg/status/2081517519303737559

---

### Aaron Levie（Box CEO）

Aaron 深入分析了 AI 在企业中的应用机会。他认为大多数企业需要大量支持才能将模型突破应用到工作流程中——仅仅有智能是不够的，还需要将智能与现实世界的反馈循环连接起来。AI 在银行客户入职、法律团队合同审查、生命科学、金融服务、制造业等行业的应用方式完全不同，机会在于构建"应用层 AI"。而且模型能力越强，自动化的工作流程就越复杂，反而需要更多的应用层支持。

https://x.com/levie/status/2081491621162668207

---

### Garry Tan（Y Combinator CEO）

Garry 在 YC Startup School 2026 结束时感谢 Sam Altman 的压轴演讲，并分享了一句简洁的建议："别装，真诚点"（Don't LARP, Be earnest）。

https://x.com/garrytan/status/2081586567211348432

---

### Zara Zhang（独立 Builder）

Zara 提出两个观点：一是衡量 AI 采用度不应看消耗的 token 数量，而应看从用户需求到产品上线的时间；二是为什么有这么多 AI 教程——因为聊天产品越通用，使用起来越难，人们面对空白对话框会不知所措。

https://x.com/zarazhangrui/status/2081627581997269192
https://x.com/zarazhangrui/status/2081627109299310684

---

### Dan Shipper（Every CEO）

Dan 宣布将休假一周，撰写关于 Codex 诞生的权威历史（基于对 OpenAI 内部人士的深度采访），几周后在 Every 上发布。

https://x.com/danshipper/status/2081412243388788988

---

### Sam Altman（OpenAI CEO）

Sam 分享了 ChatGPT 的惊人能力——他在手机上发送了一个复杂请求："用我所有的聊天记录找出和 8 个朋友一起长周末旅行的想法，规划三个最佳方案，做一个全栈网站让我们 9 个人能协调想去的地方并决定去哪里，等大家达成共识后预订。在我的 Gmail 里写好邮件，等网站就绪后发给朋友们。"结果竟然全部实现了。他说："ChatGPT 的能力太了不起了，用'工作'来形容都不够。"

https://x.com/sama/status/2081396796174282900

---

## 🎙️ 播客

### OpenAI 计算负责人：我们建得还不够快 | Sachin Katti

**核心观点：** OpenAI 每年在计算上的投入约 500 亿美元，全球 AI 行业今年的计算支出预计达 7000 亿美元。Sachin 表示，需求远大于供给，任何上线的计算资源都会立即被消耗完。他们最大的担忧不是建多了，而是建得不够快。

**关键洞察：**

- **数据中心规模**：现在建的是大型超级计算机，可视为"把电子变成 token 的巨型工厂"。AI 数据中心与传统云计算数据中心的根本区别在于规模——需要液冷系统，芯片运行温度极高，连连接芯片的电缆和变压器都需要冷却。
- **电力挑战**：OpenAI 在建设数据中心时承诺不占用现有电网容量，而是投资新建发电和输电基础设施。目前主要使用燃气轮机，但核电是更理想的选择——能量密度最高且清洁。
- **Jalapeno 芯片**：OpenAI 设计这款芯片的核心指标是"每瓦产生的 token 数"，因为世界受限于电力。从设计到交付仅用了 9 个月，得益于团队经验（曾设计 Google TPU）、与 Broadcom 的合作、以及 AI 辅助芯片设计。
- **AI 设计 AI**：AI 已经开始帮助设计训练下一代 AI 所需的系统，包括芯片。以前研究人员的实验数量受限于人力，现在 AI 可以做 AI 研究，实验数量爆炸式增长，计算需求也随之激增。
- **MRC 网络协议**：新的网络协议解决了大规模集群（如 10 万个 GPU）的连接可靠性问题，通过多路径协议自动规避故障链路。

**社区影响**：Sachin 强调数据中心对当地社区是净收益——带来新的财产税用于资助学校和医院，投资升级电网基础设施，创造就业机会。

https://www.youtube.com/watch?v=wEZBlmvxx4o

---

## 📊 今日摘要

- **播客内容：** 1 集
- **X 动态：** 11 位 Builder，共 21 条推文
- **语言：** 中文

---

Generated through the Follow Builders skill: https://github.com/zarazhangrui/follow-builders`;

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
    subject: `AI Builders Digest — ${new Date().toLocaleDateString('zh-CN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    })}`,
    text: text,
    html: html
  });
}

async function main() {
  try {
    const toEmail = '1965505213@qq.com';
    console.log(`Sending test email to ${toEmail}...`);
    await sendEmail(digestText, toEmail);
    console.log('Test email sent successfully!');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
