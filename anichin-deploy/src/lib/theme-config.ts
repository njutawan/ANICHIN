export type AccentColor = 'amber' | 'rose' | 'cyan' | 'violet' | 'emerald' | 'blue';


interface AccentColorConfig {
  name: string;
  label: string;
  swatch: string;
}
export const ACCENT_COLORS: Record<AccentColor, AccentColorConfig> = {
  amber:   { name: 'amber',   label: 'Amber',   swatch: '#fbbf24' },
  rose:    { name: 'rose',    label: 'Rose',    swatch: '#fb7185' },
  cyan:    { name: 'cyan',    label: 'Cyan',    swatch: '#22d3ee' },
  violet:  { name: 'violet',  label: 'Violet',  swatch: '#a78bfa' },
  emerald: { name: 'emerald', label: 'Emerald', swatch: '#34d399' },
  blue:    { name: 'blue',    label: 'Blue',    swatch: '#60a5fa' },
};

export const FONT_SIZES: Record<string, { label: string; value: string }> = {
  sm: { label: 'Kecil', value: '14px' },
  md: { label: 'Normal', value: '16px' },
  lg: { label: 'Besar', value: '18px' },
};

export const ACCENT_OKLCH: Record<AccentColor, string> = {
  amber: '0.82 0.16 80',
  rose: '0.72 0.19 15',
  cyan: '0.78 0.13 200',
  violet: '0.70 0.18 300',
  emerald: '0.76 0.15 160',
  blue: '0.68 0.16 250',
};
