
import { GoogleGenAI, Type } from "@google/genai";
import { Receipt } from "./types.ts";

export const extractReceiptData = async (base64Image: string): Promise<Partial<Receipt>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [
      {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          { text: "Extract store name, items (name, price, quantity), and the total amount from this receipt. Prices should be numbers." }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          storeName: { type: Type.STRING },
          currency: { type: Type.STRING, description: "Currency symbol or code (e.g. $, €, MXN)" },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                price: { type: Type.NUMBER },
                quantity: { type: Type.NUMBER }
              },
              required: ["name", "price", "quantity"]
            }
          },
          totalOnTicket: { type: Type.NUMBER }
        },
        required: ["storeName", "items", "totalOnTicket"]
      }
    }
  });

  try {
    const text = response.text;
    if (!text) throw new Error("Empty AI response");
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse AI response", e);
    throw new Error("Could not read receipt data accurately.");
  }
};
