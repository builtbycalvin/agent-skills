#!/usr/bin/env python3

from argparse import ArgumentParser
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
COPIES = (
    (
        ROOT / "shared" / "apple-local-verification.md",
        ROOT / "skills" / "local-review-until-clean" / "references" / "apple-local-verification.md",
    ),
    (
        ROOT / "shared" / "apple-local-verification.md",
        ROOT / "skills" / "pr-until-ready" / "references" / "apple-local-verification.md",
    ),
    (
        ROOT / "shared" / "apple_verification_receipt.py",
        ROOT / "skills" / "local-review-until-clean" / "scripts" / "apple_verification_receipt.py",
    ),
    (
        ROOT / "shared" / "apple_verification_receipt.py",
        ROOT / "skills" / "pr-until-ready" / "scripts" / "apple_verification_receipt.py",
    ),
)


def main() -> int:
    parser = ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    stale = [
        (source, target)
        for source, target in COPIES
        if not target.exists() or target.read_bytes() != source.read_bytes()
    ]

    if args.check:
        for _, target in stale:
            print(f"stale: {target.relative_to(ROOT)}", file=sys.stderr)
        return 1 if stale else 0

    for source, target in stale:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.read_bytes())
        print(f"updated: {target.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
