## ✅ Shopify Bulk Query: `Product Title`, `Product_Varient_SKU`, `Ending_Quantity`


 
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

This query will return:

`product.title`

`variant.sku`

`variant.inventoryQuantity` (ending_quantity)

## ✅ Example Extracted Data

 | Product Title                             | SKU             | Inventory_Quantity/ending_quantity |
|------------------------------------------|------------------|--------------------|
| Gift Card                                 | *null*           | 0                  |
| The Inventory Not Tracked Snowboard       | `sku-untracked-1`| 0                  |
| The Archived Snowboard                    | *null*           | 50                 |
| The Compare at Price Snowboard            | *null*           | 10                 |
| The Minimal Snowboard                     | *null*           | 45                 |

But from above we are unable to `quantity_sold` per variant from orders data, which can be extracted from following Bulk Query:- 


## ✅ Shopify Bulk Query: `Quantity_Sold` per Variant

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
  "query": "{ orders(query: \"created_at:>=2024-01-01\", first: 100) { edges { node { id lineItems(first: 100) { edges { node { variant { id sku product { title } } quantity } } } } } } }"
}
```
**Roll**

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

The output of the above bulk query is:- 

## ✅ Example Extracted Data

| Order ID              | Product Title                    | SKU                   | Quantity |
|-----------------------|----------------------------------|------------------------|----------|
| Order 6097030021316   | The Complete Snowboard           | *null*                 | 1        |
| Order 6097030021316   | The 3p Fulfilled Snowboard       | sku-hosted-1           | 1        |
| Order 6097046110404   | Adjustable Aluminum Laptop Stand | LAPSTAND-{{Color}}-1   | 3        |
| Order 6097046110404   | Eco-Friendly Yoga Mat            | YOGAMAT-{{Color}}-1    | 2        |
| Order 6097046110404   | Premium Cotton T-Shirt           | TSHIRT-ORG-{{Size}}-2  | 4        |
