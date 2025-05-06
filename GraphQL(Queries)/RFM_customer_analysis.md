**Need to extract following data:-**
-  RFM group
-  Percent of customers
-  New customer records
-  Days since last order
-  Total number of orders
-  Total amount spent


### What is RFM Analysis?
RFM (Recency, Frequency, Monetary) analysis segments customers based on:

- Recency (R): How recently they made a purchase (Days Since Last Order).
- Frequency (F): How often they purchase (Total Number of Orders).
- Monetary (M): How much they spend (Total Amount Spent).
  
We’ll define `RFM Groups` by scoring customers on these three metrics and grouping them into segments (e.g., High-Value, At-Risk, New). The other metrics (Percent of Customers, New Customer Records) will be calculated during post-processing.

### Definitions
- **RFM Group:** A segment like “High-Value”, “At-Risk”, “New”, based on RFM scores.
- **Percent of Customers:** Percentage of total customers in each RFM group.
- **New Customer Records:** Number of customers with only 1 order.
- **Days Since Last Order:** Days between the customer’s last order and today (May 06, 2025).
- **Total Number of Orders:** Total orders placed by the customer.
- **Total Amount Spent:** Total spent by the customer across all orders.

### Strategy
Since Shopify’s bulk query has limitations (e.g., no nested connections), we’ll:

- Use a bulk query to fetch customers and their orders.
- Process the data to calculate RFM metrics and assign RFM groups.
- Compute the final metrics and output the results.

### Step 1: Bulk Query to Fetch Customer and Order Data

We’ll fetch customers with their orders to get the necessary data for RFM analysis. Shopify’s `Customer` type provides `numberOfOrders` and `totalSpentV2`, but we need order dates to calculate recency, so we’ll fetch `orders` directly.

```
mutation {
  bulkOperationRunQuery(
    query: """
    {
      customers {
        edges {
          node {
            id
            orders(first: 100) {
              edges {
                node {
                  id
                  createdAt
                  subtotalPriceSet {
                    shopMoney {
                      amount
                    }
                  }
                  totalDiscountsSet {
                    shopMoney {
                      amount
                    }
                  }
                  totalTaxSet {
                    shopMoney {
                      amount
                    }
                  }
                  totalShippingPriceSet {
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
**What This Does:**

- Fetches all customers and their orders (up to 100 per customer).
- For each order, retrieves:
    - createdAt: To calculate recency.
    - Financial fields (subtotalPriceSet, totalDiscountsSet, totalTaxSet, totalShippingPriceSet) to calculate total spent.


```
query {
  node(id: "gid://shopify/BulkOperation/5337479545028") {
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
Outputs a JSONL file (customers.jsonl).

### Step 2: Process JSONL File to Calculate RFM Metrics
Process the customers.jsonl file to calculate:

- Days Since Last Order (Recency).
- Total Number of Orders (Frequency).
- Total Amount Spent (Monetary).
- Assign RFM scores and groups.
We’ll use a simple scoring method (1-5 scale for each metric) and define RFM groups based on the scores.

```
import json
from datetime import datetime, timedelta, date

# Automatically get the current date (timezone-naive, date only)
CURRENT_DATE = date.today()

# Path to the JSONL file
JSONL_FILE_PATH = "/content/Customer and Order Data_For_RFM.jsonl"

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
            customers[data["id"]] = data
            if "orders" not in data:
                data["orders"] = {"edges": []}
            print(f"Line {lines_processed}: Found customer {data['id']}")
        # Order record
        elif "id" in data and data["id"].startswith("gid://shopify/Order"):
            parent_id = data.get("__parentId")
            if not parent_id or not parent_id.startswith("gid://shopify/Customer"):
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

# Step 2: Calculate RFM metrics
customer_data = {}
for customer_id, data in customers.items():
    orders = data.get("orders", {}).get("edges", [])
    print(f"Processing customer {customer_id}, Orders: {len(orders)}")
    
    # Calculate RFM metrics
    total_orders = len(orders)
    total_spent = 0.0
    last_order_date = None
    
    for order in orders:
        order_node = order["node"]
        # Parse the date and extract only the date part
        created_at = datetime.strptime(order_node["createdAt"], "%Y-%m-%dT%H:%M:%SZ").date()
        
        # Calculate total spent
        gross_sales = float(order_node["subtotalPriceSet"]["shopMoney"]["amount"])
        discounts = float(order_node["totalDiscountsSet"]["shopMoney"]["amount"])
        taxes = float(order_node["totalTaxSet"]["shopMoney"]["amount"])
        shipping = float(order_node["totalShippingPriceSet"]["shopMoney"]["amount"])
        total_spent += (gross_sales - discounts + taxes + shipping)
        
        # Update last order date
        if last_order_date is None or created_at > last_order_date:
            last_order_date = created_at
    
    # Skip customers with no orders
    if total_orders == 0:
        print(f"Customer {customer_id} has 0 orders, skipping")
        continue
    
    # Calculate days since last order (date difference)
    days_since_last_order = (CURRENT_DATE - last_order_date).days
    print(f"Customer {customer_id}: Days since last order = {days_since_last_order}")
    
    customer_data[customer_id] = {
        "days_since_last_order": days_since_last_order,
        "total_orders": total_orders,
        "total_spent": total_spent,
        "is_new_customer": total_orders == 1
    }

# Log summary
print(f"Lines processed: {lines_processed}")
print(f"Invalid lines skipped: {invalid_lines}")
print(f"Customers with valid data: {len(customer_data)}")

# Step 3: Calculate RFM scores (only if there are customers)
if not customer_data:
    print("No valid customer data to process. All customers may have 0 orders.")
    exit()

# Define thresholds for scoring (1-5 scale)
recency_thresholds = [30, 60, 90, 180]  # Days
frequency_thresholds = [1, 3, 5, 10]    # Orders
monetary_thresholds = [100, 500, 1000, 5000]  # Dollars

def score_metric(value, thresholds):
    if value <= thresholds[0]:
        return 5
    elif value <= thresholds[1]:
        return 4
    elif value <= thresholds[2]:
        return 3
    elif value <= thresholds[3]:
        return 2
    else:
        return 1

for customer_id, metrics in customer_data.items():
    r_score = score_metric(metrics["days_since_last_order"], recency_thresholds)
    f_score = score_metric(metrics["total_orders"], frequency_thresholds)
    m_score = score_metric(metrics["total_spent"], monetary_thresholds)
    
    # Combine scores to assign RFM group
    avg_score = (r_score + f_score + m_score) / 3
    # Prioritize new customer check
    if metrics["is_new_customer"]:
        rfm_group = "New"
    elif avg_score >= 4:
        rfm_group = "High-Value"
    elif avg_score >= 3:
        rfm_group = "Loyal"
    elif avg_score >= 2:
        rfm_group = "At-Risk"
    else:
        rfm_group = "Lost"
    
    customer_data[customer_id]["rfm_group"] = rfm_group
    print(f"Customer {customer_id}: R={r_score}, F={f_score}, M={m_score}, Avg={avg_score:.2f}, Group={rfm_group}")

# Save intermediate data for the next step
with open("rfm_intermediate_data.json", "w") as f:
    json.dump(customer_data, f)

print("Step 1 complete: Calculated RFM metrics and saved to rfm_intermediate_data.json")
print(f"Processed {len(customer_data)} customers")
```

**What This Does:**

- Reads `customers.jsonl`.
- For each customer:
     - Calculates **Days Since Last Order** (Recency).
    - Counts **Total Number of Orders** (Frequency).
    - Sums **Total Amount Spent** (Monetary).
    - Flags new customers (1 order).
      
- Assigns RFM scores (1-5 scale) based on thresholds:
    - Recency: More recent = higher score.
    - Frequency: More orders = higher score.
    - Monetary: More spent = higher score.
      
- Assigns RFM groups based on average score.
- Saves the data to `rfm_intermediate_data.json`.

**Output**
<img width="915" alt="Screenshot 2025-05-06 at 18 56 56" src="https://github.com/user-attachments/assets/626c7091-5547-4c8e-98f6-a4ac9380ce29" />


### Step 3: Aggregate Data by RFM Group and Calculate Final Metrics
Now, aggregate the customer data by RFM group to calculate:

    - Percent of Customers.
    - New Customer Records.
    - Average Days Since Last Order.
    - Average Total Number of Orders.
    - Average Total Amount Spent.

```
import json
import sqlite3
import csv

# Step 2: Load intermediate data
try:
    with open("rfm_intermediate_data.json", "r") as f:
        customer_data = json.load(f)
except FileNotFoundError:
    print("Error: rfm_intermediate_data.json not found. Please run Step 1 first.")
    exit()

# Total number of customers
total_customers = len(customer_data)

# Aggregate data by RFM group
rfm_groups = {}
for customer_id, metrics in customer_data.items():
    rfm_group = metrics["rfm_group"]
    
    if rfm_group not in rfm_groups:
        rfm_groups[rfm_group] = {
            "customer_count": 0,
            "new_customers": 0,
            "days_since_last_order_sum": 0,
            "total_orders_sum": 0,
            "total_spent_sum": 0.0
        }
    
    rfm_groups[rfm_group]["customer_count"] += 1
    if metrics["is_new_customer"]:
        rfm_groups[rfm_group]["new_customers"] += 1
    rfm_groups[rfm_group]["days_since_last_order_sum"] += metrics["days_since_last_order"]
    rfm_groups[rfm_group]["total_orders_sum"] += metrics["total_orders"]
    rfm_groups[rfm_group]["total_spent_sum"] += metrics["total_spent"]

# Calculate final metrics
aggregated_data = []
for rfm_group, metrics in sorted(rfm_groups.items()):
    customer_count = metrics["customer_count"]
    percent_customers = (customer_count / total_customers) if total_customers > 0 else 0  # Decimal form (e.g., 0.5000)
    new_customers = metrics["new_customers"]
    avg_days_since_last_order = metrics["days_since_last_order_sum"] / customer_count
    avg_total_orders = metrics["total_orders_sum"] / customer_count
    avg_total_spent = metrics["total_spent_sum"] / customer_count
    
    aggregated_data.append((
        rfm_group,
        percent_customers,
        new_customers,
        avg_days_since_last_order,
        avg_total_orders,
        avg_total_spent
    ))

# Store results in SQLite database
print("Storing results in database...")
conn = sqlite3.connect("rfm_analysis.db")
cursor = conn.cursor()
cursor.execute("""
    CREATE TABLE IF NOT EXISTS rfm_analysis (
        rfm_group TEXT PRIMARY KEY,
        percent_customers REAL,
        new_customers INTEGER,
        avg_days_since_last_order REAL,
        avg_total_orders REAL,
        avg_total_spent REAL
    )
""")
cursor.executemany("INSERT OR REPLACE INTO rfm_analysis (rfm_group, percent_customers, new_customers, avg_days_since_last_order, avg_total_orders, avg_total_spent) VALUES (?, ?, ?, ?, ?, ?)", aggregated_data)
conn.commit()
conn.close()
print("Data stored in rfm_analysis.db")

# Output results and save to CSV in the desired format
print("RFM Group | Percent of Customers | New Customer Records | Days Since Last Order | Total Number of Orders | Total Amount Spent")
print("-" * 100)
with open("rfm_analysis.csv", "w", newline="") as csvfile:
    writer = csv.writer(csvfile)
    writer.writerow(["RFM Group", "Percent of Customers", "New Customer Records", "Days Since Last Order", "Total Number of Orders", "Total Amount Spent"])
    for rfm_group, percent_customers, new_customers, days_since_last_order, total_orders, total_spent in aggregated_data:
        # Format for display: remove % and $, simplify numbers
        print(f"{rfm_group} | {percent_customers:.4f} | {new_customers} | {int(days_since_last_order) if days_since_last_order.is_integer() else days_since_last_order:.2f} | {int(total_orders) if total_orders.is_integer() else total_orders:.2f} | {total_spent:.2f}")
        # Write to CSV: same formatting
        writer.writerow([rfm_group, f"{percent_customers:.4f}", new_customers, f"{int(days_since_last_order) if days_since_last_order.is_integer() else days_since_last_order:.2f}", f"{int(total_orders) if total_orders.is_integer() else total_orders:.2f}", f"{total_spent:.2f}"])

```

**What This Does:**

- Loads the intermediate data from `rfm_intermediate_data.json`.
- Aggregates data by RFM group:
    - Counts customers per group.
    - Calculates percent of total customers.
    - Counts new customers (1 order).
    - Averages the RFM metrics.
 
- Outputs the results to:
    - Console.
    - CSV file (rfm_analysis.csv).
    - SQLite database (rfm_analysis.db).
 
**Output**
<img width="1092" alt="Screenshot 2025-05-06 at 19 49 59" src="https://github.com/user-attachments/assets/618ea4f8-cece-4f9f-af74-7dd9810aaae2" />


### Notes
**Thresholds:** Adjust `recency_thresholds`, `frequency_thresholds`, and `monetary_thresholds` based on your business needs.

**RFM Groups:** The grouping logic (High-Value, Loyal, etc.) can be customized.

**Data Volume:** If the JSONL file is large, consider optimizing memory usage (e.g., process in chunks).
