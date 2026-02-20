from geo import get_geo_coordinates
import argparse

def find_school_coordinates(address):
    location = get_geo_coordinates(address)
    if location:
        lat = location.latitude
        lng = location.longitude
        return lat, lng
    else:
        print(f"WARNING: Could not geocode {address}")
        return None, None

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Find coordinates by address")
    parser.add_argument("address", help="Address of the school to geo locate")

    args = parser.parse_args()

    lat, lng = find_school_coordinates(args.address)

    if lat and lng:
        print(f"Address: {args.address}")
        print(f"Coordinates: {lat};{lng}")
    else:
        print(f"Could not find coordinates for {args.address}")
