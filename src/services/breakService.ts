import { prisma } from '../database/connection';
import { workSessionService } from './workSessionService';
import { logger } from '../utils/logger';

export const breakService = {
  async startBreak(discordUserId: string) {
    const session = await workSessionService.getActiveSession(discordUserId);
    if (!session) {
      return null;
    }

    const activeBreak = session.breaks.find(b => b.end_time === null);
    if (activeBreak) {
      return activeBreak;
    }

    const newBreak = await prisma.break.create({
      data: {
        user_id: session.user_id,
        session_id: session.id,
        start_time: new Date()
      }
    });

    logger.info(`Started break for user ${discordUserId}`);
    return newBreak;
  },

  async endBreak(discordUserId: string) {
    const session = await workSessionService.getActiveSession(discordUserId);
    if (!session) {
      return null;
    }

    const activeBreak = session.breaks.find(b => b.end_time === null);
    if (!activeBreak) {
      return null;
    }

    const endTime = new Date();
    const durationSeconds = Math.floor((endTime.getTime() - activeBreak.start_time.getTime()) / 1000);

    const endedBreak = await prisma.break.update({
      where: { id: activeBreak.id },
      data: {
        end_time: endTime,
        duration_seconds: durationSeconds
      }
    });

    logger.info(`Ended break for user ${discordUserId}. Duration: ${durationSeconds}s`);
    return endedBreak;
  }
};
