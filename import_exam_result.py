"""
import_exam_result.py — Annual update script for the Oslo Schools Map
==============================================================

Run this script once when new UDIR data for a school year arrives.

USAGE
-----
    python import_exam_result.py <new_year> <barneskole_source_csv> <ungdomsskole_source_csv>

EXAMPLE (for the 2026-27 school year)
-------
    python import_exam_result.py 2026-27 \\
        "source-data/2026-27_20270215-1000_Nasjonale_proever_5._trinn.csv" \\
        "source-data/2026-27_20270215-1001_Nasjonale_proever_ungdomstrinn.csv"

WHAT THIS SCRIPT DOES
---------------------
1. Validates that both source files exist.
2. Geocodes schools from both source files → writes two CSVs to processed-data/
   (already-geocoded schools are served from cache, so this is fast for known schools).
3. Updates the CURRENT_YEAR constant in create_map.py to the new year.
4. Regenerates static/js/school-data.json (only new-year schools on the map;
   all previous years become historical data automatically).
5. Prints a summary.
"""

import argparse
import re
import subprocess
import sys
from pathlib import Path


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def validate_year_format(year: str) -> None:
    if not re.fullmatch(r'\d{4}-\d{2}', year):
        sys.exit(f"[ERROR] Year must be in format YYYY-YY (e.g. 2026-27), got: '{year}'")


def validate_file_exists(path: str) -> Path:
    p = Path(path)
    if not p.exists():
        sys.exit(f"[ERROR] File not found: {path}")
    return p


def geocode_source_file(source_csv: Path) -> Path:
    """Run create_csv_with_coordinates.py on a source file.
    Returns the path to the produced processed-data CSV."""
    print(f"\n[STEP] Geocoding: {source_csv.name}")
    subprocess.run(
        [sys.executable, 'create_csv_with_coordinates.py', str(source_csv)],
        check=True,
    )
    output_path = Path('processed-data') / source_csv.name
    if not output_path.exists():
        sys.exit(f"[ERROR] Geocoding finished but expected output not found: {output_path}")
    print(f"  ✓ Saved to {output_path}")
    return output_path


def update_current_year_in_create_map(new_year: str) -> None:
    """Patch the CURRENT_YEAR constant in create_map.py."""
    print(f"\n[STEP] Updating CURRENT_YEAR in create_map.py → '{new_year}'")
    create_map = Path('create_map.py')
    content = create_map.read_text(encoding='utf-8')
    updated = re.sub(
        r"^(CURRENT_YEAR\s*=\s*')[^']+'",
        rf"\g<1>{new_year}'",
        content,
        flags=re.MULTILINE,
    )
    if updated == content:
        sys.exit("[ERROR] Could not find CURRENT_YEAR in create_map.py. "
                 "Has the file been modified manually?")
    create_map.write_text(updated, encoding='utf-8')
    print("  ✓ Done")


def regenerate_map_data() -> None:
    """Run create_map.py to rebuild school-data.json."""
    print("\n[STEP] Regenerating static/js/school-data.json")
    subprocess.run([sys.executable, 'create_map.py'], check=True)
    print("  ✓ school-data.json updated")


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='Annual update: geocode new year data and refresh the map.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument('year',
                        help="New school year in YYYY-YY format, e.g. 2026-27")
    parser.add_argument('barneskole_csv',
                        help="Path to the source barneskole (5. trinn) CSV in source-data/")
    parser.add_argument('ungdomsskole_csv',
                        help="Path to the source ungdomsskole CSV in source-data/")
    args = parser.parse_args()

    validate_year_format(args.year)
    barne_src = validate_file_exists(args.barneskole_csv)
    ungdom_src = validate_file_exists(args.ungdomsskole_csv)

    print(f"\n{'='*60}")
    print(f"  Oslo Schools Map — Annual Update: {args.year}")
    print(f"{'='*60}")

    # Step 1 & 2: Geocode both source files
    geocode_source_file(barne_src)
    geocode_source_file(ungdom_src)

    # Step 3: Update CURRENT_YEAR constant
    update_current_year_in_create_map(args.year)

    # Step 4: Rebuild the map data JSON
    regenerate_map_data()

    print(f"\n{'='*60}")
    print(f"  ✅  Update complete for {args.year}!")
    print(f"{'='*60}")
    print("\nNext steps:")
    print("  1. Open index.html in a browser to verify the map looks correct.")
    print("  2. Commit the changes (processed-data CSVs, school-data.json, create_map.py).")
    print()


if __name__ == '__main__':
    main()


