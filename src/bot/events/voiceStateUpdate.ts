import { VoiceState, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from 'discord.js';
import { ENV } from '../../config/environment';
import { workSessionService } from '../../services/workSessionService';
import { breakService } from '../../services/breakService';
import { logger } from '../../utils/logger';

export const handleVoiceStateUpdate = async (oldState: VoiceState, newState: VoiceState) => {
  const userId = newState.member?.user.id || oldState.member?.user.id;
  const username = newState.member?.user.username || oldState.member?.user.username || 'unknown';
  const displayName = newState.member?.displayName || oldState.member?.displayName;

  if (!userId || !ENV.WORKING_CHANNEL_ID) return;

  const oldChannel = oldState.channelId;
  const newChannel = newState.channelId;
  
  // Prevent duplicate events
  if (oldChannel === newChannel) return;

  try {
    // User joins the working channel
    if (newChannel === ENV.WORKING_CHANNEL_ID) {
      const existingSession = await workSessionService.getActiveSession(userId);
      
      if (!existingSession) {
        // Start a new session
        await workSessionService.startSession(userId, username, displayName, newChannel);
        
        // Send a button to set a goal
        if (ENV.REPORT_CHANNEL_ID && newState.guild) {
          const reportChannel = await newState.guild.channels.fetch(ENV.REPORT_CHANNEL_ID) as TextChannel;
          if (reportChannel) {
            const row = new ActionRowBuilder<ButtonBuilder>()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId(`set_goal_${userId}`)
                  .setLabel('🎯 Set Focus Goal')
                  .setStyle(ButtonStyle.Primary),
              );

            await reportChannel.send({
              content: `🟢 **${displayName || username}** started working!`,
              components: [row]
            });
          }
        }
      } else {
        // End break if coming back
        await breakService.endBreak(userId);
      }
    } 
    // User joins the break channel
    else if (ENV.BREAK_CHANNEL_ID && newChannel === ENV.BREAK_CHANNEL_ID) {
      const existingSession = await workSessionService.getActiveSession(userId);
      if (existingSession) {
        // Start a break
        await breakService.startBreak(userId);
      }
    }
    // User leaves both working and break channels (disconnects or moves elsewhere)
    else {
      const existingSession = await workSessionService.getActiveSession(userId);
      
      if (existingSession) {
        // Close the work session
        await workSessionService.closeSession(userId);
      }
    }
  } catch (error) {
    logger.error('Error handling voice state update', error);
  }
};
