import { expireOverdueOrders } from '../../lib/shop.js';

// Hourly: cancel unpaid orders past their 24-hour payment deadline and return their stock.
export default async () => {
 const count = await expireOverdueOrders();
 console.log(`Expired ${count} unpaid order(s).`);
};

export const config = { schedule: '@hourly' };
