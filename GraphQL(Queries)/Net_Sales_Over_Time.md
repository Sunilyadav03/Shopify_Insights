- `Day`: The date of the current period.
- `Net sales`: Net sales for the current day.
- `Day (previous_period)`: The corresponding date in the previous period.
- `Net sales (previous_period)`: Net sales for the corresponding day in the previous period.



## Step-1:- Run Bulk Query
```
mutation {
  bulkOperationRunQuery(
    query: """
    {
      orders(query: "created_at:>=2022-01-01") {
        edges {
          node {
            id
            createdAt
            subtotalPriceSet { shopMoney { amount } }
            totalDiscountsSet { shopMoney { amount } }
            totalRefundedSet { shopMoney { amount } }
            totalTaxSet { shopMoney { amount } }
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
  node(id: "gid://shopify/BulkOperation/............") {
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
From the response of the above query, We extract `JSONL file URL`, through `node.url` we trigger the url and download the data file in the formate of `JSONL`. This JSONL file containes following data. 

This above Bulk query feteches orders created on or after `January 1, 2023`.
and Includes:

`id:` Order ID for reference.

`createdAt:` Date and time of order creation (to group by day).

`subtotalPriceSet:` Gross sales (product price × quantity, before discounts).

`totalDiscountsSet:` Total discounts applied.

`totalRefundedSet:` Total refunded amount (used to approximate returns).

Avoids nested connections to comply with Shopify’s bulk query restrictions.

`Output:` A JSONL file (orders.jsonl) with order data.

#### Python Script
We need to:

    - Identify the last two months in the data (e.g., if the most recent date is in April 2025, compare `April 2025` with `March 2025`).
    - Compare dates `date-wise` (e.g., April 1st vs. March 1st, April 2nd vs. March 2nd).
    - Output the `net_sales_over_time.csv` file in the format: `Day`, `Net sales`, `Day (previous_period)`, `Net sales (previous_period)`.

***Processing Script***

Below is a Python script to process the JSONL file and calculate `net sales` over time.
```
import json
from datetime import datetime
from dateutil.relativedelta import relativedelta
import csv
from collections import defaultdict

# Initialize data structure
daily_data = defaultdict(lambda: {
    "gross_sales": 0.0,
    "discounts": 0.0,
    "returns": 0.0
})

# Process orders.jsonl
with open("/content/Net_Sales_Over_Time.jsonl", "r") as file:
    for line in file:
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
            if "id" in data and data["id"].startswith("gid://shopify/Order"):
                created_at = datetime.strptime(data["createdAt"], "%Y-%m-%dT%H:%M:%SZ")
                day = created_at.strftime("%Y-%m-%d")
                daily_data[day]["gross_sales"] += float(data["subtotalPriceSet"]["shopMoney"]["amount"])
                daily_data[day]["discounts"] += float(data["totalDiscountsSet"]["shopMoney"]["amount"])
                daily_data[day]["returns"] += float(data["totalRefundedSet"]["shopMoney"]["amount"])
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            print(f"Skipping invalid line: {line} (Error: {e})")
            continue

# Step 1: Calculate net sales for all days
daily_net_sales = {}
for day, metrics in daily_data.items():
    gross_sales = metrics["gross_sales"]
    discounts = metrics["discounts"]
    returns = metrics["returns"]
    net_sales = gross_sales - discounts - returns
    daily_net_sales[day] = net_sales

# Step 2: Determine the last two months in the data
all_dates = [datetime.strptime(day, "%Y-%m-%d") for day in daily_net_sales.keys()]
latest_date = max(all_dates)
current_month = latest_date.replace(day=1)  # First day of the latest month
previous_month = current_month - relativedelta(months=1)  # First day of the previous month

# Step 3: Filter data for the last two months and compare date-wise
current_period_data = {}
previous_period_data = {}

for day, net_sales in daily_net_sales.items():
    date = datetime.strptime(day, "%Y-%m-%d")
    year_month = date.strftime("%Y-%m")
    
    if year_month == current_month.strftime("%Y-%m"):
        current_period_data[date.day] = (day, net_sales)
    elif year_month == previous_month.strftime("%Y-%m"):
        previous_period_data[date.day] = (day, net_sales)

# Step 4: Prepare output with current and previous period comparison
output_data = []
days_in_month = (current_month + relativedelta(months=1) - relativedelta(days=1)).day  # Days in current month
for day_of_month in range(1, days_in_month + 1):
    # Current period (latest month)
    current_day_str = f"{current_month.strftime('%Y-%m')}-{day_of_month:02d}"
    current_net_sales = current_period_data.get(day_of_month, (current_day_str, 0.0))[1]
    
    # Previous period (previous month)
    previous_day_str = f"{previous_month.strftime('%Y-%m')}-{day_of_month:02d}"
    try:
        datetime.strptime(previous_day_str, "%Y-%m-%d")  # Validate date
        previous_net_sales = previous_period_data.get(day_of_month, (previous_day_str, 0.0))[1]
    except ValueError:
        # Handle cases where the previous month has fewer days (e.g., Feb 29th)
        previous_net_sales = 0.0
        continue
    
    output_data.append({
        "Day": current_day_str,
        "Net sales": round(current_net_sales, 2),
        "Day (previous_period)": previous_day_str,
        "Net sales (previous_period)": round(previous_net_sales, 2)
    })

# Step 5: Save to CSV
print("Day | Net sales | Day (previous_period) | Net sales (previous_period)")
print("-" * 60)
with open("net_sales_over_time.csv", "w", newline="") as csvfile:
    writer = csv.DictWriter(csvfile, fieldnames=[
        "Day", "Net sales", "Day (previous_period)", "Net sales (previous_period)"
    ])
    writer.writeheader()
    for row in output_data:
        print(f"{row['Day']} | {row['Net sales']} | {row['Day (previous_period)']} | {row['Net sales (previous_period)']}")
        writer.writerow(row)
```



***Output of the Above .py file:-***

|Day|Net sales|Day \(previous\_period\)|Net sales \(previous\_period\)|
|---|---|---|---|
|2025-04-01|0\.0|2025-03-01|0\.0|
|2025-04-02|0\.0|2025-03-02|0\.0|
|2025-04-03|0\.0|2025-03-03|0\.0|
|2025-04-04|0\.0|2025-03-04|0\.0|
|2025-04-05|0\.0|2025-03-05|0\.0|
|2025-04-06|0\.0|2025-03-06|0\.0|
|2025-04-07|0\.0|2025-03-07|0\.0|
|2025-04-08|0\.0|2025-03-08|0\.0|
|2025-04-09|0\.0|2025-03-09|0\.0|
|2025-04-10|0\.0|2025-03-10|0\.0|
|2025-04-11|0\.0|2025-03-11|0\.0|
|2025-04-12|0\.0|2025-03-12|0\.0|
|2025-04-13|0\.0|2025-03-13|0\.0|
|2025-04-14|0\.0|2025-03-14|0\.0|
|2025-04-15|0\.0|2025-03-15|0\.0|
|2025-04-16|0\.0|2025-03-16|0\.0|
|2025-04-17|0\.0|2025-03-17|0\.0|
|2025-04-18|0\.0|2025-03-18|0\.0|
|2025-04-19|0\.0|2025-03-19|0\.0|
|2025-04-20|0\.0|2025-03-20|0\.0|
|2025-04-21|0\.0|2025-03-21|0\.0|
|2025-04-22|0\.0|2025-03-22|0\.0|
|2025-04-23|0\.0|2025-03-23|0\.0|
|2025-04-24|0\.0|2025-03-24|0\.0|
|2025-04-25|0\.0|2025-03-25|0\.0|
|2025-04-26|0\.0|2025-03-26|0\.0|
|2025-04-27|0\.0|2025-03-27|0\.0|
|2025-04-28|0\.0|2025-03-28|0\.0|
|2025-04-29|42028\.52|2025-03-29|0\.0|
|2025-04-30|0\.0|2025-03-30|0\.0|


