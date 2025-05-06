Need to extract following data:- 

**New vs returning customers**:
    - New or returning customer
    - Customers
    - Customers (previous_period)
    
### Step 1: Bulk Query

```
mutation {
   bulkOperationRunQuery(query: """{
  customers(first: 250) {
    edges {
      node {
        id
        displayName
        orders(first: 250) {
          edges {
            node {
              id
              createdAt
              totalPriceSet {
                shopMoney {
                  amount
                }
              }
            }
          }
        }
      }
    }
  }
}""" ) {
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
### Step 2: Process the Jsonl file to extract required data.

```
import json
import csv
from collections import defaultdict
from datetime import datetime, timedelta

# Path to the JSONL file
JSONL_FILE_PATH = "/content/New_Customers_Over_TIme.jsonl"

# Define periods (based on current date: May 7, 2025)
CURRENT_END = datetime(2025, 5, 7).date()
CURRENT_START = CURRENT_END - timedelta(days=29)  # 30-day period: April 8 to May 7, 2025
PREVIOUS_END = CURRENT_START - timedelta(days=1)  # April 7, 2025
PREVIOUS_START = PREVIOUS_END - timedelta(days=29)  # 30-day period: March 9 to April 7, 2025

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
            customer_id = data["id"].replace("gid://shopify/Customer/", "")
            customers[customer_id] = data
            if "orders" not in data:
                data["orders"] = {"edges": []}
            print(f"Line {lines_processed}: Found customer {customer_id}")
        # Order record
        elif "id" in data and data["id"].startswith("gid://shopify/Order"):
            parent_id = data.get("__parentId", "").replace("gid://shopify/Customer/", "")
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
    
    except (json.JSONDecodeError, ValueError) as e:
        print(f"Line {lines_processed}: Skipping invalid line: {line} (Error: {e})")
        invalid_lines += 1
        continue

# Second pass: Reconstruct nested structure
for customer_id, orders in orders_by_customer.items():
    if customer_id in customers:
        customers[customer_id]["orders"]["edges"] = [{"node": order} for order in orders]

# Step 2: Classify customers as new or returning in each period
current_new = set()  # New customers in the current period
current_returning = set()  # Returning customers in the current period
previous_new = set()  # New customers in the previous period
previous_returning = set()  # Returning customers in the previous period

for customer_id, data in customers.items():
    orders = data.get("orders", {}).get("edges", [])
    
    if not orders:  # Skip customers with no orders
        print(f"Customer {customer_id} has no orders, skipping")
        continue
    
    # Find the earliest order to determine when the customer is new
    earliest_order_date = None
    for order_edge in orders:
        order = order_edge.get("node", {})
        created_at = order.get("createdAt")
        if not created_at:
            continue
        order_date = datetime.strptime(created_at, "%Y-%m-%dT%H:%M:%SZ").date()
        if earliest_order_date is None or order_date < earliest_order_date:
            earliest_order_date = order_date
    
    if earliest_order_date is None:
        print(f"Customer {customer_id} has no valid orders, skipping")
        continue
    
    # Determine if the customer is new in either period
    is_new_in_current = CURRENT_START <= earliest_order_date <= CURRENT_END
    is_new_in_previous = PREVIOUS_START <= earliest_order_date <= PREVIOUS_END
    
    # Check orders in the current period
    has_current_orders = False
    for order_edge in orders:
        order = order_edge.get("node", {})
        created_at = order.get("createdAt")
        if not created_at:
            continue
        order_date = datetime.strptime(created_at, "%Y-%m-%dT%H:%M:%SZ").date()
        if CURRENT_START <= order_date <= CURRENT_END:
            has_current_orders = True
            break
    
    # Check orders in the previous period
    has_previous_orders = False
    for order_edge in orders:
        order = order_edge.get("node", {})
        created_at = order.get("createdAt")
        if not created_at:
            continue
        order_date = datetime.strptime(created_at, "%Y-%m-%dT%H:%M:%SZ").date()
        if PREVIOUS_START <= order_date <= PREVIOUS_END:
            has_previous_orders = True
            break
    
    # Classify for the current period
    if has_current_orders:
        if is_new_in_current:
            current_new.add(customer_id)
            print(f"Customer {customer_id} is new in current period")
        elif earliest_order_date < CURRENT_START:
            current_returning.add(customer_id)
            print(f"Customer {customer_id} is returning in current period")
    
    # Classify for the previous period
    if has_previous_orders:
        if is_new_in_previous:
            previous_new.add(customer_id)
            print(f"Customer {customer_id} is new in previous period")
        elif earliest_order_date < PREVIOUS_START:
            previous_returning.add(customer_id)
            print(f"Customer {customer_id} is returning in previous period")

# Step 3: Prepare the aggregated data for output
data_list = [
    ("New", len(current_new), len(previous_new)),
    ("Returning", len(current_returning), len(previous_returning))
]

# Step 4: Output results and save to CSV
print("New or returning customer | Customers | Customers (previous_period)")
print("-" * 70)
with open("new_vs_returning_customers.csv", "w", newline="") as csvfile:
    writer = csv.writer(csvfile)
    writer.writerow(["New or returning customer", "Customers", "Customers (previous_period)"])
    for category, customers, customers_prev in data_list:
        # Print to console
        print(f"{category} | {customers} | {customers_prev}")
        # Write to CSV
        writer.writerow([category, customers, customers_prev])

# Log summary
print(f"\nLines processed: {lines_processed}")
print(f"Invalid lines skipped: {invalid_lines}")

```

**Note**
`Current Period`: Likely a month, such as April 1–April 30, 2025
`Previous Period`: Likely March 1–March 31, 2025 (the previous month).

We can Change this period as per our requirement.

### Output

<img width="692" alt="Screenshot 2025-05-07 at 00 35 12" src="https://github.com/user-attachments/assets/47bd075e-d6b3-4a20-b55e-6e59632f5385" />
