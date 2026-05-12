/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        wa: {
          teal:     '#075E54',   // header/dark
          green:    '#25D366',   // botão principal / ativo
          medium:   '#128C7E',   // hover / secundário
          light:    '#DCF8C6',   // fundo de mensagem
          bubble:   '#ECE5DD',   // fundo cinza chat
          dark:     '#111B21',   // texto escuro
          panel:    '#202C33',   // painel lateral escuro
          icon:     '#8696A0',   // ícones
          divider:  '#3B4A54',   // divisor
        },
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      opacity: {
        '6':  '0.06',
        '8':  '0.08',
        '12': '0.12',
        '15': '0.15',
      },
      keyframes: {
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(28px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px) scale(1)' },
          '50%':      { transform: 'translateY(-18px) scale(1.04)' },
        },
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg)' },
          '50%':      { transform: 'translateY(-12px) rotate(6deg)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.15' },
          '50%':      { opacity: '0.35' },
        },
      },
      animation: {
        'fade-up':        'fade-up 0.65s ease-out both',
        'fade-up-d1':     'fade-up 0.65s ease-out 0.15s both',
        'fade-up-d2':     'fade-up 0.65s ease-out 0.30s both',
        'fade-up-d3':     'fade-up 0.65s ease-out 0.45s both',
        'fade-up-d4':     'fade-up 0.65s ease-out 0.60s both',
        'fade-in':        'fade-in 1s ease-out both',
        'fade-in-slow':   'fade-in 2s ease-out both',
        float:            'float 5s ease-in-out infinite',
        'float-slow':     'float-slow 7s ease-in-out infinite',
        'float-delayed':  'float 6s ease-in-out 1.5s infinite',
        'pulse-glow':     'pulse-glow 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
