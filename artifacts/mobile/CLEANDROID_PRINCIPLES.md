# CLEANDROID PRINCIPLES

> The north star for every engineering and product decision.
> When in doubt, return to this document.

---

## 1. Never fabricate results

Every number the user sees must come from a real system call.
No invented percentages. No simulated scan speeds. No fake "problems detected."

If Android does not expose a value, say so — with `~` for estimates,
or an honest explanation for why the data isn't available.

The only exception: typical-usage figures used as planning aids,
always labelled as estimates and never presented as measured facts.

---

## 2. Explain every recommendation

Don't say "you should delete these files."
Say "these 47 files match duplicate hashes — here's how much space you recover."

Users who understand the recommendation trust it more.
Users who trust it are more likely to act on it.
Explanations are not optional. They are the product.

---

## 3. Prefer transparency over marketing

Competitors say: "4,287 problems detected! Your phone is critically slow!"
CleanDroid says: "Here's what I found. Here's why. Here's what Android allows."

That difference is the competitive advantage.
Protect it in every piece of copy, every label, every status message.

---

## 4. Every feature must solve a real storage problem

Before adding any feature, answer:
- What specific storage problem does this solve?
- Can we verify the result with a real system API?
- Does it make the user's device measurably better?

If the answer to any of these is "no" or "not really," do not ship it.

---

## 5. Keep the terminal identity consistent

The visual language is a retro CRT / Y2K terminal. It is locked.

- Background: `#080808`
- Primary teal: `#00E5CC`
- Accent orange: `#FF5500`
- Success green: `#39FF14`
- Asymmetric bevel borders. ALL CAPS. `>` prompts. `[BRACKET]` headers.
- Zero border-radius. No `LinearGradient`. No rounded cards.

Do not soften this identity for approachability.
The identity IS the trust signal — it reads as technical and precise.

---

## 6. Respect Android limitations

Android restricts what third-party apps can access. That is by design.

When we hit a wall:
- Document it honestly in the UI (e.g., app cache sizes are estimated)
- Guide the user to the right system settings rather than pretending we can do it ourselves
- Never claim a capability we don't have

Respecting Android's limits is not a weakness. It's what makes us trustworthy.

---

## 7. Ask for the minimum permissions possible

Every permission we request is a question the user has to answer.
Every unnecessary permission erodes trust.

Before declaring a permission in `app.json`:
- Confirm it is actively used by production code
- Confirm there is no less-privileged alternative
- Confirm removal would break a real user-facing feature

If we stop using a feature, remove its permission on the same PR.

---

## 8. User trust is more valuable than another feature

A user who trusts CleanDroid uses it every month for a year.
A user who doesn't trust it uninstalls it after one scan.

Trust is built by:
- Accurate results
- Honest copy
- Graceful error handling
- Respecting their files and privacy

Trust is destroyed by:
- Inflated numbers
- Permissions we don't need
- Features that claim to work but don't
- Hiding limitations behind marketing language

When there is a conflict between a feature and trust, choose trust.

---

## Living document

This file should be read before any significant feature addition, refactor, or copy change.

If a proposed change conflicts with these principles, the change needs a very strong justification — not just a convenience argument.

Last updated: 2026-07-11
