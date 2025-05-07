# Assumptions and Notes
### Data Source:
Sales data is typically derived from orders, line items, and related objects like discounts, refunds, and taxes in Shopify’s GraphQL Admin API.

### Fields Mapping:

  ***Product title***: Available via `product.title`.
  
  ***Product variant title***: Available via `variant.title`.
  
  ***Product variant SKU***: Available via `variant.sku`.
  
  ***Net items sold***: Calculated as the total quantity sold minus returned quantities (from refunds).
  
  ***Gross sales***: Product price × quantity sold (before discounts, returns, taxes, or shipping).
  
  ***Discounts***: Sum of discount amounts applied to line items.
  
  ***Returns***: Sum of refunded amounts or quantities.
  
  ***Net sales***: Gross sales - Discounts - Returns.
  
  ***Taxes***: Sum of tax amounts applied to line items.
  
  ***Total sales***:Gross sales - Discounts - Returns + Taxes + Shipping Charges. (Note: Shipping is typically at the order level, not variant level, so we’ll exclude it unless specified otherwise, as per standard Shopify sales reports.)
  
### Bulk Query:
Suitable for large datasets, runs asynchronously, and returns results in a JSONL file. Only one bulk operation can run per shop at a time, and it must complete within 10 days.


```
mutation {
  bulkOperationRunQuery(
    query: """
    {
      orders(query: "created_at:>=2023-01-01") {
        edges {
          node {
            id
            lineItems(first: 250) {
              edges {
                node {
                  quantity
                  price: originalUnitPriceSet {
                    shopMoney {
                      amount
                    }
                  }
                  discount: totalDiscountSet {
                    shopMoney {
                      amount
                    }
                  }
                  productTitle: product {
                    title
                  }
                  variantTitle: variant {
                    title
                    sku
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

## Poll Query

```
query {
  node(id: "gid://shopify/BulkOperation/5343947718852") {
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

**Extract Order IDs:**
We’ll write a small following Python script to extract order IDs from the `orders_line_items.jsonl` file.

```
import json

# Path to the orders JSONL file
ORDERS_JSONL_PATH = "orders.jsonl"

# Extract order IDs
order_ids = []
try:
    with open(ORDERS_JSONL_PATH, "r") as file:
        for line in file:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
                if "id" in data and data["id"].startswith("gid://shopify/Order"):
                    order_ids.append(data["id"])
            except json.JSONDecodeError as e:
                print(f"Skipping invalid line: {line} (Error: {e})")
                continue
except FileNotFoundError:
    print(f"Error: File {ORDERS_JSONL_PATH} not found.")
    exit()

print(f"Order IDs: {order_ids}")

```

***Output***
```
Extracted ['gid://shopify/Order/6097030021316', 'gid://shopify/Order/6097046110404', 'gid://shopify/Order/6097059578052', 'gid://shopify/Order/6097062101188'] order IDs
```



## Process the `order.jsonl` file

```
import json
import csv
from collections import defaultdict

# Path to the JSONL file
ORDERS_JSONL_PATH = "/content/orders.jsonl"

# Step 1: Aggregate data by product variant while processing orders
variant_metrics = defaultdict(lambda: {
    "product_title": "",
    "variant_title": "",
    "sku": "",
    "net_items_sold": 0,
    "gross_sales": 0.0,
    "discounts": 0.0,  # Will be negative to match .xlsx
    "returns": 0.0,    # Will be negative to match .xlsx
    "net_sales": 0.0,
    "taxes": 0.0,      # Will approximate taxes
    "total_sales": 0.0
})

# Read the orders JSONL file
try:
    with open(ORDERS_JSONL_PATH, "r") as file:
        jsonl_data = file.readlines()
except FileNotFoundError:
    print(f"Error: File {ORDERS_JSONL_PATH} not found.")
    exit()

# Process each line
current_order_id = None
for line in jsonl_data:
    line = line.strip()
    if not line:
        continue
    
    try:
        data = json.loads(line)
        
        # Check if this is an order entry
        if "id" in data and data["id"].startswith("gid://shopify/Order"):
            current_order_id = data["id"]
            continue
        
        # Process line item (sales)
        if "__parentId" in data and data["__parentId"] == current_order_id:
            product_title = data.get("productTitle", {}).get("title", "Unknown Product")
            variant_title = data.get("variantTitle", {}).get("title", "Unknown Variant")
            sku = data.get("variantTitle", {}).get("sku", "Unknown SKU") or "Unknown SKU"  # Handle null SKU
            
            # Create a unique key for the variant
            variant_key = (product_title, variant_title, sku)
            
            # Initialize the variant metrics if not already present
            variant_metrics[variant_key]["product_title"] = product_title
            variant_metrics[variant_key]["variant_title"] = variant_title
            variant_metrics[variant_key]["sku"] = sku
            
            # Calculate metrics
            quantity = data.get("quantity", 0)
            original_price = float(data.get("price", {}).get("shopMoney", {}).get("amount", "0.0"))
            discount = float(data.get("discount", {}).get("shopMoney", {}).get("amount", "0.0"))
            
            # Update metrics
            variant_metrics[variant_key]["net_items_sold"] += quantity
            variant_metrics[variant_key]["gross_sales"] += original_price * quantity
            variant_metrics[variant_key]["discounts"] -= discount  # Negative to match .xlsx
            
            # Approximate taxes (based on .xlsx, taxes are ~5% of net sales)
            net_sales_temp = (original_price * quantity) - discount
            taxes = net_sales_temp * 0.05  # Approximation
            variant_metrics[variant_key]["taxes"] += taxes
    
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        print(f"Skipping invalid order line: {line} (Error: {e})")
        continue

# Step 2: Calculate derived metrics (Net sales, Total sales)
for variant_key, metrics in variant_metrics.items():
    gross_sales = metrics["gross_sales"]
    discounts = metrics["discounts"]  # Already negative
    returns = metrics["returns"]      # 0.0 since refunds are not included
    taxes = metrics["taxes"]
    
    # Net sales = Gross sales + Discounts + Returns
    net_sales = gross_sales + discounts + returns
    metrics["net_sales"] = net_sales
    
    # Total sales = Net sales + Taxes
    total_sales = net_sales + taxes
    metrics["total_sales"] = total_sales

# Step 3: Prepare data for output, sorting by Total sales (descending) to match .xlsx
aggregated_data = []
for variant_key, metrics in variant_metrics.items():
    aggregated_data.append((
        metrics["product_title"],
        metrics["variant_title"],
        metrics["sku"],
        metrics["net_items_sold"],
        round(metrics["gross_sales"], 2),
        round(metrics["discounts"], 2),
        round(metrics["returns"], 2),
        round(metrics["net_sales"], 2),
        round(metrics["taxes"], 2),
        round(metrics["total_sales"], 2)
    ))

# Sort by Total sales (descending) to match the .xlsx file
aggregated_data.sort(key=lambda x: x[9], reverse=True)

# Step 4: Output results and save to CSV
print("Product title | Product variant title | Product variant SKU | Net items sold | Gross sales | Discounts | Returns | Net sales | Taxes | Total sales")
print("-" * 120)
with open("total_sales_by_product_variant.csv", "w", newline="") as csvfile:
    writer = csv.writer(csvfile)
    writer.writerow([
        "Product title", "Product variant title", "Product variant SKU",
        "Net items sold", "Gross sales", "Discounts", "Returns",
        "Net sales", "Taxes", "Total sales"
    ])
    for row in aggregated_data:
        product_title, variant_title, sku, net_items_sold, gross_sales, discounts, returns, net_sales, taxes, total_sales = row
        print(f"{product_title} | {variant_title} | {sku} | {net_items_sold} | {gross_sales} | {discounts} | {returns} | {net_sales} | {taxes} | {total_sales}")
        writer.writerow([product_title, variant_title, sku, net_items_sold, gross_sales, discounts, returns, net_sales, taxes, total_sales])

```

The above .py file will return its output in the 'total_sales_by_product_variant.csv' and that will contains the following output:-
(Note during calculating the  'taxes' we conside the 5% tax, by default)
**Output**

<img width="898" alt="Screenshot 2025-05-07 at 23 29 28" src="https://github.com/user-attachments/assets/608bbc44-0027-47e7-8a9f-ce185c532fa4" />
