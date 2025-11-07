import * as PaddleSDK from '@paddle/paddle-node-sdk';
import { Environment } from '@paddle/paddle-node-sdk';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

const PaddleCtor: any = (PaddleSDK as any).Paddle || (PaddleSDK as any).default?.Paddle;

export const paddle: any = new PaddleCtor(process.env.PADDLE_API_KEY!, {
  environment: process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT as Environment,
});

export async function POST(request: NextRequest) {
  const signature = request.headers.get('paddle-signature') ?? '';
  const body = await request.text();

  try {
    if (!signature || !body) {
      console.error('Signature or body missing');
      return new NextResponse('Bad Request', { status: 400 });
    }

    const payload = paddle.webhooks.unmarshal(
      body,
      process.env.PADDLE_WEBHOOK_SECRET_KEY!,
      signature,
    );

    const data = payload.data || {};
    console.log('Webhook received:', payload.eventType, data.id);

    // Resolve userId from customData (Billing) or email
    const resolveUserId = async () => {
      if (data.custom_data?.userId) return data.custom_data.userId;

      const email = data.customer?.email || data.email;
      if (email) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email)
          .single();
        return (profile as any)?.id;
      }

      return null;
    };

    switch (payload.eventType) {
      case 'transaction.completed': {
        const userId = await resolveUserId();
        if (!userId) {
          console.error('No userId found for transaction:', data.id);
          break;
        }

        const subscriptionId = data.subscription_id;

        const updates: any = {
          pro: true,
          paddle_customer_id: data.customer_id,
        };

        if (data.billing_period?.ends_at) {
          updates.pro_expires_at = data.billing_period.ends_at;
        }

        if (subscriptionId) updates.paddle_subscription_id = subscriptionId;

        const { error } = await supabase
          .from('profiles')
          .update(updates)
          .eq('id', userId);

        if (error) console.error('Failed to update user:', error);
        else console.log('✅ User marked as Pro:', userId);

        // Record payment in payments table for bookkeeping
        try {
          const paymentId = String(data.order_id || data.checkout_id || data.id || `${Date.now()}-${Math.random()}`);
          await supabase.from('payments').upsert({
            id: paymentId,
            user_id: userId,
            provider: 'paddle',
            product_id: data.product_id || null,
            amount: data.amount || null,
            currency: data.currency || null,
            status: data.status || 'completed',
            raw: payload,
          }, { onConflict: 'id' });
        } catch (e) {
          console.warn('Failed to write payment record:', e);
        }

        // If subscription info present, upsert into subscriptions table
        try {
          if (subscriptionId) {
            await supabase.from('subscriptions').upsert({
              id: subscriptionId,
              user_id: userId,
              provider: 'paddle',
              product_id: data.product_id || null,
              status: (data.status || 'active'),
              current_period_start: data.current_billing_period?.starts_at || null,
              current_period_end: data.current_billing_period?.ends_at || data.billing_period?.ends_at || null,
              trial_ends_at: data.trial_ends_at || null,
              raw: payload,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });
          }
        } catch (e) {
          console.warn('Failed to upsert subscription record:', e);
        }
        break;
      }

      case 'subscription.created':
      case 'subscription.activated': {
        const userId = await resolveUserId();
        if (!userId) {
          console.error('No userId found for subscription:', data.id);
          break;
        }

        const { error } = await supabase
          .from('profiles')
          .update({
            pro: true,
            paddle_subscription_id: data.id,
            paddle_customer_id: data.customer_id,
            pro_expires_at: data.current_billing_period?.ends_at || null,
          })
          .eq('id', userId);

        if (error) console.error('Failed to activate subscription:', error);
        else console.log('✅ Subscription activated for user:', userId);

        // Upsert subscription row
        try {
          await supabase.from('subscriptions').upsert({
            id: data.id,
            user_id: userId,
            provider: 'paddle',
            product_id: data.product_id || null,
            status: data.status || 'active',
            current_period_start: data.current_billing_period?.starts_at || null,
            current_period_end: data.current_billing_period?.ends_at || null,
            trial_ends_at: data.trial_ends_at || null,
            raw: payload,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });
        } catch (e) {
          console.warn('Failed to upsert subscription row:', e);
        }
        break;
      }

      case 'subscription.updated': {
        const { error } = await supabase
          .from('profiles')
          .update({
            pro: data.status === 'active',
            pro_expires_at: data.current_billing_period?.ends_at || null,
          })
          .eq('paddle_subscription_id', data.id);

        if (error) console.error('Failed to update subscription:', error);
        else console.log('✅ Subscription updated:', data.id);

        // Update subscriptions table
        try {
          await supabase.from('subscriptions').update({
            status: data.status,
            current_period_start: data.current_billing_period?.starts_at || null,
            current_period_end: data.current_billing_period?.ends_at || null,
            raw: payload,
            updated_at: new Date().toISOString(),
          }).eq('id', data.id);
        } catch (e) {
          console.warn('Failed to update subscriptions table:', e);
        }
        break;
      }

      case 'subscription.canceled':
      case 'subscription.paused': {
        const { error } = await supabase
          .from('profiles')
          .update({
            pro_expires_at: data.current_billing_period?.ends_at || new Date().toISOString(),
          })
          .eq('paddle_subscription_id', data.id);

        if (error) console.error('Failed to cancel subscription:', error);
        else console.log('✅ Subscription canceled:', data.id);

        // Update subscriptions table status
        try {
          await supabase.from('subscriptions').update({
            status: 'canceled',
            current_period_end: data.current_billing_period?.ends_at || new Date().toISOString(),
            raw: payload,
            updated_at: new Date().toISOString(),
          }).eq('id', data.id);
        } catch (e) {
          console.warn('Failed to update subscriptions table on cancel:', e);
        }
        break;
      }

      default:
        console.log('Unhandled event:', payload.eventType);
    }

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return new NextResponse('Error', { status: 500 });
  }
}