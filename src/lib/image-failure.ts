export function hasImageLoadFailed(image: HTMLImageElement | null): boolean {
  return image?.complete === true && image.naturalWidth === 0;
}
