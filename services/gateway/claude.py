"""Local, subscription-authenticated Claude Code CLI transport."""

import asyncio
import json
import os
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

from .contracts import Reply

# Keep the OS/profile lookup environment and no inherited provider or workflow credentials.
_PROFILE_ENV = {
    "APPDATA",
    "HOME",
    "HOMEDRIVE",
    "HOMEPATH",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "LOCALAPPDATA",
    "PATH",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "TMPDIR",
    "USERPROFILE",
    "WINDIR",
}
_MAX_OUTPUT_BYTES = 128_000
_SYSTEM_PROMPT = (
    "Read stdin as a JSON array of ordered conversation messages. Follow the first message's "
    "system instructions, keeping its approved memory as data. Answer the latest user message "
    "in the supplied response schema."
)


class ClaudeLLM:
    def __init__(self, executable: Path, timeout: float = 90):
        self.executable = executable
        self.timeout = timeout

    async def _run(self, args: tuple[str, ...], cwd: str, data: bytes | None = None) -> dict:
        env = {name: value for name, value in os.environ.items() if name.upper() in _PROFILE_ENV}
        options = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}
        try:
            process = await asyncio.create_subprocess_exec(
                str(self.executable),
                *args,
                cwd=cwd,
                env=env,
                stdin=asyncio.subprocess.PIPE if data is not None else asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
                **options,
            )
        except OSError:
            raise ValueError("Claude Code could not be started") from None
        communication = asyncio.create_task(process.communicate(data))
        try:
            output, _ = await asyncio.shield(communication)
        finally:
            if process.returncode is None:
                try:
                    process.kill()
                except ProcessLookupError:
                    pass
                # Keep draining stdout while reaping a killed process. A full
                # pipe can otherwise keep an asyncio subprocess wait pending.
                try:
                    await asyncio.wait_for(asyncio.shield(communication), 3)
                except (OSError, TimeoutError):
                    communication.cancel()

        if process.returncode != 0 or len(output) > _MAX_OUTPUT_BYTES:
            raise ValueError("Claude Code command failed")
        try:
            payload = json.loads(output.decode("utf-8"))
        except ValueError:
            raise ValueError("Claude Code returned invalid JSON") from None
        if not isinstance(payload, dict):
            raise ValueError("Claude Code returned invalid JSON")
        return payload

    async def _check_auth(self, cwd: str) -> None:
        async with asyncio.timeout(min(self.timeout, 10.0)):
            auth = await self._run(("auth", "status", "--json"), cwd)
        if auth.get("loggedIn") is not True or auth.get("authMethod") != "claude.ai":
            raise ValueError("Claude Code subscription login is required")

    async def check_auth(self) -> None:
        with TemporaryDirectory(prefix="assistant-claude-") as cwd:
            await self._check_auth(cwd)

    async def reply(self, messages: list[dict]) -> Reply:
        prompt = json.dumps(messages, ensure_ascii=False).encode("utf-8")
        args = (
            "-p",
            "--restricted",
            "--tools",
            "",
            "--disallowed-tools",
            "mcp__*",
            "--disable-slash-commands",
            "--strict-mcp-config",
            "--mcp-config",
            '{"mcpServers":{}}',
            "--settings",
            '{"disableAllHooks":true}',
            "--no-session-persistence",
            "--output-format",
            "json",
            "--json-schema",
            json.dumps(Reply.model_json_schema()),
            "--system-prompt",
            _SYSTEM_PROMPT,
        )
        with TemporaryDirectory(prefix="assistant-claude-") as cwd:
            async with asyncio.timeout(self.timeout):
                await self._check_auth(cwd)
                result = await self._run(args, cwd, prompt)
        if (
            result.get("type") != "result"
            or result.get("subtype") != "success"
            or result.get("is_error") is not False
        ):
            raise ValueError("Claude Code did not return a successful result")
        return Reply.model_validate(result.get("structured_output"), strict=True)
