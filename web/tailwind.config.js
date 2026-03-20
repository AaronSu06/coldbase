export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['Plus Jakarta Sans', 'sans-serif'],
        mono:    ['IBM Plex Mono', 'monospace'],
        display: ['Syne', 'sans-serif'],
      },
      colors: {
        accent: {
          DEFAULT: '#b85212',
          hover:   '#9a4310',
          light:   '#b8521210', // rgba-ish for bg-accent-light usage
          border:  '#b8521230',
        },
        chrome: {
          bg:      '#f8f7f5',
          surface: '#ffffff',
          border:  '#e8e6e1',
          text:    '#1a1917',
          muted:   '#78716c',
          deep:    '#f0ede8',
          card:    '#ffffff',  // card surface
          rim:     '#e4e2dd',  // card border ring
          subtle:  '#9c9189',  // secondary body text in panels/cards
        },
      },
      boxShadow: {
        card:         '0 1px 2px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.04)',
        'card-hover': '0 2px 6px rgba(0,0,0,0.07), 0 6px 20px rgba(0,0,0,0.06)',
        'card-drag':  '0 4px 16px rgba(0,0,0,0.10), 0 12px 32px rgba(0,0,0,0.08)',
        panel:        '-8px 0 40px rgba(0,0,0,0.12)',
      },
    },
  },
  plugins: [],
};
