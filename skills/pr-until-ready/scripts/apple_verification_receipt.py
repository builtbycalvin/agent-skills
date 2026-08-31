#!/usr/bin/env python3

from argparse import ArgumentParser
from datetime import datetime
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tempfile
from collections.abc import Sequence


REQUIRED_FIELDS = {
    "schema",
    "repository",
    "content_tree",
    "head_oid",
    "head_tree",
    "reused_from",
    "bound_at",
    "classification",
    "identity",
    "checks",
    "toolchain",
    "started_at",
    "completed_at",
    "verdict",
}
AUTHORITIES = {"check-only", "repair-authorized"}
RECEIPT_STATES = {
    "absent",
    "incomplete",
    "stale-content-tree",
    "valid-current-tree",
    "snapshot-changed-during-run",
    "failed",
    "failed-validated-in-scope",
    "valid-before-apple-repair",
}
ROUTE_ACTIONS = {
    (authority, state): "run-final-verification"
    for authority in AUTHORITIES
    for state in {"absent", "incomplete", "stale-content-tree"}
}
ROUTE_ACTIONS.update(
    {
        ("check-only", "valid-current-tree"): "reuse-receipt",
        ("repair-authorized", "valid-current-tree"): "reuse-receipt",
        ("check-only", "snapshot-changed-during-run"): "stabilize-and-rerun",
        ("repair-authorized", "snapshot-changed-during-run"): "stabilize-and-rerun",
        ("check-only", "failed"): "block-no-repair",
        ("repair-authorized", "failed"): "diagnose-failure",
        ("check-only", "failed-validated-in-scope"): "block-no-repair",
        ("repair-authorized", "failed-validated-in-scope"): "repair-focused-then-final",
        ("check-only", "valid-before-apple-repair"): "invalidate-and-run-after-stable",
        ("repair-authorized", "valid-before-apple-repair"): "invalidate-and-run-after-stable",
    }
)


def git(repository, *args, env=None):
    return subprocess.run(
        ["git", "-C", str(repository), *args],
        check=True,
        capture_output=True,
        text=True,
        env=env,
    ).stdout.strip()


def reject_unsupported_submodules(repository):
    status = subprocess.run(
        ["git", "-C", str(repository), "submodule", "status", "--recursive"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.splitlines()
    unsupported = [line for line in status if line and line[0] in {"-", "+", "U"}]
    if unsupported:
        raise ValueError(
            "dirty, divergent, conflicted, or uninitialized recursive submodules are a hard blocker; "
            "commit or check out the intended submodule content and record its commit in the superproject gitlink"
        )
    dirty = subprocess.run(
        [
            "git",
            "-C",
            str(repository),
            "submodule",
            "foreach",
            "--quiet",
            "--recursive",
            'test -z "$(git status --porcelain=v1 --untracked-files=all)"',
        ],
        capture_output=True,
        text=True,
    )
    if dirty.returncode != 0:
        raise ValueError(
            "dirty, divergent, conflicted, or uninitialized recursive submodules are a hard blocker; "
            "commit or check out the intended submodule content and record its commit in the superproject gitlink"
        )


def require_repo_path(repository, value, field, *, allow_empty=False):
    repository = Path(repository).resolve()
    if not isinstance(value, list) or (not allow_empty and not value):
        raise ValueError(f"{field} must be a nonempty list of repository-relative paths")
    if allow_empty and not value:
        return value
    normalized = []
    for path in value:
        if not isinstance(path, str) or not path or "\\" in path or "\x00" in path:
            raise ValueError(f"{field} must contain normalized repository-relative paths")
        pure_path = PurePosixPath(path)
        if pure_path.is_absolute() or not pure_path.parts or pure_path.as_posix() != path or ".." in pure_path.parts:
            raise ValueError(f"{field} must contain normalized repository-relative paths")
        resolved = (repository / path).resolve(strict=False)
        try:
            resolved.relative_to(repository)
        except ValueError as error:
            raise ValueError(f"{field} must stay inside the repository") from error
        normalized.append(path)
    return normalized


def working_content_tree(repository, included_paths=()):
    repository = Path(repository).resolve()
    included_paths = require_repo_path(repository, list(included_paths), "identity.included_paths", allow_empty=True)
    reject_unsupported_submodules(repository)
    with tempfile.TemporaryDirectory(prefix="apple-verification-index-") as index_directory:
        environment = os.environ.copy()
        environment["GIT_INDEX_FILE"] = str(Path(index_directory) / "index")
        git(repository, "read-tree", "HEAD", env=environment)
        git(repository, "add", "-A", "--", ".", env=environment)
        if included_paths:
            git(repository, "add", "-f", "--", *included_paths, env=environment)
        return git(repository, "write-tree", env=environment)


def ignored_untracked_paths(repository, paths):
    ignored = []
    for path in paths:
        tracked = subprocess.run(
            ["git", "-C", str(repository), "ls-files", "--error-unmatch", "--", path],
            capture_output=True,
        )
        if tracked.returncode == 0:
            continue
        result = subprocess.run(
            ["git", "-C", str(repository), "check-ignore", "-q", "--", path],
            capture_output=True,
        )
        if result.returncode == 0:
            ignored.append(path)
        elif result.returncode != 1:
            raise ValueError(f"could not classify ignored path: {path}")
    return ignored


def route_verification(authority, receipt_state):
    if not isinstance(authority, str) or authority not in AUTHORITIES:
        raise ValueError(f"unknown verification authority: {authority}")
    if not isinstance(receipt_state, str) or receipt_state not in RECEIPT_STATES:
        raise ValueError(f"unknown receipt state: {receipt_state}")
    return {"action": ROUTE_ACTIONS[(authority, receipt_state)]}


def parse_time(value, field):
    if not isinstance(value, str) or "T" not in value:
        raise ValueError(f"{field} must be an RFC-3339 timestamp")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError(f"{field} must include a UTC offset")
    return parsed


def require_nonempty_string(value, field):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a nonempty string")


def require_tree(value, field):
    if not isinstance(value, str) or re.fullmatch(r"(?:[0-9a-f]{40}|[0-9a-f]{64})", value) is None:
        raise ValueError(f"{field} must be a Git tree object id")


def validate_receipt(receipt, repository, *, head_oid=None, required_check_names):
    if not isinstance(receipt, dict):
        raise ValueError("receipt must be a JSON object")
    missing = REQUIRED_FIELDS - receipt.keys()
    if missing:
        raise ValueError(f"missing fields: {', '.join(sorted(missing))}")
    extra = receipt.keys() - REQUIRED_FIELDS
    if extra:
        raise ValueError(f"unknown fields: {', '.join(sorted(extra))}")
    if receipt["schema"] != "apple-local-verification/v1":
        raise ValueError("unsupported schema")
    repository = Path(repository).resolve()
    require_nonempty_string(receipt["repository"], "repository")
    receipt_repository = Path(receipt["repository"])
    if not receipt_repository.is_absolute() or receipt_repository.resolve() != repository:
        raise ValueError("receipt repository does not match the target repository")
    require_tree(receipt["content_tree"], "content_tree")
    classification_fields = {"result", "paths", "rationale"}
    if not isinstance(receipt["classification"], dict):
        raise ValueError("classification must be an object")
    if receipt["classification"].keys() - classification_fields:
        raise ValueError("classification contains unknown fields")
    if receipt["classification"].get("result") != "apple-build-affecting":
        raise ValueError("classification is not apple-build-affecting")
    paths = require_repo_path(repository, receipt["classification"].get("paths"), "classification.paths")
    require_nonempty_string(receipt["classification"].get("rationale"), "classification rationale")
    if receipt["verdict"] != "passed":
        raise ValueError("receipt did not pass")
    if not isinstance(receipt["checks"], list) or not receipt["checks"]:
        raise ValueError("at least one applicable check is required")
    if (
        isinstance(required_check_names, (str, bytes))
        or not isinstance(required_check_names, Sequence)
        or not required_check_names
        or any(not isinstance(name, str) or not name.strip() for name in required_check_names)
        or len(set(required_check_names)) != len(required_check_names)
    ):
        raise ValueError("required_check_names must be a nonempty duplicate-free ordered sequence")
    check_names = []
    for check in receipt["checks"]:
        required = {"name", "command", "result", "exit_code", "artifacts", "tree_before", "tree_after"}
        if not isinstance(check, dict) or required - check.keys():
            raise ValueError("check is incomplete")
        if check.keys() - required:
            raise ValueError("check contains unknown fields")
        require_nonempty_string(check["name"], "check name")
        check_names.append(check["name"])
        require_nonempty_string(check["command"], "check command")
        if check["result"] != "passed" or check["exit_code"] != 0:
            raise ValueError(f"check did not pass: {check['name']}")
        if type(check["exit_code"]) is not int:
            raise ValueError("check exit_code must be an integer")
        if not isinstance(check["artifacts"], list) or not all(isinstance(path, str) and path for path in check["artifacts"]):
            raise ValueError("check artifacts must be a list of paths")
        require_tree(check["tree_before"], f"check {check['name']} tree_before")
        require_tree(check["tree_after"], f"check {check['name']} tree_after")
    if len(set(check_names)) != len(check_names):
        raise ValueError("check names must be unique")
    if check_names != list(required_check_names):
        raise ValueError("required_check_names must exactly match checks in order")
    identity = receipt["identity"]
    identity_fields = {"command", "included_paths"}
    if not isinstance(identity, dict) or identity_fields - identity.keys():
        raise ValueError("identity is incomplete")
    if identity.keys() - identity_fields:
        raise ValueError("identity contains unknown fields")
    require_nonempty_string(identity["command"], "identity command")
    included_paths = identity["included_paths"]
    included_paths = require_repo_path(repository, included_paths, "identity.included_paths", allow_empty=True)
    missing_ignored_paths = set(ignored_untracked_paths(repository, paths)) - set(included_paths)
    if missing_ignored_paths:
        raise ValueError(
            "ignored classified paths are missing from identity included_paths: "
            + ", ".join(sorted(missing_ignored_paths))
        )
    current_tree = working_content_tree(repository, included_paths)
    if receipt["content_tree"] != current_tree:
        raise ValueError("content tree is stale or changed during verification")
    for check in receipt["checks"]:
        if check["tree_before"] != check["tree_after"] or check["tree_before"] != current_tree:
            raise ValueError(f"check tree does not match the current content tree: {check['name']}")
    if head_oid is not None:
        try:
            resolved_head = git(repository, "rev-parse", "--verify", f"{head_oid}^{{commit}}")
            resolved_head_tree = git(repository, "rev-parse", "--verify", f"{resolved_head}^{{tree}}")
        except subprocess.CalledProcessError as error:
            raise ValueError("head_oid is not a commit in the target repository") from error
        if receipt["head_oid"] != resolved_head or receipt["head_tree"] != resolved_head_tree:
            raise ValueError("receipt does not match the current PR head and tree")
        if any(check["tree_before"] != resolved_head_tree for check in receipt["checks"]):
            raise ValueError("check tree does not match the current PR head tree")
    elif receipt["head_oid"] is not None or receipt["head_tree"] is not None:
        raise ValueError("current PR head is required to validate a head-bound receipt")
    if receipt["reused_from"] is not None:
        require_nonempty_string(receipt["reused_from"], "reused_from")
    if not isinstance(receipt["toolchain"], dict) or set(receipt["toolchain"]) != {"xcode", "swift", "macos"}:
        raise ValueError("toolchain is incomplete")
    for field in ("xcode", "swift", "macos"):
        require_nonempty_string(receipt["toolchain"][field], f"toolchain {field}")
    started = parse_time(receipt["started_at"], "started_at")
    completed = parse_time(receipt["completed_at"], "completed_at")
    bound = parse_time(receipt["bound_at"], "bound_at")
    if not started <= completed <= bound:
        raise ValueError("receipt timestamps are out of order")
    return current_tree


def main():
    parser = ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    tree_parser = subparsers.add_parser("tree")
    tree_parser.add_argument("--repository", required=True)
    tree_parser.add_argument("--include", action="append", default=[])
    validate_parser = subparsers.add_parser("validate")
    validate_parser.add_argument("receipt")
    validate_parser.add_argument("--repository", required=True)
    validate_parser.add_argument("--head-oid")
    validate_parser.add_argument("--required-check", action="append", required=True)
    route_parser = subparsers.add_parser("route")
    route_parser.add_argument("--authority", required=True)
    route_parser.add_argument("--receipt-state", required=True)
    args = parser.parse_args()

    if args.command == "tree":
        print(working_content_tree(args.repository, args.include))
        return

    if args.command == "route":
        print(json.dumps(route_verification(args.authority, args.receipt_state), sort_keys=True))
        return

    receipt = json.loads(Path(args.receipt).read_text(encoding="utf-8"))
    current_tree = validate_receipt(
        receipt,
        args.repository,
        head_oid=args.head_oid,
        required_check_names=args.required_check,
    )
    print(f"valid: {current_tree}")


if __name__ == "__main__":
    main()
