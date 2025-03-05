chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getImagesAndAltText") {
    const images = Array.from(document.getElementsByTagName("img")).map(
      (img) => ({
        src: img.src,
        alt: img.alt,
      })
    );
    sendResponse({ images });
  } else if (request.action === "scrollToImage") {
    const images = document.getElementsByTagName("img");
    if (images[request.index]) {
      images[request.index].scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  } else if (request.action === "getImageContext") {
    const images = document.getElementsByTagName("img");
    const targetImage = images[request.index];

    if (!targetImage) {
      sendResponse({ error: "Image not found" });
      return;
    }

    // Get the page title
    const pageTitle = document.title;

    // Get page meta description
    const metaDescription =
      document.querySelector('meta[name="description"]')?.content || "";

    // Find parent elements and surrounding text
    const parent = targetImage.parentElement;
    let surroundingText = "";
    let relevantHeadings = [];

    // Check if image has a caption (common patterns)
    const figcaption =
      targetImage.closest("figure")?.querySelector("figcaption")?.textContent ||
      "";

    // Get text from parent element (excluding the image itself)
    if (parent) {
      // Clone the parent to avoid modifying the actual DOM
      const parentClone = parent.cloneNode(true);
      // Remove the image from the clone
      const imageInClone = parentClone.querySelector(
        `img[src="${targetImage.src}"]`
      );
      if (imageInClone) {
        imageInClone.remove();
      }
      surroundingText = parentClone.textContent.trim();

      // If no text in immediate parent, try to get text from grandparent
      if (!surroundingText) {
        const grandparent = parent.parentElement;
        if (grandparent) {
          const grandparentClone = grandparent.cloneNode(true);
          const parentInClone = grandparentClone.querySelector(
            `*:has(img[src="${targetImage.src}"])`
          );
          if (parentInClone) {
            parentInClone.remove();
          }
          surroundingText = grandparentClone.textContent.trim();
        }
      }
    }

    // Look for nearby headings (h1-h6)
    let currentElement = targetImage;
    let nearestHeadingBefore = null;

    // Look backward for headings
    while (currentElement && !nearestHeadingBefore) {
      currentElement = currentElement.previousElementSibling;
      if (currentElement && /^H[1-6]$/i.test(currentElement.tagName)) {
        nearestHeadingBefore = currentElement.textContent.trim();
      }
    }

    // If no heading found in siblings, try parent's previous siblings
    if (!nearestHeadingBefore) {
      currentElement = parent;
      while (currentElement && !nearestHeadingBefore) {
        currentElement = currentElement.previousElementSibling;
        if (currentElement && /^H[1-6]$/i.test(currentElement.tagName)) {
          nearestHeadingBefore = currentElement.textContent.trim();
        }
      }
    }

    if (nearestHeadingBefore) {
      relevantHeadings.push(nearestHeadingBefore);
    }

    // Get image attributes that might provide context
    const imgTitle = targetImage.getAttribute("title") || "";
    const imgAriaLabel = targetImage.getAttribute("aria-label") || "";

    // Get existing alt text
    const existingAlt = targetImage.alt || "";

    // Check if image is in an article or main content area
    const articleContext =
      targetImage.closest("article")?.textContent.trim().substring(0, 500) ||
      "";
    const mainContext =
      targetImage.closest("main")?.textContent.trim().substring(0, 500) || "";

    // If we have an article context but no surrounding text, use the article
    if (!surroundingText && articleContext) {
      surroundingText = articleContext;
    } else if (!surroundingText && mainContext) {
      surroundingText = mainContext;
    }

    // Limit text length
    if (surroundingText && surroundingText.length > 1000) {
      surroundingText = surroundingText.substring(0, 1000) + "...";
    }

    // Create an object with all the context
    const contextData = {
      pageTitle,
      metaDescription,
      relevantHeadings,
      surroundingText,
      figcaption,
      imgTitle,
      imgAriaLabel,
      existingAlt,
      url: window.location.href,
    };

    sendResponse({ contextData });
  }
});
