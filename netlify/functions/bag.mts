import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { cartItems } from '../../db/schema.js';
import { products } from '../../public/catalog.mjs';
export default async (req: Request) => {
 const headers = new Headers({ 'Cache-Control': 'no-store' });
 if (!['GET','POST'].includes(req.method)) return new Response('Method not allowed',{status:405});
 if (req.method === 'POST' && req.headers.get('origin') !== new URL(req.url).origin) return new Response('Forbidden',{status:403});
 const cookie = req.headers.get('cookie')?.match(/(?:^|;\s*)coscolin_bag=([\w-]{36})(?:;|$)/)?.[1];
 const sessionId = cookie || randomUUID();
 if (!cookie) headers.set('Set-Cookie',`coscolin_bag=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
 try {
  if (req.method === 'POST') {
   const body = await req.json();
   if (!body || typeof body !== 'object') return Response.json({error:'Please send a valid bag update.'},{status:400,headers});
   const { productId, quantity } = body;
   if (!products.some(p=>p.id===productId) || !Number.isInteger(quantity) || quantity<0 || quantity>20) return Response.json({error:'Choose a valid item and quantity from 0 to 20.'},{status:400,headers});
   const condition=and(eq(cartItems.sessionId,sessionId),eq(cartItems.productId,productId));
   if (quantity===0) await db.delete(cartItems).where(condition);
   else await db.insert(cartItems).values({sessionId,productId,quantity}).onConflictDoUpdate({target:[cartItems.sessionId,cartItems.productId],set:{quantity,updatedAt:new Date()}});
  }
  const rows=await db.select().from(cartItems).where(eq(cartItems.sessionId,sessionId));
  const items=rows.flatMap(row=>{const product=products.find(p=>p.id===row.productId);return product?[{...product,quantity:row.quantity}]:[]});
  return Response.json({items,total:items.reduce((sum,p)=>sum+p.price*p.quantity,0)},{headers});
 } catch { return Response.json({error:'Your bag could not be updated. Please try again.'},{status:503,headers}); }
};
export const config={path:'/api/bag'};
