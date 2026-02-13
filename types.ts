
export enum Platform {
  INSTAGRAM = 'instagram',
  YOUTUBE = 'youtube',
  UNKNOWN = 'unknown'
}

export interface DebugMetadata {
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  authorName: string;
  platformHeaders: Record<string, string>;
  rawResponse: string;
}

export interface SavedItem {
  id: string;
  url: string;
  title: string;
  description: string;
  thumbnail: string;
  creator: string;
  platform: Platform;
  tags: string[];
  topic: string;
  summary: string;
  dateAdded: number;
  sequenceNumber: number; // For "last saved", "first saved" queries
  engagementScore: number; // Extracted likes/views for ranking
  debugInfo?: DebugMetadata;
  isEnriching?: boolean;
}

export interface EnrichmentResult {
  title: string;
  description: string;
  creator: string;
  thumbnail: string;
  tags: string[];
  topic: string;
  summary: string;
  platform: Platform;
  debugInfo: DebugMetadata;
}
