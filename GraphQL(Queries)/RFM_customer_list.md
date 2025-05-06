Need to extract the following data:-

**RFM customer list:**
- Customer ID
- Customer name
- RFM group
- Days since last order
- Total number of orders
- Total amount spent

## Step-1: Bulk Query

```
mutation {
  bulkOperationRunQuery(
    query: """
    {
      customers {
        edges {
          node {
            id
            displayName
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
**Poll Query**

```
query {
  node(id: "gid://shopify/BulkOperation/.........") {
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

## Step 2:- Process the JSONL file

```
import json
from datetime import datetime, timedelta, date

# Automatically get the current date (timezone-naive, date only)
CURRENT_DATE = date.today()

# Path to the JSONL file
JSONL_FILE_PATH = "/content/RFM_customer_list.jsonl"

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

# Step 2: Calculate RFM metrics
customer_data = {}
for customer_id, data in customers.items():
    orders = data.get("orders", {}).get("edges", [])
    print(f"Processing customer {customer_id}, Orders: {len(orders)}")
    
    # Extract customer name
    customer_name = data.get("displayName", "Unknown")
    
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
    
    # Calculate days since last order
    days_since_last_order = (CURRENT_DATE - last_order_date).days
    print(f"Customer {customer_id}: Days since last order = {days_since_last_order}")
    
    customer_data[customer_id] = {
        "customer_name": customer_name,
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

**Output**
<img width="713" alt="Screenshot 2025-05-06 at 19 44 01" src="https://github.com/user-attachments/assets/38ef54f7-c7b4-4c51-b80b-b6dd7843973e" />

## Step 3:- Generate the RFM Customer List

```
import json
import csv

# Load the intermediate data
try:
    with open("rfm_intermediate_data.json", "r") as f:
        customer_data = json.load(f)
except FileNotFoundError:
    print("Error: rfm_intermediate_data.json not found. Please run Step 1 first.")
    exit()

# Prepare the customer list
customer_list = []
for customer_id, metrics in customer_data.items():
    customer_list.append((
        customer_id,  # Already numeric from Step 1
        metrics["customer_name"],
        metrics["rfm_group"],
        metrics["days_since_last_order"],
        metrics["total_orders"],
        metrics["total_spent"]
    ))

# Sort by Customer ID for consistency
customer_list.sort(key=lambda x: x[0])

# Output results and save to CSV in the desired format
print("Customer ID | Customer Name | RFM Group | Days Since Last Order | Total Number of Orders | Total Amount Spent")
print("-" * 100)
with open("rfm_customer_list.csv", "w", newline="") as csvfile:
    writer = csv.writer(csvfile)
    writer.writerow(["Customer ID", "Customer Name", "RFM Group", "Days Since Last Order", "Total Number of Orders", "Total Amount Spent"])
    for customer_id, customer_name, rfm_group, days_since_last_order, total_orders, total_spent in customer_list:
        # Format Days Since Last Order: integer if whole number, else 2 decimal places
        days_formatted = int(days_since_last_order) if isinstance(days_since_last_order, int) or days_since_last_order.is_integer() else f"{days_since_last_order:.2f}"
        # Format Total Number of Orders: integer if whole number, else 2 decimal places
        orders_formatted = int(total_orders) if isinstance(total_orders, int) or total_orders.is_integer() else f"{total_orders:.2f}"
        # Format Total Amount Spent: always 2 decimal places
        spent_formatted = f"{total_spent:.2f}"
        
        # Print to console
        print(f"{customer_id} | {customer_name} | {rfm_group} | {days_formatted} | {orders_formatted} | {spent_formatted}")
        # Write to CSV: same formatting
        writer.writerow([customer_id, customer_name, rfm_group, days_formatted, orders_formatted, spent_formatted])
```

**Output**

<img width="938" alt="Screenshot 2025-05-06 at 19 44 47" src="https://github.com/user-attachments/assets/d7d88f92-423a-4ae7-ae43-0601c2d7397a" />

