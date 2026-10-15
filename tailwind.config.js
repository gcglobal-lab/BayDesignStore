/**
 * Palette colours are CSS variables (RGB triplets, see src/index.css) so a part of the app can
 * re-skin itself: the public site uses the warm ivory/brass values from :root, and Bay Design
 * Base (.base-theme) swaps in its own palette without touching any component classes.
 */
const c = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ivory: c('ivory'),
        linen: c('linen'),
        sand: c('sand'),
        stone: c('stone'),
        ink: c('ink'),
        charcoal: c('charcoal'),
        muted: c('muted'),
        // Card / input background: white, or a deep slate in the portal's dark mode.
        surface: c('surface'),
        brass: { DEFAULT: c('brass'), light: c('brass-light'), dark: c('brass-dark') },
        sea: { DEFAULT: c('sea'), light: c('sea-light') },
      },
      fontFamily: {
        // Self-hosted through next/font (see src/app/fonts.ts)
        display: ['var(--font-cormorant)', 'Didot', 'Georgia', 'serif'],
        brand: ['var(--font-marcellus)', 'var(--font-cormorant)', 'Georgia', 'serif'],
        sans: ['var(--font-dm-sans)', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      keyframes: {
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        progress: { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
        kenburns: { from: { transform: 'scale(1.02)' }, to: { transform: 'scale(1.14)' } },
        'scroll-dot': {
          '0%': { transform: 'translateY(0)', opacity: '0' },
          '30%': { opacity: '1' },
          '100%': { transform: 'translateY(14px)', opacity: '0' },
        },
      },
      animation: {
        marquee: 'marquee 38s linear infinite',
        progress: 'progress linear forwards',
        kenburns: 'kenburns 9s ease-out forwards',
        'scroll-dot': 'scroll-dot 1.8s ease-in-out infinite',
      },
      transitionTimingFunction: {
        lux: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
