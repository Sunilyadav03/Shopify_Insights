# Assumptions and Notes
### Data Source:
Sales data is typically derived from orders, line items, and related objects like discounts, refunds, and taxes in Shopify’s GraphQL Admin API.

### Fields Mapping:

  ***Product title***: Available via `product.title`.
  
  ***Product variant title***: Available via `variant.title`.
  
  ***Product variant SKU***: Available via `variant.sku`.
  
  ***Net items sold***: Calculated as the total quantity sold minus returned quantities (from refunds).
  
  ***Gross sales***: Total revenue from line items before discounts, refunds, or taxes.
  
  ***Discounts***: Sum of discount amounts applied to line items.
  
  ***Returns***: Sum of refunded amounts or quantities.
  
  ***Net sales***: Gross sales minus discounts and returns.
  
  ***Taxes***: Sum of tax amounts applied to line items.
  
  ***Total sales***: Net sales plus taxes.
  
### Bulk Query:
Suitable for large datasets, runs asynchronously, and returns results in a JSONL file. Only one bulk operation can run per shop at a time, and it must complete within 10 days.
### Standard Query:
Suitable for smaller datasets or real-time queries, subject to API rate limits (cost-based, max 2000 points per minute).
***Permissions:*** Ensure our app has the `required access scopes` (`read_products`, `read_orders`, `read_reports`) to access products, orders, and sales data


### Approach
**Bulk Query:** Use bulkOperationRunQuery to fetch all orders, their line items, discounts, refunds, and taxes, then aggregate by product variant. The result is a JSONL file you can process to compute the metrics.
**Standard Query:** Use a paginated query to fetch orders and their line items, limited to a smaller dataset (e.g., first 50 orders). This is synchronous but may hit rate limits for large stores.
**Processing:** Both queries require post-processing (e.g., in your app’s backend) to aggregate data by product variant and calculate metrics like net items sold, gross sales, etc.


