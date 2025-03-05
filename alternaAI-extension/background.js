chrome.runtime.onInstalled.addListener(() => {
  // Set up side panel
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Set default preference for using context
  chrome.storage.local.get("useContext", (result) => {
    if (!result.hasOwnProperty("useContext")) {
      chrome.storage.local.set({ useContext: true });
    }
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const OPENAI_API_KEY = "__INSERT_API_KEY_HERE__";
  if (request.action === "generateAltText") {
    (async () => {
      try {
        // Determine if context should be used
        const useContext = request.hasOwnProperty("useContext")
          ? request.useContext
          : true;

        // Prepare the system prompt with instructions about using context
        let systemPrompt = `You are an expert at creating accessible and descriptive alt text for images.`;

        if (useContext) {
          systemPrompt += `
Alternative text is highly subjective and should be tailored to the context where the image appears.
When provided with contextual information from the webpage (such as titles, headings, surrounding text),
use it to inform your description if relevant, but don't include irrelevant details.`;
        }

        systemPrompt += `
Guidelines for generating good alt text:
- Be concise but descriptive
- Focus on the purpose and context of the image on the page
- Include key visual details that are relevant to the content's purpose
- Don't start with phrases like "image of" or "picture showing"
- For decorative images with no informational value, indicate if a null/empty alt text would be appropriate
- Don't try to specifically identify people`;

        if (useContext) {
          systemPrompt += `\n\nAnalyze the provided contextual information and determine what's relevant before creating the alt text.`;
        }

        // Create a prompt that includes contextual information if available and requested
        let userPrompt = "Describe this image in a concise alt text format.";

        // Add contextual information if available and enabled
        if (useContext && request.contextData) {
          userPrompt += "\n\nContextual information from the webpage:";

          if (request.contextData.pageTitle) {
            userPrompt += `\nPage title: ${request.contextData.pageTitle}`;
          }

          if (request.contextData.metaDescription) {
            userPrompt += `\nPage description: ${request.contextData.metaDescription}`;
          }

          if (
            request.contextData.relevantHeadings &&
            request.contextData.relevantHeadings.length > 0
          ) {
            userPrompt += `\nNearby headings: ${request.contextData.relevantHeadings.join(
              ", "
            )}`;
          }

          if (request.contextData.figcaption) {
            userPrompt += `\nImage caption: ${request.contextData.figcaption}`;
          }

          if (request.contextData.surroundingText) {
            userPrompt += `\nSurrounding text: ${request.contextData.surroundingText}`;
          }

          if (request.contextData.imgTitle) {
            userPrompt += `\nImage title attribute: ${request.contextData.imgTitle}`;
          }

          if (request.contextData.imgAriaLabel) {
            userPrompt += `\nImage aria-label: ${request.contextData.imgAriaLabel}`;
          }

          if (request.contextData.existingAlt) {
            userPrompt += `\nExisting alt text: ${request.contextData.existingAlt}`;
          }

          userPrompt += `\nPage URL: ${request.contextData.url}`;

          userPrompt +=
            "\n\nBased on this context and the image itself, provide appropriate alt text that reflects the image's purpose on this page.";
        } else {
          userPrompt +=
            "\n\nProvide descriptive alt text based solely on the visual content of the image.";
        }

        const response = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: "gpt-4o",
              messages: [
                { role: "system", content: systemPrompt },
                {
                  role: "user",
                  content: [
                    { type: "text", text: userPrompt },
                    { type: "image_url", image_url: { url: request.imageSrc } },
                  ],
                },
              ],
              max_tokens: 150,
            }),
          }
        );

        if (!response.ok) {
          const result = await response.json();
          throw new Error(
            result.error.message || "Failed to generate alt text."
          );
        }

        const data = await response.json();
        sendResponse({
          altText: data.choices?.[0]?.message?.content,
          contextUsed: useContext && request.contextData !== null,
        });
      } catch (error) {
        sendResponse({ error: error.message });
      }
    })(); // Self-invoking async function

    return true; // Ensures sendResponse works asynchronously
  } else if (request.action === "refineAltText") {
    (async () => {
      try {
        // Determine if context should be used
        const useContext = request.hasOwnProperty("useContext")
          ? request.useContext
          : true;

        // System prompt for refining alt text
        let systemPrompt = `You are an expert at creating accessible and descriptive alt text for images.
You will be given an image along with original alt text that was generated for it.
You will also be given user feedback about how to improve the alt text.

Your task is to refine the alt text based on the user's feedback while ensuring it remains:
- Concise but descriptive
- Focused on the purpose of the image 
- Free from phrases like "image of" or "picture showing"
- Contextually appropriate
- Don't try to identify people specifically`;

        if (useContext) {
          systemPrompt += `\n\nYou will also be given contextual information from the webpage that may help inform your refinements.`;
        }

        // User prompt with original alt text and feedback
        let userPrompt = `Here is an image that needs refined alt text.

Original alt text: "${request.originalAltText}"

User feedback for improvement: "${request.feedback}"

Please provide a refined version of the alt text that addresses this feedback.`;

        // Add contextual information if available and enabled
        if (useContext && request.contextData) {
          userPrompt += "\n\nContextual information from the webpage:";

          if (request.contextData.pageTitle) {
            userPrompt += `\nPage title: ${request.contextData.pageTitle}`;
          }

          if (
            request.contextData.relevantHeadings &&
            request.contextData.relevantHeadings.length > 0
          ) {
            userPrompt += `\nNearby headings: ${request.contextData.relevantHeadings.join(
              ", "
            )}`;
          }

          if (request.contextData.figcaption) {
            userPrompt += `\nImage caption: ${request.contextData.figcaption}`;
          }

          if (request.contextData.surroundingText) {
            userPrompt += `\nSurrounding text: ${request.contextData.surroundingText}`;
          }
        }

        userPrompt +=
          "\n\nPlease provide only the refined alt text without any explanations or additional information.";

        const response = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: "gpt-4o",
              messages: [
                { role: "system", content: systemPrompt },
                {
                  role: "user",
                  content: [
                    { type: "text", text: userPrompt },
                    { type: "image_url", image_url: { url: request.imageSrc } },
                  ],
                },
              ],
              max_tokens: 150,
            }),
          }
        );

        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error.message || "Failed to refine alt text.");
        }

        const data = await response.json();
        sendResponse({
          refinedAltText: data.choices?.[0]?.message?.content,
        });
      } catch (error) {
        sendResponse({ error: error.message });
      }
    })(); // Self-invoking async function

    return true; // Ensures sendResponse works asynchronously
  }
});

// Listen for toolbar icon clicks to open the side panel
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});
