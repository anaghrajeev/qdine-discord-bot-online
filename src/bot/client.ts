import { Client, GatewayIntentBits, Partials, Collection } from 'discord.js';
import { ENV } from '../config/environment';

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.User, Partials.GuildMember]
});

// We can extend client to hold commands if needed, but for MVP we will handle them in interactionCreate directly
