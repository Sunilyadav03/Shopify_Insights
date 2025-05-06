To extract **Items Returned Over Time** (Day, Orders, Quantity Returned, Average Order Value) from a Shopify store, we face a challenge with Shopify’s bulk query limitations: nested connections (e.g., `refunds.refundLineItems`) are not supported. The first query can fetch order and refund data (including Day, Orders, and Average Order Value), but it cannot directly fetch `refundLineItems` to calculate **Quantity Returned**. The second query fetches `refundLineItems` for each refund to get the quantities. We need to merge the results of these two queries to produce the final combined answer.

## Strategy

**First Query (Bulk Query):** Fetch orders with refunds to get Day, Orders, and Total Refunded Amount (to calculate Average Order Value).

**Second Query (Individual Refund Queries):** Fetch `refundLineItems` for each refund to get the Quantity Returned.

**Merge Results:** Combine the data to calculate all metrics and produce the final output.

### Step 1: First Bulk Query (Fetch Orders and Refunds)
This query fetches orders with refunds, excluding the unsupported `refundLineItems` field.

```mutation {
  bulkOperationRunQuery(
    query: """
    {
      orders(query: "created_at:>=2023-01-01") {
        edges {
          node {
            id
            createdAt
            refunds {
              id
              createdAt
              totalRefundedSet {
                shopMoney {
                  amount
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
From above query response, fetch bulkQuery ID and use in the following Poll Query:-
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
From above Poll query response, fetch url and download a JSONL file (`orders.jsonl`) with order and refund data, including refund IDs.

## Step 2: Process the First Query and Collect Refund IDs
We’ll write a script to:

 - Process the JSONL file to calculate Day, Orders, and Average Order Value.
 - Collect refund IDs for the second query.

```
import json
from datetime import datetime

# Path to the JSONL file
JSONL_FILE_PATH = "/content/without_refund_quantity_data.jsonl"

# Step 1: Process the JSONL file to extract partial metrics and collect refund IDs
data_by_day = {}  # Store data by day
refund_to_day = {}  # Map refund ID to day
orders_with_refunds = set()  # Track orders with refunds

# Read the JSONL file
try:
    with open(JSONL_FILE_PATH, "r") as file:
        jsonl_data = file.readlines()
except FileNotFoundError:
    print(f"Error: File {JSONL_FILE_PATH} not found.")
    exit()

# Process each line
for line in jsonl_data:
    line = line.strip()
    if not line:
        continue
    
    try:
        data = json.loads(line)
        if "id" not in data or not data["id"].startswith("gid://shopify/Order"):
            continue
        
        order_id = data["id"]
        refunds = data.get("refunds", [])
        
        for refund in refunds:
            refund_id = refund["id"]
            created_at = datetime.strptime(refund["createdAt"], "%Y-%m-%dT%H:%M:%SZ")
            day = created_at.strftime("%Y-%m-%d")
            total_refunded = float(refund["totalRefundedSet"]["shopMoney"]["amount"])
            
            # Initialize data structure for the day
            if day not in data_by_day:
                data_by_day[day] = {
                    "orders": 0,
                    "total_refunded": 0.0,
                    "quantity_returned": 0  # Will be updated later
                }
            
            # Update metrics
            if order_id not in orders_with_refunds:
                data_by_day[day]["orders"] += 1
                orders_with_refunds.add(order_id)
            data_by_day[day]["total_refunded"] += abs(total_refunded)  # Convert to positive
            
            # Map refund ID to day
            refund_to_day[refund_id] = day
    
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        print(f"Skipping invalid line: {line} (Error: {e})")
        continue

# Save intermediate data for the next step
with open("intermediate_data.json", "w") as f:
    json.dump({
        "data_by_day": data_by_day,
        "refund_to_day": refund_to_day
    }, f)

print("Step 1 complete: Extracted data from JSONL file and saved to intermediate_data.json")
print("Data by day:", data_by_day)
print("Refund IDs collected:", list(refund_to_day.keys()))

```

**Output** of the above .py file
```
Step 1 complete: Extracted data from JSONL file and saved to intermediate_data.json
Data by day: {'2025-04-29': {'orders': 3, 'total_refunded': 3788.9199999999996, 'quantity_returned': 0}}
Refund IDs collected: ['gid://shopify/Refund/925760815300', 'gid://shopify/Refund/925761011908', 'gid://shopify/Refund/925761339588']
```



## Step 3: Second Query (Fetch Refund Line Items)
For each refund ID, query the `refundLineItems` to get the quantities.
Using the refund IDs collected in Step 1, query Shopify to fetch `refundLineItems` and calculate the Quantity Returned for each refund. Then, update the `data_by_day` with these quantities.

```
import requests
import json
import time
import warnings

# Suppress warnings about SSL verification being disabled
warnings.filterwarnings("ignore", category=requests.packages.urllib3.exceptions.InsecureRequestWarning)

# Shopify API credentials
SHOPIFY_SHOP = "diat-store1st"
API_VERSION = "2025-04"
ACCESS_TOKEN = "7dbe89d21e33d1f27eefd43ea3ea832b"
GRAPHQL_URL = f"https://{SHOPIFY_SHOP}.myshopify.com/admin/api/{API_VERSION}/graphql.json"

# Query to fetch refund line items
REFUND_LINE_ITEMS_QUERY = """
query ($refundId: ID!) {
  node(id: $refundId) {
    ... on Refund {
      id
      refundLineItems(first: 100) {
        edges {
          node {
            quantity
          }
        }
      }
    }
  }
}
"""

# Function to execute GraphQL query with SSL verification disabled
def execute_graphql_query(query, variables=None):
    headers = {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": ACCESS_TOKEN
    }
    response = requests.post(GRAPHQL_URL, json={"query": query, "variables": variables}, headers=headers, verify=False)
    if response.status_code != 200:
        raise Exception(f"Query failed: {response.status_code} - {response.text}")
    return response.json()

# Step 2: Load intermediate data
try:
    with open("intermediate_data.json", "r") as f:
        intermediate_data = json.load(f)
except FileNotFoundError:
    print("Error: intermediate_data.json not found. Please run Step 1 first.")
    exit()

data_by_day = intermediate_data["data_by_day"]
refund_to_day = intermediate_data["refund_to_day"]

# Fetch refund line items for each refund to get quantities
print("Fetching refund line items...")
for refund_id, day in refund_to_day.items():
    try:
        response = execute_graphql_query(REFUND_LINE_ITEMS_QUERY, variables={"refundId": refund_id})
        refund_data = response["data"]["node"]
        
        if not refund_data or "refundLineItems" not in refund_data:
            print(f"Skipping refund {refund_id} (No refund line items)")
            continue
        
        quantity_returned = 0
        for edge in refund_data["refundLineItems"]["edges"]:
            quantity_returned += edge["node"]["quantity"]
        
        # Update quantity returned for the corresponding day
        data_by_day[day]["quantity_returned"] += quantity_returned
        
        # Rate limiting: Sleep to avoid hitting Shopify API limits
        time.sleep(0.5)
    
    except Exception as e:
        print(f"Error fetching refund {refund_id}: {e}")
        continue

# Save updated data for the final step
with open("final_data.json", "w") as f:
    json.dump(data_by_day, f)

print("Step 2 complete: Fetched quantities and saved to final_data.json")
print("Updated data by day:", data_by_day)

```

**Output**

<img width="952" alt="Screenshot 2025-05-06 at 14 19 32" src="https://github.com/user-attachments/assets/83aad927-eefd-417e-9ec1-2679fecc0fbf" />



## Step 4: Merge Results and Calculate Final Metrics
Combine the data from both queries to produce the final output.

```
import json
import sqlite3
import csv

# Step 3: Load final data
try:
    with open("final_data.json", "r") as f:
        data_by_day = json.load(f)
except FileNotFoundError:
    print("Error: final_data.json not found. Please run Step 2 first.")
    exit()

# Calculate final metrics
aggregated_data = []
for day, metrics in sorted(data_by_day.items()):
    orders = metrics["orders"]
    quantity_returned = metrics["quantity_returned"]
    total_refunded = metrics["total_refunded"]
    avg_order_value = total_refunded / orders if orders > 0 else 0.0
    aggregated_data.append((day, orders, quantity_returned, avg_order_value))

# Store results in SQLite database
print("Storing results in database...")
conn = sqlite3.connect("items_returned.db")
cursor = conn.cursor()
cursor.execute("""
    CREATE TABLE IF NOT EXISTS items_returned (
        day TEXT PRIMARY KEY,
        orders INTEGER,
        quantity_returned INTEGER,
        avg_order_value REAL
    )
""")
cursor.executemany("INSERT OR REPLACE INTO items_returned (day, orders, quantity_returned, avg_order_value) VALUES (?, ?, ?, ?)", aggregated_data)
conn.commit()
conn.close()
print("Data stored in items_returned.db")

# Output results and save to CSV
print("Day | Orders | Quantity Returned | Average Order Value")
print("-" * 50)
with open("items_returned_over_time.csv", "w", newline="") as csvfile:
    writer = csv.writer(csvfile)
    writer.writerow(["Day", "Orders", "Quantity Returned", "Average Order Value"])
    for day, orders, quantity_returned, avg_order_value in aggregated_data:
        print(f"{day} | {orders} | {quantity_returned} | ${avg_order_value:.2f}")
        writer.writerow([day, orders, quantity_returned, f"${avg_order_value:.2f}"])

```
**Output**

<img width="572" alt="Screenshot 2025-05-06 at 14 18 39" src="https://github.com/user-attachments/assets/859b8236-37b2-42d0-8e49-bff3217b74de" />


**Final Answer:** Items Returned Over Time
Based on the above data:

- Day: 2025-04-29

- Orders: 3 (orders with refunds)

- Quantity Returned: 0 (items returned across refunds)

- Average Order Value: $1262.97 (total refunded amount / orders)

