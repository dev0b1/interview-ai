import InterviewDetailClient from '@/components/InterviewDetailClient';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

export default function InterviewDetail({ params }: Params) {
  const id = params.id;
  return (
    <div className="p-6">
      {/* Client-side component will fetch interview data with the user's token so owner-only audio appears */}
      <InterviewDetailClient id={id} />
    </div>
  );
}
