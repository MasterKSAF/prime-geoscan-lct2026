"""Read-only source audit; writes derived evidence, never changes planner code or inputs."""
from collections import Counter
from pathlib import Path
import hashlib
import json
import math
import re
import sys
import xml.etree.ElementTree as ET

from pypdf import PdfReader

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/planner/expert-materials/2026-09-22"
KML = OUT / "originals/primorsky-obstacles.kml"
SCRATCH = ROOT / "tmp/pdfs/geoscan-experts-20260922"
SCRATCH.mkdir(parents=True, exist_ok=True)
raw = KML.read_bytes()
assert hashlib.sha256(raw).hexdigest() == "58b7fc12f8870ac434d2ae3f3a4dd0627878aa41e5afc862c5fd74da22f420a8"
if re.search(rb"<!\s*(?:DOCTYPE|ENTITY)", raw, re.I):
    raise ValueError("DTD/entities are not allowed")
root = ET.fromstring(raw)
NS = {"k": "http://www.opengis.net/kml/2.2"}
ET.register_namespace("", NS["k"])
local = lambda element: element.tag.rsplit("}", 1)[-1]
records, all_coords, rings, ring_issues = [], [], [], []
for pm in root.findall(".//k:Placemark", NS):
    coords = []
    polygon_info = []
    line_info = []
    for polygon in pm.findall(".//k:Polygon", NS):
        polygon_coords = []
        for ring in polygon.findall(".//k:LinearRing", NS):
            values = [list(map(float, token.split(","))) for token in ring.findtext("k:coordinates", "", NS).split()]
            if not values or any(len(c) != 3 or not all(map(math.isfinite, c)) or not (-180 <= c[0] <= 180 and -90 <= c[1] <= 90) for c in values):
                raise ValueError(f"Unexpected coordinates in {pm.get('id')}")
            if len(values) < 4 or values[0] != values[-1]:
                ring_issues.append({"placemarkId": pm.get("id"), "issue": "short-or-open-ring"})
            # This is a structure audit, not a certified topology/self-intersection validator.
            polygon_coords.append(values)
            coords.extend(values)
            rings.append(len(values))
        mode = polygon.findtext("k:altitudeMode", "clampToGround", NS)
        polygon_info.append({"id": polygon.get("id"), "altitudeMode": mode,
                             "extrude": polygon.findtext("k:extrude", "0", NS),
                             "rings": polygon_coords})
    for line in pm.findall(".//k:LineString", NS):
        values = [list(map(float, token.split(","))) for token in line.findtext("k:coordinates", "", NS).split()]
        if len(values) < 2 or any(len(c) != 3 or not all(map(math.isfinite, c)) or not (-180 <= c[0] <= 180 and -90 <= c[1] <= 90) for c in values):
            raise ValueError(f"Unexpected line coordinates in {pm.get('id')}")
        coords.extend(values)
        line_info.append({"id": line.get("id"), "altitudeMode": line.findtext("k:altitudeMode", "clampToGround", NS),
                          "extrude": line.findtext("k:extrude", "0", NS), "coordinates": values})
    if not coords:
        raise ValueError(f"Unhandled geometry: {pm.get('id')}")
    all_coords.extend(coords)
    zs = sorted({c[2] for c in coords})
    name = pm.findtext("k:name", "", NS)
    rec = {"placemarkId": pm.get("id"), "name": name,
           "sourceTypeLabel": (name.split(" ", 1)[1].strip() if " " in name else "") or "(no type label)",
           "boundsLonLat": [min(c[0] for c in coords), min(c[1] for c in coords), max(c[0] for c in coords), max(c[1] for c in coords)] if coords else None,
           "minHeightValueM": min(zs) if zs else None, "maxHeightValueM": max(zs) if zs else None,
           "uniqueHeightValues": len(zs), "polygons": polygon_info, "lineStrings": line_info}
    records.append(rec)

tags = Counter(local(e) for e in root.iter())
all_ids = [e.get("id") for e in root.iter() if e.get("id")]
heights = [c[2] for c in all_coords]
summary = {
    "source": "https://disk.360.yandex.ru/d/HjUEBhOJAzMAaw",
    "sourceSha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw),
    "xmlElementCount": sum(tags.values()), "tagCounts": dict(tags),
    "placemarks": len(records), "polygons": tags["Polygon"], "lineStrings": tags["LineString"], "rings": len(rings),
    "coordinateTuplesIncludingClosure": len(all_coords),
    "ringVertexCountDistribution": dict(sorted(Counter(rings).items())),
    "ringStructureIssues": ring_issues,
    "boundsLonLat": [min(c[0] for c in all_coords), min(c[1] for c in all_coords), max(c[0] for c in all_coords), max(c[1] for c in all_coords)],
    "altitudeModes": dict(Counter(p["altitudeMode"] for r in records for p in r["polygons"] + r["lineStrings"])),
    "altitudeStatsByMode": {mode: {"geometryCount": sum(p["altitudeMode"] == mode for r in records for p in r["polygons"] + r["lineStrings"]),
                                  "minZ": min(c[2] for r in records for p in r["polygons"] + r["lineStrings"] if p["altitudeMode"] == mode for c in ([c for ring in p["rings"] for c in ring] if "rings" in p else p["coordinates"])),
                                  "maxZ": max(c[2] for r in records for p in r["polygons"] + r["lineStrings"] if p["altitudeMode"] == mode for c in ([c for ring in p["rings"] for c in ring] if "rings" in p else p["coordinates"]))}
                            for mode in sorted({p["altitudeMode"] for r in records for p in r["polygons"] + r["lineStrings"]})},
    "extrudeValues": dict(Counter(p["extrude"] for r in records for p in r["polygons"] + r["lineStrings"])),
    "minHeightValueM": min(heights), "maxHeightValueM": max(heights),
    "nonPositiveHeightTuples": sum(z <= 0 for z in heights),
    "placemarksWithVariableHeight": sum(r["uniqueHeightValues"] > 1 for r in records),
    "duplicateXmlIds": [k for k, v in Counter(all_ids).items() if v > 1],
    "duplicateNames": {k: v for k, v in Counter(r["name"] for r in records).items() if v > 1},
    "types": dict(Counter(r["sourceTypeLabel"] for r in records)),
    "highestCoordinateValuesNotTallestObjects": [{k: r[k] for k in ("placemarkId", "name", "maxHeightValueM", "boundsLonLat")} | {"altitudeModes": [p["altitudeMode"] for p in r["polygons"] + r["lineStrings"]]} for r in sorted(records, key=lambda r: r["maxHeightValueM"] or -math.inf, reverse=True)[:10]],
    "validationScope": "XML structure, coordinate values/ranges, closure, IDs and height modes; not self-intersection, geodetic accuracy or real-world completeness",
    "plannerCompatibility": "Not a mission document or a planner restriction layer; heights retained in their original KML datum."
}
(OUT / "obstacles-audit.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(OUT / "obstacles-for-parsing.json").write_text(json.dumps({"schema": "geoscan-source-audit-1", "sourceSha256": summary["sourceSha256"], "coordinateOrder": "longitude, latitude, height; height reference retained per polygon", "isPlannerImport": False, "objects": records}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
assert len(records) == tags["Placemark"] == tags["Polygon"] + tags["LineString"]
assert len(all_coords) == sum(len((c.text or "").split()) for c in root.findall(".//k:coordinates", NS))
fixtures = {
    "first-obstacle-isolated.kml": root.find(".//k:Placemark", NS),
    "first-line-obstacle-isolated.kml": next(p for p in root.findall(".//k:Placemark", NS) if p.find("k:LineString", NS) is not None),
    "first-absolute-obstacle-isolated.kml": next(p for p in root.findall(".//k:Placemark", NS) if p.findtext("k:Polygon/k:altitudeMode", "", NS) == "absolute"),
}
for name, element in fixtures.items():
    wrapper = ET.Element("{" + NS["k"] + "}kml")
    doc = ET.SubElement(wrapper, "{" + NS["k"] + "}Document")
    doc.append(element)
    (OUT / name).write_bytes(ET.tostring(wrapper, encoding="utf-8", xml_declaration=True))

pdf = OUT / "originals/sourcecraft-ai-code-analysis.pdf"
reader = PdfReader(pdf)
pages = []
for i, page in enumerate(reader.pages, 1):
    links = []
    for ref in page.get("/Annots", []):
        ann = ref.get_object()
        action = ann.get("/A")
        if action and action.get("/URI"):
            links.append(str(action["/URI"]))
    text = (page.extract_text() or "").encode("utf-16", "surrogatepass").decode("utf-16", "replace")
    pages.append({"page": i, "text": text, "links": links})
(SCRATCH / "pdf-pages.json").write_text(json.dumps(pages, ensure_ascii=False, indent=2), encoding="utf-8")
(SCRATCH / "pdf-text.md").write_text("\n\n".join(f"## Page {p['page']}\n\n{p['text']}\n\nLinks: {p['links']}" for p in pages), encoding="utf-8")
print(json.dumps(summary, ensure_ascii=False, indent=2))
print(json.dumps({"pdfPages": len(pages), "textCharacters": sum(len(p["text"]) for p in pages), "pdfExtraction": str(SCRATCH / "pdf-text.md")}, ensure_ascii=False))
