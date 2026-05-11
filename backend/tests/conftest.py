from __future__ import annotations

import importlib
import json
import os
import socket
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, List, Sequence

import psycopg
import pytest


ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT_DIR / "backend"
REPORT_DIR = BACKEND_DIR / "test-results"
REPORT_FILE = REPORT_DIR / "integration-report.json"
POSTGRES_LOG_FILE = REPORT_DIR / "postgres.log"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

_REPORT_STATE: Dict[str, Any] = {"tests": [], "container": None}


def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


@dataclass
class PostgresContainer:
    name: str
    port: int
    container_id: str | None = None

    @property
    def url(self) -> str:
        return f"postgresql://postgres:postgres@127.0.0.1:{self.port}/hf_test?sslmode=disable"

    def start(self) -> None:
        command = [
            "docker",
            "run",
            "-d",
            "--rm",
            "--name",
            self.name,
            "-e",
            "POSTGRES_USER=postgres",
            "-e",
            "POSTGRES_PASSWORD=postgres",
            "-e",
            "POSTGRES_DB=hf_test",
            "-p",
            f"127.0.0.1:{self.port}:5432",
            "postgres:16-alpine",
        ]
        result = subprocess.run(command, capture_output=True, text=True, check=True)
        self.container_id = result.stdout.strip()
        self._wait_until_ready()

    def _wait_until_ready(self) -> None:
        deadline = time.time() + 90
        last_error: Exception | None = None
        while time.time() < deadline:
            try:
                with psycopg.connect(self.url, autocommit=True) as conn:
                    with conn.cursor() as cur:
                        cur.execute("SELECT 1")
                        cur.fetchone()
                return
            except Exception as exc:  # pragma: no cover - retry loop
                last_error = exc
                time.sleep(1)
        self.stop(capture_logs=True)
        raise RuntimeError(f"Postgres container did not become ready: {last_error}")

    def stop(self, capture_logs: bool = False) -> None:
        if not self.container_id:
            return
        if capture_logs:
            logs = subprocess.run(["docker", "logs", self.container_id], capture_output=True, text=True)
            REPORT_DIR.mkdir(parents=True, exist_ok=True)
            POSTGRES_LOG_FILE.write_text(
                (logs.stdout or "") + ("\n" if logs.stdout and logs.stderr else "") + (logs.stderr or ""),
                encoding="utf-8",
            )
        subprocess.run(["docker", "rm", "-f", self.container_id], capture_output=True, text=True)
        self.container_id = None


class SequentialModel:
    def __init__(self, responses: Sequence[Any], label: str):
        self._responses = [r if isinstance(r, str) else json.dumps(r, ensure_ascii=False) for r in responses]
        self.label = label
        self.calls: List[Any] = []

    def generate_content(self, payload: Any):
        self.calls.append(payload)
        if not self._responses:
            raise AssertionError(f"{self.label} stub exhausted")
        return SimpleNamespace(text=self._responses.pop(0))


class BackendHarness:
    def __init__(self, app_module, auth_module, db_module):
        self.app_module = app_module
        self.auth_module = auth_module
        self.db_module = db_module
        self.client = app_module.app.test_client()
        self.sent_login_codes: List[Dict[str, Any]] = []
        self.monkeypatch = pytest.MonkeyPatch()
        self.last_token: str | None = None
        self.last_user: Dict[str, Any] | None = None

        def fake_send_login_code(email: str, code: str, app_url: str) -> None:
            self.sent_login_codes.append({"email": email, "code": code, "app_url": app_url})

        self.monkeypatch.setattr(self.auth_module, "send_login_code", fake_send_login_code)

    def close(self) -> None:
        self.monkeypatch.undo()

    def trace(self, label: str, response) -> None:
        payload = response.get_json(silent=True)
        print(json.dumps({"label": label, "status": response.status_code, "body": payload}, ensure_ascii=False))

    def headers(self, token: str | None = None) -> Dict[str, str]:
        token = token or self.last_token
        if not token:
            return {}
        return {"Authorization": f"Bearer {token}"}

    def login(self, email: str) -> Dict[str, str]:
        fixed_code = 123456
        self.monkeypatch.setattr(self.auth_module.secrets, "randbelow", lambda n: fixed_code)
        self.sent_login_codes.clear()

        response = self.client.post("/api/auth/request-code", json={"email": email})
        self.trace("request-code", response)
        assert response.status_code == 200, response.get_data(as_text=True)
        assert self.sent_login_codes, "login code was not sent"
        assert self.sent_login_codes[-1]["code"] == f"{fixed_code:06d}"

        response = self.client.post("/api/auth/verify-code", json={"email": email, "code": f"{fixed_code:06d}"})
        self.trace("verify-code", response)
        assert response.status_code == 200, response.get_data(as_text=True)
        payload = response.get_json()
        assert payload and payload.get("data")
        data = payload["data"]
        self.last_token = data["token"]
        self.last_user = data["user"]
        return self.headers(self.last_token)

    def set_forge_sequence(self, hero_pairs: Sequence[Dict[str, Any]]) -> None:
        vision_payloads = [pair["p1"] for pair in hero_pairs]
        text_payloads = [pair["p2"] for pair in hero_pairs]
        self.app_module.model_vision = SequentialModel(vision_payloads, "vision")
        self.app_module.model_text = SequentialModel(text_payloads, "text")

    def forge(self, headers: Dict[str, str], image_base64: str, materials: Dict[str, int] | None = None):
        response = self.client.post(
            "/api/forge",
            headers=headers,
            json={"image": image_base64, "materials": materials or {}},
        )
        self.trace("forge", response)
        assert response.status_code == 200, response.get_data(as_text=True)
        return response.get_json()

    def battle(self, headers: Dict[str, str], hero_a: Dict[str, Any], hero_b: Dict[str, Any]):
        response = self.client.post(
            "/api/battle",
            headers=headers,
            json={"heroA": hero_a, "heroB": hero_b},
        )
        self.trace("battle", response)
        assert response.status_code == 200, response.get_data(as_text=True)
        return response.get_json()

    def battle_team(self, headers: Dict[str, str], team_a: Sequence[Dict[str, Any]], team_b: Sequence[Dict[str, Any]], size: str = "4v4"):
        response = self.client.post(
            "/api/battle/team",
            headers=headers,
            json={"teamA": list(team_a), "teamB": list(team_b), "size": size, "labelA": "Top", "labelB": "Bottom"},
        )
        self.trace("battle-team", response)
        assert response.status_code == 200, response.get_data(as_text=True)
        return response.get_json()

    def pve_start(self, headers: Dict[str, str], hero_ids: Sequence[str], theme_key: str = "tower"):
        response = self.client.post(
            "/api/pve/start",
            headers=headers,
            json={"themeKey": theme_key, "heroIds": list(hero_ids)},
        )
        self.trace("pve-start", response)
        assert response.status_code == 200, response.get_data(as_text=True)
        return response.get_json()

    def repair(self, headers: Dict[str, str], hero_id: str):
        response = self.client.post(
            "/api/economy/repair",
            headers=headers,
            json={"heroId": hero_id},
        )
        self.trace("repair", response)
        assert response.status_code == 200, response.get_data(as_text=True)
        return response.get_json()

    def pvp_entry(self, headers: Dict[str, str], queue_key: str = "default"):
        response = self.client.post(
            "/api/economy/pvp-entry",
            headers=headers,
            json={"queueKey": queue_key},
        )
        self.trace("pvp-entry", response)
        assert response.status_code == 200, response.get_data(as_text=True)
        return response.get_json()

    def pvp_join(self, headers: Dict[str, str], hero_ids: Sequence[str], queue_key: str = "default", battle_mode: str = "1v1"):
        response = self.client.post(
            "/api/pvp/join",
            headers=headers,
            json={"queueKey": queue_key, "heroIds": list(hero_ids), "battleMode": battle_mode},
        )
        self.trace("pvp-join", response)
        assert response.status_code == 200, response.get_data(as_text=True)
        return response.get_json()

    def pvp_entry_status(self, headers: Dict[str, str], entry_id: str):
        response = self.client.get(f"/api/pvp/entries/{entry_id}", headers=headers)
        self.trace("pvp-entry-status", response)
        assert response.status_code == 200, response.get_data(as_text=True)
        return response.get_json()

    def pvp_cancel(self, headers: Dict[str, str], entry_id: str):
        response = self.client.post(
            "/api/pvp/cancel",
            headers=headers,
            json={"entryId": entry_id},
        )
        self.trace("pvp-cancel", response)
        assert response.status_code == 200, response.get_data(as_text=True)
        return response.get_json()

    def economy(self, headers: Dict[str, str]):
        response = self.client.get("/api/me/economy", headers=headers)
        self.trace("economy", response)
        assert response.status_code == 200, response.get_data(as_text=True)
        payload = response.get_json()
        assert payload and payload.get("data")
        return payload["data"]

    def heroes(self, headers: Dict[str, str]):
        response = self.client.get("/api/me/heroes", headers=headers)
        self.trace("heroes", response)
        assert response.status_code == 200, response.get_data(as_text=True)
        payload = response.get_json()
        return payload["data"]

    def battles(self, headers: Dict[str, str]):
        response = self.client.get("/api/me/battles", headers=headers)
        self.trace("battles", response)
        assert response.status_code == 200, response.get_data(as_text=True)
        payload = response.get_json()
        return payload["data"]

    def auth_me(self, headers: Dict[str, str]):
        response = self.client.get("/api/auth/me", headers=headers)
        self.trace("auth-me", response)
        assert response.status_code == 200, response.get_data(as_text=True)
        return response.get_json()


def _apply_test_env(database_url: str) -> None:
    os.environ.update(
        {
            "DATABASE_URL": database_url,
            "SUB_URL": "",
            "SUB_PASS": "",
            "DB_SCHEMA": "app",
            "GEMINI_API_KEY": "test-gemini-key",
            "GEMINI_MODEL": "gemini-test",
            "RESEND_API_KEY": "test-resend-key",
            "EMAIL_FROM": "no-reply@txzy.net",
            "APP_URL": "http://localhost:5173",
            "CORS_ORIGINS": "*",
            "STARTER_DUST_BALANCE": "500",
            "DUST_COST_FORGE": "100",
            "DUST_COST_REPAIR": "60",
            "DUST_COST_PVE_ENTRY": "40",
            "DUST_COST_PVP_ENTRY": "30",
            "DUST_COST_PVP_REVIVE": "200",
            "PVP_STAKE_DUST": "30",
            "PVP_MATCH_TOLERANCE_PCT": "5",
            "PVP_LOW_TIER_RELIC_DROP_PCT": "3",
            "PVP_QUEUE_TTL_MINUTES": "10",
        }
    )


def _clear_backend_modules() -> None:
    for module_name in ["main", "auth", "config", "db", "email_service", "game_logic", "battle_logic", "utils"]:
        sys.modules.pop(module_name, None)


@pytest.fixture(scope="session")
def postgres_container() -> PostgresContainer:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    container = PostgresContainer(name=f"hf-pg-test-{uuid.uuid4().hex[:10]}", port=_find_free_port())
    container.start()
    _REPORT_STATE["container"] = {"name": container.name, "port": container.port, "url": container.url}
    try:
        yield container
    finally:
        container.stop(capture_logs=True)


@pytest.fixture(scope="session")
def harness(postgres_container) -> BackendHarness:
    _apply_test_env(postgres_container.url)
    _clear_backend_modules()
    auth_module = importlib.import_module("auth")
    db_module = importlib.import_module("db")
    app_module = importlib.import_module("main")
    return BackendHarness(app_module=app_module, auth_module=auth_module, db_module=db_module)


@pytest.fixture(scope="session", autouse=True)
def _ensure_report_dir():
    REPORT_DIR.mkdir(parents=True, exist_ok=True)


def pytest_configure(config):
    config.addinivalue_line("markers", "integration: end-to-end backend API tests")


def pytest_runtest_logreport(report):
    if report.when != "call":
        return
    entry = {
        "nodeid": report.nodeid,
        "outcome": report.outcome,
        "duration": round(float(report.duration), 4),
        "stdout": getattr(report, "capstdout", ""),
        "stderr": getattr(report, "capstderr", ""),
        "log": getattr(report, "caplog", ""),
    }
    if report.failed:
        entry["longrepr"] = str(report.longrepr)
    _REPORT_STATE["tests"].append(entry)


def pytest_sessionfinish(session, exitstatus):
    report = {
        "exitstatus": exitstatus,
        "container": _REPORT_STATE.get("container"),
        "summary": {
            "passed": sum(1 for item in _REPORT_STATE["tests"] if item["outcome"] == "passed"),
            "failed": sum(1 for item in _REPORT_STATE["tests"] if item["outcome"] == "failed"),
            "skipped": sum(1 for item in _REPORT_STATE["tests"] if item["outcome"] == "skipped"),
            "total": len(_REPORT_STATE["tests"]),
        },
        "tests": _REPORT_STATE["tests"],
    }
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_FILE.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
