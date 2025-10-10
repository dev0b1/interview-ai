import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  try {
    // Expect Authorization header with a Supabase access token
    const authHeader = req.headers.get('authorization') || '';
    const tokenRaw = authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '').trim() : authHeader.trim();
    if (!tokenRaw) return NextResponse.json({ error: 'missing auth token' }, { status: 401 });

    // Verify the user with Supabase
    const { data: userData, error: userErr } = await supabase.auth.getUser(tokenRaw);
    if (userErr || !userData?.user) {
      console.error('auth verification failed', userErr);
      return NextResponse.json({ error: 'invalid token' }, { status: 401 });
    }
    const user = userData.user;

    // sync public users table with auth user
    try {
      await supabase.from('users').upsert({ id: user.id, email: user.email, user_metadata: JSON.stringify(user.user_metadata || {}) }, { returning: 'minimal' });
  } catch {
    console.warn('users upsert failed');
  }

  const form = await req.formData();
  const interviewId = form.get('interviewId');
  const file = form.get('file');
  if (!interviewId || !file) return NextResponse.json({ error: 'missing fields' }, { status: 400 });

  // Save to Supabase Storage bucket 'interviews' under a per-user private path
  // form file should be a Blob-like object with arrayBuffer()
  // Use a safe cast to unknown and then call arrayBuffer if available
  const maybeFile = file as unknown as { arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof maybeFile.arrayBuffer !== 'function') return NextResponse.json({ error: 'invalid file' }, { status: 400 });
  const arrayBuffer = await maybeFile.arrayBuffer();
  // Buffer is available in Node; convert ArrayBuffer to Buffer safely
  const buf = Buffer.from(arrayBuffer);
  const uid = (user && user.id) ? user.id : 'anonymous';
  const path = `interviews/${uid}/${interviewId}.webm`;

    const { data: uploadData, error: uploadErr } = await supabase.storage.from('interviews').upload(path, buf, { contentType: 'audio/webm', upsert: true });
    if (uploadErr) {
      console.error('storage upload failed', uploadErr);
      throw uploadErr;
    }

    // create a signed URL valid for 24 hours
    const expires = 60 * 60 * 24; // seconds
    const { data: signedData, error: signedErr } = await supabase.storage.from('interviews').createSignedUrl(path, expires);
  if (signedErr) {
    console.warn('createSignedUrl failed');
  }

    // also upsert the audio URL into the interviews table for server-side reference
    try {
      await supabase.from('interviews').upsert({ id: interviewId, audio_path: path, audio_signed_url: signedData?.signedUrl ?? null }, { returning: 'minimal' });
  } catch {
    console.warn('upsert interview with audio failed');
  }

    return NextResponse.json({ ok: true, path, signedUrl: signedData?.signedUrl ?? null, uploadData });
  } catch {
    console.error('audio upload route error');
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
