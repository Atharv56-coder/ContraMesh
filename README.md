<div align="center">

# ⚖️ ContraMesh: The Algorithmic Legal Bodyguard

> *Don't sign what you can't prove is safe.*

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18+-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6+-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![Gemma 2](https://img.shields.io/badge/Gemma%202-9B--it-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/gemma)
[![Z3 Solver](https://img.shields.io/badge/Z3-SMT%20Solver-6D28D9?style=for-the-badge)](https://github.com/Z3Prover/z3)

**ContraMesh** is an AI-powered contract intelligence platform that uses **Gemma 2**, **Z3 SMT solving**, and **KL-Divergence** to automatically detect logical loopholes, impossible obligations, and power asymmetries in any legal agreement — before you sign.

[🚀 Features](#-features) · [🏗️ Architecture](#%EF%B8%8F-architecture) · [⚡ Quick Start](#-quick-start) · [🧪 Testing](#-testing-with-sample-contracts) · [📁 Project Structure](#-project-structure)

</div>

---

## 🎯 The Problem

Legal contracts are deliberately obfuscated. A single sentence buried in Clause 12 can make Clause 3 mathematically impossible to comply with — leaving you liable before you even act. Traditional legal review is slow, expensive, and still misses **combinatorial logic traps** across clauses.

ContraMesh solves this with **formal methods** + **LLMs** + **information theory**.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🧠 **Gemma 2 Extraction** | Uses `gemma-2-9b-it` to extract structured legal obligations, permissions, and prohibitions from any uploaded contract |
| 🔢 **Z3 SMT Solver** | Formal symbolic math verification that proves whether all clauses can be satisfied simultaneously |
| 📊 **KL-Divergence Asymmetry** | Measures how biased each clause is toward one party using information-theoretic fairness scoring |
| 🕸️ **Ontology Graph** | Interactive Marauder's Map showing clause relationships and party nodes visually |
| 🤖 **Algorithmic Counsel** | Context-aware chatbot — powered by Gemma 2 — that answers questions about YOUR specific contract |
| 🌓 **Dual Theme UI** | Premium dark/light mode toggle built on a clean CSS custom-property design system |
| 📄 **PDF + TXT Upload** | Drag-and-drop support for both PDF and plain-text contract files |
| 🔌 **Zero Training Required** | No model fine-tuning needed — fully zero-shot using in-context reasoning |

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     ContraMesh Platform                          │
├───────────────────────┬──────────────────────────────────────────┤
│     React Frontend    │          Python Backend (FastAPI)         │
│   (Vite + TypeScript) │                                          │
│                       │  ┌─────────────────────────────────┐    │
│  ┌─────────────────┐  │  │         GemmaClient              │    │
│  │  Upload Panel   │──┼─▶│  ┌──────────────────────────┐   │    │
│  │  PDF / TXT      │  │  │  │ 1. Google AI Studio API  │   │    │
│  └─────────────────┘  │  │  │    gemma-2-9b-it          │   │    │
│                       │  │  ├──────────────────────────┤   │    │
│  ┌─────────────────┐  │  │  │ 2. Local vLLM (dual GPU) │   │    │
│  │  Analysis Panel │◀─┼──│  ├──────────────────────────┤   │    │
│  │  Z3 Results     │  │  │  │ 3. Regex Heuristic Parser│   │    │
│  │  KL Scores      │  │  │  └──────────────────────────┘   │    │
│  └─────────────────┘  │  └──────────────┬──────────────────┘    │
│                       │                 │                         │
│  ┌─────────────────┐  │  ┌──────────────▼──────────────────┐    │
│  │  Ontology Graph │◀─┼──│    Z3 Contradiction Solver       │    │
│  │  Marauder's Map │  │  │    (Clause satisfiability check) │    │
│  └─────────────────┘  │  └──────────────┬──────────────────┘    │
│                       │                 │                         │
│  ┌─────────────────┐  │  ┌──────────────▼──────────────────┐    │
│  │  Counsel Chat   │◀─┼──│    KL-Divergence Asymmetry       │    │
│  │  Gemma AI Q&A   │  │  │    (Role-swap fairness scoring)  │    │
│  └─────────────────┘  │  └──────────────┬──────────────────┘    │
│                       │                 │                         │
│                       │  ┌──────────────▼──────────────────┐    │
│                       │  │    Memgraph / InMemory Graph DB   │    │
│                       │  │    (Clause ontology mapping)      │    │
│                       │  └─────────────────────────────────┘    │
└───────────────────────┴──────────────────────────────────────────┘
```

### 🔬 The 4-Pillar Analysis Engine

```
📄 Upload Contract
       │
       ▼
┌─────────────────┐
│  PILLAR 1       │  Gemma 2 extracts: parties, obligations, variables,
│  Rule Extraction│  prohibitions, time limits → structured JSON for Z3
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  PILLAR 2       │  Z3 SMT solver encodes extracted equations as
│  Z3 Logic Check │  Integer arithmetic constraints → checks satisfiability
└────────┬────────┘  → UNSAT = logical contradiction (loophole!) found
         │
         ▼
┌─────────────────┐
│  PILLAR 3       │  Gemma rates each clause from Party A perspective
│  KL-Divergence  │  then from Party B perspective → KL score measures
│  Asymmetry      │  how biased the clause is (high score = exploitation)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  PILLAR 4       │  All parties, clauses, obligations, and relationships
│  Ontology Graph │  mapped as nodes and edges in a graph database
└─────────────────┘  → Visualized as the interactive "Marauder's Map"
```

---

## ⚡ Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+

### 1. Clone the Repository

```bash
git clone https://github.com/Atharv56-coder/ContraMesh.git
cd ContraMesh
```

### 2. Install Backend Dependencies

```bash
pip install -r requirements.txt
```

### 3. (Optional) Set Gemma 2 API key

Get a free key from [Google AI Studio](https://aistudio.google.com/) and set it:

```powershell
# Windows PowerShell
$env:GEMINI_API_KEY = "your_google_ai_studio_key"
```

```bash
# Linux / macOS
export GEMINI_API_KEY="your_google_ai_studio_key"
```

> **Without the key**, the system still works using the built-in regex heuristic parser — it dynamically extracts obligations and equations from the text of any uploaded file.

### 4. Start the Backend

```bash
cd backend
python main.py
```

Backend runs at `http://localhost:8000`

### 5. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`

---

## 🧪 Testing with Sample Contracts

Six complex contracts are included in the `sample_contracts/` folder, each crafted to trigger specific logic failures:

| File | Agreement Type | Logic Trap | Asymmetry |
|------|---------------|-----------|-----------|
| `commercial_lease.txt` | Real Estate | Report in 10 days, but approval takes 15 days | Landlord: 0-day notice vs Tenant: 120-day notice |
| `non_disclosure_agreement.txt` | NDA | 2-year term, extendable to 5 years, max cap 4 years (contradiction) | $100,000 penalty on receiver, none on discloser |
| `saas_sla_agreement.txt` | Software SLA | Credit claims must be filed 20 days *before* the monitoring period ends | Provider liability capped at $100; Customer unlimited |
| `employment_contract.txt` | Employment | Vacation requests need 14-day notice + 3-day approval + payroll cycle | Employer 1-day termination vs Employee 90-day notice |
| `freelance_dev_contract.txt` | Freelance Software | Must pay in 14 days but timesheets take 30 days to evaluate | All rights assigned on signature; client can refuse payment |
| `event_speaker_agreement.txt` | Speaker | Submit slides 12 days prior, review takes 7 days, due 10 days prior | Coordinator: zero notice cancellation; Speaker: 2x penalty |

**To test:** drag and drop any `.txt` file into the upload panel and click **Run Analytics**.

---

## 📁 Project Structure

```
ContraMesh/
├── backend/
│   ├── main.py              # FastAPI server & all API endpoints
│   ├── gemma_client.py      # Gemma 2 client (AI Studio API / vLLM / fallback)
│   ├── z3_solver.py         # Z3 SMT solver contradiction detection
│   ├── kl_divergence.py     # KL-Divergence clause asymmetry scoring
│   ├── graph_db.py          # Memgraph / InMemory ontology graph
│   ├── pdf_parser.py        # PDF and text file extraction
│   └── verify_backend.py    # Backend unit tests
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Main React app (all panels and logic)
│   │   └── index.css        # Dual-theme design system (CSS variables)
│   ├── index.html
│   └── package.json
├── sample_contracts/        # 6 complex test agreements
├── notebook/                # Kaggle dual-GPU deployment notebook
├── requirements.txt
└── README.md
```

---

## 🛠️ API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check |
| `POST` | `/api/upload` | Upload contract (PDF or TXT) for analysis |
| `GET` | `/api/rules` | Retrieve extracted legal rules |
| `GET` | `/api/graph` | Retrieve ontology graph (nodes + edges) |
| `POST` | `/api/verify` | Run Z3 + KL-Divergence analysis pipeline |
| `POST` | `/api/chat` | Ask the Algorithmic Counsel a question |

---

## 🚀 Full GPU Deployment (Kaggle / Colab)

For production-grade Gemma 2 inference with dual T4 GPUs and tensor parallelism, use the included Kaggle notebook:

```
notebook/ContraMesh_Kaggle_Deployment.ipynb
```

This notebook configures vLLM with `tensor_parallel_size=2` for real-time clause extraction at scale.

---

## 🔒 Privacy

ContraMesh processes all contract data **locally** or via your own API key. No contract content is stored on any external servers.

---

## 🧑‍💻 Tech Stack

| Layer | Technology |
|-------|-----------|
| **AI Engine** | Gemma 2 9B-IT (Google AI Studio + vLLM) |
| **Formal Verification** | Z3 SMT Solver (Microsoft Research) |
| **Information Theory** | KL-Divergence (SciPy) |
| **Graph Database** | Memgraph / InMemory fallback |
| **Backend** | Python 3.11, FastAPI, Uvicorn |
| **Frontend** | React 18, TypeScript, Vite 6 |
| **Styling** | Vanilla CSS with custom-property dual-theme |

---


<div align="center">

**Built for the Google Gemma Hackathon 2025**

*ContraMesh — Because no one should sign a legal trap.*

⭐ Star this repo if it helped you!

</div>
