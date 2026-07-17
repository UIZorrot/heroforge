from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def test_battle_vfx_manifest_is_generated_from_starter_cards() -> None:
    root = Path(__file__).resolve().parents[2]
    result = subprocess.run(
        [sys.executable, str(root / "scripts" / "generate_battle_vfx_manifest.py"), "--check"],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
