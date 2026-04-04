import type { Config } from 'tailwindcss';

export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['Barlow', 'system-ui', 'sans-serif'],
        heading: ['Barlow Semi Condensed', 'system-ui', 'sans-serif'],
        mono:    ['IBM Plex Mono', 'monospace'],
      },
      colors: {
        forge: {
          bg:           '#F7F6F2',
          panel:        '#FCFBF8',
          mist:         '#EFEAE0',
          stone:        '#E7E0D2',
          border:       '#D9D0C2',
          'border-l':   '#EAE4DA',
          text:         '#2C2A28',
          muted:        '#6B675F',
          light:        '#9B9490',
        },
        gold: {
          DEFAULT: '#C89B3C',
          soft:    '#D8B15A',
          deep:    '#A67C2E',
          tint:    '#F8F0DE',
          mid:     '#F0E0B0',
        },
        sidebar: {
          DEFAULT: '#EFECE5',
          border:  '#DDD6CA',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;