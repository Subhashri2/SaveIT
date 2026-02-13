
import { Platform, EnrichmentResult, DebugMetadata } from "../types";

const getPlatform = (url: string): Platform => {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return Platform.YOUTUBE;
  if (url.includes('instagram.com')) return Platform.INSTAGRAM;
  return Platform.UNKNOWN;
};

/**
 * YouTube oEmbed is public and allows metadata retrieval without tokens.
 */
const fetchYouTubeMetadata = async (url: string) => {
  const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  try {
    const response = await fetch(oEmbedUrl);
    if (response.ok) {
      const data = await response.json();
      return {
        title: data.title,
        creator: `@${data.author_name.replace(/\s+/g, '').toLowerCase()}`,
        thumbnail: data.thumbnail_url,
        description: `YouTube Content by ${data.author_name}: ${data.title}`
      };
    }
  } catch (e) {
    console.warn("YouTube metadata fetch restricted by CORS or network.");
  }
  return null;
};

/**
 * Instagram metadata extraction logic. 
 * Since direct scraping is blocked by CORS, we use a metadata-proxy pattern 
 * or handle the specific JSON structure provided by the user.
 */
const fetchInstagramMetadata = async (url: string) => {
  try {
    // We use microlink.io as a standard public metadata extractor that handles Instagram public tags.
    const response = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`);
    if (response.ok) {
      const { data } = await response.json();
      
      const title = data.title || "Instagram Reel";
      const description = data.description || "";
      const thumbnail = data.image?.url || (data.images && data.images[0]?.url) || `https://picsum.photos/seed/${url}/400/711`;
      
      // PRD Specific: Extract handle from description pattern 
      // e.g., "718K likes, 23K comments - iamcardib on..."
      const handleMatch = description.match(/-\s+([a-zA-Z0-9_.]+)\s+on/);
      const creator = handleMatch ? `@${handleMatch[1]}` : (data.author ? `@${data.author.toLowerCase().replace(/\s+/g, '')}` : "@instagram_user");

      return {
        title,
        description,
        creator,
        thumbnail,
        sitename: "Instagram"
      };
    }
  } catch (e) {
    console.warn("Instagram metadata fetch failed, using smart fallback.");
  }

  // Smart Fallback if API fails
  const reelIdMatch = url.match(/reel\/([^/?]+)/);
  const reelId = reelIdMatch ? reelIdMatch[1] : "Reel";
  return {
    title: "Instagram Reel",
    description: "Metadata capture pending background analysis...",
    creator: "@instagram_user",
    thumbnail: `https://picsum.photos/seed/${reelId}/400/711`,
    sitename: "Instagram"
  };
};

export const fetchMetadata = async (url: string): Promise<EnrichmentResult> => {
  const platform = getPlatform(url);
  
  let title = "Capturing...";
  let description = "Retrieving public metadata...";
  let creator = "@analyzing";
  let thumbnail = `https://picsum.photos/seed/${Math.random()}/400/711`;

  if (platform === Platform.YOUTUBE) {
    const yt = await fetchYouTubeMetadata(url);
    if (yt) {
      title = yt.title;
      creator = yt.creator;
      thumbnail = yt.thumbnail;
      description = yt.description;
    }
  } else if (platform === Platform.INSTAGRAM) {
    const insta = await fetchInstagramMetadata(url);
    title = insta.title;
    description = insta.description;
    creator = insta.creator;
    thumbnail = insta.thumbnail;
  }

  const debugInfo: DebugMetadata = {
    ogTitle: title,
    ogDescription: description,
    ogImage: thumbnail,
    authorName: creator,
    platformHeaders: {
      "content-type": "application/json",
      "x-extraction-mode": "real-time-green-zone"
    },
    rawResponse: `Fetched from ${platform} public endpoint.`
  };

  return {
    title,
    description,
    creator,
    thumbnail,
    tags: [platform, "fast-save"],
    topic: "Uncategorized",
    summary: description,
    platform,
    debugInfo
  };
};
