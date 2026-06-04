import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function formatDate(date: string | Date, locale = 'pt-BR'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatRelative(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min atras`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atras`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d atras`;
  return formatDate(d);
}

// Gera cor estavel a partir de uma string (para avatars)
export function colorFromString(input: string): string {
  const colors = [
    '#E8A04C', '#2D4A5C', '#7C9E3F', '#B85C5C',
    '#5C7CB8', '#A45CB8', '#5CB89C', '#B89C5C',
  ];
  let hash = 0;
  for (let i = 0; i < input.length; i++) hash = input.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

// Conta caracteres de texto puro (descarta tags HTML)
export function countPlainTextChars(html: string): number {
  if (!html) return 0;
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || '').length;
}

// Extrai texto puro de HTML
export function htmlToPlainText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}
