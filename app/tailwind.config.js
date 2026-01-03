/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
  	extend: {
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			// Status colors (functional - for agent online/offline/health)
  			status: {
  				online: 'rgb(34, 197, 94)',      // green-500
  				offline: 'rgb(239, 68, 68)',     // red-500
  				warning: 'rgb(234, 179, 8)',     // yellow-500
  				degraded: 'rgb(249, 115, 22)',   // orange-500
  				unknown: 'rgb(107, 114, 128)',   // gray-500
  			},
  			// Agent identity colors (brand - for agent visual identity)
  			agents: {
  				ana: 'rgb(168, 85, 247)',        // purple-500
  				bill: 'rgb(59, 130, 246)',       // blue-500
  				carl: 'rgb(99, 102, 241)',       // indigo-500
  				dan: 'rgb(139, 92, 246)',        // violet-500 (CHANGED from amber)
  				enzo: 'rgb(236, 72, 153)',       // pink-500
  				ralph: 'rgb(113, 113, 122)',     // zinc-500 (CHANGED from slate)
  			}
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}

