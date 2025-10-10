import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const username = url.searchParams.get("username") || "guest";
  const room = url.searchParams.get("room") || "interview-room";

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (apiKey && apiSecret) {
    try {
      const at = new AccessToken(apiKey, apiSecret, { identity: username });
      at.addGrant({ roomJoin: true, room: room });
      const token = at.toJwt();
      return NextResponse.json({ token });
    } catch (e) {
      console.error("failed to create livekit token", e);
    }
  }

  const mockToken = `MOCK_TOKEN_FOR_${username.toUpperCase()}_IN_${room.toUpperCase()}`;
  return NextResponse.json({ token: mockToken });
}

