/** @type {import('tailwindcss').Config} */

module.exports = {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      typography: (theme) => ({
        DEFAULT: {
          css: {
            p: {
                'font-size': '1.0em',
                'line-height': '1.675',
            },
            a: {
              'text-decoration': 'none',
              'background-repeat': 'no-repeat',
              'background-size': '100% 1.5px',
              'background-position': '0 100%',
              '&:hover': {
                color: 'rgb(var(--color-text-link))',
              },
            },
            'h1, h2, h3, h4, h5': {
              color: 'rgb(var(--color-text-heading))',
            },
            iframe: {
              'border-radius': '0.5rem',
            },
            img: {
              'display': 'block',
              'max-width': '100%',
              'margin-left': 'auto',
              'margin-right': 'auto',
              'background-color': '#fff',
            },
            code: {
              'background-color': 'rgb(var(--color-code-bg))',
              color: 'rgb(var(--color-code-text))',
              padding: '0.1rem 0.1rem',
              'border-radius': '0.25rem',
              'font-size': '1.0em',
              'line-height': '1.2',
              'font-family': "Consolas, Menlo, 'Andale Mono', 'Ubuntu Mono', monospace",
            },
            'ol > li::before': {
                color: 'rgb(var(--color-text-bold))',
            },
            li: {
              'margin-bottom': '0.5rem',
              color: 'rgb(var(--color-text-heading))',
              'font-size': '1.0em',
            },
            'code::before': {
              content: 'none',
            },
            'code::after': {
              content: 'none',
            },
            blockquote: {
              border: 'none',
              position: 'relative',
              width: '96%',
              margin: '0 auto',
              'font-size': '1.0625em',
              'padding-left': '1.1rem',
              'padding-right': '1.1rem',
            },
            'blockquote::before': {
              'font-family': 'Arial',
              'font-size': '2em',
              color: 'rgb(var(--color-text-bold))',
              position: 'absolute',
            },
            'blockquote::after': {
              content: '',
            },
            'blockquote p:first-of-type::before': {
              content: '',
            },
            'blockquote p:last-of-type::after': {
              content: '',
            },
          },
        },
      }),
    },
  },
  plugins: [require('@tailwindcss/typography'), require('@tailwindcss/aspect-ratio')],
};
