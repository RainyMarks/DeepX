# 生成图像取证研究图谱

生成图像取证研究图谱（Synthetic Image Forensics Atlas）是一个中文学术地图，聚合 AI 生成图像检测、来源溯源、深度伪造、图像篡改定位、场景文本图像伪造、图像隐写分析、数字图像水印和内容凭证研究。公开站部署为纯静态 GitHub Pages，本地审核台负责采集、去重、核验与发布。

## 快速开始

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
npm --prefix web install
python -m atlas.cli validate-public
npm --prefix web run dev
```

启动本地中文审核台：

```powershell
python -m atlas.cli admin
```

终端会打印带随机令牌的本地地址。审核台仅监听 `127.0.0.1`，原始抓取数据、密钥和 SQLite 均不会进入公开站。

## 数据工作流

```powershell
# 导入已获授权的研究地图公开数据
python -m atlas.cli import-authorized

# 从 OpenAlex 扩充候选池（其他来源适配器位于 atlas/sources）
python -m atlas.cli collect-openalex --max-records 5000

# 从 Crossref、arXiv、Semantic Scholar、DBLP 交叉补充
python -m atlas.cli collect-secondary --max-per-query 40

# 合并、去重、分类并生成 web/public/data/v1
python -m atlas.cli publish

# 发布前门禁
python -m atlas.cli validate-public --strict
```

公开数据区分 `verified`（人工核验）、`auto`（自动收录待复核）和 `rejected`。任何自动流程都不能生成 `verified` 状态。

严格门禁同时检查 2,000 条候选、1,000 篇公开论文和 300 篇人工核验。前两项可由数据管线完成；人工核验未达标时命令会如实失败，不能用自动记录补足。

## 项目结构

- `web/`：React、TypeScript、Vite 公共站。
- `atlas/`：多源采集、数据规范化、审核后台和静态导出。
- `data/authorized/`：经授权导入的种子数据。
- `data/curated/`：可审计的人工决定和 venue 等级。
- `web/public/data/v1/`：公开站读取的确定性导出。

## 数据边界

收录范围限定为图像取证。纯 OCR、只使用合成图像训练下游任务、普通相机型号归因，以及音频、视频、文本隐写和纯文本生成检测不属于本图谱。

等级口径严格分离：CCF 只用于会议；公开筛选中的中科院分区固定为 2025 最后官方版“大类分区”，并与 JCR 2026 分开显示。每条期刊事实均逐刊核验、带来源链接；维护者也可导入其有权使用的补充数据，但不得把中科院小类分区混入公开筛选。项目明确拒绝“新锐期刊分区”。缺失时显示“暂无可靠等级数据”，不会推测，也不会抓取或公开再分发受限的完整分区表。逐刊结果和 TCSVT 历史口径说明见 [`data/curated/JOURNAL_RANKING_AUDIT.md`](data/curated/JOURNAL_RANKING_AUDIT.md)。

## 许可与来源

本仓库中新编写的软件代码使用 MIT License。文献元数据仍受各来源条款约束；详见 [DATA_NOTICE.md](DATA_NOTICE.md)。
