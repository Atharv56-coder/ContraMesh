import os
import shutil
import tempfile
import logging
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Import local modules
from pdf_parser import extract_text_from_pdf
from gemma_client import GemmaClient
from graph_db import get_graph_db
from z3_solver import Z3ContractSolver
from kl_divergence import AsymmetryChecker

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("ContraMesh.main")

app = FastAPI(title="ContraMesh Backend API", version="1.0.0")

# Setup CORS middleware to allow React frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development ease
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Shared singletons, configured with fallbacks automatically
DB_URI = os.getenv("MEMGRAPH_URI", "bolt://localhost:7687")
VLLM_URL = os.getenv("VLLM_API_URL", "http://localhost:8000/v1")

gemma = GemmaClient(VLLM_URL)
graph_db = get_graph_db(DB_URI)
solver = Z3ContractSolver()
asymmetry_checker = AsymmetryChecker(gemma)

# Store document text in-memory for chat operations
class ContractStore:
    raw_text: str = ""
    extracted_data: Dict[str, Any] = {"parties": [], "rules": []}

store = ContractStore()
store.raw_text = """RESIDENTIAL LEASE AGREEMENT

2. LEAK REPORTING AND INDEMNIFICATION
Tenant must submit a Written Leak Report within 3 days of any water leak occurrence. Failure to report within 3 days shall constitute material breach.

3. METHOD OF NOTICE AND TRANSIT
All formal reports must be sent via Registered Physical Mail. Registered physical mail takes exactly 5 days to deliver and process. No email or verbal notifications shall be recognized.

4. LANDLORD TERMINATION RIGHTS
The Landlord reserves the absolute right to terminate this lease immediately and without notice, for any reason, at their sole discretion.

5. TENANT TERMINATION RIGHTS
The Tenant must provide the Landlord with at least 60 days written notice prior to the intended move-out date."""

store.extracted_data = gemma._mock_extraction(store.raw_text, "Tenant")

class ChatRequest(BaseModel):
    message: str
    history: List[Dict[str, str]] = []

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "ContraMesh API Server",
        "gemma_online": gemma.is_service_online(),
        "graph_db_type": type(graph_db).__name__
    }

@app.post("/api/upload")
async def upload_document(
    file: UploadFile = File(...),
    user_role: str = Form("Tenant")
):
    """
    Accepts PDF contract, extracts text, calls Gemma 4 (or mock fallback) to perform 
    ontological entity-relationship extraction, clears previous graph, and populates Memgraph.
    """
    logger.info(f"Received document upload: {file.filename}, user_role: {user_role}")
    
    suffix = os.path.splitext(file.filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        try:
            shutil.copyfileobj(file.file, temp_file)
            temp_path = temp_file.name
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {e}")
            
    try:
        # 1. Parse text from document
        raw_text = extract_text_from_pdf(temp_path)
        if not raw_text.strip():
            raise HTTPException(status_code=400, detail="Document text extraction resulted in blank content.")
            
        store.raw_text = raw_text
        
        # 2. Extract rules and entities
        extracted_data = gemma.extract_legal_rules(raw_text, user_role=user_role)
        store.extracted_data = extracted_data
        
        # 3. Populate database
        graph_db.clear()
        
        # Add parties
        for party in extracted_data.get("parties", []):
            graph_db.add_party(party)
            
        # Add clauses / obligations
        for idx, rule in enumerate(extracted_data.get("rules", [])):
            clause_id = rule.get("id", f"R-{idx}")
            original_text = rule.get("original_text", "")
            action = rule.get("action", "")
            condition = rule.get("condition", "")
            party = rule.get("party", "Unknown")
            rule_type = rule.get("type", "obligation")
            
            # Map clause representation
            graph_db.add_clause(
                clause_id=f"C-{clause_id}",
                title=f"Source clause for {clause_id}",
                text=original_text
            )
            
            # Map obligation node and associate to party and clause
            graph_db.add_obligation(
                rule_id=clause_id,
                party=party,
                rule_type=rule_type,
                action=action,
                condition=condition,
                clause_id=f"C-{clause_id}"
            )
            
        return {
            "message": "Document parsed, entities extracted, and graph ontological mapping completed successfully.",
            "parties": extracted_data.get("parties", []),
            "rules_count": len(extracted_data.get("rules", [])),
            "graph_nodes_count": len(graph_db.get_graph_data()["nodes"])
        }
        
    except Exception as e:
        logger.error(f"Error processing document: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to process document: {str(e)}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@app.get("/api/graph")
def get_graph():
    """Returns the visual representation of current ontological rules mapping."""
    try:
        return graph_db.get_graph_data()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query graph: {e}")


@app.post("/api/verify")
def verify_contract():
    """
    Submits current logic nodes to Z3 logic calculator and computes
    role-swapped KL divergence values to detect biases.
    """
    rules = store.extracted_data.get("rules", [])
    parties = store.extracted_data.get("parties", [])
    
    if not rules:
        raise HTTPException(status_code=400, detail="No contract rules loaded. Please upload a document first.")
        
    try:
        # 1. Run Z3 Verification
        z3_results = solver.verify_rules(rules)
        
        # 2. Run KL-Divergence Asymmetry Checking
        asymmetries = []
        party_a = parties[0] if len(parties) > 0 else "Tenant"
        party_b = parties[1] if len(parties) > 1 else "Landlord"
        
        for rule in rules:
            text = rule.get("original_text", "")
            res = asymmetry_checker.check_clause_asymmetry(text, party_a=party_a, party_b=party_b)
            
            # If Z3 found a contradiction in this rule, link it to the report
            is_contradictory = any(c.get("rule_id") == rule.get("id") for c in z3_results.get("contradictions", []))
            
            asymmetries.append({
                "rule_id": rule.get("id"),
                "is_contradictory": is_contradictory,
                **res
            })
            
            # Map Z3 contradiction link in DB if found
            if is_contradictory:
                for other_item in z3_results.get("contradictions", []):
                    other_id = other_item.get("rule_id")
                    if other_id != rule.get("id"):
                        try:
                            graph_db.add_relationship(rule.get("id"), other_id, "CONTRADICTS")
                        except Exception:
                            pass # Fallback handler safe
                            
        return {
            "z3": z3_results,
            "asymmetries": asymmetries
        }
    except Exception as e:
        logger.error(f"Error solving logic dependencies: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to parse logic validation: {str(e)}")


@app.post("/api/chat")
def chat(request: ChatRequest):
    """
    Queries Gemma via vLLM using document context, and falls back to
    smart local answers if offline.
    """
    if not store.raw_text:
        return {"response": "I don't have a contract uploaded yet! Please upload a PDF contract first."}
        
    # Build complete rules context
    context = "\n".join([f"- {r.get('id')}: {r.get('original_text')}" for r in store.extracted_data.get("rules", [])])
    
    try:
        response_text = gemma.query_chat(request.message, context)
        return {"response": response_text}
    except Exception as e:
        logger.error(f"Chat execution failed: {e}", exc_info=True)
        return {"response": "I'm sorry, I encountered an error checking the contract database."}


if __name__ == "__main__":
    import uvicorn
    # Read port from env, default to 8000
    port = int(os.getenv("PORT", 8000))
    print(f"Starting ContraMesh API on port {port}...")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
