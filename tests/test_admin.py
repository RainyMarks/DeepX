import json
import sqlite3

from fastapi.testclient import TestClient

import atlas.admin as admin_module
from atlas.admin import create_app


def test_admin_dashboard_requires_random_token():
    client = TestClient(create_app("known-test-token"))
    assert client.get("/").status_code == 403
    assert client.get("/?token=wrong").status_code == 403

    response = client.get("/?token=known-test-token")
    assert response.status_code == 200
    assert "生成图像取证研究图谱" in response.text
    assert "atlas_admin_token=" in response.headers["set-cookie"]
    assert "HttpOnly" in response.headers["set-cookie"]


def test_health_is_read_only_and_reports_public_data():
    client = TestClient(create_app("known-test-token"))
    payload = client.get("/health").json()
    assert payload["status"] == "ok"
    assert payload["paper_count"] >= 1000


def test_human_review_is_token_protected_and_persisted_in_isolation(tmp_path, monkeypatch):
    database = tmp_path / "review.sqlite3"

    def temporary_connection():
        connection = sqlite3.connect(database)
        connection.execute(
            "CREATE TABLE IF NOT EXISTS review_events ("
            "id INTEGER PRIMARY KEY, paper_id TEXT, status TEXT, reviewer TEXT, note TEXT, decided_at TEXT)"
        )
        return connection

    monkeypatch.setattr(admin_module, "CURATED_DIR", tmp_path)
    monkeypatch.setattr(admin_module, "connect", temporary_connection)
    monkeypatch.setattr(admin_module, "build_public", lambda: None)
    client = TestClient(create_app("known-test-token"))

    denied = client.post("/review/paper-test", data={"status": "verified", "note": "人工核验"})
    assert denied.status_code == 403
    response = client.post(
        "/review/paper-test?token=known-test-token",
        data={"status": "verified", "note": "人工核验"},
        follow_redirects=False,
    )
    assert response.status_code == 303
    decision = json.loads((tmp_path / "review_decisions.jsonl").read_text(encoding="utf-8"))
    assert decision["paper_id"] == "paper-test"
    assert decision["status"] == "verified"
