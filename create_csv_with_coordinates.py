import csv
import time
from geo import get_geo_coordinates


def parse_csv_to_objects(file_path, output_file_path):
    # Initialize an empty list to hold the objects
    data = []

    # Open the CSV file
    with open(file_path, newline='', encoding='utf-8') as csvfile:
        # Create a CSV reader object
        reader = csv.DictReader(csvfile, delimiter=';')

        # Iterate over the rows in the CSV
        for row in reader:
            lat = 0
            lng = 0
            location = get_geo_coordinates(row['Skole'])
            if location:
                lat = location.latitude
                lng = location.longitude
            time.sleep(0.1)  # To avoid rate limits
            # Append each row as a dictionary to the data list
            data.append({
                'Skole': row['Skole'],
                'Engelsk': int(row['Engelsk']),
                'Lesing': int(row['Lesing']),
                'Regning': int(row['Regning']),
                'lat': lat,  # Adding lat with constant value
                'lng': lng   # Adding lng with constant value
            })
    # Define the fieldnames for the output CSV
    fieldnames = ['Skole', 'Engelsk', 'Lesing', 'Regning', 'lat', 'lng']

    # Write the updated data to a new CSV file
    with open(output_file_path, mode='w', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames, delimiter=';')
        writer.writeheader()  # Write the header
        writer.writerows(data)  # Write the data rows

# Example usage
parse_csv_to_objects('skoler_2024-2025.csv', 'skoler_2024-2025_coordinates.csv')