// src/react/components/legacy-avatar.ts
(function() {
	try {
		var e = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : {}, t = new e.Error().stack;
		t && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[t] = "2cb951c0-c279-46ca-85a6-a2e564e49f58", e._sentryDebugIdIdentifier = "sentry-dbid-2cb951c0-c279-46ca-85a6-a2e564e49f58");
	} catch {}
})();
var e = "[&_img]:absolute [&_img]:inset-0 [&_img]:size-full [&_img]:max-w-none [&_img]:max-h-none [&_img]:object-cover";
export { e as LEGACY_AVATAR_IMG };

//# debugId=2cb951c0-c279-46ca-85a6-a2e564e49f58