// Re-export the main Paddle webhook handler to keep a single canonical handler
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabaseClient';

function verifySignature(raw: string, signatureHeader: string | null) {
	const secret = process.env.PADDLE_WEBHOOK_SECRET || '';
	if (!secret || !signatureHeader) return false;

	const parts = signatureHeader.split(';').map(s => s.trim());
	const tsPart = parts.find(p => p.startsWith('t='));
	const h1Part = parts.find(p => p.startsWith('h1='));
  
	if (!tsPart || !h1Part) return false;
  
	const ts = tsPart.split('=')[1];
	const h1 = h1Part.split('=')[1];
	const signed = `${ts}:${raw}`;
	const expected = crypto.createHmac('sha256', secret).update(signed).digest('hex');
  
	try {
		return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(h1, 'hex'));
	} catch {
		return false;
	}
}

export async function POST(req: NextRequest) {
	try {
		const raw = await req.text();
		const sig = req.headers.get('paddle-signature');

		// Verify signature in production
		if (process.env.PADDLE_WEBHOOK_SECRET && !verifySignature(raw, sig)) {
			console.warn('❌ Invalid webhook signature');
			return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
		}

		const event = JSON.parse(raw);
		const eventType = event.event_type || event.type;
		const data = event.data || event;

		console.log('🔔 Paddle webhook received:', eventType);

		// Helper: Get user ID from custom data
		const getUserId = (obj: any) => {
			const custom = obj?.custom_data || obj?.customData;
			return custom?.userId || custom?.user_id || null;
		};

		// Helper: Calculate expiry date
		const getExpiryDate = () => {
			const days = Number(process.env.NEXT_PUBLIC_PRO_DURATION_DAYS || '365');
			const date = new Date();
			date.setDate(date.getDate() + days);
			return date.toISOString();
		};

		// Handle different event types
		switch (eventType) {
			// ✅ Payment successful - grant Pro access
			case 'transaction.completed':
			case 'transaction.payment_succeeded': {
				const transaction = data.transaction || data;
				const userId = getUserId(transaction);
				const subscriptionId = transaction.subscription_id || transaction.subscription?.id;

				if (!userId) {
					console.warn('⚠️ No userId found in transaction');
					break;
				}

				// Grant Pro access
				const expiresAt = getExpiryDate();
				await supabase
					.from('profiles')
					.upsert({ 
						id: userId, 
						pro: true, 
						pro_expires_at: expiresAt 
					});

				// Save subscription if it's recurring
				if (subscriptionId) {
					await supabase
						.from('subscriptions')
						.upsert({
							id: subscriptionId,
							user_id: userId,
							subscription_id: subscriptionId,
							status: 'active',
							provider: 'paddle',
						});
				}

				console.log(`✅ Pro access granted to user: ${userId}`);
				break;
			}

			// 🔄 Subscription created or updated
			case 'subscription.created':
			case 'subscription.updated': {
				const subscription = data.subscription || data;
				const userId = getUserId(subscription);
				const subscriptionId = subscription.id;
				const status = subscription.status;

				if (!userId || !subscriptionId) {
					console.warn('⚠️ Missing userId or subscriptionId');
					break;
				}

				// Update subscription record
				await supabase
					.from('subscriptions')
					.upsert({
						id: subscriptionId,
						user_id: userId,
						subscription_id: subscriptionId,
						status: status,
						provider: 'paddle',
					});

				// Grant Pro if subscription is active
				if (status === 'active') {
					const expiresAt = getExpiryDate();
					await supabase
						.from('profiles')
						.upsert({ 
							id: userId, 
							pro: true, 
							pro_expires_at: expiresAt 
						});
					console.log(`✅ Pro renewed for user: ${userId}`);
				}
				break;
			}

			// 🚫 Subscription canceled
			case 'subscription.canceled': {
				const subscription = data.subscription || data;
				const userId = getUserId(subscription);
				const subscriptionId = subscription.id;
				const scheduledChange = subscription.scheduled_change;
				const cancelAt = scheduledChange?.effective_at;

				if (!userId || !subscriptionId) {
					console.warn('⚠️ Missing userId or subscriptionId');
					break;
				}

				// Update subscription status
				await supabase
					.from('subscriptions')
					.update({ status: 'canceled' })
					.eq('subscription_id', subscriptionId);

				// If immediate cancellation, revoke Pro now
				if (!cancelAt) {
					await supabase
						.from('profiles')
						.update({ 
							pro: false, 
							pro_expires_at: new Date().toISOString() 
						})
						.eq('id', userId);
					console.log(`❌ Pro access revoked for user: ${userId}`);
				} else {
					// Keep Pro until end of billing period
					console.log(`⏳ Pro scheduled to end at ${cancelAt} for user: ${userId}`);
				}
				break;
			}

			// ⚠️ Payment failed
			case 'transaction.payment_failed': {
				const transaction = data.transaction || data;
				const userId = getUserId(transaction);
				const subscriptionId = transaction.subscription_id;

				if (subscriptionId) {
					await supabase
						.from('subscriptions')
						.update({ status: 'past_due' })
						.eq('subscription_id', subscriptionId);
				}

				console.warn(`⚠️ Payment failed for user: ${userId}`);
				break;
			}

			default:
				console.log(`ℹ️ Unhandled event type: ${eventType}`);
		}

		return NextResponse.json({ received: true });
	} catch (err: any) {
		console.error('💥 Webhook error:', err.message);
		return NextResponse.json({ error: err.message }, { status: 500 });
	}
}
