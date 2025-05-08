In this, We want to extract the following data:-
- Referring channel
- Referring medium
- Orders
- Total sales
- Gross sales
- Net sales
- Orders (previous_period)
- Total sales (previous_period)
- Gross sales (previous_period)
- Net sales (previous_period)


### Step 1: Design the GraphQL Bulk Query
We need to fetch orders with the following details:

- `Referring Channel and Medium`: Shopify doesn’t directly provide "Referring channel" and "Referring medium," but we can infer them from `referrerUrl` or `sourceName`. For example:
    - `referrerUrl` might contain domains like "instagram.com" or "facebook.com," which we can map to channels.
    - `sourceName` might indicate sources like "shopify_email" or "abandoned_cart."

- **Orders**: Count of orders per channel/medium.
  
- **Gross Sales**: `subtotalPriceSet`.
  
- **Net Sales**: Gross sales - Discounts - Returns.
  
- **Total Sales**: Net sales + Shipping charges + Taxes.
  
- **Date Range**: Orders from March 2025 and April 2025 to compare the two months.


**Bulk Query**
```
mutation {
  bulkOperationRunQuery(
    query: """
    {
      orders(query: "created_at:>=2025-03-01 created_at:<=2025-04-30") {
        edges {
          node {
            id
            createdAt
            referrerUrl
            sourceName
            subtotalPriceSet { shopMoney { amount } }
            totalDiscountsSet { shopMoney { amount } }
            totalRefundedSet { shopMoney { amount } }
            totalShippingPriceSet { shopMoney { amount } }
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
  node(id: "gid://shopify/BulkOperation/5345991590084") {
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

**Query Details:**

- `created_at:>=2025-03-01 created_at`:<=2025-04-30: Fetches orders from March 1, 2025, to April 30, 2025, to cover both months.

- `referrerUrl`: To infer the referring channel (e.g., "instagram.com" → "instagram").

- `sourceName`: To identify marketing campaigns (e.g., "shopify_email").

Financial fields:

  - `subtotalPriceSet`: Gross sales.
  
  - `totalDiscountsSet`: Discounts.
  
  - `totalRefundedSet`: Returns.
  
  - `totalShippingPriceSet`: Shipping charges.
  
  - `totalTaxSet`: Taxes.

### Step 2: Process the Data with a Python Script

We’ll write a Python script to:

- Read the `sales_attributed.jsonl` file.
  
- Infer the "Referring channel" and "Referring medium" from `referrerUrl` and `sourceName`:
  
  - If `referrerUrl` contains "instagram.com," set channel to "instagram" and medium to "social."
    
  - If `sourceName` is "shopify_email," set channel to "shopify_email" and medium to "email."
    
  - Handle campaign names like "pd_cost_cap_catalog_10/10" by setting them as the channel with an empty medium.

- Group orders by "Referring channel" and "Referring medium."
  
- Split orders into current (April 2025) and previous (March 2025) periods.
  
- Calculate metrics for each period:

  - Orders: Count of orders.
    
  - Gross sales: Sum of `subtotalPriceSet`.
    
  - Net sales: Gross sales - Discounts - Returns
    
  - Total sales: Net sales + Shipping charges + Taxes.
    
- Output the results in a `sales_attributed_to_marketing.csv` file.
  
**Mapping Logic for Channels and Mediums:**

- `referrerUrl` domains:
  - "instagram.com" → Channel: "instagram", Medium: "social"
    
  - "facebook.com" → Channel: "facebook", Medium: "social"
    
  - "google.com" → Channel: "google", Medium: "search"
    
  - "yahoo.com" → Channel: "yahoo!", Medium: "search"
    
  - "googlesyndication.com" → Channel: "googlesyndication", Medium: ""
    
- `sourceName` values:
  
  - "shopify_email" → Channel: "shopify_email", Medium: "email"
    
  - "abandoned_cart" → Channel: "abandoned_cart", Medium: "email"
    
  - Campaign names (e.g., "pd_cost_cap_catalog_10/10") → Channel: as-is, Medium: ""
    
- If `referrerUrl` is `null` and `sourceName` is empty or unknown → Channel: "direct", Medium: ""

**Script:**

```
import json
import csv
from collections import defaultdict
from datetime import datetime

# Initialize data structures for current and previous periods
current_period_data = defaultdict(lambda: {
    "orders": 0,
    "gross_sales": 0.0,
    "net_sales": 0.0,
    "total_sales": 0.0
})
previous_period_data = defaultdict(lambda: {
    "orders": 0,
    "gross_sales": 0.0,
    "net_sales": 0.0,
    "total_sales": 0.0
})

# Function to infer referring channel and medium
def infer_channel_and_medium(referrer_url, source_name):
    if referrer_url:
        referrer_url = referrer_url.lower()
        if "instagram.com" in referrer_url:
            return "instagram", "social"
        elif "facebook.com" in referrer_url:
            return "facebook", "social"
        elif "google.com" in referrer_url:
            return "google", "search"
        elif "yahoo.com" in referrer_url:
            return "yahoo!", "search"
        elif "googlesyndication.com" in referrer_url:
            return "googlesyndication", ""
    if source_name:
        source_name = source_name.lower()
        if source_name == "shopify_email":
            return "shopify_email", "email"
        elif source_name == "abandoned_cart":
            return "abandoned_cart", "email"
        # Check for known campaign names from .xlsx
        known_campaigns = {
            "pd_cost_cap_catalog_10/10", "pd_catalog_audience_testing_abo_06/10",
            "pd_cbo_roas_saree_14/10/2024", "pd_cbo_saree_cost_cap_10/10/2024",
            "pd_sales_sidewide_sales_16/11", "gokwik", "bofu_conversions_september-2024",
            "whatmore-live", "pd_surfing_open_catalog_18/10", "pd_abo_navratri sale_ct_03/10",
            "pd_surfing_wedding_combine_18/10", "bestsellers_tof_conversion", "pd_catalog_06/10",
            "pg_tof-conversions", "pd_abo_creative_testing_04/10", "razorpay"
        }
        if source_name in known_campaigns:
            return source_name, ""
    return "direct", ""  # Default to "direct" if no match

# Process orders.jsonl
with open("/content/sales_attributed.jsonl", "r") as file:
    for line in file:
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
            if "id" in data and data["id"].startswith("gid://shopify/Order"):
                # Extract date and determine period
                created_at = datetime.strptime(data["createdAt"], "%Y-%m-%dT%H:%M:%SZ")
                year_month = created_at.strftime("%Y-%m")
                is_current_period = (year_month == "2025-04")
                is_previous_period = (year_month == "2025-03")
                if not (is_current_period or is_previous_period):
                    continue
                
                # Infer channel and medium
                referrer_url = data.get("referrerUrl")
                source_name = data.get("sourceName")
                channel, medium = infer_channel_and_medium(referrer_url, source_name)
                key = (channel, medium)
                
                # Calculate financial metrics
                gross_sales = float(data["subtotalPriceSet"]["shopMoney"]["amount"])
                discounts = float(data["totalDiscountsSet"]["shopMoney"]["amount"])
                returns = float(data["totalRefundedSet"]["shopMoney"]["amount"])
                net_sales = gross_sales - discounts - returns
                shipping = float(data["totalShippingPriceSet"]["shopMoney"]["amount"])
                taxes = float(data["totalTaxSet"]["shopMoney"]["amount"])
                total_sales = net_sales + shipping + taxes
                
                # Assign to current or previous period
                target_data = current_period_data if is_current_period else previous_period_data
                target_data[key]["orders"] += 1
                target_data[key]["gross_sales"] += gross_sales
                target_data[key]["net_sales"] += net_sales
                target_data[key]["total_sales"] += total_sales
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            print(f"Skipping invalid line: {line} (Error: {e})")
            continue

# Step 1: Combine data from both periods
all_keys = set(current_period_data.keys()).union(set(previous_period_data.keys()))
output_data = []
for key in all_keys:
    channel, medium = key
    current = current_period_data.get(key, {"orders": 0, "gross_sales": 0.0, "net_sales": 0.0, "total_sales": 0.0})
    previous = previous_period_data.get(key, {"orders": 0, "gross_sales": 0.0, "net_sales": 0.0, "total_sales": 0.0})
    
    output_data.append({
        "Referring channel": channel,
        "Referring medium": medium,
        "Orders": current["orders"],
        "Total sales": round(current["total_sales"], 2),
        "Gross sales": round(current["gross_sales"], 2),
        "Net sales": round(current["net_sales"], 2),
        "Orders (previous_period)": previous["orders"],
        "Total sales (previous_period)": round(previous["total_sales"], 2),
        "Gross sales (previous_period)": round(previous["gross_sales"], 2),
        "Net sales (previous_period)": round(previous["net_sales"], 2)
    })

# Step 2: Sort by Total sales (descending) to match .xlsx
output_data.sort(key=lambda x: x["Total sales"], reverse=True)

# Step 3: Save to CSV
print("Referring channel | Referring medium | Orders | Total sales | Gross sales | Net sales | Orders (previous_period) | Total sales (previous_period) | Gross sales (previous_period) | Net sales (previous_period)")
print("-" * 120)
with open("sales_attributed_to_marketing.csv", "w", newline="") as csvfile:
    writer = csv.DictWriter(csvfile, fieldnames=[
        "Referring channel", "Referring medium", "Orders", "Total sales", "Gross sales", "Net sales",
        "Orders (previous_period)", "Total sales (previous_period)", "Gross sales (previous_period)", "Net sales (previous_period)"
    ])
    writer.writeheader()
    for row in output_data:
        print(f"{row['Referring channel']} | {row['Referring medium']} | {row['Orders']} | {row['Total sales']} | {row['Gross sales']} | {row['Net sales']} | {row['Orders (previous_period)']} | {row['Total sales (previous_period)']} | {row['Gross sales (previous_period)']} | {row['Net sales (previous_period)']}")
        writer.writerow(row)

```

- Data is grouped by "Referring channel" and "Referring medium."
  
- Comparison is month-wise (April 2025 vs. March 2025).

- Financial metrics are rounded to 2 decimal places.

- Output is stored in `sales_attributed_to_marketing.csv` file.

**Output**

|Referring channel|Referring medium|Orders|Total sales|Gross sales|Net sales|Orders \(previous\_period\)|Total sales \(previous\_period\)|Gross sales \(previous\_period\)|Net sales \(previous\_period\)|
|---|---|---|---|---|---|---|---|---|---|
|direct||4|42567\.26|45965\.2|42028\.52|0|0\.0|0\.0|0\.0|
