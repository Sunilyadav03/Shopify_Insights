// // app/components/WaitingPage.jsx
// import { useState, useEffect } from "react";
// import {
//   Layout,
//   Card,
//   Text,
//   ProgressBar,
//   Checkbox,
//   Button,
//   Page,
// } from "@shopify/polaris";
// import { InfoIcon, HomeIcon, ArrowRightIcon } from "@shopify/polaris-icons";

// function WaitingPage() {
//   const [progress, setProgress] = useState(0);
//   const [message, setMessage] = useState("Starting data fetch...");
//   const [checklist, setChecklist] = useState({
//     exploreDashboard: false,
//     learnReports: false,
//     setupSegments: false,
//   });

//   const sessionId = window.__SESSION_ID__ || "default-session-id";

//   useEffect(() => {
//     const pollProgress = async () => {
//       try {
//         const response = await fetch(`/progress?sessionId=${sessionId}`);
//         const data = await response.json();
//         setProgress(data.percentage);
//         setMessage(data.message);
//       } catch (error) {
//         console.error("Error polling progress:", error);
//         setMessage("Error fetching progress...");
//       }
//     };

//     const interval = setInterval(pollProgress, 2000);

//     return () => clearInterval(interval);
//   }, [sessionId]);

//   const toggleChecklistItem = (item) => {
//     setChecklist((prev) => ({
//       ...prev,
//       [item]: !prev[item],
//     }));
//   };

//   return (
//     <Page>
//       <Layout>
//         {/* Header Section */}
//         <Layout.Section>
//           <Text variant="heading2xl" as="h1" alignment="center">
//             You’re Almost There
//           </Text>
//           <Text variant="bodyLg" alignment="center">
//             Your store’s data is being uploaded into the system, but what happens next?
//           </Text>
//           <Text variant="bodySm" color="subdued" alignment="center">
//             Soon, you’ll receive an email confirming a successful upload. Once your data is live, we recommend exploring the three tools below to begin your discovery journey!
//           </Text>
//         </Layout.Section>

//         {/* Progress Bar Section */}
//         <Layout.Section>
//           <Card sectioned>
//             <Text variant="bodyMd">{message}</Text>
//             <ProgressBar progress={progress} size="medium" />
//             <Text variant="bodySm" color="subdued">
//               Progress: {progress}% complete
//             </Text>
//           </Card>
//         </Layout.Section>

//         {/* Next Steps Section */}
//         <Layout.Section>
//           <Layout>
//             <Layout.Section oneThird>
//               <Card title="1. Discover Your Dashboard" sectioned>
//                 <Text variant="bodyMd">Your one-stop-shop for quick insights and data.</Text>
//                 <Text variant="bodyMd">See your most critical data, or customize to fit your needs.</Text>
//               </Card>
//             </Layout.Section>
//             <Layout.Section oneThird>
//               <Card title="2. Running Your First Report" sectioned>
//                 <Text variant="bodyMd">Choose a report from categories including Sales, Customer & Products.</Text>
//                 <Text variant="bodyMd">Apply filters and group your data to maximize your analysis.</Text>
//               </Card>
//             </Layout.Section>
//             <Layout.Section oneThird>
//               <Card title="3. Create and Sync Your Segments" sectioned>
//                 <Text variant="bodyMd">Use preset segments or create your own and implement into your report.</Text>
//                 <Text variant="bodyMd">Integrate your marketing tools to transcend your campaigns.</Text>
//               </Card>
//             </Layout.Section>
//           </Layout>
//         </Layout.Section>

//         {/* Interactive Checklist Section */}
//         <Layout.Section>
//           <Card title="While You Wait: Get Started" sectioned>
//             <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
//               <Checkbox
//                 label="Explore Dashboard Features"
//                 checked={checklist.exploreDashboard}
//                 onChange={() => toggleChecklistItem("exploreDashboard")}
//               />
//               <Checkbox
//                 label="Learn About Reports"
//                 checked={checklist.learnReports}
//                 onChange={() => toggleChecklistItem("learnReports")}
//               />
//               <Checkbox
//                 label="Understand Segment Creation"
//                 checked={checklist.setupSegments}
//                 onChange={() => toggleChecklistItem("setupSegments")}
//               />
//             </div>
//           </Card>
//         </Layout.Section>

//         {/* Footer: Check-In Options */}
//         <Layout.Section>
//           <div style={{ display: "flex", justifyContent: "center", gap: "8px" }}>
//             <Button plain icon={InfoIcon}>Info</Button>
//             <Button plain icon={HomeIcon}>Home</Button>
//             <Button plain icon={ArrowRightIcon}>Next</Button>
//           </div>
//         </Layout.Section>
//       </Layout>
//     </Page>
//   );
// }

// export default WaitingPage;
