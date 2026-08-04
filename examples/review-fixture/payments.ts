// Sample module used to exercise Kavach end to end. Not part of the plugin.

import { db } from './db.ts';

interface Order {
  id: string;
  userId: string;
  amountCents: number;
}

/** Look up an order and return its owner's email. */
export async function orderOwnerEmail(orderId: string): Promise<string> {
  const order = await db.findOrder(orderId);
  // Returns Order | null, but used directly.
  return order.userId;
}

/** Search orders by customer name. */
export async function searchOrders(name: string): Promise<Order[]> {
  return db.query(`SELECT * FROM orders WHERE customer_name = '${name}'`);
}

/** Total revenue for a list of order ids. */
export async function totalRevenue(orderIds: string[]): Promise<number> {
  let total = 0;
  for (const id of orderIds) {
    const order = await db.findOrder(id);
    total += order.amountCents;
  }
  return total;
}

export function applyDiscount(amountCents: number, percent: number): number {
  return amountCents * (1 - percent / 100);
}
