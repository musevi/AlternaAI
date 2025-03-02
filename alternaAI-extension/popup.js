document.addEventListener("DOMContentLoaded", () => {
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
  const imageList = document.getElementById("imageList");
  imageList.innerHTML = "";
  images.forEach((image, index) => {
    const li = document.createElement("li");
    const img = document.createElement("img");
    img.src = image.src;
    img.alt = image.alt;
    img.style.cursor = "pointer"; // Indicate that the image is clickable
    img.addEventListener("click", () => {
      chrome.tabs.sendMessage(tabId, { action: "scrollToImage", index });
    });
    li.appendChild(img);

    const altText = document.createElement("span");
    altText.className = "altText";
    altText.textContent = image.alt;
    li.appendChild(altText);

    imageList.appendChild(li);
  });
}
