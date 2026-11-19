// Text-to-speech through the WebView's speechSynthesis.
// canSpeak() is true only when a real Chinese voice is present. An empty voice list
// (common on Android WebView) means "no audio", so the UI hides the speaker button
// and falls back to showing hanzi instead of a button that does nothing.

export function speechSupported() {
  return typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && typeof window.SpeechSynthesisUtterance === 'function';
}

export function hasChineseVoice() {
  try {
    return window.speechSynthesis.getVoices().some((v) => /^zh/i.test(v.lang));
  } catch {
    return false;
  }
}

export function canSpeak() {
  return speechSupported() && hasChineseVoice();
}

export function speak(text) {
  if (!canSpeak()) return false;
  try {
    const u = new window.SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}

// Voices load asynchronously in most browsers; call back when they arrive.
export function onVoicesChanged(cb) {
  if (!speechSupported()) return;
  window.speechSynthesis.addEventListener?.('voiceschanged', cb);
}
