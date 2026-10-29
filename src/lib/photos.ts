/**
 * Bay Design's own project photos, made web-ready by `npm run images` (scripts/optimize-images.mjs):
 * every photo exists as public/images/photos/<name>-<width>.webp at each of WIDTHS.
 */
const WIDTHS = [480, 960, 1600, 2400];
const LOCAL = /^\/images\/photos\/(.+)-\d+\.webp$/;

/** A photo's URL. `width` is only the fallback — `responsive` lets the browser pick the size it needs. */
export const bayPhoto = (name: string, width = 1600) => `/images/photos/${name}-${width}.webp`;

/** How wide an image shows on screen, so a phone downloads a small file and a big desktop a sharp one. */
export const SIZES = {
  full: '100vw',
  /** Full-screen backgrounds: on a tall phone screen a landscape photo is cropped to fill the height, so it shows ~1.5× the screen height wide. */
  cover: '(max-aspect-ratio: 3/2) 150vh, 100vw',
  half: '(min-width: 1024px) 50vw, 100vw',
  third: '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw',
  /** Carousel cards: most of a phone screen, about a third of a desktop one. */
  card: '(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 80vw',
  /** Two-across on phones, some tiles spanning two of four columns on desktop. */
  tile: '(min-width: 1024px) 40vw, 50vw',
  quarter: '(min-width: 1024px) 25vw, 50vw',
  thumb: '(min-width: 768px) 17vw, 34vw',
  tiny: '160px',
} as const;

/** `src`, `srcSet` and `sizes` to spread on an <img> (or motion.img). Other images pass through as they are. */
export function responsive(src: string, sizes: string = SIZES.full) {
  const m = LOCAL.exec(src);
  if (!m) return { src };
  return { src, srcSet: WIDTHS.map((w) => `/images/photos/${m[1]}-${w}.webp ${w}w`).join(', '), sizes };
}
