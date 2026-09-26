import { Message } from 'discord.js';
import { aiService } from '../../services/aiService';
import { prisma } from '../../database/connection';
import { logger } from '../../utils/logger';

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

      const combinedContext = `BUGS:\n${bugContext}\nWORKING NOW:\n${workContext}`;

      const answer = await aiService.answerQuestion(username, question, combinedContext);
      
      await message.reply(answer);
    } catch (error: any) {
      logger.error('Error in messageCreate AI handling:', error);
      await message.reply(`Sorry, my brain glitched! Error: ${error?.message || String(error)}`);
    }
  }
};
