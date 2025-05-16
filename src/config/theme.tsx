// Color palette constants
export const colors = {
  // Light mode colors
  light: {
    primary: '#1E90FF',    // Dodger Blue
    secondary: '#4169E1',  // Royal Blue
    accent: '#00BFFF',     // Deep Sky Blue
    background: '#FFFFFF', // Pure White
    text: '#000000',       // Black
    border: '#E8E8E8',     // Light Gray
    hover: '#F0F8FF',      // Alice Blue
    success: '#32CD32',    // Lime Green
    error: '#FF4444',      // Red
  },
  // Dark mode colors
  dark: {
    primary: '#4169E1',    // Royal Blue
    secondary: '#1E90FF',  // Dodger Blue
    accent: '#00BFFF',     // Deep Sky Blue
    background: '#000000', // Black
    text: '#FFFFFF',       // White
    border: '#2F4F4F',     // Dark Slate Gray
    hover: '#1A1A1A',      // Darker Black
    success: '#32CD32',    // Lime Green
    error: '#FF4444',      // Red
  },
};

export const transforms = {
  hover: 'transform transition-transform duration-300 hover:scale-105',
  float: 'animate-float',
  pulse: 'animate-pulse',
  bounce: 'animate-bounce',
};

export const shadows = {
  light: {
    soft: 'shadow-lg hover:shadow-xl transition-shadow duration-300',
    glow: 'shadow-lg hover:shadow-2xl hover:shadow-primary/50 transition-all duration-300',
    colorful: 'shadow-lg hover:shadow-2xl hover:shadow-accent/50 transition-all duration-300',
  },
  dark: {
    soft: 'shadow-lg shadow-primary/10 hover:shadow-xl hover:shadow-primary/20 transition-shadow duration-300',
    glow: 'shadow-lg shadow-primary/20 hover:shadow-2xl hover:shadow-primary/40 transition-all duration-300',
    colorful: 'shadow-lg shadow-accent/20 hover:shadow-2xl hover:shadow-accent/40 transition-all duration-300',
  },
};