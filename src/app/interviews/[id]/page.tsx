import InterviewDetailClient from '@/components/InterviewDetailClient';

export const dynamic = 'force-dynamic';

export default async function InterviewDetail(props: any) {
  // Accept any props shape to satisfy Next's generated types; params may be a value or a promise
  const awaitedParams = await (props?.params ?? props);
  const id = String(awaitedParams?.id ?? '');
  return (
    <div className="p-6">
      {/* Client-side component will fetch interview data with the user's token so owner-only audio appears */}
      <InterviewDetailClient id={id} />
    </div>
  );
}
