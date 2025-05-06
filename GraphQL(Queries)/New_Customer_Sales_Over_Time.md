## Definitions


`New or returning customer`: Whether the customer is "New Customer" (first order, `numberOfOrders = 1`) or "Returning Customer" (`numberOfOrders > 1`).

`Day`: The date (YYYY-MM-DD) of order creation.

`Customers`: Number of unique customers (by customer.id) per day.

`Orders`: Total number of orders placed per day.

`Total sales`: Gross Sales - Discounts - Returns + Taxes + Shipping Charges.

`Day (previous_period)`: The corresponding day in the previous period.

`Customers (previous_period)`: Number of unique customers on the corresponding day in the previous period.

`Orders (previous_period)`: Total number of orders on that day in the previous period.

`Total sales (previous_period)`: Total sales on that day in the previous period.

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
  node(id: "gid://shopify/BulkOperation/..........") {
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
from datetime import datetime, timedelta
import sqlite3
import csv

# Path to the JSONL file
JSONL_FILE_PATH = "New_Customer_Sales_Over_Time.jsonl"

# Define periods (based on the latest order date in previous data: April 29, 2025)
CURRENT_END = datetime(2025, 4, 30).date()  # April 1 to April 30, 2025
CURRENT_START = datetime(2025, 4, 1).date()
PREVIOUS_END = datetime(2025, 3, 31).date()  # March 1 to March 31, 2025
PREVIOUS_START = datetime(2025, 3, 1).date()

# Step 1: Read the JSONL file and determine customer types for both periods
current_data_by_day_and_type = {}  # Store aggregated data for current period
previous_data_by_day_and_type = {}  # Store aggregated data for previous period

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
        created_at = datetime.strptime(data["createdAt"], "%Y-%m-%dT%H:%M:%SZ").date()
        day = created_at.strftime("%Y-%m-%d")
        
        # Determine the period
        if CURRENT_START <= created_at <= CURRENT_END:
            period = "current"
            data_by_day_and_type = current_data_by_day_and_type
        elif PREVIOUS_START <= created_at <= PREVIOUS_END:
            period = "previous"
            data_by_day_and_type = previous_data_by_day_and_type
        else:
            continue  # Skip orders outside both periods
        
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

# Step 2: Calculate aggregated data with previous period comparison
# Function to get the corresponding day in the previous period
def get_previous_period_day(day_str):
    day = datetime.strptime(day_str, "%Y-%m-%d").date()
    # Subtract 31 days to approximate the same day in the previous month
    previous_day = day - timedelta(days=31)
    return previous_day.strftime("%Y-%m-%d")

# Aggregate data for output
aggregated_data = []
for (day, customer_type) in sorted(current_data_by_day_and_type.keys(), key=lambda x: (x[0], x[1])):
    current_metrics = current_data_by_day_and_type[(day, customer_type)]
    current_customers = len(current_metrics["customers"])
    current_orders = current_metrics["orders"]
    current_total_sales = current_metrics["total_sales"]
    
    # Get the corresponding day in the previous period
    prev_day = get_previous_period_day(day)
    previous_metrics = previous_data_by_day_and_type.get((prev_day, customer_type), {
        "customers": set(),
        "orders": 0,
        "total_sales": 0.0
    })
    prev_customers = len(previous_metrics["customers"])
    prev_orders = previous_metrics["orders"]
    prev_total_sales = previous_metrics["total_sales"]
    
    aggregated_data.append((
        customer_type,
        day,
        current_customers,
        current_orders,
        current_total_sales,
        prev_day,
        prev_customers,
        prev_orders,
        prev_total_sales
    ))

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
        day_previous_period TEXT,
        customers_previous_period INTEGER,
        orders_previous_period INTEGER,
        total_sales_previous_period REAL,
        PRIMARY KEY (customer_type, day, day_previous_period)
    )
""")
cursor.executemany("""
    INSERT OR REPLACE INTO new_customer_sales (
        customer_type, day, customers, orders, total_sales,
        day_previous_period, customers_previous_period,
        orders_previous_period, total_sales_previous_period
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
""", aggregated_data)
conn.commit()
conn.close()
print("Data stored in new_customer_sales.db")

# Step 4: Output results and save to CSV
print("New or Returning Customer | Day | Customers | Orders | Total Sales | Day (previous_period) | Customers (previous_period) | Orders (previous_period) | Total Sales (previous_period)")
print("-" * 120)
with open("new_customer_sales_over_time.csv", "w", newline="") as csvfile:
    writer = csv.writer(csvfile)
    writer.writerow([
        "New or Returning Customer", "Day", "Customers", "Orders", "Total Sales",
        "Day (previous_period)", "Customers (previous_period)", "Orders (previous_period)", "Total Sales (previous_period)"
    ])
    for row in aggregated_data:
        customer_type, day, customers, orders, total_sales, prev_day, prev_customers, prev_orders, prev_total_sales = row
        print(f"{customer_type} | {day} | {customers} | {orders} | {total_sales:.2f} | {prev_day} | {prev_customers} | {prev_orders} | {prev_total_sales:.2f}")
        writer.writerow([customer_type, day, customers, orders, f"{total_sales:.2f}", prev_day, prev_customers, prev_orders, f"{prev_total_sales:.2f}"])

```

**Output**

```
Skipping order gid://shopify/Order/6097062101188 (No customer data)
Storing results in database...
Data stored in new_customer_sales.db
New or Returning Customer | Day | Customers | Orders | Total Sales | Day (previous_period) | Customers (previous_period) | Orders (previous_period) | Total Sales (previous_period)
------------------------------------------------------------------------------------------------------------------------
New Customer | 2025-04-29 | 1 | 1 | 33774.00 | 2025-03-29 | 0 | 0 | 0.00
Returning Customer | 2025-04-29 | 1 | 2 | 3964.83 | 2025-03-29 | 0 | 0 | 0.00

```
