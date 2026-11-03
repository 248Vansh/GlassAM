# GlassAM

GlassAM is a full-stack engineering research workbench for transparent glass additive manufacturing. Its main workflow maps a material, optical target, component geometry, available equipment, wavelength, and furnace ceiling to a technology recommendation, an evidence-labeled process sheet, equipment feasibility notes, defect mitigations, and literature links.

> **Engineering decision support, not a validated process recipe.** AI-estimated values are marked. The demonstration intentionally avoids inventing furnace schedules or guaranteeing transparency: validate every setting against the exact glass/feedstock, equipment, and primary literature before processing.

## What works in the demo

- **Manufacturing optimizer:** editable optical, material, geometry, wavelength, equipment, and temperature constraints; technology selection; relevant process parameter rows; feasibility and defect screening.
- **Technology comparison:** interactive qualitative capability chart and route cards.
- **Materials database:** searchable seeded material profiles and direct handoff to the optimizer.
- **Optical defect analyzer:** text-assisted screening for porosity, bubbles, cracks/residual stress, and roughness. It does not claim to inspect images or replace metrology.
- **Research library and assistant:** upload text-based PDFs; extracted passages are ranked with BM25 and cited by page. Groq can synthesize answers from retrieved passages. Without Groq, GlassAM returns matching passages directly.
- **Saved configurations:** server-side SQLite persistence when the API is available, browser-local storage fallback otherwise.
- **PDF report:** use **Export PDF** and choose “Save as PDF” in the browser print dialog.

## Stack

- Frontend: Next.js 16, React, TypeScript, Tailwind CSS, Recharts, Lucide
- API: FastAPI, Pydantic, pypdf, SQLite, optional Groq Chat Completions API
- Deployment: Vercel (frontend), Render (FastAPI + persistent disk)

## Run locally

### Frontend

From the project root:

```powershell
npm install
$env:NEXT_PUBLIC_API_URL = "http://localhost:8000"
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). If the API is not running, the seeded optimizer and offline assistant remain usable. API-unavailable saves use browser storage.

### Backend

In another terminal:

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn main:app --reload --port 8000 --env-file .env
```

Add a Groq key to `.env` to enable generated answers; without a key, the seeded retrieval mode remains available. Optional settings:

| Variable | Purpose | Default |
|---|---|---|
| `GROQ_API_KEY` | Groq API key; never put this in frontend code | unset (offline RAG) |
| `GROQ_MODEL` | Groq chat-completions model | `llama-3.3-70b-versatile` |
| `FRONTEND_ORIGINS` | Comma-separated CORS origins | `http://localhost:3000` |
| `DATABASE_PATH` | SQLite file path | `./glassam.db` |

Interactive API documentation is available at [http://localhost:8000/docs](http://localhost:8000/docs).

### Tests

```powershell
npm run build
npm audit
Set-Location backend
.\.venv\Scripts\python.exe -m unittest -v test_api
```

## Deploy

### 1. Deploy the API to Render

1. Create a Render Blueprint from this repository and select the included [`render.yaml`](./render.yaml), or create a Python web service with `backend` as its root directory.
2. Set `GROQ_API_KEY` as a **secret environment variable** if Groq responses are wanted. Leave it unset for offline retrieval.
3. Configure `FRONTEND_ORIGINS` to the exact deployed Vercel origin, for example `https://glassam.vercel.app` (no trailing slash). Include a comma-separated preview origin only if needed.
4. Confirm the persistent disk is mounted at `/var/data` and `DATABASE_PATH=/var/data/glassam.db`. Render's persistent disk requires a paid service plan; without a mounted disk, SQLite data is ephemeral across redeploys.
5. Verify `https://<render-service>.onrender.com/api/health`.

The API enables only the configured origins and GET/POST/DELETE methods. Do not use `*` for credentialed CORS.

### 2. Deploy the frontend to Vercel

1. Import the repository into Vercel; keep the project root at the repository root and use the standard Next.js build.
2. Set `NEXT_PUBLIC_API_URL` to the Render service origin, e.g. `https://glassam-api.onrender.com`, without a trailing slash.
3. Redeploy after setting the environment variable. Add the final Vercel origin to Render's `FRONTEND_ORIGINS` and redeploy/restart the API.
4. Check the browser network panel and the GlassAM sidebar for API connectivity. The seeded frontend data is also available when the API is disconnected.

`NEXT_PUBLIC_API_URL` is public by design and must contain only the API base URL. Store Groq credentials only in Render's backend environment.

## API surface

- `GET /api/health`, `/api/materials`, `/api/technologies`, `/api/papers`, `/api/configurations`
- `GET /api/research-documents`, `POST /api/research-documents`, `DELETE /api/research-documents/{id}` — upload, list and remove indexed PDF text
- `POST /api/optimize` — validated user requirements to process sheet
- `POST /api/assistant` — BM25-retrieved source answer (Groq optional)
- `POST /api/analyze-defects` — text-only defect screening
- `POST /api/configurations`, `DELETE /api/configurations/{id}` — persisted saved plans

The assistant implements a basic RAG pipeline: PDF text extraction → overlapping page-based chunks → BM25 lexical retrieval → optional Groq synthesis from the top five retrieved passages. Uploaded PDFs are cited by filename and page. This is not vector-embedding or semantic retrieval, and scanned/image-only PDFs need OCR before upload. Uploads are limited to 12 MB and 500 pages; extracted text (not the original PDF) is stored in SQLite until the document is deleted. When Groq is configured, GlassAM sends the question and retrieved passages to Groq. If no passage matches, Groq may answer general questions about the application, but it is instructed not to invent source-backed glass-engineering claims. Avoid uploading documents you are not permitted to process or share with that service. Without Groq, matching passages are shown directly and unanswered questions are identified as such.

## Evidence and data limitations

The seeded publications are deliberately small and conservative:

- Kotz et al., “Three-dimensional printing of transparent fused silica glass,” *Nature* 544, 337–339 (2017), [doi:10.1038/nature22061](https://doi.org/10.1038/nature22061). This supports the cited silica nanoparticle photopolymer feedstock context; the app does not infer a process recipe from the abstract.
- Luo, Pan & Kinzel, “Additive Manufacturing of Glass,” ASME IMECE2014, Volume 2B, [doi:10.1115/IMECE2014-39227](https://doi.org/10.1115/IMECE2014-39227). This paper reports glass powder-bed laser experiments and a wire-fed comparison.

Numeric starter ranges (for example layer height and DIW nozzle diameter) are explicitly marked **AI estimate**, not literature-reported values. Literature-reported labels are only used for the specific qualitative feedstock description attributed to Kotz et al. Thermal setpoints and dwell durations are supplier-specific placeholders rather than fabricated values. Property bands and technology capability scores are qualitative demo aids, not certified material data or measured predictions. Confirm all bibliographic details and process details in the complete source before use.

## Project layout

```text
app/                 Next.js screens and global styles
lib/                 Seed catalog and offline optimizer
backend/main.py      FastAPI endpoints, retrieval, and SQLite persistence
backend/.env.example Backend environment template
render.yaml          Render service and persistent disk blueprint
vercel.json          Vercel Next.js project configuration
```
