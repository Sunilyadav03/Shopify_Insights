## Step-1:- Run Bulk Query
```
mutation {
  bulkOperationRunQuery(
    query: """
    {
      orders(query: "created_at:>=2023-01-01") {
        edges {
          node {
            id
            createdAt
            subtotalPriceSet { shopMoney { amount } }
            totalDiscountsSet { shopMoney { amount } }
            totalRefundedSet { shopMoney { amount } }
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

Then we fetch `bulkOperationRunQuery.bulkOperation.id` from the above bulkquery response.
After this we use `bulkOperationRunQuery.bulkOperation.id` inside the `bulkOperation`:-
```
query {
  node(id: "bulkOperationRunQuery.bulkOperation.id") {
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



## Step-2: Post-Processing the Data
The `JSONL file` will contain `order` data. We’ll process it to compute:

`Day`: Extract the date (YYYY-MM-DD) from createdAt.

`Net Sales`: Sum (Gross Sales - Discounts - Returns) per day.

`Gross Sales`: subtotalPriceSet.shopMoney.amount.

`Discounts`: totalDiscountsSet.shopMoney.amount.

`Returns`: totalRefundedSet.shopMoney.amount.

***Processing Script***

Below is a Python script to process the JSONL file and calculate `net sales` over time.
```
import json
from datetime import datetime
import csv

# Initialize data structure
daily_data = {}

# Process orders.jsonl
with open("/content/Net_Sales_Over_Time.jsonl", "r") as file:
    for line in file:
        data = json.loads(line)
        if "id" in data and data["id"].startswith("gid://shopify/Order"):
            # Extract day from createdAt
            created_at = datetime.strptime(data["createdAt"], "%Y-%m-%dT%H:%M:%SZ")
            day = created_at.strftime("%Y-%m-%d")
            
            # Initialize day if not present
            if day not in daily_data:
                daily_data[day] = {
                    "gross_sales": 0.0,
                    "discounts": 0.0,
                    "returns": 0.0
                }
            
            # Add financial amounts
            daily_data[day]["gross_sales"] += float(data["subtotalPriceSet"]["shopMoney"]["amount"])
            daily_data[day]["discounts"] += float(data["totalDiscountsSet"]["shopMoney"]["amount"])
            daily_data[day]["returns"] += float(data["totalRefundedSet"]["shopMoney"]["amount"])

# Calculate metrics and output
print("Day | Net Sales")
print("-" * 20)
with open("net_sales_over_time.csv", "w", newline="") as csvfile:
    writer = csv.writer(csvfile)
    writer.writerow(["Day", "Net Sales"])
    
    for day in sorted(daily_data.keys()):
        gross_sales = daily_data[day]["gross_sales"]
        discounts = daily_data[day]["discounts"]
        returns = daily_data[day]["returns"]
        net_sales = gross_sales - discounts - returns
        
        print(f"{day} | ${net_sales:.2f}")
        writer.writerow([day, f"${net_sales:.2f}"])

```

***Output of the Above .py file:-***

<img width="247" alt="Screenshot 2025-05-05 at 13 19 09" src="https://github.com/user-attachments/assets/a09c040d-231d-4863-94fe-ec38a1d19ab6" />


