import { GoogleGenAI } from "@google/genai";

export async function GET() {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return Response.json(
        {
          success: false,
          error: "GEMINI_API_KEY is not configured",
        },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({
      apiKey,
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: "Reply with exactly: VedaAI connection successful",
    });

    return Response.json({
      success: true,
      message: response.text,
    });
  } catch (error) {
    console.error("Gemini test failed:", error);

    return Response.json(
      {
        success: false,
        error: "Gemini API request failed",
      },
      { status: 500 }
    );
  }
}