
import { useCallback, useEffect, useRef, type ChangeEvent, type KeyboardEvent, type RefObject } from 'react';

const STORAGE_KEY = 'Twinkle_autocorrect';

export function isAutocorrectEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setAutocorrectEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    /* storage unavailable */
  }
}

const TYPOS: Record<string, string> = {
  dont: "don't", cant: "can't", im: "I'm", ive: "I've",
  isnt: "isn't", arent: "aren't", wasnt: "wasn't", werent: "weren't",
  doesnt: "doesn't", didnt: "didn't", hasnt: "hasn't", havent: "haven't",
  hadnt: "hadn't", couldnt: "couldn't", shouldnt: "shouldn't", wouldnt: "wouldn't",
  thats: "that's", whats: "what's", youre: "you're", theyre: "they're",
  youve: "you've", theyve: "they've", youll: "you'll", theyll: "they'll",
  weve: "we've", itll: "it'll", wouldve: "would've", couldve: "could've",
  shouldve: "should've", mustnt: "mustn't", hows: "how's", whos: "who's",
  teh: 'the', hte: 'the', thier: 'their', ther: 'there',
  adn: 'and', nad: 'and', taht: 'that', thta: 'that',
  wiht: 'with', waht: 'what', wath: 'what', jsut: 'just',
  juts: 'just', yuo: 'you', yoru: 'your', youur: 'your',
  cna: 'can', ahve: 'have', hvae: 'have', haev: 'have',
  thsi: 'this', tihs: 'this', htis: 'this', woudl: 'would',
  wuold: 'would', coudl: 'could', shoudl: 'should', shuold: 'should',
  becuase: 'because', becasue: 'because', beacuse: 'because', becuz: 'because',
  bcause: 'because', becaus: 'because', beause: 'because', abotu: 'about',
  aobut: 'about', anbout: 'about', abuot: 'about', wnat: 'want',
  wnats: 'wants', whcih: 'which', whihc: 'which', wich: 'which',
  woudnt: "wouldn't", thnk: 'think', thikn: 'think', konw: 'know',
  knwo: 'know', kown: 'known', nkow: 'know', seperate: 'separate',
  seperately: 'separately', definately: 'definitely', definitly: 'definitely', defintely: 'definitely',
  definatly: 'definitely', recieve: 'receive', recieved: 'received', reciept: 'receipt',
  beleive: 'believe', belive: 'believe', beleif: 'belief', acheive: 'achieve',
  acheived: 'achieved', wierd: 'weird', freind: 'friend', freinds: 'friends',
  frend: 'friend', occured: 'occurred', occurence: 'occurrence', occuring: 'occurring',
  untill: 'until', unitl: 'until', tommorow: 'tomorrow', tomorow: 'tomorrow',
  tommorrow: 'tomorrow', yesturday: 'yesterday', yestarday: 'yesterday', tonite: 'tonight',
  thru: 'through', thourgh: 'through', throught: 'thought', thougth: 'thought',
  thoguht: 'thought', alot: 'a lot', infact: 'in fact', incase: 'in case',
  noone: 'no one', everytime: 'every time', eachother: 'each other', goverment: 'government',
  enviroment: 'environment', enviornment: 'environment', buisness: 'business', bussiness: 'business',
  busines: 'business', begining: 'beginning', beggining: 'beginning', comming: 'coming',
  runing: 'running', geting: 'getting', gettin: 'getting', writting: 'writing',
  writeing: 'writing', makeing: 'making', takeing: 'taking', haveing: 'having',
  usign: 'using', useing: 'using', diffrent: 'different', diffirent: 'different',
  differnt: 'different', diffrence: 'difference', differance: 'difference', importnat: 'important',
  imporant: 'important', importent: 'important', improtant: 'important', neccessary: 'necessary',
  necesary: 'necessary', neccesary: 'necessary', necessery: 'necessary', accomodate: 'accommodate',
  acommodate: 'accommodate', adress: 'address', addres: 'address', agian: 'again',
  agin: 'again', aganist: 'against', alreayd: 'already', alredy: 'already',
  allways: 'always', alwasy: 'always', alawys: 'always', awlays: 'always',
  amoung: 'among', anwser: 'answer', anser: 'answer', answeer: 'answer',
  anyhting: 'anything', anythign: 'anything', anyting: 'anything', anywya: 'anyway',
  apparantly: 'apparently', apparenty: 'apparently', appearence: 'appearance', arguement: 'argument',
  arguemnt: 'argument', assistent: 'assistant', atleast: 'at least', attension: 'attention',
  awsome: 'awesome', awesom: 'awesome', basicly: 'basically', basiclly: 'basically',
  beautifull: 'beautiful', beutiful: 'beautiful', bewteen: 'between', betwen: 'between',
  beteen: 'between', brodcast: 'broadcast', calender: 'calendar', carefull: 'careful',
  cheif: 'chief', choise: 'choice', chnage: 'change', chagne: 'change',
  cahnge: 'change', collegue: 'colleague', comapny: 'company', compnay: 'company',
  compay: 'company', completly: 'completely', comptuer: 'computer', compter: 'computer',
  conciousness: 'consciousness', contiue: 'continue', continu: 'continue', copmany: 'company',
  corect: 'correct', correcly: 'correctly', curiousity: 'curiosity', currenly: 'currently',
  curently: 'currently', decison: 'decision', desicion: 'decision', descision: 'decision',
  develope: 'develop', developement: 'development', devleop: 'develop', diffcult: 'difficult',
  dificult: 'difficult', difficulity: 'difficulty', dissapear: 'disappear', dissapoint: 'disappoint',
  disapointed: 'disappointed', doesn: "doesn't", eaisly: 'easily', easly: 'easily',
  eigth: 'eighth', embarass: 'embarrass', embarassed: 'embarrassed', enought: 'enough',
  enogh: 'enough', enuf: 'enough', equiptment: 'equipment', especally: 'especially',
  especialy: 'especially', everthing: 'everything', everyting: 'everything', eveything: 'everything',
  exampel: 'example', exmaple: 'example', examle: 'example', excellant: 'excellent',
  excercise: 'exercise', exersize: 'exercise', exerice: 'exercise', existance: 'existence',
  experiance: 'experience', experince: 'experience', explaination: 'explanation', explian: 'explain',
  explan: 'explain', familar: 'familiar', famly: 'family', familiy: 'family',
  fianlly: 'finally', finaly: 'finally', finnaly: 'finally', foward: 'forward',
  forwad: 'forward', foriegn: 'foreign', fourty: 'forty', funtion: 'function',
  fucntion: 'function', functoin: 'function', futher: 'further', gaurd: 'guard',
  garantee: 'guarantee', guarentee: 'guarantee', generaly: 'generally', genral: 'general',
  goign: 'going', gonig: 'going', gving: 'giving', grammer: 'grammar',
  gramar: 'grammar', gratefull: 'grateful', happend: 'happened', happenned: 'happened',
  hapening: 'happening', hapen: 'happen', happpy: 'happy', heigth: 'height',
  hieght: 'height', helpfull: 'helpful', hopefuly: 'hopefully', humourous: 'humorous',
  ignorence: 'ignorance', imediately: 'immediately', immediatly: 'immediately', immediatley: 'immediately',
  imagin: 'imagine', implment: 'implement', implemet: 'implement', incorect: 'incorrect',
  indentical: 'identical', independant: 'independent', infomation: 'information', informaiton: 'information',
  infromation: 'information', intrested: 'interested', intresting: 'interesting', interesing: 'interesting',
  interupt: 'interrupt', intial: 'initial', itslef: 'itself', jewelery: 'jewelry',
  knowlege: 'knowledge', knowledgable: 'knowledgeable', langauge: 'language', languge: 'language',
  lanuage: 'language', laguage: 'language', libary: 'library', libray: 'library',
  lenght: 'length', lengh: 'length', lisence: 'license', liscense: 'license',
  litle: 'little', lonley: 'lonely', mabye: 'maybe', maybee: 'maybe',
  mesage: 'message', messege: 'message', miniture: 'miniature', mispell: 'misspell',
  mroe: 'more', moeny: 'money', mony: 'money', mysefl: 'myself',
  myslef: 'myself', naturaly: 'naturally', neccesity: 'necessity', negociate: 'negotiate',
  nieghbor: 'neighbor', nothign: 'nothing', nothng: 'nothing', noticable: 'noticeable',
  numbr: 'number', nuber: 'number', ocasion: 'occasion', occassion: 'occasion',
  occasionaly: 'occasionally', offical: 'official', oftne: 'often', omision: 'omission',
  oppurtunity: 'opportunity', opportunty: 'opportunity', oppertunity: 'opportunity', orginal: 'original',
  origional: 'original', otehr: 'other', otheer: 'other', ouptut: 'output',
  outpt: 'output', paralel: 'parallel', particulary: 'particularly', pasword: 'password',
  passowrd: 'password', paswrod: 'password', peice: 'piece', peple: 'people',
  poeple: 'people', peopel: 'people', pepole: 'people', perfomance: 'performance',
  performace: 'performance', perhasp: 'perhaps', perhapse: 'perhaps', persistant: 'persistent',
  personaly: 'personally', pernoal: 'personal', phoneix: 'phoenix', plesae: 'please',
  pleae: 'please', pleas: 'please', pls: 'please', plz: 'please',
  plase: 'please', posible: 'possible', possable: 'possible', possibel: 'possible',
  possibley: 'possibly', practicle: 'practical', prefered: 'preferred', prefrence: 'preference',
  presense: 'presence', priviledge: 'privilege', probaly: 'probably', probly: 'probably',
  probablly: 'probably', problme: 'problem', porblem: 'problem', probelm: 'problem',
  procede: 'proceed', proccess: 'process', proces: 'process', proffesional: 'professional',
  profesional: 'professional', programing: 'programming', progamming: 'programming', progam: 'program',
  porgram: 'program', pronounciation: 'pronunciation', publically: 'publicly', quesiton: 'question',
  questoin: 'question', qeustion: 'question', questin: 'question', realy: 'really',
  realyl: 'really', rellay: 'really', reallly: 'really', relaly: 'really',
  reccomend: 'recommend', recomend: 'recommend', recommed: 'recommend', refering: 'referring',
  relevent: 'relevant', relevan: 'relevant', religous: 'religious', remeber: 'remember',
  rember: 'remember', rememeber: 'remember', remmber: 'remember', repeatition: 'repetition',
  resistence: 'resistance', responce: 'response', respone: 'response', responsability: 'responsibility',
  resturant: 'restaurant', restaraunt: 'restaurant', rythm: 'rhythm', ridiculus: 'ridiculous',
  sentance: 'sentence', senetence: 'sentence', sincerly: 'sincerely', skilfull: 'skillful',
  similiar: 'similar', simlar: 'similar', somethign: 'something', somthing: 'something',
  somehting: 'something', somtimes: 'sometimes', sometmes: 'sometimes', sometiems: 'sometimes',
  somwhere: 'somewhere', soemone: 'someone', someoen: 'someone', specificly: 'specifically',
  specifc: 'specific', speach: 'speech', stoped: 'stopped', stregnth: 'strength',
  strenght: 'strength', studing: 'studying', succesful: 'successful', successfull: 'successful',
  sucess: 'success', succes: 'success', suprise: 'surprise', surprize: 'surprise',
  supose: 'suppose', suposed: 'supposed', sureley: 'surely', tecnology: 'technology',
  techology: 'technology', temperture: 'temperature', tendancy: 'tendency', therfore: 'therefore',
  therefor: 'therefore', thigns: 'things', thign: 'thing', thnig: 'thing',
  tihng: 'thing', toghether: 'together', togther: 'together', tounge: 'tongue',
  truely: 'truly', tryied: 'tried', tyring: 'trying', tpye: 'type',
  tyep: 'type', undertsand: 'understand', understnad: 'understand', understan: 'understand',
  undersand: 'understand', unfortunatly: 'unfortunately', unforseen: 'unforeseen', usally: 'usually',
  usualy: 'usually', usuall: 'usually', vaccum: 'vacuum', vaule: 'value',
  vlaue: 'value', varable: 'variable', varaible: 'variable', vairable: 'variable',
  vehical: 'vehicle', visable: 'visible', wating: 'waiting', watn: 'want',
  wehn: 'when', whn: 'when', whne: 'when', wether: 'whether',
  whther: 'whether', whoel: 'whole', wihch: 'which', willl: 'will',
  wiull: 'will', workign: 'working', wroking: 'working', worke: 'work',
  wokr: 'work', wrok: 'work', wrold: 'world', wolrd: 'world',
  woudn: 'would', writen: 'written', wrtie: 'write', wirte: 'write',
  yeild: 'yield', youself: 'yourself', yourselfe: 'yourself', hellp: 'help',
  hepl: 'help', hlep: 'help', whay: 'what', hwo: 'how',
  hwat: 'what', hwy: 'why', whta: 'what', frist: 'first',
  firts: 'first', fisrt: 'first', secnod: 'second', thrid: 'third',
  becom: 'become', becoem: 'become', beocme: 'become', bening: 'being',
  beng: 'being', befor: 'before', befroe: 'before', beofre: 'before',
  beacause: 'because', doign: 'doing', dioing: 'doing', doin: 'doing',
  dosn: "doesn't", didn: "didn't", tahnks: 'thanks', thanx: 'thanks',
  thnaks: 'thanks', thankyou: 'thank you', thx: 'thanks', tkae: 'take',
  tkaing: 'taking', mkae: 'make', amke: 'make', maek: 'make',
  amking: 'making', giev: 'give', gvie: 'give', hlp: 'help',
  exacly: 'exactly', exatly: 'exactly', exatcly: 'exactly', simpley: 'simply',
  simplely: 'simply', quickyl: 'quickly', quikly: 'quickly', slowely: 'slowly',
  cleary: 'clearly', creat: 'create', craete: 'create', cretae: 'create',
  ceate: 'create', delte: 'delete', deleet: 'delete', delet: 'delete',
  updat: 'update', udpate: 'update', upadte: 'update', serach: 'search',
  searhc: 'search', saerch: 'search', seach: 'search', sreach: 'search',
  opne: 'open', oepn: 'open', clsoe: 'close', cloes: 'close',
  svae: 'save', sav: 'save', chekc: 'check', cehck: 'check',
  chcek: 'check', cheak: 'check', tset: 'test', tesst: 'test',
  allready: 'already',
};

// ---------------------------------------------------------------------------
// Dictionary-based correction (edit distance 1) for misspellings that are not
// in the TYPOS table. The ~10k word list is loaded lazily on first use; until
// it is ready only the TYPOS table applies.
// ---------------------------------------------------------------------------

// Valid words that are rare in general English but common in this app.
const EXTRA_KNOWN =
  'javascript typescript python kubernetes docker postgres postgresql mysql mongodb redis spring hibernate ' +
  'react vercel render neon groq gemini cloudflare github gitlab chatgpt openai anthropic claude twinkle ' +
  'backend frontend fullstack localhost endpoint endpoints async await boolean config configs repo repos ' +
  'auth oauth otp json yaml regex webhook webhooks middleware tailwind nextjs nodejs npm sql nosql graphql ' +
  'vscode linux ubuntu macos android iphone ipad chatbot chatbots tokenizer embeddings rag llm llms ' +
  'namespace namespaces dropdown textarea checkbox navbar sidebar favicon username usernames signup login logout ' +
  'telugu hindi tamil kannada kurnool andhra pradesh';

let dictionary: Map<string, number> | null = null;
let dictionaryLoading: Promise<void> | null = null;
const extraKnown = new Set(EXTRA_KNOWN.split(' '));

export function loadAutocorrectDictionary(): Promise<void> {
  if (dictionary) return Promise.resolve();
  if (!dictionaryLoading) {
    dictionaryLoading = import('./commonWords')
      .then(module => {
        const map = new Map<string, number>();
        const words = module.default.split(' ');
        for (let i = 0; i < words.length; i++) map.set(words[i], i);
        dictionary = map;
      })
      .catch(() => {
        dictionaryLoading = null; // allow a retry on the next keystroke
      });
  }
  return dictionaryLoading;
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const INFLECTION_SUFFIXES = ['s', 'es', 'ed', 'd', 'ing', 'ly', 'er', 'ers', 'est', 'ness', 'ment', 'ments', 'tion', 'tions', 'ies', 'ied'];

function isKnownWord(word: string): boolean {
  if (!dictionary) return true;
  if (dictionary.has(word) || extraKnown.has(word)) return true;
  for (const suffix of INFLECTION_SUFFIXES) {
    if (!word.endsWith(suffix) || word.length - suffix.length < 3) continue;
    const stem = word.slice(0, -suffix.length);
    if (suffix === 'd' && !stem.endsWith('e')) continue;
    if (dictionary.has(stem) || extraKnown.has(stem)) return true;
    if (dictionary.has(stem + 'e') || dictionary.has(stem + 'y')) return true; // making, tried
    if (stem.length > 3 && stem[stem.length - 1] === stem[stem.length - 2] && dictionary.has(stem.slice(0, -1))) return true; // running
  }
  return false;
}

function bestSuggestion(word: string): string | null {
  if (!dictionary) return null;
  const limit = word.length <= 6 ? 3000 : 8000;
  let best: string | null = null;
  let bestRank = Infinity;

  const consider = (candidate: string) => {
    if (candidate[0] !== word[0] || candidate === word) return; // typos rarely change the first letter
    const rank = dictionary!.get(candidate);
    if (rank !== undefined && rank < bestRank && rank <= limit) {
      best = candidate;
      bestRank = rank;
    }
  };

  for (let i = 0; i <= word.length; i++) {
    const left = word.slice(0, i);
    const right = word.slice(i);
    if (right) consider(left + right.slice(1)); // deletion
    if (right.length > 1) consider(left + right[1] + right[0] + right.slice(2)); // transposition
    for (const c of ALPHABET) {
      if (right) consider(left + c + right.slice(1)); // replacement
      consider(left + c + right); // insertion
    }
  }
  return best;
}

function atSentenceStart(value: string, index: number): boolean {
  let i = index - 1;
  while (i >= 0 && (value[i] === ' ' || value[i] === '\t')) i--;
  return i < 0 || /[.!?\n]/.test(value[i]);
}

function fuzzyFix(raw: string, value: string, start: number): string | undefined {
  if (!dictionary || raw.length < 5 || !/^[A-Za-z]+$/.test(raw)) return undefined;
  if (raw === raw.toUpperCase()) return undefined; // acronyms
  if (/[A-Z]/.test(raw.slice(1))) return undefined; // camelCase / mixed case
  if (/[A-Z]/.test(raw[0]) && !atSentenceStart(value, start)) return undefined; // proper nouns

  const lower = raw.toLowerCase();
  if (isKnownWord(lower)) return undefined;
  const suggestion = bestSuggestion(lower);
  return suggestion ? matchCase(raw, suggestion) : undefined;
}

const BOUNDARY = /[\s.,!?;:)\]}"”’]/;
const WORD_START_PREFIX = /[\s("“‘[{]/;

function matchCase(original: string, fix: string): string {
  if (original.length > 1 && original === original.toUpperCase()) return fix.toUpperCase();
  if (original[0] !== original[0].toLowerCase()) return fix[0].toUpperCase() + fix.slice(1);
  return fix;
}

function insideCode(text: string, index: number): boolean {
  const before = text.slice(0, index);
  const fences = (before.match(/```/g) || []).length;
  if (fences % 2 === 1) return true;
  const ticks = (before.replace(/```/g, '').match(/`/g) || []).length;
  return ticks % 2 === 1;
}

export type Correction = {
  value: string;
  caret: number;
  /** Range of the corrected word in `value`, and what the user typed. */
  start: number;
  end: number;
  original: string;
};

/**
 * `caret` is the caret position AFTER the boundary character was typed.
 * Returns the corrected text, or null when nothing should change.
 */
export function correctWordBeforeCaret(value: string, caret: number): Correction | null {
  const boundaryIndex = caret - 1;
  if (boundaryIndex < 1 || !BOUNDARY.test(value[boundaryIndex])) return null;

  let start = boundaryIndex;
  while (start > 0 && /[A-Za-z']/.test(value[start - 1])) start--;
  const raw = value.slice(start, boundaryIndex);
  if (raw.length < 1) return null;

  if (start > 0 && !WORD_START_PREFIX.test(value[start - 1])) return null; // url, path, email, hashtag…
  if (insideCode(value, start)) return null;

  const word = raw.replace(/’/g, "'");
  const lower = word.toLowerCase();

  let fix: string | undefined;
  if (word === 'i') fix = 'I';
  else if (/^i'(m|ve|ll|d)$/.test(lower)) fix = 'I' + lower.slice(1);
  else if (TYPOS[lower]) fix = matchCase(word, TYPOS[lower]);
  else if (!word.includes("'")) fix = fuzzyFix(word, value, start);

  if (!fix || fix === raw) return null;

  const next = value.slice(0, start) + fix + value.slice(boundaryIndex);
  return {
    value: next,
    caret: start + fix.length + 1,
    start,
    end: start + fix.length,
    original: raw,
  };
}

/**
 * Drop-in handlers for the composer <textarea>.
 *   const ac = useComposerAutocorrect(inputRef, setInput);
 *   <textarea onChange={ac.onChange} onKeyDown={e => { ac.onKeyDown(e); … }} />
 */
export function useComposerAutocorrect(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  setValue: (next: string) => void,
) {
  const last = useRef<(Correction & { caretAfter: number }) | null>(null);

  // Start loading the dictionary as soon as the composer mounts.
  useEffect(() => {
    if (isAutocorrectEnabled()) void loadAutocorrectDictionary();
  }, []);

  const placeCaret = useCallback(
    (pos: number) => {
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) el.setSelectionRange(pos, pos);
      });
    },
    [textareaRef],
  );

  const onChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const el = event.target;
      const native = event.nativeEvent as InputEvent;
      last.current = null;

      const typedBoundary =
        isAutocorrectEnabled() &&
        !native.isComposing &&
        native.inputType === 'insertText' &&
        typeof native.data === 'string' &&
        native.data.length === 1 &&
        BOUNDARY.test(native.data);

      if (typedBoundary && el.selectionStart === el.selectionEnd) {
        const fixed = correctWordBeforeCaret(el.value, el.selectionStart);
        if (fixed) {
          last.current = { ...fixed, caretAfter: fixed.caret };
          setValue(fixed.value);
          placeCaret(fixed.caret);
          return;
        }
      }
      setValue(el.value);
    },
    [placeCaret, setValue],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      const correction = last.current;
      if (!correction) return;

      const el = event.currentTarget;
      if (
        event.key === 'Backspace' &&
        el.selectionStart === el.selectionEnd &&
        el.selectionStart === correction.caretAfter
      ) {
        // Undo the correction: restore the typed word and keep the boundary char.
        event.preventDefault();
        const before = el.value.slice(0, correction.start);
        const boundary = el.value.slice(correction.end, correction.caretAfter);
        const after = el.value.slice(correction.caretAfter);
        const restored = before + correction.original + boundary + after;
        last.current = null;
        setValue(restored);
        placeCaret(correction.start + correction.original.length + boundary.length);
        return;
      }

      if (event.key.length === 1 || event.key === 'Enter' || event.key.startsWith('Arrow')) {
        last.current = null;
      }
    },
    [placeCaret, setValue],
  );

  return { onChange, onKeyDown };
}
