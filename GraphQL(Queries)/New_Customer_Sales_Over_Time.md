## Definitions

### New or Returning Customer:
   - **New Customer:** A customer with `numberOfOrders` = 1 (first order).
   - **Returning Customer:** A customer with `numberOfOrders` > 1.
     
**Day:** The date (YYYY-MM-DD) of order creation.

**Customers:** Number of unique customers (by customer.id) per day.

**Orders:** Total number of orders placed per day.

**Total Sales:** Gross Sales - Discounts - Returns + Taxes + Shipping Charges.


### Step 1: Bulk Query to Extract New Customer Sales Data
We’ll use a GraphQL bulk query to fetch orders with customer details (`numberOfOrders` to determine new vs. returning) and financial data for calculating total sales.

```
mutation {
  bulkOperationRunQuery(
    query: """
    {
      orders(query: "created_at:>=2023-01-01") {
        edges {
          node {
            id
            createdAt
            customer {
              id
              totalOrders: numberOfOrders
            }
            subtotalPriceSet { shopMoney { amount } }
            totalDiscountsSet { shopMoney { amount } }
            totalRefundedSet { shopMoney { amount } }
            totalTaxSet { shopMoney { amount } }
            totalShippingPriceSet { shopMoney { amount } }
          }
        }
      }
    }
    """
  ) {
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
**What it does:**

- Fetches orders created on or after January 1, 2023.
- Includes:
  
     - `createdAt`: For grouping by day.
     - `customer { id, numberOfOrders }`: To identify new vs. returning customers.
     - Financial fields (`subtotalPriceSet`, `totalDiscountsSet`, `totalRefundedSet`, `totalTaxSet`, `totalShippingPriceSet`) for calculating Total Sales.


Output: A JSONL file (orders.jsonl) with order data.

### Step 2: Extract the Bulk Operation ID
The Bulk Operation ID is in the response under `data.bulkOperationRunQuery.bulkOperation.id`:

Bulk Operation ID: gid://shopify/BulkOperation/........
This will be extracted programmatically in the script.

### Step 3: Fetch the JSONL File URL Using the Bulk Operation ID
We’ll use the node query to poll the bulk operation status and retrieve the JSONL file URL once the operation completes.

```
query {
  node(id: "gid://shopify/BulkOperation/.......") {
    ... on BulkOperation {
      id
      status
      url
      completedAt
    }
  }
}
```

### Step 4: Download the JSONL File and Process It
We’ll write a Python script that:

- Executes the bulk query.
- Extracts the Bulk Operation ID.
- Polls for the JSONL URL.
- Downloads the JSONL file.
- Processes the file to calculate new customer sales over time.
- Stores the results in a database (SQLite).


```
import json
from datetime import datetime
import sqlite3
import csv

# Path to the JSONL file
JSONL_FILE_PATH = "Jsonl File path"
# Step 1: Read the JSONL file and determine customer types
data_by_day_and_type = {}  # Store aggregated data

# Read the JSONL file
try:
    with open(JSONL_FILE_PATH, "r") as file:
        jsonl_data = file.readlines()
except FileNotFoundError:
    print(f"Error: File {JSONL_FILE_PATH} not found. Please provide the correct JSONL file path.")
    exit()

# Process each line with error handling
for line in jsonl_data:
    # Skip empty or whitespace-only lines
    line = line.strip()
    if not line:
        continue
    
    try:
        data = json.loads(line)
        # Check if it's an order record
        if "id" not in data or not data["id"].startswith("gid://shopify/Order"):
            continue
        
        # Extract day
        created_at = datetime.strptime(data["createdAt"], "%Y-%m-%dT%H:%M:%SZ")
        day = created_at.strftime("%Y-%m-%d")
        
        # Determine customer type
        customer = data.get("customer")
        if not customer or not customer.get("id"):
            print(f"Skipping order {data['id']} (No customer data)")
            continue  # Skip guest checkouts
        
        customer_id = customer["id"]
        total_orders = int(customer.get("totalOrders", 0))
        
        # Determine customer type based solely on totalOrders
        customer_type = "New Customer" if total_orders == 1 else "Returning Customer"
        
        # Calculate Total Sales
        gross_sales = float(data["subtotalPriceSet"]["shopMoney"]["amount"])
        discounts = float(data["totalDiscountsSet"]["shopMoney"]["amount"])
        returns = float(data["totalRefundedSet"]["shopMoney"]["amount"])
        taxes = float(data["totalTaxSet"]["shopMoney"]["amount"])
        shipping = float(data["totalShippingPriceSet"]["shopMoney"]["amount"])
        total_sales = gross_sales - discounts - returns + taxes + shipping
        
        # Initialize data structure for the day and customer type
        key = (day, customer_type)
        if key not in data_by_day_and_type:
            data_by_day_and_type[key] = {
                "customers": set(),
                "orders": 0,
                "total_sales": 0.0
            }
        
        # Update metrics
        data_by_day_and_type[key]["customers"].add(customer_id)
        data_by_day_and_type[key]["orders"] += 1
        data_by_day_and_type[key]["total_sales"] += total_sales
    
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        print(f"Skipping invalid line: {line} (Error: {e})")
        continue

# Step 2: Calculate aggregated data
aggregated_data = []
for (day, customer_type), metrics in sorted(data_by_day_and_type.items(), key=lambda x: (x[0][0], x[0][1])):
    customers = len(metrics["customers"])
    orders = metrics["orders"]
    total_sales = metrics["total_sales"]
    aggregated_data.append((customer_type, day, customers, orders, total_sales))

# Step 3: Store results in SQLite database
print("Storing results in database...")
conn = sqlite3.connect("new_customer_sales.db")
cursor = conn.cursor()
cursor.execute("""
    CREATE TABLE IF NOT EXISTS new_customer_sales (
        customer_type TEXT,
        day TEXT,
        customers INTEGER,
        orders INTEGER,
        total_sales REAL,
        PRIMARY KEY (customer_type, day)
    )
""")
cursor.executemany("INSERT OR REPLACE INTO new_customer_sales (customer_type, day, customers, orders, total_sales) VALUES (?, ?, ?, ?, ?)", aggregated_data)
conn.commit()
conn.close()
print("Data stored in new_customer_sales.db")

# Step 4: Output results and save to CSV
print("New or Returning Customer | Day | Customers | Orders | Total Sales")
print("-" * 60)
with open("new_customer_sales_over_time.csv", "w", newline="") as csvfile:
    writer = csv.writer(csvfile)
    writer.writerow(["New or Returning Customer", "Day", "Customers", "Orders", "Total Sales"])
    for customer_type, day, customers, orders, total_sales in aggregated_data:
        print(f"{customer_type} | {day} | {customers} | {orders} | ${total_sales:.2f}")
        writer.writerow([customer_type, day, customers, orders, f"${total_sales:.2f}"])

```

**Output**

<img width="581" alt="Screenshot 2025-05-05 at 16 52 48" src="https://github.com/user-attachments/assets/b82e1ffd-727f-40de-98e7-a4a492e69a00" />


