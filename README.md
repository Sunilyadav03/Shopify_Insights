**What is a line item?**
A line item represents a specific product or service that is included in a purchase. It typically includes information like the product name, quantity, price, and any variations or customizations made to it. 

**How line items relate to orders:**
An order can contain multiple line items, each representing a different product or quantity of the same product the customer has added to their cart. 

**"Line items per order" in Shopify:**
When discussing limits or restrictions on line items, the phrase "line items per order" refers to the maximum number of individual products that can be included in a single order, often within a specific context, such as a Shopify store or an API connection. 

**Example:**
If a customer buys 2 shirts and 1 pair of pants, the order would have 3 line items: one for each shirt and one for the pants. 

**Line Item:**
In business contexts like sales orders, invoices, or quotes, a "line item" is a single entry that details a specific product or service. For example, one line item might be for "2 apples", while another might be for "1 banana".

**Quantity:**
The "quantity" in this context is the numerical value associated with the number of items in that line item. It indicates how many of the specific product or service are being sold.

**Example:**
Imagine a sales order for a customer. One line item might be for "20 boxes of chocolates". In this case, the "quantity" for that line item is 20, representing the number of boxes of chocolates included in that specific line. 

### Shopify does not expose true session data (like visitors, bounce rate, session source) via the Admin API.

Shopify’s REST and GraphQL Admin APIs focus on order, product, and customer data, but analytics data (like sessions, traffic sources, city, etc.) is only available through the Shopify Analytics UI or Shopify Plus APIs (some parts are also available through Shopify’s Analytics exports or third-party integrations like GA4, Mixpanel, or Segment).

✅ **Our Options:**

### 1. Use Shopify Analytics Reports (Manual Export)
- Go to **Shopify Admin → Analytics → Reports → “Sessions by referrer”**
- Export as **CSV**
- Use that for analysis or automation (via app)

### 2. Use Google Analytics / GA4 (Best for Attribution)
You can collect this data externally by:

- Tracking **UTM parameters**, **referrer info**, and **city** via GA
- Connecting Shopify to GA via **pixel** or **GTM**

GA4 can track:

- **Referrer URL**
- **City**
- **Source/Medium**
- **User sessions / visitors**

Then you can extract this using the **Google Analytics Reporting API**.

### 3. Use Shopify’s `webPixel` or ScriptTags to Track
If you need more control:

- Capture session details (**referrer**, **location via IP**, etc.)
- Store them in:
  - **Customer metafields**
  - **Order metafields** or `note_attributes`
- Use **REST API** to query later


| Data Field             | REST API/GraphQL | GA4 / WebPixel | Shopify Admin |
|------------------------|----------|----------------|----------------|
| Referrer source/name   | ❌        | ✅              | ✅ (UI)         |
| Session city           | ❌ (But we can extract it through customer's default address)       | ✅              | ✅ (UI)         |
| Online store visitors  | ❌        | ✅              | ✅ (UI)         |
| Session count          | ❌        | ✅              | ✅ (UI)         |
