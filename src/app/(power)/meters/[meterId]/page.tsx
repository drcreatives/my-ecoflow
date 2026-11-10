import MeterDetail from '@/components/meters/MeterDetail'
import type { Id } from '../../../../../convex/_generated/dataModel'

export default async function MeterPage({ params }: { params: Promise<{ meterId: string }> }) {
  const { meterId } = await params
  return <MeterDetail key={meterId} meterId={meterId as Id<'mockMeters'>} />
}
