# Follow Builders Manager Skill

## 基本信息
- **名称**: follow-builders-manager
- **描述**: 管理 follow-builders 项目的信息源、API keys、邮件配置和项目状态
- **版本**: 1.0.0
- **作者**: AI Assistant

## 触发条件
当用户输入以下关键词时触发：
- "管理 follow-builders"
- "配置信息源"
- "添加 X builder"
- "删除播客"
- "修改博客"
- "查看项目状态"
- "配置 API key"
- "设置邮件"
- "查看运行日志"
- "follow-builders 配置"

## 工具需求
- `read_file`: 读取配置文件
- `write_to_file`: 写入配置文件
- `execute_command`: 执行 git 命令和脚本
- `search_files`: 搜索配置内容

## 配置文件路径
- 信息源配置: `config/default-sources.json`
- 邮件配置: `~/.follow-builders/config.json`
- 环境变量: `~/.follow-builders/.env`
- 项目状态: `digest-state.json`, `feed-x.json`, `feed-podcasts.json`, `feed-blogs.json`

## 执行流程

### 1. 管理信息源配置

#### 1.1 查看当前信息源
```
读取 config/default-sources.json
展示：
- X builders 列表（当前 20 位）
- 播客列表（当前 11 个小宇宙播客）
- 博客列表（当前 12 个）
```

#### 1.2 添加 X Builder
```
1. 询问用户要添加的 builder 信息：
   - name: 显示名称
   - handle: X 用户名（不含 @）
2. 读取 config/default-sources.json
3. 在 x_accounts 数组中添加新条目
4. 写回配置文件
5. 提示用户提交更改到 GitHub
```

#### 1.3 删除 X Builder
```
1. 展示当前所有 X builders
2. 询问用户要删除的 builder
3. 读取 config/default-sources.json
4. 从 x_accounts 数组中移除对应条目
5. 写回配置文件
6. 提示用户提交更改到 GitHub
```

#### 1.4 添加播客
```
1. 询问用户播客信息：
   - name: 播客名称
   - rssUrl: RSS 订阅地址
   - url: 播客页面链接
   - platform: 平台（如 "xiaoyuzhou"）
2. 读取 config/default-sources.json
3. 在 podcasts 数组中添加新条目
4. 写回配置文件
5. 提示用户提交更改到 GitHub
```

#### 1.5 删除播客
```
1. 展示当前所有播客
2. 询问用户要删除的播客
3. 读取 config/default-sources.json
4. 从 podcasts 数组中移除对应条目
5. 写回配置文件
6. 提示用户提交更改到 GitHub
```

#### 1.6 添加博客
```
1. 询问用户博客信息：
   - name: 博客名称
   - type: 类型（"scrape" 或 "rss"）
   - indexUrl: 索引页 URL
   - articleBaseUrl: 文章基础 URL
   - fetchMethod: 抓取方式（"http" 或 "rss"）
2. 读取 config/default-sources.json
3. 在 blogs 数组中添加新条目
4. 写回配置文件
5. 提示用户提交更改到 GitHub
```

### 2. 管理 API Keys

#### 2.1 查看当前 API Keys 状态
```
1. 检查 ~/.follow-builders/.env 文件
2. 展示已配置的 keys（不显示完整值）：
   - X_BEARER_TOKEN: ✓ 已配置 / ✗ 未配置
   - POD2TXT_API_KEY: ✓ 已配置 / ✗ 未配置
   - SMTP_SERVER: ✓ 已配置 / ✗ 未配置
   - SMTP_USERNAME: ✓ 已配置 / ✗ 未配置
```

#### 2.2 配置 X_BEARER_TOKEN
```
1. 提供获取步骤：
   - 访问 https://developer.x.com/
   - 申请开发者账号
   - 创建 Project 和 App
   - 获取 Bearer Token
2. 询问用户输入 token
3. 读取或创建 ~/.follow-builders/.env
4. 添加或更新 X_BEARER_TOKEN
5. 写回文件
6. 提示用户同步到 GitHub Secrets
```

#### 2.3 配置 POD2TXT_API_KEY
```
1. 提供获取步骤：
   - 访问 https://pod2txt.vercel.app/
   - 注册账号获取 API key
2. 询问用户输入 key
3. 读取或创建 ~/.follow-builders/.env
4. 添加或更新 POD2TXT_API_KEY
5. 写回文件
6. 提示用户同步到 GitHub Secrets
```

#### 2.4 配置 SMTP 邮件
```
1. 询问用户邮件配置：
   - SMTP_SERVER: SMTP 服务器地址
   - SMTP_PORT: SMTP 端口
   - SMTP_USERNAME: 邮箱地址
   - SMTP_PASSWORD: 邮箱密码/应用密码
   - SMTP_SENDER: 发件人邮箱
   - SMTP_RECIPIENTS: 收件人邮箱
2. 读取或创建 ~/.follow-builders/.env
3. 添加或更新所有 SMTP 配置
4. 写回文件
5. 提示用户同步到 GitHub Secrets
```

### 3. 管理邮件配置

#### 3.1 查看邮件配置
```
1. 读取 ~/.follow-builders/config.json
2. 展示当前配置：
   - 语言
   - 发送频率
   - 发送时间
   - 时区
   - 发送方式
   - 收件邮箱
   - 是否发送空内容通知
```

#### 3.2 修改邮件配置
```
1. 询问用户要修改的配置项
2. 读取 ~/.follow-builders/config.json
3. 更新对应配置
4. 写回文件
```

### 4. 查看项目状态

#### 4.1 查看 Feed 状态
```
1. 读取 feed-x.json, feed-podcasts.json, feed-blogs.json
2. 展示：
   - 最后更新时间
   - 内容数量（推文数、播客数、博客数）
   - 错误信息（如果有）
```

#### 4.2 查看去重状态
```
1. 读取 digest-state.json
2. 展示：
   - 上次发送时间
   - 已发送的内容 ID 数量
   - 各类型内容的最后更新时间
```

#### 4.3 查看 GitHub Actions 状态
```
1. 执行 git log 查看最近提交
2. 展示最近的 workflow 运行状态
```

### 5. 查看运行日志

#### 5.1 查看本地运行日志
```
1. 执行本地脚本测试：
   cd scripts && node auto-digest.js
2. 展示运行输出和错误信息
```

#### 5.2 查看 GitHub Actions 日志
```
1. 提供 GitHub Actions 链接：
   https://github.com/{username}/follow-builders/actions
2. 指导用户如何查看云端运行日志
```

## 注意事项

1. **配置文件修改后**：提醒用户需要提交到 GitHub 才能生效
2. **API Keys 安全**：提醒用户不要将 .env 文件提交到版本控制
3. **GitHub Secrets 同步**：API keys 需要同步到 GitHub Secrets 才能在 Actions 中使用
4. **信息源验证**：添加新信息源时，建议先测试是否能正常抓取
5. **备份配置**：重要修改前建议备份配置文件

## 示例对话

**用户**: "帮我添加一个 X builder"
**AI**: "好的，请提供 builder 的信息：
1. 显示名称（如：Andrej Karpathy）
2. X 用户名（不含 @，如：karpathy）"

**用户**: "查看当前项目状态"
**AI**: "让我查看一下当前状态...
- X 推文：最后更新于 2026-07-27，共 21 条
- 播客：最后更新于 2026-08-24，共 1 集
- 博客：最后更新于 2026-08-24，共 0 篇
- 上次邮件发送：2026-08-24 09:00"

**用户**: "配置 X_BEARER_TOKEN"
**AI**: "配置 X_BEARER_TOKEN 需要以下步骤：
1. 访问 https://developer.x.com/
2. 用你的 X 账号登录
3. 申请开发者账号（用途写：Personal AI news aggregation）
4. 创建 Project 和 App
5. 在 Keys and Tokens 页面复制 Bearer Token

请提供你的 Bearer Token，我会帮你配置到本地环境变量。"
