import { config } from 'dotenv';
config();

export const ENV = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN || '',
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID || '',
  DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID || '',
  DATABASE_URL: process.env.DATABASE_URL || '',
  WORKING_CHANNEL_ID: process.env.WORKING_CHANNEL_ID || '',
  BREAK_CHANNEL_ID: process.env.BREAK_CHANNEL_ID || '',
  REPORT_CHANNEL_ID: process.env.REPORT_CHANNEL_ID || '',
  ADMIN_CATEGORY_ID: process.env.ADMIN_CATEGORY_ID || '1544777350246436905',
  ADMIN_ROLE_ID: process.env.ADMIN_ROLE_ID || '',
  TIMEZONE: process.env.TIMEZONE || 'Asia/Kolkata',
  DAILY_REPORT_TIME: process.env.DAILY_REPORT_TIME || '18:00',
  WEEKLY_REPORT_DAY: process.env.WEEKLY_REPORT_DAY || 'FRIDAY',
  WEEKLY_REPORT_TIME: process.env.WEEKLY_REPORT_TIME || '18:00',
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development'
};

export const validateEnv = () => {
  const missing: string[] = [];
  if (!ENV.DISCORD_TOKEN) missing.push('DISCORD_TOKEN');
  if (!ENV.DISCORD_CLIENT_ID) missing.push('DISCORD_CLIENT_ID');
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};
