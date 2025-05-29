// import { getProgress } from "../utils/progress";

// export const loader = async ({ request }) => {
//   const url = new URL(request.url);
//   const sessionId = url.searchParams.get("sessionId");
//   if (!sessionId) {
//     throw new Response("Session ID required", { status: 400 });
//   }

//   const progress = getProgress(sessionId);
//   const percentage = Math.round((progress.currentStep / progress.totalSteps) * 100);

//   return {
//     percentage,
//     message: progress.message,
//   };
// };