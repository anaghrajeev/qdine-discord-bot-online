import { formatDuration, intervalToDuration } from 'date-fns';
import { ENV } from '../config/environment';

export const formatDurationString = (seconds: number): string => {
  const duration = intervalToDuration({ start: 0, end: seconds * 1000 });
  const hours = duration.hours || 0;
  const minutes = duration.minutes || 0;
  
  if (hours === 0 && minutes === 0) {
    return `${duration.seconds || 0}s`;
  }
  
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  
  return parts.join(' ');
};

export const formatTime = (date: Date): string => {
  return date.toLocaleTimeString('en-US', {
    timeZone: ENV.TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};

export const formatDate = (date: Date): string => {
  return date.toLocaleDateString('en-GB', {
    timeZone: ENV.TIMEZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
};
