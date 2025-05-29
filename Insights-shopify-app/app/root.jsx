import { Links, Meta, Outlet, Scripts, useLoaderData } from "@remix-run/react";
import { authenticate } from "./shopify.server";
import "@shopify/polaris/build/esm/styles.css";
import { AppProvider } from "@shopify/polaris";

export const links = () => []; 

export const meta = () => [
  { charset: "utf-8" },
  { title: "Shopify App" },
  { name: "viewport", content: "width=device-width,initial-scale=1" },
];

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return { sessionId: session.id };
};

export default function App() {
  const { sessionId } = useLoaderData();

  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body>
        <AppProvider i18n={{}}>
          <Outlet />
        </AppProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__SESSION_ID__ = ${JSON.stringify(sessionId)};`,
          }}
        />
        <Scripts /> 
      </body>
    </html>
  );
}