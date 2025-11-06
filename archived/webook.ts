import * as PaddleSDK from '@paddle/paddle-node-sdk';
import { Environment } from '@paddle/paddle-node-sdk';
import { NextRequest, NextResponse } from 'next/server';

// Workaround for Paddle SDK module export issues with different bundlers
const PaddleCtor: any = (PaddleSDK as any).Paddle || (PaddleSDK as any).default?.Paddle;

export const paddle: any = new PaddleCtor(process.env.PADDLE_API_KEY!, {
  environment: process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT as Environment,
});

export async function POST(request: NextRequest) {
  const signature = request.headers.get('paddle-signature') ?? '';
  const body = await request.text();

  try {
    if (signature && body) {
      const payload = paddle.webhooks.unmarshal(
        body,
        process.env.PADDLE_WEBHOOK_SECRET_KEY!,
        signature,
      );

      switch (payload.eventType) {
        case 'transaction.completed':
          console.log('Transaction completed:', payload.data);
          // TODO: Save transaction, grant access to user
          break;
          
        case 'subscription.created':
          console.log('Subscription created:', payload.data);
          // TODO: Save subscription to database
          break;
          
        default:
          console.log('Unhandled event:', payload.eventType);
      }
    } else {
      console.error('Signature missing in header.');
      return new NextResponse('Bad Request', { status: 400 });
    }
  } catch (error) {
    console.error('Webhook error:', error);
    return new NextResponse('Webhook processing failed', { status: 500 });
  }

  return new NextResponse('Processed webhook event', { status: 200 });
}