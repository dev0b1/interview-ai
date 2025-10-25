import InterviewDetailClient from '@/components/InterviewDetailClient';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

export default async function InterviewDetail({ params }: Params) {
  // Next.js requires awaiting params in dynamic routes when using server components
  const awaitedParams = await params;
  const id = String(awaitedParams.id);
  return (
    <div className="p-6">
      {/* Client-side component will fetch interview data with the user's token so owner-only audio appears */}
      <InterviewDetailClient id={id} />
    </div>
  );
}
