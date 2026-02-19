import csv
import time
from geo import get_geo_coordinates
import argparse
import os


def detect_encoding_and_delimiter(file_path):
    """
    Detect the encoding and delimiter of a CSV file.
    """
    # Try different encodings and delimiters
    encodings = ['utf-16', 'utf-16-le', 'utf-8', 'latin-1']
    delimiters = ['\t', ';', ',']

    encoding_used = None
    delimiter_used = None
    csvfile = None

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
                    print(f"✅ Detected delimiter: {'TAB' if delimiter == '\t' else repr(delimiter)}")
                    csvfile.close()
                    break
            except Exception:
                if csvfile:
                    csvfile.close()
                csvfile = None
                continue

        if encoding_used:
            break

    # Fallback to latin-1 and semicolon
    if not encoding_used:
        print("Could not detect encoding/delimiter, using fallback: latin-1, ';'")
        return 'latin-1', ';'

    return encoding_used, delimiter_used

def process_national_test_results(input_file, output_file):
    """
    Process the national test results CSV to extract relevant columns for schools.

    This function filters out aggregated rows (e.g., "Alle skoler") and selects
    only the columns needed for analysis, and adds geocoded coordinates.

    Expected input CSV columns (based on provided example):
    - EnhetNavn: School name
    - Kommune: Municipality name
    - Fylke: County name
    - Engelsk.5. årstrinn.Alle eierformer.Alle kjønn.Skalapoeng: English score
    - Lesing.5. årstrinn.Alle eierformer.Alle kjønn.Skalapoeng: Reading score
    - Regning.5. årstrinn.Alle eierformer.Alle kjønn.Skalapoeng: Math score

    This function will need to be adjusted based on the actual CSV format from the national tests.
    """
    # Detect encoding and delimiter
    encoding, delimiter = detect_encoding_and_delimiter(input_file)

    with open(input_file, newline='', encoding=encoding) as csvfile:
        # Skip first line if it contains 'sep ='
        first_line = csvfile.readline()
        if 'sep' not in first_line.lower():
            csvfile.seek(0)  # Reset if it wasn't a separator declaration

        reader = csv.DictReader(csvfile, delimiter=delimiter)

        # Find columns that match the pattern (ignoring year prefix)
        fieldnames = reader.fieldnames
        english_col = [col for col in fieldnames if 'Engelsk.5. årstrinn.Alle eierformer.Alle kjønn.Skalapoeng' in col][0]
        reading_col = [col for col in fieldnames if 'Lesing.5. årstrinn.Alle eierformer.Alle kjønn.Skalapoeng' in col][0]
        math_col = [col for col in fieldnames if 'Regning.5. årstrinn.Alle eierformer.Alle kjønn.Skalapoeng' in col][0]

        # Process rows
        output_data = []
        skipped = []
        for idx, row in enumerate(reader, start=1):
            # Get school name and trim spaces
            school_name = row['EnhetNavn'].strip()

            # Filter out rows with "Alle skoler"
            if school_name == 'Alle skoler':
                continue

            # Get municipality for geocoding
            municipality = row.get('Kommune', 'Oslo').strip()

            # Build address for geocoding
            address = f"{school_name}, {municipality}, Norway"
            print(f"Processing {idx}: {address}")

            lat = 0
            lng = 0

            location = get_geo_coordinates(address)
            if location:
                lat = location.latitude
                lng = location.longitude
            else:
                skipped.append(school_name)
                print(f"  WARNING: Could not geocode {school_name}")

            time.sleep(0.1)  # Rate limiting for Nominatim API

            output_data.append({
                'EnhetNavn': school_name,
                'Kommune': municipality,
                'Engelsk': row[english_col],
                'Lesing': row[reading_col],
                'Regning': row[math_col],
                'lat': lat,
                'lng': lng
            })

    # Write to output file
    with open(output_file, mode='w', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=['EnhetNavn', 'Kommune', 'Engelsk', 'Lesing', 'Regning', 'lat', 'lng'], delimiter=';')
        writer.writeheader()
        writer.writerows(output_data)

    print(f"\nProcessing complete!")
    print(f"Processed {len(output_data)} schools")
    print(f"Schools skipped (no coordinates): {len(skipped)}")
    if skipped:
        print(f"Skipped schools: {', '.join(skipped[:10])}")
        if len(skipped) > 10:
            print(f"  ... and {len(skipped) - 10} more")
    print(f"Output saved to: {output_file}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process a source-data CSV and save to processed-data with the same filename")
    parser.add_argument("input_file", help="Path to the input CSV file (e.g., source-data/xxx.csv)")
    args = parser.parse_args()

    input_path = args.input_file
    input_filename = os.path.basename(input_path)
    output_path = os.path.join("processed-data", input_filename)

    os.makedirs("processed-data", exist_ok=True)

    # Use the existing processor with derived paths
    process_national_test_results(input_path, output_path)
