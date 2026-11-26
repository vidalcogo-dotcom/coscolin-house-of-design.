// Shop settings shared by the website, the app and the server. Edit this file to change payment or delivery details.
export const shop = {
 currency: 'RM',
 paymentWindowHours: 24,
 preorderWeeks: 3,
 contactEmail: 'vidalcogo@gmail.com',
 payeeName: 'Vidal Coscolin Gomez',
 qrName: 'COSCOLIN GOMEZ VIDAL',
 bank: { name: 'Public Bank', accountType: 'Savings account', accountNumber: '4639210526' },
 wise: { bankName: 'Wise', accountNumber: '2005025349' },
 qr: { duitnow: '/images/payment/duitnow-qr.jpg', tng: '/images/payment/tng-qr.jpg', wise: '/images/payment/wise-qr.jpg' },
 delivery: {
  malaysia: { label: 'Malaysia – Lalamove or Grab delivery', note: 'Delivery fee depends on distance. Vidal confirms it by WhatsApp.' },
  overseas: { label: 'Overseas shipping', note: 'International shipping from RM 20. Exact quote by WhatsApp.', fromSen: 2000 },
 },
};
