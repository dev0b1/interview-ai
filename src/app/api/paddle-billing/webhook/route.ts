import { Environment, Paddle } from '@paddle/paddle-node-sdk';
import { NextRequest, NextResponse } from 'next/server';

export const paddle: any = new Paddle(process.env.PADDLE_API_KEY as string, {
	environment: process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT as Environment,
});

export async function POST(request: NextRequest) {
  const signature = request.headers.get('paddle-signature') ?? '';
  const body = await request.text();

  try {
	if (signature && body) {
	  const payload = paddle.webhooks.unmarshal(
		body,
		process.env.PADDLE_WEBHOOK_SECRET_KEY,
		signature,
	  );

	  switch (payload.eventType) {
		// Handle events
		default:
		  console.log(payload.eventType);
	  }
	} else {
	  console.error('Signature missing in header.');
	}
  } catch (error) {
	console.error(error);
  }

  return new NextResponse('Processed webhook event', { status: 200 });
}
