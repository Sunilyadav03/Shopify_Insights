
## Bulk Query
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
{ "query": "{ orders(query: \"created_at:>=2023-01-01\", first: 1000) { edges { node { id createdAt lineItems(first: 100) { edges { node { title quantity } } } refunds { id createdAt } } } } }" }
```

## Roll 
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

## ✅ What we can get directly using Bulk API:

| Field              | Available via Bulk API? | GraphQL Field                         |
|-------------------|--------------------------|----------------------------------------|
| Product title      | ✅ Yes                   | `lineItems { title }`                 |
| Quantity ordered   | ✅ Yes                   | `lineItems { quantity }`              |
| Quantity returned  | ❌ No (blocked)          | `refunds { refundLineItems { quantity } }` → not allowed in bulk |
| Returned rate      | ❌ Needs returned quantity | Calculate: `(returned / ordered) * 100` |

## 🔍 Explanation of Fields:

| Field                           | Description                               |
|--------------------------------|-------------------------------------------|
| `lineItems.title`              | Product name/title                        |
| `lineItems.quantity`           | Quantity ordered                          |
| `refunds.refundLineItems.quantity` | Quantity returned per product            |
| `refunds.refundLineItems.lineItem.title` | Product title for the return         |
| `createdAt`                    | Order date (to group by day if needed)    |

## 🔄 Post-Processing Suggestion
We'll need to:

Group data by `lineItems.title`

Sum ordered quantities

Sum returned quantities from `refundLineItems`


## Standard Query
```
query getOrdersWithReturns($cursor: String) {
  orders(first: 100, after: $cursor, query: "created_at:>=2023-01-01") {
    pageInfo {
      hasNextPage
      endCursor
    }
    edges {
      node {
        id
        createdAt
        lineItems(first: 100) {
          edges {
            node {
              title
              quantity
            }
          }
        }
        refunds(first: 100) {
          createdAt
          refundLineItems(first: 100) {
            edges {
              node {
                quantity
                lineItem {
                  title
                }
              }
            }
          }
        }
      }
    }
  }
}
```

***The restriction on nested connections in list fields is a known Shopify GraphQL API limitation.***

So to avoid this problem:

Query 1: Fetch Orders and Line Items
This query retrieves all orders and their line items, which provides Product title and Quantity ordered.

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
            lineItems {
              edges {
                node {
                  title
                  quantity
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
What it does:

Fetches all orders created on or after January 1, 2023.
Includes id, createdAt, and lineItems (with title and quantity).
Avoids refunds to prevent the nested connection issue.
Output: JSONL file (orders.jsonl) with order and line item data.

Query 2: Fetch Orders and Refund Metadata (Avoid Nested Connection)
Since refunds cannot be queried at the root level, and refundLineItems causes issues in bulk queries, we’ll fetch refunds with minimal fields (e.g., id, createdAt) to get refund metadata, then use a separate non-bulk query to fetch refundLineItems details.
```
mutation {
  bulkOperationRunQuery(
    query: """
    {
      orders(query: "created_at:>=2023-01-01") {
        edges {
          node {
            id
            refunds {
              id
              createdAt
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

What it does:

Fetches all orders with their refunds (limited to id and createdAt to avoid refundLineItems).
Output: JSONL file (refunds.jsonl) with order IDs and refund IDs.
Limitation: Does not include refundLineItems (so no Quantity returned yet).

Follow-Up Non-Bulk Query: Fetch Refund Line Items
Use the refund IDs from the second bulk query to fetch refundLineItems details via a standard GraphQL query. This query can be run iteratively for each refund ID.

```
query {
  node(id: "gid://shopify/Refund/REFUND_ID") {
    ... on Refund {
      id
      createdAt
      refundLineItems(first: 100) {
        edges {
          node {
            quantity
            lineItem {
              title
            }
          }
        }
      }
    }
  }
}
```

What it does:

Fetches refundLineItems for a specific refund ID (replace REFUND_ID with the actual ID from the second bulk query).
Provides Product title and Quantity returned.
Run this query for each refund ID obtained from the second bulk query.

### Processing the Data

**1. Run Bulk Queries:**
    Execute the first bulk query to get `orders.jsonl` (`orders` and `line items`).
    
    Execute the second bulk query to get `refunds.jsonl` (`orders` and `refund IDs`).

**2. Extract Refund IDs:**
    Parse `refunds.jsonl` to collect all refund IDs (e.g., `gid://shopify/Refund/12345`).
    
**3. Fetch Refund Line Items:**
    Use the non-bulk query to fetch `refundLineItems` for each refund ID.
    Store the results (e.g., in a list or file).
**4. Aggregate Data:**
    Combine data from `orders.jsonl` (for Quantity ordered) and refund line items (for Quantity returned).
    Group by `title` to calculate Returned quantity rate.


### Example Python Script
This script processes the JSONL files and fetches refund line items to produce the desired output.
```
import json
import requests

# Shopify GraphQL endpoint and headers
SHOPIFY_API_URL = "https://YOUR_SHOP.myshopify.com/admin/api/2025-04/graphql.json"
HEADERS = {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": "YOUR_ACCESS_TOKEN"
}

# Initialize product summary
product_summary = {}

# Process orders.jsonl (line items)
with open("orders.jsonl", "r") as file:
    for line in file:
        data = json.loads(line)
        if "id" in data and data["id"].startswith("gid://shopify/Order"):
            for li in data.get("lineItems", {}).get("edges", []):
                title = li["node"]["title"]
                qty_ordered = li["node"]["quantity"]
                if title not in product_summary:
                    product_summary[title] = {"ordered": 0, "returned": 0}
                product_summary[title]["ordered"] += qty_ordered

# Collect refund IDs from refunds.jsonl
refund_ids = []
with open("refunds.jsonl", "r") as file:
    for line in file:
        data = json.loads(line)
        if "id" in data and data["id"].startswith("gid://shopify/Order"):
            for refund in data.get("refunds", []):
                refund_ids.append(refund["id"])

# Fetch refund line items for each refund ID
for refund_id in refund_ids:
    query = """
    query {
      node(id: "%s") {
        ... on Refund {
          id
          refundLineItems(first: 100) {
            edges {
              node {
                quantity
                lineItem {
                  title
                }
              }
            }
          }
        }
      }
    }
    """ % refund_id
    response = requests.post(SHOPIFY_API_URL, json={"query": query}, headers=HEADERS)
    result = response.json()
    refund_data = result["data"]["node"]
    for rli in refund_data.get("refundLineItems", {}).get("edges", []):
        title = rli["node"]["lineItem"]["title"]
        qty_returned = rli["node"]["quantity"]
        if title not in product_summary:
            product_summary[title] = {"ordered": 0, "returned": 0}
        product_summary[title]["returned"] += qty_returned

# Calculate and print results
for title, data in product_summary.items():
    rate = data["returned"] / data["ordered"] if data["ordered"] > 0 else 0
    print(f"{title}: Ordered={data['ordered']}, Returned={data['returned']}, Rate={rate:.2%}")


```
