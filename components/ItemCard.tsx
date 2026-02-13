
import React from 'react';
import { SavedItem, Platform } from '../types';

interface ItemCardProps {
  item: SavedItem;
  onDelete: (id: string) => void;
  debugMode?: boolean;
}

export const ItemCard: React.FC<ItemCardProps> = ({ item, onDelete, debugMode }) => {
  const isYoutube = item.platform === Platform.YOUTUBE;
  const isEnriching = item.isEnriching;

  const formatEngagement = (score: number) => {
    if (score >= 1000000) return `${(score / 1000000).toFixed(1)}M`;
    if (score >= 1000) return `${(score / 1000).toFixed(0)}K`;
    return score;
  };

  return (
    <div className={`group relative flex flex-col h-full rounded-3xl overflow-hidden bg-white/[0.03] border border-white/[0.08] backdrop-blur-xl hover:border-white/20 transition-all duration-500 hover:shadow-2xl ${isEnriching ? 'opacity-80' : ''}`}>
      {/* Thumbnail */}
      <div className="relative aspect-[4/5] overflow-hidden bg-slate-900/50">
        <img 
          src={item.thumbnail} 
          alt={item.title}
          className={`w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700 ease-out ${isEnriching ? 'animate-pulse scale-110 blur-sm' : ''}`}
          loading="lazy"
        />
        
        {/* Status Pills */}
        <div className="absolute top-2 left-2 flex flex-col gap-1.5 z-20">
          {!isEnriching && (
            <div className="px-2 py-1 rounded-lg glass text-[8px] font-black uppercase tracking-widest text-white shadow-xl flex items-center gap-1">
              <span className="opacity-40">#{item.sequenceNumber}</span>
              <span className="w-1 h-1 bg-white/20 rounded-full"></span>
              {item.topic || 'General'}
            </div>
          )}
          {item.engagementScore > 0 && (
            <div className="px-2 py-1 rounded-lg bg-orange-500/20 border border-orange-500/30 backdrop-blur-md text-[8px] font-black uppercase text-orange-400 flex items-center gap-1 shadow-lg">
              🔥 {formatEngagement(item.engagementScore)}
            </div>
          )}
        </div>

        {/* Action Button */}
        <button 
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(item.id); }}
          className="absolute top-2 right-2 p-2 bg-black/40 hover:bg-red-500/80 backdrop-blur-md border border-white/10 text-white rounded-xl shadow-lg transition-all z-30 opacity-0 group-hover:opacity-100 active:scale-90"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      
      {/* Footer Info */}
      <div className="p-3 flex flex-col gap-1.5">
        <h3 className="text-[11px] font-bold text-white line-clamp-2 leading-tight tracking-tight min-h-[1.5rem]">
          {isEnriching ? "Capturing..." : item.title}
        </h3>
        
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-white/40 font-bold truncate">
            {item.creator}
          </span>
          <span className="text-[8px] text-white/20 font-medium whitespace-nowrap">
            {new Date(item.dateAdded).toLocaleDateString([], { month: 'short', day: 'numeric' })}
          </span>
        </div>
      </div>
    </div>
  );
};
