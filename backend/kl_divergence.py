import math
import logging
from typing import Dict, Any, List

logger = logging.getLogger("ContraMesh.kl_divergence")

def compute_kl_divergence(dist_p: Dict[str, float], dist_q: Dict[str, float], epsilon: float = 1e-6) -> float:
    """
    Computes Kullback-Leibler (KL) Divergence between two probability distributions.
    D_KL(P || Q) = sum_{x} P(x) * log(P(x) / Q(x))
    
    epsilon is added to prevent log(0) or division by zero, and distributions are re-normalized.
    """
    # Align the keys of both distributions (ratings 1 to 5)
    all_keys = sorted(list(set(dist_p.keys()) | set(dist_q.keys())))
    
    # 1. Extract raw probabilities
    raw_p = [dist_p.get(k, 0.0) for k in all_keys]
    raw_q = [dist_q.get(k, 0.0) for k in all_keys]
    
    # 2. Smooth and re-normalize
    p_smooth = [val + epsilon for val in raw_p]
    q_smooth = [val + epsilon for val in raw_q]
    
    sum_p = sum(p_smooth)
    sum_q = sum(q_smooth)
    
    p = [val / sum_p for val in p_smooth]
    q = [val / sum_q for val in q_smooth]
    
    # 3. Compute KL Divergence
    kl_value = 0.0
    for pi, qi in zip(p, q):
        # pi and qi will both be > 0 due to smoothing
        kl_value += pi * math.log(pi / qi)
        
    return kl_value

class AsymmetryChecker:
    def __init__(self, gemma_client):
        self.gemma_client = gemma_client

    def check_clause_asymmetry(self, clause_text: str, party_a: str = "Tenant", party_b: str = "Landlord") -> Dict[str, Any]:
        """
        Runs the role swapping asymmetry evaluations:
        1. Fetch fairness distribution for Party A (e.g., Tenant)
        2. Fetch fairness distribution for Party B (e.g., Landlord)
        3. Compute KL divergence.
        """
        # Run A: Evaluate fairness for Party A
        dist_p = self.gemma_client.swap_roles_and_rate(clause_text, rate_for=party_a)
        
        # Run B: Swap roles and evaluate fairness for Party B
        dist_q = self.gemma_client.swap_roles_and_rate(clause_text, rate_for=party_b)
        
        # Calculate KL(P || Q) - Asymmetry relative to Party A's perspective
        kl_div_ab = compute_kl_divergence(dist_p, dist_q)
        
        # Calculate KL(Q || P) - Asymmetry relative to Party B's perspective
        kl_div_ba = compute_kl_divergence(dist_q, dist_p)
        
        # Highlight asymmetry if KL divergence is significant (e.g., > 0.5)
        is_asymmetric = kl_div_ab > 0.5 or kl_div_ba > 0.5
        
        # Determine who benefits based on distributions
        # Weighted rating = sum(rate_val * prob)
        def weighted_rating(dist):
            try:
                return sum(float(k) * v for k, v in dist.items())
            except Exception:
                return 3.0 # neutral default

        rating_a = weighted_rating(dist_p)
        rating_b = weighted_rating(dist_q)
        
        benefits = "Neutral"
        if is_asymmetric:
            if rating_b > rating_a + 0.5:
                benefits = party_b
            elif rating_a > rating_b + 0.5:
                benefits = party_a

        return {
            "clause_text": clause_text,
            "distribution_party_a": dist_p,
            "distribution_party_b": dist_q,
            "rating_party_a": round(rating_a, 2),
            "rating_party_b": round(rating_b, 2),
            "kl_divergence_ab": round(kl_div_ab, 4),
            "kl_divergence_ba": round(kl_div_ba, 4),
            "is_asymmetric": is_asymmetric,
            "benefits": benefits
        }
