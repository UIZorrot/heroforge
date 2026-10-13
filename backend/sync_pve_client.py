"""Regenerate client catalog and starter projections from server rules; no DB writes."""
import json
from pathlib import Path

from pve_content import catalog
from starter_cards import STARTER_CARDS


def sync():
    destination = Path(__file__).resolve().parents[1] / 'frontend/src/lib'
    (destination / 'pvePreviewCatalog.ts').write_text(
        "import type { PveCatalog } from './pveTypes';\n\nexport const pvePreviewCatalog: PveCatalog = "
        + json.dumps(catalog(), ensure_ascii=False, indent=2) + ';\n', encoding='utf-8', newline='\n')
    (destination / 'starterBalance.ts').write_text(
        '// Generated from backend/starter_cards.py; verified by the starter balance contract test.\n'
        + 'export const starterBalance: Record<string, Record<string, unknown>> = '
        + json.dumps({card['name']: card for card in STARTER_CARDS}, ensure_ascii=False, indent=2)
        + ';\n', encoding='utf-8', newline='\n')


if __name__ == '__main__':
    sync()
