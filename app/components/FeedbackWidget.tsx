"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

type SendState = "idle" | "sending" | "sent" | "error";

const AREAS = [
  "Uploading your assignment",
  "What Simplifii understood",
  "Choosing how to start",
  "The writing workspace",
  "AI feedback and rubric annotations",
  "General feedback",
] as const;

const CATEGORIES = ["Something's broken", "Confusing", "Idea", "Something else"] as const;
const RATINGS = [1, 2, 3, 4, 5] as const;

const NEXT_FEATURES = [
  { id: "dashboard", label: "A dashboard" },
  { id: "term-planner", label: "A term planner with features" },
  { id: "aura", label: "AURA — an AI coaching and study assistant" },
  { id: "additional", label: "Something else not listed here" },
] as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function FocusTrap({ active, containerRef }: { active: boolean; containerRef: React.RefObject<HTMLElement | null> }) {
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;
      const focusable = container.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, containerRef]);
  return null;
}

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [area, setArea] = useState<(typeof AREAS)[number] | "">("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number] | "">("");
  const [message, setMessage] = useState("");
  const [nextWishes, setNextWishes] = useState("");
  const [interestedFeatures, setInterestedFeatures] = useState<string[]>([]);
  const [coDesignOptIn, setCoDesignOptIn] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [state, setState] = useState<SendState>("idle");
  const [error, setError] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
    if (state !== "sent") return;
    setState("idle");
    setRating(null);
    setArea("");
    setCategory("");
    setMessage("");
    setNextWishes("");
    setInterestedFeatures([]);
    setCoDesignOptIn(false);
    setContactEmail("");
  }

  function toggleFeature(id: string) {
    setInterestedFeatures((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rating) {
      setError("Choose a rating.");
      return;
    }
    if (!area) {
      setError("Choose which part this is about.");
      return;
    }
    if (!category) {
      setError("Choose a category.");
      return;
    }
    if (!message.trim()) {
      setError("Add a short message.");
      return;
    }
    if (coDesignOptIn && !EMAIL_PATTERN.test(contactEmail.trim())) {
      setError("Add an email so we can reach you about co-design.");
      return;
    }

    setState("sending");
    setError("");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rating,
          area,
          category,
          message: message.trim(),
          nextWishes: nextWishes.trim(),
          interestedFeatures,
          coDesignOptIn,
          contactEmail: coDesignOptIn ? contactEmail.trim() : "",
          page: typeof window !== "undefined" ? window.location.pathname : "unknown",
          honeypot,
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "That feedback could not be sent.");
      setState("sent");
    } catch (caught) {
      setState("error");
      setError(caught instanceof Error ? caught.message : "That feedback could not be sent.");
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="feedback-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="feedback-trigger-mark" aria-hidden="true" />
        Feedback
      </button>

      {open ? (
        <div className="feedback-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
          <div
            ref={dialogRef}
            className="feedback-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-heading"
          >
            <FocusTrap active={open} containerRef={dialogRef} />
            <div className="feedback-dialog-head">
              <h2 id="feedback-heading" tabIndex={-1} ref={headingRef}>
                {state === "sent" ? "Thanks — that's been sent." : "How's this working for you?"}
              </h2>
              <button type="button" className="feedback-close" aria-label="Close feedback form" onClick={close}>×</button>
            </div>

            {state === "sent" ? (
              <div className="feedback-sent">
                <p>Your feedback goes straight to the team building this. No account needed, nothing else to do.</p>
                <button type="button" className="primary-button" onClick={close}>Done</button>
              </div>
            ) : (
              <form className="feedback-form" onSubmit={submit}>
                <fieldset className="feedback-field">
                  <legend>Overall, how&apos;s it going?</legend>
                  <div className="feedback-rating-row" role="radiogroup" aria-label="Rating out of 5">
                    {RATINGS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={rating === value}
                        className={`feedback-rating${rating === value ? " selected" : ""}`}
                        onClick={() => setRating(value)}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                  <div className="feedback-rating-labels">
                    <span>Rough</span>
                    <span>Great</span>
                  </div>
                </fieldset>

                <div className="feedback-row">
                  <div className="feedback-col">
                    <label className="feedback-label" htmlFor="feedback-area">Which part is this about?</label>
                    <select
                      id="feedback-area"
                      className="feedback-select"
                      value={area}
                      onChange={(event) => setArea(event.target.value as (typeof AREAS)[number])}
                    >
                      <option value="" disabled>Choose one</option>
                      {AREAS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </div>
                  <div className="feedback-col">
                    <label className="feedback-label" htmlFor="feedback-category">What kind of feedback?</label>
                    <select
                      id="feedback-category"
                      className="feedback-select"
                      value={category}
                      onChange={(event) => setCategory(event.target.value as (typeof CATEGORIES)[number])}
                    >
                      <option value="" disabled>Choose one</option>
                      {CATEGORIES.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </div>
                </div>

                <label className="feedback-label" htmlFor="feedback-message">Tell us what happened</label>
                <textarea
                  id="feedback-message"
                  className="feedback-textarea"
                  value={message}
                  maxLength={4000}
                  placeholder="What were you doing, and what did you expect to happen?"
                  onChange={(event) => setMessage(event.target.value)}
                />

                <label className="feedback-label" htmlFor="feedback-next">What would you like to see next?</label>
                <textarea
                  id="feedback-next"
                  className="feedback-textarea feedback-textarea-short"
                  value={nextWishes}
                  maxLength={2000}
                  placeholder="Anything Simplifii is missing for you, in your own words (optional)"
                  onChange={(event) => setNextWishes(event.target.value)}
                />

                <fieldset className="feedback-field">
                  <legend>Or pick from what we're considering</legend>
                  <div className="feedback-checklist">
                    {NEXT_FEATURES.map((feature) => (
                      <label key={feature.id} className="feedback-checkbox">
                        <input
                          type="checkbox"
                          checked={interestedFeatures.includes(feature.id)}
                          onChange={() => toggleFeature(feature.id)}
                        />
                        {feature.label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="feedback-checkbox feedback-codesign">
                  <input
                    type="checkbox"
                    checked={coDesignOptIn}
                    onChange={(event) => setCoDesignOptIn(event.target.checked)}
                  />
                  I&apos;d like to help shape what gets built next (join the co-design team)
                </label>

                {coDesignOptIn ? (
                  <div>
                    <label className="feedback-label" htmlFor="feedback-email">Email, so we can reach you</label>
                    <input
                      id="feedback-email"
                      className="feedback-select"
                      type="email"
                      value={contactEmail}
                      placeholder="you@example.com"
                      onChange={(event) => setContactEmail(event.target.value)}
                    />
                  </div>
                ) : null}

                <input
                  className="visually-hidden"
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  value={honeypot}
                  onChange={(event) => setHoneypot(event.target.value)}
                />

                <div className="feedback-actions">
                  <span>{error ? <span className="inline-error" role="alert">{error}</span> : "Sent to the build team, not stored anywhere else."}</span>
                  <button className="primary-button" type="submit" disabled={state === "sending"}>
                    {state === "sending" ? "Sending…" : "Send feedback"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
