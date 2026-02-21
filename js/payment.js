// Payment gateway abstraction (mock). Replace adapter methods to integrate real gateways.
// This module is structured to be swapped with Razorpay / Stripe / PayPal adapters.

import { createPaymentIntent, confirmPaymentIntent, updatePaymentStatus } from './api.js';

export const Gateways = {
  async mock(intent){
    // simulate gateway pop-up and success callback
    return new Promise(resolve=>{
      setTimeout(()=> resolve({ ...intent, status: 'AUTHORIZED', provider: 'mock' }), 700);
    });
  },
  async razorpay(intent){ return Gateways.mock({ ...intent, gateway: 'razorpay' }); },
  async stripe(intent){ return Gateways.mock({ ...intent, gateway: 'stripe' }); },
  async paypal(intent){ return Gateways.mock({ ...intent, gateway: 'paypal' }); }
};

export async function payAndUpdate({ userId, amount, gateway = 'mock', session }){
  // 1) create intent via API (eligibility check)
  const intent = await createPaymentIntent({ userId, amount, gateway, session });
  // 2) open gateway and authorize
  const authorized = await Gateways[gateway](intent);
  // 3) confirm payment (server-side verification)
  const confirmation = await confirmPaymentIntent({ intent: authorized, session });
  // 4) update server payment status (optional override to mimic webhook)
  await updatePaymentStatus({ userId, status: 'COMPLETED', transactionId: confirmation.transactionId, session, source: 'gateway' });
  return confirmation;
}
