"""Package every native Luma plugin for the current platform, with sources and dependency licenses."""
import argparse
from pathlib import Path
import platform
import shutil
import subprocess
import tarfile
import tempfile
import zipfile

PRODUCTS = [
    ("LumaAcido", "Luma Acido", True),
    ("LumaStudio", "Luma Studio", True),
    ("LumaOrbit", "Luma Orbit", True),
    ("Luma", "Luma", True),
    ("LumaRms", "Luma RMS", False),
]
GUIDE = {
    "Darwin": """LUMA AUDIO for macOS

VST3: copy the bundles to ~/Library/Audio/Plug-Ins/VST3/
Audio Unit: copy the bundles from AU to ~/Library/Audio/Plug-Ins/Components/
Standalone: open the apps in the Standalone folder.

These builds are ad-hoc signed and not notarized. If macOS blocks one, run:
  xattr -dr com.apple.quarantine "/path/to/the/plugin"
""",
    "Windows": """LUMA AUDIO for Windows (64-bit)

VST3: copy the .vst3 folders to C:\\Program Files\\Common Files\\VST3\\
Standalone: run the .exe files in the Standalone folder.
Audio Unit is a macOS-only format.

These builds are not code signed, so SmartScreen may ask for confirmation.
""",
}

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--build-dir", default="build-native")
parser.add_argument("--juce-dir", required=True)
parser.add_argument("--universal", action="store_true")
args = parser.parse_args()
system = platform.system()
if system not in GUIDE:
    raise SystemExit(f"Unsupported platform: {system}")
build = (root / args.build_dir).resolve()
juce = Path(args.juce_dir).resolve()
delivery = root / "build" / "Delivery"
delivery.mkdir(parents=True, exist_ok=True)
label = "Windows-x64" if system == "Windows" else "macOS-Universal" if args.universal else "macOS-AppleSilicon"
archive = delivery / f"Luma-Audio-{label}.zip"
formats = [("VST3", ".vst3", False)]
if system == "Darwin":
    formats += [("AU", ".component", False), ("Standalone", ".app", True)]
else:
    formats += [("Standalone", ".exe", True)]


def copy_plugin(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    if system == "Darwin":
        subprocess.run(["ditto", str(source), str(target)], check=True)
        binary = target / "Contents" / "MacOS" / source.stem
        archs = set(subprocess.check_output(["lipo", "-archs", str(binary)], text=True).split())
        expected = {"arm64", "x86_64"} if args.universal else {platform.machine()}
        if archs != expected:
            raise RuntimeError(f"{target.name}: unexpected architectures {archs}")
        subprocess.run(["codesign", "--force", "--deep", "--sign", "-", str(target)], check=True)
        subprocess.run(["codesign", "--verify", "--deep", "--strict", str(target)], check=True)
    elif source.is_dir():
        shutil.copytree(source, target)
    else:
        shutil.copy2(source, target)


expected_entries = []
with tempfile.TemporaryDirectory(dir=delivery) as temporary:
    package = Path(temporary) / archive.stem
    package.mkdir()
    for target_name, name, has_standalone in PRODUCTS:
        for fmt, suffix, standalone in formats:
            if standalone and not has_standalone:
                continue
            source = build / f"{target_name}_artefacts" / "Release" / fmt / f"{name}{suffix}"
            if not source.exists():
                raise FileNotFoundError(source)
            copy_plugin(source, package / fmt / source.name)
            expected_entries.append(f"{archive.stem}/{fmt}/{source.name}")
    sources = package / "Sources" / "Luma"
    sources.mkdir(parents=True)
    for name in ["plugins", "packages", "scripts", "docs"]:
        shutil.copytree(root / name, sources / name, ignore=shutil.ignore_patterns("__pycache__"))
    for name in ["CMakeLists.txt", "README.md", "LICENSE"]:
        shutil.copy2(root / name, sources / name)
    shutil.copy2(root / "LICENSE", package / "LICENSE")
    shutil.copy2(juce / "LICENSE.md", package / "JUCE-LICENSE.md")
    (package / "README.txt").write_text(GUIDE[system], encoding="utf-8")
    with tarfile.open(package / "Sources" / "JUCE-8.0.13.tar.gz", "w:gz") as tar:
        tar.add(juce, arcname="JUCE", filter=lambda item: None if ".git" in Path(item.name).parts else item)
    archive.unlink(missing_ok=True)
    if system == "Darwin":
        subprocess.run(["ditto", "-c", "-k", "--sequesterRsrc", "--keepParent", str(package), str(archive)], check=True)
    else:
        shutil.make_archive(str(archive.with_suffix("")), "zip", package.parent, package.name)

with zipfile.ZipFile(archive) as zipped:
    if zipped.testzip() is not None:
        raise RuntimeError("ZIP integrity failed")
    names = [n.replace("\\", "/") for n in zipped.namelist()]
    for entry in expected_entries + [f"{archive.stem}/LICENSE", f"{archive.stem}/JUCE-LICENSE.md"]:
        if not any(n == entry or n.startswith(f"{entry}/") for n in names):
            raise RuntimeError(f"Missing from ZIP: {entry}")
print(f"Verified {archive} ({archive.stat().st_size / 1024**2:.1f} MB, {len(expected_entries)} plugins and apps)")
