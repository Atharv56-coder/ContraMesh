import React, { useState, useEffect, useCallback } from 'react';

/* ── Types ─────────────────────────────────── */
interface Rule { id: string; party: string; type: 'obligation' | 'prohibition' | 'permission'; action: string; condition: string; variables: Record<string, string>; equations: string[]; original_text: string; }
interface GraphNode { id: string; label: 'Party' | 'Clause' | 'Obligation' | 'Unknown'; properties: Record<string, any>; x?: number; y?: number; }
interface GraphLink { source: string; target: string; type: string; }
interface GraphData { nodes: GraphNode[]; links: GraphLink[]; }
interface Z3Result { status: 'compatible' | 'contradictory' | 'unknown'; message: string; contradictions: Array<{ rule_id: string; equation: string; original_text: string; }>; simulation: Record<string, number>; }
interface AsymmetryResult { rule_id: string; clause_text: string; distribution_party_a: Record<string, number>; distribution_party_b: Record<string, number>; rating_party_a: number; rating_party_b: number; kl_divergence_ab: number; kl_divergence_ba: number; is_asymmetric: boolean; benefits: string; is_contradictory?: boolean; }
interface VerifyResponse { z3: Z3Result; asymmetries: AsymmetryResult[]; }

/* ── Seed data ───────────────────────────── */
const MOCK_RULES: Rule[] = [
  { id: 'R-1', party: 'Tenant', type: 'obligation', action: 'report leak', condition: 'Report water leak within 3 days.', variables: {}, equations: ['t_report <= t_leak + 3', 't_leak >= 0'], original_text: 'Tenant has 3 days to report a leak.' },
  { id: 'R-2', party: 'Tenant', type: 'obligation', action: 'submit mail report', condition: 'All reports via physical mail (5-day transit).', variables: {}, equations: ['t_report >= t_delivery', 't_delivery == 5'], original_text: 'All reports must be sent by physical mail.' },
  { id: 'R-3', party: 'Landlord', type: 'permission', action: 'terminate immediately', condition: 'Landlord may terminate immediately at sole discretion.', variables: {}, equations: ['t_notice_landlord == 0'], original_text: 'Landlord may terminate lease immediately without notice.' },
  { id: 'R-4', party: 'Tenant', type: 'obligation', action: '60 days notice', condition: 'Tenant must give 60 days written notice to terminate.', variables: {}, equations: ['t_notice_tenant >= 60'], original_text: 'Tenant must provide 60 days written notice before termination.' },
];
const MN: GraphNode[] = [
  { id: 'Tenant', label: 'Party', properties: { name: 'Tenant' }, x: 155, y: 130 },
  { id: 'Landlord', label: 'Party', properties: { name: 'Landlord' }, x: 460, y: 130 },
  { id: 'R-1', label: 'Obligation', properties: { action: 'report leak', type: 'obligation' }, x: 95, y: 255 },
  { id: 'R-2', label: 'Obligation', properties: { action: 'submit mail', type: 'obligation' }, x: 225, y: 255 },
  { id: 'R-3', label: 'Obligation', properties: { action: 'terminate', type: 'permission' }, x: 390, y: 255 },
  { id: 'R-4', label: 'Obligation', properties: { action: '60 day notice', type: 'obligation' }, x: 520, y: 255 },
  { id: 'C-1', label: 'Clause', properties: { title: 'Leak policy' }, x: 95, y: 360 },
  { id: 'C-2', label: 'Clause', properties: { title: 'Mail policy' }, x: 225, y: 360 },
  { id: 'C-3', label: 'Clause', properties: { title: 'Termination' }, x: 390, y: 360 },
  { id: 'C-4', label: 'Clause', properties: { title: 'Notice schedule' }, x: 520, y: 360 },
];
const ML: GraphLink[] = [
  { source: 'Tenant', target: 'R-1', type: 'HAS_OBLIGATION' },
  { source: 'Tenant', target: 'R-2', type: 'HAS_OBLIGATION' },
  { source: 'Landlord', target: 'R-3', type: 'HAS_OBLIGATION' },
  { source: 'Tenant', target: 'R-4', type: 'HAS_OBLIGATION' },
  { source: 'R-1', target: 'C-1', type: 'DEFINED_IN' },
  { source: 'R-2', target: 'C-2', type: 'DEFINED_IN' },
  { source: 'R-3', target: 'C-3', type: 'DEFINED_IN' },
  { source: 'R-4', target: 'C-4', type: 'DEFINED_IN' },
  { source: 'R-1', target: 'R-2', type: 'CONTRADICTS' },
];
const MOCK_VERIFY: VerifyResponse = {
  z3: {
    status: 'contradictory', message: '', contradictions: [
      { rule_id: 'R-1', equation: 't_report <= t_leak + 3  (t_leak = 0)', original_text: 'Tenant has 3 days to report a leak.' },
      { rule_id: 'R-2', equation: 't_report >= t_delivery  (t_delivery = 5)', original_text: 'All reports must be sent by physical mail.' },
    ], simulation: {}
  },
  asymmetries: [
    { rule_id: 'R-1', clause_text: 'Tenant has 3 days to report a leak.', distribution_party_a: {}, distribution_party_b: {}, rating_party_a: 1.25, rating_party_b: 2.85, kl_divergence_ab: 1.488, kl_divergence_ba: 1.344, is_asymmetric: true, benefits: 'Landlord', is_contradictory: true },
    { rule_id: 'R-3', clause_text: 'Landlord may terminate the lease immediately without notice.', distribution_party_a: {}, distribution_party_b: {}, rating_party_a: 1.23, rating_party_b: 4.29, kl_divergence_ab: 2.894, kl_divergence_ba: 2.502, is_asymmetric: true, benefits: 'Landlord' },
    { rule_id: 'R-4', clause_text: 'Tenant must provide 60 days written notice before termination.', distribution_party_a: {}, distribution_party_b: {}, rating_party_a: 1.72, rating_party_b: 3.32, kl_divergence_ab: 0.985, kl_divergence_ba: 0.812, is_asymmetric: true, benefits: 'Landlord' },
  ],
};
const MOCK_DOC = `RESIDENTIAL LEASE AGREEMENT\n\n§2. Tenant must report a water leak in writing\nwithin 3 days of occurrence. Failure to report\nconstitutes material breach.\n\n§3. All formal reports must be sent via\nRegistered Physical Mail. Transit: 5 days.\nNo email or verbal notice is valid.\n\n§4. Landlord may terminate immediately and\nwithout notice, at sole discretion.\n\n§5. Tenant must give 60 days written notice\nprior to intended move-out date.`;

/* ── SVG micro-icon ─────────────────────── */
type IconKey = keyof typeof PATHS;
const PATHS = {
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
  graph: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  scale: 'M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7m0-18H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7m0-18v18',
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  warning: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0-3.42 0z',
  ok: 'M22 11.08V12a10 10 0 1 1-5.93-9.14',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  close: 'M18 6 6 18M6 6l12 12',
  sun: 'M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M12 7a5 5 0 1 0 0 10A5 5 0 0 0 12 7z',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  cpu: 'M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 0-2-2V9m0 0h18',
  layers: 'M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
};
const I = ({ k, s = 15, col = 'currentColor' }: { k: IconKey; s?: number; col?: string; }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d={PATHS[k]} />
  </svg>
);

/* ── Node helpers ───────────────────────── */
const nodeR = (n: GraphNode) => n.label === 'Party' ? 22 : n.label === 'Clause' ? 12 : 16;
const nodeCol = (n: GraphNode, dark: boolean) => {
  const palette = dark
    ? { party_tenant: '#818cf8', party_landlord: '#67e8f9', obligation: '#6366f1', permission: '#34d399', clause: '#71717a' }
    : { party_tenant: '#4f46e5', party_landlord: '#0891b2', obligation: '#4338ca', permission: '#059669', clause: '#9ca3af' };
  if (n.label === 'Party') return n.id === 'Landlord' ? palette.party_landlord : palette.party_tenant;
  if (n.label === 'Clause') return palette.clause;
  return n.properties.type === 'permission' ? palette.permission : palette.obligation;
};

/* ══════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════ */
export default function App() {
  const [dark, setDark] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [userRole, setUserRole] = useState('Tenant');
  const [isUploading, setIsUploading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [tab, setTab] = useState<'graph' | 'z3' | 'asymmetry'>('graph');
  const [sandbox, setSandbox] = useState(false);

  const [rules, setRules] = useState<Rule[]>(MOCK_RULES);
  const [graph, setGraph] = useState<GraphData>({ nodes: MN, links: ML });
  const [verify, setVerify] = useState<VerifyResponse | null>(MOCK_VERIFY);
  const [doc, setDoc] = useState(MOCK_DOC);
  const [selNode, setSelNode] = useState<string | null>(null);

  const [chat, setChat] = useState<Array<{ from: 'user' | 'bot'; text: string }>>([
    { from: 'bot', text: "👋 Welcome to ContraMesh. I've pre-loaded a sample lease with a hidden mathematical contradiction. Ask me *\"What's the loophole?\"* to start." }
  ]);
  const [chatIn, setChatIn] = useState('');

  const API = 'http://localhost:8000';

  /* Apply theme to <html> */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, [dark]);

  /* ── Upload ── */
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setIsUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('user_role', userRole);
    try {
      await fetch(`${API}/api/upload`, { method: 'POST', body: fd });
      const g = await (await fetch(`${API}/api/graph`)).json();
      const processed = g.nodes.map((n: GraphNode, i: number) => ({
        ...n,
        x: n.label === 'Party' ? (n.id === userRole ? 155 : 460) : 80 + (i % 5) * 120,
        y: n.label === 'Party' ? 120 : 240 + Math.floor(i / 5) * 120,
      }));
      setGraph({ nodes: processed, links: g.links });
      setSandbox(false);
      await doVerify();
    } catch {
      setSandbox(true);
      setTimeout(() => {
        setIsUploading(false);
        setRules(MOCK_RULES);
        setGraph({ nodes: MN, links: ML });
        setVerify(MOCK_VERIFY);
        setDoc(MOCK_DOC);
        setChat(p => [...p, { from: 'bot', text: '⚠️ Backend unreachable — running in **Sandbox Demo Mode** with pre-loaded clauses.' }]);
      }, 1000);
      return;
    }
    setIsUploading(false);
  };

  const doVerify = useCallback(async () => {
    setIsVerifying(true);
    try {
      const d = await (await fetch(`${API}/api/verify`, { method: 'POST' })).json();
      setVerify(d);
    } catch { /* keep demo data */ } finally { setIsVerifying(false); }
  }, []);

  /* ── Chat ── */
  const submitMessage = async (q: string) => {
    setChat(p => [...p, { from: 'user', text: q }]);
    if (sandbox) {
      setTimeout(() => {
        let r = 'Upload a live contract for real-time AI analysis from Gemma 4.';
        if (/contradict|loophole|conflict/i.test(q)) r = '🚨 **Z3 contradiction:** §2 requires reporting in 3 days; §3 mandates physical mail with 5-day transit. Mathematically impossible — you are in breach before you can comply.';
        else if (/unfair|asymmetr|bias/i.test(q)) r = '⚖️ **KL-Divergence = 2.894 nats.** Landlord can terminate with zero notice; Tenant requires 60 days. Severe asymmetry flagged.';
        setChat(p => [...p, { from: 'bot', text: r }]);
      }, 600);
      return;
    }
    try {
      const d = await (await fetch(`${API}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: q }) })).json();
      setChat(p => [...p, { from: 'bot', text: d.response }]);
    } catch { setChat(p => [...p, { from: 'bot', text: 'Could not reach AI agent.' }]); }
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatIn.trim()) return;
    const q = chatIn; setChatIn('');
    submitMessage(q);
  };

  /* ── Derived ── */
  const contractCount = rules.length;
  const contradictions = verify?.z3.contradictions.length ?? 0;
  const asymmetries = verify?.asymmetries.filter(a => a.is_asymmetric).length ?? 0;
  const klMax = Math.max(...(verify?.asymmetries.map(a => a.kl_divergence_ab) ?? [0]));
  const z3Status = verify?.z3.status ?? 'unknown';
  const selNodeData = graph.nodes.find(n => n.id === selNode);

  /* ── Quick-send chip ── */
  const quickSend = (txt: string) => { submitMessage(txt); };

  /* ════════════════════════ RENDER ════════════════════════ */
  return (
    <>
      <div className="bg-ambient" />
      <div className="bg-grid" />

      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

        {/* ───── NAV BAR ───── */}
        <nav style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 24px', height: 56,
          background: 'var(--bg-nav)',
          borderBottom: '1px solid var(--border-faint)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          flexShrink: 0, zIndex: 20,
        }}>
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9, background: 'var(--brand)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(99,102,241,0.4)', flexShrink: 0
            }}>
              <I k="layers" s={17} col="#fff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.025em' }}>ContraMesh</span>
                <span className="badge badge-brand">Legal Guard</span>
                {sandbox && <span className="badge badge-amber"><span className="dot" />Sandbox</span>}
              </div>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>Algorithmic Contract Verification · vLLM Gemma 4</p>
            </div>
          </div>

          {/* Right: stats + theme toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="stat-widget">
              <I k="shield" s={13} col={z3Status === 'contradictory' ? 'var(--red)' : 'var(--green)'} />
              <div>
                <div className="label-caps" style={{ fontSize: 9 }}>Z3 Result</div>
                <div className="stat-val" style={{ fontSize: 13, color: z3Status === 'contradictory' ? 'var(--red)' : z3Status === 'compatible' ? 'var(--green)' : 'var(--text-muted)' }}>
                  {z3Status === 'contradictory' ? 'UNSAT' : z3Status === 'compatible' ? 'SAT' : '—'}
                </div>
              </div>
            </div>
            <div className="stat-widget">
              <I k="warning" s={13} col={contradictions > 0 ? 'var(--red)' : 'var(--text-muted)'} />
              <div>
                <div className="label-caps" style={{ fontSize: 9 }}>Contradictions</div>
                <div className="stat-val" style={{ fontSize: 13, color: contradictions > 0 ? 'var(--red)' : 'var(--text-secondary)' }}>{contradictions}</div>
              </div>
            </div>
            <div className="stat-widget">
              <I k="scale" s={13} col={asymmetries > 0 ? 'var(--amber)' : 'var(--text-muted)'} />
              <div>
                <div className="label-caps" style={{ fontSize: 9 }}>Asymmetries</div>
                <div className="stat-val" style={{ fontSize: 13, color: asymmetries > 0 ? 'var(--amber)' : 'var(--text-secondary)' }}>{asymmetries}</div>
              </div>
            </div>
            <div className="stat-widget">
              <I k="cpu" s={13} col="var(--teal)" />
              <div>
                <div className="label-caps" style={{ fontSize: 9 }}>GPU Engine</div>
                <div className="stat-val" style={{ fontSize: 13, color: 'var(--teal)' }}>T4 × 2</div>
              </div>
            </div>

            {/* Theme toggle */}
            <div style={{ marginLeft: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <I k={dark ? 'moon' : 'sun'} s={13} col="var(--text-muted)" />
              <button className="theme-toggle" onClick={() => setDark(d => !d)} aria-label="Toggle theme" type="button">
                <div className="theme-knob">
                  <I k={dark ? 'moon' : 'sun'} s={10} col="#fff" />
                </div>
              </button>
            </div>
          </div>
        </nav>

        {/* ───── MAIN GRID ───── */}
        <div style={{ display: 'grid', gridTemplateColumns: '290px 1fr 320px', flex: 1, overflow: 'hidden' }}>

          {/* ══ SIDEBAR ══ */}
          <aside style={{ borderRight: '1px solid var(--border-faint)', background: 'var(--bg-panel)', display: 'flex', flexDirection: 'column', padding: '18px', gap: '18px', overflowY: 'auto' }}>

            {/* Upload */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div className="icon-box icon-box-brand"><I k="file" s={14} /></div>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Upload Agreement</span>
              </div>

              <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div
                  className={`dropzone${file ? ' has-file' : ''}`}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); }}
                >
                  <input type="file" id="contract-file" accept=".pdf,.txt" onChange={e => { if (e.target.files?.[0]) setFile(e.target.files[0]); }} style={{ display: 'none' }} />
                  <label htmlFor="contract-file" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <div className="icon-box icon-box-brand" style={{ width: 40, height: 40, borderRadius: 12, marginBottom: 2 }}><I k="upload" s={18} /></div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{file ? file.name : 'Drop PDF / TXT or browse'}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>PDF · TXT · up to 50 pages</p>
                  </label>
                </div>

                <div>
                  <div className="label-caps" style={{ marginBottom: 5 }}>Analyze as</div>
                  <select value={userRole} onChange={e => setUserRole(e.target.value)} className="select-field">
                    <option value="Tenant">🏠 Tenant</option>
                    <option value="Citizen">🏛️ Citizen</option>
                    <option value="Employee">💼 Employee</option>
                    <option value="Partner">🤝 Partner</option>
                  </select>
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={!file || isUploading}>
                  {isUploading ? (<><svg className="anim-spin" width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>Parsing with Gemma…</>) : (<><I k="layers" s={13} />Run Analysis</>)}
                </button>
              </form>
            </section>

            <div className="sep" />

            {/* Doc preview */}
            <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div className="icon-box icon-box-teal"><I k="file" s={13} /></div>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>Contract Text</span>
                </div>
                {contractCount > 0 && <span className="badge badge-brand">{contractCount} rules</span>}
              </div>
              <div className="code-wrap scroll-y" style={{ flex: 1 }}>{doc}</div>
            </section>

            {/* Parties */}
            <section>
              <div className="label-caps" style={{ marginBottom: 7 }}>Parties Detected</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                <span className="badge badge-brand"><span className="dot" />Tenant</span>
                <span className="badge badge-teal"><span className="dot" />Landlord</span>
              </div>
            </section>
          </aside>

          {/* ══ CENTER ══ */}
          <main style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: dark ? 'rgba(9,9,11,0.2)' : 'rgba(248,248,251,0.6)' }}>

            {/* Tab bar */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-faint)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div className="pill-bar">
                {([
                  { k: 'graph', ik: 'graph', label: "Marauder's Map" },
                  { k: 'z3', ik: 'shield', label: 'SMT Solver' },
                  { k: 'asymmetry', ik: 'scale', label: 'KL-Divergence' },
                ] as const).map(t => (
                  <button key={t.k} className={`pill${tab === t.k ? ' active' : ''}`} onClick={() => setTab(t.k)}>
                    <I k={t.ik} s={13} />{t.label}
                  </button>
                ))}
              </div>
              {isVerifying && <span className="badge badge-amber"><span className="dot" />Verifying…</span>}
            </div>

            {/* Content areas */}
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>

              {/* ─── GRAPH TAB ─── */}
              {tab === 'graph' && (
                <div className="anim-fade" style={{ width: '100%', height: '100%', position: 'relative' }}>
                  <svg width="100%" height="100%">
                    <defs>
                      {/* Node gradients */}
                      {[
                        ['gr-tenant', dark ? ['#818cf8', '#4f46e5'] : ['#6366f1', '#4338ca']],
                        ['gr-landlord', dark ? ['#67e8f9', '#0891b2'] : ['#22d3ee', '#0e7490']],
                        ['gr-oblig', dark ? ['#6366f1', '#3730a3'] : ['#4338ca', '#312e81']],
                        ['gr-perm', dark ? ['#34d399', '#059669'] : ['#10b981', '#047857']],
                        ['gr-clause', dark ? ['#71717a', '#3f3f46'] : ['#9ca3af', '#6b7280']],
                      ].map(([id, [c0, c1]]) => (
                        <radialGradient key={id as string} id={id as string} cx="50%" cy="30%" r="70%">
                          <stop offset="0%" stopColor={c0 as string} />
                          <stop offset="100%" stopColor={c1 as string} />
                        </radialGradient>
                      ))}
                      <filter id="glow-node">
                        <feGaussianBlur stdDeviation="2.5" result="b" />
                        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                      </filter>
                      <filter id="glow-conflict">
                        <feGaussianBlur stdDeviation="3" result="b" />
                        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                      </filter>
                      <marker id="arr-gray" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                        <path d="M0,0 L0,6 L6,3 z" fill="var(--border-base)" />
                      </marker>
                      <marker id="arr-red" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                        <path d="M0,0 L0,6 L6,3 z" fill="var(--red)" />
                      </marker>
                    </defs>

                    {/* Info text */}
                    <text x={16} y={22} fill="var(--text-muted)" fontSize={10} fontFamily="var(--font-sans)">
                      {graph.nodes.length} nodes · {graph.links.length} edges · click to inspect
                    </text>

                    {/* Edges */}
                    {graph.links.map((lk, i) => {
                      const src = graph.nodes.find(n => n.id === lk.source);
                      const tgt = graph.nodes.find(n => n.id === lk.target);
                      if (!src || !tgt) return null;
                      const conflict = lk.type === 'CONTRADICTS';
                      return (
                        <g key={i}>
                          <line x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                            stroke={conflict ? 'var(--red)' : 'var(--border-base)'}
                            strokeWidth={conflict ? 2 : 1}
                            strokeDasharray={conflict ? '8 4' : '5 3'}
                            className={conflict ? 'edge-conflict' : 'edge-flow'}
                            markerEnd={conflict ? 'url(#arr-red)' : 'url(#arr-gray)'}
                            filter={conflict ? 'url(#glow-conflict)' : undefined}
                            opacity={conflict ? 1 : 0.75}
                          />
                          {conflict && (
                            <text x={(src.x! + tgt.x!) / 2} y={(src.y! + tgt.y!) / 2 - 9}
                              fill="var(--red)" fontSize={9} fontFamily="var(--font-sans)" fontWeight={700} textAnchor="middle">
                              ⊗ CONTRADICTS
                            </text>
                          )}
                        </g>
                      );
                    })}

                    {/* Nodes */}
                    {graph.nodes.map(n => {
                      const r = nodeR(n);
                      const sel = selNode === n.id;
                      const col = nodeCol(n, dark);
                      const fillId = n.label === 'Party'
                        ? (n.id === 'Landlord' ? 'url(#gr-landlord)' : 'url(#gr-tenant)')
                        : n.label === 'Clause' ? 'url(#gr-clause)'
                          : n.properties.type === 'permission' ? 'url(#gr-perm)' : 'url(#gr-oblig)';
                      return (
                        <g key={n.id} style={{ cursor: 'pointer' }}
                          transform={`translate(${n.x ?? 100},${n.y ?? 100})`}
                          onClick={() => setSelNode(n.id === selNode ? null : n.id)}>
                          {sel && <circle r={r + 7} fill="transparent" stroke={col} strokeWidth={1.5} opacity={0.35} />}
                          <circle r={r} fill={fillId}
                            stroke={sel ? col : 'rgba(255,255,255,0.1)'} strokeWidth={sel ? 2 : 1}
                            filter={sel ? 'url(#glow-node)' : undefined} />
                          {n.label === 'Party' && (
                            <text fill="rgba(255,255,255,0.9)" fontSize={8} fontFamily="var(--font-sans)" fontWeight={700} textAnchor="middle" dy={3}>
                              {n.id.slice(0, 2).toUpperCase()}
                            </text>
                          )}
                          <text y={r + 14} fill={sel ? 'var(--text-primary)' : 'var(--text-secondary)'} fontSize={10}
                            textAnchor="middle" fontFamily="var(--font-sans)" fontWeight={n.label === 'Party' ? 700 : 400}>
                            {n.id}
                          </text>
                        </g>
                      );
                    })}
                  </svg>

                  {/* Legend */}
                  <div style={{ position: 'absolute', bottom: 14, left: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {[
                      { col: nodeCol({ id: 'Tenant', label: 'Party', properties: {} } as GraphNode, dark), label: 'Tenant' },
                      { col: nodeCol({ id: 'Landlord', label: 'Party', properties: {} } as GraphNode, dark), label: 'Landlord' },
                      { col: nodeCol({ id: 'x', label: 'Obligation', properties: { type: 'obligation' } } as GraphNode, dark), label: 'Obligation' },
                      { col: nodeCol({ id: 'x', label: 'Obligation', properties: { type: 'permission' } } as GraphNode, dark), label: 'Permission' },
                      { col: nodeCol({ id: 'x', label: 'Clause', properties: {} } as GraphNode, dark), label: 'Clause' },
                    ].map(l => (
                      <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 99, background: l.col, opacity: 0.9 }} />
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{l.label}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 16, height: 2, borderTop: '2px dashed var(--red)' }} />
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Contradicts</span>
                    </div>
                  </div>

                  {/* Node detail drawer */}
                  {selNodeData && (
                    <div className="node-drawer anim-fade">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="icon-box icon-box-brand"><I k="graph" s={13} /></div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{selNodeData.id}</div>
                            <div className="label-caps" style={{ marginTop: 1 }}>{selNodeData.label}</div>
                          </div>
                        </div>
                        <button className="btn btn-ghost btn-icon" onClick={() => setSelNode(null)} type="button">
                          <I k="close" s={13} />
                        </button>
                      </div>
                      <div className="code-wrap" style={{ fontSize: 11 }}>
                        {Object.entries(selNodeData.properties).map(([k, v]) => (
                          <div key={k}><span style={{ color: 'var(--brand-light)' }}>{k}</span>: {String(v)}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ─── Z3 TAB ─── */}
              {tab === 'z3' && (
                <div className="scroll-y anim-fade" style={{ height: '100%', padding: '22px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                    <div className="icon-box icon-box-red"><I k="shield" s={15} /></div>
                    <div>
                      <h2 style={{ fontSize: 17 }}>Z3 SMT Solver Results</h2>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Satisfiability verification of contract clause constraints</p>
                    </div>
                    <div style={{ marginLeft: 'auto' }}>
                      {z3Status === 'contradictory' ? <span className="badge badge-red"><span className="dot" />UNSAT</span>
                        : z3Status === 'compatible' ? <span className="badge badge-green"><span className="dot" />SAT</span>
                          : <span className="badge badge-neutral">Unknown</span>}
                    </div>
                  </div>

                  {z3Status === 'contradictory' && verify && (
                    <>
                      <div className="alert-card" style={{ marginBottom: 18 }}>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <I k="warning" s={17} col="var(--red)" />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 5 }}>Unsatisfiable Constraint Core</div>
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                              The following clauses produce constraints with no valid solution — you are trapped in a mandatory default before you can legally comply.
                            </p>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {verify.z3.contradictions.map((c, i) => (
                          <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderLeft: '3px solid var(--red)', borderRadius: 'var(--r-md)', padding: '14px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                              <span className="badge badge-red">{c.rule_id}</span>
                              <span className="label-caps">Constraint mapping</span>
                            </div>
                            <blockquote style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--text-primary)', borderLeft: 'none', marginBottom: 8, lineHeight: 1.6 }}>"{c.original_text}"</blockquote>
                            <div className="code-wrap" style={{ fontSize: 12 }}>
                              <span style={{ color: 'var(--brand-light)' }}>formula</span>: {c.equation}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="code-wrap" style={{ marginTop: 16, fontSize: 12 }}>
                        <span style={{ color: 'var(--red)' }}>z3.check()</span>{' → '}<span style={{ fontWeight: 700 }}>unsat</span>
                        {'  — No assignment satisfies all constraints simultaneously.'}
                      </div>
                    </>
                  )}

                  {z3Status === 'compatible' && verify && (
                    <div style={{ background: 'var(--green-dim)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 'var(--r-lg)', padding: 20 }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                        <I k="ok" s={18} col="var(--green)" />
                        <span style={{ fontWeight: 700, color: 'var(--green)' }}>Contract logic is satisfiable</span>
                      </div>
                      <pre className="code-wrap">{JSON.stringify(verify.z3.simulation, null, 2)}</pre>
                    </div>
                  )}
                </div>
              )}

              {/* ─── ASYMMETRY TAB ─── */}
              {tab === 'asymmetry' && (
                <div className="scroll-y anim-fade" style={{ height: '100%', padding: '22px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div className="icon-box icon-box-amber"><I k="scale" s={15} /></div>
                    <div>
                      <h2 style={{ fontSize: 17 }}>Fairness Asymmetry Analysis</h2>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>KL-Divergence · role-swap probability distribution</p>
                    </div>
                    <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                      <div className="label-caps">Max KL</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 16, color: klMax > 2 ? 'var(--red)' : klMax > 1 ? 'var(--amber)' : 'var(--green)' }}>
                        {klMax.toFixed(3)} <span style={{ fontSize: 11, fontWeight: 400 }}>nats</span>
                      </div>
                    </div>
                  </div>
                  <div className="sep" style={{ marginBottom: 18 }} />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {verify?.asymmetries.map((a, i) => (
                      <div key={i} className={`asym-card${a.is_asymmetric ? ' flagged' : ''}`}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span className="badge badge-brand">{a.rule_id}</span>
                            {a.is_contradictory && <span className="badge badge-red">⊗ Contradiction</span>}
                          </div>
                          <span className={`badge ${a.is_asymmetric ? 'badge-red' : 'badge-green'}`}>
                            KL = {a.kl_divergence_ab.toFixed(3)}
                          </span>
                        </div>

                        <blockquote style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.65 }}>
                          "{a.clause_text}"
                        </blockquote>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                          {[
                            { label: 'Tenant score', val: a.rating_party_a, max: 5, cls: 'fill-brand' },
                            { label: 'Landlord score', val: a.rating_party_b, max: 5, cls: 'fill-teal' },
                            { label: 'Asymmetry Δ (KL)', val: a.kl_divergence_ab, max: 3, cls: 'fill-red' },
                          ].map(row => (
                            <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 110, flexShrink: 0 }}>{row.label}</span>
                              <div className="track" style={{ flex: 1 }}>
                                <div className={`fill ${row.cls}`} style={{ width: `${Math.min((row.val / row.max) * 100, 100)}%` }} />
                              </div>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, width: 38, textAlign: 'right', color: 'var(--text-primary)' }}>
                                {row.val.toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>

                        {a.is_asymmetric && (
                          <div style={{ marginTop: 12, padding: '7px 12px', background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 'var(--r-md)', fontSize: 12, color: 'var(--text-secondary)' }}>
                            ⚠️ Disproportionately favors <strong style={{ color: 'var(--text-primary)' }}>{a.benefits}</strong>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </main>

          {/* ══ CHAT PANEL ══ */}
          <aside style={{ borderLeft: '1px solid var(--border-faint)', background: 'var(--bg-panel)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-faint)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <div className="icon-box icon-box-brand"><I k="chat" s={14} /></div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Algorithmic Counsel</div>
                <span className="badge badge-green" style={{ marginTop: 3, fontSize: 10 }}><span className="dot" style={{ width: 5, height: 5 }} />Gemma 4 Agent</span>
              </div>
            </div>

            {/* Messages */}
            <div className="scroll-y" style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {chat.map((m, i) => (
                <div key={i} className="anim-fade" style={{ display: 'flex', flexDirection: 'column', alignItems: m.from === 'user' ? 'flex-end' : 'flex-start', gap: 3 }}>
                  <div className="label-caps" style={{ fontSize: 9, marginLeft: m.from === 'user' ? 0 : 4, marginRight: m.from === 'user' ? 4 : 0 }}>
                    {m.from === 'user' ? userRole : 'ContraMesh AI'}
                  </div>
                  <div className={m.from === 'user' ? 'bubble-user' : 'bubble-bot'} style={{ fontSize: 13, lineHeight: 1.65, maxWidth: '92%', color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Quick chips */}
            <div style={{ padding: '8px 16px 0', display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {["What's the loophole?", "Is this fair?"].map(t => (
                <button key={t} className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11, borderRadius: 99 }} onClick={() => quickSend(t)} type="button">{t}</button>
              ))}
            </div>

            {/* Input */}
            <div style={{ padding: '10px 14px 14px', flexShrink: 0 }}>
              <form onSubmit={handleChat} style={{ display: 'flex', gap: 7 }}>
                <input className="input" value={chatIn} onChange={e => setChatIn(e.target.value)} placeholder="Ask about this contract…" style={{ flex: 1 }} />
                <button type="submit" className="btn btn-primary btn-icon" style={{ width: 38, height: 38, flexShrink: 0 }}><I k="send" s={14} /></button>
              </form>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
