# 等级数据导入约束

公开仓库只内置可公开核验的 CCF 会议目录映射。期刊分区需要维护者在本地审核后台导入其有权使用的数据，原始导入文件不会发布到 GitHub Pages。

CSV 必填列：

```text
venue_name,short_name,venue_type,system,level,category,is_top,version,source_url,verified_at
```

- `CCF`：`venue_type=conference`，`level=A|B|C`，并保留官方目录版本。
- `CAS`：`venue_type=journal`，仅接受最后官方版 `version=2025`，`level=1|2|3|4`；`is_top` 只对该体系有效。
- `JCR`：`venue_type=journal`，当前接受 `version=2026`，`level=Q1|Q2|Q3|Q4`。
- 不接受“新锐期刊分区”或 `xr-ranking` 来源。
- 名称或期刊类型无法可靠匹配时不自动赋级；同一篇论文可以分别显示 CAS 与 JCR，但不得合成为虚构的统一等级。

导入完成后必须执行：

```powershell
python -m atlas.cli publish
python -m atlas.cli validate-public
```
