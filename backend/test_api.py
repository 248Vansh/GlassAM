import json
import os
import tempfile
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from main import app


def text_pdf(text: str):
    stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode("ascii")
    bodies = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream",
    ]
    output = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, body in enumerate(bodies, start=1):
        offsets.append(len(output))
        output.extend(f"{index} 0 obj\n".encode("ascii") + body + b"\nendobj\n")
    xref_offset = len(output)
    output.extend(f"xref\n0 {len(offsets)}\n".encode("ascii"))
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    output.extend(
        f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode("ascii")
    )
    return bytes(output)


class GlassAMApiTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = os.path.join(self.temp_dir.name, "test.db")
        self.environment = patch.dict(os.environ, {"DATABASE_PATH": self.database_path, "GROQ_API_KEY": ""})
        self.environment.start()
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.environment.stop()
        self.temp_dir.cleanup()

    def optimize(self, **overrides):
        payload = {
            "transparency_pct": 92,
            "material": "fused_silica",
            "component_type": "Optical window",
            "geometry": "Flat / prismatic",
            "dimensions_mm": 25,
            "wavelength_nm": 550,
            "equipment": ["Photopolymer printer", "Debinding/sintering furnace"],
            "max_furnace_temp_c": 1400,
        }
        payload.update(overrides)
        return self.client.post("/api/optimize", json=payload)

    def test_silica_plan_labels_reported_feedstock_and_furnace_limit(self):
        response = self.optimize()
        self.assertEqual(response.status_code, 200)
        plan = response.json()
        self.assertEqual(plan["technology"]["id"], "sla")
        self.assertEqual(plan["feasibility"]["status"], "conditional")
        feedstock = next(row for row in plan["parameters"] if row["name"] == "Feedstock concentration")
        self.assertEqual(feedstock["evidence"], "Literature reported")
        self.assertTrue(any("1400°C" in reason for reason in plan["feasibility"]["reasons"]))

    def test_laser_plan_only_contains_laser_relevant_parameters(self):
        response = self.optimize(
            material="borosilicate",
            equipment=["Laser system"],
            wavelength_nm=1064,
        )
        self.assertEqual(response.status_code, 200)
        plan = response.json()
        names = {row["name"] for row in plan["parameters"]}
        self.assertEqual(plan["technology"]["id"], "laser")
        self.assertTrue({"Laser wavelength", "Laser power", "Scanning speed"} <= names)
        self.assertNotIn("Debinding temperature", names)
        self.assertNotIn("Sintering temperature", names)
        self.assertIn("Motion/scan control", plan["feasibility"]["missing_equipment"])

    def test_internal_channels_can_select_available_volumetric_route(self):
        response = self.optimize(
            geometry="Internal channels",
            equipment=["Volumetric optical printer", "Debinding/sintering furnace"],
        )
        self.assertEqual(response.json()["technology"]["id"], "volumetric")

    def test_offline_assistant_returns_retrieved_citation(self):
        response = self.client.post("/api/assistant", json={"question": "What makes printed fused silica transparent?"})
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["mode"], "Offline BM25 retrieval")
        self.assertEqual(payload["references"][0]["doi"], "10.1038/nature22061")

    def test_groq_answers_general_question_even_without_retrieved_papers(self):
        response_body = {
            "choices": [
                {"message": {"content": "I'm GlassAM, and this response is generated using a Groq-hosted model."}}
            ]
        }

        def handler(request):
            payload = json.loads(request.content)
            self.assertIn("No source retrieved", payload["messages"][1]["content"])
            return httpx.Response(200, json=response_body)

        transport = httpx.MockTransport(handler)
        async_client = httpx.AsyncClient
        with patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}), patch(
            "main.httpx.AsyncClient",
            side_effect=lambda **kwargs: async_client(transport=transport, **kwargs),
        ):
            response = self.client.post("/api/assistant", json={"question": "Are you Groq or a local chat?"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("Groq-hosted", response.json()["answer"])
        self.assertEqual(response.json()["mode"], "Groq · no relevant source retrieved")
        self.assertEqual(response.json()["references"], [])

    def test_uploaded_pdf_is_chunked_and_retrieved_with_page_citation(self):
        uploaded = self.client.post(
            "/api/research-documents",
            files={"file": ("lab-notes.pdf", text_pdf("ABRACADABRA thermal characterization of glass specimen."), "application/pdf")},
        )
        self.assertEqual(uploaded.status_code, 200, uploaded.text)
        self.assertEqual(uploaded.json()["page_count"], 1)
        self.assertEqual(self.client.get("/api/research-documents").json()[0]["filename"], "lab-notes.pdf")
        answer = self.client.post("/api/assistant", json={"question": "ABRACADABRA thermal characterization"})
        self.assertEqual(answer.status_code, 200)
        self.assertIn("ABRACADABRA", answer.json()["answer"])
        self.assertEqual(answer.json()["references"][0]["citation"], "lab-notes.pdf, p. 1")
        removed = self.client.delete(f"/api/research-documents/{uploaded.json()['id']}")
        self.assertEqual(removed.status_code, 200)
        self.assertEqual(self.client.get("/api/research-documents").json(), [])

    def test_upload_rejects_non_pdf_and_scanned_pdf(self):
        invalid = self.client.post(
            "/api/research-documents",
            files={"file": ("notes.txt", b"not a pdf", "text/plain")},
        )
        self.assertEqual(invalid.status_code, 415)
        scanned = self.client.post(
            "/api/research-documents",
            files={"file": ("scanned.pdf", text_pdf(""), "application/pdf")},
        )
        self.assertEqual(scanned.status_code, 422)

    def test_saved_configurations_persist_and_delete(self):
        saved = self.client.post("/api/configurations", json={"name": "Trial A", "input": {"material": "fused_silica"}, "result": {"technology": "sla"}})
        self.assertEqual(saved.status_code, 200)
        identifier = saved.json()["id"]
        listed = self.client.get("/api/configurations")
        self.assertEqual([row["id"] for row in listed.json()], [identifier])
        deleted = self.client.delete(f"/api/configurations/{identifier}")
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(self.client.get("/api/configurations").json(), [])

    def test_transparency_validation_rejects_out_of_range_value(self):
        response = self.optimize(transparency_pct=101)
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
