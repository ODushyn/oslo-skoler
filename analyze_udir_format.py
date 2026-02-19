"""
UDIR CSV Format Analyzer

This helper script analyzes UDIR CSV files to help you identify the correct column names
and data structure before processing.
"""

import csv
import sys


def analyze_udir_csv(file_path):
    """
    Analyze a UDIR CSV file and display its structure.
    """
    print("=" * 80)
    print(f"UDIR CSV Format Analysis: {file_path}")
    print("=" * 80)

    # Try different encodings and delimiters
    encodings = ['utf-16', 'utf-16-le', 'utf-8', 'latin-1']
    delimiters = ['\t', ';', ',']

    csvfile = None
    reader = None
    encoding_used = None
    delimiter_used = None

    for encoding in encodings:
        for delimiter in delimiters:
            try:
                csvfile = open(file_path, newline='', encoding=encoding)
                # Skip first line if it contains 'sep ='
                first_line = csvfile.readline()
                if 'sep' not in first_line.lower():
                    csvfile.seek(0)  # Reset if it wasn't a separator declaration

                reader = csv.DictReader(csvfile, delimiter=delimiter)
                first_row = next(reader, None)

                if first_row and len(first_row) > 1:
                    encoding_used = encoding
                    delimiter_used = delimiter
                    print(f"\n✅ Detected encoding: {encoding}")
                    print(f"✅ Detected delimiter: {'TAB' if delimiter == chr(9) else repr(delimiter)}")
                    break
            except Exception:
                if csvfile:
                    csvfile.close()
                csvfile = None
                continue

        if encoding_used:
            break

    if not csvfile or not reader or not first_row:
        print("\n❌ ERROR: Could not read file with any common encoding/delimiter combination")
        print("\nTried encodings: utf-16, utf-16-le, utf-8, latin-1")
        print("Tried delimiters: TAB, semicolon, comma")
        return

    try:
        # Display column information
        print("\n📋 AVAILABLE COLUMNS:")
        print("-" * 80)
        for i, col in enumerate(reader.fieldnames, 1):
            sample_value = first_row.get(col, "")
            # Truncate long values
            if len(sample_value) > 50:
                sample_value = sample_value[:47] + "..."
            print(f"{i:2}. {col:40} | Example: {sample_value}")

        # Reset file pointer and count rows
        csvfile.seek(0)
        # Skip separator line if present
        first_line = csvfile.readline()
        if 'sep' not in first_line.lower():
            csvfile.seek(0)

        reader = csv.DictReader(csvfile, delimiter=delimiter_used)
        row_count = sum(1 for _ in reader)

        print("\n" + "=" * 80)
        print(f"📊 STATISTICS:")
        print("-" * 80)
        print(f"Total rows (excluding header): {row_count}")
        print(f"Total columns: {len(reader.fieldnames)}")

        # Check for common UDIR columns
        print("\n" + "=" * 80)
        print("🔍 COLUMN MAPPING SUGGESTIONS:")
        print("-" * 80)

        # Reset to analyze all rows
        csvfile.seek(0)
        first_line = csvfile.readline()
        if 'sep' not in first_line.lower():
            csvfile.seek(0)
        reader = csv.DictReader(csvfile, delimiter=delimiter_used)

        suggestions = {
            'school_name': [],
            'municipality': [],
            'county': [],
            'english': [],
            'reading': [],
            'math': []
        }

        # Analyze column names
        for col in reader.fieldnames:
            col_lower = col.lower()

            # School name
            if any(word in col_lower for word in ['skole', 'school', 'navn', 'name', 'enhet']):
                suggestions['school_name'].append(col)

            # Municipality
            if any(word in col_lower for word in ['kommune', 'municipality']):
                suggestions['municipality'].append(col)

            # County
            if any(word in col_lower for word in ['fylke', 'county']):
                suggestions['county'].append(col)

            # English
            if any(word in col_lower for word in ['engelsk', 'english']):
                suggestions['english'].append(col)

            # Reading
            if any(word in col_lower for word in ['lesing', 'reading', 'norsk', 'norwegian']):
                suggestions['reading'].append(col)

            # Math
            if any(word in col_lower for word in ['regning', 'matematikk', 'math']):
                suggestions['math'].append(col)

        # Print suggestions
        print("\n  School name columns:", suggestions['school_name'] or '❌ Not found')
        print("  Municipality columns:", suggestions['municipality'] or '❌ Not found')
        print("  County columns:", suggestions['county'] or '⚠️  Not found (optional)')
        print("  English score columns:", suggestions['english'] or '❌ Not found')
        print("  Reading score columns:", suggestions['reading'] or '❌ Not found')
        print("  Math score columns:", suggestions['math'] or '❌ Not found')

        # Generate code snippet
        print("\n" + "=" * 80)
        print("💻 SUGGESTED CODE FOR create_csv_with_coordinates.py:")
        print("-" * 80)
        print("\nReplace these lines in the script:\n")

        school_col = suggestions['school_name'][0] if suggestions['school_name'] else 'Skole'
        municipality_col = suggestions['municipality'][0] if suggestions['municipality'] else 'Kommune'
        english_col = suggestions['english'][0] if suggestions['english'] else 'Engelsk'
        reading_col = suggestions['reading'][0] if suggestions['reading'] else 'Lesing'
        math_col = suggestions['math'][0] if suggestions['math'] else 'Regning'

        print(f"    school_name = row.get('{school_col}')")
        print(f"    municipality = row.get('{municipality_col}', 'Unknown')")
        print(f"    engelsk = row.get('{english_col}', 0)")
        print(f"    lesing = row.get('{reading_col}', 0)")
        print(f"    regning = row.get('{math_col}', 0)")

        # Sample data preview
        print("\n" + "=" * 80)
        print("📄 SAMPLE DATA (first 5 rows):")
        print("-" * 80)

        csvfile.seek(0)
        first_line = csvfile.readline()
        if 'sep' not in first_line.lower():
            csvfile.seek(0)
        reader = csv.DictReader(csvfile, delimiter=delimiter_used)

        for i, row in enumerate(reader, 1):
            if i > 5:
                break
            print(f"\nRow {i}:")
            for key, value in row.items():
                if value:  # Only show non-empty values
                    # Truncate long values
                    if len(value) > 60:
                        value = value[:57] + "..."
                    print(f"  {key}: {value}")

        print("\n" + "=" * 80)
        print("✅ Analysis complete!")
        print("=" * 80)

    except Exception as e:
        print(f"\n❌ ERROR during analysis: {e}")
    finally:
        if csvfile:
            csvfile.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python analyze_udir_format.py <csv_file>")
        print("\nExample:")
        print("  python analyze_udir_format.py udir_nasjonale_prover_2024-2025.csv")
        sys.exit(1)

    csv_file = sys.argv[1]
    analyze_udir_csv(csv_file)

