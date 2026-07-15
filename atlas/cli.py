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
from atlas.builder import AUTHORIZED_DIR, build_public
from atlas.bulk_review import bulk_review
from atlas.collector import collect_openalex, collect_secondary
from atlas.validation import ValidationError, validate_public


app = typer.Typer(no_args_is_help=True, help="生成图像取证研究图谱数据与审核工具")


@app.command("import-authorized")
def import_authorized(source: Path | None = typer.Option(None, help="授权参考仓库根目录")) -> None:
    if source:
        AUTHORIZED_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source / "web" / "data" / "public_preview_papers.json", AUTHORIZED_DIR / "reference_papers.json")
        shutil.copy2(source / "web" / "data" / "public_preview_map_data.json", AUTHORIZED_DIR / "reference_map.json")
    missing = [name for name in ("reference_papers.json", "reference_map.json") if not (AUTHORIZED_DIR / name).exists()]
    if missing:
        raise typer.BadParameter("缺少授权种子文件：" + ", ".join(missing))
    typer.echo(json.dumps(build_public().model_dump(mode="json"), ensure_ascii=False, indent=2))


@app.command("collect-openalex")
def collect_openalex_command(max_records: int = typer.Option(3200, min=100, max=10000)) -> None:
    typer.echo(json.dumps(collect_openalex(max_records), ensure_ascii=False, indent=2))


@app.command("collect-secondary")
def collect_secondary_command(max_per_query: int = typer.Option(40, min=1, max=300)) -> None:
    typer.echo(json.dumps(collect_secondary(max_per_query), ensure_ascii=False, indent=2))


@app.command("publish")
def publish() -> None:
    typer.echo(json.dumps(build_public().model_dump(mode="json"), ensure_ascii=False, indent=2))


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
