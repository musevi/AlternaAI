async function refineAltText(
  imageSrc,
  originalAltText,
  feedback,
  container,
  index
) {
  try {
    // Check if context should be used
    const useContextResult = await new Promise((resolve) => {
      chrome.storage.local.get("useContext", (result) => {
        // Default to true if setting doesn't exist
        resolve(result.hasOwnProperty("useContext") ? result.useContext : true);
      });
    });

    // Variable to store context data
    let contextData = null;

    // Only get context if the toggle is enabled
    if (useContextResult) {
      // Get contextual information about the image from the page
      contextData = await new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs.length === 0) {
            return reject(new Error("No active tab found"));
          }

          chrome.tabs.sendMessage(
            tabs[0].id,
            { action: "getImageContext", index },
            (response) => {
              if (chrome.runtime.lastError) {
                return reject(new Error(chrome.runtime.lastError.message));
              }

              if (!response) {
                return reject(
                  new Error("No response received from content script")
                );
              }

              if (response.error) {
                return reject(new Error(response.error));
              }

              resolve(response.contextData);
            }
          );
        });
      });
    }

    // Now generate refined alt text with the feedback
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: "refineAltText",
          imageSrc,
          originalAltText,
          feedback,
          contextData, // This will be null if useContext is false
          useContext: useContextResult,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }

          if (!response) {
            return reject(new Error("No response from background script"));
          }

          if (response.error) {
            return reject(new Error(response.error));
          }

          if (!response.refinedAltText) {
            return reject(new Error("Failed to refine alt text"));
          }

          resolve(response);
        }
      );
    });

    // Extract refined alt text
    const refinedAltText = response.refinedAltText;

    // Replace the existing alt text container content
    const existingAltContainer = container.querySelector(".generated-alt");
    if (existingAltContainer) {
      // Create a display to show both versions
      const altTextDisplay = document.createElement("div");
      altTextDisplay.className = "alt-text-display";

      // Original version in a faded style
      const originalVersion = document.createElement("div");
      originalVersion.className = "original-version";
      originalVersion.style.fontSize = "11px";
      originalVersion.style.color = "var(--light-text)";
      originalVersion.style.marginBottom = "8px";
      originalVersion.style.textDecoration = "line-through";
      originalVersion.innerHTML = `<span class="version-label">Original:</span> ${originalAltText}`;

      // Refined version
      const refinedVersion = document.createElement("div");
      refinedVersion.className = "refined-version";
      refinedVersion.style.fontWeight = "bold";
      refinedVersion.innerHTML = `<span class="version-label" style="font-weight: normal; font-size: 11px; color: var(--primary-color);">Refined:</span> ${refinedAltText}`;

      // Remove any existing content
      existingAltContainer.innerHTML = "";

      // Add the versions
      altTextDisplay.appendChild(originalVersion);
      altTextDisplay.appendChild(refinedVersion);
      existingAltContainer.appendChild(altTextDisplay);

      // Add copy button
      const copyButton = document.createElement("button");
      copyButton.className = "copy-button";
      copyButton.textContent = "Copy";
      copyButton.addEventListener("click", () => {
        navigator.clipboard.writeText(`alt=\"${refinedAltText}\"`);
        copyButton.textContent = "Copied!";
        setTimeout(() => {
          copyButton.textContent = "Copy";
        }, 2000);
      });

      existingAltContainer.appendChild(copyButton);
    }
  } catch (error) {
    console.error("Error refining alt text:", error);
    throw error;
  }
} // sidepanel.js
document.addEventListener("DOMContentLoaded", () => {
  const link = document.querySelector("h1 a");
  if (link) {
    link.addEventListener("click", (event) => {
      event.preventDefault(); // Prevent default behavior
      chrome.tabs.create({ url: link.href }); // Open link in a new tab
    });
  }

  // Set up the context toggle
  const contextToggle = document.getElementById("useContextToggle");

  // Check if there's a saved preference
  chrome.storage.local.get("useContext", (result) => {
    if (result.hasOwnProperty("useContext")) {
      contextToggle.checked = result.useContext;
    }
  });

  // Save preference when toggle changes
  contextToggle.addEventListener("change", () => {
    chrome.storage.local.set({ useContext: contextToggle.checked });
  });

  // Add tooltip functionality for info icon
  const infoIcon = document.querySelector(".info-icon");
  if (infoIcon) {
    infoIcon.addEventListener("mouseenter", (event) => {
      const tooltip = document.createElement("div");
      tooltip.className = "tooltip";
      tooltip.textContent = infoIcon.getAttribute("title");
      tooltip.style.position = "absolute";
      tooltip.style.backgroundColor = "#333";
      tooltip.style.color = "#fff";
      tooltip.style.padding = "5px 10px";
      tooltip.style.borderRadius = "4px";
      tooltip.style.fontSize = "12px";
      tooltip.style.maxWidth = "250px";
      tooltip.style.zIndex = "1000";
      tooltip.style.top = event.clientY + 10 + "px";
      tooltip.style.left = event.clientX + 10 + "px";

      document.body.appendChild(tooltip);

      infoIcon.addEventListener(
        "mouseleave",
        () => {
          document.body.removeChild(tooltip);
        },
        { once: true }
      );
    });
  }

  // Initialize loading state
  const loadingIndicator = document.getElementById("loadingIndicator");
  const imageList = document.getElementById("imageList");

  // Function to analyze the current tab
  const analyzeCurrentTab = () => {
    loadingIndicator.style.display = "block";
    imageList.innerHTML = "";

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        loadingIndicator.style.display = "none";
        return;
      }

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
              loadingIndicator.style.display = "none";
              if (results && results[0].result) {
                displayImages(results[0].result, tabId);
              }
            })
            .catch((error) => {
              loadingIndicator.style.display = "none";
              console.error("Error executing script:", error);
            });
        }
      );
    });
  };

  // Initial analysis
  analyzeCurrentTab();

  // Listen for tab updates to refresh the side panel content
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.active) {
      analyzeCurrentTab();
    }
  });

  // Listen for tab activation changes
  chrome.tabs.onActivated.addListener(() => {
    analyzeCurrentTab();
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

  if (images.length === 0) {
    const noImagesMessage = document.createElement("div");
    noImagesMessage.style.textAlign = "center";
    noImagesMessage.style.padding = "20px";
    noImagesMessage.style.color = "var(--light-text)";
    noImagesMessage.textContent = "No images found on this page.";
    imageList.appendChild(noImagesMessage);
    return;
  }

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
    altStatus.className = `alt-status ${image.alt ? "present" : "missing"}`;
    altStatus.textContent = image.alt ? "Alt text present" : "Missing alt text";
    contentContainer.appendChild(altStatus);

    // Alt text display
    const altText = document.createElement("span");
    altText.className = "alt-text";
    altText.textContent = image.alt || "No alt text available";
    contentContainer.appendChild(altText);

    // Generate button
    const generateButton = document.createElement("button");
    generateButton.textContent = image.alt
      ? "Improve Alt Text"
      : "Generate Alt Text";
    generateButton.addEventListener("click", async () => {
      generateButton.disabled = true;
      generateButton.textContent = "Generating...";
      let generationResult = "";
      try {
        // Call the async generateAltText function with image index
        await generateAltText(image.src, contentContainer, index);
        generationResult = "Generate Alt Text";
      } catch (error) {
        console.error("Error generating alt text:", error);
        generationResult = "Failed. Please try again."; // TODO: Is probably better to create a notification.
      } finally {
        // Re-enable the button and update its text
        generateButton.disabled = false;
        generateButton.textContent = generationResult;
      }
    });
    contentContainer.appendChild(generateButton);

    li.appendChild(contentContainer);
    imageList.appendChild(li);
  });

  // Create and insert score container after heading
  const heading = document.querySelector("h2");

  // Remove any existing score container
  const existingScoreDiv = document.querySelector(".score-container");
  if (existingScoreDiv) {
    existingScoreDiv.remove();
  }

  const scoreDiv = document.createElement("div");
  scoreDiv.className = "score-container";

  const missingAlt =
    images.length > 0
      ? Math.round(((images.length - countAltText) / images.length) * 100)
      : 0;

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

async function generateAltText(imageSrc, container, index) {
  try {
    // Check if context should be used
    const useContextResult = await new Promise((resolve) => {
      chrome.storage.local.get("useContext", (result) => {
        // Default to true if setting doesn't exist
        resolve(result.hasOwnProperty("useContext") ? result.useContext : true);
      });
    });

    // Variable to store context data
    let contextData = null;

    // Only get context if the toggle is enabled
    if (useContextResult) {
      // Get contextual information about the image from the page
      contextData = await new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs.length === 0) {
            return reject(new Error("No active tab found"));
          }

          chrome.tabs.sendMessage(
            tabs[0].id,
            { action: "getImageContext", index },
            (response) => {
              if (chrome.runtime.lastError) {
                return reject(new Error(chrome.runtime.lastError.message));
              }

              if (!response) {
                return reject(
                  new Error("No response received from content script")
                );
              }

              if (response.error) {
                return reject(new Error(response.error));
              }

              resolve(response.contextData);
            }
          );
        });
      });
    }

    // Now generate alt text with or without context
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: "generateAltText",
          imageSrc,
          contextData, // This will be null if useContext is false
          useContext: useContextResult,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }

          if (!response) {
            return reject(new Error("No response from background script"));
          }

          if (response.error) {
            return reject(new Error(response.error));
          }

          if (!response.altText) {
            return reject(new Error("Failed to generate alt text"));
          }

          resolve(response);
        }
      );
    });

    // Extract AI-generated alt text
    const altText = response.altText || "Image description not available.";

    // Create a container for the generated alt text
    let existingAltContainer = container.querySelector(".generated-alt");
    if (!existingAltContainer) {
      existingAltContainer = document.createElement("div");
      existingAltContainer.className = "generated-alt";
      container.appendChild(existingAltContainer);
    }

    existingAltContainer.innerHTML = `<span>${altText}</span>`;

    const copyButton = document.createElement("button");
    copyButton.className = "copy-button";
    copyButton.textContent = "Copy";
    copyButton.addEventListener("click", () => {
      navigator.clipboard.writeText(`alt=\"${altText}\"`);
      copyButton.textContent = "Copied!";
      setTimeout(() => {
        copyButton.textContent = "Copy";
      }, 2000);
    });

    existingAltContainer.appendChild(copyButton);

    // Add feedback section
    const feedbackContainer = document.createElement("div");
    feedbackContainer.className = "feedback-container";
    feedbackContainer.style.marginTop = "12px";

    const feedbackLabel = document.createElement("label");
    feedbackLabel.textContent = "Provide feedback to refine this alt text:";
    feedbackLabel.style.display = "block";
    feedbackLabel.style.fontSize = "12px";
    feedbackLabel.style.marginBottom = "6px";
    feedbackLabel.style.color = "var(--text-color)";
    feedbackLabel.style.fontWeight = "600";

    const feedbackInput = document.createElement("textarea");
    feedbackInput.className = "feedback-input";
    feedbackInput.style.width = "100%";
    feedbackInput.style.padding = "8px";
    feedbackInput.style.borderRadius = "4px";
    feedbackInput.style.border = "1px solid var(--border-color)";
    feedbackInput.style.fontSize = "12px";
    feedbackInput.style.minHeight = "60px";
    feedbackInput.style.resize = "vertical";
    feedbackInput.placeholder =
      'Example: "Make it more concise" or "Include the color of the car"';

    const feedbackButtonsContainer = document.createElement("div");
    feedbackButtonsContainer.style.display = "flex";
    feedbackButtonsContainer.style.gap = "8px";
    feedbackButtonsContainer.style.marginTop = "8px";

    const submitFeedbackButton = document.createElement("button");
    submitFeedbackButton.textContent = "Refine Alt Text";
    submitFeedbackButton.style.flexGrow = "1";

    submitFeedbackButton.addEventListener("click", async () => {
      if (!feedbackInput.value.trim()) {
        // Show error if no feedback is provided
        feedbackInput.style.borderColor = "var(--danger-color)";
        setTimeout(() => {
          feedbackInput.style.borderColor = "var(--border-color)";
        }, 2000);
        return;
      }

      // Disable the button and show loading state
      submitFeedbackButton.disabled = true;
      submitFeedbackButton.textContent = "Refining...";

      try {
        // Send the feedback along with the original image to generate refined alt text
        await refineAltText(
          imageSrc,
          altText,
          feedbackInput.value,
          container,
          index
        );

        // Clear the feedback input
        feedbackInput.value = "";
      } catch (error) {
        console.error("Error refining alt text:", error);

        // Show error message
        const errorMsg = document.createElement("div");
        errorMsg.textContent = "Failed to refine alt text. Please try again.";
        errorMsg.style.color = "var(--danger-color)";
        errorMsg.style.fontSize = "12px";
        errorMsg.style.marginTop = "4px";

        // Remove the error message after 3 seconds
        feedbackContainer.appendChild(errorMsg);
        setTimeout(() => {
          if (feedbackContainer.contains(errorMsg)) {
            feedbackContainer.removeChild(errorMsg);
          }
        }, 3000);
      } finally {
        // Re-enable the button
        submitFeedbackButton.disabled = false;
        submitFeedbackButton.textContent = "Refine Alt Text";
      }
    });

    feedbackButtonsContainer.appendChild(submitFeedbackButton);

    feedbackContainer.appendChild(feedbackLabel);
    feedbackContainer.appendChild(feedbackInput);
    feedbackContainer.appendChild(feedbackButtonsContainer);

    container.appendChild(feedbackContainer);

    // Only show context info if context was used
    // The Show Context Used button and display has been removed
    // to simplify the UI while keeping the contextual generation functionality
  } catch (error) {
    console.error("Error generating alt text:", error);
    throw error;
  }
}
