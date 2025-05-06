Need to fetch the following data:- 
**New customers over time:**
  - Day
  - Customers
  - Orders
  - Total sales


The `Customer_by_location.md` script we’ve been working with focuses on aggregating `new customers by location`, but it doesn’t track `new customers over time (by day)` or include `orders` and `total sales`. We’ll need to create a new script to meet this requirement, leveraging Shopify’s GraphQL API data (similar to the JSONL file format you provided) and Shopify’s definition of a "new customer" (a customer who placed their first order during the time period, as per Shopify’s customer reports).

**Understanding the Requirement**
- Columns:
    - `Day:` The date (e.g., 2025-05-01).
    - `Customers:` The number of new customers who placed their first order on that day.
    - `Orders:` The total number of orders placed by these new customers on that day.
    - `Total sales:` The total sales amount (in the store’s currency) from these orders.

**New Customer:** Based on Shopify’s customer reports (e.g., "First-time vs returning customer sales report"), a new customer is someone who placed their first order with the store during the specified time period. This means we need to look at the customer’s entire order history to determine if a given order is their first.

### Step 1: Define the Bulk Query to Fetch Required Data
We need a GraphQL bulk query to fetch:

    - All customers and their full order history (not just the first order).
    - Each order’s `createdAt` date and `totalPrice` (to calculate total sales).

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

**Notes:**

- `orders(first: 250)`: Fetches up to 250 orders per customer. If a customer has more than 250 orders, we’d need to paginate further, but for most stores, this should suffice. Shopify bulk operations automatically handle pagination for customers.
- `createdAt`: The date the order was placed.
- `totalPriceSet.shopMoney.amount`: The total price of the order in the store’s currency.

**Poll Query**

```
query {
  node(id: "gid://shopify/BulkOperation/......") {
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

### Step 2: Write a Script to Extract New Customers Over Time
We’ll create a Python script to:

  - Read the JSONL file.
  - Determine new customers by finding the earliest order for each customer.
  - Group new customers by the day of their first order.
  - Calculate the number of new customers, orders, and total sales per day.
  - Output the results in a CSV file with columns `Day`, `Customers`, `Orders`, `Total sales`.

```
import json
import csv
from collections import defaultdict
from datetime import datetime

# Path to the JSONL file
JSONL_FILE_PATH = "/content/New_Customers_Over_TIme.jsonl"

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

# Step 2: Process new customers, orders, and sales by day
new_customers_by_day = defaultdict(lambda: {"customers": set(), "orders": 0, "total_sales": 0.0})
for customer_id, data in customers.items():
    orders = data.get("orders", {}).get("edges", [])
    
    if not orders:  # Skip customers with no orders
        print(f"Customer {customer_id} has no orders, skipping")
        continue
        
    # Find the earliest order to determine if/when this customer is new
    earliest_order = None
    for order_edge in orders:
        order = order_edge.get("node", {})
        created_at = order.get("createdAt")
        if not created_at:
            continue
        order_date = datetime.strptime(created_at, "%Y-%m-%dT%H:%M:%SZ").date()
        if earliest_order is None or order_date < earliest_order["date"]:
            earliest_order = {"date": order_date, "order": order}
    
    if earliest_order:
        first_order_date = earliest_order["date"].strftime("%Y-%m-%d")
        # This customer is new on first_order_date
        new_customers_by_day[first_order_date]["customers"].add(customer_id)
        
        # Count all orders placed by this customer on their first order date
        for order_edge in orders:
            order = order_edge.get("node", {})
            created_at = order.get("createdAt")
            if not created_at:
                continue
            order_date = datetime.strptime(created_at, "%Y-%m-%dT%H:%M:%SZ").date().strftime("%Y-%m-%d")
            if order_date == first_order_date:
                new_customers_by_day[first_order_date]["orders"] += 1
                total_price = float(order.get("totalPriceSet", {}).get("shopMoney", {}).get("amount", 0.0))
                new_customers_by_day[first_order_date]["total_sales"] += total_price
        print(f"Customer {customer_id} is new on {first_order_date}")
    else:
        print(f"Customer {customer_id} has no valid orders, skipping")

# Step 3: Prepare the aggregated data for output
data_list = []
for day, metrics in sorted(new_customers_by_day.items()):
    data_list.append((
        day,
        len(metrics["customers"]),  # Number of new customers
        metrics["orders"],         # Total orders by new customers on that day
        round(metrics["total_sales"], 2)  # Total sales, rounded to 2 decimal places
    ))

# Step 4: Output results and save to CSV
print("Day | Customers | Orders | Total sales")
print("-" * 40)
with open("new_customers_over_time.csv", "w", newline="") as csvfile:
    writer = csv.writer(csvfile)
    writer.writerow(["Day", "Customers", "Orders", "Total sales"])
    for day, customers, orders, total_sales in data_list:
        # Print to console
        print(f"{day} | {customers} | {orders} | {total_sales}")
        # Write to CSV
        writer.writerow([day, customers, orders, total_sales])

# Log summary
print(f"\nLines processed: {lines_processed}")
print(f"Invalid lines skipped: {invalid_lines}")
print(f"Days with new customers: {len(data_list)}")

```

#### How the Script Works
**1. Read the JSONL File:**
  - Opens `.jsonl` and processes each line.
  - Skips non-customer records (though in this query format, all lines should be customer records since orders are nested).
    
**2. Identify New Customers:**
  - For each customer, iterates through their orders to find the earliest `createdAt` date.
  - The customer is considered "new" on the day of their earliest order.
  - Uses a `set` to track unique new customer IDs per day.
    
**3. Aggregate Data by Day:**
  - Groups data by the day of the first order.
  - For each day:
      - `Customers`: Counts unique new customers (using a `set`).
      - `Orders`: Counts all orders placed by these new customers on that day.
      - `Total sales`: Sums the `totalPriceSet.shopMoney.amount` for those orders.
**4. Output:**
  - Sorts the data by day.
  - Writes to `new_customers_over_time.csv` with columns `Day`, `Customers`, `Orders`, `Total sales`.

#### Output
<img width="736" alt="Screenshot 2025-05-07 at 00 07 44" src="https://github.com/user-attachments/assets/26b91504-0db1-4e43-80f0-0042e2073511" />



