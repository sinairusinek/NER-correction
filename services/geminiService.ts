import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

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

export const autoAnnotateText = async (text: string): Promise<string> => {
  if (!apiKey) {
    throw new Error("API Key is missing");
  }

  const prompt = `
    You are a TEI XML expert.
    I will provide a text snippet. Identify Person Names, Place Names, and generic Proper Names.
    Wrap them in <persName>, <placeName>, and <name> tags respectively.
    
    Rules:
    1. Do NOT change any words, punctuation, or whitespace. Only add tags.
    2. Do NOT add a root element. Return only the tagged text fragment.
    3. If no entities found, return exactly as is.
    4. Use 'persName' for people, 'placeName' for locations, 'name' for others.

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
  if (!apiKey) {
    throw new Error("API Key is missing");
  }

  const prompt = `
    You are a TEI XML Editor.
    I will provide an XML ${isFullDoc ? 'document' : 'fragment'}.
    Review annotations and suggest corrections using the <suggestion> tag.
    
    CATEGORIES OF SUGGESTIONS:
    1. ADDITION (mode="addition"): For entities NOT tagged.
       Example: <suggestion mode="addition" type="placeName" reason="Paris is a city">Paris</suggestion>
    2. CORRECTION (mode="correction"): For entities with WRONG tags.
       Example: <suggestion mode="correction" type="persName" reason="John is a person"><placeName>John</placeName></suggestion>
    3. DELETION (mode="deletion"): For tags applied to non-entities.
       Example: <suggestion mode="deletion" reason="Not a name"><name>The</name></suggestion>

    INSTRUCTIONS:
    - DO NOT change the original text content at all.
    - PRESERVE all existing structural tags exactly as they are.
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