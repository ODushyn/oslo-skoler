"""
Script to geocode schools with missing coordinates (0;0) using Google Maps Geocoding API.

Requirements:
    pip install googlemaps

Setup:
    1. Get a Google Maps API key from: https://console.cloud.google.com/
    2. Enable "Geocoding API" for your project
    3. Set the API key as an environment variable:
       export GOOGLE_MAPS_API_KEY="your_api_key_here"
       OR
       Create a .env file with: GOOGLE_MAPS_API_KEY=your_api_key_here
"""

import csv
import os
import time
from typing import Optional, Tuple

# Try to import googlemaps
try:
    import googlemaps
    GOOGLEMAPS_AVAILABLE = True
except ImportError:
    GOOGLEMAPS_AVAILABLE = False
    print("⚠️  googlemaps package not installed. Run: pip install googlemaps")

# Try to load .env file if python-dotenv is available
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


def get_google_maps_client():
    """Initialize Google Maps client with API key from environment."""
    api_key = os.environ.get('GOOGLE_MAPS_API_KEY')

    if not api_key:
        print("❌ Error: GOOGLE_MAPS_API_KEY not found in environment variables")
        print("\nPlease set your API key:")
        print("  Windows: set GOOGLE_MAPS_API_KEY=your_api_key_here")
        print("  Linux/Mac: export GOOGLE_MAPS_API_KEY=your_api_key_here")
        print("  OR create a .env file with: GOOGLE_MAPS_API_KEY=your_api_key_here")
        return None

    try:
        gmaps = googlemaps.Client(key=api_key)
        # Test the API key with a simple request
        gmaps.geocode("Oslo, Norway")
        print("✅ Google Maps API key validated successfully")
        return gmaps
    except Exception as e:
        print(f"❌ Error initializing Google Maps client: {e}")
        return None


def geocode_with_google(gmaps, school_name: str, kommune: str) -> Optional[Tuple[float, float]]:
    """
    Geocode a school using Google Maps Geocoding API.

    Args:
        gmaps: Google Maps client
        school_name: Name of the school
        kommune: Municipality name

    Returns:
        Tuple of (latitude, longitude) or None if not found
    """
    # Try multiple query strategies
    queries = [
        f"{school_name}, {kommune}, Norway",
        f"{school_name}, {kommune}, Norge",
        f"{school_name}, Norway",
        f"{school_name}, Norge",
    ]

    for query in queries:
        try:
            results = gmaps.geocode(query)

            if results:
                location = results[0]['geometry']['location']
                lat = location['lat']
                lng = location['lng']

                # Verify it's in Norway (rough bounds)
                if 57 <= lat <= 72 and 4 <= lng <= 32:
                    print(f"  ✅ Found: {school_name} → ({lat:.6f}, {lng:.6f})")
                    return (lat, lng)
                else:
                    print(f"  ⚠️  Coordinates outside Norway: {query}")

            # Rate limiting - Google allows 50 requests per second for paid, be conservative
            time.sleep(0.1)

        except Exception as e:
            print(f"  ❌ Error geocoding '{query}': {e}")
            continue

    print(f"  ❌ Not found: {school_name}")
    return None


def process_missing_coordinates(input_file: str, output_file: str, dry_run: bool = True):
    """
    Process the CSV file and geocode schools with missing coordinates.

    Args:
        input_file: Path to input CSV file
        output_file: Path to output CSV file with updated coordinates
        dry_run: If True, only print what would be done without making API calls
    """
    if not GOOGLEMAPS_AVAILABLE:
        print("❌ Cannot proceed: googlemaps package not installed")
        print("   Install it with: pip install googlemaps")
        return

    # Read all schools
    schools = []
    missing_coords = []

    print(f"\n📖 Reading {input_file}...")
    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter=';')
        for row in reader:
            schools.append(row)
            if row['lat'] == '0' and row['lng'] == '0':
                missing_coords.append(row)

    print(f"   Total schools: {len(schools)}")
    print(f"   Schools with coordinates: {len(schools) - len(missing_coords)}")
    print(f"   Schools missing coordinates: {len(missing_coords)}")

    if dry_run:
        print(f"\n🔍 DRY RUN MODE - Showing first 10 schools that need geocoding:")
        for i, school in enumerate(missing_coords[:10], 1):
            print(f"   {i}. {school['EnhetNavn']} ({school['Kommune']})")
        print(f"\n   ... and {len(missing_coords) - 10} more schools")
        print(f"\nTo actually geocode, run with dry_run=False")
        return

    # Initialize Google Maps client
    print(f"\n🔑 Initializing Google Maps API...")
    gmaps = get_google_maps_client()
    if not gmaps:
        return

    # Geocode missing coordinates
    print(f"\n🌍 Geocoding {len(missing_coords)} schools...")
    updated_count = 0
    failed = []

    for i, school in enumerate(missing_coords, 1):
        print(f"\n[{i}/{len(missing_coords)}] {school['EnhetNavn']} ({school['Kommune']})")

        coords = geocode_with_google(gmaps, school['EnhetNavn'], school['Kommune'])

        if coords:
            school['lat'] = str(coords[0])
            school['lng'] = str(coords[1])
            updated_count += 1
        else:
            failed.append(school)

        # Progress report every 20 schools
        if i % 20 == 0:
            print(f"\n📊 Progress: {i}/{len(missing_coords)} processed, {updated_count} found, {len(failed)} failed")

    # Write updated data
    print(f"\n💾 Writing updated data to {output_file}...")
    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        fieldnames = ['EnhetNavn', 'Kommune', 'Engelsk', 'Lesing', 'Regning', 'lat', 'lng']
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
        writer.writeheader()
        writer.writerows(schools)

    # Summary
    print(f"\n" + "=" * 80)
    print(f"✅ GEOCODING COMPLETE")
    print(f"=" * 80)
    print(f"   Successfully geocoded: {updated_count}/{len(missing_coords)} schools")
    print(f"   Failed to geocode: {len(failed)} schools")
    print(f"   Output saved to: {output_file}")

    if failed:
        print(f"\n❌ Schools that could not be geocoded:")
        for school in failed[:20]:
            print(f"   - {school['EnhetNavn']} ({school['Kommune']})")
        if len(failed) > 20:
            print(f"   ... and {len(failed) - 20} more")


def main():
    """Main function with user interaction."""
    print("=" * 80)
    print("Google Maps Geocoding for Norwegian Schools")
    print("=" * 80)

    input_file = '../processed-data/20260218-1045_Nasjonale_proever_5._trinn.csv'
    output_file = 'processed-data/20260218-1045_Nasjonale_proever_5._trinn_geocoded.csv'

    # First run in dry-run mode
    print("\n🔍 Running initial analysis...")
    process_missing_coordinates(input_file, output_file, dry_run=True)

    if not GOOGLEMAPS_AVAILABLE:
        return

    # Ask user if they want to proceed
    print("\n" + "=" * 80)
    print("⚠️  IMPORTANT: This will make API calls to Google Maps")
    print("   - You need a valid GOOGLE_MAPS_API_KEY in your environment")
    print("   - This may incur costs depending on your Google Cloud billing")
    print("   - 296 schools × ~4 queries each = ~1,184 API calls")
    print("=" * 80)

    response = input("\nProceed with geocoding? (yes/no): ").strip().lower()

    if response in ['yes', 'y']:
        print("\n🚀 Starting geocoding process...")
        process_missing_coordinates(input_file, output_file, dry_run=False)
    else:
        print("\n❌ Geocoding cancelled by user")


if __name__ == "__main__":
    main()

