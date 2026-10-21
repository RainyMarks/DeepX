# 等级数据导入约束

公开仓库内置可公开核验的 CCF 会议目录映射，以及一小组逐刊核验、带来源链接的高频核心期刊分区事实。其他期刊分区需要维护者在本地审核后台导入其有权使用的数据，原始导入文件不会发布到 GitHub Pages。

`journal_rankings.json` 不包含或再分发完整中科院/JCR 表；每条公开映射必须保留版本、核验日期和可访问的逐刊来源页。

只刷新仓库现有公开语料的等级映射可运行 `python -m atlas.cli refresh-rankings`。该命令不会在缺少本地采集缓存时缩减论文库。

CSV 必填列：

```text
venue_name,short_name,venue_type,system,level,category,scope,is_top,version,source_url,verified_at
```

- `CCF`：`venue_type=conference`，`level=A|B|C`，并保留官方目录版本。
- `CAS`：`venue_type=journal`，仅接受最后官方版 `version=2025`，`level=1|2|3|4`，公开筛选必须使用 `scope=大类`；小类数据不得混入；`is_top` 只对该体系有效。
- `JCR`：`venue_type=journal`，当前接受 `version=2026`，`level=Q1|Q2|Q3|Q4`。
- 不接受“新锐期刊分区”或 `xr-ranking` 来源。
- 名称或期刊类型无法可靠匹配时不自动赋级；同一篇论文可以分别显示 CAS 与 JCR，但不得合成为虚构的统一等级。

## CCF 会议核验记录

`venue_rankings.json` 的 CCF 等级只取第七版目录，即 CCF 官网“CCF推荐国际学术刊物目录”页面发布的《第七版中国计算机学会推荐国际学术会议和期刊目录（正式版）》PDF，封面标题为“中国计算机学会推荐国际学术会议和期刊目录（2026年）”。

| 会议 | 等级 | 领域 | PDF 页码 | 核验日期 |
| --- | --- | --- | --- | --- |
| ICASSP | B | 计算机图形学与多媒体 | 48 | 2026-10-21 |
| ICME | B | 计算机图形学与多媒体 | 48 | 2026-10-21 |
| ICIP | C | 计算机图形学与多媒体 | 49 | 2026-10-21 |
| IH&MMSec | C | 网络与信息安全 | 22 | 2026-10-21 |

匹配规则：

- 渠道名先解码 HTML 实体（`IH&amp;MMSec` 按 `IH&MMSec` 匹配）。
- 会议全称可以嵌在论文集标题中，但全称之外只能是年份、届次、Proceedings、出版社名或该会议缩写；“International Conference on Image Processing, Computer Vision and Machine Learning”不是 ICIP。
- 名称含 workshop/workshops/findings/companion 的渠道不继承主会等级，除非已收录会议的名称本身就含这个词（如 IH&MMSec）。

导入完成后必须执行：

```powershell
python -m atlas.cli publish
python -m atlas.cli validate-public
```
