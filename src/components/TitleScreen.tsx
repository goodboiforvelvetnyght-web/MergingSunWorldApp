export function TitleScreen({
  started,
  obscured,
  onStart,
  onSignIn,
  onRegister,
}: {
  started: boolean;
  obscured: boolean;
  onStart: () => void;
  onSignIn: () => void;
  onRegister: () => void;
}) {
  return (
    <main
      className={`title-screen ${started ? "title-screen-ready" : ""}`}
      aria-label="Welcome to Merging Sun"
    >
      <picture className="title-art" aria-hidden="true">
        <source
          media="(max-width: 700px)"
          srcSet="/brand/background-small.webp"
        />
        <img src="/brand/background.webp" alt="" fetchPriority="high" />
      </picture>
      <div className="title-frost" aria-hidden="true" />
      {!started ? (
        <button
          type="button"
          className="title-start"
          aria-label="Click to start"
          onClick={onStart}
          autoFocus
        >
          <span className="title-identity">
            <img
              className="title-logo"
              src="/brand/merging-sun-logo.png"
              alt="Merging Sun"
            />
            <span className="title-name">Merging Sun</span>
            <span className="title-tagline">A world worth belonging to</span>
          </span>
          <span className="title-prompt">
            Click to start<span className="title-keyboard">or press Enter</span>
          </span>
        </button>
      ) : (
        <section
          className="welcome-card"
          inert={obscured}
          aria-hidden={obscured || undefined}
        >
          <img
            src="/brand/merging-sun-logo.png"
            alt=""
            className="welcome-logo"
          />
          <span className="eyebrow">THE MERGING SUN COMPANION</span>
          <h1>Your story belongs here.</h1>
          <p>
            Discover the kingdoms, find your place in their stories, and bring
            your LARP character into the world.
          </p>
          <button className="button primary full" onClick={onSignIn}>
            Sign in
          </button>
          <button className="button secondary full" onClick={onRegister}>
            Create an account
          </button>
          <p className="welcome-note">
            Sign in with Google or email. Your character will be reviewed by an
            admin before play begins.
          </p>
        </section>
      )}
      <p className="title-beta">
        Closed beta <span>·</span> Features may change and character progress
        may be reset.
      </p>
    </main>
  );
}
