#!/usr/bin/env python3

from argparse import ArgumentParser
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "shared" / "verification-outcomes.md"
TARGETS = (
    ROOT / "skills" / "local-review-until-clean" / "references" / "verification-outcomes.md",
    ROOT / "skills" / "pr-until-ready" / "references" / "verification-outcomes.md",
)


def main() -> int:
    parser = ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    stale = [
        target
        for target in TARGETS
        if not target.exists() or target.read_bytes() != SOURCE.read_bytes()
    ]

    if args.check:
        for target in stale:
            print(f"stale: {target.relative_to(ROOT)}", file=sys.stderr)
        return 1 if stale else 0

    for target in stale:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(SOURCE.read_bytes())
        print(f"updated: {target.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
