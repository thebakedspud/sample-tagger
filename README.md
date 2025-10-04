# Sample Tagger (prototype)

Bare-bones prototype for importing a playlist and adding notes.


As a part of my UX/UI design course I have been learning about accessibility, inclusion and inclusive design. The design behind this app is an attempt to deepen my understanding and put principle into practice.

Below is a list of guidelines that have shaped the development of this app, which i'm hoping to continiously develop and contribute to. 

Accessibility Checklist -

We aim to follow WCAG principles and good inclusive practices as we build.

Page structure

Use landmarks (<header>, <main>, <footer>) so assistive tech users can jump around quickly.

Have one <h1> for the app title; use <h2>, <h3> in order to show structure.

Lists & content

Use real lists (<ul><li>) for tracks and notes so users know how many items and where they are in the list.

Buttons & controls

All actions are real <button> elements, not hidden right-clicks.

Every button has a clear label or an accessible name (aria-label if icon-only).

Keep focus visible (don’t remove outlines).

Keyboard use

Everything can be reached with Tab and activated with Enter/Space.

When new inputs appear (like “Add note”), focus moves straight into them.

When actions complete, focus returns to a sensible place (e.g., back to the button).

Feedback

Use a hidden live region (role="status") to announce changes (e.g., “Imported 3 tracks”, “Note added”).

Don’t rely on color alone — use text or icons too.

Visuals

Text contrast: at least 4.5:1 for body text, 3:1 for large text and UI controls.

Clickable areas are big enough (about 44×44px).