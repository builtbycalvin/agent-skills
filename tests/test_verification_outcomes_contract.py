from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
CANONICAL_CONTRACT = ROOT / "shared" / "verification-outcomes.md"
CONTRACT_COPIES = (
    ROOT / "skills" / "local-review-until-clean" / "references" / "verification-outcomes.md",
    ROOT / "skills" / "pr-until-ready" / "references" / "verification-outcomes.md",
)


class VerificationOutcomesContractTests(unittest.TestCase):
    def test_packaged_contracts_match_the_canonical_source(self):
        for copy_path in CONTRACT_COPIES:
            self.assertEqual(copy_path.read_bytes(), CANONICAL_CONTRACT.read_bytes())

    def test_both_skills_route_to_the_packaged_contract(self):
        for skill in ("local-review-until-clean", "pr-until-ready"):
            text = (ROOT / "skills" / skill / "SKILL.md").read_text(encoding="utf-8")
            self.assertIn("references/verification-outcomes.md", text)


if __name__ == "__main__":
    unittest.main()
