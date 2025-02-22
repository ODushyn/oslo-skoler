import csv

def parse_csv_to_objects(file_path):
    # Initialize an empty list to hold the objects
    data = []

    # Open the CSV file
    with open(file_path, newline='', encoding='utf-8') as csvfile:
        # Create a CSV reader object
        reader = csv.DictReader(csvfile, delimiter=';')

        # Iterate over the rows in the CSV
        for row in reader:
            # Append each row as a dictionary to the data list
            data.append({
                'name': row['Skole'],
                'engelsk': int(row['Engelsk']),
                'lesing': int(row['Lesing']),
                'regning': int(row['Regning'])
            })

    return data