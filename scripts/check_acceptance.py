"""Score the eight required software checks in technical-design.md section 11.

Run with the project's Python environment and Node on PATH. Equal weights and
the 70-point target apply to this software check only. Each named test and all
its collected parameter cases must pass for its group to earn any points.
"""

import json
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GATES = {
    "모드 간 기억 격리": ["test_mode_memory_not_in_other_prompt"],
    "소개팅의 비서 도구 차단": ["test_companion_cannot_write_assistant_notes"],
    "취소 후 음성·전사 폐기": [
        "stop during audio decoding never starts a late source",
        "test_cancel_discards_late_transcription_and_limits_queue",
    ],
    "잘못된 공급자 응답 거부": [
        "test_invalid_provider_payload_fails_closed",
        "test_cloud_rejects_malformed_or_unsafe_reply",
    ],
    "다른 세션 오디오 차단": ["test_audio_is_session_bound_and_removed_on_cancel"],
    "허용되지 않은 Host·Origin 차단": [
        "test_public_origin_preserves_authentication_and_origin_checks"
    ],
    "마이크 권한 거부 처리": ["permission rejection surfaces without opening an audio pipeline"],
    "사용할 모델이 없을 때 오류 안내": [
        "test_model_absence_and_worker_auth_error_fail_without_leaking_token",
        "test_cloud_readiness_cli_reports_configuration",
        "test_selected_but_disabled_ollama_fails_without_network",
    ],
}


def score_reports(reports):
    outcomes = {}
    for report in reports:
        for case in ET.parse(report).iter("testcase"):
            name = case.attrib["name"].partition("[")[0]
            passed = all(case.find(tag) is None for tag in ("error", "failure", "skipped"))
            outcomes.setdefault(name, []).append(passed)
    gates = {}
    for label, names in GATES.items():
        gates[label] = {
            "passed": all(outcomes.get(name) and all(outcomes[name]) for name in names),
            "tests": names,
        }
    passed_count = sum(gate["passed"] for gate in gates.values())
    return {"score": 100 * passed_count / len(gates), "target": 70, "gates": gates}


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    with tempfile.TemporaryDirectory() as directory:
        python_report = Path(directory) / "python.xml"
        node_report = Path(directory) / "node.xml"
        python = subprocess.run(
            [sys.executable, "-m", "pytest", "-q", f"--junitxml={python_report}"],
            cwd=ROOT,
            stdout=sys.stderr,
        )
        tests = sorted((ROOT / "apps/diagnostics/tests").glob("*.test.mjs"))
        if not tests:
            raise FileNotFoundError("No Node diagnostic test files found")
        node = subprocess.run(
            [
                "node",
                "--test",
                "--test-reporter=tap",
                "--test-reporter-destination=stderr",
                "--test-reporter=junit",
                f"--test-reporter-destination={node_report}",
                *tests,
            ],
            cwd=ROOT,
        )
        result = score_reports([python_report, node_report])
        result["suites_passed"] = python.returncode == 0 and node.returncode == 0
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result["suites_passed"] and result["score"] >= result["target"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
