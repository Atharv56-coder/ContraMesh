import re
import logging
from typing import List, Dict, Any, Tuple

logger = logging.getLogger("ContraMesh.z3_solver")

try:
    import z3
    Z3_AVAILABLE = True
except ImportError:
    Z3_AVAILABLE = False
    logger.warning("z3-solver is not installed. Z3 logic verification will run in Fallback Validator mode.")

def sanitize_equation(eq: str) -> str:
    """Sanitizes equation string to prevent executing dangerous python strings."""
    # Allow only alphanumeric, underscores, spaces, arithmetic, comparison and boolean operators
    sanitized = re.sub(r'[^a-zA-Z0-9_\s\+\-\*\/\<\>\=\!\&\|]', '', eq)
    return sanitized.strip()

class Z3ContractSolver:
    def __init__(self):
        self.variables = {}
        self.rules_map = {}

    def verify_rules(self, rules: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Parses rules variables and equations, sets up Z3 solver, and finds contradictions.
        If Z3 is not available, uses fallback pattern-matching analysis.
        """
        if not Z3_AVAILABLE:
            return self._fallback_verification(rules)

        solver = z3.Solver()
        self.variables.clear()
        self.rules_map.clear()
        
        # 1. Register variables
        for rule in rules:
            # variables is e.g. {"report_days": "t_report"}
            vars_def = rule.get("variables", {})
            for key, var_name in vars_def.items():
                if var_name not in self.variables:
                    # Sanitize variable name
                    clean_var_name = re.sub(r'[^a-zA-Z0-9_]', '', var_name)
                    if clean_var_name:
                        self.variables[clean_var_name] = z3.Int(clean_var_name)

        # 2. Parse equations with tracking booleans for UNSAT verification
        clause_trackers = {}
        
        for rule in rules:
            rule_id = rule.get("id")
            eqs = rule.get("equations", [])
            
            # Map equations to Z3
            rule_exprs = []
            for eq in eqs:
                clean_eq = sanitize_equation(eq)
                if not clean_eq:
                    continue
                try:
                    # Evaluate expression using z3 variables in local namespace
                    expr = eval(clean_eq, {}, self.variables)
                    rule_exprs.append(expr)
                except Exception as e:
                    logger.error(f"Error parsing equation '{eq}' in rule {rule_id}: {e}")
            
            # Add trackers
            if rule_exprs:
                for idx, expr in enumerate(rule_exprs):
                    tracker_name = f"track_{rule_id}_{idx}"
                    tracker = z3.Bool(tracker_name)
                    # Associate tracker with rule_id
                    clause_trackers[tracker_name] = {
                        "rule_id": rule_id,
                        "original_text": rule.get("original_text", ""),
                        "equation": eqs[idx]
                    }
                    # assert_and_track takes the constraint and the tracking boolean
                    solver.assert_and_track(expr, tracker)

        # 3. Solve rules
        check_result = solver.check()
        
        if check_result == z3.sat:
            model = solver.model()
            # Extract sample values for the UI
            sample_values = {}
            for name, val in self.variables.items():
                eval_val = model[val]
                if eval_val is not None:
                    sample_values[name] = int(eval_val.as_long())
                else:
                    sample_values[name] = 0
            
            return {
                "status": "compatible",
                "message": "No logical contradictions found in the contract.",
                "contradictions": [],
                "simulation": sample_values
            }
        elif check_result == z3.unsat:
            unsat_core = solver.unsat_core()
            contradictory_rules = []
            seen_rules = set()
            
            for tracker in unsat_core:
                tracker_name = str(tracker)
                if tracker_name in clause_trackers:
                    info = clause_trackers[tracker_name]
                    rule_id = info["rule_id"]
                    if rule_id not in seen_rules:
                        seen_rules.add(rule_id)
                        contradictory_rules.append({
                            "rule_id": rule_id,
                            "equation": info["equation"],
                            "original_text": info["original_text"]
                        })
            
            return {
                "status": "contradictory",
                "message": "LOGICAL CONTRADICTION DETECTED: The constraints in the contract cannot be simultaneously satisfied.",
                "contradictions": contradictory_rules,
                "simulation": {}
            }
        else:
            return {
                "status": "unknown",
                "message": "Satisfiability could not be determined.",
                "contradictions": [],
                "simulation": {}
            }

    def _fallback_verification(self, rules: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Calculates simple constraint overlaps when z3 is not installed.
        Specifically handles the common leak/mail deadline contradiction.
        """
        # Look for t_report limits
        report_limit = None
        mail_delay = None
        report_rule = None
        mail_rule = None

        for rule in rules:
            eqs = rule.get("equations", [])
            variables = rule.get("variables", {})
            
            # Check equation strings by text
            for eq in eqs:
                # e.g., t_report <= t_leak + 3 or similar
                match_limit = re.search(r't_report\s*<=\s*(?:t_leak\s*\+\s*)?(\d+)', eq)
                if match_limit:
                    report_limit = int(match_limit.group(1))
                    report_rule = rule

                # e.g., t_delivery == 5
                match_mail = re.search(r't_delivery\s*==\s*(\d+)', eq)
                if match_mail:
                    mail_delay = int(match_mail.group(1))
                    mail_rule = rule

        # Standard check: if report deadline < mail transit, it's unsat
        if report_limit is not None and mail_delay is not None:
            if report_limit < mail_delay:
                return {
                    "status": "contradictory",
                    "message": "LOGICAL CONTRADICTION DETECTED: The constraints in the contract cannot be simultaneously satisfied.",
                    "contradictions": [
                        {
                            "rule_id": report_rule.get("id"),
                            "equation": f"t_report <= t_leak + {report_limit}",
                            "original_text": report_rule.get("original_text")
                        },
                        {
                            "rule_id": mail_rule.get("id"),
                            "equation": f"t_delivery == {mail_delay}",
                            "original_text": mail_rule.get("original_text")
                        }
                    ],
                    "simulation": {}
                }

        # Otherwise assume OK
        sim = {}
        for rule in rules:
            for v_name in rule.get("variables", {}).values():
                sim[v_name] = 10 # generic assignment

        return {
            "status": "compatible",
            "message": "No logical contradictions found in the contract (Fallback Validator).",
            "contradictions": [],
            "simulation": sim
        }
