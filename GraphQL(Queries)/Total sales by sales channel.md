### We need to fetch orders with the following details:

**Sales Channel**: The sales channel associated with the order (e.g., "Online Store", "Furrl Onboard"). In Shopify, this is available via the `publication` or `app` associated with the order, but for simplicity, we’ll use the `channel` information if available, or infer it from `publication`.

**Orders**: Count of orders per sales channel.

**Gross Sales**: `subtotalPriceSet` (product price × quantity, before discounts).

**Discounts**: `totalDiscountsSet`.

**Returns**: `totalRefundedSet`.

**Net Sales**: Gross sales - Discounts - Returns.

**Shipping Charges**: `totalShippingPriceSet`.

**Taxes**: `totalTaxSet`.

**Total Sales**: Net sales + Shipping charges + Taxes.


## step 1: Bulk Query
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
            publication {
              name
            }
            app {
              name
            }
            referrerUrl
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

**Query Details:**

- `created_at:>=2022-01-01`: Fetches orders from January 1, 2022, onward to ensure we have sufficient data (you can adjust the date range as needed).
  
- `publication { name }`: Retrieves the sales channel (e.g., "Online Store"). infer the `sales channel` from `app.name` or `referrerUrl` if publication is `null`. For simplicity, let’s assume:
      - If `app.name` exists, use it as the sales channel (e.g., "Furrl Onboard").
  
      - If `referrerUrl` includes the store’s domain, assume "Online Store".
  
      - Otherwise, default to "Unknown Channel".
  
      - `app { name }`: The app associated with the order (e.g., "Furrl Onboard" might be an app).
  
      - `referrerUrl`: The URL the customer came from, which might indicate the sales channel (e.g., "Online Store" if the URL includes the store’s domain).
  
      - `channelInformation`: If available, this might provide channel details (though this field may not be available in all Shopify setups).
        
- Financial fields:
  - `subtotalPriceSet`: Gross sales.
  - `totalDiscountsSet`: Discounts.
  - `totalRefundedSet`: Returns.
  - `totalShippingPriceSet`: Shipping charges.
  - `totalTaxSet`: Taxes.


 **Poll Query**
 ```
query {
  node(id: "gid://shopify/BulkOperation/5344485867716") {
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

Download the `total_sales_by_sales_channel.jsonl` file from `node.url`.

## Step 2: Process the Data with a Python Script
We’ll write a Python script to:

- 1. Read the `total_sales_by_sales_channel.jsonl` file.

- 2. Group orders by sales channel (using the `publication.name` field).
- 3. Calculate the metrics:
    - `Orders`: Count of orders per sales channel.
      
    - `Gross sales`: Sum of `subtotalPriceSet.shopMoney.amount`.
      
    - `Discounts`: Sum of `totalDiscountsSet.shopMoney.amount` (negative in output).
      
    - `Returns`: Sum of `totalRefundedSet.shopMoney.amount` (negative in output).
      
    - `Net sales`: Gross sales - Discounts - Returns.
 
    - `Shipping charges`: Sum of `totalShippingPriceSet.shopMoney.amount`.
      
    - `Taxes`: Sum of `totalTaxSet.shopMoney.amount`.
      
    - `Total sales`: Net sales + Shipping charges + Taxes.
      
- 4. Output the results in a .csv file(`total_sales_by_sales_channel.csv`).

```
import json
import csv
from collections import defaultdict

# Initialize data structure
sales_channel_data = defaultdict(lambda: {
    "orders": 0,
    "gross_sales": 0.0,
    "discounts": 0.0,
    "returns": 0.0,
    "shipping_charges": 0.0,
    "taxes": 0.0
})

# Process orders.jsonl
with open("/content/total_sales_by_sales_channel.jsonl", "r") as file:
    for line in file:
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
            if "id" in data and data["id"].startswith("gid://shopify/Order"):
                # Determine sales channel
                publication = data.get("publication")
                app = data.get("app")
                referrer_url = data.get("referrerUrl")
                
                if publication is not None and "name" in publication:
                    sales_channel = publication["name"]
                elif app is not None and "name" in app:
                    sales_channel = app["name"]
                elif referrer_url and "yourstore.com" in referrer_url.lower():
                    sales_channel = "Online Store"
                else:
                    sales_channel = "Unknown Channel"
                
                # Increment order count
                sales_channel_data[sales_channel]["orders"] += 1
                
                # Add financial amounts
                sales_channel_data[sales_channel]["gross_sales"] += float(data["subtotalPriceSet"]["shopMoney"]["amount"])
                sales_channel_data[sales_channel]["discounts"] += float(data["totalDiscountsSet"]["shopMoney"]["amount"])
                sales_channel_data[sales_channel]["returns"] += float(data["totalRefundedSet"]["shopMoney"]["amount"])
                sales_channel_data[sales_channel]["shipping_charges"] += float(data["totalShippingPriceSet"]["shopMoney"]["amount"])
                sales_channel_data[sales_channel]["taxes"] += float(data["totalTaxSet"]["shopMoney"]["amount"])
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            print(f"Skipping invalid line: {line} (Error: {e})")
            continue

# Step 1: Calculate metrics for each sales channel
output_data = []
for sales_channel, metrics in sales_channel_data.items():
    gross_sales = metrics["gross_sales"]
    discounts = -metrics["discounts"]  # Negative as per .xlsx
    returns = -metrics["returns"]      # Negative as per .xlsx
    net_sales = gross_sales + discounts + returns  # Discounts and returns are already negative
    shipping_charges = metrics["shipping_charges"]
    taxes = metrics["taxes"]
    total_sales = net_sales + shipping_charges + taxes
    
    output_data.append({
        "Sales channel": sales_channel,
        "Orders": metrics["orders"],
        "Gross sales": round(gross_sales, 2),
        "Discounts": round(discounts, 2),
        "Returns": round(returns, 2),
        "Net sales": round(net_sales, 2),
        "Shipping charges": round(shipping_charges, 2),
        "Taxes": round(taxes, 2),
        "Total sales": round(total_sales, 2)
    })

# Step 2: Sort by Total sales (descending) to match .xlsx
output_data.sort(key=lambda x: x["Total sales"], reverse=True)

# Step 3: Save to CSV
print("Sales channel | Orders | Gross sales | Discounts | Returns | Net sales | Shipping charges | Taxes | Total sales")
print("-" * 100)
with open("total_sales_by_sales_channel.csv", "w", newline="") as csvfile:
    writer = csv.DictWriter(csvfile, fieldnames=[
        "Sales channel", "Orders", "Gross sales", "Discounts", "Returns",
        "Net sales", "Shipping charges", "Taxes", "Total sales"
    ])
    writer.writeheader()
    for row in output_data:
        print(f"{row['Sales channel']} | {row['Orders']} | {row['Gross sales']} | {row['Discounts']} | {row['Returns']} | {row['Net sales']} | {row['Shipping charges']} | {row['Taxes']} | {row['Total sales']}")
        writer.writerow(row)

```

**Output**

|Sales channel|Orders|Gross sales|Discounts|Returns|Net sales|Shipping charges|Taxes|Total sales|
|---|---|---|---|---|---|---|---|---|
|Draft Orders|4|45965\.2|-147\.76|-3788\.92|42028\.52|60\.33|478\.41|42567\.26|
