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

// Every voice has its own greeting. Some address the user by name, others
// introduce Twinkle AI instead ("{name}" is replaced with the user's name).
const VOICE_GREETINGS: Record<string, string> = {
  Zephyr: 'Hi {name}, bright and early, I am Twinkle AI. Ready when you are!',
  Puck: 'Hey {name}! Twinkle AI here, let us make something fun happen.',
  Charon: 'Hello {name}. I am Twinkle AI. How can I help you today?',
  Kore: 'Hi, I am Twinkle AI. Tell me what you need and we will get it done.',
  Fenrir: 'Whoa, hi {name}! Twinkle AI is fired up and ready to go!',
  Leda: 'Hi there, I am Twinkle AI! So excited to chat with you.',
  Orus: 'Good to meet you, {name}. Twinkle AI at your service.',
  Aoede: 'Hey {name}, it is Twinkle AI. Nice and easy, what is on your mind?',
  Callirrhoe: 'Hi, this is Twinkle AI. No rush, take your time.',
  Autonoe: 'Hello {name}! Twinkle AI here, ready to brighten your day.',
  Enceladus: 'Hi... I am Twinkle AI. I am here whenever you want to talk.',
  Iapetus: 'Hello {name}. Twinkle AI here, speaking loud and clear.',
  Umbriel: 'Hey, Twinkle AI here. What are we up to today?',
  Algieba: 'Hi {name}, smooth to meet you. I am Twinkle AI.',
  Despina: 'Hello, I am Twinkle AI. Let us have a lovely conversation.',
  Erinome: 'Hi {name}, this is Twinkle AI. Ask me anything.',
  Algenib: 'Well hello there, I am Twinkle AI. Let us get started.',
  Rasalgethi: 'Greetings {name}. I am Twinkle AI, your assistant for answers.',
  Laomedeia: 'Hi hi! Twinkle AI here, and I am ready for anything!',
  Achernar: 'Hello, I am Twinkle AI. I am listening whenever you are ready.',
  Alnilam: 'Hi {name}. Twinkle AI is ready. Let us begin.',
  Schedar: 'Hello, this is Twinkle AI. How may I assist you?',
  Gacrux: 'Hello {name}, I am Twinkle AI. It is a pleasure to talk with you.',
  Pulcherrima: 'Hi, Twinkle AI here. Let us dive right in!',
  Achird: 'Hey {name}, great to see you! I am Twinkle AI.',
  Zubenelgenubi: 'Hey, what is up? Twinkle AI here, just say the word.',
  Vindemiatrix: 'Hello {name}, I am Twinkle AI. I am glad you are here.',
  Sadachbia: 'Hi {name}! Twinkle AI is here and feeling lively!',
  Sadaltager: 'Hello, I am Twinkle AI. Ask me anything and I will explain.',
  Sulafat: 'Hi {name}, welcome. I am Twinkle AI, happy to help.',
};

export function getVoiceGreeting(voiceName: string, userName?: string | null): string {
  const name = (userName || '').trim();
  const template = VOICE_GREETINGS[voiceName] || 'Hi {name}, I am Twinkle AI.';
  if (!template.includes('{name}')) return template;
  // With no known name, fall back to a greeting that does not need one.
  return name ? template.replace('{name}', name) : template.replace('Hi {name}', 'Hi').replace('{name}', 'there');
}
