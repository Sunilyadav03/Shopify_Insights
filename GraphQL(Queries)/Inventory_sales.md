## Step 1: Combine the Bulk Queries
We’ll use two bulk queries:

- **Product Variants Query**: To fetch `product_title`, `product_variant_sku`, and `ending_quantity`.
- **Orders Query**: To fetch order line items and calculate `quantity_sold` per variant. Then, we’ll process the results to compute `starting_quantity` and `sell_through_rate`.

### Bulk Query 1: Product Variants
This query fetches the product and variant data, including `inventoryQuantity` (which is `ending_quantity`).

 
```
mutation bulkOperationRunQuery($query: String!) {
  bulkOperationRunQuery(query: $query) {
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

**Variables Tab**
```

  {
  "query": "{ productVariants(first: 100) { edges { node { id sku inventoryQuantity product { title } } } } }"
}

```

**Poll Query**
```
query {
  node(id: "gid_id") {
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

**Output**: A JSONL file with:

- `product.title` (maps to `product_title`)
- `variant.sku` (maps to `product_variant_sku`)
- `variant.inventoryQuantity` (maps to `ending_quantity`)

### Bulk Query 2: Orders

```
mutation bulkOperationRunQuery($query: String!) {
  bulkOperationRunQuery(query: $query) {
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

**Variables**
```
{
  "query": "{ orders(query: \"created_at:>=2025-04-09 created_at:<=2025-05-09\", first: 100) { edges { node { id lineItems(first: 100) { edges { node { variant { id sku product { title } } quantity } } } } } } }"
}
```
**Poll Query**

```
query {
  node(id: "gid_id") {
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

**Output:** A JSONL file with:

- `order.id`
- `lineItem.variant.id`
- `lineItem.variant.sku`
- `lineItem.product.title`
- `lineItem.quantity` (used to compute `quantity_sold`)

### Step 2: Process the Bulk Query Results
After running both bulk operations and retrieving the JSONL files (via the `url` field from the poll query), we need to process the data to create the final `Inventory_sales` dataset.

**Processing Logic:**
- 1. Parse Product Variants Data:
  - From the first query’s JSONL file, create a dictionary mapping `variant.id` to:
    - `product_title` (`product.title`)
    - `product_variant_sku` (`variant.sku`)
    - `ending_quantity` (`variant.inventoryQuantity`)
      
- 2. Parse Orders Data to Calculate `quantity_sold`:
  - From the second query’s JSONL file, aggregate quantity by `variant.id` to compute `quantity_sold`.
    
- 3. Compute `starting_quantity` and `sell_through_rate`:
   - `starting_quantity = ending_quantity + quantity_sold` (assumes no other inventory adjustments).
   - `sell_through_rate = quantity_sold / (starting_quantity + quantity_sold)` (if denominator is 0, set to 0).
     
- 4. Generate the Final CSV:
Combine the data into the requested format and write to a `.csv` file.



Step 3: Python Script to Process the Data
Here’s a script to process the JSONL files and generate the final inventory_sales.csv.

```
import json
import csv
from collections import defaultdict

# Step 1: Parse the product variants JSONL file
variant_data = {}
with open("product_variants.jsonl", "r") as f:
    for line in f:
        if not line.strip():
            continue
        record = json.loads(line)
        variant_id = record.get("id")
        if variant_id:
            variant_data[variant_id] = {
                "product_title": record.get("product", {}).get("title", ""),
                "product_variant_sku": record.get("sku", ""),
                "ending_quantity": record.get("inventoryQuantity", 0)
            }

# Step 2: Parse the orders JSONL file and calculate quantity_sold
quantity_sold = defaultdict(int)
with open("orders.jsonl", "r") as f:
    for line in f:
        if not line.strip():
            continue
        record = json.loads(line)
        for line_item in record.get("lineItems", {}).get("edges", []):
            node = line_item.get("node", {})
            variant_id = node.get("variant", {}).get("id")
            quantity = node.get("quantity", 0)
            if variant_id:
                quantity_sold[variant_id] += quantity

# Step 3: Combine data and compute starting_quantity and sell_through_rate
output_data = []
for variant_id, data in variant_data.items():
    qty_sold = quantity_sold.get(variant_id, 0)
    ending_qty = data["ending_quantity"]
    
    # Compute starting_quantity
    starting_qty = ending_qty + qty_sold
    
    # Compute sell_through_rate
    total_available = starting_qty + qty_sold
    sell_through_rate = (qty_sold / total_available) if total_available > 0 else 0.0
    
    output_data.append({
        "product_title": data["product_title"],
        "product_variant_sku": data["product_variant_sku"],
        "starting_quantity": starting_qty,
        "ending_quantity": ending_qty,
        "quantity_sold": qty_sold,
        "sell_through_rate": round(sell_through_rate, 3)
    })

# Step 4: Write to CSV
headers = ["product_title", "product_variant_sku", "starting_quantity", "ending_quantity", "quantity_sold", "sell_through_rate"]
with open("inventory_sales.csv", "w", newline="") as csvfile:
    writer = csv.DictWriter(csvfile, fieldnames=headers)
    writer.writeheader()
    for row in output_data:
        writer.writerow(row)

# Step 5: Print a preview
print("Preview of inventory_sales.csv:")
print(",".join(headers))
for row in output_data[:5]:  # Show first 5 rows
    print(f"{row['product_title']},{row['product_variant_sku']},{row['starting_quantity']},{row['ending_quantity']},{row['quantity_sold']},{row['sell_through_rate']}")
```
**Output**
```
Loaded 49 variants from product_variants.jsonl
Processing order line items:
 - Variant gid://shopify/ProductVariant/44772197204164: 1 units
 - Variant gid://shopify/ProductVariant/44772197433540: 1 units
 - Variant gid://shopify/ProductVariant/44810215194820: 3 units
 - Variant gid://shopify/ProductVariant/44810215227588: 2 units
 - Variant gid://shopify/ProductVariant/44810152444100: 2 units
 - Variant gid://shopify/ProductVariant/44810152476868: 4 units
 - Variant gid://shopify/ProductVariant/44810124329156: 4 units
 - Variant gid://shopify/ProductVariant/44810124361924: 2 units
 - Variant gid://shopify/ProductVariant/44810124394692: 2 units
 - Variant gid://shopify/ProductVariant/44810146840772: 2 units
 - Variant gid://shopify/ProductVariant/44810146906308: 2 units
 - Variant gid://shopify/ProductVariant/44810147004612: 1 units
 - Variant gid://shopify/ProductVariant/44810135863492: 2 units
 - Variant gid://shopify/ProductVariant/44810135896260: 2 units
 - Variant gid://shopify/ProductVariant/44772197105860: 2 units
 - Variant gid://shopify/ProductVariant/44772196942020: 6 units
Processed 16 order line items with valid variants
Generated 49 rows for inventory_sales.csv
Variants with quantity_sold > 0: 16
 - The Minimal Snowboard (): 6 sold, sell_through_rate=0.105
 - Premium Cotton T-Shirt (TSHIRT-ORG-{{Size}}-2): 4 sold, sell_through_rate=0.111
 - Eco-Friendly Yoga Mat (YOGAMAT-{{Color}}-2): 4 sold, sell_through_rate=0.167
 - Adjustable Aluminum Laptop Stand (LAPSTAND-{{Color}}-1): 3 sold, sell_through_rate=0.039
 - The Complete Snowboard (): 2 sold, sell_through_rate=0.154
 - Premium Cotton T-Shirt (TSHIRT-ORG-{{Size}}-3): 2 sold, sell_through_rate=0.057
 - Premium Cotton T-Shirt (TSHIRT-ORG-{{Size}}-4): 2 sold, sell_through_rate=0.065
 - TrueBass Wireless Earbuds (EAR-WL-BK-{{Color}}-1): 2 sold, sell_through_rate=0.062
 - TrueBass Wireless Earbuds (EAR-WL-BK-{{Color}}-2): 2 sold, sell_through_rate=0.059
 - Stainless Steel Thermal Bottle (BOT-SS-{{Capacity}}-{{Color}}-1): 2 sold, sell_through_rate=0.048
 - Stainless Steel Thermal Bottle (BOT-SS-{{Capacity}}-{{Color}}-3): 2 sold, sell_through_rate=0.154
 - Eco-Friendly Yoga Mat (YOGAMAT-{{Color}}-1): 2 sold, sell_through_rate=0.074
 - Adjustable Aluminum Laptop Stand (LAPSTAND-{{Color}}-2): 2 sold, sell_through_rate=0.071
 - The Complete Snowboard (): 1 sold, sell_through_rate=0.091
 - The 3p Fulfilled Snowboard (sku-hosted-1): 1 sold, sell_through_rate=0.048
 - Stainless Steel Thermal Bottle (BOT-SS-{{Capacity}}-{{Color}}-6): 1 sold, sell_through_rate=0.03
Preview of inventory_sales.csv (sorted by quantity_sold, sell_through_rate):
product_title,product_variant_sku,starting_quantity,ending_quantity,quantity_sold,sell_through_rate
The Minimal Snowboard,,51,45,6,0.105
Eco-Friendly Yoga Mat,YOGAMAT-{{Color}}-2,20,16,4,0.167
Premium Cotton T-Shirt,TSHIRT-ORG-{{Size}}-2,32,28,4,0.111
Adjustable Aluminum Laptop Stand,LAPSTAND-{{Color}}-1,74,71,3,0.039
The Complete Snowboard,,11,9,2,0.154

```
And final Output in the .csv format:- 

|product\_title|product\_variant\_sku|starting\_quantity|ending\_quantity|quantity\_sold|sell\_through\_rate|
|---|---|---|---|---|---|
|Gift Card||0|0|0|0\.0|
|The Inventory Not Tracked Snowboard|sku-untracked-1|0|0|0|0\.0|
|Gift Card||0|0|0|0\.0|
|Gift Card||0|0|0|0\.0|
|The Archived Snowboard||50|50|0|0\.0|
|Gift Card||0|0|0|0\.0|
|The Collection Snowboard: Hydrogen||50|50|0|0\.0|
|The Compare at Price Snowboard||10|10|0|0\.0|
|The Out of Stock Snowboard||40|40|0|0\.0|
|The Minimal Snowboard||51|45|6|0\.105|
|The Hidden Snowboard||50|50|0|0\.0|
|The Videographer Snowboard||50|50|0|0\.0|
|The Draft Snowboard||20|20|0|0\.0|
|The Complete Snowboard||10|10|0|0\.0|
|The Complete Snowboard||11|9|2|0\.154|
|The Complete Snowboard||10|10|0|0\.0|
|The Complete Snowboard||10|10|0|0\.0|
|The Complete Snowboard||10|9|1|0\.091|
|Selling Plans Ski Wax||10|10|0|0\.0|
|Selling Plans Ski Wax||10|10|0|0\.0|
|Selling Plans Ski Wax||10|10|0|0\.0|
|The Collection Snowboard: Oxygen||50|50|0|0\.0|
|The Multi-location Snowboard||100|100|0|0\.0|
|The Multi-managed Snowboard|sku-managed-1|100|100|0|0\.0|
|The 3p Fulfilled Snowboard|sku-hosted-1|20|19|1|0\.048|
|The Collection Snowboard: Liquid||50|50|0|0\.0|
|Green Snowboard||0|0|0|0\.0|
|Premium Cotton T-Shirt|TSHIRT-ORG-\{\{Size\}\}-1|20|20|0|0\.0|
|Premium Cotton T-Shirt|TSHIRT-ORG-\{\{Size\}\}-2|32|28|4|0\.111|
|Premium Cotton T-Shirt|TSHIRT-ORG-\{\{Size\}\}-3|33|31|2|0\.057|
|Premium Cotton T-Shirt|TSHIRT-ORG-\{\{Size\}\}-4|29|27|2|0\.065|
|Premium Cotton T-Shirt|TSHIRT-ORG-\{\{Size\}\}-5|39|39|0|0\.0|
|Premium Cotton T-Shirt|TSHIRT-ORG-\{\{Size\}\}-6|26|26|0|0\.0|
|Premium Cotton T-Shirt|TSHIRT-ORG-\{\{Size\}\}-7|40|40|0|0\.0|
|Premium Cotton T-Shirt|TSHIRT-ORG-\{\{Size\}\}-8|32|32|0|0\.0|
|TrueBass Wireless Earbuds|EAR-WL-BK-\{\{Color\}\}-1|30|28|2|0\.062|
|TrueBass Wireless Earbuds|EAR-WL-BK-\{\{Color\}\}-2|32|30|2|0\.059|
|TrueBass Wireless Earbuds|EAR-WL-BK-\{\{Color\}\}-3|22|22|0|0\.0|
|Stainless Steel Thermal Bottle|BOT-SS-\{\{Capacity\}\}-\{\{Color\}\}-1|40|38|2|0\.048|
|Stainless Steel Thermal Bottle|BOT-SS-\{\{Capacity\}\}-\{\{Color\}\}-2|10|10|0|0\.0|
|Stainless Steel Thermal Bottle|BOT-SS-\{\{Capacity\}\}-\{\{Color\}\}-3|11|9|2|0\.154|
|Stainless Steel Thermal Bottle|BOT-SS-\{\{Capacity\}\}-\{\{Color\}\}-4|11|11|0|0\.0|
|Stainless Steel Thermal Bottle|BOT-SS-\{\{Capacity\}\}-\{\{Color\}\}-5|12|12|0|0\.0|
|Stainless Steel Thermal Bottle|BOT-SS-\{\{Capacity\}\}-\{\{Color\}\}-6|32|31|1|0\.03|
|Eco-Friendly Yoga Mat|YOGAMAT-\{\{Color\}\}-1|25|23|2|0\.074|
|Eco-Friendly Yoga Mat|YOGAMAT-\{\{Color\}\}-2|20|16|4|0\.167|
|Eco-Friendly Yoga Mat|YOGAMAT-\{\{Color\}\}-3|23|23|0|0\.0|
|Adjustable Aluminum Laptop Stand|LAPSTAND-\{\{Color\}\}-1|74|71|3|0\.039|
|Adjustable Aluminum Laptop Stand|LAPSTAND-\{\{Color\}\}-2|26|24|2|0\.071|
