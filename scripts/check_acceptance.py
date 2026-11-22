"""Score the eight required software checks in technical-design.md section 11.

Run with the project's Python environment and Node on PATH. Equal weights and
the 70-point target apply to this software check only. Each named test and all
its collected parameter cases must pass for its group to earn any points.
"""

import json
import os
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def py(module, name):
    return f"pytest:services.gateway.tests.test_{module}::{name}"


def node(file, name):
    return f"node:apps/diagnostics/tests/{file}.test.mjs::{name}"


def cases(module, name, *ids):
    return [py(module, f"{name}[{case_id}]") for case_id in ids]


GATES = {
    "모드 간 기억 격리": [py("store_engine", "test_mode_memory_not_in_other_prompt")],
    "소개팅의 비서 도구 차단": [
        py("api", "test_companion_cannot_write_assistant_notes"),
        py("services_api", "test_all_services_isolate_memory_notes_history_and_provider_prompts"),
    ],
    "취소 후 음성·전사 폐기": [
        node("player", "stop during audio decoding never starts a late source"),
        py("transcription", "test_cancel_discards_late_transcription_and_limits_queue"),
    ],
    "잘못된 공급자 응답 거부": [
        py("providers", "test_invalid_provider_payload_fails_closed"),
        *cases(
            "cloud_provider",
            "test_cloud_rejects_malformed_or_unsafe_reply",
            "missing-choices",
            "empty-choices",
            "invalid-choices",
            "null-choice",
            "empty-segments",
            "invalid-gesture",
            "invalid-text",
            "extra-field",
            "code-fence",
            "tool-calls",
            "function-call",
            "refusal",
        ),
    ],
    "다른 세션 오디오 차단": [
        py("store_engine", "test_audio_is_session_bound_and_removed_on_cancel")
    ],
    "허용되지 않은 Host·Origin 차단": [
        py("public_deployment", "test_public_origin_preserves_authentication_and_origin_checks"),
        py("public_deployment", "test_public_binding_rejects_remote_clients_spoofing_localhost"),
    ],
    "마이크 권한 거부 처리": [
        node("voice", "permission rejection surfaces without opening an audio pipeline")
    ],
    "사용할 모델이 없을 때 오류 안내": [
        py("readiness", "test_model_absence_and_worker_auth_error_fail_without_leaking_token"),
        *cases(
            "readiness",
            "test_cloud_readiness_cli_reports_configuration",
            "cloud-missing-both",
            "cloud-missing-model",
            "cloud-missing-key",
            "cloud-configured",
            "demo-unconfigured",
            "demo-cloud-configured",
        ),
        *cases(
            "readiness",
            "test_ollama_readiness_with_only_latest_installed",
            "implicit-latest",
            "missing-explicit-tag",
        ),
        py("readiness", "test_selected_but_disabled_ollama_fails_without_network"),
    ],
}


def score_reports(python_report, node_reports):
    outcomes = {}

    def record(source, case):
        key = f"{source}::{case.attrib['name']}"
        passed = all(case.find(tag) is None for tag in ("error", "failure", "skipped"))
        outcomes[key] = outcomes.get(key, True) and passed

    for case in ET.parse(python_report).iter("testcase"):
        record(f"pytest:{case.get('classname')}", case)
    for filename, report in node_reports.items():
        for case in ET.parse(report).iter("testcase"):
            # Node 22 omits file attributes. Its report comes from running just this file.
            reported_file = case.get("file")
            if reported_file and (ROOT / reported_file).resolve() != (ROOT / filename).resolve():
                continue
            if case.get("classname") == "test":
                record(f"node:{filename}", case)

    failed_families = {key.partition("[")[0] for key, passed in outcomes.items() if not passed}
    gates = {}
    for label, names in GATES.items():
        gates[label] = {
            "passed": all(
                outcomes.get(name, False) and name.partition("[")[0] not in failed_families
                for name in names
            ),
            "tests": names,
        }
    passed_count = sum(gate["passed"] for gate in gates.values())
    return {"score": 100 * passed_count / len(gates), "target": 70, "gates": gates}


def report_json(result, destination=None):
    """Return the normal stdout report and optionally preserve UTF-8 CI evidence."""
    payload = json.dumps(result, ensure_ascii=False, indent=2)
    if destination is not None:
        target = Path(destination)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(payload + "\n", encoding="utf-8")
    return payload


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    with tempfile.TemporaryDirectory() as directory:
        python_report = Path(directory) / "python.xml"
        python = subprocess.run(
            [sys.executable, "-m", "pytest", "-q", f"--junitxml={python_report}"],
            cwd=ROOT,
            stdout=sys.stderr,
        )
        tests = sorted((ROOT / "apps/diagnostics/tests").glob("*.test.mjs"))
        if not tests:
            raise FileNotFoundError("No Node diagnostic test files found")
        node_reports = {}
        suites_passed = python.returncode == 0
        for test_file in tests:
            node_report = Path(directory) / f"{test_file.name}.xml"
            node_run = subprocess.run(
                [
                    "node",
                    "--test",
                    "--test-reporter=tap",
                    "--test-reporter-destination=stderr",
                    "--test-reporter=junit",
                    f"--test-reporter-destination={node_report}",
                    test_file,
                ],
                cwd=ROOT,
            )
            node_reports[test_file.relative_to(ROOT).as_posix()] = node_report
            suites_passed = suites_passed and node_run.returncode == 0
        result = score_reports(python_report, node_reports)
        result["suites_passed"] = suites_passed
        print(report_json(result, os.environ.get("ACCEPTANCE_REPORT_PATH")))
        return 0 if result["suites_passed"] and result["score"] >= result["target"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
