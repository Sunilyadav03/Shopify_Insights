Need to extract following data:-

**Customers by location**

- Customer country
- Customer region
- Customer city
- New customer records

## Step 1: Write Shopify Bulk Queries to Fetch Customer Location Data

```
mutation {
  bulkOperationRunQuery(query: """{ customers(first: 250) { edges { node { id displayName defaultAddress { country provinceCode city } orders(first: 1) { edges { node { id } } } } } } }""" ) {
    bulkOperation {
      id
      status
    }
    userErrors {
      field
      message
    }
  }
}

```

**Poll Query**

```
query {
  node(id: "gid://shopify/BulkOperation/.......") {
    ... on BulkOperation {
      id
      status
      url
      errorCode
      objectCount
    }
  }
}

```


## Step 2: Process the JSONL Data to Aggregate by Location

We’ll write a Python script to:

- Read the JSONL file.
- Extract customer location data (country, region, city).
- Determine if each customer is a new customer (has exactly 1 order).
- Aggregate the data by location (group by country, region, city) and count new customers.
- Output the aggregated data in a CSV file with the same formatting as the previous RFM outputs.

```

import json
import csv
from collections import defaultdict

# Path to the JSONL file
JSONL_FILE_PATH = "/content/Customers_by_location.jsonl"

# Step 1: Process the JSONL file to reconstruct customer-order relationships
customers = {}  # Store customer records
orders_by_customer = {}  # Map customer ID to their orders
lines_processed = 0
invalid_lines = 0

# Read the JSONL file
try:
    with open(JSONL_FILE_PATH, "r") as file:
        jsonl_data = file.readlines()
except FileNotFoundError:
    print(f"Error: File {JSONL_FILE_PATH} not found.")
    exit()

print(f"Total lines in file: {len(jsonl_data)}")

# First pass: Group customers and orders
for line in jsonl_data:
    lines_processed += 1
    line = line.strip()
    if not line:
        print(f"Line {lines_processed}: Empty line, skipping")
        continue
    
    try:
        data = json.loads(line)
        # Customer record
        if "id" in data and data["id"].startswith("gid://shopify/Customer"):
            customer_id = data["id"].replace("gid://shopify/Customer/", "")  # Strip the prefix
            customers[customer_id] = data
            if "orders" not in data:
                data["orders"] = {"edges": []}
            print(f"Line {lines_processed}: Found customer {customer_id}")
        # Order record
        elif "id" in data and data["id"].startswith("gid://shopify/Order"):
            parent_id = data.get("__parentId", "").replace("gid://shopify/Customer/", "")  # Strip the prefix
            if not parent_id or not parent_id.isdigit():
                print(f"Line {lines_processed}: Order {data['id']} has no valid parent ID, skipping")
                invalid_lines += 1
                continue
            if parent_id not in orders_by_customer:
                orders_by_customer[parent_id] = []
            orders_by_customer[parent_id].append(data)
            print(f"Line {lines_processed}: Found order {data['id']} for customer {parent_id}")
        else:
            print(f"Line {lines_processed}: Not a customer or order record")
            invalid_lines += 1
            continue
    
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        print(f"Line {lines_processed}: Skipping invalid line: {line} (Error: {e})")
        invalid_lines += 1
        continue

# Second pass: Reconstruct nested structure
for customer_id, orders in orders_by_customer.items():
    if customer_id in customers:
        customers[customer_id]["orders"]["edges"] = [{"node": order} for order in orders]

# Step 2: Process customer location data
location_counts = defaultdict(int)  # (country, region, city) -> count of new customers
for customer_id, data in customers.items():
    # Extract location data, handle None for defaultAddress
    default_address = data.get("defaultAddress")
    if default_address is None:
        country = "Unknown"
        region = "ZZ"
        city = "ZZ"
    else:
        country = default_address.get("country", "Unknown")
        region = default_address.get("provinceCode", "ZZ")  # Use "ZZ" for missing regions
        city = default_address.get("city", "ZZ")  # Use "ZZ" for missing cities
    
    # Determine if the customer is new (has exactly 1 order)
    orders = data.get("orders", {}).get("edges", [])
    is_new_customer = len(orders) == 1
    
    if is_new_customer:
        location_key = (country, region, city)
        location_counts[location_key] += 1
        print(f"Customer {customer_id} is a new customer at {country}, {region}, {city}")
    else:
        print(f"Customer {customer_id} is not new (has {len(orders)} orders), skipping")

# Step 3: Prepare the aggregated data for output
location_list = []
for (country, region, city), new_customer_count in sorted(location_counts.items(), key=lambda x: (-x[1], x[0][0], x[0][1], x[0][2])):
    location_list.append((country, region, city, new_customer_count))

# Step 4: Output results and save to CSV
print("Customer country | Customer region | Customer city | New customer records")
print("-" * 80)
with open("customers_by_location.csv", "w", newline="") as csvfile:
    writer = csv.writer(csvfile)
    writer.writerow(["Customer country", "Customer region", "Customer city", "New customer records"])
    for country, region, city, new_customer_count in location_list:
        # Print to console
        print(f"{country} | {region} | {city} | {new_customer_count}")
        # Write to CSV
        writer.writerow([country, region, city, new_customer_count])

# Log summary
print(f"\nLines processed: {lines_processed}")
print(f"Invalid lines skipped: {invalid_lines}")
print(f"Unique locations with new customers: {len(location_list)}")

```

This above script processes a Shopify JSONL file (`Customers_by_location.jsonl`) containing customer and order data, aggregates new customers by location (country, region, city), and outputs the results in a CSV file (`customers_by_location.csv`) format.

**Purpose of the Script**
The script’s goal is to:

- Read customer data from a Shopify JSONL file.
- Identify "new customers" (defined as customers with exactly 1 order).
- Group these new customers by their location (country, region, city).
- Count the number of new customers per location.
- Output the aggregated data in a CSV file

**Output**

<img width="702" alt="Screenshot 2025-05-06 at 23 37 26" src="https://github.com/user-attachments/assets/abc8e153-b5b5-4de6-ad53-6da69894a368" />
