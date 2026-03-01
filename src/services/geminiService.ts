
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeDocument = async (fileName: string, base64Data: string, mimeType: string) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { data: base64Data.split(',')[1], mimeType: mimeType } },
          { text: `This is a document named ${fileName}. Provide a very short summary (max 10 words) of what this document appears to be in Bengali.` }
        ]
      }
    });
    return response.text || "সংক্ষিপ্ত বিবরণ পাওয়া যায়নি।";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "নথি বিশ্লেষণে ত্রুটি হয়েছে।";
  }
};
