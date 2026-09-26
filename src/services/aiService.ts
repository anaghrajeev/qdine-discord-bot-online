import Groq from 'groq-sdk';
import { ENV } from '../config/environment';
import { logger } from '../utils/logger';

export const aiService = {
  getGroq() {
    if (!process.env.GROQ_API_KEY) {
      logger.warn('GROQ_API_KEY is missing. AI features will be disabled.');
      return null;
    }
    return new Groq({ apiKey: process.env.GROQ_API_KEY });
  },

  async executeWithFallback(prompt: string, systemPrompt: string = ''): Promise<string> {
    const groq = this.getGroq();
    if (!groq) throw new Error("API Key missing");

    let models = [];
    try {
      const modelList = await groq.models.list();
      models = modelList.data.map((m: any) => m.id);
    } catch (error) {
      throw new Error("Failed to fetch available models from Groq API.");
    }
    
    // Sort so we try smaller/faster models first if possible
    models = models.sort((a, b) => {
      // Prioritize small/fast models
      if (a.includes('20b') || a.includes('8b')) return -1;
      if (b.includes('20b') || b.includes('8b')) return 1;
      return a.localeCompare(b);
    });

    const errors: any[] = [];

    for (const modelName of models) {
      // Skip audio/vision models that don't support text chat well
      if (modelName.toLowerCase().includes('whisper') || modelName.toLowerCase().includes('vision')) continue;
      
      try {
        const messages: any[] = [];
        if (systemPrompt) {
          messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });

        const result = await groq.chat.completions.create({
          messages: messages,
          model: modelName,
          temperature: 0.7,
          max_tokens: 256,
        });
        
        return result.choices[0]?.message?.content || "No response generated.";
      } catch (e: any) {
        errors.push({ model: modelName, error: e.message });
        logger.warn(`Model ${modelName} failed, trying next... Error: ${e.message}`);
      }
    }
    
    throw new Error(`All models failed: ${JSON.stringify(errors)}`);
  },

  async generateStandupMotivation(username: string, yesterday: string, today: string, blockers: string): Promise<string> {
    if (!process.env.GROQ_API_KEY) return `Thanks for the standup, ${username}! Keep up the great work!`;

    try {
      const systemPrompt = `You are a highly encouraging, casual, and energetic team motivator bot for a Discord server. Keep it under 150 characters. Use emojis.`;
      const prompt = `A developer named ${username} just submitted their daily standup.
Yesterday they did: ${yesterday}
Today they will do: ${today}
Blockers/Issues: ${blockers}

Write a short, 1-2 sentence encouraging response to them. 
If they have a blocker, offer brief sympathy or tell the team to help out.`;

      return await this.executeWithFallback(prompt, systemPrompt);
    } catch (error) {
      logger.error('Error generating AI motivation:', error);
      return `Thanks for the standup, ${username}! Let's crush it today! 🚀`;
    }
  },

  async answerQuestion(username: string, question: string, bugContext: string): Promise<string> {
    if (!process.env.GROQ_API_KEY) return "Sorry, my AI features are currently disabled because the API key is missing!";

    try {
      const systemPrompt = `You are Tempo AI, a highly intelligent and helpful bot for a software development team on Discord.
Instructions:
1. Provide the best crafted, most helpful answer.
2. If they ask about bugs or work, use the context provided.
3. Keep your reply strictly under 100 words. Be concise and direct.
4. Keep the tone friendly and lively.`;

      const prompt = `The user asking the question is named: ${username}.

Here is the current state of the team's bug tracker and active work sessions:
${bugContext}

The user asked: "${question}"`;

      return await this.executeWithFallback(prompt, systemPrompt);
    } catch (error: any) {
      logger.error('Error answering question with AI:', error);
      return `I'm sorry, my brain experienced a glitch! Error: ${error?.message || String(error)}`;
    }
  },

  async generateBugFixCelebration(username: string, bugDescription: string): Promise<string> {
    if (!process.env.GROQ_API_KEY) return `✅ Bug fixed: ${bugDescription}. Great job, ${username}!`;

    try {
      const systemPrompt = "You are Tempo AI, a hype-man bot for a dev team.";
      const prompt = `Developer ${username} just completed this bug/task: "${bugDescription}"
Write a 1-sentence public celebration message to hype them up. Use an emoji. Keep it under 100 characters.`;

      return await this.executeWithFallback(prompt, systemPrompt);
    } catch (error) {
      return `✅ Bug fixed: ${bugDescription}. Great job, ${username}!`;
    }
  }
};
