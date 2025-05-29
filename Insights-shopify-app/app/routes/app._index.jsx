import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { authenticate } from '../shopify.server'; // Adjust path if needed
import fs from 'fs/promises';
import path from 'path';
import {Card, Layout, List, Text} from "@shopify/polaris"
import React from "react"

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function withRetry(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error.message.includes('Throttled')) {
        const delayMs = baseDelay * 2 ** (attempt - 1); // Exponential backoff
        console.warn(`Throttled on attempt ${attempt}/${maxRetries}, retrying after ${delayMs}ms...`);
        await delay(delayMs);
        lastError = error;
      } else {
        throw error; // Non-throttling errors are not retried
      }
    }
  }
  throw lastError; // Throw the last error if retries are exhausted
}
/**
 * Generate five simple insights from data using OpenAI API
 * @param {string} dataType - Type of data ("products", "inventory", or "orders")
 * @param {Array<Object>} data - Array of data items
 * @returns {Promise<Array<string>>} Array of five insight strings
 */
async function generateInsights(dataType, data) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

  if (!OPENAI_API_KEY) {
    console.error('OpenAI API key is not set in environment variables.');
    return [
      `Failed to generate ${dataType} insights due to missing API key.`,
      'Set the OPENAI_API_KEY environment variable.',
      'Ensure the API key is valid for the OpenAI service.',
      'Verify OpenAI account permissions.',
      'Contact OpenAI support if issues persist.'
    ];
  }

  if (!data || data.length === 0) {
    console.warn(`No ${dataType} data provided for insight generation`);
    return [
      `No ${dataType} data available for analysis.`,
      `Check the data source for valid ${dataType} records.`,
      `Ensure the Shopify API permissions include read_${dataType}.`,
      `Verify the date range or cursor for relevant data.`,
      `Contact support if ${dataType} data issues persist.`
    ];
  }

  let summaryData = {};
  let prompt = '';

  // Summarize data and create prompt based on data type
  if (dataType === 'products') {
    summaryData = {
      totalProducts: data.length,
      trackedInventoryProducts: data.filter(product => product.tracksInventory).length,
      lowInventoryProducts: data.filter(product => product.totalInventory < 10).length,
      uniqueHandles: new Set(data.map(product => product.handle)).size,
      sampleProduct: data[0] || {}
    };
    prompt = `
You are an e-commerce analyst. Based on the following Shopify products data (summarized JSON),
provide exactly five concise, actionable insights to improve product management.
Each insight must be one sentence long and backed by statistics or predictive modeling.
Return the insights as a JSON array of five strings, without markdown, numbered lists, or additional text.
Example: [
  "Restock 'Laila Saari' with sales of $349,993 to prevent stockouts, potentially increasing revenue by 10%.",
  "Promote 'Laptop' with $30,221 in sales through targeted ads to boost sales by 15%.",
  "Reduce inventory of 'Sellon Items' with low sales to free up 20% of storage costs.",
  "Optimize pricing for 'Electronic Parts' with low sales to improve margins by 5-10%.",
  "Focus outreach programs on 'Laila Saari' to increase market share by 12%."
]

Summarized Products Data:
${JSON.stringify(summaryData, null, 2)}
`;
  } else if (dataType === 'inventory') {
    summaryData = {
      totalItems: data.length,
      trackedItems: data.filter(item => item.tracked).length,
      lowStockItems: data.filter(
        item => item.variant?.inventoryQuantity && item.variant.inventoryQuantity < 10
      ).length,
      uniqueSkus: new Set(data.map(item => item.sku)).size,
      sampleItem: data[0] || {}
    };
    prompt = `
You are an e-commerce analyst. Based on the following Shopify inventory data (summarized JSON),
provide exactly five concise, actionable insights to improve inventory management.
Each insight must be one sentence long, start with a verb (e.g., "Restock", "Enable", "Review"), and be backed by statistics or predictive modeling.
Return the insights as a JSON array of five strings, without markdown, numbered lists, or additional text.
Example: [
  "Restock 'Laila Saari' with low stock to increase inventory by 5-10%, boosting profits by 15%.",
  "Increase 'Yellow Saari' inventory by 25-30% to meet demand, potentially yielding 35-40% more revenue.",
  "Reduce 'Sellon Items' inventory with high holdings to improve sales by 15-18%.",
  "Enable tracking for untracked 'Laptop' to optimize stock levels, reducing stockouts by 20%.",
  "Review slow-moving 'Electronic Parts' to cut inventory costs by 10%."
]

Summarized Inventory Data:
${JSON.stringify(summaryData, null, 2)}
`;
  } else if (dataType === 'orders') {
    summaryData = {
      totalOrders: data.length,
      totalRevenue: data.reduce((sum, order) => sum + parseFloat(order.totalPrice || 0), 0).toFixed(2),
      highDiscountOrders: data.filter(order => parseFloat(order.totalDiscounts || 0) > 50).length,
      cancelledOrders: data.filter(order => order.cancelReason !== 'N/A').length,
      sampleOrder: data[0] || {}
    };
    prompt = `
You are an e-commerce analyst. Based on the following Shopify orders data (summarized JSON),
provide exactly five concise, actionable insights to improve order management.
Each insight must be one sentence long, start with a verb (e.g., "Reduce", "Analyze", "Increase"), and be backed by statistics or predictive modeling.
Return the insights as a JSON array of five strings, without markdown, numbered lists, or additional text.
Example: [
  "Increase marketing in Jaipur with high sales to boost revenue by 18-23%.",
  "Launch Instagram campaigns in Patna with 20 new sales to increase profits by 34-39%.",
  "Reduce discounts on high-value orders to improve margins by 10%.",
  "Analyze cancellation reasons for 5% of orders to reduce cancellations by 15%.",
  "Optimize shipping to Hyderabad to improve delivery times, increasing repeat orders by 20%."
]

Summarized Orders Data:
${JSON.stringify(summaryData, null, 2)}
`;
  }

  try {
    // Make a request to the OpenAI API
    const response = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API request failed with status ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    let content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No content returned from OpenAI API.');
    }

    // Preprocess the response to handle different formats
    let insights;
    try {
      // Try parsing as JSON first
      insights = JSON.parse(content);
      if (!Array.isArray(insights) || insights.length !== 5 || !insights.every(i => typeof i === 'string' && i.trim())) {
        throw new Error('Invalid JSON format: Expected an array of 5 non-empty strings.');
      }
    } catch (jsonError) {
      console.warn(`JSON parsing failed for ${dataType}, attempting to extract insights:`, jsonError.message, `Content: ${content}`);

      // Remove markdown code fences if present
      content = content.replace(/```json\n|```/g, '').trim();

      // Try parsing as JSON again after removing markdown
      try {
        insights = JSON.parse(content);
        if (!Array.isArray(insights) || insights.length !== 5 || !insights.every(i => typeof i === 'string' && i.trim())) {
          throw new Error('Invalid JSON format after markdown removal: Expected an array of 5 non-empty strings.');
        }
      } catch (markdownError) {
        // Extract insights from numbered list format
        const lines = content.split('\n').filter(line => line.trim());
        insights = lines
          .filter(line => /^\d+\.\s/.test(line)) // Match lines starting with "1.", "2.", etc.
          .map(line => line.replace(/^\d+\.\s*/, '').trim()) // Remove numbering
          .slice(0, 5); // Take first 5 insights

        if (insights.length !== 5 || !insights.every(i => typeof i === 'string' && i.trim())) {
          throw new Error('Failed to extract 5 valid insights from numbered list.');
        }
      }
    }

    console.log(`Successfully generated ${dataType} insights:`, insights);
    return insights;

  } catch (error) {
    console.error(`Error generating OpenAI insights for ${dataType}:`, error);
    return [
      `Failed to generate ${dataType} insights due to an API error.`,
      'Check the OPENAI_API_KEY configuration.',
      'Ensure the API key is valid for the OpenAI service.',
      'Verify network connectivity to the OpenAI endpoint.',
      'Retry the request or contact OpenAI support.'
    ];
  }
}

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // Resolve the paths to the directories
  const REPORTS_DIR = path.resolve(process.cwd(), 'data', 'reports', shopDomain);
  const INSIGHTS_DIR = path.resolve(process.cwd(), 'data', 'insights', shopDomain);
  const PRODUCTS_FILE = path.join(REPORTS_DIR, 'products.json');
  const INVENTORY_FILE = path.join(REPORTS_DIR, 'inventory.json');
  const ORDERS_FILE = path.join(REPORTS_DIR, 'orders.json');
  const INSIGHTS_FILE = path.join(INSIGHTS_DIR, 'insights.txt');
  const DATA_COMPLETE_FLAG = path.join(REPORTS_DIR, 'data_complete.flag');

  

  // 1. Fetch Products Data
  let allProducts = [];
  let hasNextPageProducts = true;
  let endCursorProducts = "eyJsYXN0X2lkIjoyMDk5NTY0MiwibGFzdF92YWx1ZSI6IjIwOTk1NjQyIn0=";
  const maxProductsPerRequest = 10;
  const delayBetweenRequests = 500;

  const productsQuery = `#graphql
    query ($first: Int!, $after: String) {
      products(first: $first, after: $after) {
        edges {
          node {
            id
            title
            handle
            createdAt
            publishedAt
            totalInventory
            tracksInventory
            updatedAt
            variantsCount {
              count
            }
            variants(first: 20) {
              edges {
                node {
                  id
                  createdAt
                  displayName
                  inventoryQuantity
                  inventoryItem {
                    id
                  }
                  price
                  product {
                    id
                    title
                    totalInventory
                    updatedAt
                    variantsCount {
                      count
                    }
                    variants(first: 20) {
                      edges {
                        node {
                          createdAt
                          displayName
                          id
                          inventoryQuantity
                          inventoryItem {
                            id
                            sku
                            updatedAt
                          }
                        }
                      }
                    }
                  }
                  sku
                  title
                  updatedAt
                }
              }
            }
          }
          cursor
        }
        pageInfo {
          hasNextPage
        }
      }
    }`;

  while (hasNextPageProducts) {
    try {
      const response = await admin.graphql(productsQuery, {
        variables: {
          first: maxProductsPerRequest,
          after: endCursorProducts,
        },
      });

      const data = await response.json();
      if (data.errors) {
        console.error('GraphQL errors (products):', JSON.stringify(data.errors, null, 2));
        throw new Response(`Failed to fetch products: ${JSON.stringify(data.errors)}`, { status: 500 });
      }

      const products = data.data.products.edges.map(edge => ({
        id: edge.node.id,
        title: edge.node.title || 'N/A',
        handle: edge.node.handle || 'N/A',
        createdAt: edge.node.createdAt,
        publishedAt: edge.node.publishedAt || 'N/A',
        totalInventory: edge.node.totalInventory ?? 0,
        tracksInventory: edge.node.tracksInventory ?? false,
        updatedAt: edge.node.updatedAt,
        variantsCount: edge.node.variantsCount?.count ?? 0,
        variants: edge.node.variants.edges.map(variantEdge => ({
          id: variantEdge.node.id,
          createdAt: variantEdge.node.createdAt,
          displayName: variantEdge.node.displayName || 'N/A',
          inventoryQuantity: variantEdge.node.inventoryQuantity ?? 0,
          inventoryItem: {
            id: variantEdge.node.inventoryItem?.id || 'N/A',
          },
          price: variantEdge.node.price || '0.0',
          product: {
            id: variantEdge.node.product?.id || 'N/A',
            title: variantEdge.node.product?.title || 'N/A',
            totalInventory: variantEdge.node.product?.totalInventory ?? 0,
            updatedAt: variantEdge.node.product?.updatedAt || 'N/A',
            variantsCount: variantEdge.node.product?.variantsCount?.count ?? 0,
            variants: variantEdge.node.product?.variants.edges.map(nestedVariantEdge => ({
              createdAt: nestedVariantEdge.node.createdAt,
              displayName: nestedVariantEdge.node.displayName || 'N/A',
              id: nestedVariantEdge.node.id,
              inventoryQuantity: nestedVariantEdge.node.inventoryQuantity ?? 0,
              inventoryItem: {
                id: nestedVariantEdge.node.inventoryItem?.id || 'N/A',
                sku: nestedVariantEdge.node.inventoryItem?.sku || 'N/A',
                updatedAt: nestedVariantEdge.node.inventoryItem?.updatedAt || 'N/A',
              },
            })) || [],
          },
          sku: variantEdge.node.sku || 'N/A',
          title: variantEdge.node.title || 'N/A',
          updatedAt: variantEdge.node.updatedAt,
        })),
      }));

      allProducts = [...allProducts, ...products];
      hasNextPageProducts = data.data.products.pageInfo.hasNextPage;
      endCursorProducts = data.data.products.edges.length > 0 ? data.data.products.edges[data.data.products.edges.length - 1].cursor : null;

      if (hasNextPageProducts) {
        console.log(`Fetched ${products.length} products, waiting ${delayBetweenRequests}ms...`);
        await delay(delayBetweenRequests);
      }
    } catch (error) {
  // Log the error for debugging
  console.error('Caught error fetching products:', JSON.stringify(error, null, 2));

  // Check for abort error safely
  if (error?.name === 'AbortError' || (error?.message && typeof error.message === 'string' && error.message.includes('aborted'))) {
    console.warn('Request aborted (products), retrying after a delay...');
    await delay(2000);
    continue;
  }

  // Handle other errors
  const errorMessage = error?.message || 'Unknown error fetching products';
  console.error('Error fetching products:', errorMessage);
  throw new Response(`Error fetching products: ${errorMessage}`, { status: 500 });
}
  }

  // 2. Fetch Inventory Items Data
  let allInventoryItems = [];
  let hasNextPageInventory = true;
  let endCursorInventory = null;
  const maxItemsPerRequest = 50;

  const inventoryQuery = `#graphql
    query ($first: Int!, $after: String) {
      inventoryItems(first: $first, after: $after) {
        edges {
          node {
            countryCodeOfOrigin
            createdAt
            duplicateSkuCount
            id
            inventoryLevels(first: 20) {
              edges {
                node {
                  id
                  createdAt
                  updatedAt
                }
              }
            }
            tracked
            sku
            locationsCount {
              count
            }
            provinceCodeOfOrigin
            updatedAt
            variant {
              id
              displayName
              inventoryQuantity
              price
              title
              sku
              product {
                id
                mediaCount {
                  count
                }
                feedback {
                  summary
                }
                productType
                title
                totalInventory
                updatedAt
              }
            }
          }
          cursor
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }`;

  while (hasNextPageInventory) {
    try {
      const response = await admin.graphql(inventoryQuery, {
        variables: {
          first: maxItemsPerRequest,
          after: endCursorInventory,
        },
      });

      const data = await response.json();
      if (data.errors) {
        console.error('GraphQL errors (inventory):', JSON.stringify(data.errors, null, 2));
        throw new Response(`Failed to fetch inventory items: ${JSON.stringify(data.errors)}`, { status: 500 });
      }

      const inventoryItems = data.data.inventoryItems.edges.map(edge => ({
        id: edge.node.id,
        countryCodeOfOrigin: edge.node.countryCodeOfOrigin || 'N/A',
        createdAt: edge.node.createdAt,
        duplicateSkuCount: edge.node.duplicateSkuCount ?? 0,
        inventoryLevels: edge.node.inventoryLevels.edges.map(levelEdge => ({
          id: levelEdge.node.id,
          createdAt: levelEdge.node.createdAt,
          updatedAt: levelEdge.node.updatedAt,
        })),
        tracked: edge.node.tracked ?? false,
        sku: edge.node.sku || 'N/A',
        locationsCount: edge.node.locationsCount?.count ?? 0,
        provinceCodeOfOrigin: edge.node.provinceCodeOfOrigin || 'N/A',
        updatedAt: edge.node.updatedAt,
        variant: {
          id: edge.node.variant?.id || 'N/A',
          displayName: edge.node.variant?.displayName || 'N/A',
          inventoryQuantity: edge.node.variant?.inventoryQuantity ?? 0,
          price: edge.node.variant?.price || '0.0',
          title: edge.node.variant?.title || 'N/A',
          sku: edge.node.variant?.sku || 'N/A',
          product: {
            id: edge.node.variant?.product?.id || 'N/A',
            mediaCount: edge.node.variant?.product?.mediaCount?.count ?? 0,
            feedbackSummary: edge.node.variant?.product?.feedback?.summary || 'N/A',
            productType: edge.node.variant?.product?.productType || 'N/A',
            title: edge.node.variant?.product?.title || 'N/A',
            totalInventory: edge.node.variant?.product?.totalInventory ?? 0,
            updatedAt: edge.node.variant?.product?.updatedAt || 'N/A',
          },
        },
      }));

      allInventoryItems = [...allInventoryItems, ...inventoryItems];
      hasNextPageInventory = data.data.inventoryItems.pageInfo.hasNextPage;
      endCursorInventory = data.data.inventoryItems.pageInfo.endCursor;

      if (hasNextPageInventory) {
        console.log(`Fetched ${inventoryItems.length} inventory items, waiting ${delayBetweenRequests}ms...`);
        await delay(delayBetweenRequests);
      }
    } catch (error) {
      if (error.message.includes('aborted')) {
        console.warn('Request aborted (inventory), retrying after a delay...');
        await delay(2000);
        continue;
      }
      console.error('Error fetching inventory items:', error);
      throw new Response(`Error fetching inventory items: ${error.message}`, { status: 500 });
    }
  }

  // 3. Fetch Orders Data
  let allOrders = [];
  let hasNextPageOrders = true;
  let endCursorOrders = null;
  const maxOrdersPerRequest = 50;

  const ordersQuery = `#graphql
    query ($first: Int!, $after: String, $query: String) {
      orders(first: $first, after: $after, sortKey: CREATED_AT, query: $query) {
        edges {
          node {
            id
            name
            createdAt
            updatedAt
            closed
            closedAt
            sourceName
            test
            cancelReason
            cancellation {
              staffNote
            }
            app {
              name
            }
            shippingAddress {
              city
              company
              country
            }
            channelInformation {
              app {
                title
              }
              channelDefinition {
                subChannelName
              }
            }
            paymentGatewayNames
            currentTotalPriceSet {
              shopMoney {
                amount
              }
            }
            originalTotalPriceSet {
              shopMoney {
                amount
              }
            }
            totalDiscountsSet {
              shopMoney {
                amount
              }
            }
            cartDiscountAmountSet {
              shopMoney {
                amount
              }
            }
            totalTaxSet {
              shopMoney {
                amount
              }
            }
            totalPriceSet {
              shopMoney {
                amount
              }
            }
            totalReceivedSet {
              shopMoney {
                amount
              }
            }
            totalRefundedSet {
              shopMoney {
                amount
              }
            }
            refunds {
              totalRefundedSet {
                shopMoney {
                  amount
                }
              }
            }
            additionalFees {
              price {
                shopMoney {
                  amount
                }
              }
            }
            returns(first: 10) {
              edges {
                node {
                  totalQuantity
                }
              }
            }
            lineItems(first: 100) {
              edges {
                node {
                  sku
                  title
                  quantity
                  currentQuantity
                  discountedTotalSet {
                    shopMoney {
                      amount
                    }
                  }
                  originalTotalSet {
                    shopMoney {
                      amount
                    }
                  }
                  duties {
                    price {
                      shopMoney {
                        amount
                      }
                    }
                  }
                  product {
                    title
                    totalInventory
                  }
                  variant {
                    sku
                    inventoryQuantity
                    title
                    product {
                      title
                    }
                  }
                }
              }
            }
          }
          cursor
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }`;

  while (hasNextPageOrders) {
    try {
      const response = await admin.graphql(ordersQuery, {
        variables: {
          first: maxOrdersPerRequest,
          after: endCursorOrders,
          query: "created_at:>=2025-04-01T00:00:00Z created_at:<=2025-04-30T23:59:59Z",
        },
      });

      const data = await response.json();
      if (data.errors) {
        console.error('GraphQL errors (orders):', JSON.stringify(data.errors, null, 2));
        throw new Response(`Failed to fetch orders: ${JSON.stringify(data.errors)}`, { status: 500 });
      }

      const orders = data.data.orders.edges.map(edge => ({
        id: edge.node.id,
        name: edge.node.name || 'N/A',
        createdAt: edge.node.createdAt,
        updatedAt: edge.node.updatedAt,
        closed: edge.node.closed ?? false,
        closedAt: edge.node.closedAt || 'N/A',
        sourceName: edge.node.sourceName || 'N/A',
        test: edge.node.test ?? false,
        cancelReason: edge.node.cancelReason || 'N/A',
        cancellationStaffNote: edge.node.cancellation?.staffNote || 'N/A',
        appName: edge.node.app?.name || 'N/A',
        shippingAddress: {
          city: edge.node.shippingAddress?.city || 'N/A',
          company: edge.node.shippingAddress?.company || 'N/A',
          country: edge.node.shippingAddress?.country || 'N/A',
        },
        channelAppTitle: edge.node.channelInformation?.app?.title || 'N/A',
        channelSubChannelName: edge.node.channelInformation?.channelDefinition?.subChannelName || 'N/A',
        paymentGatewayNames: edge.node.paymentGatewayNames || [],
        currentTotalPrice: edge.node.currentTotalPriceSet?.shopMoney?.amount || '0.0',
        originalTotalPrice: edge.node.originalTotalPriceSet?.shopMoney?.amount || '0.0',
        totalDiscounts: edge.node.totalDiscountsSet?.shopMoney?.amount || '0.0',
        cartDiscountAmount: edge.node.cartDiscountAmountSet?.shopMoney?.amount || '0.0',
        totalTax: edge.node.totalTaxSet?.shopMoney?.amount || '0.0',
        totalPrice: edge.node.totalPriceSet?.shopMoney?.amount || '0.0',
        totalReceived: edge.node.totalReceivedSet?.shopMoney?.amount || '0.0',
        totalRefunded: edge.node.totalRefundedSet?.shopMoney?.amount || '0.0',
        refunds: edge.node.refunds.map(refund => ({
          totalRefunded: refund.totalRefundedSet?.shopMoney?.amount || '0.0',
        })),
        additionalFees: edge.node.additionalFees.map(fee => ({
          amount: fee.price?.shopMoney?.amount || '0.0',
        })),
        returns: edge.node.returns.edges.map(returnEdge => ({
          totalQuantity: returnEdge.node.totalQuantity ?? 0,
        })),
        lineItems: edge.node.lineItems.edges.map(lineEdge => ({
          sku: lineEdge.node.sku || 'N/A',
          title: lineEdge.node.title || 'N/A',
          quantity: lineEdge.node.quantity ?? 0,
          currentQuantity: lineEdge.node.currentQuantity ?? 0,
          discountedTotal: lineEdge.node.discountedTotalSet?.shopMoney?.amount || '0.0',
          originalTotal: lineEdge.node.originalTotalSet?.shopMoney?.amount || '0.0',
          duties: lineEdge.node.duties.map(duty => ({
            amount: duty.price?.shopMoney?.amount || '0.0',
          })),
          productTitle: lineEdge.node.product?.title || 'N/A',
          productTotalInventory: lineEdge.node.product?.totalInventory ?? 0,
          variant: {
            sku: lineEdge.node.variant?.sku || 'N/A',
            inventoryQuantity: lineEdge.node.variant?.inventoryQuantity ?? 0,
            title: lineEdge.node.variant?.title || 'N/A',
            productTitle: lineEdge.node.variant?.product?.title || 'N/A',
          },
        })),
      }));

      allOrders = [...allOrders, ...orders];
      hasNextPageOrders = data.data.orders.pageInfo.hasNextPage;
      endCursorOrders = data.data.orders.pageInfo.endCursor;

      if (hasNextPageOrders) {
        console.log(`Fetched ${orders.length} orders, waiting ${delayBetweenRequests}ms...`);
        await delay(delayBetweenRequests);
      }
    } catch (error) {
      if (error.message.includes('aborted')) {
        console.warn('Request aborted (orders), retrying after a delay...');
        await delay(2000);
        continue;
      }
      console.error('Error fetching orders:', error);
      throw new Response(`Error fetching orders: ${error.message}`, { status: 500 });
    }
  }

  // Ensure the reports directory exists
  try {
    await fs.mkdir(REPORTS_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating reports directory:', error);
    throw new Response('Failed to create reports directory', { status: 500 });
  }

  // Write all data to respective files
  try {
    await Promise.all([
      fs.writeFile(PRODUCTS_FILE, JSON.stringify(allProducts, null, 2)),
      fs.writeFile(INVENTORY_FILE, JSON.stringify(allInventoryItems, null, 2)),
      fs.writeFile(ORDERS_FILE, JSON.stringify(allOrders, null, 2)),
    ]);
  } catch (error) {
    console.error('Error writing data to files:', error);
    throw new Response('Failed to write data to files', { status: 500 });
  }

  // Generate insights for all datasets after data is stored
  const [productsInsights, inventoryInsights, ordersInsights] = await Promise.all([
    generateInsights('products', allProducts),
    generateInsights('inventory', allInventoryItems),
    generateInsights('orders', allOrders),
  ]);

  // Format insights as plain text
  const insightsText = `
Shop Domain: ${shopDomain || 'Not available'}

Products Insights:
${productsInsights.map((insight, index) => `${index + 1}. ${insight}`).join('\n')}

Inventory Insights:
${inventoryInsights.map((insight, index) => `${index + 1}. ${insight}`).join('\n')}

Orders Insights:
${ordersInsights.map((insight, index) => `${index + 1}. ${insight}`).join('\n')}
`;

  // Ensure the insights directory exists
  try {
    await fs.mkdir(INSIGHTS_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating insights directory:', error);
    throw new Response('Failed to create insights directory', { status: 500 });
  }

  // Write insights to insights.txt
  try {
    await fs.writeFile(INSIGHTS_FILE, insightsText);
  } catch (error) {
    console.error('Error writing insights to insights.txt:', error);
    throw new Response('Failed to write insights to file', { status: 500 });
  }

  

  return json({
    shopDomain: shopDomain,
    insightsText: insightsText,
  });
};

export default function Index() {
  const { shopDomain, insightsText } = useLoaderData();

  // Split insightsText into sections
  const sections = insightsText.split('\n\n');
  const shopDomainSection = sections[0]; // "Shop Domain: ..."
  const productsSection = sections[1]?.split('\n').slice(1) || []; // Skip "Products Insights:" header
  const inventorySection = sections[2]?.split('\n').slice(1) || []; // Skip "Inventory Insights:" header
  const ordersSection = sections[3]?.split('\n').slice(1) || []; // Skip "Orders Insights:" header

  return (
    <Card sectioned>
      <Layout>
        <Layout.Section>
          <Text as="h2" variant="headingMd">
            {shopDomainSection}
          </Text>
        </Layout.Section>

        <Layout.Section>
          <Card sectioned>
            <Text as="h3" variant="headingSm">
              Products Insights:
            </Text>
            <List type="number">
              {productsSection.map((insight, index) => (
                <List.Item key={index}>{insight.replace(/^\d+\.\s/, '')}</List.Item>
              ))}
            </List>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card sectioned>
            <Text as="h3" variant="headingSm">
              Inventory Insights:
            </Text>
            <List type="number">
              {inventorySection.map((insight, index) => (
                <List.Item key={index}>{insight.replace(/^\d+\.\s/, '')}</List.Item>
              ))}
            </List>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card sectioned>
            <Text as="h3" variant="headingSm">
              Orders Insights:
            </Text>
            <List type="number">
              {ordersSection.map((insight, index) => (
                <List.Item key={index}>{insight.replace(/^\d+\.\s/, '')}</List.Item>
              ))}
            </List>
          </Card>
        </Layout.Section>
      </Layout>
    </Card>
  );
}
