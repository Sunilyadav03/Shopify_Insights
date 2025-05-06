Need to fetch the following data:- 
**New customers over time:**
  - Day
  - Customers
  - Orders
  - Total sales
  - Day (previous_period)
  - Customers (previous_period)
  - Orders (previous_period)
  - Total sales (previous_period)



The `Customer_by_location.md` script we’ve been working with focuses on aggregating `new customers by location`, but it doesn’t track `new customers over time (by day)` or include `orders` and `total sales`. We’ll need to create a new script to meet this requirement, leveraging Shopify’s GraphQL API data (similar to the JSONL file format you provided) and Shopify’s definition of a "new customer" (a customer who placed their first order during the time period, as per Shopify’s customer reports).

**Understanding the Requirement**
- Columns:
    - `Day`: The date (e.g., 2025-04-29).
    - `Customers`: The number of new customers who placed their first order on that day.
    - `Orders`: The total number of orders placed by these new customers on that day.
    - `Total sales`: The total sales amount (in the store’s currency) from these orders.
    - `Day (previous_period)`: The corresponding day in the previous period (e.g., if the current day is `2025-04-29`, the previous period day might be `2025-03-29` for a month-over-month comparison).
    - `Customers (previous_period)`: Number of new customers on the corresponding day in the previous period.
    - `Orders (previous_period)`: Number of orders placed by those new customers on that day in the previous period.
    - `Total sales (previous_period)`: Total sales from those orders in the previous period.

**New Customer:** Based on Shopify’s customer reports, a new customer is someone who placed their first order with the store during the specified time period. This means we need to look at the customer’s entire order history to determine if a given order is their first.

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
from datetime import datetime, timedelta

# Path to the JSONL file
JSONL_FILE_PATH = "/content/New_Customers_Over_Time.jsonl"

# Define periods (based on the latest order date in the JSONL file: April 29, 2025)
CURRENT_END = datetime(2025, 4, 30).date()  # April 1 to April 30, 2025
CURRENT_START = datetime(2025, 4, 1).date()
PREVIOUS_END = datetime(2025, 3, 31).date()  # March 1 to March 31, 2025
PREVIOUS_START = datetime(2025, 3, 1).date()

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

# Step 2: Process new customers, orders, and sales by day for both periods
current_new_customers_by_day = defaultdict(lambda: {"customers": set(), "orders": 0, "total_sales": 0.0})
previous_new_customers_by_day = defaultdict(lambda: {"customers": set(), "orders": 0, "total_sales": 0.0})

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
        first_order_date = earliest_order["date"]
        first_order_day_str = first_order_date.strftime("%Y-%m-%d")
        
        # Determine the period
        if CURRENT_START <= first_order_date <= CURRENT_END:
            period = "current"
            new_customers_by_day = current_new_customers_by_day
        elif PREVIOUS_START <= first_order_date <= PREVIOUS_END:
            period = "previous"
            new_customers_by_day = previous_new_customers_by_day
        else:
            print(f"Customer {customer_id}'s first order on {first_order_day_str} is outside the defined periods, skipping")
            continue
        
        # This customer is new on first_order_day_str
        new_customers_by_day[first_order_day_str]["customers"].add(customer_id)
        
        # Count all orders placed by this customer on their first order date
        for order_edge in orders:
            order = order_edge.get("node", {})
            created_at = order.get("createdAt")
            if not created_at:
                continue
            order_date = datetime.strptime(created_at, "%Y-%m-%dT%H:%M:%SZ").date().strftime("%Y-%m-%d")
            if order_date == first_order_day_str:
                new_customers_by_day[first_order_day_str]["orders"] += 1
                total_price = float(order.get("totalPriceSet", {}).get("shopMoney", {}).get("amount", 0.0))
                new_customers_by_day[first_order_day_str]["total_sales"] += total_price
        print(f"Customer {customer_id} is new on {first_order_day_str} in {period} period")
    else:
        print(f"Customer {customer_id} has no valid orders, skipping")

# Step 3: Prepare the aggregated data for output
# Function to get the corresponding day in the previous period
def get_previous_period_day(day_str):
    day = datetime.strptime(day_str, "%Y-%m-%d").date()
    # Subtract 31 days to approximate the same day in the previous month
    previous_day = day - timedelta(days=31)
    return previous_day.strftime("%Y-%m-%d")

# Aggregate data with previous period comparison
data_list = []
for day in sorted(current_new_customers_by_day.keys()):
    current_metrics = current_new_customers_by_day[day]
    current_customers = len(current_metrics["customers"])
    current_orders = current_metrics["orders"]
    current_total_sales = round(current_metrics["total_sales"], 2)
    
    # Get the corresponding day in the previous period
    prev_day = get_previous_period_day(day)
    previous_metrics = previous_new_customers_by_day.get(prev_day, {"customers": set(), "orders": 0, "total_sales": 0.0})
    prev_customers = len(previous_metrics["customers"])
    prev_orders = previous_metrics["orders"]
    prev_total_sales = round(previous_metrics["total_sales"], 2)
    
    data_list.append((
        day,
        current_customers,
        current_orders,
        current_total_sales,
        prev_day,
        prev_customers,
        prev_orders,
        prev_total_sales
    ))

# Step 4: Output results and save to CSV
print("Day | Customers | Orders | Total sales | Day (previous_period) | Customers (previous_period) | Orders (previous_period) | Total sales (previous_period)")
print("-" * 100)
with open("new_customers_over_time.csv", "w", newline="") as csvfile:
    writer = csv.writer(csvfile)
    writer.writerow([
        "Day", "Customers", "Orders", "Total sales",
        "Day (previous_period)", "Customers (previous_period)", "Orders (previous_period)", "Total sales (previous_period)"
    ])
    for row in data_list:
        day, customers, orders, total_sales, prev_day, prev_customers, prev_orders, prev_total_sales = row
        print(f"{day} | {customers} | {orders} | {total_sales} | {prev_day} | {prev_customers} | {prev_orders} | {prev_total_sales}")
        writer.writerow([day, customers, orders, total_sales, prev_day, prev_customers, prev_orders, prev_total_sales])

# Log summary
print(f"\nLines processed: {lines_processed}")
print(f"Invalid lines skipped: {invalid_lines}")
print(f"Days with new customers in current period: {len(data_list)}")

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
  - Writes to `new_customers_over_time.csv` with columns `Day`, `Customers`, `Orders`, `Total sales`, `Day (previous_period)`, `Customers (previous_period)`, `Orders (previous_period)`, `Total sales (previous_period)` .

#### Output

```
Total lines in file: 8
Line 1: Found customer 7877707333828
Line 2: Found order gid://shopify/Order/6097030021316 for customer 7877707333828
Line 3: Found order gid://shopify/Order/6097059578052 for customer 7877707333828
Line 4: Found customer 7877707366596
Line 5: Found customer 7877707399364
Line 6: Found customer 7879644184772
Line 7: Found customer 7906903261380
Line 8: Found order gid://shopify/Order/6097046110404 for customer 7906903261380
Customer 7877707333828 is new on 2025-04-29 in current period
Customer 7877707366596 has no orders, skipping
Customer 7877707399364 has no orders, skipping
Customer 7879644184772 has no orders, skipping
Customer 7906903261380 is new on 2025-04-29 in current period
Day | Customers | Orders | Total sales | Day (previous_period) | Customers (previous_period) | Orders (previous_period) | Total sales (previous_period)
----------------------------------------------------------------------------------------------------
2025-04-29 | 2 | 3 | 40709.83 | 2025-03-29 | 0 | 0 | 0.0

Lines processed: 8
Invalid lines skipped: 0
Days with new customers in current period: 1
```
