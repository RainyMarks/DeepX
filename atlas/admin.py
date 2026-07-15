from __future__ import annotations

import csv
import io
import json
import os
import secrets
from pathlib import Path

from fastapi import BackgroundTasks, Depends, FastAPI, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from atlas.builder import CURATED_DIR, PUBLIC_DIR, build_public
from atlas.collector import collect_openalex, collect_secondary
from atlas.db import connect
from atlas.models import ReviewDecision, utc_now
from atlas.validation import ValidationError, validate_public


ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = Jinja2Templates(directory=str(ROOT / "atlas" / "templates"))


def create_app(token: str | None = None) -> FastAPI:
    admin_token = token or os.getenv("ATLAS_ADMIN_TOKEN") or secrets.token_urlsafe(24)
    app = FastAPI(title="生成图像取证研究图谱审核台", docs_url=None, redoc_url=None)
    app.state.admin_token = admin_token

    async def authorized(request: Request) -> str:
        supplied = request.query_params.get("token") or request.cookies.get("atlas_admin_token")
        if not secrets.compare_digest(supplied or "", app.state.admin_token):
            raise HTTPException(status_code=403, detail="审核令牌无效")
        return supplied

    def load_state() -> tuple[dict, list[dict]]:
        manifest = json.loads((PUBLIC_DIR / "manifest.json").read_text(encoding="utf-8")) if (PUBLIC_DIR / "manifest.json").exists() else {}
        catalog = json.loads((PUBLIC_DIR / "catalog.json").read_text(encoding="utf-8")) if (PUBLIC_DIR / "catalog.json").exists() else []
        return manifest, catalog

    @app.get("/", response_class=HTMLResponse)
    async def dashboard(request: Request, _: str = Depends(authorized), q: str = "", status: str = "auto"):
        manifest, catalog = load_state()
        filtered = [item for item in catalog if (not status or item.get("review_status") == status) and (not q or q.lower() in item.get("title", "").lower())]
        response = TEMPLATES.TemplateResponse(request, "admin.html", {"manifest": manifest, "papers": filtered[:120], "q": q, "status": status, "token": app.state.admin_token})
        response.set_cookie("atlas_admin_token", app.state.admin_token, httponly=True, samesite="strict")
        return response

    @app.post("/review/{paper_id}")
    async def review(request: Request, paper_id: str, status: str = Form(...), note: str = Form(""), _: str = Depends(authorized)):
        if status not in {"verified", "auto", "rejected"}:
            raise HTTPException(400, "非法审核状态")
        decision = ReviewDecision(paper_id=paper_id, status=status, reviewer="local_maintainer", note=note)
        path = CURATED_DIR / "review_decisions.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        existing = []
        if path.exists():
            existing = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
        existing = [item for item in existing if item.get("paper_id") != paper_id]
        existing.append(decision.model_dump(mode="json"))
        path.write_text("".join(json.dumps(item, ensure_ascii=False) + "\n" for item in existing), encoding="utf-8")
        with connect() as db:
            db.execute("INSERT INTO review_events(paper_id,status,reviewer,note,decided_at) VALUES(?,?,?,?,?)", (paper_id, status, decision.reviewer, note, decision.decided_at))
        build_public()
        return RedirectResponse(url=f"/?token={app.state.admin_token}&status=auto", status_code=303)

    def run_job(kind: str) -> None:
        started_at = utc_now()
        status = "succeeded"
        message = ""
        try:
            if kind == "collect":
                collect_openalex(3200)
                collect_secondary(30)
                build_public()
            elif kind == "publish":
                build_public()
                validate_public(False)
        except Exception as exc:
            status = "failed"
            message = str(exc)[:500]
        finally:
            with connect() as db:
                db.execute(
                    "INSERT INTO jobs(kind,status,message,created_at,finished_at) VALUES(?,?,?,?,?)",
                    (kind, status, message, started_at, utc_now()),
                )

    @app.post("/jobs/{kind}")
    async def start_job(kind: str, background: BackgroundTasks, _: str = Depends(authorized)):
        if kind not in {"collect", "publish"}:
            raise HTTPException(404)
        background.add_task(run_job, kind)
        return RedirectResponse(url=f"/?token={app.state.admin_token}", status_code=303)

    @app.post("/rankings/import")
    async def import_rankings(file: UploadFile, _: str = Depends(authorized)):
        content = (await file.read()).decode("utf-8-sig")
        rows = list(csv.DictReader(io.StringIO(content)))
        path = CURATED_DIR / "venue_rankings.json"
        venues = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
        by_name = {item["name"].strip().lower(): item for item in venues}
        for row in rows:
            required = [row.get("venue_name"), row.get("system"), row.get("level"), row.get("version"), row.get("source_url")]
            if not all(required):
                raise HTTPException(400, "CSV 必须包含 venue_name,system,level,version,source_url")
            key = row["venue_name"].strip().lower()
            venue = by_name.setdefault(key, {"id": "venue-imported-" + secrets.token_hex(6), "name": row["venue_name"], "short_name": row.get("short_name", ""), "type": row.get("venue_type", "unknown"), "aliases": [], "rankings": []})
            venue["rankings"].append({"system": row["system"], "level": row["level"], "category": row.get("category", ""), "is_top": row.get("is_top", "").lower() in {"1", "true", "yes"}, "version": row["version"], "source_url": row["source_url"], "verified_at": row.get("verified_at") or "local-import"})
        path.write_text(json.dumps(list(by_name.values()), ensure_ascii=False, indent=2), encoding="utf-8")
        build_public()
        return RedirectResponse(url=f"/?token={app.state.admin_token}", status_code=303)

    @app.get("/health")
    async def health():
        try:
            result = validate_public(False)
            return {"status": "ok", **result}
        except ValidationError as exc:
            return {"status": "degraded", "error": str(exc)}

    return app
