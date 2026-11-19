// Chinese speech output.
// Inside the Android APK the WebView usually has no usable speechSynthesis, so we call the
// native text-to-speech engine through Capacitor. In a normal browser we use speechSynthesis.
// Availability is checked for real (a Chinese voice must exist), so the UI never shows a
// speaker button that cannot make a sound.

const LANG = "zh-CN";
const RATE = 0.85;
const VOICE_WAIT_MS = 1500;

let mode = "none";
let available = false;

function nativeTts() {
  if (!window.Capacitor?.isNativePlatform?.()) return null;
  return window.Capacitor?.Plugins?.TextToSpeech ?? null;
}

function hasChineseWebVoice() {
  return window.speechSynthesis
    .getVoices()
    .some((voice) => voice.lang && voice.lang.toLowerCase().startsWith("zh"));
}

// Browser voices load asynchronously, so wait briefly for the voiceschanged event.
function detectWebVoice() {
  if (!("speechSynthesis" in window)) return Promise.resolve(false);
  if (hasChineseWebVoice()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(hasChineseWebVoice()), VOICE_WAIT_MS);
    window.speechSynthesis.addEventListener(
      "voiceschanged",
      () => {
        clearTimeout(timer);
        resolve(hasChineseWebVoice());
      },
      { once: true }
    );
  });
}

export async function initAudio() {
  const tts = nativeTts();
  try {
    if (tts) {
      mode = "native";
      const result = await tts.isLanguageSupported({ lang: LANG });
      available = result?.supported === true;
    } else {
      mode = "web";
      available = await detectWebVoice();
    }
  } catch (error) {
    console.warn("Audio detection failed", error);
    available = false;
  }
  return { available, mode };
}

export function isAudioAvailable() {
  return available;
}

export async function speakChinese(text) {
  if (!available) return false;
  try {
    if (mode === "native") {
      await nativeTts().speak({ text, lang: LANG, rate: RATE });
      return true;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LANG;
    utterance.rate = RATE;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch (error) {
    console.warn("Speech failed", error);
    return false;
  }
}
