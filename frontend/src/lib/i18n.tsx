import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type AppLanguage = 'auto'|'en'|'hi'|'te'|'ta'|'kn'|'ml'|'bn'|'mr'|'gu'|'pa'|'ur'|'ar'|'es'|'fr'|'de'|'it'|'pt'|'ru'|'ja'|'ko'|'zh'|'tr'|'vi'|'id'|'th'|'fil';
export const APP_LANGUAGE_KEY = 'twinkle_app_language';

const T: Record<string, Record<string,string>> = {
en:{'New chat':'New chat','Projects':'Projects','Search chats...':'Search chats...','Today':'Today','Yesterday':'Yesterday','This Week':'This Week','This Month':'This Month','Recent':'Recent','Settings':'Settings','Profile':'Profile','General':'General','Voice':'Voice','Usage':'Usage','Analytics':'Analytics','Storage':'Storage','Language':'Language','Appearance':'Appearance','Account':'Account','Light':'Light','Dark':'Dark','Auto-detect':'Auto-detect','Change voice':'Change voice','Model':'Model','Attach files':'Attach files','Ask Anything':'Ask Anything','Send':'Send','Stop':'Stop','Copy':'Copy','Copied':'Copied','Edit':'Edit','Delete':'Delete','Rename':'Rename','Clear all':'Clear all','Logout':'Logout','Share':'Share','Download':'Download','Cancel':'Cancel','Confirm':'Confirm','Save':'Save','Close':'Close','Back':'Back','Next':'Next','Previous':'Previous','Login':'Login','Sign up':'Sign up','Sign in':'Sign in','Sign out':'Sign out','Forgot password?':'Forgot password?','Email':'Email','Password':'Password','Username':'Username','Continue':'Continue','Verify OTP':'Verify OTP','Resend OTP':'Resend OTP','Create account':'Create account','Welcome back':'Welcome back','Listening':'Listening','Connecting…':'Connecting…','Connecting...':'Connecting...','Disconnected':'Disconnected','Connection error':'Connection error','Unable to start':'Unable to start','Thinking…':'Thinking…','Thinking...':'Thinking...','Live Talk ended':'Live Talk ended','Pause microphone':'Pause microphone','Resume microphone':'Resume microphone','End conversation':'End conversation','Start Live Talk':'Start Live Talk','Total chats':'Total chats','Total messages':'Total messages','Messages today':'Messages today','Average per chat':'Average per chat','User messages':'User messages','AI messages':'AI messages','Refresh':'Refresh','Updated':'Updated','Not available':'Not available','Conversation activity':'Conversation activity'},
hi:{'New chat':'नई चैट','Projects':'प्रोजेक्ट्स','Search chats...':'चैट खोजें...','Today':'आज','Yesterday':'कल','This Week':'इस सप्ताह','This Month':'इस महीने','Recent':'हाल की','Settings':'सेटिंग्स','Profile':'प्रोफ़ाइल','General':'सामान्य','Voice':'आवाज़','Usage':'उपयोग','Analytics':'विश्लेषण','Storage':'स्टोरेज','Language':'भाषा','Appearance':'रूप','Account':'खाता','Light':'लाइट','Dark':'डार्क','Auto-detect':'स्वतः पहचान','Change voice':'आवाज़ बदलें','Model':'मॉडल','Attach files':'फ़ाइलें जोड़ें','Ask Anything':'कुछ भी पूछें','Send':'भेजें','Stop':'रोकें','Copy':'कॉपी','Copied':'कॉपी किया गया','Edit':'संपादित करें','Delete':'हटाएँ','Rename':'नाम बदलें','Clear all':'सब साफ़ करें','Logout':'लॉग आउट','Share':'साझा करें','Download':'डाउनलोड','Cancel':'रद्द करें','Confirm':'पुष्टि करें','Save':'सहेजें','Close':'बंद करें','Back':'वापस','Next':'अगला','Previous':'पिछला','Login':'लॉगिन','Sign up':'साइन अप','Sign in':'साइन इन','Sign out':'साइन आउट','Forgot password?':'पासवर्ड भूल गए?','Email':'ईमेल','Password':'पासवर्ड','Username':'उपयोगकर्ता नाम','Continue':'जारी रखें','Verify OTP':'OTP सत्यापित करें','Resend OTP':'OTP फिर भेजें','Create account':'खाता बनाएँ','Welcome back':'वापसी पर स्वागत है','Listening':'सुन रहा है','Connecting…':'कनेक्ट हो रहा है…','Connecting...':'कनेक्ट हो रहा है...','Disconnected':'डिस्कनेक्ट हो गया','Connection error':'कनेक्शन त्रुटि','Unable to start':'शुरू नहीं हो सका','Thinking…':'सोच रहा है…','Thinking...':'सोच रहा है...','Live Talk ended':'लाइव टॉक समाप्त','Pause microphone':'माइक्रोफ़ोन रोकें','Resume microphone':'माइक्रोफ़ोन फिर शुरू करें','End conversation':'बातचीत समाप्त करें','Start Live Talk':'लाइव टॉक शुरू करें','Total chats':'कुल चैट','Total messages':'कुल संदेश','Messages today':'आज के संदेश','Average per chat':'प्रति चैट औसत','User messages':'उपयोगकर्ता संदेश','AI messages':'AI संदेश','Refresh':'रिफ्रेश','Updated':'अपडेट किया गया','Not available':'उपलब्ध नहीं','Conversation activity':'बातचीत गतिविधि'},
te:{'New chat':'కొత్త చాట్','Projects':'ప్రాజెక్ట్‌లు','Search chats...':'చాట్‌లను శోధించండి...','Today':'ఈ రోజు','Yesterday':'నిన్న','This Week':'ఈ వారం','This Month':'ఈ నెల','Recent':'ఇటీవలి','Settings':'సెట్టింగ్‌లు','Profile':'ప్రొఫైల్','General':'సాధారణం','Voice':'వాయిస్','Usage':'వినియోగం','Analytics':'విశ్లేషణ','Storage':'స్టోరేజ్','Language':'భాష','Appearance':'రూపం','Account':'ఖాతా','Light':'లైట్','Dark':'డార్క్','Auto-detect':'ఆటో-డిటెక్ట్','Change voice':'వాయిస్ మార్చండి','Model':'మోడల్','Attach files':'ఫైళ్లను జోడించండి','Ask Anything':'ఏదైనా అడగండి','Send':'పంపండి','Stop':'ఆపండి','Copy':'కాపీ','Copied':'కాపీ అయింది','Edit':'సవరించండి','Delete':'తొలగించండి','Rename':'పేరు మార్చండి','Clear all':'అన్నీ క్లియర్ చేయండి','Logout':'లాగ్ అవుట్','Share':'షేర్ చేయండి','Download':'డౌన్‌లోడ్','Cancel':'రద్దు చేయండి','Confirm':'నిర్ధారించండి','Save':'సేవ్ చేయండి','Close':'మూసివేయండి','Back':'వెనక్కి','Next':'తదుపరి','Previous':'మునుపటి','Login':'లాగిన్','Sign up':'సైన్ అప్','Sign in':'సైన్ ఇన్','Sign out':'సైన్ అవుట్','Forgot password?':'పాస్‌వర్డ్ మర్చిపోయారా?','Email':'ఈమెయిల్','Password':'పాస్‌వర్డ్','Username':'యూజర్ పేరు','Continue':'కొనసాగించండి','Verify OTP':'OTP నిర్ధారించండి','Resend OTP':'OTP మళ్లీ పంపండి','Create account':'ఖాతా సృష్టించండి','Welcome back':'తిరిగి స్వాగతం','Listening':'వింటోంది','Connecting…':'కనెక్ట్ అవుతోంది…','Connecting...':'కనెక్ట్ అవుతోంది...','Disconnected':'డిస్‌కనెక్ట్ అయింది','Connection error':'కనెక్షన్ లోపం','Unable to start':'ప్రారంభించలేకపోయింది','Thinking…':'ఆలోచిస్తోంది…','Thinking...':'ఆలోచిస్తోంది...','Live Talk ended':'లైవ్ టాక్ ముగిసింది','Pause microphone':'మైక్రోఫోన్ పాజ్ చేయండి','Resume microphone':'మైక్రోఫోన్ కొనసాగించండి','End conversation':'సంభాషణ ముగించండి','Start Live Talk':'లైవ్ టాక్ ప్రారంభించండి','Total chats':'మొత్తం చాట్‌లు','Total messages':'మొత్తం సందేశాలు','Messages today':'ఈరోజు సందేశాలు','Average per chat':'ప్రతి చాట్ సగటు','User messages':'యూజర్ సందేశాలు','AI messages':'AI సందేశాలు','Refresh':'రిఫ్రెష్','Updated':'అప్‌డేట్ అయింది','Not available':'అందుబాటులో లేదు','Conversation activity':'సంభాషణ కార్యకలాపం'},
ta:{'New chat':'புதிய அரட்டை','Projects':'திட்டங்கள்','Search chats...':'அரட்டைகளைத் தேடுங்கள்...','Today':'இன்று','Yesterday':'நேற்று','This Week':'இந்த வாரம்','This Month':'இந்த மாதம்','Recent':'சமீபத்திய','Settings':'அமைப்புகள்','Profile':'சுயவிவரம்','General':'பொது','Voice':'குரல்','Usage':'பயன்பாடு','Analytics':'பகுப்பாய்வு','Storage':'சேமிப்பு','Language':'மொழி','Appearance':'தோற்றம்','Account':'கணக்கு','Light':'ஒளி','Dark':'இருள்','Auto-detect':'தானாக கண்டறி','Change voice':'குரலை மாற்று','Model':'மாடல்','Attach files':'கோப்புகளை இணைக்கவும்','Ask Anything':'எதையும் கேளுங்கள்','Send':'அனுப்பு','Stop':'நிறுத்து','Copy':'நகலெடு','Copied':'நகலெடுக்கப்பட்டது','Edit':'திருத்து','Delete':'நீக்கு','Rename':'மறுபெயரிடு','Clear all':'அனைத்தையும் அழி','Logout':'வெளியேறு','Share':'பகிர்','Download':'பதிவிறக்கு','Cancel':'ரத்து செய்','Confirm':'உறுதிப்படுத்து','Save':'சேமி','Close':'மூடு','Back':'பின்','Next':'அடுத்து','Previous':'முந்தைய','Login':'உள்நுழை','Sign up':'பதிவு செய்','Sign in':'உள்நுழை','Sign out':'வெளியேறு','Forgot password?':'கடவுச்சொல்லை மறந்துவிட்டீர்களா?','Email':'மின்னஞ்சல்','Password':'கடவுச்சொல்','Username':'பயனர் பெயர்','Continue':'தொடரவும்','Verify OTP':'OTP சரிபார்க்கவும்','Resend OTP':'OTP மீண்டும் அனுப்பு','Create account':'கணக்கை உருவாக்கு','Welcome back':'மீண்டும் வரவேற்கிறோம்','Listening':'கேட்கிறது','Connecting…':'இணைக்கிறது…','Connecting...':'இணைக்கிறது...','Disconnected':'துண்டிக்கப்பட்டது','Connection error':'இணைப்பு பிழை','Unable to start':'தொடங்க முடியவில்லை','Thinking…':'சிந்திக்கிறது…','Thinking...':'சிந்திக்கிறது...','Live Talk ended':'லைவ் டாக் முடிந்தது','Pause microphone':'மைக்ரோஃபோனை இடைநிறுத்து','Resume microphone':'மைக்ரோஃபோனை தொடரவும்','End conversation':'உரையாடலை முடி','Start Live Talk':'லைவ் டாக் தொடங்கு','Total chats':'மொத்த அரட்டைகள்','Total messages':'மொத்த செய்திகள்','Messages today':'இன்றைய செய்திகள்','Average per chat':'ஒரு அரட்டைக்கான சராசரி','User messages':'பயனர் செய்திகள்','AI messages':'AI செய்திகள்','Refresh':'புதுப்பி','Updated':'புதுப்பிக்கப்பட்டது','Not available':'கிடைக்கவில்லை','Conversation activity':'உரையாடல் செயல்பாடு'},
kn:{'New chat':'ಹೊಸ ಚಾಟ್','Projects':'ಪ್ರಾಜೆಕ್ಟ್‌ಗಳು','Search chats...':'ಚಾಟ್‌ಗಳನ್ನು ಹುಡುಕಿ...','Today':'ಇಂದು','Yesterday':'ನಿನ್ನೆ','This Week':'ಈ ವಾರ','This Month':'ಈ ತಿಂಗಳು','Recent':'ಇತ್ತೀಚಿನ','Settings':'ಸೆಟ್ಟಿಂಗ್‌ಗಳು','Profile':'ಪ್ರೊಫೈಲ್','General':'ಸಾಮಾನ್ಯ','Voice':'ಧ್ವನಿ','Usage':'ಬಳಕೆ','Analytics':'ವಿಶ್ಲೇಷಣೆ','Storage':'ಸಂಗ್ರಹಣೆ','Language':'ಭಾಷೆ','Appearance':'ಗೋಚರತೆ','Account':'ಖಾತೆ','Light':'ಲೈಟ್','Dark':'ಡಾರ್ಕ್','Auto-detect':'ಸ್ವಯಂ ಪತ್ತೆ','Change voice':'ಧ್ವನಿ ಬದಲಿಸಿ','Model':'ಮಾದರಿ','Attach files':'ಫೈಲ್‌ಗಳನ್ನು ಸೇರಿಸಿ','Ask Anything':'ಏನನ್ನಾದರೂ ಕೇಳಿ','Send':'ಕಳುಹಿಸಿ','Stop':'ನಿಲ್ಲಿಸಿ','Copy':'ನಕಲಿಸಿ','Copied':'ನಕಲಿಸಲಾಗಿದೆ','Edit':'ಸಂಪಾದಿಸಿ','Delete':'ಅಳಿಸಿ','Rename':'ಮರುಹೆಸರಿಸಿ','Clear all':'ಎಲ್ಲವನ್ನೂ ತೆರವುಗೊಳಿಸಿ','Logout':'ಲಾಗ್ ಔಟ್','Share':'ಹಂಚಿಕೊಳ್ಳಿ','Download':'ಡೌನ್‌ಲೋಡ್','Cancel':'ರದ್ದುಮಾಡಿ','Confirm':'ದೃಢೀಕರಿಸಿ','Save':'ಉಳಿಸಿ','Close':'ಮುಚ್ಚಿ','Back':'ಹಿಂದೆ','Next':'ಮುಂದೆ','Previous':'ಹಿಂದಿನ','Login':'ಲಾಗಿನ್','Sign up':'ಸೈನ್ ಅಪ್','Sign in':'ಸೈನ್ ಇನ್','Sign out':'ಸೈನ್ ಔಟ್','Forgot password?':'ಪಾಸ್‌ವರ್ಡ್ ಮರೆತಿರಾ?','Email':'ಇಮೇಲ್','Password':'ಪಾಸ್‌ವರ್ಡ್','Username':'ಬಳಕೆದಾರ ಹೆಸರು','Continue':'ಮುಂದುವರಿಸಿ','Verify OTP':'OTP ಪರಿಶೀಲಿಸಿ','Resend OTP':'OTP ಮರುಕಳುಹಿಸಿ','Create account':'ಖಾತೆ ರಚಿಸಿ','Welcome back':'ಮತ್ತೆ ಸ್ವಾಗತ','Listening':'ಕೇಳುತ್ತಿದೆ','Connecting…':'ಸಂಪರ್ಕಿಸಲಾಗುತ್ತಿದೆ…','Connecting...':'ಸಂಪರ್ಕಿಸಲಾಗುತ್ತಿದೆ...','Disconnected':'ಸಂಪರ್ಕ ಕಡಿತಗೊಂಡಿದೆ','Connection error':'ಸಂಪರ್ಕ ದೋಷ','Unable to start':'ಪ್ರಾರಂಭಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ','Thinking…':'ಯೋಚಿಸುತ್ತಿದೆ…','Thinking...':'ಯೋಚಿಸುತ್ತಿದೆ...','Live Talk ended':'ಲೈವ್ ಟಾಕ್ ಮುಗಿದಿದೆ','Pause microphone':'ಮೈಕ್ರೋಫೋನ್ ವಿರಾಮಗೊಳಿಸಿ','Resume microphone':'ಮೈಕ್ರೋಫೋನ್ ಮುಂದುವರಿಸಿ','End conversation':'ಸಂಭಾಷಣೆ ಮುಗಿಸಿ','Start Live Talk':'ಲೈವ್ ಟಾಕ್ ಪ್ರಾರಂಭಿಸಿ','Total chats':'ಒಟ್ಟು ಚಾಟ್‌ಗಳು','Total messages':'ಒಟ್ಟು ಸಂದೇಶಗಳು','Messages today':'ಇಂದಿನ ಸಂದೇಶಗಳು','Average per chat':'ಪ್ರತಿ ಚಾಟ್ ಸರಾಸರಿ','User messages':'ಬಳಕೆದಾರ ಸಂದೇಶಗಳು','AI messages':'AI ಸಂದೇಶಗಳು','Refresh':'ರಿಫ್ರೆಶ್','Updated':'ನವೀಕರಿಸಲಾಗಿದೆ','Not available':'ಲಭ್ಯವಿಲ್ಲ','Conversation activity':'ಸಂಭಾಷಣೆ ಚಟುವಟಿಕೆ'}
};

const resolve = (l: AppLanguage) => l === 'auto' ? 'en' : l;
const initial = (): AppLanguage => {
  try {
    const saved = localStorage.getItem(APP_LANGUAGE_KEY);

    // English is the product default. The old "auto" value is migrated
    // to English so browser/device language cannot silently switch the UI.
    if (!saved) return 'en';
    if (saved === 'auto') return 'auto';

    const valid: AppLanguage[] = [
      'en', 'hi', 'te', 'ta', 'kn', 'ml', 'bn', 'mr', 'gu',
      'pa', 'ur', 'ar', 'es', 'fr', 'de', 'it', 'pt', 'ru',
      'ja', 'ko', 'zh', 'tr', 'vi', 'id', 'th', 'fil',
    ];

    return valid.includes(saved as AppLanguage)
      ? (saved as AppLanguage)
      : 'en';
  } catch {
    return 'en';
  }
};

export const getLanguageInstruction = (language:AppLanguage) => {
  const names:Record<string,string>={en:'English',hi:'Hindi',te:'Telugu',ta:'Tamil',kn:'Kannada',ml:'Malayalam',bn:'Bengali',mr:'Marathi',gu:'Gujarati',pa:'Punjabi',ur:'Urdu',ar:'Arabic',es:'Spanish',fr:'French',de:'German',it:'Italian',pt:'Portuguese',ru:'Russian',ja:'Japanese',ko:'Korean',zh:'Chinese',tr:'Turkish',vi:'Vietnamese',id:'Indonesian',th:'Thai',fil:'Filipino'};
  if (language === 'auto') {
    return " Detect the language the user is speaking on every turn and respond in that same language. If the user switches languages, immediately switch with them. Do not default to English. Do not translate unless requested.";
  }
  return names[language] ? ` Respond entirely in ${names[language]}. If the user explicitly asks to switch languages, follow that request.` : '';
};

const originalText = new WeakMap<Text, string>();
const originalAttrs = new WeakMap<Element, Map<string, string>>();
const skipTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'PRE', 'CODE', 'TEXTAREA']);

let applying = false;

const shouldSkipText = (node: Text): boolean => {
  const parent = node.parentElement;
  return (
    !parent ||
    skipTags.has(parent.tagName) ||
    !!parent.closest('[data-twinkle-user-content]')
  );
};

const getDictionary = (language: AppLanguage): Record<string, string> => {
  const lang = resolve(language);
  return lang === 'en'
    ? T.en
    : { ...T.en, ...(T[lang] || {}) };
};

/*
 * Important:
 * This translator deliberately avoids React re-rendering and never writes
 * a value to the DOM unless the value is actually different.
 *
 * The previous version observed characterData + attributes and then wrote
 * the same values back on every MutationObserver pass. That can create an
 * endless mutation loop and make Chromium show "Page Unresponsive".
 */
function applyTranslations(language: AppLanguage): void {
  if (typeof document === 'undefined' || applying) return;

  applying = true;

  try {
    const resolvedLanguage = resolve(language);
    document.documentElement.lang = resolvedLanguage;

    const dict = getDictionary(language);

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) =>
          shouldSkipText(node as Text)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT,
      }
    );

    const nodes: Text[] = [];
    let current: Node | null;

    while ((current = walker.nextNode())) {
      nodes.push(current as Text);
    }

    for (const node of nodes) {
      const currentValue = node.nodeValue ?? '';

      let raw = originalText.get(node);

      if (raw === undefined) {
        raw = currentValue;
        originalText.set(node, raw);
      }

      const trimmed = raw.trim();

      if (!trimmed || trimmed.length > 180) {
        if (currentValue !== raw) {
          node.nodeValue = raw;
        }
        continue;
      }

      const translated = dict[trimmed] ?? raw;

      if (translated === raw) {
        if (currentValue !== raw) {
          node.nodeValue = raw;
        }
        continue;
      }

      const startIndex = raw.indexOf(trimmed);
      const nextValue =
        startIndex >= 0
          ? raw.slice(0, startIndex) +
            translated +
            raw.slice(startIndex + trimmed.length)
          : translated;

      /*
       * NEVER write the same value. This is the key protection against
       * MutationObserver feedback loops.
       */
      if (currentValue !== nextValue) {
        node.nodeValue = nextValue;
      }
    }

    const elements = document.querySelectorAll<HTMLElement>(
      'input[placeholder], textarea[placeholder], [title], [aria-label]'
    );

    for (const element of elements) {
      if (skipTags.has(element.tagName)) continue;
      if (element.closest('[data-twinkle-user-content]')) continue;

      let attrs = originalAttrs.get(element);

      if (!attrs) {
        attrs = new Map<string, string>();
        originalAttrs.set(element, attrs);
      }

      for (const name of ['placeholder', 'title', 'aria-label'] as const) {
        const currentValue = element.getAttribute(name);

        if (currentValue == null) continue;

        let raw = attrs.get(name);

        if (raw === undefined) {
          raw = currentValue;
          attrs.set(name, raw);
        }

        const nextValue = dict[raw] ?? raw;

        if (currentValue !== nextValue) {
          element.setAttribute(name, nextValue);
        }
      }
    }
  } finally {
    applying = false;
  }
}

const scheduleTranslation = (() => {
  let frame: number | null = null;

  return (language: AppLanguage) => {
    if (typeof window === 'undefined') return;

    if (frame !== null) {
      window.cancelAnimationFrame(frame);
    }

    frame = window.requestAnimationFrame(() => {
      frame = null;
      try {
      document.documentElement.lang = resolve(language);
    } catch {
      // Ignore document language errors.
    }

    applyTranslations(language);
    });
  };
})();

type Ctx = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  t: (key: string) => string;
  languageInstruction: string;
};

const LanguageContext = createContext<Ctx | null>(null);

export function LanguageProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [language, setLanguageState] =
    useState<AppLanguage>(initial);

  const setLanguage = (nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);

    try {
      localStorage.setItem(
        APP_LANGUAGE_KEY,
        nextLanguage
      );

      document.documentElement.lang =
        resolve(nextLanguage);
    } catch {
      // Storage/document access is best effort.
    }

    window.dispatchEvent(
      new CustomEvent<AppLanguage>(
        'twinkle-language-change',
        {
          detail: nextLanguage,
        }
      )
    );
  };

  useEffect(() => {
    const handleLanguageChange = (event: Event) => {
      const nextLanguage =
        (event as CustomEvent<AppLanguage>).detail;

      if (
        typeof nextLanguage === 'string' &&
        nextLanguage !== language
      ) {
        setLanguageState(nextLanguage);
      }
    };

    window.addEventListener(
      'twinkle-language-change',
      handleLanguageChange
    );

    return () => {
      window.removeEventListener(
        'twinkle-language-change',
        handleLanguageChange
      );
    };
  }, [language]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    applyTranslations(language);

    /*
     * Observe only DOM additions/replacements. Do NOT observe characterData
     * or attributes because this translator itself changes those nodes.
     * React-generated new content is translated on the next animation frame.
     */
    const observer = new MutationObserver((mutations) => {
      if (applying) return;

      const hasAddedNodes = mutations.some(
        (mutation) => mutation.addedNodes.length > 0
      );

      if (hasAddedNodes) {
        scheduleTranslation(language);
      }
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: (key: string) =>
        translate(key, language),
      languageInstruction:
        getLanguageInstruction(language),
    }),
    [language]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error(
      'useLanguage must be used inside LanguageProvider'
    );
  }

  return context;
};

