'use client';

import { getTagColor, getTagIcon } from '@/lib/bettingRecommendations';
import type { BettingRecommendation } from '@/lib/bettingRecommendations';

interface BettingTagProps {
  recommendation: BettingRecommendation;
  size?: 'sm' | 'md' | 'lg';
  showConfidence?: boolean;
  showReason?: boolean;
}

export function BettingTag({ 
  recommendation, 
  size = 'md',
  showConfidence = true,
  showReason = false 
}: BettingTagProps) {
  const colors = getTagColor(recommendation.type);
  const icon = getTagIcon(recommendation.type);
  
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-1.5'
  };
  
  return (
    <div className="flex flex-col gap-1">
      <div 
        className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${colors.bg} ${colors.text} ${colors.border} ${sizeClasses[size]}`}
        title={recommendation.reason}
      >
        <span>{icon}</span>
        <span>{recommendation.label}</span>
        {showConfidence && (
          <span className="opacity-75">({recommendation.confidence}%)</span>
        )}
      </div>
      
      {showReason && (
        <span className="text-xs text-gray-400">{recommendation.reason}</span>
      )}
    </div>
  );
}

interface BettingTagsListProps {
  recommendations: BettingRecommendation[];
  maxVisible?: number;
  size?: 'sm' | 'md' | 'lg';
}

export function BettingTagsList({ 
  recommendations, 
  maxVisible = 2,
  size = 'sm' 
}: BettingTagsListProps) {
  if (recommendations.length === 0) return null;
  
  const visible = recommendations.slice(0, maxVisible);
  const hidden = recommendations.length - maxVisible;
  
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((rec, idx) => (
        <BettingTag 
          key={`${rec.patternSource}-${idx}`}
          recommendation={rec}
          size={size}
          showConfidence={size !== 'sm'}
        />
      ))}
      
      {hidden > 0 && (
        <span className="text-xs text-gray-400">+{hidden} autres</span>
      )}
    </div>
  );
}

// Tag compact pour les cartes de match
export function CompactBetTag({ recommendation }: { recommendation: BettingRecommendation }) {
  const colors = getTagColor(recommendation.type);
  const icon = getTagIcon(recommendation.type);
  
  return (
    <div 
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.text}`}
      title={`${recommendation.label} - ${recommendation.confidence}% confiance`}
    >
      <span>{icon}</span>
      <span>{recommendation.label}</span>
    </div>
  );
}

export default BettingTag;
