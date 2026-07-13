import unittest
from pdf_parser import extract_text_from_pdf
from gemma_client import GemmaClient
from graph_db import InMemoryGraphConnector
from z3_solver import Z3ContractSolver
from kl_divergence import compute_kl_divergence, AsymmetryChecker

class TestContraMeshBackend(unittest.TestCase):
    def setUp(self):
        self.gemma = GemmaClient()
        self.db = InMemoryGraphConnector()
        self.solver = Z3ContractSolver()
        self.asymmetry = AsymmetryChecker(self.gemma)

    def test_pdf_parser_fallback(self):
        # We can write a dummy text file to test
        import tempfile
        import os
        with tempfile.NamedTemporaryFile(delete=False, suffix=".txt") as f:
            f.write(b"Lease Contract Agreement\nTenant must pay Rent.")
            temp_name = f.name
        
        try:
            text = extract_text_from_pdf(temp_name)
            self.assertIn("Lease Contract Agreement", text)
        finally:
            if os.path.exists(temp_name):
                os.remove(temp_name)

    def test_gemma_client_mock(self):
        # Test mock extraction returns valid format
        res = self.gemma.extract_legal_rules("Tenant has 3 days to report a leak. All reports must be sent by mail.", "Tenant")
        self.assertIn("parties", res)
        self.assertIn("rules", res)
        self.assertEqual(len(res["parties"]), 2)
        self.assertGreater(len(res["rules"]), 0)

    def test_gemma_client_chat(self):
        # Test mock chat responses for loops/asymmetry
        resp1 = self.gemma.query_chat("Is there a loophole?", "Leak reporting rules")
        self.assertIn("loophole", resp1.lower())
        
        resp2 = self.gemma.query_chat("Explain asymmetry", "Lease agreement notice policy")
        self.assertIn("asymmetry", resp2.lower())

    def test_graph_db_in_memory(self):
        self.db.clear()
        self.db.add_party("Tenant")
        self.db.add_obligation("R-1", "Tenant", "obligation", "report leak", "leak occurred", "C-R-1")
        data = self.db.get_graph_data()
        self.assertEqual(len(data["nodes"]), 3) # Tenant, R-1, C-R-1
        self.assertEqual(len(data["links"]), 2) # HAS_OBLIGATION, DEFINED_IN

    def test_z3_solver_contradiction(self):
        # Construct the leak/mail contradiction:
        # Rule 1: report leak <= LeakDay + 3 -> t_report <= t_leak + 3
        # Rule 2: report mail >= transit (5) -> t_report >= 5
        # If t_leak = 0, can we satisfy? t_report <= 3 and t_report >= 5 is UNSAT!
        rules = [
            {
                "id": "R-1",
                "party": "Tenant",
                "type": "obligation",
                "action": "report leak",
                "condition": "Tenant must report leak within 3 days",
                "variables": {
                    "report_days": "t_report",
                    "leak_day": "t_leak"
                },
                "equations": [
                    "t_report <= t_leak + 3",
                    "t_report >= 0",
                    "t_leak == 0"
                ],
                "original_text": "Tenant has 3 days to report a leak."
            },
            {
                "id": "R-2",
                "party": "Tenant",
                "type": "obligation",
                "action": "sent by mail",
                "condition": "All reports sent by physical mail taking 5 days",
                "variables": {
                    "report_days": "t_report",
                    "mail_delivery": "t_delivery"
                },
                "equations": [
                    "t_report >= t_delivery",
                    "t_delivery == 5"
                ],
                "original_text": "All reports must be sent by physical mail."
            }
        ]
        
        result = self.solver.verify_rules(rules)
        self.assertEqual(result["status"], "contradictory")
        self.assertGreater(len(result["contradictions"]), 0)
        # Check rule IDs are in contradictions
        ids = [c["rule_id"] for c in result["contradictions"]]
        self.assertIn("R-1", ids)
        self.assertIn("R-2", ids)

    def test_kl_divergence_math(self):
        # Standard same distribution: KL = 0
        dist_p = {"1": 0.1, "2": 0.2, "3": 0.4, "4": 0.2, "5": 0.1}
        dist_q = {"1": 0.1, "2": 0.2, "3": 0.4, "4": 0.2, "5": 0.1}
        kl = compute_kl_divergence(dist_p, dist_q)
        self.assertAlmostEqual(kl, 0.0, places=3)
        
        # Asymmetrical distribution: High KL
        dist_p = {"1": 0.8, "2": 0.1, "3": 0.05, "4": 0.03, "5": 0.02} # tenant: very unfair
        dist_q = {"1": 0.02, "2": 0.03, "3": 0.1, "4": 0.35, "5": 0.5} # landlord: very favorable
        kl = compute_kl_divergence(dist_p, dist_q)
        self.assertGreater(kl, 1.0)

if __name__ == "__main__":
    unittest.main()
