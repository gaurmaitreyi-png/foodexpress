import { useEffect, useRef } from "react";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

/**
 * Renders the official Google Identity Services button. When it returns a
 * credential (an ID token), we hand it to `onCredential` which posts it to the
 * backend's /auth/google/ endpoint.
 *
 * Renders nothing if VITE_GOOGLE_CLIENT_ID isn't set, so the app still works
 * before Google OAuth is configured.
 */
export default function GoogleLoginButton({
  onCredential,
}: {
  onCredential: (credential: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!CLIENT_ID || !ref.current) return;

    function init() {
      const google = (window as any).google;
      if (!google?.accounts?.id) return;
      google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (resp: any) => onCredential(resp.credential),
      });
      google.accounts.id.renderButton(ref.current, {
        theme: "outline",
        size: "large",
        width: 320,
        text: "continue_with",
      });
    }

    if ((window as any).google?.accounts?.id) {
      init();
    } else {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = init;
      document.body.appendChild(s);
    }
  }, [onCredential]);

  if (!CLIENT_ID) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
        <hr style={{ flex: 1, border: "none", borderTop: "1px solid var(--line, #e5ded3)" }} />
        <span style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>or</span>
        <hr style={{ flex: 1, border: "none", borderTop: "1px solid var(--line, #e5ded3)" }} />
      </div>
      <div ref={ref} style={{ display: "flex", justifyContent: "center" }} />
    </div>
  );
}
