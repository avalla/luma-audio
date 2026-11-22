"""Stage only the public Acido assets for Cloudflare deployment."""
from pathlib import Path
import shutil

FILES = ("index.html", "acido.css", "app.js", "i18n.js", "session.js", "engine.js", "glitch.js", "kick.js", "drums.js", "formant.js", "reverb.js", "bass.js", "midi.js", "demos.js", "beats.js", "sequencer.js", "worklet.js", "render.js", "render-worker.js", "tools.js")

root = Path(__file__).resolve().parents[1]
destination = root / "build" / "acido-web"
if destination.exists():
    shutil.rmtree(destination)
destination.mkdir(parents=True)
for name in FILES:
    shutil.copy2(root / "apps" / "acido" / name, destination / name)
print(f"Prepared {len(FILES)} public assets in {destination}")
