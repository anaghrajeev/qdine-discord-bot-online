import { Client, VoiceChannel, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { logger } from '../../utils/logger';
import { ENV } from '../../config/environment';
import { workSessionService } from '../../services/workSessionService';
import { schedulerService } from '../../services/schedulerService';

export const handleReady = async (client: Client) => {
  logger.info(`Logged in as ${client.user?.tag}!`);

  try {
    const guild = await client.guilds.fetch(ENV.DISCORD_GUILD_ID);
    if (!guild) {
      logger.error('Guild not found!');
      return;
    }

    if (ENV.WORKING_CHANNEL_ID) {
      const channel = await guild.channels.fetch(ENV.WORKING_CHANNEL_ID);
      if (channel && channel.isVoiceBased()) {
        const membersInVoice = channel.members.map(m => m.user.id);
        await workSessionService.reconcileSessions(membersInVoice, channel.id);
        
        // Also auto-start sessions for users currently in the voice channel but don't have active sessions
        for (const [memberId, member] of channel.members) {
           await workSessionService.startSession(
             member.user.id, 
             member.user.username, 
             member.displayName, 
             channel.id
           );
        }
      }
    }

    schedulerService.init(client);
    await registerCommands(client);

  } catch (error) {
    logger.error('Error during ready event', error);
  }
};

const registerCommands = async (client: Client) => {
  const commands = [
    new SlashCommandBuilder().setName('work').setDescription('Show current work status'),
    new SlashCommandBuilder().setName('today').setDescription('Show today\'s working summary'),
    new SlashCommandBuilder().setName('week').setDescription('Show weekly working hours'),
    new SlashCommandBuilder().setName('status').setDescription('Show current team status'),
    new SlashCommandBuilder().setName('guide').setDescription('How to use the QDine Work Bot'),
    new SlashCommandBuilder().setName('dashboard').setDescription('Access the QDine admin dashboard'),
    new SlashCommandBuilder()
      .setName('purge')
      .setDescription('Delete a specified number of messages (Admin only)')
      .addIntegerOption(option => 
        option.setName('amount')
          .setDescription('Number of messages to delete (1-100)')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(100)
      ),
  ].map(command => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(ENV.DISCORD_TOKEN);

  try {
    logger.info('Started refreshing application (/) commands.');
    await rest.put(
      Routes.applicationGuildCommands(ENV.DISCORD_CLIENT_ID, ENV.DISCORD_GUILD_ID),
      { body: commands },
    );
    logger.info('Successfully reloaded application (/) commands.');
  } catch (error) {
    logger.error('Error registering commands', error);
  }
};
