# AGENTS.md

## Project Overview
This project is a real estate platform focused on rental listings in Cheonan.
The main goals are:
- make listing search easy and intuitive
- keep the UI fast and mobile-friendly
- improve work efficiency for real estate operations
- preserve existing business logic unless explicitly asked to change it

Tech stack commonly used in this project:
- Flask
- Python
- Jinja2 templates
- Vanilla JavaScript
- TailwindCSS
- MySQL

---

## Core Working Principles

1. Preserve existing behavior
- Do not break existing features unless the task explicitly requires structural changes.
- Prefer minimal, high-confidence edits.
- Before changing logic, first understand how the current code works.

2. Mobile-first
- Always prioritize mobile UX first, then desktop compatibility.
- Avoid layouts that feel crowded on small screens.
- Consider thumb reach, visual hierarchy, and reduced input fatigue.

3. UX priority
- The service is for real users searching for homes quickly and comfortably.
- Reduce friction, confusion, and unnecessary steps.
- Prefer simple flows over technically impressive but complicated interactions.
- When designing forms, reduce psychological burden and keep inputs easy to complete.

4. Respect existing design direction
- Keep the current service tone consistent.
- Avoid introducing styles, libraries, or patterns that clash with the existing UI.
- If editing UI, prefer refinement over full redesign.

5. Readability and maintainability
- Write code that a beginner can still trace later.
- Keep functions focused and not overly long.
- Use clear naming.
- Add comments only when they help explain intent, not obvious syntax.

---

## Backend Rules
- Follow existing Flask project structure.
- Do not change database schema unless explicitly requested.
- Do not rename routes, parameters, or response fields unless necessary.
- Prefer safe refactoring over broad rewrites.
- If querying the database, aim for efficient queries and avoid unnecessary repeated access.
- Preserve compatibility with existing admin and listing workflows.
- Be careful with delete logic:
  - prefer reversible approaches when appropriate
  - do not remove important data permanently unless explicitly requested

---

## Frontend Rules
- Prefer Vanilla JS unless a new library is explicitly requested.
- Prefer Tailwind utility classes over large custom CSS additions when consistent with the project.
- Keep interactions smooth and easy to understand.
- Avoid flashy animations unless they clearly improve usability.
- For buttons, forms, cards, filters, and listing UI:
  - clarity first
  - touch friendliness second
  - visual polish third
- Avoid making the screen feel busy or overwhelming.

## Style Consistency Rules
- Reuse one visual system across pages: white card surfaces, subtle borders, soft shadows, and rounded corners that stay in a narrow range instead of each section inventing a new style.
- Keep spacing on a simple rhythm such as 8px, 12px, 16px, 24px. If a section feels cramped, increase spacing before adding more decoration.
- On small action cards, keep hierarchy consistent:
  - icon first
  - title second
  - supporting description last
- Titles should stay dark and readable; accent colors should be used mainly for icons, badges, or small emphasis points.
- Prefer refining an existing card style over introducing gradients, glow effects, or special surfaces that appear only in one section.

---

## Real Estate Domain Rules
- The platform is used in real estate practice, so practicality matters more than novelty.
- Listing information should be easy to scan.
- Important user priorities usually include:
  - location
  - price
  - deposit / monthly rent
  - structure
  - options / amenities
  - parking
  - building age / condition
- When suggesting UI or feature changes, prefer solutions that help users compare properties faster.
- Features for operators/admins should reduce repetitive manual work.

---

## Safety Rules for Code Changes
- Before editing, inspect surrounding files and dependencies.
- Do not mass-edit unrelated files.
- Do not delete code unless the reason is clear.
- If a change may affect production behavior, mention the risk clearly.
- Prefer incremental edits that are easy to review and roll back.

---

## When Asked to Implement Something
Follow this order:
1. Understand the existing flow first.
2. Identify the smallest safe change.
3. Implement the change cleanly.
4. Explain what changed in simple terms.
5. Mention side effects or follow-up checks if needed.

---

## Response Style
- Be concise but useful.
- Explain in a way that is understandable to a beginner developer.
- Do not overcomplicate.
- When multiple approaches exist, prefer the most practical one first.
- If uncertain, say what is certain and what needs verification.

---

## Things to Avoid
- unnecessary framework migration
- unnecessary database schema changes
- overengineering
- large rewrites without request
- breaking mobile layout
- changing naming conventions randomly
- introducing code that is hard to debug later

---

## Preferred Output Behavior
When making code changes:
- clearly state which files were changed
- summarize why each change was needed
- keep edits scoped to the request
- preserve existing functionality wherever possible

When giving advice:
- prioritize practical business value
- prioritize ease of maintenance
- prioritize user convenience

## Additional Project Preferences
- Always respect existing production data and business workflows.
- This project values practical UX over trendy UI.
- Assume the project owner is highly detail-oriented and wants polished results.
- Prefer solutions that reduce repetitive work for real estate staff.
- Suggest automation opportunities when they are directly relevant.
- Keep the website feeling trustworthy, clear, and easy for non-technical users.
- For listing pages, avoid clutter and help users understand the property quickly.
- For admin tools, prioritize speed, batch handling, and operational clarity.

## Deployment / Restart Preference
- If Python files, Flask routes, server config, WSGI, or other runtime-affecting server files are changed, restart the HouseKB service after the change unless the user explicitly says not to.
- Default restart command for this project is `sudo systemctl restart housekb`.
- After restarting, verify the service is running with `sudo systemctl is-active housekb` or an equivalent safe check.

## Git Workflow Preference
- Manage this project with git.
- If the repository is not initialized yet, initialize it before ongoing work continues.
- When a user-requested task changes tracked files, create a git commit for that task unless the user explicitly says not to commit.
- Keep commits scoped to the task that was just completed. Do not bundle unrelated work together.
