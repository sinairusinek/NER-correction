import { GoogleGenAI } from "@google/genai";

// Initialize the Google GenAI client with the API key from the environment variable directly.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper for exponential backoff
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Robustly extract XML from a string that might contain markdown or conversational text
const extractXml = (text: string): string => {
  // First, remove common markdown wrappers
  let cleaned = text.replace(/^```xml\s*/, '').replace(/^```\s*/, '').replace(/```$/, '').trim();
  
  // Try to find the first tag and last tag
  const firstTagMatch = cleaned.match(/<[a-zA-Z0-9:]+/);
  const lastTagMatch = cleaned.lastIndexOf('>');
  
  if (firstTagMatch && lastTagMatch !== -1) {
    const startIndex = firstTagMatch.index || 0;
    return cleaned.substring(startIndex, lastTagMatch + 1);
  }
  
  return cleaned;
};

async function retryOperation<T>(operation: () => Promise<T>, retries: number = 5, initialDelay: number = 4000): Promise<T> {
  let lastError: any;
  let delay = initialDelay;

  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      const errString = JSON.stringify(error);
      const errorCode = error?.status || error?.code || error?.error?.code || error?.response?.status;
      const errorMessage = error?.message || error?.error?.message || '';
      
      const isRetryable = 
        errorCode === 429 || 
        errorCode === 503 || 
        errorMessage.includes('429') || 
        errorMessage.includes('RESOURCE_EXHAUSTED') ||
        errorMessage.includes('Quota exceeded') ||
        errString.includes('RESOURCE_EXHAUSTED') ||
        errorMessage.includes('503');
      
      if (!isRetryable) {
        throw error;
      }
      
      console.warn(`Attempt ${i + 1} failed with quota/service error. Retrying in ${delay}ms...`);
      await sleep(delay);
      delay *= 2; 
    }
  }
  throw lastError;
}

const COMMON_RULES = `
SPECIFIC ANNOTATION RULES (HEBREW HISTORICAL TEXTS):
1. FORME WORK (<fw>): DO NOT annotate or modify anything inside <fw> tags. Leave them exactly as they are.
2. NAMES OF GOD: Never annotate names of God (e.g., ה׳, אלקים, וכו׳).
3. PREFIXES: The prefix 'ר׳' (Rebbe/Rav) should NOT be part of the annotation. Example: ר׳ <persName>משה</persName>.
4. HOLY CONGREGATION (ק״ק): The prefix 'ק״ק' (Kehilla Kedosha) should NOT be part of the placeName annotation. Example: ק״ק <placeName>סטמבול</placeName>.
5. ISRAEL (ישראל):
   - Reference to Jews/People/Nation (עם ישראל): DO NOT annotate.
   - A single person named Israel: Annotate as <persName>.
   - Land of Israel (ארץ ישראל): Annotate as <placeName>.
   - Note: 'ישראל' alone is rarely a place name unless the context clearly refers to the Land of Israel (ארץ ישראל).
6. MULTI-WORD PLACES: Annotate as a single tag. Example: <placeName>פראנקפורט דמיין</placeName>.
7. NESTED NAMES: For expressions like 'נפתלי מסטמבול', tag the whole as <persName> and the location within as <placeName>.
   Example: <persName>נפתלי מ<placeName>סטמבול</placeName></persName>.
8. NO REDUNDANT TAGS: Never create nested tags of the same type (e.g., <persName><persName>...</persName></persName>). Always flatten redundant identical tags into a single layer.
`;

export const autoAnnotateText = async (text: string): Promise<string> => {
  const prompt = `
    You are a TEI XML expert specializing in Hebrew historical texts.
    Identify Person Names, Place Names, and generic Proper Names.
    Wrap them in <persName>, <placeName>, and <name> tags respectively.
    
    ${COMMON_RULES}

    Rules:
    1. Do NOT change any words, punctuation, or whitespace. Only add tags.
    2. Do NOT add a root element. Return only the tagged text fragment.
    3. If no entities found, return exactly as is.

    Text to annotate:
    "${text}"
  `;

  return retryOperation(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    
    return extractXml(response.text || text);
  });
};

export const reviewXmlFragment = async (xmlFragment: string, isFullDoc: boolean = false): Promise<string> => {
  const prompt = `
    You are a TEI XML Editor specializing in Hebrew historical texts.
    Review annotations and suggest corrections using the <suggestion> tag.
    
    ${COMMON_RULES}

    CATEGORIES OF SUGGESTIONS:
    1. ADDITION (mode="addition"): For entities NOT tagged.
    2. CORRECTION (mode="correction"): For entities with WRONG tags, tags including forbidden prefixes like 'ר׳' or 'ק״ק', or redundant double tags like <persName><persName>...
    3. DELETION (mode="deletion"): For tags applied to non-entities (e.g., names of God, or 'Israel' referring to the people).

    INSTRUCTIONS:
    - DO NOT change the original text content at all.
    - PRESERVE all existing structural tags (<div>, <p>, <fw>) exactly as they are. 
    - VERY IMPORTANT: Do NOT add any tags inside <fw> elements.
    - RETURN THE FULL VALID XML ${isFullDoc ? 'DOCUMENT' : 'FRAGMENT'} with suggestion tags inserted.
    - The <suggestion> tag MUST include: mode ("addition", "correction", "deletion"), type (for add/corr), and reason.
    - IMPORTANT: Return ONLY the XML. No conversational text. No markdown blocks.

    XML to Review:
    ${xmlFragment}
  `;

  return retryOperation(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    
    const result = extractXml(response.text || xmlFragment);
    return result;
  });
};