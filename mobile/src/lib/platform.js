// Platform shims.
//
// crypto.randomUUID() only exists in a secure context. Testing over a plain
// http:// LAN address (http://192.168.x.x:5174) is a normal thing to do from a
// phone, and without this the whole app throws on the first created record.
// Imported first from main.jsx so every call site is covered.

if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
  crypto.randomUUID = () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
}

export const isSecure = () => typeof window !== 'undefined' && window.isSecureContext

/** True when the app is running as an installed app rather than a browser tab. */
export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)

export const isAndroid = () => /Android/i.test(navigator.userAgent || '')
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent || '')
