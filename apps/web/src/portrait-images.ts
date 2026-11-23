const decoded = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<void>>();

export function portraitImagesReady(urls: readonly string[]) {
  return urls.every((url) => decoded.has(url));
}

function loadImage(url: string) {
  if (decoded.has(url)) return Promise.resolve();
  const previous = pending.get(url);
  if (previous) return previous;

  const image = new Image();
  const ready =
    typeof image.decode === "function"
      ? null
      : new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () =>
            reject(new Error("Could not load portrait layer"));
        });
  image.src = url;
  const request = (ready ?? image.decode())
    .then(() => {
      decoded.set(url, image);
    })
    .finally(() => {
      pending.delete(url);
    });
  pending.set(url, request);
  return request;
}

export function loadPortraitImages(urls: readonly string[]) {
  return Promise.all(urls.map(loadImage));
}
