import asyncio
import json
import time
from pathlib import Path

import pytest
from gateway.api import create_app
from gateway.config import Settings
from gateway.tests.test_services_api import TOKEN, client_for, create_session

AUTH = {"loggedIn": True, "authMethod": "claude.ai", "subscriptionType": "max"}


@pytest.fixture
def executable(tmp_path):
    cli = tmp_path / "trusted Claude.exe"
    cli.touch()
    return cli


@pytest.fixture
def fake_cli(monkeypatch):
    async def spawn(executable, *args, **kwargs):
        assert Path(kwargs["cwd"]).is_dir()
        return FakeProcess(args, kwargs)

    class FakeProcess:
        returncode = None

        async def communicate(self, data=None):
            calls.append((self.args, self.options, data))
            if self.args and self.args[0] == "-p":
                started.set()
            if self.args and self.args[0] == "-p" and state["block_reply"]:
                await self.killed.wait()
                return b"", None
            self.returncode = 0
            outcome = state["auth"] if self.args and self.args[0] == "auth" else state["reply"]
            return json.dumps(outcome).encode(), None

        def kill(self):
            self.returncode = -9
            state["killed"].append(self.args)
            self.killed.set()

        def __init__(self, args, options):
            self.args = args
            self.options = options
            self.killed = asyncio.Event()

    calls = []
    started = asyncio.Event()
    state = {
        "auth": AUTH,
        "reply": {
            "type": "result",
            "subtype": "success",
            "is_error": False,
            "structured_output": {"segments": [{"text": "클로드 구독 응답"}]},
        },
        "block_reply": False,
        "killed": [],
    }
    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    return calls, started, state


def wait_for_turn(client, sid, tid):
    for _ in range(200):
        result = client.get(f"/api/sessions/{sid}/turns/{tid}").json()
        if result["status"] in {"completed", "cancelled", "error"}:
            return result
        time.sleep(0.01)
    pytest.fail("Claude turn did not settle")


def test_claude_default_routes_to_the_local_cli_and_its_own_store(
    tmp_path, executable, fake_cli, monkeypatch
):
    calls, _, _ = fake_cli
    monkeypatch.setenv("LLM_PROVIDER", "claude")
    monkeypatch.setenv("CLAUDE_CLI", str(executable))
    monkeypatch.setenv("USERPROFILE", str(tmp_path))
    for key in (
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_AUTH_TOKEN",
        "ANTHROPIC_BASE_URL",
        "CLAUDE_CODE_OAUTH_TOKEN",
        "CLAUDE_CODE_USE_BEDROCK",
        "GITHUB_TOKEN",
        "NODE_OPTIONS",
    ):
        monkeypatch.setenv(key, "must-not-reach-cli")
    settings = Settings.from_env()
    assert settings.claude_cli == executable
    app = create_app(
        Settings(data_dir=tmp_path, token=TOKEN, llm=settings.llm, claude_cli=settings.claude_cli)
    )
    with client_for(app) as client:
        status = client.get("/api/status").json()
        selected = next(service for service in status["services"] if service["id"] == "claude")
        assert selected["label"] == "Claude 구독" and selected["available"]
        assert status["default_service"] == "claude"
        assert status["profile"] == "claude_subscription"
        default = client.post("/api/sessions", json={"mode": "assistant"}).json()
        assert default["service"] == "claude"
        claude, demo = default["id"], create_session(client, "demo")
        for sid, memory in [(claude, "Claude 승인 기억"), (demo, "Demo 전용 기억")]:
            assert (
                client.post(f"/api/sessions/{sid}/memories", json={"text": memory}).status_code
                == 201
            )
        tid = client.post(f"/api/sessions/{claude}/turns", json={"text": "한국어 질문"}).json()[
            "id"
        ]
        result = wait_for_turn(client, claude, tid)
        assert result["status"] == "completed"
        assert result["segments"][0]["text"] == "클로드 구독 응답"
        assert client.get(f"/api/sessions/{demo}/history").json() == []
    assert (tmp_path / "claude_subscription" / "state.sqlite3").is_file()
    assert len(calls) == 2
    auth_args, auth_options, auth_input = calls[0]
    args, options, data = calls[1]
    assert auth_args == ("auth", "status", "--json") and auth_input is None
    assert not Path(options["cwd"]).exists()
    for env in (auth_options["env"], options["env"]):
        assert env["USERPROFILE"] == str(tmp_path)
        assert "must-not-reach-cli" not in env.values()
    assert args[0] == "-p"
    assert {
        "--restricted",
        "--strict-mcp-config",
        "--no-session-persistence",
        "--disable-slash-commands",
    } <= set(args)
    assert args[args.index("--disallowed-tools") + 1] == "mcp__*"
    assert json.loads(args[args.index("--settings") + 1]) == {"disableAllHooks": True}
    assert "--bare" not in args
    assert args[args.index("--tools") + 1] == ""
    assert args[args.index("--output-format") + 1] == "json"
    assert json.loads(args[args.index("--json-schema") + 1])["type"] == "object"
    assert "한국어 질문" not in repr(args) and "Claude 승인 기억" not in repr(args)
    prompt = json.loads(data.decode("utf-8"))
    assert prompt[0]["role"] == "system" and "Claude 승인 기억" in prompt[0]["content"]
    assert "Demo 전용 기억" not in str(prompt)
    assert prompt[-1] == {"role": "user", "content": "한국어 질문"}


@pytest.mark.parametrize(
    "auth",
    [
        {"loggedIn": True, "authMethod": "api_key"},
        {"loggedIn": False, "authMethod": "claude.ai"},
        {"loggedIn": "true", "authMethod": "claude.ai"},
    ],
)
def test_claude_fails_closed_before_sending_prompt(tmp_path, executable, fake_cli, auth):
    calls, _, state = fake_cli
    state["auth"] = auth
    with client_for(
        create_app(Settings(data_dir=tmp_path, token=TOKEN, claude_cli=executable))
    ) as client:
        sid = create_session(client, "claude")
        tid = client.post(f"/api/sessions/{sid}/turns", json={"text": "keep local"}).json()["id"]
        result = wait_for_turn(client, sid, tid)
        assert result["status"] == "error"
        assert result["segments"] == []
        assert client.get(f"/api/sessions/{sid}/history").json() == []
    assert [(args, data) for args, _, data in calls] == [(("auth", "status", "--json"), None)]


def test_unconfigured_claude_service_is_omitted_and_cannot_fall_back(tmp_path):
    with client_for(create_app(Settings(data_dir=tmp_path, token=TOKEN))) as client:
        assert {service["id"] for service in client.get("/api/status").json()["services"]} == {
            "demo",
            "local",
            "cloud",
        }
        assert (
            client.post(
                "/api/sessions", json={"mode": "assistant", "service": "claude"}
            ).status_code
            == 503
        )


def test_claude_configuration_requires_an_existing_absolute_cli_and_loopback(executable, tmp_path):
    for invalid in (None, Path(executable.name), tmp_path / "missing.exe"):
        with pytest.raises(ValueError, match="CLAUDE_CLI"):
            Settings(llm="claude", claude_cli=invalid)
    with pytest.raises(ValueError, match="loopback"):
        Settings(claude_cli=executable, public_origin="https://assistant.example", token=TOKEN)


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["cancel", "timeout"])
async def test_abandoned_claude_inference_kills_the_subprocess(executable, fake_cli, operation):
    from gateway.claude import ClaudeLLM

    calls, started, state = fake_cli
    state["block_reply"] = True
    model = ClaudeLLM(executable, timeout=0.08 if operation == "timeout" else 10)
    task = asyncio.create_task(model.reply([{"role": "user", "content": "wait"}]))
    await asyncio.wait_for(started.wait(), timeout=2)
    assert [args[0] for args, *_ in calls] == ["auth", "-p"]
    if operation == "cancel":
        task.cancel()
    with pytest.raises(asyncio.CancelledError if operation == "cancel" else TimeoutError):
        await task
    assert state["killed"] == [calls[1][0]]


def test_readiness_claude_checks_auth_only(tmp_path, executable, fake_cli, monkeypatch, capsys):
    from gateway import readiness_cli

    calls, _, state = fake_cli
    state["auth"] = {**AUTH, "email": "private-address@example.test"}
    monkeypatch.setenv("CLAUDE_CLI", str(executable))
    monkeypatch.setattr(readiness_cli, "__file__", str(tmp_path / "services/gateway/cli.py"))
    index = tmp_path / "apps/web/dist/index.html"
    index.parent.mkdir(parents=True)
    index.touch()
    assert readiness_cli.main(["--provider", "claude", "--json"]) == 0
    output = capsys.readouterr().out
    check = next(item for item in json.loads(output) if item["component"] == "Claude Code")
    assert check["status"] == "PASS"
    assert "private-address" not in output
    assert [(args, data) for args, _, data in calls] == [(("auth", "status", "--json"), None)]
