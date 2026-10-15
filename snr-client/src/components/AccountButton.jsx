import Icon from "./Icon.jsx";
import { openSignIn, useMember, wasSignedIn } from "../hooks/useMember.js";

// Header control: "Sign in" for guests, the renter's avatar + tier for
// members (links to /account). Hidden when sign-in isn't configured.
export default function AccountButton({ onNavigate, className = "" }) {
  const member = useMember();
  if (member.status === "off") return null;
  if (member.status === "loading" && wasSignedIn()) {
    return <span className={`account-btn account-btn--ghost ${className}`} aria-hidden="true" />;
  }
  if (member.status === "member") {
    const tier = member.me?.tier;
    return (
      <a href="/account" className={`account-btn ${className}`} onClick={onNavigate}>
        {member.user?.photo ? (
          <img src={member.user.photo} alt="" className="account-btn__avatar" referrerPolicy="no-referrer" />
        ) : (
          <span className="account-btn__avatar account-btn__avatar--initial">
            {(member.user?.name || "M").slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className={`account-btn__tier ${tier ? `account-btn__tier--${tier.key}` : ""}`}>
          {tier ? `${tier.name}` : "My account"}
        </span>
      </a>
    );
  }
  return (
    <button
      type="button"
      className={`account-btn account-btn--signin ${className}`}
      onClick={() => {
        onNavigate?.();
        openSignIn();
      }}
    >
      <Icon name="user" size={16} /> Sign in
    </button>
  );
}

export function GoogleMark() {
  return (
    <svg className="google-mark" viewBox="0 0 48 48" aria-hidden="true" width="16" height="16">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
