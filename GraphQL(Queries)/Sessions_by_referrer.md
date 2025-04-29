# 1. Referrer Source

**Definition:**  
The "referrer source" indicates the broad category or type of channel that directed a user to your online store. Examples include search engines (e.g., Google), social media platforms (e.g., Facebook), direct traffic (e.g., typing the URL), or email campaigns.

**Significance:**  
Understanding the referrer source helps identify which channels drive the most traffic to your store. For instance, if a large portion of your traffic comes from social media, you might double down on social media marketing.

**Shopify Context:**  
In Shopify, this could be derived from the `referringSite` field on an Order object, which provides the URL (e.g., "https://google.com"). You can parse the domain to categorize it as a search engine, social platform, etc.

**Insight:**  
If you see a high volume of traffic from a source like Google, it might indicate strong SEO performance. Conversely, low traffic from social media might suggest a need for better social campaigns.

---

# 2. Referrer Name

**Definition:**  
The "referrer name" is the specific entity or platform within the referrer source. For example, if the referrer source is a search engine, the referrer name might be "Google" or "Bing." If the source is social media, the name might be "Facebook" or "Instagram."

**Significance:**  
This provides granularity to the referrer source, helping you pinpoint the exact platform driving traffic. It’s useful for identifying which specific campaigns or platforms are most effective.

**Shopify Context:**  
Also derived from `referringSite`. For a URL like "https://facebook.com/ad123", the referrer name would be "Facebook." You might need to extract this programmatically by parsing the domain.

**Insight:**  
If "Instagram" is a top referrer name within the social media source, you might focus on Instagram-specific campaigns, like influencer partnerships or Stories ads.

---

# 3. Session City

**Definition:**  
The "session city" refers to the geographic location (city) of the user during their session on your online store. A session typically represents a single visit to your site, starting when a user arrives and ending after a period of inactivity (usually 30 minutes).

**Significance:**  
Knowing the city helps you understand the geographic distribution of your audience. This can inform localized marketing strategies, shipping logistics, or even product offerings (e.g., promoting winter gear to colder regions).

**Shopify Context:**  
Shopify’s API doesn’t directly provide session data, but you can approximate this using the `customer.defaultAddress.city` field on an Order object, assuming the customer’s address reflects their session location. Alternatively, some analytics integrations might provide geolocation data for sessions.

**Insight:**  
If you notice a lot of sessions from a city like New York, you might target that area with city-specific promotions or events, like a pop-up shop.

---

# 4. Online Store Visitors

**Definition:**  
This refers to the number of unique users who visit your online store over a specific period. A "visitor" is typically counted as a unique individual (often tracked via cookies or IP addresses), regardless of how many sessions they initiate.

**Significance:**  
This metric helps gauge the reach of your store—how many distinct people are discovering or engaging with your site. It’s a key indicator of brand visibility and marketing effectiveness.

**Shopify Context:**  
Shopify’s GraphQL Admin API doesn’t directly provide a `visitorCount` field in the 2025-01 version. You might infer this by counting unique customers from orders (`customer.id`) or using Shopify Analytics (outside the API) for precise visitor counts.

**Insight:**  
If your online store visitors are growing month-over-month, your marketing efforts (e.g., SEO, ads) are likely working. A drop might indicate issues like poor ad performance or site accessibility problems.

---

# 5. Sessions

**Definition:**  
A "session" is a single visit to your online store by a user, starting when they arrive and ending after a period of inactivity (typically 30 minutes) or when they leave. One visitor can have multiple sessions if they return later.

**Significance:**  
Sessions measure the total volume of visits, reflecting user engagement and site activity. High sessions with low conversions might indicate issues with user experience or product appeal.

**Shopify Context:**  
The GraphQL Admin API doesn’t directly expose session counts. You might approximate this by counting orders over a time period (e.g., each order as a proxy for a session) or by using Shopify’s built-in analytics dashboard, which provides session data.

**Insight:**  
If sessions are high but sales are low, you might have a conversion issue—perhaps the checkout process is too complex, or product descriptions need improvement.

---

# Putting It Together: Insights for Your Use Case

**Traffic Analysis:**  
Combining referrer source and referrer name helps you understand where your traffic originates. For example, if "Google" (referrer name) under "search engine" (referrer source) drives 50% of your traffic, you might invest more in SEO or Google Ads.

**Geographic Targeting:**  
Session city lets you tailor marketing to specific regions. If many sessions come from Los Angeles, you could run LA-specific promotions or optimize shipping for that area.

**Engagement Metrics:**  
Online store visitors and sessions together show how many people are visiting and how often. If you have 1,000 visitors but 3,000 sessions, your average visitor returns three times—a sign of strong engagement or interest.

**Conversion Optimization:**  
If sessions are high but orders are low, cross-reference with referrer data. Maybe traffic from a specific referrer (e.g., Instagram) isn’t converting well, indicating a mismatch between your ads and audience expectations.



| Metric | Directly Available in API? | Where to Extract | Notes |
|--------|-----------------------------|------------------|-------|
| **Referrer Source** | ❌ (Not directly) | `Order.referringSite` | You can parse the domain (`https://facebook.com`) to categorize into source (`social`, `search`, etc.). |
| **Referrer Name** | ❌ (Not directly) | `Order.referringSite` | Extract domain like `facebook.com`, `google.com`. |
| **Session City** | ❌ (Approximate) | `Order.customer.defaultAddress.city` | Assumes billing/shipping city = session city. Only approximate. |
| **Online Store Visitors** | ❌ (Not available via API) | Shopify Admin Dashboard | Not exposed in Admin API – only in Shopify Analytics (UI or Plus+ APIs). |
| **Sessions** | ❌ (Not available via API) | Shopify Admin Dashboard or Apps | Use analytics dashboard. Some session-like behavior may be approximated by order counts, but not reliable for session-level analytics. |
