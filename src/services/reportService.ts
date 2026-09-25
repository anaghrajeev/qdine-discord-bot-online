import { prisma } from '../database/connection';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, subHours, addHours } from 'date-fns';
import { formatDurationString } from '../utils/time';
import { ENV } from '../config/environment';

// The business day starts at 4:00 AM and ends at 4:00 AM the next day.
function getCustomStartOfDay(date: Date): Date {
  return addHours(startOfDay(subHours(date, 4)), 4);
}
function getCustomEndOfDay(date: Date): Date {
  return addHours(endOfDay(subHours(date, 4)), 4);
}
function getCustomStartOfWeek(date: Date): Date {
  return addHours(startOfWeek(subHours(date, 4), { weekStartsOn: 1 }), 4);
}
function getCustomEndOfWeek(date: Date): Date {
  return addHours(endOfWeek(subHours(date, 4), { weekStartsOn: 1 }), 4);
}

export interface UserReport {
  discordUserId: string;
  username: string;
  displayName?: string;
  totalWorkSeconds: number;
  totalBreakSeconds: number;
  netWorkSeconds: number;
  sessionCount: number;
}

export const reportService = {
  async getDailyReport(date: Date = new Date()): Promise<UserReport[]> {
    const start = getCustomStartOfDay(date);
    const end = getCustomEndOfDay(date);

    return this.getReportForPeriod(start, end);
  },

  async getWeeklyReport(date: Date = new Date()): Promise<UserReport[]> {
    const start = getCustomStartOfWeek(date);
    const end = getCustomEndOfWeek(date);

    return this.getReportForPeriod(start, end);
  },

  async getReportForPeriod(start: Date, end: Date): Promise<UserReport[]> {
    const users = await prisma.user.findMany({
      where: { is_active: true }
    });

    const reports: UserReport[] = [];

    for (const user of users) {
      const sessions = await prisma.workSession.findMany({
        where: {
          user_id: user.id,
          start_time: { gte: start },
          created_at: { lte: end },
          status: { in: ['COMPLETED', 'ACTIVE'] } // Include active for ongoing calculation if needed
        },
        include: { breaks: true }
      });

      if (sessions.length === 0) continue;

      let totalWorkSeconds = 0;
      let totalBreakSeconds = 0;

      for (const session of sessions) {
        // Calculate work duration
        let sessionWorkSeconds = session.duration_seconds || 0;
        
        // If session is active, calculate duration up to now
        if (session.status === 'ACTIVE' && !session.end_time) {
           sessionWorkSeconds = Math.floor((new Date().getTime() - session.start_time.getTime()) / 1000);
        }
        
        totalWorkSeconds += sessionWorkSeconds;

        // Calculate break duration
        for (const b of session.breaks) {
          let breakDuration = b.duration_seconds || 0;
          if (!b.end_time) {
            breakDuration = Math.floor((new Date().getTime() - b.start_time.getTime()) / 1000);
          }
          totalBreakSeconds += breakDuration;
        }
      }

      const netWorkSeconds = Math.max(0, totalWorkSeconds - totalBreakSeconds);

      reports.push({
        discordUserId: user.discord_user_id,
        username: user.username,
        displayName: user.display_name || undefined,
        totalWorkSeconds,
        totalBreakSeconds,
        netWorkSeconds,
        sessionCount: sessions.length
      });
    }

    return reports;
  },
  
  async getUserTodayReport(discordUserId: string): Promise<UserReport | null> {
    const start = getCustomStartOfDay(new Date());
    const end = getCustomEndOfDay(new Date());
    
    const reports = await this.getReportForPeriod(start, end);
    return reports.find(r => r.discordUserId === discordUserId) || null;
  }
};
