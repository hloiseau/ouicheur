export function imageSrcSet(image: string) {
  return /^\/media\/[a-f0-9]{64}\.webp$/.test(image)
    ? [160, 320, 640, 960, 1600]
        .map((width) => `${image}?w=${width} ${width}w`)
        .join(", ")
    : undefined;
}
