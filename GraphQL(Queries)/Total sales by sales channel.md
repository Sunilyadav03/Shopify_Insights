To fetch **total sales data by referrer** from our Shopify store using the GraphQL Admin API, we need to query order-related data and aggregate it by referrer source and name. Shopify's GraphQL Admin API supports bulk operations for large datasets, which is ideal for this use case. Below, I’ll provide both a **bulk query** for asynchronous data retrieval and a **standard GraphQL query** for smaller datasets or testing, as per Shopify’s official documentation.

### 1. Bulk Query

The **bulk query** uses `bulkOperationRunQuery` to fetch large datasets asynchronously, returning results in a JSONL file.


Shopify’s GraphQL Admin API does not directly provide aggregated sales data by referrer, so we’ll need to fetch raw order data and process it client-side to compute totals (e.g., gross sales, net sales).
Fields like `referrerUrl`, `totalPriceSet`, and `subtotalPriceSet` on the `Order` object will help derive the required metrics.
Ensure our app has the necessary access scopes (`read_orders`, `read_all_orders`) to query order data.

The response will include raw order data, which we can filter and aggregate to compute:

Orders: Count of orders per referrer.
Total Sales: Sum of `totalPriceSet` (includes taxes and shipping).
Gross Sales: Sum of `subtotalPriceSet` (excludes discounts, taxes, shipping).
Net Sales: Gross sales minus discounts and returns (use `totalPriceSet` adjusted for refunds).


## How to Use the Bulk Query:
**1. Execute the Mutation:**

```
mutation bulkOperationRunQuery($query: String!) {
  bulkOperationRunQuery(query: $query) {
    bulkOperation {
      id
      status
      url
      objectCount
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
{
  "query": "{ orders { edges { node { id name createdAt referrerUrl totalPriceSet { shopMoney { amount currencyCode } } subtotalPriceSet { shopMoney { amount currencyCode } } totalRefundedSet { shopMoney { amount currencyCode } } totalDiscountsSet { shopMoney { amount currencyCode } } } } } }"
}
```

**2. Poll for Completion:**
Use the `currentBulkOperation` query to check the `status` field until it returns `COMPLETED`. Example

```
query {
  node(id: "bulkoperation_id") {
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


**3. Retrieve Results:**
When `status` is `COMPLETED`, download the JSONL file from the `url` field. Each line represents an order with its `referrerUrl`, `totalPriceSet`, `subtotalPriceSet`, `totalRefundedSet`, and `totalDiscountsSet`

**4. Process Data:**
Parse `referrerUrl` to extract the referrer source (e.g., `google`, `facebook`) and name (e.g., domain or specific campaign).
Aggregate orders by referrer:
Orders: Count unique orders per referrer.
Total Sales: Sum `totalPriceSet.shopMoney.amount`.
Gross Sales: Sum `subtotalPriceSet.shopMoney.amount`.
Net Sales: Sum `totalPriceSet.shopMoney.amount` minus `totalRefundedSet.shopMoney.amount` and `totalDiscountsSet.shopMoney.amount`.


## 2. Standard Query
The **standard query** is synchronous and suitable for smaller datasets but may require pagination for large stores.

### How to Use

##### 1. Execute the Query
Send the query to the Shopify GraphQL Admin API endpoint:



```
query GetSalesByReferrer($first: Int!, $after: String, $query: String) {
  orders(first: $first, after: $after, query: $query) {
    edges {
      cursor
      node {
        id
        name
        createdAt
        referrerUrl
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        subtotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalRefundedSet {
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
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}

```

***Variables Example***

```
{
  "first": 100,
  "after": null,
  "query": null
}
```



#### 2. Pagination
- Check `pageInfo.hasNextPage` to determine if more orders are available.
- Use `pageInfo.endCursor` as the `after` value in the next query to fetch the next page.

#### 3. Process Data
**Aggregate by `referrerUrl`:**
- **Orders:** Count unique orders per referrer.
- **Total Sales:** Sum `totalPriceSet.shopMoney.amount`.
- **Gross Sales:** Sum `subtotalPriceSet.shopMoney.amount`.
- **Net Sales:** Calculate as:


- **Handle Null `referrerUrl`:** If `referrerUrl` is null, treat it as "Direct" traffic.

#### 4. Optional Filtering
Use the query variable to filter orders, for example:
- By referrer: `"referrerUrl:*google*"`
- By date: `"created_at:>=2024-01-01"`

(Filters must follow Shopify’s search syntax.)


