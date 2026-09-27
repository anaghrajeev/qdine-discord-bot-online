import { Message } from 'discord.js';
import { aiService } from '../../services/aiService';
import { prisma } from '../../database/connection';
import { logger } from '../../utils/logger';
import { reportService } from '../../services/reportService';
import { formatDurationString } from '../../utils/time';

export const handleMessageCreate = async (message: Message) => {
  // Ignore bots to prevent infinite loops
  if (message.author.bot) return;

  // Check if the bot is mentioned
  if (message.mentions.has(message.client.user!.id)) {
    // Show typing indicator
    await (message.channel as any).sendTyping();

    // Clean up the mention from the question
    const question = message.content.replace(/<@!?[0-9]+>/g, '').trim();
    const username = message.member?.displayName || message.author.username;

    try {
      // Gather context
      const bugs = await prisma.bug.findMany({ include: { assignee: true, reporter: true } });
      let bugContext = '';
      bugs.forEach((b: any) => {
        bugContext += `Bug #${b.id}: "${b.description}" - Assigned to: ${b.assignee?.display_name || b.assignee?.username} - Status: ${b.status}\n`;
      });
      if (bugs.length === 0) bugContext = 'No open bugs.';

      const activeSessions = await prisma.workSession.findMany({
        where: { status: 'ACTIVE' },
        include: { user: true }
      });
      
      let workContext = '';
      activeSessions.forEach((s: any) => {
        workContext += `${s.user.display_name || s.user.username} is currently working on: ${s.goal || 'No goal set'}\n`;
      });
      if (activeSessions.length === 0) workContext = 'Nobody is currently working.';

      // Get dashboard data (Reports)
      const dailyReport = await reportService.getDailyReport();
      const weeklyReport = await reportService.getWeeklyReport();

      let statsContext = "TODAY'S WORK HOURS:\n";
      dailyReport.forEach(r => {
         statsContext += `- ${r.displayName || r.username}: ${formatDurationString(r.netWorkSeconds)} (${r.sessionCount} sessions)\n`;
      });
      if (dailyReport.length === 0) statsContext += 'No work logged today yet.\n';

      statsContext += "\nTHIS WEEK'S WORK HOURS:\n";
      weeklyReport.forEach(r => {
         statsContext += `- ${r.displayName || r.username}: ${formatDurationString(r.netWorkSeconds)} (${r.sessionCount} sessions)\n`;
      });
      if (weeklyReport.length === 0) statsContext += 'No work logged this week yet.\n';

      // Get CRM Leads Data
      const activeLeads = await prisma.lead.findMany({
        where: { status: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] } },
        include: { owner: true }
      });
      let crmContext = 'ACTIVE CRM LEADS:\n';
      activeLeads.forEach((l: any) => {
        crmContext += `- ${l.client_name} (${l.company}) | Status: ${l.status} | Owner: ${l.owner.display_name || l.owner.username} | Notes: ${l.notes || 'None'}\n`;
      });
      if (activeLeads.length === 0) crmContext += 'No active leads in pipeline.\n';

      const combinedContext = `BUGS:\n${bugContext}\n\nWORKING NOW:\n${workContext}\n\n${statsContext}\n\n${crmContext}`;

      const fetchedMessages = await message.channel.messages.fetch({ limit: 6 });
      const chatHistory = fetchedMessages
        .filter(m => m.id !== message.id)
        .reverse()
        .map(m => `${m.author.username}: ${m.content.replace(/<@!?[0-9]+>/g, '@Bot')}`)
        .join('\n');

      const answer = await aiService.answerQuestion(username, question, combinedContext, chatHistory);
      
      await message.reply(answer);
    } catch (error: any) {
      logger.error('Error in messageCreate AI handling:', error);
      await message.reply(`Sorry, my brain glitched! Error: ${error?.message || String(error)}`);
    }
  }
};
