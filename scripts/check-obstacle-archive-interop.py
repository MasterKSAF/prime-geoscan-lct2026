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
    assert source_digest == "58b7fc12f8870ac434d2ae3f3a4dd0627878aa41e5afc862c5fd74da22f420a8"
    print(json.dumps({"status": "pass", "checker": "Python stdlib zipfile/hashlib", "files": len(names),
                      "sourceSha256": source_digest, "flightSafetyChecked": False}, indent=2))
