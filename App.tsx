
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { SavedItem, Platform, SearchSuggestion, SearchIndex } from './types';
import { ItemCard } from './components/ItemCard';
import { enrichContent, getSearchIntent, getSearchSuggestions, SearchIntentResponse } from './services/geminiService';
import { fetchMetadata } from './services/metadataService';
import { backendAPI } from './services/apiService';

const STATIC_FILTERS = [
  { id: 'all', label: 'All', icon: '💎' },
];

/**
 * Fuzzy scoring logic (Levenshtein distance based)
 */
const getFuzzyScore = (query: string, text: string): number => {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return 1.0;
  
  // Basic character overlap scoring
  let matches = 0;
  const qArr = q.split('');
  qArr.forEach(char => {
    if (t.includes(char)) matches++;
  });
  
  return matches / q.length;
};

const normalizeTopic = (topic: string): string => {
  if (!topic) return 'General';
  const t = topic.toLowerCase().trim();
  if (t.includes('finance') || t.includes('invest') || t.includes('money') || t.includes('trading') || t.includes('crypto')) return 'Finance';
  if (t.includes('gym') || t.includes('workout') || t.includes('fitness') || t.includes('exercise') || t.includes('health')) return 'Fitness';
  if (t.includes('recipe') || t.includes('cooking') || t.includes('food') || t.includes('baking') || t.includes('meal')) return 'Food';
  if (t.includes('tech') || t.includes('software') || t.includes('programming') || t.includes('ai') || t.includes('coding') || t.includes('dev')) return 'Tech';
  if (t.includes('travel') || t.includes('vacation') || t.includes('trip') || t.includes('place') || t.includes('hotel')) return 'Travel';
  if (t.includes('fashion') || t.includes('style') || t.includes('outfit') || t.includes('clothing')) return 'Fashion';
  if (t.includes('comedy') || t.includes('funny') || t.includes('joke') || t.includes('humor')) return 'Comedy';
  return topic.charAt(0).toUpperCase() + topic.slice(1).toLowerCase();
};

const App: React.FC = () => {
  const [items, setItems] = useState<SavedItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [inputValue, setInputValue] = useState('');
  const [searchIntent, setSearchIntent] = useState<SearchIntentResponse | null>(null);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchBarRef = useRef<HTMLDivElement>(null);

  const refreshItems = useCallback(async () => {
    try {
      const data = await backendAPI.items.getAll();
      setItems(data);
    } catch (e) {
      console.error("Failed to load items", e);
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await backendAPI.items.delete(id);
    await refreshItems();
  }, [refreshItems]);

  useEffect(() => {
    refreshItems();
  }, [refreshItems]);

  // Click outside search to close suggestions
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchBarRef.current && !searchBarRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Build local Inverted Index
  const searchIndex = useMemo(() => {
    const index: SearchIndex = {};
    items.forEach(item => {
      const text = `${item.title} ${item.topic} ${item.creator} ${item.tags.join(' ')}`.toLowerCase();
      const words = Array.from(new Set(text.split(/\W+/).filter(w => w.length > 1)));
      words.forEach(word => {
        if (!index[word]) index[word] = [];
        index[word].push(item.id);
      });
    });
    return index;
  }, [items]);

  // AI Suggestions and Local Predictions
  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setSearchIntent(null);
      return;
    }

    const timer = setTimeout(async () => {
      const qLower = query.toLowerCase();

      // 1. IMPROVED LOCAL SUGGESTIONS
      // Match exact creators or titles starting with query
      const creatorMatches = Array.from(new Set(items.map(i => i.creator)))
        .filter(c => c.toLowerCase().includes(qLower))
        .slice(0, 2)
        .map(c => ({ text: c, type: 'creator' as const, score: 0.9 }));

      const titleMatches = items
        .filter(i => i.title.toLowerCase().startsWith(qLower))
        .slice(0, 2)
        .map(i => ({ text: i.title, type: 'history' as const, score: 0.8 }));

      const wordMatches = Object.keys(searchIndex)
        .filter(word => word.startsWith(qLower))
        .slice(0, 2)
        .map(word => ({ text: word, type: 'history' as const, score: 0.7 }));

      const localSuggestions: SearchSuggestion[] = [...creatorMatches, ...titleMatches, ...wordMatches];

      // 2. GROUNDED AI SUGGESTIONS
      const libraryContext = {
        creators: Array.from(new Set(items.map(i => i.creator))).slice(0, 10),
        topics: Array.from(new Set(items.map(i => i.topic))),
        recentTitles: items.slice(0, 5).map(i => i.title)
      };

      try {
        const aiSugg = await getSearchSuggestions(query, libraryContext);
        // Combine and deduplicate
        const combined = [...localSuggestions, ...aiSugg];
        const unique = Array.from(new Map(combined.map(s => [s.text.toLowerCase(), s])).values());
        setSuggestions(unique.slice(0, 6));
      } catch (e) {
        setSuggestions(localSuggestions);
      }
      
      // 3. Intent extraction
      if (query.length >= 3) {
        try {
          const intent = await getSearchIntent(query);
          setSearchIntent(intent);
        } catch (e) {
          console.warn("Intent extraction failed", e);
        }
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery, searchIndex, items]);

  const dynamicFilters = useMemo(() => {
    const rawTopics = items
      .map(item => item.topic)
      .filter((topic: string): topic is string => !!topic && !['Uncategorized', 'Capturing...', 'General'].includes(topic));
    
    const normalizedTopics: string[] = Array.from(new Set(rawTopics.map(normalizeTopic)));

    const topicToIcon: Record<string, string> = {
      'Finance': '💰', 'Fitness': '💪', 'Food': '🍳', 'Tech': '💻',
      'Travel': '📍', 'Fashion': '👗', 'Comedy': '😂', 'Inspiration': '✨',
      'Art': '🎨', 'Music': '🎵'
    };

    const dynamic = normalizedTopics.map((topic: string) => ({
      id: topic.toLowerCase(),
      label: topic,
      icon: topicToIcon[topic] || '🔖'
    }));

    return [...STATIC_FILTERS, ...dynamic];
  }, [items]);

  const filteredItems = useMemo(() => {
    let result = [...items];
    const query = searchQuery.toLowerCase().trim();

    // 1. Category Label Filtering
    if (activeFilter !== 'all') {
      const target = activeFilter.toLowerCase();
      result = result.filter(item => {
        const normTopic = normalizeTopic(item.topic).toLowerCase();
        return normTopic === target || 
               item.tags.some(tag => normalizeTopic(tag).toLowerCase() === target);
      });
    }

    // 2. Intelligent Ranking & Filtering
    if (query) {
      const queryWords = query.split(/\s+/).filter(w => w.length > 0);
      
      const scoredResults = result.map(item => {
        const searchableContent = `${item.title} ${item.topic} ${item.summary} ${item.creator} ${item.tags.join(' ')}`.toLowerCase();
        
        // Exact keyword score
        const exactMatchCount = queryWords.filter(word => searchableContent.includes(word)).length;
        const exactMatchScore = exactMatchCount / queryWords.length;

        // Fuzzy matching score (typo tolerance)
        const fuzzyScore = Math.max(...queryWords.map(word => getFuzzyScore(word, searchableContent)));

        // Semantic Match via Intent
        let semanticScore = 0;
        if (searchIntent) {
          const matchesAiKeyword = (searchIntent.keywords || []).some(k => searchableContent.includes(k.toLowerCase()));
          const matchesAiTopic = (searchIntent.topics || []).some(t => normalizeTopic(item.topic).toLowerCase() === normalizeTopic(t).toLowerCase());
          if (matchesAiKeyword || matchesAiTopic) semanticScore = 1.0;
        }

        const totalScore = (exactMatchScore * 0.6) + (fuzzyScore * 0.2) + (semanticScore * 0.2);
        return { item, score: totalScore };
      });

      // Filter by threshold and sort by relevance score
      result = scoredResults
        .filter(res => res.score > 0.1) // Lowered slightly to ensure grounded matches appear
        .sort((a, b) => b.score - a.score)
        .map(res => res.item);
    } else {
      // Default Sort: newest sequence first
      result.sort((a, b) => b.sequenceNumber - a.sequenceNumber);
    }

    // 3. Metadata Secondary Sorting
    const sortMode = searchIntent?.sortBy;
    if (sortMode && sortMode !== 'date-desc') {
      result.sort((a, b) => {
        switch (sortMode) {
          case 'engagement-desc':
            return (b.engagementScore || 0) - (a.engagementScore || 0);
          case 'sequence-desc':
            return b.sequenceNumber - a.sequenceNumber;
          case 'date-asc':
            return a.dateAdded - b.dateAdded;
          default:
            return 0;
        }
      });
    }

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
      setSearchQuery(val);
      setInputValue('');
      setIsSearchFocused(false);
    }
  };

  const handleAddContent = async (url: string) => {
    const tempId = crypto.randomUUID();
    const now = Date.now();
    
    const skeletonItem: SavedItem = {
      id: tempId, url,
      title: "Saving to Memory...", description: "Capturing public metadata...",
      thumbnail: `https://picsum.photos/seed/${tempId}/400/711`,
      creator: "@analyzing", platform: Platform.UNKNOWN,
      tags: ["capturing"], topic: "Capturing...", summary: "Extracting details...",
      dateAdded: now, sequenceNumber: -1, engagementScore: 0,
      isEnriching: true
    };

    await backendAPI.items.save(skeletonItem);
    await refreshItems();

    (async () => {
      try {
        const meta = await fetchMetadata(url);
        await backendAPI.items.save({ ...skeletonItem, ...meta, isEnriching: true });
        await refreshItems();

        const aiData = await enrichContent(url, meta);
        await backendAPI.items.updateEnrichment(tempId, aiData);
        await refreshItems();
      } catch (err) {
        const currentItems = await backendAPI.items.getAll();
        const found = currentItems.find(i => i.id === tempId);
        if (found) {
          await backendAPI.items.save({ ...found, isEnriching: false });
          await refreshItems();
        }
      }
    })();
  };

  return (
    <div className="flex flex-col h-screen bg-obsidian text-white font-sans selection:bg-mint/30 overflow-hidden">
      <header className="flex-none bg-obsidian/80 backdrop-blur-xl border-b border-white/5 z-50">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-obsidian font-black text-xl shadow-lg rotate-3">S</div>
            <div>
              <h1 className="text-sm font-extrabold tracking-tight uppercase">SaveIt</h1>
              <p className="text-[9px] text-mint font-bold tracking-widest flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-mint rounded-full animate-pulse"></span>
                INTELLIGENT SEARCH PRO
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

        {/* Intelligent Search Input */}
        <div className="px-4 pb-4 relative" ref={searchBarRef}>
          <div className="relative group">
            <input
              type="text"
              placeholder="Search your library..."
              value={searchQuery}
              onFocus={() => setIsSearchFocused(true)}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-11 pr-10 py-4 bg-white/5 border rounded-2xl focus:outline-none transition-all font-medium text-sm placeholder:text-white/20 ${isSearchFocused ? 'border-mint/50 bg-white/10 ring-4 ring-mint/5' : 'border-white/10'}`}
            />
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setSuggestions([]); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg></button>
            )}
          </div>
          
          {/* Autocomplete / Grounded Suggestions Dropdown */}
          {isSearchFocused && suggestions.length > 0 && (
            <div className="absolute left-4 right-4 top-full mt-2 bg-obsidian border border-white/10 rounded-2xl shadow-2xl z-[100] overflow-hidden backdrop-blur-2xl">
              <div className="p-2">
                <p className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/20">From your memory</p>
                {suggestions.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => { setSearchQuery(s.text); setIsSearchFocused(false); }}
                    className="w-full text-left px-3 py-2.5 hover:bg-white/5 rounded-xl flex items-center gap-3 transition-colors group"
                  >
                    <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 group-hover:bg-mint/10 group-hover:text-mint transition-colors text-xs">
                      {s.type === 'topic' ? '📁' : s.type === 'creator' ? '👤' : s.type === 'ai' ? '✨' : '🕒'}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white/80 group-hover:text-white truncate max-w-[200px]">{s.text}</p>
                      <p className="text-[9px] font-bold uppercase tracking-tight text-white/20">{s.type}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(searchIntent?.sortBy || activeFilter !== 'all') && searchQuery.length >= 2 && (
            <div className="mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar animate-in fade-in slide-in-from-top-1">
              {searchIntent?.sortBy && (
                <span className="text-[9px] font-black uppercase text-mint tracking-widest px-2 py-1 bg-mint/10 rounded-lg border border-mint/20 whitespace-nowrap">
                  Ranked: {searchIntent.sortBy.replace('-', ' ')}
                </span>
              )}
              {activeFilter !== 'all' && (
                <button 
                  onClick={() => setActiveFilter('all')}
                  className="text-[9px] font-black uppercase text-white/40 hover:text-white tracking-widest px-2 py-1 bg-white/5 rounded-lg border border-white/10 whitespace-nowrap flex items-center gap-1"
                >
                  In {activeFilter} <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-6 pb-40" ref={scrollRef}>
        <section className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
          {dynamicFilters.map((btn) => (
            <button
              key={btn.id}
              onClick={() => setActiveFilter(btn.id)}
              className={`flex-none px-6 py-3.5 rounded-2xl flex items-center gap-2.5 font-bold text-[11px] transition-all border ${
                activeFilter === btn.id 
                ? 'bg-mint text-obsidian border-mint shadow-lg shadow-mint/20' 
                : 'bg-white/5 border-white/5 text-white/60 hover:border-white/20'
              }`}
            >
              <span className="text-base">{btn.icon}</span>
              {btn.label}
            </button>
          ))}
        </section>

        <div className="grid grid-cols-2 gap-4">
          {filteredItems.length === 0 ? (
            <div className="col-span-2 py-32 text-center flex flex-col items-center opacity-30">
              <svg className="w-12 h-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              <p className="font-black uppercase tracking-widest text-[10px]">No matches found</p>
              {activeFilter !== 'all' && (
                <button onClick={() => setActiveFilter('all')} className="mt-4 text-[9px] font-bold text-mint uppercase tracking-widest underline decoration-2 underline-offset-4">Search All Categories</button>
              )}
            </div>
          ) : (
            filteredItems.map(item => (
              <ItemCard 
                key={item.id} 
                item={item} 
                onDelete={handleDelete} 
                debugMode={debugMode} 
              />
            ))
          )}
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-obsidian via-obsidian/95 to-transparent backdrop-blur-md z-50">
        <form onSubmit={handleAddSubmit} className="max-w-3xl mx-auto relative flex items-center gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Paste link to save to memory..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="w-full px-6 py-4.5 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:border-mint/50 focus:bg-white/10 transition-all font-medium text-sm placeholder:text-white/20 shadow-2xl"
            />
          </div>
          <button 
            type="submit"
            className="w-14 h-14 bg-mint text-obsidian rounded-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl shadow-mint/20"
          >
            <svg className="w-7 h-7 rotate-45" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
          </button>
        </form>
      </footer>
    </div>
  );
};

export default App;
