import { Presence } from 'discord.js';
import { logger } from '../../utils/logger';

export const handlePresenceUpdate = async (oldPresence: Presence | null, newPresence: Presence) => {
  // Optional: Add logic here to mark user as IDLE in a work session if they are idle in Discord
  // We'll just log it for MVP
  const userId = newPresence.userId;
  const status = newPresence.status; // online, idle, dnd, offline
  
  if (status === 'idle') {
    logger.info(`User ${userId} is now idle.`);
  }
};
