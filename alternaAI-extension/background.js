chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "generateAltText") {
    (async () => {
      try {
        const OPENAI_API_KEY = "__INSERT_API_HERE__";
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [
              { role: "system", content: "You generate descriptive alt text for images." },
              {
                role: "user",
                content: [
                  { type: "text", text: "Describe this image in a concise alt text format." },
                  { type: "image_url", image_url: { url: request.imageSrc } }
                ]
              }
            ],
            max_tokens: 100
          })
        });

        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error.message || "Failed to generate alt text.");
        }
        
        const data = await response.json();
        sendResponse({ altText: data.choices?.[0]?.message?.content });
      } catch (error) {
        sendResponse({ error: error.message });
      }
    })(); // Self-invoking async function

    return true; // Ensures sendResponse works asynchronously
  }
});
