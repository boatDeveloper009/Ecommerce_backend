export async function getAIRecommendation(userPrompt, products) {
    const API_KEY = process.env.GEMINI_API;
    const URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${API_KEY}`;

    const geminiPrompt = `
Here is a list of available products:
${JSON.stringify(products, null, 2)}

Based on the following user request, filter and suggest the best matching products:
"${userPrompt}"

Only return the matching products in JSON format.
`;

    const response = await fetch(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: geminiPrompt }] }],
        }),
    });

    const data = await response.json();

    // If Gemini returns error (like 429)
    if (!response.ok) {
        throw new Error(data?.error?.message || "Gemini API error");
    }

    const aiResponseText =
        data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        

    const cleanedText = aiResponseText.replace(/```json|```/g, "").trim();

    if (!cleanedText) {
        throw new Error("AI response is empty or invalid.");
    }

    let parsedProducts;
    try {
        parsedProducts = JSON.parse(cleanedText);
    } catch (error) {
        throw new Error("Failed to parse AI response");
    }

    return parsedProducts;
}
