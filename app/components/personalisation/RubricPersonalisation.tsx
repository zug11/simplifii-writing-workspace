"use client";

import { useEffect, useMemo, useState } from "react";

import {
  adjustSupportLevel,
  confirmContextHelpful,
  forgetContextPreference,
  selectContextRepresentation,
  setTaskOnlyRepresentation,
  type Representation,
  type SupportStateV1,
} from "@/lib/personalisation/support-state";
import { routeRubricSupport } from "@/lib/personalisation/route-support";

type CriterionLike = {
  id: string;
  name: string;
  weight: number;
  description: string;
};

const LABELS: Record<Representation, string> = {
  guide: "Guide",
  compare: "Compare",
  original: "Original",
};

export function RubricPersonalisation({
  assignmentId,
  criteria,
  supportState,
  onSupportState,
}: {
  assignmentId: string;
  criteria: CriterionLike[];
  supportState: SupportStateV1;
  onSupportState: (state: SupportStateV1) => void;
}) {
  const route = useMemo(() => routeRubricSupport({ supportState, assignmentId }), [assignmentId, supportState]);
  const [criterionId, setCriterionId] = useState(criteria[0]?.id ?? "");
  const [representation, setRepresentation] = useState<Representation>(route.representation);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!criteria.some((criterion) => criterion.id === criterionId)) setCriterionId(criteria[0]?.id ?? "");
  }, [criteria, criterionId]);

  useEffect(() => {
    setRepresentation(route.representation);
  }, [route.representation]);

  const criterion = criteria.find((item) => item.id === criterionId) ?? criteria[0];
  if (!criterion) return null;

  const preference = supportState.contexts.rubric;
  const sourceLabel = criterion.weight > 0 ? `${criterion.weight}% criterion` : "Rubric criterion";

  const chooseRepresentation = (next: Representation) => {
    setRepresentation(next);
    onSupportState(selectContextRepresentation(supportState, "rubric", next, assignmentId));
    setNotice(`${LABELS[next]} saved as a provisional rubric preference. You can change or forget it any time.`);
  };

  const confirmHelpful = () => {
    onSupportState(confirmContextHelpful(supportState, "rubric", representation, assignmentId));
    setNotice(`${LABELS[representation]} marked helpful for rubrics. This strengthens only the rubric-context preference.`);
  };

  const taskOnly = () => {
    onSupportState(setTaskOnlyRepresentation(supportState, "rubric", assignmentId, representation));
    setNotice(`${LABELS[representation]} will be preferred for this assignment only.`);
  };

  const forget = () => {
    onSupportState(forgetContextPreference(supportState, "rubric", assignmentId));
    setRepresentation("guide");
    setNotice("Saved rubric preference cleared. Guide is the neutral starting view again.");
  };

  const supportLevel = preference?.supportLevel ?? 1;

  return (
    <section className="personalisation-rubric" aria-labelledby="personalisation-rubric-heading">
      <div className="personalisation-rubric-heading">
        <div>
          <span className="review-label">TRY THE SAME CRITERION DIFFERENT WAYS</span>
          <h2 id="personalisation-rubric-heading">Find what helps here.</h2>
          <p>You do not need to know your “learning style”. Try a representation, switch if it does not help, and keep the original wording one tap away.</p>
        </div>
        <div className="personalisation-confidence">
          <span>Rubric preference</span>
          <strong>{preference?.confidence ?? "open"}</strong>
        </div>
      </div>

      <div className="personalisation-criterion-picker" role="group" aria-label="Choose a rubric criterion to preview">
        {criteria.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={item.id === criterion.id}
            onClick={() => setCriterionId(item.id)}
          >
            {item.name}
          </button>
        ))}
      </div>

      <div className="personalisation-switcher" role="tablist" aria-label="Criterion representation">
        {(["guide", "compare", "original"] as Representation[]).map((mode) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={representation === mode}
            onClick={() => chooseRepresentation(mode)}
          >
            {LABELS[mode]}
          </button>
        ))}
      </div>

      <div className="personalisation-surface" role="tabpanel" aria-live="polite">
        {representation === "guide" ? (
          <div className="personalisation-guide">
            <span className="personalisation-source-kicker">{sourceLabel} · source stays available</span>
            <h3>{criterion.name}</h3>
            <p>{criterion.description || "No criterion description was extracted. Use Original to inspect the available source wording."}</p>
            <ol>
              <li><strong>Read the wording.</strong><span>Stay with this criterion only.</span></li>
              <li><strong>Put it in your own words.</strong><span>What do you think it is asking you to demonstrate?</span></li>
              <li><strong>Find your evidence.</strong><span>What in your draft would let a marker see that?</span></li>
              <li><strong>Check back against the wording.</strong><span>Your interpretation never replaces the criterion itself.</span></li>
            </ol>
          </div>
        ) : null}

        {representation === "compare" ? (
          <div className="personalisation-compare">
            <div className="personalisation-compare-target">
              <span className="personalisation-source-kicker">Selected criterion</span>
              <h3>{criterion.name}</h3>
              <p>{criterion.description || "No extracted description available."}</p>
              {criterion.weight > 0 ? <strong>{criterion.weight}%</strong> : null}
            </div>
            <div className="personalisation-compare-others">
              <span className="personalisation-source-kicker">Other rubric criteria</span>
              {criteria.filter((item) => item.id !== criterion.id).map((item) => (
                <button key={item.id} type="button" onClick={() => setCriterionId(item.id)}>
                  <span>{item.name}</span>
                  <em>{item.weight > 0 ? `${item.weight}%` : "weight not provided"}</em>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {representation === "original" ? (
          <div className="personalisation-original">
            <span className="personalisation-source-kicker">Extracted rubric wording · checked in this review step</span>
            <h3>{criterion.name}</h3>
            <p>{criterion.description || "No criterion description was extracted from the uploaded material."}</p>
            <dl>
              <div><dt>Weight</dt><dd>{criterion.weight > 0 ? `${criterion.weight}%` : "Not provided"}</dd></div>
              <div><dt>Transformation</dt><dd>None in this view</dd></div>
            </dl>
          </div>
        ) : null}
      </div>

      <div className="personalisation-support-row">
        <span>Support level <strong>{supportLevel}</strong></span>
        <button type="button" onClick={() => onSupportState(adjustSupportLevel(supportState, "rubric", "less", assignmentId))} disabled={supportLevel === 0}>Less support</button>
        <button type="button" onClick={() => onSupportState(adjustSupportLevel(supportState, "rubric", "more", assignmentId))} disabled={supportLevel === 3}>More support</button>
      </div>

      <div className="personalisation-feedback">
        <span>Did this representation help for this rubric?</span>
        <div>
          <button type="button" onClick={confirmHelpful}>Yes — keep trying it</button>
          <button type="button" onClick={taskOnly}>Only for this assignment</button>
          <button type="button" onClick={forget}>Forget preference</button>
        </div>
      </div>

      {notice ? <p className="personalisation-notice" role="status">{notice}</p> : null}

      <p className="personalisation-footnote">
        Current route: <strong>{LABELS[route.representation]}</strong> · reason: {route.reason.join(", ")}. Switching representation never changes the criterion itself.
      </p>
    </section>
  );
}
