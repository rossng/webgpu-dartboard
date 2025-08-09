import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      width: {
        'canvas-sm': '500px',
        'canvas-md': '600px',
        'canvas-lg': '1000px',
        'sidebar': '300px',
      },
      height: {
        'canvas-sm': '500px',
        'canvas-md': '600px',
        'canvas-lg': '1000px',
      },
      maxHeight: {
        'table': '400px',
      },
      spacing: {
        '18': '4.5rem',
      },
      fontSize: {
        '2xs': '0.625rem',
      },
      transitionProperty: {
        'bg': 'background-color',
      },
    },
  },
  plugins: [],
}

export default config