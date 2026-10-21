export type VoiceOption = {
  name: string;
  description: string;
};

export const VOICES: VoiceOption[] = [
  { name: 'Zephyr', description: 'Bright' },
  { name: 'Puck', description: 'Upbeat' },
  { name: 'Charon', description: 'Informative · clear' },
  { name: 'Kore', description: 'Firm' },
  { name: 'Fenrir', description: 'Excitable' },
  { name: 'Leda', description: 'Youthful' },
  { name: 'Orus', description: 'Firm' },
  { name: 'Aoede', description: 'Breezy' },
  { name: 'Callirrhoe', description: 'Easy-going' },
  { name: 'Autonoe', description: 'Bright' },
  { name: 'Enceladus', description: 'Breathy' },
  { name: 'Iapetus', description: 'Clear' },
  { name: 'Umbriel', description: 'Easy-going' },
  { name: 'Algieba', description: 'Smooth' },
  { name: 'Despina', description: 'Smooth' },
  { name: 'Erinome', description: 'Clear' },
  { name: 'Algenib', description: 'Gravelly' },
  { name: 'Rasalgethi', description: 'Informative' },
  { name: 'Laomedeia', description: 'Upbeat' },
  { name: 'Achernar', description: 'Soft' },
  { name: 'Alnilam', description: 'Firm' },
  { name: 'Schedar', description: 'Even' },
  { name: 'Gacrux', description: 'Mature' },
  { name: 'Pulcherrima', description: 'Forward' },
  { name: 'Achird', description: 'Friendly' },
  { name: 'Zubenelgenubi', description: 'Casual' },
  { name: 'Vindemiatrix', description: 'Gentle' },
  { name: 'Sadachbia', description: 'Lively' },
  { name: 'Sadaltager', description: 'Knowledgeable' },
  { name: 'Sulafat', description: 'Warm' },
];

export const DEFAULT_VOICE = 'Charon';
export const VOICE_STORAGE_KEY = 'twinkle_live_voice';

// Every voice has its own greeting, and each one uses the voice's own name
// instead of the product name. They fall into three styles:
//   1. introduces itself by its voice name ("I'm Zephyr"),
//   2. simply greets the user,
//   3. invites the first question.
// "{name}" is replaced with the user's name.
const VOICE_GREETINGS: Record<string, string> = {
  // Style 1: introduces itself by voice name
  Zephyr: 'Hi {name}, I am Zephyr. Bright and early, and ready when you are!',
  Charon: 'Hello {name}. This is Charon, clear and ready to help.',
  Kore: 'Hi, I am Kore. Tell me what you need and we will get it done.',
  Orus: 'Good to meet you, {name}. I am Orus, at your service.',
  Algieba: 'Hi {name}, smooth to meet you. I am Algieba.',
  Gacrux: 'Hello {name}, I am Gacrux. It is a pleasure to talk with you.',
  Achird: 'Hey {name}, great to see you! I am Achird.',
  Vindemiatrix: 'Hello {name}, I am Vindemiatrix. I am glad you are here.',
  Sulafat: 'Hi {name}, welcome. I am Sulafat, happy to help.',
  Rasalgethi: 'Greetings {name}. I am Rasalgethi, your guide for clear answers.',

  // Style 2: just a friendly greeting
  Puck: 'Hey {name}! Let us make something fun happen today.',
  Fenrir: 'Whoa, hi {name}! I am fired up and ready to go!',
  Leda: 'Hi there! So excited to chat with you.',
  Aoede: 'Hey {name}, nice and easy today. Good to hear from you.',
  Callirrhoe: 'Hi {name}. No rush, take your time.',
  Autonoe: 'Hello {name}! Ready to brighten your day.',
  Enceladus: 'Hi... I am here whenever you want to talk.',
  Umbriel: 'Hey {name}, good to see you. What are we up to today?',
  Sadachbia: 'Hi {name}! Feeling lively today, and so glad you are here!',
  Zubenelgenubi: 'Hey {name}, what is up? Good to hear from you.',

  // Style 3: invites the first question
  Iapetus: 'Hello {name}. Go ahead and ask me your first question.',
  Despina: 'Hello! What would you like to talk about first?',
  Erinome: 'Hi {name}. Ask me anything to get started.',
  Algenib: 'Well hello there. What is the first thing on your mind?',
  Laomedeia: 'Hi hi! What question can I tackle first?',
  Achernar: 'Hello. Whenever you are ready, ask me anything.',
  Alnilam: 'Hi {name}. Ready when you are. What is your first question?',
  Schedar: 'Hello. How may I assist you today?',
  Pulcherrima: 'Hi! Let us dive right in. What do you want to know?',
  Sadaltager: 'Hello {name}. Ask me anything and I will explain it.',
};

export function getVoiceGreeting(voiceName: string, userName?: string | null): string {
  const name = (userName || '').trim();
  const template = VOICE_GREETINGS[voiceName] || `Hi {name}, I am ${voiceName}.`;
  if (!template.includes('{name}')) return template;
  // With no known name, drop it gracefully instead of leaving a placeholder.
  return name
    ? template.replace(/\{name\}/g, name)
    : template
        .replace(/^Hi \{name\}/, 'Hi')
        .replace(/^Hello \{name\}/, 'Hello')
        .replace(/^Hey \{name\}/, 'Hey')
        .replace(/ \{name\}/g, '')
        .replace(/\{name\}/g, 'there');
}
