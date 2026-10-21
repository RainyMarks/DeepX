from __future__ import annotations

import json
import os
import secrets
import shutil
import webbrowser
from pathlib import Path

import typer
import uvicorn

from atlas.admin import create_app
from atlas.builder import AUTHORIZED_DIR, RAW_DIR, build_public, refresh_public_rankings
from atlas.bulk_review import bulk_review
from atlas.collector import (
    collect_crossref_venues,
    collect_openalex,
    collect_secondary,
    refresh_crossref_dates,
)
from atlas.release import PUBLIC_DIR, repack_public
from atlas.validation import ValidationError, validate_public

app = typer.Typer(no_args_is_help=True, help="生成图像取证研究图谱数据与审核工具")


@app.command("import-authorized")
def import_authorized(source: Path | None = typer.Option(None, help="授权参考仓库根目录")) -> None:  # noqa: B008 - Typer declares options in defaults
    if source:
        AUTHORIZED_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source / "web" / "data" / "public_preview_papers.json", AUTHORIZED_DIR / "reference_papers.json")
        shutil.copy2(source / "web" / "data" / "public_preview_map_data.json", AUTHORIZED_DIR / "reference_map.json")
    missing = [name for name in ("reference_papers.json", "reference_map.json") if not (AUTHORIZED_DIR / name).exists()]
    if missing:
        raise typer.BadParameter("缺少授权种子文件：" + ", ".join(missing))
    typer.echo(json.dumps(build_public().model_dump(mode="json"), ensure_ascii=False, indent=2))


@app.command("collect-openalex")
def collect_openalex_command(max_records: int = typer.Option(12000, min=100, max=30000)) -> None:
    typer.echo(json.dumps(collect_openalex(max_records), ensure_ascii=False, indent=2))


@app.command("collect-secondary")
def collect_secondary_command(
    max_per_query: int = typer.Option(40, min=1, max=300),
    sources: str = typer.Option("crossref,arxiv,semantic_scholar,dblp"),
) -> None:
    requested = {name.strip() for name in sources.split(",") if name.strip()}
    supported = {"crossref", "arxiv", "semantic_scholar", "dblp"}
    unknown = requested - supported
    if unknown:
        raise typer.BadParameter("未知数据源：" + ", ".join(sorted(unknown)))
    typer.echo(json.dumps(collect_secondary(max_per_query, requested), ensure_ascii=False, indent=2))


@app.command("collect-crossref-venues")
def collect_crossref_venues_command(max_per_query: int = typer.Option(300, min=1, max=1000)) -> None:
    typer.echo(json.dumps(collect_crossref_venues(max_per_query), ensure_ascii=False, indent=2))


@app.command("refresh-crossref-dates")
def refresh_crossref_dates_command(limit: int = typer.Option(200, min=1, max=5000)) -> None:
    """只按 DOI 补查 Crossref 日期：候选池中缺日期字段的记录，以及候选池里没有的今年及以后的已发布论文。"""
    typer.echo(json.dumps(refresh_crossref_dates(limit), ensure_ascii=False, indent=2))


@app.command("publish")
def publish(
    fresh: bool = typer.Option(False, help="只用本地采集缓存重建，不以现有公开数据为基线"),
) -> None:
    """合并现有公开数据与新采集候选，重新分类、去重、赋级并发布。"""
    typer.echo(json.dumps(build_public(include_release=not fresh).model_dump(mode="json"), ensure_ascii=False, indent=2))


@app.command("refresh-rankings")
def refresh_rankings() -> None:
    """只更新现有公开语料的等级映射，不依赖本地采集缓存。"""
    typer.echo(json.dumps(refresh_public_rankings(), ensure_ascii=False, indent=2))


@app.command("repack-public")
def repack_public_command() -> None:
    """把现有公开数据重写为当前发布格式（venue 去重、细粒度详情分片），不重新采集。"""
    typer.echo(json.dumps(repack_public(), ensure_ascii=False, indent=2))


@app.command("collection-summary")
def collection_summary(before: int = typer.Option(0, help="发布前的论文数")) -> None:
    """输出一次采集与发布的 Markdown 摘要（供 GitHub Actions 使用）。"""
    manifest = json.loads((PUBLIC_DIR / "manifest.json").read_text(encoding="utf-8"))
    quality = json.loads((PUBLIC_DIR / "quality.json").read_text(encoding="utf-8"))
    lines = [
        "## 论文采集结果",
        "",
        f"- 公开论文：{before} → {manifest['paper_count']}（{manifest['paper_count'] - before:+d}）",
        f"- 已核验：{manifest['verified_paper_count']}；待复核：{quality.get('auto_review_count', 0)}",
        f"- 候选池：{quality.get('candidate_count', 0)}；学者：{manifest['author_count']}；机构：{manifest['institution_count']}",
        f"- 按范围规则排除：{sum(quality.get('excluded_by_scope_rules', {}).values())}",
        "",
        "| 采集报告 | 新增候选 | 错误 | 提前结束 |",
        "| --- | --- | --- | --- |",
    ]
    for name in ("openalex_report.json", "secondary_report.json", "crossref_venue_report.json"):
        path = RAW_DIR / name
        if not path.exists():
            lines.append(f"| {name} | 未运行 | | |")
            continue
        report = json.loads(path.read_text(encoding="utf-8"))
        stopped = report.get("stopped_early") or ""
        if isinstance(stopped, dict):
            stopped = ", ".join(f"{key}: {value}" for key, value in stopped.items())
        lines.append(f"| {name} | {report.get('new_records', 0)} | {len(report.get('errors', []))} | {stopped or '否'} |")
    typer.echo("\n".join(lines))


@app.command("bulk-review")
def bulk_review_command() -> None:
    """快速完成剩余公开记录的范围与稳定来源初筛，然后统一发布。"""
    result = bulk_review()
    manifest = build_public()
    typer.echo(json.dumps({"review": result, "manifest": manifest.model_dump(mode="json")}, ensure_ascii=False, indent=2))


@app.command("validate-public")
def validate_public_command(strict: bool = typer.Option(False, help="启用 2000/1000/300 发布门禁")) -> None:
    try:
        typer.echo(json.dumps(validate_public(strict), ensure_ascii=False, indent=2))
    except ValidationError as exc:
        typer.echo(f"验证失败：{exc}", err=True)
        raise typer.Exit(1)


@app.command("admin")
def admin(port: int = typer.Option(8765, min=1024, max=65535), no_browser: bool = typer.Option(False)) -> None:
    token = os.getenv("ATLAS_ADMIN_TOKEN") or secrets.token_urlsafe(24)
    url = f"http://127.0.0.1:{port}/?token={token}"
    typer.echo("本地审核台：" + url)
    if not no_browser:
        webbrowser.open(url)
    uvicorn.run(create_app(token), host="127.0.0.1", port=port, log_level="info")


if __name__ == "__main__":
    app()
