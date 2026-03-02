export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      colors: {
        accent: {
          DEFAULT: '#4f46e5',
          hover:   '#4338ca',
          light:   '#eef2ff',
          border:  '#c7d2fe',
        },
      },
      boxShadow: {
        card:         '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
        'card-drag':  '0 8px 24px rgba(0,0,0,0.12)',
        panel:        '-8px 0 32px rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
};
