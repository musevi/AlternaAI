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
    generateButton.addEventListener("click", () => {
      generateAltText(image.src, contentContainer);
      generateButton.disabled = true;
      generateButton.textContent = "Generating...";
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

function generateAltText(imageSrc, container) {
  // Mock function for generating alt text
  setTimeout(() => {
    const filename = imageSrc.split("/").pop();
    const mockAlt = `An image of ${filename.split('.')[0].replace(/-|_/g, ' ')}`;
    
    const generatedAltContainer = document.createElement("div");
    generatedAltContainer.className = "generated-alt";
    generatedAltContainer.textContent = `alt="${mockAlt}"`;
    
    // Add copy button
    const copyButton = document.createElement("button");
    copyButton.className = "copy-button";
    copyButton.textContent = "Copy";
    copyButton.addEventListener("click", () => {
      navigator.clipboard.writeText(`alt="${mockAlt}"`);
      copyButton.textContent = "Copied!";
      setTimeout(() => {
        copyButton.textContent = "Copy";
      }, 2000);
    });
    
    generatedAltContainer.appendChild(copyButton);
    container.appendChild(generatedAltContainer);
    
    // Update the button
    const button = container.querySelector("button");
    button.textContent = "Generate Alt Text";
    button.disabled = false;
  }, 1000); // Simulate async operation
}