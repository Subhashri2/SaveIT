
import { GoogleGenAI, Type } from "@google/genai";
import { Platform, EnrichmentResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface AIEnrichmentResponse {
  tags: string[];
  topic: string;
  summary: string;
  suggestedTitle?: string;
  engagementScore?: number; // Estimated number of likes/views found in text
}

export interface SearchIntentResponse {
  keywords: string[];
  topics: string[];
  intent: string;
  sortBy?: 'date-desc' | 'date-asc' | 'engagement-desc' | 'sequence-desc';
  limit?: number;
}

export const enrichContent = async (url: string, initialMetadata: any): Promise<AIEnrichmentResponse> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze this social media content for my personal memory app 'SaveIt'.
    
    SOURCE URL: ${url}
    REAL METADATA CAPTURED:
    - Title: ${initialMetadata.title}
    - Description: ${initialMetadata.description}
    - Creator: ${initialMetadata.creator}
    - Platform: ${initialMetadata.platform}
    
    TASK:
    1. Categorize into a high-level CANONICAL Topic (Finance, Fitness, Food, Tech, Travel, Fashion, Comedy).
    2. Generate 5-8 semantic Tags.
    3. Provide a 1-sentence Summary.
    4. Suggested descriptive title if the original is generic.
    5. Extract an 'engagementScore' (numerical value). Look for phrases like "718K likes" or "2M views" in the description. Convert to a plain integer (e.g., 718000). If not found, return 0.
    
    STRICT COMPLIANCE: Use the provided REAL METADATA.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } },
          summary: { type: Type.STRING },
          suggestedTitle: { type: Type.STRING },
          engagementScore: { type: Type.NUMBER }
        },
        required: ["topic", "tags", "summary", "engagementScore"]
      }
    }
  });

  try {
    const data = JSON.parse(response.text);
    return data;
  } catch (error) {
    console.error("Gemini Enrichment Parse Error", error);
    throw new Error("AI Enrichment failed.");
  }
};

/**
 * Transform a plain English query into search intent and sorting instructions.
 */
export const getSearchIntent = async (query: string): Promise<SearchIntentResponse> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `The user is searching their memory with: "${query}".
    Extract:
    - keywords: meaningful terms
    - topics: canonical categories
    - sortBy: 'date-desc' (recent/newest), 'engagement-desc' (best/most liked/popular), 'sequence-desc' (last saved), 'date-asc' (oldest).
    - limit: if the user asks for "top 3" or "the last one", set a limit.

    Examples:
    - "last finance reel" -> sortBy: 'sequence-desc', limit: 1, topics: ["Finance"]
    - "most liked recipes" -> sortBy: 'engagement-desc', topics: ["Food"]
    - "tech news from today" -> sortBy: 'date-desc', keywords: ["news"], topics: ["Tech"]`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          topics: { type: Type.ARRAY, items: { type: Type.STRING } },
          sortBy: { type: Type.STRING },
          limit: { type: Type.NUMBER }
        },
        required: ["keywords", "topics"]
      }
    }
  });

  try {
    return JSON.parse(response.text);
  } catch (e) {
    return { keywords: [query], topics: [], intent: query };
  }
};
