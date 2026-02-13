
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { SavedItem, Platform } from './types';
import { ItemCard } from './components/ItemCard';
import { enrichContent, getSearchIntent, SearchIntentResponse } from './services/geminiService';
import { fetchMetadata } from './services/metadataService';
import { backendAPI } from './services/apiService';

const STATIC_FILTERS = [
  { id: 'all', label: 'All', icon: '💎' },
];

const normalizeTopic = (topic: string): string => {
  const t = topic.toLowerCase().trim();
  if (t.includes('finance') || t.includes('invest') || t.includes('money') || t.includes('trading')) return 'Finance';
  if (t.includes('gym') || t.includes('workout') || t.includes('fitness') || t.includes('exercise')) return 'Fitness';
  if (t.includes('recipe') || t.includes('cooking') || t.includes('food') || t.includes('baking') || t.includes('meal')) return 'Food';
  if (t.includes('tech') || t.includes('software') || t.includes('programming') || t.includes('ai') || t.includes('coding')) return 'Tech';
  if (t.includes('travel') || t.includes('vacation') || t.includes('trip') || t.includes('place')) return 'Travel';
  if (t.includes('fashion') || t.includes('style') || t.includes('outfit')) return 'Fashion';
  return topic.charAt(0).toUpperCase() + topic.slice(1).toLowerCase();
};

const App: React.FC = () => {
  const [items, setItems] = useState<SavedItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [isProcessing, setIsProcessing] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [searchIntent, setSearchIntent] = useState<SearchIntentResponse | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshItems = useCallback(async () => {
    const data = await backendAPI.items.getAll();
    setItems(data);
  }, []);

  useEffect(() => {
    refreshItems();
  }, [refreshItems]);

  const dynamicFilters = useMemo(() => {
    const rawTopics = items
      .map(item => item.topic)
      .filter(topic => topic && topic !== 'Uncategorized' && topic !== 'Capturing...' && topic !== 'General');
    const normalizedTopics = Array.from(new Set(rawTopics.map(normalizeTopic)));
    const topicToIcon: Record<string, string> = {
      'Finance': '💰', 'Fitness': '💪', 'Food': '🍳', 'Tech': '💻',
      'Travel': '📍', 'Fashion': '👗', 'Comedy': '😂', 'Inspiration': '✨',
      'Art': '🎨', 'Music': '🎵'
    };
    const dynamic = normalizedTopics.map(topic => ({
      id: topic.toLowerCase(),
      label: topic,
      icon: topicToIcon[topic] || '🔖'
    }));
    return [...STATIC_FILTERS, ...dynamic];
  }, [items]);

  // AI Intent Extraction (Sort by, Limit, etc.)
  useEffect(() => {
    const timer = setTimeout(async () => {
      const queryTrim = searchQuery.trim();
      if (queryTrim.length > 3) {
        try {
          const intent = await getSearchIntent(queryTrim);
          setSearchIntent(intent);
        } catch (e) {
          setSearchIntent(null);
        }
      } else {
        setSearchIntent(null);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filteredItems = useMemo(() => {
    let result = [...items];
    const query = searchQuery.toLowerCase().trim();
    
    // 1. Label/Filter System
    if (activeFilter !== 'all') {
      result = result.filter(item => {
        const normItemTopic = normalizeTopic(item.topic).toLowerCase();
        return normItemTopic === activeFilter.toLowerCase() || 
               item.tags.some(t => normalizeTopic(t).toLowerCase() === activeFilter.toLowerCase());
      });
    }

    // 2. Exact Keyword Matching & Intent Filtering
    if (query) {
      const queryWords = query.split(/\s+/).filter(w => w.length > 0);
      const aiKeywords = searchIntent?.keywords || [];
      const aiTopics = searchIntent?.topics || [];
      
      result = result.filter(item => {
        const searchableText = `${item.title} ${item.topic} ${item.summary} ${item.creator} ${item.tags.join(' ')}`.toLowerCase();
        
        // Exact Keyword matching: All words in query must be present in content
        const matchesAllWords = queryWords.every(word => searchableText.includes(word));
        if (matchesAllWords) return true;
        
        // If query words don't match, check AI-extracted keywords (semantically related)
        if (searchIntent) {
          const matchesAiKeyword = aiKeywords.some(k => searchableText.includes(k.toLowerCase()));
          const matchesAiTopic = aiTopics.some(t => 
            normalizeTopic(item.topic).toLowerCase().includes(t.toLowerCase()) ||
            normalizeTopic(t).toLowerCase() === normalizeTopic(item.topic).toLowerCase()
          );
          return matchesAiKeyword || matchesAiTopic;
        }

        return false;
      });
    }

    // 3. Metadata-Driven Ranking
    const sortMode = searchIntent?.sortBy || 'date-desc';
    
    result.sort((a, b) => {
      switch (sortMode) {
        case 'engagement-desc':
          return (b.engagementScore || 0) - (a.engagementScore || 0);
        case 'sequence-desc':
          return b.sequenceNumber - a.sequenceNumber;
        case 'date-asc':
          return a.dateAdded - b.dateAdded;
        case 'date-desc':
        default:
          return b.dateAdded - a.dateAdded;
      }
    });

    // Final stability sort: if values are equal, newest sequence first
    if (sortMode !== 'date-asc' && sortMode !== 'date-desc') {
        result.sort((a, b) => {
          const primary = sortMode === 'engagement-desc' 
            ? (b.engagementScore || 0) - (a.engagementScore || 0)
            : b.sequenceNumber - a.sequenceNumber;
          
          if (primary === 0) return b.dateAdded - a.dateAdded;
          return primary;
        });
    }

    // 4. Content Limit
    if (searchIntent?.limit && searchIntent.limit > 0) {
      result = result.slice(0, searchIntent.limit);
    }

    return result;
  }, [items, searchQuery, activeFilter, searchIntent]);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = inputValue.trim();
    if (!val) return;
    if (val.startsWith('http')) {
      handleAddContent(val);
      setInputValue('');
    } else {
      // If it's not a link, treat as search query
      setSearchQuery(val);
      setInputValue('');
    }
  };

  const handleAddContent = async (url: string) => {
    const tempId = crypto.randomUUID();
    const now = Date.now();
    
    const skeletonItem: SavedItem = {
      id: tempId, url,
      title: "New Memory", description: "Saving...",
      thumbnail: `https://picsum.photos/seed/${tempId}/400/711`,
      creator: "@capturing", platform: Platform.UNKNOWN,
      tags: ["saving"], topic: "Capturing...", summary: "Capturing details...",
      dateAdded: now, sequenceNumber: -1, engagementScore: 0,
      isEnriching: true
    };

    await backendAPI.items.save(skeletonItem);
    await refreshItems();

    (async () => {
      try {
        const meta = await fetchMetadata(url);
        const metaItem: SavedItem = { ...skeletonItem, ...meta, isEnriching: true };
        await backendAPI.items.save(metaItem);
        await refreshItems();

        const aiData = await enrichContent(url, meta);
        await backendAPI.items.updateEnrichment(tempId, aiData);
        await refreshItems();
      } catch (err) {
        console.error("Enrichment error", err);
        const all = await backendAPI.items.getAll();
        const existing = all.find(i => i.id === tempId);
        if (existing) {
          await backendAPI.items.save({ ...existing, isEnriching: false });
          await refreshItems();
        }
      }
    })();
  };

  const handleDelete = useCallback(async (id: string) => {
    await backendAPI.items.delete(id);
    await refreshItems();
  }, [refreshItems]);

  return (
    <div className="flex flex-col h-screen bg-obsidian text-white font-sans selection:bg-mint/30 overflow-hidden">
      <header className="flex-none bg-obsidian/80 backdrop-blur-xl border-b border-white/5 z-50">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-obsidian font-black text-xl shadow-lg rotate-3">S</div>
            <div>
              <h1 className="text-sm font-extrabold tracking-tight uppercase">SaveIt PRO</h1>
              <p className="text-[9px] text-mint font-bold tracking-widest flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-mint rounded-full animate-pulse"></span>
                METADATA RANKING v3
              </p>
            </div>
          </div>
          <button 
            onClick={() => setDebugMode(!debugMode)}
            className={`p-2 rounded-xl transition-all ${debugMode ? 'text-mint bg-mint/10' : 'text-white/40 hover:bg-white/5'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>
          </button>
        </div>

        {/* Search Engine Interface */}
        <div className="px-4 pb-4">
          <div className="relative group">
            <input
              type="text"
              placeholder="Search e.g. 'last finance reel'..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-10 py-3.5 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:border-mint/50 focus:bg-white/10 transition-all font-medium text-sm placeholder:text-white/20"
            />
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            )}
          </div>
          {searchIntent?.sortBy && searchQuery.length > 3 && (
            <div className="mt-2 flex items-center gap-2 overflow-x-auto no-scrollbar animate-in fade-in slide-in-from-top-1">
              <span className="text-[8px] font-black uppercase text-mint tracking-widest whitespace-nowrap bg-mint/10 px-2 py-0.5 rounded border border-mint/20">
                Ranking: {searchIntent.sortBy.replace('-', ' ')}
              </span>
              {searchIntent.limit && searchIntent.limit > 0 && (
                <span className="text-[8px] font-black uppercase text-violet tracking-widest whitespace-nowrap bg-violet/10 px-2 py-0.5 rounded border border-violet/20">
                  Top: {searchIntent.limit}
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Results Stream */}
      <main className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-6 pb-40" ref={scrollRef}>
        <section className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {dynamicFilters.map((btn) => (
            <button
              key={btn.id}
              onClick={() => setActiveFilter(btn.id)}
              className={`flex-none px-5 py-3 rounded-xl flex items-center gap-2 font-bold text-[11px] transition-all border ${
                activeFilter === btn.id 
                ? 'bg-mint text-obsidian border-mint shadow-lg shadow-mint/20' 
                : 'bg-white/5 border-white/5 text-white/60 hover:border-white/20'
              }`}
            >
              <span className="text-sm">{btn.icon}</span>
              {btn.label}
            </button>
          ))}
        </section>

        <div className="grid grid-cols-2 gap-4">
          {filteredItems.length === 0 ? (
            <div className="col-span-2 py-20 text-center opacity-30 flex flex-col items-center">
              <svg className="w-12 h-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              <p className="font-black uppercase tracking-widest text-[10px]">No results found</p>
            </div>
          ) : (
            filteredItems.map(item => (
              <ItemCard key={item.id} item={item} onDelete={handleDelete} debugMode={debugMode} />
            ))
          )}
        </div>
      </main>

      {/* Input Dock */}
      <footer className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-obsidian via-obsidian/95 to-transparent backdrop-blur-sm z-50">
        <form onSubmit={handleAddSubmit} className="max-w-3xl mx-auto relative flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Paste link to save instantly..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:border-mint/50 focus:bg-white/10 transition-all font-medium text-sm placeholder:text-white/20 shadow-2xl"
            />
          </div>
          <button 
            type="submit"
            className="w-12 h-12 bg-mint text-obsidian rounded-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-xl shadow-mint/20"
          >
            <svg className="w-6 h-6 rotate-45" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
          </button>
        </form>
      </footer>
    </div>
  );
};

export default App;
