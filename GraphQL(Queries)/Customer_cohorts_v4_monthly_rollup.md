***Customer_cohort_period:*** The time period (e.g., month) when customers made their first purchase.

***Periods_since_first_purchase:*** Number of periods (e.g., months) since the first purchase.

***Total_customers:*** Number of customers in the cohort.

***Total_gross_sales:*** Total sales before discounts, returns, taxes, and shipping.

***Total_net_sales:*** Gross sales minus discounts and returns.

***Average_order_value:*** Total sales (excluding returns) divided by the number of orders.

***Total_orders:*** Total number of orders placed by the cohort.

***Average_number_of_orders:*** Average orders per customer in the cohort.

***Total_total_sales:*** Net sales plus taxes and shipping (Shopify’s definition of "total sales").

***Amount_spent_per_customer:*** Average amount spent per customer (similar to Customer Lifetime Value for the cohort).

***Customer_retention:*** Percentage of customers who made a repeat purchase within a given period.


Shopify’s GraphQL API doesn’t directly provide a "Customer Cohort Analysis" endpoint with these exact metrics pre-aggregated. Instead, we need to:

  - Fetch customer data to group them into cohorts based on their first purchase date.
  - Fetch their orders to calculate sales, retention, and other metrics.
  - Process the data into a monthly rollup format.

### GraphQL Query to Fetch Customers and Orders
We’ll fetch customers and their orders in a way that allows us to group them into monthly cohorts. We’ll also fetch order details to compute the required metrics.

```

mutation {
  bulkOperationRunQuery(
    query: """
    {
      customers(query: "created_at:>=2023-01-01") {
        edges {
          node {
            id
            createdAt
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


**What This Query Does:**

- Fetches customers created on or after January 1, 2023.
- For each customer, fetches their creation date (`createdAt`) and up to 250 orders.
- For each order, fetches:
      - `totalPriceSet`: Total sales (gross sales + taxes + shipping).
      - `subtotalPriceSet`: Gross sales (before taxes, shipping, discounts).
      - `totalDiscountsSet`: Discounts applied.
      - `totalTaxSet`: Taxes.
      - `totalShippingPriceSet`: Shipping costs.

```
  query {
  node(id: "gid://shopify/BulkOperation/5344238567620") {
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
  
Outputs a JSONL file (`customers.jsonl`).


### Process the Data into Cohorts

We’ll write a Python script to process `customers.jsonl` into the desired cohort format. The script will:

    - Group customers into monthly cohorts based on their first order date.
    - Calculate the metrics for each cohort over time (monthly rollup).
    - Output the results as a CSV file.

```
import json
import csv
from datetime import datetime
from collections import defaultdict

# Path to the JSONL file
CUSTOMERS_JSONL_PATH = "/content/customers.jsonl"

# Step 1: Read the customers JSONL file and link orders to customers
customers = {}
customer_orders = defaultdict(list)

try:
    with open(CUSTOMERS_JSONL_PATH, "r") as file:
        jsonl_data = file.readlines()
except FileNotFoundError:
    print(f"Error: File {CUSTOMERS_JSONL_PATH} not found.")
    exit()

current_customer_id = None
for line in jsonl_data:
    line = line.strip()
    if not line:
        continue
    
    try:
        data = json.loads(line)
        
        # Check if this is a customer entry
        if "id" in data and data["id"].startswith("gid://shopify/Customer"):
            current_customer_id = data["id"]
            customers[current_customer_id] = {
                "createdAt": data.get("createdAt"),
                "first_order_date": None
            }
            continue
        
        # Check if this is an order entry
        if "__parentId" in data and data["__parentId"].startswith("gid://shopify/Customer"):
            customer_id = data["__parentId"]
            order_date = datetime.strptime(data.get("createdAt"), "%Y-%m-%dT%H:%M:%SZ")
            gross_sales = float(data.get("subtotalPriceSet", {}).get("shopMoney", {}).get("amount", "0.0"))
            discounts = float(data.get("totalDiscountsSet", {}).get("shopMoney", {}).get("amount", "0.0"))
            taxes = float(data.get("totalTaxSet", {}).get("shopMoney", {}).get("amount", "0.0"))
            shipping = float(data.get("totalShippingPriceSet", {}).get("shopMoney", {}).get("amount", "0.0"))
            total_sales = float(data.get("totalPriceSet", {}).get("shopMoney", {}).get("amount", "0.0"))
            
            customer_orders[customer_id].append({
                "order_date": order_date,
                "gross_sales": gross_sales,
                "discounts": discounts,
                "taxes": taxes,
                "shipping": shipping,
                "total_sales": total_sales
            })
            
            # Update first order date for the customer
            if customers[customer_id]["first_order_date"] is None or order_date < customers[customer_id]["first_order_date"]:
                customers[customer_id]["first_order_date"] = order_date
    
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        print(f"Skipping invalid line: {line} (Error: {e})")
        continue

# Step 2: Group customers into cohorts based on first order date
customer_cohorts = defaultdict(list)
for customer_id, info in customers.items():
    if info["first_order_date"] is None:
        continue  # Skip customers with no orders
    cohort_period = info["first_order_date"].strftime("%Y-%m")
    customer_cohorts[cohort_period].append(customer_id)

# Step 3: Calculate metrics for each cohort over time
cohort_metrics = []
all_months = sorted(set([datetime.strptime(cohort, "%Y-%m") for cohort in customer_cohorts.keys()] + [datetime(2025, 4, 1)]))
for cohort_period in customer_cohorts:
    cohort_start = datetime.strptime(cohort_period, "%Y-%m")
    customers_in_cohort = customer_cohorts[cohort_period]
    total_customers = len(customers_in_cohort)
    
    # Track orders by period since first purchase
    for month_idx, current_month in enumerate(all_months):
        if current_month < cohort_start:
            continue
        
        periods_since_first = (current_month.year - cohort_start.year) * 12 + current_month.month - cohort_start.month
        if periods_since_first < 0:
            continue
        
        # Calculate metrics for this cohort in this period
        total_orders = 0
        total_gross_sales = 0.0
        total_discounts = 0.0
        total_taxes = 0.0
        total_shipping = 0.0
        total_total_sales = 0.0
        repeat_customers = set()
        
        for customer_id in customers_in_cohort:
            orders = customer_orders.get(customer_id, [])
            customer_has_ordered = False
            for order in orders:
                order_date = order["order_date"]
                if order_date.year == current_month.year and order_date.month == current_month.month:
                    total_orders += 1
                    total_gross_sales += order["gross_sales"]
                    total_discounts += order["discounts"]
                    total_taxes += order["taxes"]
                    total_shipping += order["shipping"]
                    total_total_sales += order["total_sales"]
                    customer_has_ordered = True
            if customer_has_ordered and periods_since_first > 0:
                repeat_customers.add(customer_id)
        
        total_net_sales = total_gross_sales - total_discounts
        average_order_value = total_gross_sales / total_orders if total_orders > 0 else 0.0
        average_number_of_orders = total_orders / total_customers if total_customers > 0 else 0.0
        amount_spent_per_customer = total_total_sales / total_customers if total_customers > 0 else 0.0
        customer_retention = (len(repeat_customers) / total_customers * 100) if total_customers > 0 and periods_since_first > 0 else 0.0
        
        cohort_metrics.append({
            "Customer_cohort_period": cohort_period,
            "Periods_since_first_purchase": periods_since_first,
            "Total_customers": total_customers,
            "Total_gross_sales": round(total_gross_sales, 2),
            "Total_net_sales": round(total_net_sales, 2),
            "Average_order_value": round(average_order_value, 2),
            "Total_orders": total_orders,
            "Average_number_of_orders": round(average_number_of_orders, 2),
            "Total_total_sales": round(total_total_sales, 2),
            "Amount_spent_per_customer": round(amount_spent_per_customer, 2),
            "Customer_retention": round(customer_retention, 2)
        })

# Step 4: Sort by cohort period and periods since first purchase
cohort_metrics.sort(key=lambda x: (x["Customer_cohort_period"], x["Periods_since_first_purchase"]))

# Step 5: Save to CSV
output_file = "customer_cohorts_v4_monthly_rollup.csv"
with open(output_file, "w", newline="") as csvfile:
    writer = csv.DictWriter(csvfile, fieldnames=[
        "Customer_cohort_period", "Periods_since_first_purchase", "Total_customers",
        "Total_gross_sales", "Total_net_sales", "Average_order_value", "Total_orders",
        "Average_number_of_orders", "Total_total_sales", "Amount_spent_per_customer", "Customer_retention"
    ])
    writer.writeheader()
    for row in cohort_metrics:
        writer.writerow(row)

print(f"Cohort metrics saved to {output_file}")

```

***Output***

|Customer\_cohort\_period|Periods\_since\_first\_purchase|Total\_customers|Total\_gross\_sales|Total\_net\_sales|Average\_order\_value|Total\_orders|Average\_number\_of\_orders|Total\_total\_sales|Amount\_spent\_per\_customer|Customer\_retention|
|---|---|---|---|---|---|---|---|---|---|---|
|2025-04|0|2|40649\.5|40501\.74|13549\.83|3|1\.5|40709\.83|20354\.92|0\.0|

**Explanation of Fixes**
  
  `Cohort Period`: Now based on the first order date, not customer creation date.
  
  `Order Linking`: Uses `__parentId` to correctly link orders to customers.
  
  `Total_customers`: Only counts customers who made a purchase in the cohort period (2, not 5 or 8).
  
  `Metrics Calculation`: Properly aggregates gross sales, net sales, total sales, etc., based on the orders in the period.
  
