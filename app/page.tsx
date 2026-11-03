"use client";

import {
  Activity, ArrowDownToLine, ArrowRight, Beaker, BookOpen, Bookmark, Check,
  ChevronDown, CircleHelp, Cpu, FlaskConical, Gauge, Layers3, LoaderCircle,
  FileText, Menu, MessageSquareText, Microscope, Printer, Radio, Save, Search,
  ShieldAlert, Sparkles, Target, Trash2, TrendingUp, Upload, X
} from "lucide-react";
import {
  Bar, CartesianGrid, ComposedChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis
} from "recharts";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { materials as seedMaterials, references as seedReferences, technologies as seedTechnologies, type OptimizationResult, type OptimizerInput } from "@/lib/data";
import { optimizeLocally } from "@/lib/optimizer";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
const initialInput: OptimizerInput = {
  transparency_pct: 92, material: "fused_silica", component_type: "Optical window",
  geometry: "Flat / prismatic", dimensions_mm: 25, wavelength_nm: 550,
  equipment: ["Photopolymer printer", "Debinding/sintering furnace"], max_furnace_temp_c: 1400
};
const equipmentOptions = ["Photopolymer printer", "DIW / paste extruder", "High-temperature glass extruder", "Laser system", "Motion / scan control", "Volumetric optical printer", "Debinding/sintering furnace"];
const sections = [
  { id: "optimizer", label: "Optimizer", icon: Gauge },
  { id: "compare", label: "Technology compare", icon: Activity },
  { id: "materials", label: "Materials", icon: FlaskConical },
  { id: "analyzer", label: "Defect analyzer", icon: Microscope },
  { id: "library", label: "Research library", icon: BookOpen },
  { id: "assistant", label: "Research assistant", icon: MessageSquareText }
];

type Saved = { id: string; name: string; input: OptimizerInput; result: OptimizationResult; created_at?: string };
type ResearchDocument = { id: string; filename: string; page_count: number; chunk_count: number; uploaded_at: string };
type AssistantReference = { id: string; title: string; citation: string; source_type: string; doi: string; page: number | null };
type ChatMessage = { role: "user" | "assistant"; text: string; mode?: string; references?: AssistantReference[] };

function feasibilityLabel(status: string) {
  return status === "feasible" ? "READY TO VALIDATE" : status === "conditional" ? "CONDITIONAL" : "EQUIPMENT GAP";
}

export default function Home() {
  const [activeSection, setActiveSection] = useState("optimizer");
  const [input, setInput] = useState<OptimizerInput>(initialInput);
  const [result, setResult] = useState<OptimizationResult>(() => optimizeLocally(initialInput));
  const [materials, setMaterials] = useState(seedMaterials);
  const [technologies, setTechnologies] = useState(seedTechnologies);
  const [papers, setPapers] = useState(seedReferences);
  const [researchDocuments, setResearchDocuments] = useState<ResearchDocument[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [backendOnline, setBackendOnline] = useState(false);
  const [groqConfigured, setGroqConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [materialSearch, setMaterialSearch] = useState("");
  const [paperSearch, setPaperSearch] = useState("");
  const [compareMetric, setCompareMetric] = useState("optical");
  const [defect, setDefect] = useState("Porosity");
  const [severity, setSeverity] = useState("medium");
  const [defectNotes, setDefectNotes] = useState("");
  const [defectResult, setDefectResult] = useState<{ assessment: string; recommendations: string[]; caveat: string } | null>(null);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: "Ask a question about the seeded sources or your uploaded papers." }
  ]);
  const [mobileMenu, setMobileMenu] = useState(false);

  const refreshSaved = useCallback(async () => {
    try {
      const response = await fetch(`${API}/api/configurations`);
      if (!response.ok) throw new Error(`Saved configuration request failed (${response.status}).`);
      const items = await response.json() as Saved[];
      setSaved(items);
    } catch {
      try {
        setSaved(JSON.parse(localStorage.getItem("glassam-configurations") || "[]") as Saved[]);
      } catch {
        setSaved([]);
        setNotice("Saved configurations could not be loaded from this browser.");
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch(`${API}/api/health`).then((response) => {
      if (!response.ok) throw new Error("Backend health check failed.");
      return response.json() as Promise<{ groq_configured: boolean }>;
    }).then((data) => { if (active) { setBackendOnline(true); setGroqConfigured(data.groq_configured); } }).catch(() => { if (active) { setBackendOnline(false); setGroqConfigured(false); } });
    fetch(`${API}/api/materials`).then((response) => response.ok ? response.json() : Promise.reject(new Error("Materials request failed."))).then((data) => { if (active && Array.isArray(data)) setMaterials(data); }).catch(() => undefined);
    fetch(`${API}/api/technologies`).then((response) => response.ok ? response.json() : Promise.reject(new Error("Technology request failed."))).then((data) => { if (active && Array.isArray(data)) setTechnologies(data); }).catch(() => undefined);
    fetch(`${API}/api/papers`).then((response) => response.ok ? response.json() : Promise.reject(new Error("Research library request failed."))).then((data) => { if (active && Array.isArray(data)) setPapers(data); }).catch(() => undefined);
    fetch(`${API}/api/research-documents`).then((response) => response.ok ? response.json() : Promise.reject(new Error("Uploaded document list request failed."))).then((data) => { if (active && Array.isArray(data)) setResearchDocuments(data); }).catch(() => undefined);
    void refreshSaved();
    return () => { active = false; };
  }, [refreshSaved]);

  const setField = <K extends keyof OptimizerInput>(key: K, value: OptimizerInput[K]) => setInput((current) => ({ ...current, [key]: value }));

  async function generatePlan(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(`${API}/api/optimize`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
      });
      if (!response.ok) throw new Error(`Optimizer request failed (${response.status}).`);
      setResult(await response.json() as OptimizationResult);
      setBackendOnline(true);
    } catch (error) {
      setResult(optimizeLocally(input));
      setBackendOnline(false);
      const reason = error instanceof Error ? ` ${error.message}` : "";
      setNotice(`API request failed; showing the seeded engineering demonstration.${reason} Estimates are not validated process instructions.`);
    } finally {
      setBusy(false);
    }
  }

  async function savePlan() {
    const name = window.prompt("Name this manufacturing configuration", `${input.material.replaceAll("_", " ")} · ${input.component_type}`);
    if (!name?.trim()) return;
    const entry: Saved = { id: `local-${Date.now()}`, name: name.trim(), input, result, created_at: new Date().toISOString() };
    try {
      const response = await fetch(`${API}/api/configurations`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: entry.name, input, result })
      });
      if (!response.ok) throw new Error(`Save request failed (${response.status}).`);
      await refreshSaved();
      setNotice("Configuration saved to the server database.");
    } catch {
      try {
        const current = JSON.parse(localStorage.getItem("glassam-configurations") || "[]") as Saved[];
        const next = [entry, ...current];
        localStorage.setItem("glassam-configurations", JSON.stringify(next));
        setSaved(next);
        setNotice("Backend unavailable — configuration saved in this browser only.");
      } catch {
        setNotice("Save failed: browser storage is unavailable. Try again or check storage settings.");
      }
    }
  }

  async function deleteSaved(item: Saved) {
    if (item.id.startsWith("local-")) {
      const next = saved.filter((entry) => entry.id !== item.id);
      setSaved(next);
      localStorage.setItem("glassam-configurations", JSON.stringify(next));
      return;
    }
    try {
      const response = await fetch(`${API}/api/configurations/${item.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(`Delete request failed (${response.status}).`);
      await refreshSaved();
    } catch {
      setNotice("Could not delete the server-saved configuration. Check the API connection.");
    }
  }

  async function submitQuestion(event: FormEvent) {
    event.preventDefault();
    const prompt = question.trim();
    if (!prompt) return;
    setQuestion("");
    setMessages((current) => [...current, { role: "user", text: prompt }]);
    setBusy(true);
    let apiResponded = false;
    try {
      const response = await fetch(`${API}/api/assistant`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: prompt })
      });
      apiResponded = true;
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(detail?.detail || `Research assistant request failed (${response.status}).`);
      }
      const data = await response.json() as { answer: string; references: AssistantReference[]; mode: string };
      setMessages((current) => [...current, { role: "assistant", text: data.answer, mode: data.mode, references: data.references }]);
      setBackendOnline(true);
      setGroqConfigured(data.mode.startsWith("Groq"));
    } catch (error) {
      if (apiResponded) {
        setMessages((current) => [...current, {
          role: "assistant",
          text: error instanceof Error ? error.message : "The backend did not return an answer.",
          mode: "Request failed · no answer generated"
        }]);
        setBusy(false);
        return;
      }
      const terms = prompt.toLowerCase().match(/[a-z0-9]{3,}/g) || [];
      const matches = papers.filter((paper) => terms.some((term) => `${paper.title} ${paper.summary} ${paper.tags.join(" ")}`.toLowerCase().includes(term)));
      const selected = matches.slice(0, 2).map((paper) => ({
        id: paper.id, title: paper.title, citation: `${paper.authors} (${paper.year})`,
        source_type: "seeded_publication", doi: paper.doi, page: null
      }));
      const text = selected.length
        ? `${matches.slice(0, 2).map((paper) => paper.summary).join(" ")}`
        : "Backend unavailable; uploaded PDFs cannot be searched. Reconnect the API for research retrieval.";
      setMessages((current) => [...current, { role: "assistant", text, mode: "Offline seeded summaries · uploaded PDFs unavailable", references: selected }]);
    } finally {
      setBusy(false);
    }
  }

  async function uploadResearchPaper(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setNotice("Upload a PDF file.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setNotice("PDF is too large. Maximum upload size is 12 MB.");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    setUploading(true);
    setNotice("");
    try {
      const response = await fetch(`${API}/api/research-documents`, { method: "POST", body: formData });
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(detail?.detail || `Upload failed (${response.status}).`);
      }
      const document = await response.json() as ResearchDocument & { note: string };
      setResearchDocuments((current) => [document, ...current.filter((item) => item.id !== document.id)]);
      setNotice(`${document.filename}: ${document.page_count} pages indexed into ${document.chunk_count} searchable passages.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "PDF upload failed. Check the backend connection.");
    } finally {
      setUploading(false);
    }
  }

  async function deleteResearchPaper(document: ResearchDocument) {
    try {
      const response = await fetch(`${API}/api/research-documents/${document.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(`Delete failed (${response.status}).`);
      setResearchDocuments((current) => current.filter((item) => item.id !== document.id));
      setNotice(`Removed ${document.filename} and its indexed text.`);
    } catch {
      setNotice(`Could not remove ${document.filename}. Check the backend connection.`);
    }
  }

  async function runDefectAnalysis(event: FormEvent) {
    event.preventDefault();
    try {
      const response = await fetch(`${API}/api/analyze-defects`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defect, severity, description: defectNotes })
      });
      if (!response.ok) throw new Error(`Defect analysis request failed (${response.status}).`);
      setDefectResult(await response.json());
    } catch {
      const fallback: Record<string, string> = {
        Porosity: "Inspect polished cross-sections or use a validated density method; improve degassing and binder removal. Surface polishing does not remove internal voids.",
        Bubbles: "Check feedstock moisture, trapped gas, and burnout ramps; document whether defects originate in feedstock or thermal processing.",
        "Cracks / residual stress": "Review thermal gradients, part geometry, and supplier annealing data; inspect residual stress under crossed polarizers.",
        "Surface roughness": "Measure surface roughness, tune layer formation, and polish only after verifying subsurface defects."
      };
      setDefectResult({ assessment: `${severity[0].toUpperCase()}${severity.slice(1)} reported severity: ${defect.toLowerCase()} can reduce optical quality.`, recommendations: [fallback[defect]], caveat: "API unavailable; using offline text-assisted guidance. This is not image-based diagnosis or optical metrology." });
    }
  }

  const filteredMaterials = materials.filter((material) => `${material.name} ${material.family} ${material.note}`.toLowerCase().includes(materialSearch.toLowerCase()));
  const filteredPapers = papers.filter((paper) => `${paper.title} ${paper.authors} ${paper.summary} ${paper.tags.join(" ")}`.toLowerCase().includes(paperSearch.toLowerCase()));
  const chartData = useMemo(() => technologies.map((tech) => ({
    name: tech.name.replace(" (SLA/DLP)", "").replace("Volumetric photopolymerization", "Volumetric"),
    "Feature fidelity": tech.id === "sla" ? 88 : tech.id === "volumetric" ? 90 : tech.id === "laser" ? 82 : 65,
    "Optical potential": tech.quality * 20,
    "Equipment burden": tech.id === "molten" ? 90 : tech.id === "laser" ? 85 : tech.id === "volumetric" ? 78 : 55
  })), [technologies]);

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-icon"><Layers3 size={19} strokeWidth={1.8} /></div>
          <div><div className="brand-name">glass<span>am</span></div><div className="brand-sub">MATERIALS INTELLIGENCE</div></div>
          <button className="icon-btn mobile-close" onClick={() => setMobileMenu(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {sections.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => { setActiveSection(id); setMobileMenu(false); }} className={`nav-item ${activeSection === id ? "active" : ""}`}>
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>{id === "assistant" && <span className="nav-ai">AI</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="system-card">
            <div className="system-head"><span className={`status-dot ${backendOnline ? "online" : ""}`} />{backendOnline ? "API CONNECTED" : "DEMO MODE"}</div>
            <p>{backendOnline ? "Research API is responding." : "Seeded research data active. No API key required."}</p>
            <div className="system-meta"><span>GROQ KEY</span><span>{groqConfigured ? "CONFIGURED" : "NOT SET"}</span></div>
          </div>
          <div className="profile-row"><div className="avatar">AM</div><div><strong>Research workspace</strong><small>ENGINEERING PLAN</small></div><ChevronDown size={15} /></div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <button className="icon-btn mobile-menu" onClick={() => setMobileMenu(true)} aria-label="Open menu"><Menu size={19} /></button>
          <div className="breadcrumbs">GlassAM <span>/</span> <b>{sections.find((section) => section.id === activeSection)?.label}</b></div>
          <div className="top-actions">
            <span className="research-pill"><span className={`status-dot ${backendOnline ? "online" : ""}`} /> {backendOnline ? "API CONNECTED" : "OFFLINE MODE"}</span>
            <button className="icon-btn help-btn" aria-label="About GlassAM" title="Evidence-aware engineering research tool"><CircleHelp size={18} /></button>
          </div>
        </header>

        <div className="content">
          {notice && <div className="notice" role="status">{notice}<button className="icon-btn" onClick={() => setNotice("")} aria-label="Dismiss"><X size={15} /></button></div>}
          {activeSection === "optimizer" && <section className="workspace">
            <div className="page-heading">
              <div><div className="eyebrow"><span className="eyebrow-line" /> ENGINEERING WORKBENCH <span className="eyebrow-index">01 / 06</span></div>
                <h1>Manufacturing <span>optimizer</span></h1>
                <p>Translate optical targets into a practical, evidence-aware glass AM process plan.</p></div>
              <div className="heading-stamp"><span className="stamp-dot" /> ENGINEERING WORKSPACE <small>ESTIMATES REQUIRE VALIDATION</small></div>
            </div>
            <div className="optimizer-grid">
              <section className="panel input-panel">
                <div className="panel-heading"><div className="panel-icon"><Target size={17} /></div><div><h2>Design requirements</h2><p>Define optical target and production constraints</p></div><span className="step-count">01</span></div>
                <form onSubmit={generatePlan}>
                  <div className="field-block">
                    <div className="field-title"><label htmlFor="transparency">Target transparency</label><span className="unit-label">PERCENT</span></div>
                    <div className="range-value"><strong>{input.transparency_pct}</strong><span>%</span><small>at {input.wavelength_nm} nm</small></div>
                    <input id="transparency" className="range" type="range" min="10" max="99" value={input.transparency_pct} onChange={(e) => setField("transparency_pct", Number(e.target.value))} style={{ "--range-progress": `${((input.transparency_pct - 10) / 89) * 100}%` } as React.CSSProperties} />
                    <div className="range-labels"><span>10% · translucent</span><span>99% · optical grade target</span></div>
                  </div>
                  <div className="form-grid">
                    <div className="field"><label htmlFor="material">Glass material</label><select id="material" value={input.material} onChange={(e) => setField("material", e.target.value)}>{materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
                    <div className="field"><label htmlFor="component">Component type</label><select id="component" value={input.component_type} onChange={(e) => setField("component_type", e.target.value)}>{["Optical window", "Lens / optic", "Microfluidic channel", "Enclosure / housing", "Decorative object", "Large structural part"].map((item) => <option key={item}>{item}</option>)}</select></div>
                  </div>
                  <div className="form-grid geometry-grid">
                    <div className="field"><label htmlFor="geometry">Geometry</label><select id="geometry" value={input.geometry} onChange={(e) => setField("geometry", e.target.value)}>{["Flat / prismatic", "Curved / freeform", "Thin-walled", "Lattice / porous", "Internal channels"].map((item) => <option key={item}>{item}</option>)}</select></div>
                    <div className="field"><label htmlFor="dimension">Max dimension <span>(mm)</span></label><div className="input-suffix"><input id="dimension" type="number" min="1" max="500" value={input.dimensions_mm} onChange={(e) => setField("dimensions_mm", Number(e.target.value))} /><span>mm</span></div></div>
                  </div>
                  <div className="form-grid">
                    <div className="field"><label htmlFor="wavelength">Operating wavelength</label><div className="input-suffix"><input id="wavelength" type="number" min="200" max="2500" value={input.wavelength_nm} onChange={(e) => setField("wavelength_nm", Number(e.target.value))} /><span>nm</span></div></div>
                    <div className="field"><label htmlFor="furnace">Max furnace temperature</label><div className="input-suffix"><input id="furnace" type="number" min="100" max="2000" step="10" value={input.max_furnace_temp_c} onChange={(e) => setField("max_furnace_temp_c", Number(e.target.value))} /><span>°C</span></div></div>
                  </div>
                  <div className="field equipment-field">
                    <div className="field-title"><label>Available equipment</label><span className="unit-label">SELECT ALL</span></div>
                    <div className="equipment-list">{equipmentOptions.map((item) => <label className="check-option" key={item}><input type="checkbox" checked={input.equipment.includes(item)} onChange={(e) => setField("equipment", e.target.checked ? [...input.equipment, item] : input.equipment.filter((eq) => eq !== item))} /><span className="fake-check"><Check size={12} /></span><span>{item}</span></label>)}</div>
                  </div>
                  <button className="primary-btn generate-btn" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={16} />}{busy ? "Building plan…" : "Generate process plan"}<ArrowRight size={16} /></button>
                  <div className="form-footnote"><ShieldAlert size={13} /> Decision support only · Verify with material supplier &amp; process qualification</div>
                </form>
              </section>

              <div className="result-column">
                <section className="panel recommendation-card">
                  <div className="recommend-top"><div className="panel-heading compact"><div className="panel-icon mint"><Cpu size={17} /></div><div><h2>Recommended technology</h2><p>Best fit for stated design constraints</p></div></div><span className={`feasibility-badge ${result.feasibility.status}`}><i />{feasibilityLabel(result.feasibility.status)}</span></div>
                  <div className="rec-tech"><div className="tech-glyph"><Layers3 size={24} /></div><div><div className="rec-kicker">PRIMARY ROUTE · {result.technology.fit.toUpperCase()}</div><h3>{result.technology.name}</h3></div></div>
                  <p className="rec-rationale">{result.technology.rationale}</p>
                  <div className="feasibility-block"><div className="feasibility-title"><span><Check size={14} /> Feasibility check</span><span className="based-on">BASED ON YOUR SETUP</span></div>{result.feasibility.reasons.map((reason, i) => <div className="feasibility-reason" key={i}><span className={result.feasibility.status === "blocked" && i === 0 ? "warning-mark" : "reason-mark"}>{result.feasibility.status === "blocked" && i === 0 ? "!" : "✓"}</span>{reason}</div>)}<div className="equipment-checks"><span>ROUTE EQUIPMENT</span><div>{result.feasibility.required_equipment.map((item) => <span className={result.feasibility.missing_equipment.includes(item) ? "equipment-chip missing" : "equipment-chip"} key={item}><i />{item}</span>)}</div></div></div>
                </section>

                <section className="panel quality-card">
                  <div className="quality-top"><div><div className="section-kicker">OPTICAL PERFORMANCE TARGET</div><h2>{input.transparency_pct}<span>%</span></h2><p>{result.transparency.assessment} <span>· not a guaranteed outcome</span></p></div><div className="quality-chart" style={{ "--q": `${input.transparency_pct * 3.6}deg` } as React.CSSProperties} aria-label="Target is not a measured result"><div className="quality-ring"><div><strong>{input.transparency_pct}</strong><small>TARGET</small></div></div></div></div>
                  <div className="quality-foot"><span><Radio size={13} /> TARGET @ {input.wavelength_nm} NM</span><span><CircleHelp size={13} /> {result.transparency.note}</span></div>
                </section>
              </div>
            </div>

            <section className="panel parameter-panel">
              <div className="parameter-header"><div className="panel-heading"><div className="panel-icon lavender"><SlidersIcon /></div><div><h2>Manufacturing parameter sheet</h2><p>Process-specific values · Relevant parameters only</p></div></div><div className="header-buttons"><span className="estimate-legend"><i /> AI ESTIMATE</span><button className="outline-btn" onClick={() => window.print()}><ArrowDownToLine size={15} /> Export PDF</button><button className="primary-btn save-btn" onClick={savePlan}><Save size={15} /> Save setup</button></div></div>
              <div className="parameter-table-wrap"><table className="parameter-table"><thead><tr><th>PARAMETER</th><th>RECOMMENDED VALUE / RANGE</th><th>SOURCE</th><th>ENGINEERING RATIONALE</th></tr></thead><tbody>{result.parameters.filter((parameter) => parameter.value !== "Not applicable").map((parameter, i) => <tr key={`${parameter.name}-${i}`}><td>{parameter.name}</td><td className="parameter-value">{parameter.value} <span>{parameter.unit}</span></td><td><span className={`source-tag ${parameter.evidence === "Literature reported" ? "reported" : ""}`}><i />{parameter.evidence}</span></td><td>{parameter.rationale}</td></tr>)}</tbody></table></div>
              <div className="parameter-caveat"><ShieldAlert size={14} /><span><b>Important:</b> AI estimate ranges are preliminary starting points, not validated settings. Confirm against full publications, exact feedstock data, equipment ratings, and a controlled trial. No transparency value is guaranteed.</span></div>
            </section>

            <div className="lower-grid">
              <section className="panel defects-panel">
                <div className="panel-heading"><div className="panel-icon amber"><ShieldAlert size={17} /></div><div><h2>Optical defect watchlist</h2><p>Likely failure modes &amp; practical mitigations</p></div><span className="panel-count">04 RISKS</span></div>
                <div className="defect-list">{result.defects.map((item) => <div className="defect-row" key={item.name}><div className="defect-name"><span className={`risk-dot ${item.risk}`} />{item.name}<span className={`risk-label ${item.risk}`}>{item.risk}</span></div><p>{item.mitigation}</p></div>)}</div>
              </section>
              <section className="panel reference-panel">
                <div className="panel-heading"><div className="panel-icon blue"><BookOpen size={17} /></div><div><h2>Evidence &amp; references</h2><p>Research supporting process selection</p></div><button className="text-button" onClick={() => setActiveSection("library")}>VIEW ALL <ArrowRight size={13} /></button></div>
                {result.references.slice(0, 3).map((paper) => <a className="reference-item" key={paper.id} href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer"><div><strong>{paper.title}</strong><small>{paper.authors} · {paper.journal} · {paper.year}</small></div><ArrowDownToLine size={14} /></a>)}
                <div className="reference-foot"><span>REFERENCES ARE RETRIEVAL AIDS</span><span>↗ DOI links open publisher</span></div>
              </section>
            </div>
            <section className="panel saved-panel"><div className="panel-heading"><div className="panel-icon"><Bookmark size={17} /></div><div><h2>Saved configurations</h2><p>Reusable process plans stored in this workspace</p></div><span className="panel-count">{saved.length} SAVED</span></div>
              {saved.length ? <div className="saved-list">{saved.map((item) => <div className="saved-item" key={item.id}><div className="saved-icon"><Printer size={16} /></div><div className="saved-meta"><strong>{item.name}</strong><small>{item.result?.technology?.name || "Saved configuration"} · {item.created_at ? new Date(item.created_at).toLocaleDateString() : "Browser storage"}</small></div><button className="text-button" onClick={() => { setInput(item.input); setResult(item.result); window.scrollTo({ top: 0, behavior: "smooth" }); }}>LOAD <ArrowRight size={13} /></button><button className="icon-btn delete-btn" onClick={() => void deleteSaved(item)} aria-label={`Delete ${item.name}`}><Trash2 size={15} /></button></div>)}</div> : <div className="empty-saved"><Bookmark size={16} />No configurations saved yet. Generate a plan and save it for your next iteration.</div>}
            </section>
            <footer className="page-footer"><span>GLASSAM ENGINEERING INTELLIGENCE <i>·</i> DEMONSTRATION RESEARCH TOOL</span><span>NOT A SUBSTITUTE FOR MATERIAL-SPECIFIC PROCESS QUALIFICATION</span></footer>
          </section>}

          {activeSection === "compare" && <section className="workspace subpage">
            <PageHeading eyebrow="PROCESS LANDSCAPE" index="02 / 06" title={<>Technology <span>comparison</span></>} description="Compare routes by optical potential, feature resolution, and equipment burden." />
            <div className="metric-tabs">{[{ id: "optical", label: "Optical potential" }, { id: "feature", label: "Feature fidelity" }, { id: "burden", label: "Equipment burden" }].map((item) => <button key={item.id} className={compareMetric === item.id ? "selected" : ""} onClick={() => setCompareMetric(item.id)}>{item.label}</button>)}</div>
            <section className="panel chart-panel"><div className="panel-heading"><div className="panel-icon blue"><TrendingUp size={17} /></div><div><h2>Process capability landscape</h2><p>Qualitative comparison · indicative only, not measured performance</p></div><span className="chart-unit">INDEX / 100</span></div><div className="comparison-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartData} margin={{ top: 16, right: 24, left: 0, bottom: 35 }}><CartesianGrid stroke="#25343c" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="name" tick={{ fill: "#94a4aa", fontSize: 11 }} angle={-12} textAnchor="end" interval={0} axisLine={{ stroke: "#35444c" }} tickLine={false} /><YAxis domain={[0, 100]} tick={{ fill: "#75868d", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: "#111b20", border: "1px solid #293940", borderRadius: 8, color: "#eaf1f0" }} /><Bar dataKey={compareMetric === "optical" ? "Optical potential" : compareMetric === "feature" ? "Feature fidelity" : "Equipment burden"} fill="#51d7b1" radius={[4, 4, 0, 0]} barSize={42} /></ComposedChart></ResponsiveContainer></div><div className="chart-caption"><span><i className="chart-legend-dot" /> {compareMetric === "burden" ? "Indicative equipment burden" : compareMetric === "feature" ? "Indicative feature fidelity" : "Indicative optical potential"}</span><span>Relative qualitative index only · confirm with process-specific publications</span></div></section>
            <div className="tech-card-grid">{technologies.map((tech, i) => <article className="panel tech-card" key={tech.id}><div className="tech-card-head"><span className={`tech-card-index index-${i}`}>0{i + 1}</span><span className="maturity-tag">{tech.maturity}</span></div><h3>{tech.name}</h3><div className="tech-material"><Beaker size={14} />{tech.materials}</div><div className="tech-pros"><span>BEST FOR</span><p>{tech.strength}</p></div><div className="tech-cons"><span>WATCH OUT</span><p>{tech.constraint}</p></div><button className="text-button" onClick={() => { setActiveSection("optimizer"); if (tech.id === "sla") setField("equipment", ["Photopolymer printer", "Debinding/sintering furnace"]); else if (tech.id === "diw") setField("equipment", ["DIW / paste extruder", "Debinding/sintering furnace"]); else if (tech.id === "molten") setField("equipment", ["High-temperature glass extruder"]); else if (tech.id === "laser") setField("equipment", ["Laser system"]); else setField("equipment", ["Volumetric optical printer", "Debinding/sintering furnace"]); }}>USE IN OPTIMIZER <ArrowRight size={13} /></button></article>)}</div>
            <div className="notice info-notice"><CircleHelp size={15} />Technology scores describe broad trade-offs, not guaranteed transmission or validated process windows. Actual performance depends on composition, geometry, equipment, and post-processing.</div>
          </section>}

          {activeSection === "materials" && <section className="workspace subpage">
            <PageHeading eyebrow="MATERIALS INTELLIGENCE" index="03 / 06" title={<>Glass <span>materials</span></>} description="Browse demonstration material profiles and their process implications." />
            <div className="search-field"><Search size={16} /><input value={materialSearch} onChange={(e) => setMaterialSearch(e.target.value)} placeholder="Search materials, families, notes…" /><span>{filteredMaterials.length} MATERIALS</span></div>
            <div className="materials-grid">{filteredMaterials.map((material, i) => <article className="panel material-card" key={material.id}><div className="material-card-head"><div className={`material-orb orb-${i % 5}`}><FlaskConical size={18} /></div><span className="material-chip">{material.family}</span></div><h3>{material.name}</h3><p className="material-note">{material.note}</p><div className="material-stats"><div><small>REFRACTIVE INDEX</small><strong>{material.index}</strong></div><div><small>TRANSMISSION BAND</small><strong>{material.transmission}</strong></div></div><div className="material-footer"><span>THERMAL PROFILE</span><b>{material.maxService}</b></div><button className="text-button" onClick={() => { setField("material", material.id); setActiveSection("optimizer"); }}>OPTIMIZE THIS MATERIAL <ArrowRight size={13} /></button></article>)}</div>
            <div className="notice info-notice"><ShieldAlert size={15} />Optical and thermal properties vary by exact composition, supplier, and wavelength. Values marked approximate are orientation aids; use manufacturer datasheets for design.</div>
          </section>}

          {activeSection === "analyzer" && <section className="workspace subpage">
            <PageHeading eyebrow="QUALITY ENGINEERING" index="04 / 06" title={<>Optical defect <span>analyzer</span></>} description="Screen a reported defect for likely optical impact and practical investigation steps." />
            <div className="analyzer-layout"><section className="panel analyzer-form-panel"><div className="panel-heading"><div className="panel-icon amber"><Microscope size={17} /></div><div><h2>Defect screening</h2><p>Text-assisted triage · not image-based inspection</p></div></div><form onSubmit={runDefectAnalysis}><div className="field"><label htmlFor="defect-type">Observed defect</label><select id="defect-type" value={defect} onChange={(e) => setDefect(e.target.value)}>{["Porosity", "Bubbles", "Cracks / residual stress", "Surface roughness"].map((item) => <option key={item}>{item}</option>)}</select></div><div className="field"><label htmlFor="severity">Observed severity</label><select id="severity" value={severity} onChange={(e) => setSeverity(e.target.value)}><option value="low">Low · isolated</option><option value="medium">Medium · visible region</option><option value="high">High · widespread</option></select></div><div className="field"><label htmlFor="defect-notes">Observations <span>(optional)</span></label><textarea id="defect-notes" rows={4} value={defectNotes} onChange={(e) => setDefectNotes(e.target.value)} placeholder="Where is the defect? When did it appear? Any inspection data?" /></div><button className="primary-btn" type="submit"><Sparkles size={15} /> Analyze defect</button></form></section>
              <section className="panel analyzer-result-panel"><div className="panel-heading"><div className="panel-icon blue"><Activity size={17} /></div><div><h2>Investigation guidance</h2><p>Evidence-aware next steps</p></div></div>{defectResult ? <div className="analysis-output"><div className="analysis-status"><span className={`risk-dot ${severity}`} />{defectResult.assessment}</div>{defectResult.recommendations.map((item) => <div className="mitigation-box" key={item}><Check size={15} /><span>{item}</span></div>)}<div className="analysis-caveat"><ShieldAlert size={14} />{defectResult.caveat}</div></div> : <div className="analysis-empty"><div className="scope-graphic"><Microscope size={32} /></div><strong>Run a screening to get started</strong><p>Choose the observed defect and severity. This tool provides investigation guidance only; it does not inspect images or replace metrology.</p></div>}<div className="defect-reference-strip"><span>COMMON OPTICAL LOSS SOURCES</span><div><span>Porosity</span><span>Bubbles</span><span>Cracks</span><span>Roughness</span></div></div></section></div>
          </section>}

          {activeSection === "library" && <section className="workspace subpage">
            <PageHeading eyebrow="SOURCE LIBRARY" index="05 / 06" title={<>Research <span>library</span></>} description="Upload text-based PDFs; relevant passages are retrieved for assistant answers." />
            <div className="upload-row panel"><div className="upload-symbol"><FileText size={17} /></div><div className="upload-copy"><strong>Upload a research PDF</strong><small>Up to 12 MB · selectable text required · original file is not retained</small></div><label className="primary-btn upload-button" htmlFor="paper-upload">{uploading ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />}{uploading ? "Indexing…" : "Choose PDF"}<input id="paper-upload" className="visually-hidden" type="file" accept=".pdf,application/pdf" onChange={(event) => void uploadResearchPaper(event)} disabled={uploading} /></label></div>
            <details className="privacy-disclosure"><summary>What happens to uploaded text?</summary><p>Text is extracted, split into searchable passages, and stored in the backend SQLite database. When Groq is configured, only the question and matching passages are sent to Groq. Use only PDFs you are allowed to process. Scanned PDFs need OCR before upload.</p></details>
            {researchDocuments.length > 0 && <section className="panel uploaded-documents"><div className="panel-heading"><div className="panel-icon blue"><FileText size={17} /></div><div><h2>Your indexed PDFs</h2><p>{researchDocuments.length} document{researchDocuments.length === 1 ? "" : "s"} · retrieved passages are cited by page</p></div></div><div className="uploaded-list">{researchDocuments.map((document) => <div className="uploaded-item" key={document.id}><FileText size={15} /><div><strong>{document.filename}</strong><small>{document.page_count} pages · {document.chunk_count} passages</small></div><button className="icon-btn delete-btn" onClick={() => void deleteResearchPaper(document)} aria-label={`Remove ${document.filename}`} title="Remove PDF"><Trash2 size={15} /></button></div>)}</div></section>}
            <div className="library-toolbar"><div className="search-field"><Search size={16} /><input value={paperSearch} onChange={(e) => setPaperSearch(e.target.value)} placeholder="Search seeded publication titles…" /></div><span className="panel-count">{filteredPapers.length} PAPERS</span></div>
            <div className="paper-list">{filteredPapers.length ? filteredPapers.map((paper, i) => <article className="panel paper-card" key={paper.id}><div className="paper-number">0{i + 1}<BookOpen size={17} /></div><div className="paper-main"><div className="paper-topline"><span>RESEARCH PUBLICATION</span><span>{paper.year}</span></div><h3>{paper.title}</h3><p className="paper-authors">{paper.authors} · {paper.journal}</p><p className="paper-summary">{paper.summary}</p><div className="paper-tags">{paper.tags.map((tag: string) => <span key={tag}>{tag}</span>)}</div></div><a className="doi-link" href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer">OPEN DOI <ArrowRight size={13} /></a></article>) : <div className="empty-saved">No papers match that search.</div>}</div>
            <div className="notice info-notice"><BookOpen size={15} />Seed library is intentionally small for the offline demo. Verify citation metadata and consult full papers before applying any process details.</div>
          </section>}

          {activeSection === "assistant" && <section className="workspace subpage assistant-workspace">
            <PageHeading eyebrow="RETRIEVAL-AUGMENTED ANSWERS" index="06 / 06" title={<>Research <span>assistant</span></>} description="Answers use retrieved passages; citations show which sources matched." />
            <div className="assistant-layout"><section className="panel chat-panel"><div className="chat-header"><div className="panel-heading"><div className="panel-icon mint"><Sparkles size={17} /></div><div><h2>GlassAM research assistant</h2><p>{backendOnline ? groqConfigured ? `Groq key configured · ${researchDocuments.length} uploaded PDFs` : `BM25 retrieval only · ${researchDocuments.length} uploaded PDFs` : "Backend offline · uploaded PDFs unavailable"}</p></div></div><span className="assistant-state"><i />{backendOnline ? "API ONLINE" : "OFFLINE"}</span></div><div className="chat-messages">{messages.map((message, i) => <div className={`chat-message ${message.role}`} key={`${i}-${message.role}`}><div className="chat-avatar">{message.role === "assistant" ? <Sparkles size={14} /> : "YOU"}</div><div className="message-content"><div className="message-author">{message.role === "assistant" ? "GLASSAM RESEARCH" : "YOU"}</div><p>{message.text}</p>{message.mode && <span className="answer-mode">{message.mode}</span>}{message.references?.length ? <div className="cited-sources">{message.references.map((source) => source.doi ? <a key={source.id} href={`https://doi.org/${source.doi}`} target="_blank" rel="noreferrer"><BookOpen size={12} />{source.citation || source.id}</a> : <span className="source-citation" key={source.id}><FileText size={12} />{source.citation || source.title}</span>)}</div> : null}</div></div>)}{busy && <div className="chat-typing"><LoaderCircle className="spin" size={14} />Retrieving passages…</div>}</div><form className="chat-input" onSubmit={submitQuestion}><input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a question about your papers…" maxLength={2000} /><button className="primary-btn" type="submit" disabled={busy || !question.trim()}><ArrowRight size={16} /> Send</button></form><div className="chat-disclaimer"><ShieldAlert size={13} />Verify technical claims in the cited paper before use.</div></section>
              <aside className="assistant-aside"><section className="panel prompt-panel"><div className="panel-heading"><div className="panel-icon lavender"><MessageSquareText size={17} /></div><div><h2>Try asking</h2><p>Questions about glass AM</p></div></div>{["What makes printed fused silica transparent?", "Which defects reduce optical quality?", "What should I verify before debinding silica?"].map((prompt) => <button className="suggestion" key={prompt} onClick={() => setQuestion(prompt)}>{prompt}<ArrowRight size={13} /></button>)}</section><section className="panel retrieval-panel"><div className="panel-heading"><div className="panel-icon blue"><Search size={17} /></div><div><h2>RAG pipeline</h2><p>PDF text → chunks → BM25 → answer</p></div></div><div className="rag-summary"><strong>{researchDocuments.length} uploaded PDFs</strong><small>Keyword relevance ranking; no vector embeddings or OCR.</small><button className="text-button" onClick={() => setActiveSection("library")}>MANAGE SOURCES <ArrowRight size={13} /></button></div></section></aside></div>
          </section>}
        </div>
      </div>
    </main>
  );
}

function SlidersIcon() { return <Activity size={17} />; }

function PageHeading({ eyebrow, index, title, description }: { eyebrow: string; index: string; title: React.ReactNode; description: string }) {
  return <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> {eyebrow} <span className="eyebrow-index">{index}</span></div><h1>{title}</h1><p>{description}</p></div><div className="heading-stamp"><span className="stamp-dot" /> ENGINEERING WORKSPACE <small>ESTIMATES REQUIRE VALIDATION</small></div></div>;
}
