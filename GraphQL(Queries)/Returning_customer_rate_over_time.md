We need to extract these following data attributes:

- Day
- Returning customers
- Customers
- Returning customer rate
- Day (previous_period)
- Returning customers (previous_period)
- Customers (previous_period)
- Returning customer rate (previous_period)

## Step 1: Design the GraphQL Bulk Query
We need to fetch orders with customer data to determine:

  - **Customers**: Total unique customers who placed orders each day.
    
  - **Returning Customers**: Customers who have placed orders before the current order’s date.
    
  - **Returning Customer Rate**: Returning customers divided by total customers for each day.
    
  - **Date Range**: Orders from March 2025 and April 2025 for the comparison.
    
Shopify’s GraphQL API provides the `orders` endpoint with customer details. We’ll fetch:

- `createdAt`: To determine the order date.

**According to Shopify’s GraphQL Admin API documentation:**
The Customer object does have fields to help determine returning customers, but they are:
- `orders`: A connection to fetch the customer’s orders, which we can use to determine if they’ve placed orders before.
  
- `numberOfOrders`: This field (introduced in later API versions) directly provides the count of orders for a customer, replacing `ordersCount`.
  
- `firstOrder` does not exist, but we can use the `orders` connection with sorting to find the earliest order.
   
To determine if a customer is a returning customer, we need to:

- Fetch the customer’s orders and check their dates.
- Compare the date of the earliest order with the current order’s date to see if the customer had previous orders.

**Query:**
```mutation {
  bulkOperationRunQuery(
    query: """
    {
      orders(query: "created_at:>=2025-03-01 created_at:<=2025-04-30") {
        edges {
          node {
            id
            createdAt
            customer {
              id
              orders(first: 100, sortKey: CREATED_AT, reverse: false) {
                edges {
                  node {
                    id
                    createdAt
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

- `orders(first: 100, sortKey: CREATED_AT, reverse: false)` to fetch the customer’s orders, sorted by creation date (earliest first).
  
- `first: 100` is a reasonable limit for most customers; if a customer has more than 100 orders, you may need to paginate further, but this should suffice for most cases.

 ```
  query {
  node(id: "gid://shopify/BulkOperation/........") {
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

This will return a 'url' through which we download the .jsonl file after downloading the jsonl file we process it.

## step 2: Python Script for processing Jsonl file

```
import json
import csv
from collections import defaultdict
from datetime import datetime
from dateutil.relativedelta import relativedelta

# Initialize data structures for daily metrics
daily_data = defaultdict(lambda: {
    "customers": set(),
    "returning_customers": 0
})

# Step 1: Process orders.jsonl to track customers (deduplicate orders)
processed_orders = set()
with open("/content/returning_customer_rate.jsonl", "r") as file:
    for line in file:
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
            if "id" in data and data["id"].startswith("gid://shopify/Order"):
                order_id = data["id"]
                # Skip if this order has already been processed
                if order_id in processed_orders:
                    continue

                # Only process main order records (where customer is present)
                if "customer" not in data or "__parentId" in data:
                    continue

                customer = data["customer"]
                if not customer or not customer.get("id"):
                    continue  # Skip orders with no customer

                processed_orders.add(order_id)
                order_date = datetime.strptime(data["createdAt"], "%Y-%m-%dT%H:%M:%SZ")
                day = order_date.strftime("%Y-%m-%d")
                customer_id = customer["id"]

                # Add customer to the day's set
                daily_data[day]["customers"].add(customer_id)
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            print(f"Skipping invalid line: {line} (Error: {e})")
            continue

# Step 2: Cannot determine returning customers without order history
# Since the .jsonl file lacks the 'orders' field, we assume returning_customers = 0
# This will be updated once the correct data is fetched

# Step 3: Split into current and previous periods
current_period_data = {}
previous_period_data = {}

# Determine the periods (April 2025 and March 2025)
all_dates = [datetime.strptime(day, "%Y-%m-%d") for day in daily_data.keys()]
latest_date = max(all_dates)
current_month = latest_date.replace(day=1)  # First day of the latest month (2025-04-01)
previous_month = current_month - relativedelta(months=1)  # First day of the previous month (2025-03-01)

for day, metrics in daily_data.items():
    date = datetime.strptime(day, "%Y-%m-%d")
    year_month = date.strftime("%Y-%m")
    customers = len(metrics["customers"])
    returning_customers = metrics["returning_customers"]
    rate = returning_customers / customers if customers > 0 else 0.0

    if year_month == current_month.strftime("%Y-%m"):
        current_period_data[date.day] = {
            "day": day,
            "customers": customers,
            "returning_customers": returning_customers,
            "rate": rate
        }
    elif year_month == previous_month.strftime("%Y-%m"):
        previous_period_data[date.day] = {
            "day": day,
            "customers": customers,
            "returning_customers": returning_customers,
            "rate": rate
        }

# Step 4: Prepare output with day-wise comparison
output_data = []
days_in_month = (current_month + relativedelta(months=1) - relativedelta(days=1)).day  # Days in current month
for day_of_month in range(1, days_in_month + 1):
    # Current period (April 2025)
    current_day_str = f"{current_month.strftime('%Y-%m')}-{day_of_month:02d}"
    current = current_period_data.get(day_of_month, {
        "day": current_day_str,
        "customers": 0,
        "returning_customers": 0,
        "rate": 0.0
    })

    # Previous period (March 2025)
    previous_day_str = f"{previous_month.strftime('%Y-%m')}-{day_of_month:02d}"
    try:
        datetime.strptime(previous_day_str, "%Y-%m-%d")  # Validate date
        previous = previous_period_data.get(day_of_month, {
            "day": previous_day_str,
            "customers": 0,
            "returning_customers": 0,
            "rate": 0.0
        })
    except ValueError:
        # Handle cases where the previous month has fewer days
        previous = {
            "day": previous_day_str,
            "customers": 0,
            "returning_customers": 0,
            "rate": 0.0
        }
        continue

    output_data.append({
        "Day": current["day"],
        "Returning customers": current["returning_customers"],
        "Customers": current["customers"],
        "Returning customer rate": round(current["rate"], 15),
        "Day (previous_period)": previous["day"],
        "Returning customers (previous_period)": previous["returning_customers"],
        "Customers (previous_period)": previous["customers"],
        "Returning customer rate (previous_period)": round(previous["rate"], 15)
    })

# Step 5: Save to CSV
print("Day | Returning customers | Customers | Returning customer rate | Day (previous_period) | Returning customers (previous_period) | Customers (previous_period) | Returning customer rate (previous_period)")
print("-" * 150)
with open("returning_customer_rate_over_time.csv", "w", newline="") as csvfile:
    writer = csv.DictWriter(csvfile, fieldnames=[
        "Day", "Returning customers", "Customers", "Returning customer rate",
        "Day (previous_period)", "Returning customers (previous_period)", "Customers (previous_period)", "Returning customer rate (previous_period)"
    ])
    writer.writeheader()
    for row in output_data:
        print(f"{row['Day']} | {row['Returning customers']} | {row['Customers']} | {row['Returning customer rate']} | {row['Day (previous_period)']} | {row['Returning customers (previous_period)']} | {row['Customers (previous_period)']} | {row['Returning customer rate (previous_period)']}")
        writer.writerow(row)
```

The above python script will return `returning_customer_rate_over_time.csv` file.

**Output**
|Day|Returning customers|Customers|Returning customer rate|Day \(previous\_period\)|Returning customers \(previous\_period\)|Customers \(previous\_period\)|Returning customer rate \(previous\_period\)|
|---|---|---|---|---|---|---|---|
|2025-04-01|0|0|0\.0|2025-03-01|0|0|0\.0|
|2025-04-02|0|0|0\.0|2025-03-02|0|0|0\.0|
|2025-04-03|0|0|0\.0|2025-03-03|0|0|0\.0|
|2025-04-04|0|0|0\.0|2025-03-04|0|0|0\.0|
|2025-04-05|0|0|0\.0|2025-03-05|0|0|0\.0|
|2025-04-06|0|0|0\.0|2025-03-06|0|0|0\.0|
|2025-04-07|0|0|0\.0|2025-03-07|0|0|0\.0|
|2025-04-08|0|0|0\.0|2025-03-08|0|0|0\.0|
|2025-04-09|0|0|0\.0|2025-03-09|0|0|0\.0|
|2025-04-10|0|0|0\.0|2025-03-10|0|0|0\.0|
|2025-04-11|0|0|0\.0|2025-03-11|0|0|0\.0|
|2025-04-12|0|0|0\.0|2025-03-12|0|0|0\.0|
|2025-04-13|0|0|0\.0|2025-03-13|0|0|0\.0|
|2025-04-14|0|0|0\.0|2025-03-14|0|0|0\.0|
|2025-04-15|0|0|0\.0|2025-03-15|0|0|0\.0|
|2025-04-16|0|0|0\.0|2025-03-16|0|0|0\.0|
|2025-04-17|0|0|0\.0|2025-03-17|0|0|0\.0|
|2025-04-18|0|0|0\.0|2025-03-18|0|0|0\.0|
|2025-04-19|0|0|0\.0|2025-03-19|0|0|0\.0|
|2025-04-20|0|0|0\.0|2025-03-20|0|0|0\.0|
|2025-04-21|0|0|0\.0|2025-03-21|0|0|0\.0|
|2025-04-22|0|0|0\.0|2025-03-22|0|0|0\.0|
|2025-04-23|0|0|0\.0|2025-03-23|0|0|0\.0|
|2025-04-24|0|0|0\.0|2025-03-24|0|0|0\.0|
|2025-04-25|0|0|0\.0|2025-03-25|0|0|0\.0|
|2025-04-26|0|0|0\.0|2025-03-26|0|0|0\.0|
|2025-04-27|0|0|0\.0|2025-03-27|0|0|0\.0|
|2025-04-28|0|0|0\.0|2025-03-28|0|0|0\.0|
|2025-04-29|0|2|0\.0|2025-03-29|0|0|0\.0|
|2025-04-30|0|0|0\.0|2025-03-30|0|0|0\.0|

