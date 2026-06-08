# 雨刃 / RainyReSearch

雨刃（RainyReSearch）`1.0.0` 是面向科研复现与研究开发的本地 Agent 工作台。当前版本从 `1.0.0` 重新开始，旧 `0.x` release 链只作为历史产物保留，不参与当前更新线。

核心目标不是做一个通用聊天壳，而是把论文搜索、AI 研究对话、代码复现、服务器监控、论文情报卡、关系图和代码分析放进一个可落地的科研闭环里。它保留多 provider、用户自填 API key、工作区、终端、权限模式、缓存指标和本地 JSONL trace 能力。

## 1.0.0 模块

- 论文雷达：默认由 AI 搭配 OpenAlex、Semantic Scholar、Crossref、arXiv、GitHub 和强联网搜索一起检索；只记录用户搜索历史，不把所有文献灌进本地数据库。
- 代码分析：审计 GitHub repo 或本地 repo 的 README、依赖、train/eval/inference、dataset、checkpoint、config、硬编码路径和 issue 信号。
- TrickScore：输出复现/可信性风险，不输出“造假概率”，每个判断都保留 evidence。
- 关系图：构建论文、代码、方法、数据集和技术模块关系图。
- 选题生成：在左侧 AI 研究助手中生成研究方案、消融计划和可交给 Agent 的开发任务。
- 服务器监控：左侧提供 SSH 连接、远端命令和定时巡检入口，可用于论文训练进度、GPU、磁盘和日志监控。

ResultForge 暂不在 `1.0.0` UI 暴露，后续版本再补完整模块。

## 配置与数据

首次启动后进入 `设置 -> 模型` 填写自己的模型 API key。科研源可在 `设置 -> 科研源` 填写：

- OpenAlex API key
- Semantic Scholar API key
- GitHub token
- Crossref mailto

强联网搜索可在 `设置 -> 联网搜索` 填写 Brave、Tavily、Serper 或 SearXNG。没有 key 时会明确降级，仍可使用 arXiv、Crossref 公开能力和公开搜索兜底。密钥保存在本机 `data/secrets.local.json`，不会进入发行包。

研究数据独立保存在：

```text
data/research/
  research.db
  search-history.jsonl
  repos/
  reports/
```

旧聊天会话仍可读取；研究数据不会覆盖旧会话目录。

## 本地开发

需要 Windows、PowerShell、Rust、Node.js、npm 和 Python。

```powershell
cargo test --manifest-path core/Cargo.toml
node --check electron/main.js electron/preload.js electron/renderer/app.js
npm run package
npm run zip
npm run check:self-contained
```

发行产物：

- `RainyReSearch.exe`
- `resources/rainy-research-core.exe`
- `resources/app.asar`
- `resources/rainy-research-assets/`
- `dist/RainyReSearch-portable-v1.0.0.zip`

## 安全边界

RainyReSearch 的本地文件工具默认限制在用户选择的工作区内，发行包不包含本机密钥、历史会话、缓存指标、绝对用户路径或上游 shell-only 文件。

## License

本项目使用 `PolyForm-Noncommercial-1.0.0`。源码可以查看、学习、修改和在非商业场景中分发；未经授权不得用于商业目的。
