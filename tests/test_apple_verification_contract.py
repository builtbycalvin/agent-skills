import copy
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests" / "fixtures" / "apple_verification_cases.json"
CANONICAL_CONTRACT = ROOT / "shared" / "apple-local-verification.md"
CANONICAL_VALIDATOR = ROOT / "shared" / "apple_verification_receipt.py"
CONTRACT_COPIES = (
    ROOT / "skills" / "local-review-until-clean" / "references" / "apple-local-verification.md",
    ROOT / "skills" / "pr-until-ready" / "references" / "apple-local-verification.md",
)
VALIDATOR_COPIES = (
    ROOT / "skills" / "local-review-until-clean" / "scripts" / "apple_verification_receipt.py",
    ROOT / "skills" / "pr-until-ready" / "scripts" / "apple_verification_receipt.py",
)

spec = importlib.util.spec_from_file_location("apple_verification_receipt", CANONICAL_VALIDATOR)
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


def run(repository, *args):
    return subprocess.run(
        args,
        cwd=repository,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


def valid_receipt(repository, content_tree):
    timestamp = "2026-08-30T12:00:00-07:00"
    return {
        "schema": "apple-local-verification/v1",
        "repository": str(repository),
        "content_tree": content_tree,
        "head_oid": None,
        "head_tree": None,
        "reused_from": None,
        "bound_at": timestamp,
        "classification": {
            "result": "apple-build-affecting",
            "paths": ["App/Feature.swift"],
            "rationale": "The changed Swift file builds into the iOS app.",
        },
        "identity": {
            "command": "python3 /installed-skill/scripts/apple_verification_receipt.py tree --repository .",
            "included_paths": [],
        },
        "checks": [
            {
                "name": "ios-tests",
                "command": "xcodebuild test -scheme App",
                "result": "passed",
                "exit_code": 0,
                "tree_before": content_tree,
                "tree_after": content_tree,
                "artifacts": ["AppTests.xcresult"],
            }
        ],
        "toolchain": {"xcode": "Xcode 18", "swift": "Swift 6", "macos": "15.0"},
        "started_at": timestamp,
        "completed_at": timestamp,
        "verdict": "passed",
    }


class AppleVerificationContractTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory(prefix="apple contract test ")
        self.repository = Path(self.temporary_directory.name)
        run(self.repository, "git", "init", "-q")
        run(self.repository, "git", "config", "user.name", "Contract Test")
        run(self.repository, "git", "config", "user.email", "contract@example.invalid")
        (self.repository / "App").mkdir()
        (self.repository / "App" / "Feature.swift").write_text("let value = 1\n", encoding="utf-8")
        run(self.repository, "git", "add", ".")
        run(self.repository, "git", "commit", "-qm", "fixture")

    def tearDown(self):
        self.temporary_directory.cleanup()

    def test_routing_and_authority_fixtures_use_canonical_policy(self):
        cases = json.loads(FIXTURES.read_text(encoding="utf-8"))
        for case in cases:
            with self.subTest(case=case["name"]):
                actual = validator.route_verification(
                    case["authority"],
                    case["receipt"],
                )
                self.assertEqual(actual, case["expected"])

    def test_unknown_authority_and_receipt_state_fail_closed(self):
        for authority, state in (("review-only", "absent"), ("check-only", "unknown")):
            with self.subTest(authority=authority, state=state):
                with self.assertRaisesRegex(ValueError, "unknown"):
                    validator.route_verification(authority, state)

    def test_valid_receipt_matches_the_exact_working_tree(self):
        tree = validator.working_content_tree(self.repository)
        validator.validate_receipt(valid_receipt(self.repository, tree), self.repository, required_check_names=["ios-tests"])

    def test_stale_receipt_fails_after_content_changes(self):
        tree = validator.working_content_tree(self.repository)
        receipt = valid_receipt(self.repository, tree)
        (self.repository / "App" / "Feature.swift").write_text("let value = 2\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "stale or changed"):
            validator.validate_receipt(receipt, self.repository, required_check_names=["ios-tests"])

    def test_per_check_tree_before_and_after_must_match_content_tree(self):
        tree = validator.working_content_tree(self.repository)
        receipt = valid_receipt(self.repository, tree)
        receipt["checks"][0]["tree_before"] = "0" * 40
        with self.assertRaisesRegex(ValueError, "check tree"):
            validator.validate_receipt(receipt, self.repository, required_check_names=["ios-tests"])

    def test_required_check_names_are_ordered_nonempty_and_duplicate_free(self):
        tree = validator.working_content_tree(self.repository)
        receipt = valid_receipt(self.repository, tree)
        for required in ([], ["other"], ["ios-tests", "ios-tests"]):
            with self.subTest(required=required):
                with self.assertRaises(ValueError):
                    validator.validate_receipt(receipt, self.repository, required_check_names=required)
        receipt["checks"].append({
            "name": "ios-build",
            "command": "xcodebuild build -scheme App",
            "result": "passed",
            "exit_code": 0,
            "tree_before": tree,
            "tree_after": tree,
            "artifacts": [],
        })
        with self.assertRaisesRegex(ValueError, "exactly match"):
            validator.validate_receipt(receipt, self.repository, required_check_names=["ios-build", "ios-tests"])

    def test_run_level_identity_tree_fields_are_rejected(self):
        tree = validator.working_content_tree(self.repository)
        receipt = valid_receipt(self.repository, tree)
        receipt["identity"]["before"] = tree
        with self.assertRaisesRegex(ValueError, "unknown fields"):
            validator.validate_receipt(receipt, self.repository, required_check_names=["ios-tests"])

    def test_repository_paths_are_normalized_and_evidence_paths_are_not_restricted(self):
        tree = validator.working_content_tree(self.repository)
        for field, value in (("classification.paths", ["./App/Feature.swift"]), ("identity.included_paths", ["../outside"]), ("classification.paths", ["/absolute"]), ("identity.included_paths", ["App//Feature.swift"])):
            receipt = valid_receipt(self.repository, tree)
            target = receipt["classification"] if field.startswith("classification") else receipt["identity"]
            target[field.split(".")[1]] = value
            with self.subTest(field=field, value=value):
                with self.assertRaises(ValueError):
                    validator.validate_receipt(receipt, self.repository, required_check_names=["ios-tests"])
        receipt = valid_receipt(self.repository, tree)
        receipt["checks"][0]["artifacts"] = ["/tmp/missing.xcresult", "relative.log"]
        receipt["reused_from"] = "/tmp/prior-receipt.json"
        validator.validate_receipt(receipt, self.repository, required_check_names=["ios-tests"])

    def test_cli_accepts_repeated_required_checks(self):
        tree = validator.working_content_tree(self.repository)
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", encoding="utf-8") as receipt_file:
            json.dump(valid_receipt(self.repository, tree), receipt_file)
            receipt_file.flush()
            result = subprocess.run(
                [
                    "python3",
                    str(CANONICAL_VALIDATOR),
                    "validate",
                    receipt_file.name,
                    "--repository",
                    str(self.repository),
                    "--required-check",
                    "ios-tests",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
        self.assertIn(f"valid: {tree}", result.stdout)

    def test_cli_route_rejects_unknown_authority_and_emits_json(self):
        result = subprocess.run(
            [
                "python3",
                str(CANONICAL_VALIDATOR),
                "route",
                "--authority",
                "check-only",
                "--receipt-state",
                "failed",
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        self.assertEqual(json.loads(result.stdout), {"action": "block-no-repair"})
        failed = subprocess.run(
            [
                "python3",
                str(CANONICAL_VALIDATOR),
                "route",
                "--authority",
                "unknown",
                "--receipt-state",
                "failed",
            ],
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(failed.returncode, 0)
        self.assertIn("unknown verification authority", failed.stderr)

    def test_snapshot_change_during_verification_invalidates_receipt(self):
        before = validator.working_content_tree(self.repository)
        receipt = valid_receipt(self.repository, before)
        (self.repository / "App" / "Feature.swift").write_text("let value = 2\n", encoding="utf-8")
        receipt["checks"][0]["tree_after"] = validator.working_content_tree(self.repository)
        with self.assertRaisesRegex(ValueError, "stale or changed"):
            validator.validate_receipt(receipt, self.repository, required_check_names=["ios-tests"])

    def test_incomplete_and_failed_receipts_are_rejected(self):
        tree = validator.working_content_tree(self.repository)
        incomplete = valid_receipt(self.repository, tree)
        del incomplete["toolchain"]
        with self.assertRaisesRegex(ValueError, "missing fields"):
            validator.validate_receipt(incomplete, self.repository, required_check_names=["ios-tests"])
        failed = valid_receipt(self.repository, tree)
        failed["checks"][0]["result"] = "failed"
        failed["checks"][0]["exit_code"] = 65
        with self.assertRaisesRegex(ValueError, "did not pass"):
            validator.validate_receipt(failed, self.repository, required_check_names=["ios-tests"])

    def test_identical_tree_evidence_can_bind_to_the_current_pr_head(self):
        tree = validator.working_content_tree(self.repository)
        old_head = run(self.repository, "git", "rev-parse", "HEAD")
        run(self.repository, "git", "commit", "--allow-empty", "-qm", "same tree")
        head = run(self.repository, "git", "rev-parse", "HEAD")
        self.assertNotEqual(old_head, head)
        self.assertEqual(tree, validator.working_content_tree(self.repository))
        receipt = copy.deepcopy(valid_receipt(self.repository, tree))
        receipt["head_oid"] = head
        receipt["head_tree"] = tree
        receipt["reused_from"] = "local-receipt.json"
        validator.validate_receipt(receipt, self.repository, head_oid=head, required_check_names=["ios-tests"])
        with self.assertRaisesRegex(ValueError, "not a commit"):
            validator.validate_receipt(receipt, self.repository, head_oid="different-head", required_check_names=["ios-tests"])

    def test_ignored_build_input_is_explicitly_included(self):
        (self.repository / ".gitignore").write_text("Config.xcconfig\n", encoding="utf-8")
        run(self.repository, "git", "add", ".gitignore")
        run(self.repository, "git", "commit", "-qm", "ignore local config")
        base_tree = validator.working_content_tree(self.repository)
        config = self.repository / "Config.xcconfig"
        config.write_text("FLAG = YES\n", encoding="utf-8")
        self.assertEqual(base_tree, validator.working_content_tree(self.repository))
        omitted = valid_receipt(self.repository, base_tree)
        omitted["classification"]["paths"] = ["Config.xcconfig"]
        with self.assertRaisesRegex(ValueError, "missing from identity included_paths"):
            validator.validate_receipt(omitted, self.repository, required_check_names=["ios-tests"])
        included_tree = validator.working_content_tree(self.repository, ["Config.xcconfig"])
        self.assertNotEqual(base_tree, included_tree)
        receipt = valid_receipt(self.repository, included_tree)
        receipt["classification"]["paths"] = ["Config.xcconfig"]
        receipt["identity"]["included_paths"] = ["Config.xcconfig"]
        validator.validate_receipt(receipt, self.repository, required_check_names=["ios-tests"])
        config.write_text("FLAG = NO\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "stale or changed"):
            validator.validate_receipt(receipt, self.repository, required_check_names=["ios-tests"])

    def test_staged_ignored_build_input_remains_in_the_working_content_tree(self):
        (self.repository / ".gitignore").write_text("Config.xcconfig\n", encoding="utf-8")
        run(self.repository, "git", "add", ".gitignore")
        run(self.repository, "git", "commit", "-qm", "ignore local config")
        config = self.repository / "Config.xcconfig"
        config.write_text("FLAG = YES\n", encoding="utf-8")
        run(self.repository, "git", "add", "-f", "Config.xcconfig")
        before = validator.working_content_tree(self.repository)
        config.write_text("FLAG = NO\n", encoding="utf-8")
        after = validator.working_content_tree(self.repository)
        self.assertNotEqual(before, after)

    def test_deleting_a_tracked_ignored_build_input_needs_no_include(self):
        config = self.repository / "Config.xcconfig"
        config.write_text("FLAG = YES\n", encoding="utf-8")
        (self.repository / ".gitignore").write_text("Config.xcconfig\n", encoding="utf-8")
        run(self.repository, "git", "add", "-f", "Config.xcconfig", ".gitignore")
        run(self.repository, "git", "commit", "-qm", "track ignored config")
        config.unlink()
        run(self.repository, "git", "add", "-u", "Config.xcconfig")
        tree = validator.working_content_tree(self.repository)
        receipt = valid_receipt(self.repository, tree)
        receipt["classification"]["paths"] = ["Config.xcconfig"]
        validator.validate_receipt(receipt, self.repository, required_check_names=["ios-tests"])

    def test_recreated_tracked_ignored_build_input_requires_include(self):
        config = self.repository / "Config.xcconfig"
        config.write_text("FLAG = YES\n", encoding="utf-8")
        (self.repository / ".gitignore").write_text("Config.xcconfig\n", encoding="utf-8")
        run(self.repository, "git", "add", "-f", "Config.xcconfig", ".gitignore")
        run(self.repository, "git", "commit", "-qm", "track ignored config")
        config.unlink()
        run(self.repository, "git", "add", "-u", "Config.xcconfig")
        config.write_text("FLAG = NO\n", encoding="utf-8")
        omitted_tree = validator.working_content_tree(self.repository)
        omitted = valid_receipt(self.repository, omitted_tree)
        omitted["classification"]["paths"] = ["Config.xcconfig"]
        with self.assertRaisesRegex(ValueError, "missing from identity included_paths"):
            validator.validate_receipt(omitted, self.repository, required_check_names=["ios-tests"])
        included_tree = validator.working_content_tree(self.repository, ["Config.xcconfig"])
        self.assertNotEqual(omitted_tree, included_tree)

    def test_unregistered_embedded_repository_is_rejected(self):
        embedded = self.repository / "Vendor" / "Embedded"
        embedded.mkdir(parents=True)
        run(embedded, "git", "init", "-q")
        run(embedded, "git", "config", "user.name", "Contract Test")
        run(embedded, "git", "config", "user.email", "contract@example.invalid")
        (embedded / "Dependency.swift").write_text("let dependency = 1\n", encoding="utf-8")
        run(embedded, "git", "add", ".")
        run(embedded, "git", "commit", "-qm", "embedded fixture")
        with self.assertRaisesRegex(ValueError, "embedded repositories"):
            validator.working_content_tree(self.repository)

    def test_repository_argument_must_be_the_worktree_root(self):
        with self.assertRaisesRegex(ValueError, "worktree root"):
            validator.working_content_tree(self.repository / "App")

    def test_working_content_tree_detects_executable_mode_changes(self):
        script = self.repository / "build.sh"
        script.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        run(self.repository, "git", "add", "build.sh")
        run(self.repository, "git", "commit", "-qm", "add build script")
        run(self.repository, "git", "config", "core.fileMode", "false")
        before = validator.working_content_tree(self.repository)
        script.chmod(0o755)
        after = validator.working_content_tree(self.repository)
        self.assertNotEqual(before, after)

    def test_dirty_submodule_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix="swift dependency ") as dependency_root:
            dependency = Path(dependency_root)
            run(dependency, "git", "init", "-q")
            run(dependency, "git", "config", "user.name", "Contract Test")
            run(dependency, "git", "config", "user.email", "contract@example.invalid")
            source = dependency / "Dependency.swift"
            source.write_text("let dependency = 1\n", encoding="utf-8")
            run(dependency, "git", "add", ".")
            run(dependency, "git", "commit", "-qm", "dependency fixture")
            run(
                self.repository,
                "git",
                "-c",
                "protocol.file.allow=always",
                "submodule",
                "add",
                "-q",
                str(dependency),
                "Vendor/Dependency",
            )
            run(self.repository, "git", "commit", "-qam", "add dependency")
            validator.working_content_tree(self.repository)
            (self.repository / "Vendor" / "Dependency" / "Dependency.swift").write_text(
                "let dependency = 2\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "hard blocker"):
                validator.working_content_tree(self.repository)

    def test_repository_and_receipt_field_types_are_validated(self):
        tree = validator.working_content_tree(self.repository)
        mutations = (
            ("repository", lambda receipt: receipt.__setitem__("repository", "/wrong/repository")),
            ("command", lambda receipt: receipt["checks"][0].__setitem__("command", "")),
            ("artifacts", lambda receipt: receipt["checks"][0].__setitem__("artifacts", "result.xcresult")),
            ("exit_code", lambda receipt: receipt["checks"][0].__setitem__("exit_code", False)),
            ("macos", lambda receipt: receipt["toolchain"].__setitem__("macos", None)),
            ("apple_toolchains", lambda receipt: receipt["toolchain"].update({"xcode": None, "swift": None})),
            ("timestamp", lambda receipt: receipt.__setitem__("started_at", "2026-08-30")),
        )
        for name, mutate in mutations:
            with self.subTest(field=name):
                receipt = valid_receipt(self.repository, tree)
                mutate(receipt)
                with self.assertRaises(ValueError):
                    validator.validate_receipt(receipt, self.repository, required_check_names=["ios-tests"])

    def test_packaged_contract_and_validator_match_canonical_sources(self):
        for copy_path in CONTRACT_COPIES:
            self.assertEqual(copy_path.read_bytes(), CANONICAL_CONTRACT.read_bytes())
        for copy_path in VALIDATOR_COPIES:
            self.assertEqual(copy_path.read_bytes(), CANONICAL_VALIDATOR.read_bytes())

    def test_folder_only_skill_install_can_run_its_packaged_helper(self):
        with tempfile.TemporaryDirectory(prefix="folder only skill ") as install_root:
            for skill in ("local-review-until-clean", "pr-until-ready"):
                source = ROOT / "skills" / skill
                installed = Path(install_root) / skill
                shutil.copytree(source, installed)
                tree_result = run(
                    self.repository,
                    "python3",
                    str(installed / "scripts" / "apple_verification_receipt.py"),
                    "tree",
                    "--repository",
                    str(self.repository),
                )
                self.assertEqual(tree_result, validator.working_content_tree(self.repository))
                route_result = run(
                    self.repository,
                    "python3",
                    str(installed / "scripts" / "apple_verification_receipt.py"),
                    "route",
                    "--authority",
                    "check-only",
                    "--receipt-state",
                    "failed",
                )
                self.assertEqual(json.loads(route_result), {"action": "block-no-repair"})

    def test_both_skills_route_to_the_packaged_contract(self):
        for skill in ("local-review-until-clean", "pr-until-ready"):
            text = (ROOT / "skills" / skill / "SKILL.md").read_text(encoding="utf-8")
            self.assertIn("references/apple-local-verification.md", text)
        pr_text = (ROOT / "skills" / "pr-until-ready" / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn(
            "When equivalent macOS CI covers the same content and applicable checks",
            pr_text,
        )


if __name__ == "__main__":
    unittest.main()
