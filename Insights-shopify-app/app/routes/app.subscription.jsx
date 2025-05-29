import { useState, useEffect, useCallback } from 'react';
import { redirect, json, useActionData, Form, useLoaderData } from '@remix-run/react';
import { Page, Layout, Card, Text, List, Toast, Button } from '@shopify/polaris';
import { authenticate, MONTHLY_PLAN } from '../shopify.server';

export const loader = async ({ request }) => {
  const { billing } = await authenticate.admin(request);
  try {
    const billingCheck = await billing.require({
      plans: [MONTHLY_PLAN],
      onFailure: () => null,
    });
    return { hasSubscription: !!billingCheck?.appSubscriptions?.[0] };
  } catch (error) {
    console.error("Error checking subscription in loader:", error);
    return { hasSubscription: false };
  }
};

export const action = async ({ request }) => {
  const formData = await request.formData();
  console.log("FormData entries:", [...formData.entries()]);
  const { _action } = Object.fromEntries(formData);
  console.log("Extracted _action:", _action);

  const { billing } = await authenticate.admin(request);

  if (_action === "startSubscription") {
    try {
      console.log("Checking for existing subscription with billing.require...");
      const billingResponse = await billing.require({
        plans: [MONTHLY_PLAN],
        onFailure: async () => {
          console.log("No existing subscription found, requesting new subscription...");
          console.log("Using returnUrl:", `${process.env.SHOPIFY_APP_URL}/app`);
          const response = await billing.request({
            plan: MONTHLY_PLAN,
            isTest: true,
            returnUrl: `${process.env.SHOPIFY_APP_URL}/app`,
          });
          console.log("Redirecting to confirmation URL:", response.confirmationUrl);
          return redirect(response.confirmationUrl);
        },
      });
      console.log("Existing subscription found:", billingResponse);
      return { alreadySubscribed: true };
    } catch (error) {
      console.error("Error starting subscription:", error);

      // Check if the error is a Response object with a 401 status
      if (error instanceof Response && error.status === 401) {
        const reauthorizeUrl = error.headers.get('X-Shopify-API-Request-Failure-Reauthorize-Url');
        if (reauthorizeUrl) {
          console.log("Reauthorization required, redirecting to:", reauthorizeUrl);
          return redirect(reauthorizeUrl);
        }
        return json({ error: "Unauthorized: Please reauthenticate the app." }, { status: 401 });
      }

      // Handle other errors with specific messages
      let errorMessage = error.message || "Failed to start subscription";
      if (error.message && typeof error.message === 'string') {
        if (error.message.includes("403")) {
          errorMessage = "Billing permissions missing. Please ensure the app has the 'write_own_subscription_contracts' scope and it has been approved.";
        } else if (error.message.includes("invalid plan")) {
          errorMessage = "Invalid plan name. Please check the MONTHLY_PLAN value in shopify.server.js.";
        } else if (error.message.includes("returnUrl")) {
          errorMessage = "Invalid return URL. Please check the SHOPIFY_APP_URL in your .env file.";
        }
      }
      return json({ error: errorMessage }, { status: 500 });
    }
  } else if (_action === "cancelSubscription") {
    try {
      console.log("Checking for active subscription to cancel...");
      const billingCheck = await billing.require({
        plans: [MONTHLY_PLAN],
        onFailure: async () => {
          console.log("No active subscription found to cancel.");
          throw new Error("No active subscription found to cancel");
        },
      });

      const subscription = billingCheck.appSubscriptions[0];
      if (!subscription) {
        console.log("No subscription in billingCheck.appSubscriptions.");
        throw new Error("No active subscription found");
      }

      console.log("Cancelling subscription with ID:", subscription.id);
      await billing.cancel({
        subscriptionId: subscription.id,
        isTest: false,
        prorate: true,
      });
      console.log("Subscription cancelled successfully.");
      return { subscriptionCancelled: true };
    } catch (error) {
      console.error("Error canceling subscription:", error);
      console.error("Error stack:", error.stack);
      return json({ error: error.message || "Failed to cancel subscription" }, { status: 500 });
    }
  }

  return redirect("/app");
};

export default function Index() {
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);
  const [subscriptionCancelled, setSubscriptionCancelled] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [actionType, setActionType] = useState("");
  const actionData = useActionData();
  const { hasSubscription } = useLoaderData();

  useEffect(() => {
    if (actionData?.alreadySubscribed) {
      setAlreadySubscribed(actionData.alreadySubscribed);
    }
    if (actionData?.subscriptionCancelled) {
      setSubscriptionCancelled(actionData.subscriptionCancelled);
    }
    if (actionData?.error) {
      setErrorMessage(actionData.error);
    }
  }, [actionData]);

  const toggleActive = useCallback(() => {
    setSubscriptionCancelled(false);
    setAlreadySubscribed(false);
    setErrorMessage(null);
  }, []);

  return (
    <Page title="Pricing Plan">
      <Layout>
        <Layout.Section>
          <Card>
            <Text as="h1" variant="headingMd" alignment="center">
              Starter
            </Text>
            <List type="bullet">
              <List.Item>Ideal for early stage stores.</List.Item>
            </List>
            <br />
            {hasSubscription ? (
              <>
                <Text as="p" alignment="center">
                  You are currently subscribed to the Starter plan.
                </Text>
                <br />
                <Form method="POST">
                  <input type="hidden" name="_action" value={actionType} />
                  <Button
                    submit
                    type="submit"
                    onClick={() => setActionType("cancelSubscription")}
                    tone="critical"
                  >
                    Cancel Subscription
                  </Button>
                </Form>
              </>
            ) : (
              <Form method="POST">
                <input type="hidden" name="_action" value={actionType} />
                <Button
                  submit
                  type="submit"
                  onClick={() => setActionType("startSubscription")}
                >
                  Start Subscription
                </Button>
              </Form>
            )}
          </Card>
        </Layout.Section>
      </Layout>
      {alreadySubscribed && (
        <Toast content="You have already subscribed." onDismiss={toggleActive} />
      )}
      {subscriptionCancelled && (
        <Toast content="Subscription Cancelled." onDismiss={toggleActive} />
      )}
      {errorMessage && (
        <Toast content={errorMessage} error onDismiss={toggleActive} />
      )}
    </Page>
  );
}