// popup.js
document.addEventListener("DOMContentLoaded", () => {
  const link = document.querySelector("h1 a");
  if (link) {
    link.addEventListener("click", (event) => {
      event.preventDefault(); // Prevent default behavior
      chrome.tabs.create({ url: link.href }); // Open link in a new tab
    });
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) return;

    const tabId = tabs[0].id;

    chrome.scripting.executeScript(
      {
        target: { tabId: tabId },
        files: ["content.js"],
      },
      () => {
        chrome.scripting
          .executeScript({
            target: { tabId: tabId },
            function: findImagesAndAltText,
          })
          .then((results) => {
            if (results && results[0].result) {
              displayImages(results[0].result, tabId);
            }
          })
          .catch((error) => console.error("Error executing script:", error));
      }
    );
  });
});

function findImagesAndAltText() {
  return Array.from(document.getElementsByTagName("img")).map((img) => ({
    src: img.src,
    alt: img.alt,
  }));
}

function displayImages(images, tabId) {
  images = images.filter((image) => image.src);
  const imageList = document.getElementById("imageList");
  imageList.innerHTML = "";
  
  let countAltText = 0;
  
  images.forEach((image, index) => {
    const li = document.createElement("li");
    
    // Image container
    const imgContainer = document.createElement("div");
    imgContainer.className = "image-container";
    
    const img = document.createElement("img");
    img.src = image.src;
    img.alt = image.alt || "Image without alt text";
    if (image.alt) countAltText++;

    img.addEventListener("click", () => {
      chrome.tabs.sendMessage(tabId, { action: "scrollToImage", index });
    });
    
    imgContainer.appendChild(img);
    li.appendChild(imgContainer);
    
    // Content container
    const contentContainer = document.createElement("div");
    contentContainer.className = "content-container";
    
    // Alt status badge
    const altStatus = document.createElement("div");
    altStatus.className = `alt-status ${image.alt ? 'present' : 'missing'}`;
    altStatus.textContent = image.alt ? "Alt text present" : "Missing alt text";
    contentContainer.appendChild(altStatus);
    
    // Alt text display
    const altText = document.createElement("span");
    altText.className = "alt-text";
    altText.textContent = image.alt || "No alt text available";
    contentContainer.appendChild(altText);
    
    // Generate button
    const generateButton = document.createElement("button");
    generateButton.textContent = image.alt ? "Improve Alt Text" : "Generate Alt Text";
    generateButton.addEventListener("click", async () => {
      generateButton.disabled = true;
      generateButton.textContent = "Generating...";
    
      try {
        // Call the async generateAltText function
        await generateAltText(image.src, contentContainer);
      } catch (error) {
        console.error("Error generating alt text:", error);
        // Optionally, display an error message to the user
        const errorMessage = document.createElement("div");
        errorMessage.className = "error-message";
        errorMessage.textContent = "Failed to generate alt text. Please try again.";
        contentContainer.appendChild(errorMessage);
      } finally {
        // Re-enable the button and update its text
        generateButton.disabled = false;
        generateButton.textContent = image.alt ? "Improve Alt Text" : "Generate Alt Text";
      }
    });
    contentContainer.appendChild(generateButton);
    
    li.appendChild(contentContainer);
    imageList.appendChild(li);
  });

  // Create and insert score container after heading
  const heading = document.querySelector("h2");
  const scoreDiv = document.createElement("div");
  scoreDiv.className = "score-container";
  
  const missingAlt = images.length > 0 ? 
    Math.round(((images.length - countAltText) / images.length) * 100) : 0;
  
  // Set class and content based on score
  if (missingAlt < 5) {
    scoreDiv.classList.add("good");
    scoreDiv.innerHTML = `<span>Great job!</span> Only ${missingAlt}% of images are missing alt text.`;
  } else if (missingAlt < 15) {
    scoreDiv.classList.add("warning");
    scoreDiv.innerHTML = `<span>Needs improvement.</span> ${missingAlt}% of images are missing alt text.`;
  } else {
    scoreDiv.classList.add("bad");
    scoreDiv.innerHTML = `<span>Accessibility issue!</span> ${missingAlt}% of images are missing alt text.`;
  }
  
  heading.insertAdjacentElement("afterend", scoreDiv);
}

async function generateAltText(imageSrc, container) {
  const OPENAI_API_KEY = "__INSERT_API_HERE__";

  // Prepare API request payload
  const requestBody = {
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are an assistant that generates descriptive alt text for images."
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Describe this image in a concise alt text format." },
          { type: "image_url", image_url: imageSrc }
        ]
      }
    ],
    max_tokens: 100
  };

  // Send request to OpenAI API
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify(requestBody)
  });

  const data = await response.json();

  // Extract AI-generated alt text
  const altText = data.choices?.[0]?.message?.content || "Image description not available.";

  // Create a container for the generated alt text
  const generatedAltContainer = document.createElement("div"); // TODO: Modify this so instead of creating one, modify the existing one
  generatedAltContainer.className = "generated-alt";
  generatedAltContainer.textContent = `alt="${altText}"`;

  // Add a copy button
  const copyButton = document.createElement("button");
  copyButton.className = "copy-button";
  copyButton.textContent = "Copy";
  copyButton.addEventListener("click", () => {
    navigator.clipboard.writeText(`alt="${altText}"`);
    copyButton.textContent = "Copied!";
    setTimeout(() => {
      copyButton.textContent = "Copy";
    }, 2000);
  });

  generatedAltContainer.appendChild(copyButton);
  container.appendChild(generatedAltContainer); 

}
