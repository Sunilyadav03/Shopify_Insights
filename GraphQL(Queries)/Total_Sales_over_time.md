To extract sales data over time from a Shopify development store using a GraphQL Bulk Operation, We'll need to query the orders object. Shopify’s GraphQL Admin API allows us to extract data like:

**Order Data**

**Total Sales** (`totalPriceSet`)

**Discounts** (`totalDiscountsSet`)

**Returns** (via r`eturnStatus` or `refunds`)

**Net Sales** (calculated from fields)

**Shipping** (`totalShippingPriceSet`)

**Duties** (`totalDutiesSet`)

**Taxes** (`totalTaxSet`)

## 🧾 Notes on Fields

| Field | Description |
|-------|-------------|
| `createdAt` | Date of the order (used to aggregate over time) |
| `totalPriceSet.shopMoney.amount` | Gross sales (before refunds/discounts) |
| `totalDiscountsSet.shopMoney.amount` | Total discounts applied |
| `refunds.totalRefundedSet.shopMoney.amount` | Returns/refunds |
| `totalShippingPriceSet.shopMoney.amount` | Shipping charges |
| `totalDutiesSet.shopMoney.amount` | Duties (for international orders) |
| `totalTaxSet.shopMoney.amount` | Taxes charged |
| `netSales` | You can compute this as: `gross - discounts - refunds` |

Shopify doesn’t calculate `Net Sales` or `Total Sales` as standalone fields—we’ll need to compute them after exporting the CSV from the bulk operation.

## Bulk Query
**Step-1**
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
**Variable Tab**
```
{ "query": "{ orders(query: \"created_at:>=2023-01-01\", first: 1000) { edges { node { id createdAt totalPriceSet { shopMoney { amount currencyCode } } totalDiscountsSet { shopMoney { amount } } refunds { id createdAt totalRefundedSet { shopMoney { amount } } } totalShippingPriceSet { shopMoney { amount } } totalTaxSet { shopMoney { amount } } shippingLines { edges { node { title price } } } customer { id email defaultAddress { city country } } } } } }" }
```

**Step-2(Poll Request)**
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
From `poll request` we get a `url`, copy it, run it into the browser, automatically `jsonl` file will be downloaded, This file containes the following data.
 
| Metric               | Status       | Source in Data                                                                 |
|----------------------|--------------|--------------------------------------------------------------------------------|
| **Day**              | ✅ Yes        | `createdAt` field (timestamp of order)                                        |
| **Orders**           | ✅ Yes        | Each order line in the file represents a unique order                         |
| **Gross sales**      | ✅ Yes        | `totalPriceSet.shopMoney.amount`                                              |
| **Discounts**        | ✅ Yes        | `totalDiscountsSet.shopMoney.amount`                                          |
| **Returns**          | ✅ Yes        | Found inside the `refunds` array → `totalRefundedSet.shopMoney.amount`        |
| **Net sales**        | ⚠️ Partial    | Can be **calculated**: gross − discounts − refunds                            |
| **Shipping charges** | ✅ Yes        | Two sources: `totalShippingPriceSet.shopMoney.amount` and shipping line items |
| **Duties**           | ❌ No         | `totalDutiesSet` not available (field doesn't exist in your data)             |
| **Additional fees**  | ❌ No         | Not present (could be metafields or custom charges — not included here)       |
| **Taxes**            | ✅ Yes        | `totalTaxSet.shopMoney.amount`                                                |
| **Total sales**      | ⚠️ Partial    | Can be calculated as: **net sales + taxes + shipping**                        |
