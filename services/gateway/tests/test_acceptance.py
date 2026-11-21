import xml.etree.ElementTree as ET

import pytest

from scripts.check_acceptance import score_reports


def junit(path, cases):
    suite = ET.Element("testsuite")
    for classname, name, outcome in cases:
        case = ET.SubElement(suite, "testcase", classname=classname, name=name)
        if outcome:
            ET.SubElement(case, outcome)
    ET.ElementTree(suite).write(path)
    return path


def python_case(module, name, outcome=None):
    return f"services.gateway.tests.test_{module}", name, outcome


def test_only_the_required_python_module_and_runner_count(tmp_path):
    name = "test_mode_memory_not_in_other_prompt"
    python = junit(tmp_path / "py.xml", [python_case("api", name)])
    node = junit(tmp_path / "js.xml", [python_case("store_engine", name)])
    result = score_reports(python, {"apps/diagnostics/tests/player.test.mjs": node})
    assert result["gates"]["모드 간 기억 격리"]["passed"] is False
    junit(python, [python_case("store_engine", name)])
    assert score_reports(python, {})["score"] == 12.5


def test_node22_evidence_is_bound_to_the_file_run_and_cannot_come_from_pytest(tmp_path):
    name = "permission rejection surfaces without opening an audio pipeline"
    python = junit(tmp_path / "py.xml", [("test", name, None)])
    js = junit(tmp_path / "node.xml", [("test", name, None)])
    voice = "apps/diagnostics/tests/voice.test.mjs"
    assert score_reports(python, {"apps/diagnostics/tests/player.test.mjs": js})["score"] == 0
    assert score_reports(python, {voice: js})["score"] == 12.5
    junit(js, [("test", name, None), ("test", name, "skipped")])
    assert score_reports(python, {voice: js})["score"] == 0


@pytest.mark.parametrize("outcome", [None, "skipped", "failure", "error"])
def test_each_malformed_provider_parameter_is_required(tmp_path, outcome):
    cases = [python_case("providers", "test_invalid_provider_payload_fails_closed")]
    name = "test_cloud_rejects_malformed_or_unsafe_reply"
    ids = (
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
    )
    cases.extend(python_case("cloud_provider", f"{name}[{case_id}]") for case_id in ids)
    python = junit(tmp_path / "py.xml", cases)
    assert score_reports(python, {})["score"] == 12.5
    cases.pop()
    cases.append(cases[-1])  # A second pass of another case cannot replace refusal.
    if outcome:
        cases.append(python_case("cloud_provider", f"{name}[refusal]", outcome))
    junit(python, cases)
    assert score_reports(python, {})["score"] == 0


def test_companion_read_and_real_remote_peer_checks_are_required(tmp_path):
    cases = [
        python_case("api", "test_companion_cannot_write_assistant_notes"),
        python_case(
            "public_deployment", "test_public_origin_preserves_authentication_and_origin_checks"
        ),
    ]
    python = junit(tmp_path / "py.xml", cases)
    assert score_reports(python, {})["score"] == 0
    cases.extend(
        [
            python_case(
                "services_api",
                "test_all_services_isolate_memory_notes_history_and_provider_prompts",
            ),
            python_case(
                "public_deployment", "test_public_binding_rejects_remote_clients_spoofing_localhost"
            ),
        ]
    )
    junit(python, cases)
    assert score_reports(python, {})["score"] == 25
