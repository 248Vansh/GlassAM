import { materials, references, technologies, type OptimizationResult, type OptimizerInput, type Parameter } from "./data";

const thermalParameter = (name: string, value: string, unit: string, rationale: string): Parameter => ({
  name, value, unit, evidence: "AI estimate", rationale
});

function equipmentAvailable(requirement: string, available: string[]) {
  const required = requirement.toLowerCase();
  const equipment = available.map((item) => item.toLowerCase());
  if (required.includes("as applicable")) return true;
  if (required.includes("furnace")) return equipment.some((item) => item.includes("furnace"));
  if (required.includes("extrusion")) return equipment.some((item) => item.includes("extrud") || item.includes("paste") || item.includes("diw"));
  if (required.includes("motion/scan")) return equipment.some((item) => item.includes("motion") || item.includes("scan"));
  return equipment.some((item) => item.includes(required));
}

export function optimizeLocally(input: OptimizerInput): OptimizationResult {
  const has = (needle: string) => input.equipment.some((item) => item.toLowerCase().includes(needle));
  const furnaceMax = input.max_furnace_temp_c;
  const geometry = input.geometry.toLowerCase();
  let technology = technologies[0];
  if (input.component_type.toLowerCase().includes("large") || input.dimensions_mm > 80) technology = technologies[1];
  if (geometry.includes("internal channels") && has("volumetric")) technology = technologies[4];
  else if (input.material === "fused_silica" && input.transparency_pct >= 90 && has("photopolymer")) technology = technologies[0];
  else if (has("extrud") && (input.material === "soda_lime" || input.material === "borosilicate")) technology = technologies[2];
  else if (has("laser") && input.component_type.toLowerCase().includes("optical")) technology = technologies[3];
  else if (has("volumetric")) technology = technologies[4];
  else if (has("paste") || has("diw")) technology = technologies[1];

  const missingEquipment = technology.equipment.filter((requirement) => !equipmentAvailable(requirement, input.equipment));
  const canPrint = technology.id === "sla" ? has("photopolymer") : technology.id === "diw" ? has("extrud") || has("paste") || has("diw") : technology.id === "molten" ? has("extrud") : technology.id === "laser" ? has("laser") : has("volumetric");
  const furnaceNeeded = technology.id !== "laser";
  const missingFurnace = furnaceNeeded && !has("furnace");
  const status = !canPrint ? "blocked" : "conditional";
  const reasons = [
    canPrint ? "A matching printing system is listed in available equipment." : `The selected route requires ${technology.equipment[0]}, which is not listed.`,
    missingEquipment.length ? `Not listed in available equipment: ${missingEquipment.join(", ")}.` : "All listed route equipment is present; process qualification is still required.",
    furnaceNeeded ? `Furnace ceiling recorded: ${furnaceMax}°C. Compatibility cannot be confirmed until the exact glass/feedstock thermal cycle is compared with this limit.` : "A post-process thermal cycle may still apply; verify the exact glass and process route.",
    missingFurnace ? "No suitable thermal processing furnace is listed for this route." : ""
  ].filter(Boolean);

  const indirectRoute = ["sla", "diw", "volumetric"].includes(technology.id);
  const params: Parameter[] = [
    ...(["sla", "diw", "molten", "laser"].includes(technology.id) ? [{ name: "Layer height", value: "50–150", unit: "µm", evidence: "AI estimate" as const, rationale: "Starting range only; tune against feature size, rheology, and optical finish." }] : []),
    ...(technology.id === "diw" ? [{ name: "Nozzle diameter", value: "200–800", unit: "µm", evidence: "AI estimate" as const, rationale: "Broad DIW starting envelope; actual value depends on nozzle and paste." }] : []),
    ...(technology.id === "molten" ? [{ name: "Nozzle diameter", value: "Set by extruder and glass viscosity", unit: "", evidence: "AI estimate" as const, rationale: "Calibrate flow and feature geometry on the specific high-temperature extruder." }] : []),
    ...(technology.id === "sla" ? [{ name: "Feedstock concentration", value: "Photopolymerizable silica nanoparticle feedstock; exact loading is study-specific", unit: "", evidence: "Literature reported" as const, rationale: "Feedstock type is reported by Kotz et al. (Nature, 2017); do not transfer a concentration without consulting the complete paper and matching feedstock." }] : []),
    ...(technology.id === "diw" ? [{ name: "Feedstock concentration", value: "Supplier-specific; verify solids loading", unit: "", evidence: "AI estimate" as const, rationale: "Confirm solids loading against the exact feedstock data." }] : []),
    ...(indirectRoute ? [
      { name: "Debinding temperature", value: "Supplier-validated schedule required", unit: "°C", evidence: "AI estimate" as const, rationale: "Use staged, slow removal based on binder chemistry and part dimensions; avoid a generic setpoint." },
      { name: "Debinding duration", value: "Determine by TGA / supplier protocol", unit: "h", evidence: "AI estimate" as const, rationale: "Duration depends on organic loading and section thickness." },
      { name: "Sintering temperature", value: "Material- and feedstock-specific; verify source", unit: "°C", evidence: "AI estimate" as const, rationale: "The densification window depends on glass composition and particle size; no universal setpoint is assumed." },
      { name: "Sintering duration", value: "Supplier-validated schedule required", unit: "h", evidence: "AI estimate" as const, rationale: "Optimize for densification while limiting distortion and crystallization." }
    ] : []),
    ...(furnaceNeeded ? [
      { name: "Heating rate", value: "Slow, staged; derive from feedstock protocol", unit: "°C/min", evidence: "AI estimate" as const, rationale: "Set ramps to the exact binder chemistry and part section; this placeholder is not a validated schedule." },
      { name: "Cooling rate", value: "Controlled; derive from material and geometry", unit: "°C/min", evidence: "AI estimate" as const, rationale: "Control thermal gradients and residual stress using supplier guidance." },
      { name: "Annealing temperature", value: "Use composition-specific annealing point", unit: "°C", evidence: "AI estimate" as const, rationale: "Obtain the annealing point from the exact material datasheet." },
      { name: "Annealing duration", value: "Determine from material data and wall thickness", unit: "h", evidence: "AI estimate" as const, rationale: "Soak time depends on composition and part section." }
    ] : []),
    { name: "Post-processing", value: "Optical polishing; inspect and re-measure", unit: "", evidence: "AI estimate", rationale: "Polishing can improve surface finish but cannot remove internal pores or guarantee transmission." }
  ];
  if (technology.id === "molten") {
    params.unshift(thermalParameter("Printing / melt temperature", "Set from measured glass viscosity and supplier data", "°C", "Do not extrapolate a universal melt setpoint across glass compositions."));
    params.push(thermalParameter("Nozzle temperature", "Calibrate to target viscosity", "°C", "Verify stable flow and avoid thermal damage."));
  } else if (technology.id === "laser") {
    params.unshift(thermalParameter("Laser wavelength", `${input.wavelength_nm}`, "nm", "Use a wavelength compatible with the glass/precursor absorption and laser safety system."));
    params.unshift(thermalParameter("Laser power", "Calibrate experimentally; no universal setpoint", "W", "Establish a safe process window for the specific laser, material, and optics."));
    params.unshift(thermalParameter("Scanning speed", "Calibrate experimentally; no universal setpoint", "mm/s", "Use a controlled experiment and inspect for heat-affected defects."));
  } else if (["sla", "diw", "volumetric"].includes(technology.id)) {
    params.unshift(thermalParameter("Printing temperature", "Ambient / feedstock supplier window", "°C", "Control resin or paste temperature only within its qualified processing window."));
  }
  if (input.transparency_pct >= 90) params.push(thermalParameter("Optical finishing", "Polish, clean, then measure at target wavelength", "", "High transmission is a target, not a predicted or guaranteed outcome."));
  const materialName = materials.find((item) => item.id === input.material)?.name ?? input.material;
  return {
    technology: { id: technology.id, name: technology.name, fit: status === "blocked" ? "Equipment gap" : status === "conditional" ? "Conditional fit" : "Best fit", rationale: `${materialName}, ${input.geometry.toLowerCase()} geometry, and ${input.component_type.toLowerCase()} selected. ${technology.strength}. ${technology.constraint}` },
    feasibility: { status, reasons, required_equipment: technology.equipment, missing_equipment: missingEquipment },
    parameters: params,
    defects: [
      { name: "Porosity", risk: input.transparency_pct >= 90 ? "high" : "medium", mitigation: "Degas feedstock; use slow binder burnout; confirm densification with microscopy or density measurement." },
      { name: "Bubbles", risk: "medium", mitigation: "Control feedstock moisture and organics; avoid rapid heating through gas-release stages." },
      { name: "Cracks / residual stress", risk: input.material === "soda_lime" ? "high" : "medium", mitigation: "Use composition-specific annealing and minimize thermal gradients; inspect under crossed polarizers." },
      { name: "Surface roughness", risk: input.transparency_pct >= 90 ? "high" : "medium", mitigation: "Reduce layer artifacts and apply optical polishing; quantify roughness and transmission after finishing." }
    ],
    transparency: {
      target: input.transparency_pct,
      assessment: input.transparency_pct >= 90 ? "Optically demanding target" : "Development target",
      note: `Transmission at ${input.wavelength_nm} nm is not predicted. Geometry, thickness, scattering, inclusions, and measurement method strongly affect the result.`
    },
    references: references.filter((paper) => paper.tags.includes("glass") || paper.tags.includes("transparency") || paper.tags.includes("silica")),
    source: "seeded demonstration"
  };
}
