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

# 采集候选（写入本地候选池 data/raw，不入库）
python -m atlas.cli collect-openalex --max-records 12000          # OpenAlex 主检索
python -m atlas.cli collect-secondary --max-per-query 40          # Crossref、arXiv、Semantic Scholar、DBLP 交叉补充
python -m atlas.cli collect-crossref-venues --max-per-query 200   # Crossref 按重点会议/期刊定向检索

# 增量发布：以现有公开数据为基线合并新候选，统一重新分类、去重、赋级
python -m atlas.cli publish

# 全量重建：只用本地候选池与授权种子，不以现有公开数据为基线
python -m atlas.cli publish --fresh

# 不重新采集：只刷新等级徽章 / 只把现有公开数据重写为当前发布格式
python -m atlas.cli refresh-rankings
python -m atlas.cli repack-public

# 发布前门禁
python -m atlas.cli validate-public --strict
```

公开数据区分 `verified`（人工核验）、`auto`（自动收录待复核）和 `rejected`。任何自动流程都不能生成 `verified` 状态。

严格门禁同时检查 2,000 条候选、1,000 篇公开论文和 300 篇人工核验。前两项可由数据管线完成；人工核验未达标时命令会如实失败，不能用自动记录补足。

### 增量发布与 `--fresh`

`publish` 以当前 `web/public/data/v1` 为基线，与本地候选池 `data/raw` 中的新候选和授权种子合并后重写整个发布：

- 每次发布都对全部论文（包括基线里的旧记录）重新执行范围与研究方向分类、贡献类型判断、渠道类型推断和等级匹配，因此修改分类规则或等级表后直接 `publish` 即可生效。逐条人工核验的论文不会被范围规则移除；被新规则排除的论文按原因计入 `quality.json` 的 `excluded_by_scope_rules`。
- 去重依次使用 DOI、arXiv ID、OpenAlex ID、标题+年份；同名的预印本与正式版合并，保留正式渠道、年份与 DOI；不同正式渠道（如 workshop 论文与期刊扩展版）不合并；同一作品的多条正式记录取较早年份。模糊标题不自动合并。
- 候选池缺失时（新克隆的仓库、只改了规则）论文库不会缩小：基线记录全部保留并按新规则重算，候选池规模沿用 `quality.json` 中上次的记录。

`publish --fresh` 不读取现有公开数据，只用 `data/raw` 和授权种子重建，并重新开始作者别名历史（删除 `author_aliases.json`，旧的 `?author=` 合并跳转随之失效）。只在本地候选池完整时使用，否则论文库会缩小到候选池覆盖的范围。

### GitHub Actions 采集工作流

[`.github/workflows/collect.yml`](.github/workflows/collect.yml)（Actions 页面中的 **Collect papers**）手动触发，在 GitHub 的运行器上完成采集与发布：

1. 从 Actions 缓存恢复候选池 `data/raw`；无论成败，采集结束后都会存回缓存，候选池从不提交到仓库。
2. 依次运行 OpenAlex、Crossref/arXiv/Semantic Scholar/DBLP、Crossref 定向检索。请求遇到 429、5xx 或断连时指数退避重试（`Retry-After` 超过 60 秒视为配额耗尽，不再等待）；同一来源连续 5 次失败即停止该来源，不拖累其他来源；到达时间预算后各采集器保存已得结果并结束。单个采集步骤失败不阻断后续发布。
3. 运行 `publish`（增量发布），`validate-public`、`ruff check`、`pytest` 全部通过后才提交 `web/public/data/v1` 并推送。
4. 发布前后的论文数、各采集器新增候选与错误数写入 Job Summary，采集报告作为 `collection-reports` artifact 上传。

| 输入 | 默认值 | 说明 |
| --- | --- | --- |
| `target_branch` | 空 | 推送目标分支；留空推回触发分支，填写新名称会新建分支 |
| `openalex_records` | 12000 | OpenAlex 查询预算（记录数） |
| `secondary_per_query` | 40 | Crossref/arXiv/Semantic Scholar/DBLP 每个查询的结果数 |
| `secondary_sources` | `crossref,arxiv,semantic_scholar,dblp` | 交叉补充的数据源 |
| `venue_rows` | 200 | Crossref 定向检索每个查询的行数 |
| `time_budget_minutes` | 100 | 采集时间预算 |

可选仓库 secrets：`CROSSREF_MAILTO`（Crossref polite pool）、`OPENALEX_API_KEY`、`SEMANTIC_SCHOLAR_API_KEY`。未配置时 OpenAlex、Semantic Scholar 和 arXiv 很容易返回 429 并被提前停止，Crossref 通常不受影响。

工作流检出的是触发时刻的分支。运行期间如果分支有新提交，最后的推送会因非快进被拒绝；这时在最新分支上重新运行，或把 `target_branch` 设为新分支、再合并回来。拉取工作流提交的数据后，可在本地运行 `python -m atlas.cli publish` 与 `python -m atlas.cli validate-public` 确认结果可复现。

## 公共站

公共站包含五个视图，筛选条件、排序和打开的论文/学者都会写入 URL，可直接分享：

- **概览**：研究方向卡片（含近 16 年趋势）、年度发表趋势、高被引论文、主要发表渠道、活跃机构与国家/地区，统计随当前筛选范围变化。
- **论文库**：分面筛选（研究方向、年份、渠道类型、CCF/中科院/JCR 等级、贡献类型、国家/地区、来源），每个选项显示选中后的结果数；支持排序与 CSV/BibTeX/JSON 导出。论文条目可就地展开，按需从详情分片加载完整摘要，并列出全部作者、署名机构与链接。筛选分组标题显示该组已生效的筛选数，展开/收起状态保存在浏览器中；桌面端可整体收起筛选栏。
- **学者 / 机构**：按当前筛选范围统计；学者档案包含方向分布、年度产出、署名机构与合作者，论文列表默认显示 12 篇，可展开全部。
- **研究地图**：机构聚类与合作连线，点击节点查看区域论文（先列 6 个机构，论文分批“显示更多”）；手机端为可折叠的底部面板，初始视野以论文加权经度为中心。

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

等级口径严格分离：CCF 只用于会议，只取第七版（2026）目录，会议全称嵌在论文集标题中时，全称之外只能是年份、届次、Proceedings、出版社名或该会议缩写，workshop、findings、companion 不继承主会等级（核验记录与匹配规则见 [`data/curated/RANKING_IMPORT.md`](data/curated/RANKING_IMPORT.md)）；公开筛选中的中科院分区固定为 2025 最后官方版“大类分区”，并与 JCR 2026 分开显示。每条期刊事实均逐刊核验、带来源链接；维护者也可导入其有权使用的补充数据，但不得把中科院小类分区混入公开筛选。项目明确拒绝“新锐期刊分区”。缺失时显示“暂无可靠等级数据”，不会推测，也不会抓取或公开再分发受限的完整分区表。逐刊结果和 TCSVT 历史口径说明见 [`data/curated/JOURNAL_RANKING_AUDIT.md`](data/curated/JOURNAL_RANKING_AUDIT.md)。

## 许可与来源

本仓库中新编写的软件代码使用 MIT License。文献元数据仍受各来源条款约束；详见 [DATA_NOTICE.md](DATA_NOTICE.md)。
