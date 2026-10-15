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

# 不重新采集，仅把现有公开数据重写为当前发布格式
python -m atlas.cli repack-public

# 发布前门禁
python -m atlas.cli validate-public --strict
```

公开数据区分 `verified`（人工核验）、`auto`（自动收录待复核）和 `rejected`。任何自动流程都不能生成 `verified` 状态。

严格门禁同时检查 2,000 条候选、1,000 篇公开论文和 300 篇人工核验。前两项可由数据管线完成；人工核验未达标时命令会如实失败，不能用自动记录补足。

## 公共站

公共站包含五个视图，筛选条件、排序和打开的论文/学者都会写入 URL，可直接分享：

- **概览**：研究方向卡片（含近 16 年趋势）、年度发表趋势、高被引论文、主要发表渠道、活跃机构与国家/地区，统计随当前筛选范围变化。
- **论文库**：分面筛选（研究方向、年份、渠道类型、CCF/中科院/JCR 等级、贡献类型、国家/地区、来源），每个选项显示选中后的结果数；支持排序与 CSV/BibTeX/JSON 导出。
- **学者 / 机构**：按当前筛选范围统计；学者档案包含方向分布、年度产出、署名机构与合作者。
- **研究地图**：机构聚类与合作连线，点击节点查看区域论文。

支持浅色/深色模式；按 `/` 聚焦搜索框。

## 公开数据格式

`web/public/data/v1/` 由 `atlas/release.py` 统一读写（schema 2.0.0）：

- `catalog.json`：`{"venues": [...], "authors": [...], "papers": [...]}`。每个发表渠道（含等级徽章）与作者只存一次，论文通过 `venue_id` 和作者下标引用。
- `details/<xx>.json`：完整论文记录，按论文 ID 末两位十六进制分为 256 片，打开一篇论文只需下载约 70 KB。
- `authors.json`：合并重复身份后的作者索引；`author_aliases.json` 记录每个被合并的旧 ID、合并目标与证据。
- `institutions.json`、`stats.json`、`quality.json`、`manifest.json`。

### 作者身份合并

OpenAlex 与 Semantic Scholar 提供作者 ID，而 Crossref、DBLP、arXiv 和种子数据只有姓名，同一位学者因此常以多个 ID 出现。发布时 `atlas/identity.py` 只在强证据下合并：相同 ORCID；或姓名规范化后相同且共享作者署名机构；或姓名相同且至少有两位相同合作者。若合并后会出现两个不同 ORCID，或两个 ID 署名在同一篇论文上，则拒绝合并；仅凭同名绝不合并。

维护者可在 [`data/curated/author_identity.json`](data/curated/author_identity.json) 中强制合并（`merge`）或禁止合并（`separate`）指定 ID 对。旧的 `?author=` 链接会通过别名表自动跳转到合并后的学者档案。

公共站首屏只加载 `manifest.json`、`stats.json`、`catalog.json`、`institutions.json`；地图（Leaflet）按需加载。

## 项目结构

- `web/`：React、TypeScript、Vite 公共站。
- `atlas/`：多源采集、数据规范化、审核后台和静态导出（`release.py` 负责公开数据格式）。
- `data/authorized/`：经授权导入的种子数据。
- `data/curated/`：可审计的人工决定和 venue 等级。
- `web/public/data/v1/`：公开站读取的确定性导出。

## 数据边界

收录范围限定为图像取证。纯 OCR、只使用合成图像训练下游任务、普通相机型号归因，以及音频、视频、文本隐写和纯文本生成检测不属于本图谱。

等级口径严格分离：CCF 只用于会议；公开筛选中的中科院分区固定为 2025 最后官方版“大类分区”，并与 JCR 2026 分开显示。每条期刊事实均逐刊核验、带来源链接；维护者也可导入其有权使用的补充数据，但不得把中科院小类分区混入公开筛选。项目明确拒绝“新锐期刊分区”。缺失时显示“暂无可靠等级数据”，不会推测，也不会抓取或公开再分发受限的完整分区表。逐刊结果和 TCSVT 历史口径说明见 [`data/curated/JOURNAL_RANKING_AUDIT.md`](data/curated/JOURNAL_RANKING_AUDIT.md)。

## 许可与来源

本仓库中新编写的软件代码使用 MIT License。文献元数据仍受各来源条款约束；详见 [DATA_NOTICE.md](DATA_NOTICE.md)。
