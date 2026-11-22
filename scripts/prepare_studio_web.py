"""Stage only the public Luma Studio assets for Cloudflare deployment."""
from pathlib import Path
import shutil

FILES = {
    "studio": ("index.html", "studio.css", "studio.js", "studio-worklet.js", "orbit-layer.js", "mixer.js"),
    "acido": ("session.js", "beats.js", "demos.js", "tools.js", "glitch.js", "kick.js", "drums.js", "formant.js", "reverb.js", "bass.js", "engine.js", "sequencer.js"),
    "orbit": ("flow.js",),
}

root = Path(__file__).resolve().parents[1]
destination = root / "build" / "studio-web"
if destination.exists():
    shutil.rmtree(destination)
destination.mkdir(parents=True)
for app, names in FILES.items():
    for name in names:
        shutil.copy2(root / "apps" / app / name, destination / name)
print(f"Prepared {sum(map(len, FILES.values()))} public assets in {destination}")
