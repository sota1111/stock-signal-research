export default function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-red-500' : score >= 50 ? 'bg-yellow-500' : 'bg-green-500'
  return <span className={`${color} text-white text-xs px-2 py-1 rounded-full font-bold`}>{score.toFixed(0)}</span>
}
