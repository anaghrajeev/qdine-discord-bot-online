import { prisma } from '../database/connection';
import { logger } from '../utils/logger';
import { client } from '../bot/client';
import { formatDurationString } from '../utils/time';

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

    // End-of-Day Wrap-Up: If they worked for > 2 hours (7200s), send a DM
    if (durationSeconds >= 7200) {
      try {
        const discordUser = await client.users.fetch(discordUserId);
        if (discordUser) {
          const durationStr = formatDurationString(durationSeconds);
          await discordUser.send(`🌅 Great shift today! You worked for **${durationStr}**.\nWhen you get a chance, drop a quick note in the server about what you accomplished so the team knows! Rest up!`);
        }
      } catch (err) {
        logger.error(`Could not send end-of-day DM to ${discordUserId}:`, err);
      }
    }

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
  },
  
  async checkBurnout() {
    // Called every X minutes by a background timer
    const activeSessions = await prisma.workSession.findMany({
      where: { status: 'ACTIVE' },
      include: { user: true, breaks: true }
    });

    const now = new Date().getTime();
    
    for (const session of activeSessions) {
      // If they have an active break, they aren't burning out right now
      const hasActiveBreak = session.breaks.some(b => b.end_time === null);
      if (hasActiveBreak) continue;

      const durationMs = now - session.start_time.getTime();
      const hours = durationMs / (1000 * 60 * 60);

      // If they've been working continuously for > 3 hours
      if (hours >= 3) {
        // We need a way to only notify once per session.
        // For simplicity, since Prisma schema doesn't have `notified_burnout`,
        // we'll just check if it's exactly between 3.0 and 3.1 hours to only send once.
        if (hours >= 3.0 && hours <= 3.1) {
          try {
            const discordUser = await client.users.fetch(session.user.discord_user_id);
            if (discordUser) {
              await discordUser.send(`💧 **Burnout Check!** You've been working continuously for over 3 hours! Please remember to hydrate and step away from the screen for a few minutes. Joining the break room pauses your timer!`);
            }
          } catch (err) {
            logger.error(`Could not send burnout DM to ${session.user.discord_user_id}:`, err);
          }
        }
      }
    }
  }
};
