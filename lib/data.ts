export type Parameter = {
  name: string;
  value: string;
  unit: string;
  evidence: "AI estimate" | "Literature reported";
  rationale: string;
};

export type Reference = {
  id: string;
  title: string;
  authors: string;
  journal: string;
  year: number;
  doi: string;
  tags: string[];
  summary: string;
};

export type OptimizerInput = {
  transparency_pct: number;
  material: string;
  component_type: string;
  geometry: string;
  dimensions_mm: number;
  wavelength_nm: number;
  equipment: string[];
  max_furnace_temp_c: number;
};

export type OptimizationResult = {
  technology: { id: string; name: string; fit: string; rationale: string };
  feasibility: { status: "feasible" | "conditional" | "blocked"; reasons: string[]; required_equipment: string[]; missing_equipment: string[] };
  parameters: Parameter[];
  defects: { name: string; risk: "low" | "medium" | "high"; mitigation: string }[];
  transparency: { target: number; assessment: string; note: string };
  references: Reference[];
  source: "seeded demonstration" | "Groq-assisted";
};

export const references: Reference[] = [
  {
    id: "kotz-2017",
    title: "Three-dimensional printing of transparent fused silica glass",
    authors: "Kotz, F. et al.",
    journal: "Nature 544, 337–339",
    year: 2017,
    doi: "10.1038/nature22061",
    tags: ["silica", "SLA", "transparency", "debinding", "sintering"],
    summary: "Demonstrates transparent fused-silica objects using a photopolymerizable silica nanoparticle feedstock followed by thermal processing."
  },
  {
    id: "luo-2014",
    title: "Additive Manufacturing of Glass",
    authors: "Luo, J., Pan, H. & Kinzel, E. C.",
    journal: "ASME IMECE2014, Volume 2B",
    year: 2014,
    doi: "10.1115/IMECE2014-39227",
    tags: ["glass", "laser", "extrusion", "process selection"],
    summary: "Reports CO₂-laser processing experiments on glass powder and compares powder-bed and wire-fed approaches; useful context for laser-based glass AM."
  }
];

export const materials = [
  { id: "fused_silica", name: "Fused silica", family: "Silica glass", index: "≈1.46", transmission: "UV–NIR", maxService: "High thermal stability", note: "Strong candidate for high-transmission optics; indirect printing commonly needs debinding and sintering." },
  { id: "borosilicate", name: "Borosilicate", family: "Borosilicate glass", index: "≈1.47", transmission: "Visible–NIR", maxService: "Moderate thermal shock resistance", note: "Widely available; composition-specific viscosity and annealing behavior must be confirmed." },
  { id: "soda_lime", name: "Soda-lime", family: "Soda-lime silicate", index: "≈1.52", transmission: "Visible", maxService: "Lower than silica", note: "Common and cost-effective; higher thermal expansion increases residual-stress sensitivity." },
  { id: "chalcogenide", name: "Chalcogenide", family: "Infrared glass", index: "Composition dependent", transmission: "Mid-IR (composition dependent)", maxService: "Composition dependent", note: "Specialist feedstocks and oxygen-free processing may be required." },
  { id: "aluminosilicate", name: "Aluminosilicate", family: "Silicate glass", index: "Composition dependent", transmission: "Visible–NIR", maxService: "Composition dependent", note: "Use supplier-specific softening and annealing data before selecting a thermal cycle." }
];

export const technologies = [
  { id: "sla", name: "Vat photopolymerization (SLA/DLP)", maturity: "Indirect", materials: "Silica-filled photopolymer", strength: "Fine features and smooth as-printed surfaces", constraint: "Organic binder removal and glass sintering add shrinkage and thermal-cycle constraints.", quality: 4, equipment: ["Photopolymer printer", "Debinding/sintering furnace"] },
  { id: "diw", name: "Direct ink writing (DIW)", maturity: "Indirect", materials: "Glass-particle paste or sol", strength: "Flexible feedstock and accessible equipment", constraint: "Layer texture, drying, binder removal and densification affect optical quality.", quality: 3, equipment: ["Robotic/paste extrusion printer", "Debinding/sintering furnace"] },
  { id: "molten", name: "Molten glass extrusion", maturity: "Direct", materials: "Molten glass", strength: "No polymer binder; direct shaping", constraint: "High-temperature hot-end, glass viscosity control and annealing are essential.", quality: 3, equipment: ["High-temperature glass extruder", "Annealing furnace"] },
  { id: "laser", name: "Laser-based glass processing", maturity: "Direct / hybrid", materials: "Glass or glass precursor", strength: "Localized energy delivery and fine features", constraint: "Process-specific optics, laser safety, and parameter development required.", quality: 3, equipment: ["Laser system", "Motion/scan control", "Thermal processing as applicable"] },
  { id: "volumetric", name: "Volumetric photopolymerization", maturity: "Indirect", materials: "Photocurable glass precursor", strength: "Rapid, support-minimal volumetric exposure", constraint: "Optically clear feedstock and compatible photo-chemistry are critical; glass densification may follow.", quality: 4, equipment: ["Volumetric optical printer", "Debinding/sintering furnace"] }
];
