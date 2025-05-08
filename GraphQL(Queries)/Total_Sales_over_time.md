To extract sales data over time from a Shopify development store using a GraphQL Bulk Operation, We'll need to query the orders object. Shopify’s GraphQL Admin API allows us to extract data like:


- Day
- Orders
- Gross sales
- Discounts
- Returns
- Net sales
- Shipping charges
- Duties
- Additional fees
- Taxes
- Total sales
- Day (previous_period)
- Orders (previous_period)
- Gross sales (previous_period)
- Discounts (previous_period)
- Returns (previous_period)
- Net sales (previous_period)
- Shipping charges (previous_period)
- Duties (previous_period)
- Additional fees (previous_period)
- Taxes (previous_period)
- Total sales (previous_period)

**Bulk Query**

```
mutation {
  bulkOperationRunQuery(
    query: """
    {
      orders(query: "created_at:>=2025-04-01 created_at:<=2025-05-31") {
        edges {
          node {
            id
            createdAt
            subtotalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            totalDiscountsSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            totalShippingPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            totalTaxSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            refunds {
              totalRefundedSet {
                shopMoney {
                  amount
                  currencyCode
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
  node(id: "gid://shopify/BulkOperation/5347814834372") {
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

**Python Script**
```
import json
import csv
from collections import defaultdict
from datetime import datetime
from dateutil.relativedelta import relativedelta

# Initialize data structures for daily metrics
daily_data = defaultdict(lambda: {
    "orders": 0,
    "gross_sales": 0.0,
    "discounts": 0.0,
    "returns": 0.0,
    "net_sales": 0.0,
    "shipping_charges": 0.0,
    "duties": 0.0,
    "additional_fees": 0.0,
    "taxes": 0.0,
    "total_sales": 0.0
})

# Step 1: Process orders and aggregate by day
with open("/content/Total_sales_over_time.jsonl", "r") as file:
    for line in file:
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
            if "id" in data and data["id"].startswith("gid://shopify/Order"):
                order_date = datetime.strptime(data["createdAt"], "%Y-%m-%dT%H:%M:%SZ")
                day = order_date.strftime("%Y-%m-%d")
                
                # Extract financial data
                gross_sales = float(data["subtotalPriceSet"]["shopMoney"]["amount"])
                discounts = float(data["totalDiscountsSet"]["shopMoney"]["amount"])
                shipping = float(data["totalShippingPriceSet"]["shopMoney"]["amount"])
                taxes = float(data["totalTaxSet"]["shopMoney"]["amount"])
                returns = sum(float(refund["totalRefundedSet"]["shopMoney"]["amount"]) for refund in data["refunds"])
                
                # Aggregate metrics
                daily_data[day]["orders"] += 1
                daily_data[day]["gross_sales"] += gross_sales
                daily_data[day]["discounts"] += discounts
                daily_data[day]["returns"] += returns
                daily_data[day]["shipping_charges"] += shipping
                daily_data[day]["taxes"] += taxes
                # Duties and additional fees are not available, set to 0
                daily_data[day]["duties"] = 0.0
                daily_data[day]["additional_fees"] = 0.0
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            print(f"Skipping invalid line: {line} (Error: {e})")
            continue

# Step 2: Calculate derived metrics
for day, metrics in daily_data.items():
    metrics["net_sales"] = metrics["gross_sales"] - metrics["discounts"] - metrics["returns"]
    metrics["total_sales"] = (
        metrics["net_sales"] +
        metrics["shipping_charges"] +
        metrics["duties"] +
        metrics["additional_fees"] +
        metrics["taxes"]
    )

# Step 3: Split into current and previous periods
current_period_data = {}
previous_period_data = {}

# Determine the periods (May 2025 and April 2025)
all_dates = [datetime.strptime(day, "%Y-%m-%d") for day in daily_data.keys()]
latest_date = max(all_dates)
current_month = latest_date.replace(day=1)  # First day of the latest month (2025-05-01)
previous_month = current_month - relativedelta(months=1)  # First day of the previous month (2025-04-01)

for day, metrics in daily_data.items():
    date = datetime.strptime(day, "%Y-%m-%d")
    year_month = date.strftime("%Y-%m")
    if year_month == current_month.strftime("%Y-%m"):
        current_period_data[date.day] = {
            "day": day,
            "orders": metrics["orders"],
            "gross_sales": round(metrics["gross_sales"], 2),
            "discounts": round(metrics["discounts"], 2),
            "returns": round(metrics["returns"], 2),
            "net_sales": round(metrics["net_sales"], 2),
            "shipping_charges": round(metrics["shipping_charges"], 2),
            "duties": round(metrics["duties"], 2),
            "additional_fees": round(metrics["additional_fees"], 2),
            "taxes": round(metrics["taxes"], 2),
            "total_sales": round(metrics["total_sales"], 2)
        }
    elif year_month == previous_month.strftime("%Y-%m"):
        previous_period_data[date.day] = {
            "day": day,
            "orders": metrics["orders"],
            "gross_sales": round(metrics["gross_sales"], 2),
            "discounts": round(metrics["discounts"], 2),
            "returns": round(metrics["returns"], 2),
            "net_sales": round(metrics["net_sales"], 2),
            "shipping_charges": round(metrics["shipping_charges"], 2),
            "duties": round(metrics["duties"], 2),
            "additional_fees": round(metrics["additional_fees"], 2),
            "taxes": round(metrics["taxes"], 2),
            "total_sales": round(metrics["total_sales"], 2)
        }

# Step 4: Prepare output with day-wise comparison
output_data = []
days_in_month = (current_month + relativedelta(months=1) - relativedelta(days=1)).day  # Days in current month
for day_of_month in range(1, days_in_month + 1):
    # Current period (May 2025)
    current_day_str = f"{current_month.strftime('%Y-%m')}-{day_of_month:02d}"
    current = current_period_data.get(day_of_month, {
        "day": current_day_str,
        "orders": 0,
        "gross_sales": 0.0,
        "discounts": 0.0,
        "returns": 0.0,
        "net_sales": 0.0,
        "shipping_charges": 0.0,
        "duties": 0.0,
        "additional_fees": 0.0,
        "taxes": 0.0,
        "total_sales": 0.0
    })
    
    # Previous period (April 2025)
    previous_day_str = f"{previous_month.strftime('%Y-%m')}-{day_of_month:02d}"
    try:
        datetime.strptime(previous_day_str, "%Y-%m-%d")  # Validate date
        previous = previous_period_data.get(day_of_month, {
            "day": previous_day_str,
            "orders": 0,
            "gross_sales": 0.0,
            "discounts": 0.0,
            "returns": 0.0,
            "net_sales": 0.0,
            "shipping_charges": 0.0,
            "duties": 0.0,
            "additional_fees": 0.0,
            "taxes": 0.0,
            "total_sales": 0.0
        })
    except ValueError:
        continue
    
    output_data.append({
        "Day": current["day"],
        "Orders": current["orders"],
        "Gross sales": current["gross_sales"],
        "Discounts": current["discounts"],
        "Returns": current["returns"],
        "Net sales": current["net_sales"],
        "Shipping charges": current["shipping_charges"],
        "Duties": current["duties"],
        "Additional fees": current["additional_fees"],
        "Taxes": current["taxes"],
        "Total sales": current["total_sales"],
        "Day (previous_period)": previous["day"],
        "Orders (previous_period)": previous["orders"],
        "Gross sales (previous_period)": previous["gross_sales"],
        "Discounts (previous_period)": previous["discounts"],
        "Returns (previous_period)": previous["returns"],
        "Net sales (previous_period)": previous["net_sales"],
        "Shipping charges (previous_period)": previous["shipping_charges"],
        "Duties (previous_period)": previous["duties"],
        "Additional fees (previous_period)": previous["additional_fees"],
        "Taxes (previous_period)": previous["taxes"],
        "Total sales (previous_period)": previous["total_sales"]
    })

# Step 5: Save to CSV
print("Day | Orders | Gross sales | Discounts | Returns | Net sales | Shipping charges | Duties | Additional fees | Taxes | Total sales | Day (previous_period) | Orders (previous_period) | Gross sales (previous_period) | Discounts (previous_period) | Returns (previous_period) | Net sales (previous_period) | Shipping charges (previous_period) | Duties (previous_period) | Additional fees (previous_period) | Taxes (previous_period) | Total sales (previous_period)")
print("-" * 200)
with open("total_sales_over_time.csv", "w", newline="") as csvfile:
    writer = csv.DictWriter(csvfile, fieldnames=[
        "Day", "Orders", "Gross sales", "Discounts", "Returns", "Net sales", "Shipping charges", "Duties", "Additional fees", "Taxes", "Total sales",
        "Day (previous_period)", "Orders (previous_period)", "Gross sales (previous_period)", "Discounts (previous_period)", "Returns (previous_period)", 
        "Net sales (previous_period)", "Shipping charges (previous_period)", "Duties (previous_period)", "Additional fees (previous_period)", "Taxes (previous_period)", 
        "Total sales (previous_period)"
    ])
    writer.writeheader()
    for row in output_data:
        print(f"{row['Day']} | {row['Orders']} | {row['Gross sales']} | {row['Discounts']} | {row['Returns']} | {row['Net sales']} | {row['Shipping charges']} | {row['Duties']} | {row['Additional fees']} | {row['Taxes']} | {row['Total sales']} | {row['Day (previous_period)']} | {row['Orders (previous_period)']} | {row['Gross sales (previous_period)']} | {row['Discounts (previous_period)']} | {row['Returns (previous_period)']} | {row['Net sales (previous_period)']} | {row['Shipping charges (previous_period)']} | {row['Duties (previous_period)']} | {row['Additional fees (previous_period)']} | {row['Taxes (previous_period)']} | {row['Total sales (previous_period)']}")
        writer.writerow(row)

```

**Output**

|Day|Orders|Gross sales|Discounts|Returns|Net sales|Shipping charges|Duties|Additional fees|Taxes|Total sales|Day \(previous\_period\)|Orders \(previous\_period\)|Gross sales \(previous\_period\)|Discounts \(previous\_period\)|Returns \(previous\_period\)|Net sales \(previous\_period\)|Shipping charges \(previous\_period\)|Duties \(previous\_period\)|Additional fees \(previous\_period\)|Taxes \(previous\_period\)|Total sales \(previous\_period\)|
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
|2025-05-01|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-01|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-02|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-02|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-03|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-03|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-04|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-04|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-05|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-05|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-06|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-06|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-07|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-07|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-08|4|3929018\.41|0\.0|2587890\.42|1341127\.99|0\.0|0\.0|0\.0|102\.6|1341230\.59|2025-04-08|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-09|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-09|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-10|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-10|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-11|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-11|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-12|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-12|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-13|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-13|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-14|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-14|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-15|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-15|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-16|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-16|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-17|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-17|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-18|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-18|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-19|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-19|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-20|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-20|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-21|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-21|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-22|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-22|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-23|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-23|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-24|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-24|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-25|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-25|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-26|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-26|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-27|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-27|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-28|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-28|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
|2025-05-29|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-29|4|45965\.2|147\.76|3788\.92|42028\.52|60\.33|0\.0|0\.0|478\.41|42567\.26|
|2025-05-30|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|2025-04-30|0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|0\.0|
