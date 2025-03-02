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
  }
});
