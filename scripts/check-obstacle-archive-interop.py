"""Independent stdlib ZIP/BagIt byte checks, without importing planner code."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import sys
import zipfile

path = Path(sys.argv[1])
with zipfile.ZipFile(path) as archive:
    assert archive.testzip() is None, "ZIP CRC mismatch"
    names = archive.namelist()
    assert len(names) == len(set(names)) <= 1000
    assert sum(item.file_size for item in archive.infolist()) <= 100 * 1024**2
    for name in names:
        assert not PurePosixPath(name).is_absolute() and ".." not in PurePosixPath(name).parts
    assert archive.read("bagit.txt") == b"BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n"
    for manifest in ("manifest-sha256.txt", "tagmanifest-sha256.txt"):
        entries = {}
        for line in archive.read(manifest).decode("utf-8").splitlines():
            digest, name = line.split("  ", 1)
            assert name not in entries
            assert hashlib.sha256(archive.read(name)).hexdigest() == digest, name
            entries[name] = digest
        expected = {n for n in names if n.startswith("data/")} if manifest == "manifest-sha256.txt" else {
            n for n in names if not n.startswith("data/") and n != manifest
        }
        assert set(entries) == expected, "Manifest membership mismatch"
    source_digest = hashlib.sha256(archive.read("data/sources/obstacles.kml")).hexdigest()
    expected_sources = {
        "58b7fc12f8870ac434d2ae3f3a4dd0627878aa41e5afc862c5fd74da22f420a8": "Primorsky expert source",
        "43e32fe63eb715194d7c43f2eb36066523105433c81613a57f21aadd62520ed1": "Moscow expert source, received 2026-09-23",
    }
    assert source_digest in expected_sources, "Not an unchanged reference obstacle source"
    for name, digest in {
        "data/sources/areas.kml": "b48f4cf70726121919b7d8e20a9bab43027afb55730538698e4c17c8eacadf70",
        "data/sources/restrictions.kml": "b175fd0fa16895f56c73fd4d8a771c4ff603cf3118a96399b6afa0d942772305",
    }.items():
        if name in names:
            assert hashlib.sha256(archive.read(name)).hexdigest() == digest, name
    print(json.dumps({"status": "pass", "checker": "Python stdlib zipfile/hashlib", "files": len(names),
                      "sourceSha256": source_digest, "flightSafetyChecked": False}, indent=2))
