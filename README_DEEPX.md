# 雨刃 / RainyReSearch Portable

雨刃（RainyReSearch）`1.0.0` 是面向科研复现的本地 Agent 工作台。旧 `0.x` release 链不再作为当前版本线；`1.0.0` 从 RainyReSearch 重新开始。

## 使用

1. 解压 portable zip。
2. 运行 `RainyReSearch.exe`。
3. 在 `设置 -> 模型` 填写自己的模型 API key。
4. 在 `设置 -> 科研源` 按需填写 OpenAlex、Semantic Scholar、GitHub、Crossref 配置。
5. 在 `设置 -> 联网搜索` 按需填写 Brave、Tavily、Serper 或 SearXNG，让 Agent 获得更强的网页搜索能力。

本机配置、会话、日志、缓存指标、研究数据库和密钥默认都保存在应用目录的 `data/` 下。`data/secrets.local.json` 不应提交或打包进公开发行包。

## 主要目录

```text
RainyReSearch.exe
resources/
  app.asar
  app.asar.unpacked/
  rainy-research-core.exe
  rainy-research-assets/
data/
  config/
  sessions/
  cache-metrics/
  research/
    research.db
    search-history.jsonl
    repos/
    reports/
```

## 1.0.0 核心模块

- 论文雷达：AI 搭配多源论文搜索、去重和情报卡。
- 代码分析：GitHub 或本地 repo 复现审计。
- 关系图：引用、代码、方法、数据集和模块关系图。
- TrickScore：复现/可信性风险评分，不代表造假概率。
- 选题生成：在左侧 AI 研究助手中生成带来源、风险和实现步骤的研究方案。
- 服务器监控：通过 SSH 连接远端服务器，执行命令并定时巡检训练进度、GPU、磁盘和日志。

RainyReSearch 是独立项目，不是 DeepSeek 官方项目，也不是 OpenAI/Codex 官方项目。

## License

RainyReSearch 使用 `PolyForm-Noncommercial-1.0.0`。源码可以查看、学习、修改和在非商业场景中分发；未经授权不得用于商业目的。
