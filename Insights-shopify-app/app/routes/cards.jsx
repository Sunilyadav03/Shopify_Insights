// import { Card, CardContent } from "@/components/ui/card";
// import { useLoaderData } from "@remix-run/react";

// export async function loader() {
//   return {
//     monthSales: 1463745,
//     quarterSales: 2141442,
//     yearSales: 7523402,
//     monthLabel: "in May, 2025",
//     quarterLabel: "in Q2, 2025",
//     yearLabel: "in 2025",
//     graphData: {
//       month: [
//         { date: "2025-05-08", value: 1341230.59 },
//       ],
//       quarter: [
//         { date: "2025-04-15", value: 2141442 },
//       ],
//       year: [
//         { date: "2025-03-01", value: 7523402 },
//       ],
//     },
//   };
// }

// export default function Cards() {
//   const { monthSales, quarterSales, yearSales, monthLabel, quarterLabel, yearLabel } = useLoaderData();

//   return (
//     <div className="p-6">
//       <h1 className="text-2xl font-bold mb-6">Sales Forecast</h1>
//       <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
//         <ForecastCard
//           title="Month Sales Forecast"
//           value={monthSales}
//           label={monthLabel}
//         />
//         <ForecastCard
//           title="Quarter Sales Forecast"
//           value={quarterSales}
//           label={quarterLabel}
//         />
//         <ForecastCard
//           title="Year Sales Forecast"
//           value={yearSales}
//           label={yearLabel}
//         />
//       </div>
//     </div>
//   );
// }

// function ForecastCard({ title, value, label }) {
//   return (
//     <Card className="rounded-2xl shadow-md border hover:shadow-lg transition-shadow duration-300">
//       <CardContent className="p-4">
//         <h2 className="text-gray-700 font-medium mb-2">{title}</h2>
//         <div className="text-3xl font-bold text-black mb-1">₹{value.toLocaleString()}</div>
//         <div className="text-sm text-gray-500">{label}</div>
//         <div className="mt-4 h-8 bg-gradient-to-r from-blue-100 to-white rounded-full relative overflow-hidden">
//           {/* Simulated graph line */}
//           <div className="absolute left-1/4 top-2 h-4 w-1 bg-blue-600 rounded-full" />
//         </div>
//       </CardContent>
//     </Card>
//   );
// }
