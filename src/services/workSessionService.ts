import { prisma } from '../database/connection';
import { logger } from '../utils/logger';

export const workSessionService = {
  async ensureUserExists(discordUserId: string, username: string, displayName?: string) {
    return prisma.user.upsert({
      where: { discord_user_id: discordUserId },
      update: { username, display_name: displayName, is_active: true },
      create: {
        discord_user_id: discordUserId,
        username,
        display_name: displayName,
        is_active: true
      }
    });
  },

  async getActiveSession(discordUserId: string) {
    return prisma.workSession.findFirst({
      where: {
        user: { discord_user_id: discordUserId },
        status: 'ACTIVE'
      },
      include: {
        breaks: true,
        user: true
      }
    });
  },

  async startSession(discordUserId: string, username: string, displayName: string | undefined, channelId: string) {
    const user = await this.ensureUserExists(discordUserId, username, displayName);
    
    // Check for existing active session to avoid duplicates
    const existingSession = await this.getActiveSession(discordUserId);
    if (existingSession) {
      logger.warn(`User ${username} (${discordUserId}) already has an active session. Ignoring start request.`);
      return existingSession;
    }

    const session = await prisma.workSession.create({
      data: {
        user_id: user.id,
        channel_id: channelId,
        start_time: new Date(),
        status: 'ACTIVE'
      }
    });

    logger.info(`Started work session for user ${username}`);
    return session;
  },

  async closeSession(discordUserId: string) {
    const activeSession = await this.getActiveSession(discordUserId);
    if (!activeSession) {
      return null;
    }

    const endTime = new Date();
    const durationSeconds = Math.floor((endTime.getTime() - activeSession.start_time.getTime()) / 1000);

    // Close any active break
    const activeBreak = activeSession.breaks.find(b => b.end_time === null);
    if (activeBreak) {
      await prisma.break.update({
        where: { id: activeBreak.id },
        data: {
          end_time: endTime,
          duration_seconds: Math.floor((endTime.getTime() - activeBreak.start_time.getTime()) / 1000)
        }
      });
    }

    const closedSession = await prisma.workSession.update({
      where: { id: activeSession.id },
      data: {
        end_time: endTime,
        duration_seconds: durationSeconds,
        status: 'COMPLETED'
      }
    });

    // XP calculation: 10 XP per hour (1 XP per 6 minutes)
    const xpEarned = Math.floor(durationSeconds / 360);
    if (xpEarned > 0) {
      const user = await prisma.user.findUnique({ where: { id: activeSession.user_id } });
      if (user) {
        const newXp = user.xp + xpEarned;
        const newLevel = Math.floor(newXp / 100) + 1;
        await prisma.user.update({
          where: { id: user.id },
          data: { xp: newXp, level: newLevel }
        });
      }
    }

    logger.info(`Closed work session for user ${discordUserId}. Duration: ${durationSeconds}s`);
    return closedSession;
  },

  async setGoal(discordUserId: string, goal: string) {
    const activeSession = await this.getActiveSession(discordUserId);
    if (!activeSession) return null;

    return prisma.workSession.update({
      where: { id: activeSession.id },
      data: { goal }
    });
  },
  
  async reconcileSessions(currentVoiceMembers: string[], channelId: string) {
    // currentVoiceMembers = list of discord user IDs currently in the working channel
    logger.info('Reconciling sessions...');
    const activeSessions = await prisma.workSession.findMany({
      where: { status: 'ACTIVE' },
      include: { user: true }
    });
    
    let closedCount = 0;
    
    for (const session of activeSessions) {
      if (!currentVoiceMembers.includes(session.user.discord_user_id)) {
        // User is not in voice channel anymore, but session is active.
        // We close it. In a real-world scenario we might mark it as INTERRUPTED
        // but for MVP we just close it at the current time.
        await this.closeSession(session.user.discord_user_id);
        closedCount++;
      }
    }
    
    logger.info(`Reconciliation complete. Closed ${closedCount} orphaned sessions.`);
  }
};
