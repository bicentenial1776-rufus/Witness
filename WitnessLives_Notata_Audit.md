# Code & Security Audit
## Witness Lives | Notata
### Pre-Launch Integrity Review — July 2026

---

## How to Use This Document

Each audit item is rated by priority. Work through **CRITICAL** items first, then **HIGH**, then **MEDIUM**. For each item, use the provided AI prompt to interrogate your codebase, then evaluate the response against the criteria listed.

| Priority | Meaning |
|---|---|
| 🔴 CRITICAL | Must be verified before any user receives access to the application |
| 🟠 HIGH | Should be resolved before public launch; significant risk if ignored |
| 🟢 MEDIUM | Important for quality and trust; address in first update cycle if not pre-launch |

---

## Section 1: Platform Foundation (Both Applications)

These checks apply to both Witness Lives and Notata. They address the shared infrastructure — Supabase, authentication, and React Native/Expo — that underpins everything else.

---

### 1.1 Supabase Row Level Security (RLS)
**Priority: 🔴 CRITICAL**

RLS is the database-level policy that controls whether User A can access User B's data. Supabase ships with RLS disabled by default. If it has not been explicitly configured on every table, any authenticated user can potentially read or write any row in your database — regardless of who created it. This is the single most common and most serious failure in AI-generated Supabase applications.

**What to verify:**
- RLS is enabled on every table that contains user data.
- Policies exist that restrict reads and writes to the data owner (e.g., `auth.uid() = user_id`).
- No table is left with RLS enabled but zero policies — that state blocks all access, including the owner's.

> **Prompt: RLS Audit**
>
> *Review all Supabase tables in this project. For each table: (1) confirm whether RLS is enabled, (2) list every RLS policy that exists, (3) identify any table that stores user data but lacks a policy restricting access to the row owner. Flag any table where one user could read or modify another user's records.*

**What a good answer looks like:**
- Every user-data table lists at least one SELECT policy and one INSERT/UPDATE policy tied to `auth.uid()`.
- No table is described as "RLS enabled with no policies."
- Public or reference tables (e.g., a list of US states) may legitimately have open read access — that is acceptable if intentional.

---

### 1.2 API Key Exposure
**Priority: 🔴 CRITICAL**

Supabase provides two keys: the **anon (public) key**, which is designed to be included in client apps, and the **service role key**, which bypasses all RLS policies and must never appear in client-side code. AI-generated code occasionally places the service role key in environment files that get bundled into the app.

**What to verify:**
- The service role key does not appear anywhere in the React Native / Expo codebase.
- The anon key is used for all client-side Supabase calls.
- Environment variable files (`.env`) are listed in `.gitignore` and not committed to any repository.

> **Prompt: Key Exposure Audit**
>
> *Search the entire codebase for any usage of the Supabase service role key. Confirm it does not appear in any client-side file, environment variable, or configuration that would be bundled into the Expo app. List every location where Supabase is initialized and confirm which key is used at each location.*

---

### 1.3 Authentication Gate-Keeping
**Priority: 🔴 CRITICAL**

Protected screens and data endpoints must be inaccessible to unauthenticated users. AI-generated navigation code sometimes creates routes that can be reached directly, bypassing the login flow.

**What to verify:**
- Every screen that displays user data checks for an active session before rendering.
- Navigation guards redirect unauthenticated users to the login screen rather than showing an error or blank screen.
- Supabase queries that return user data will return nothing (not an error) if called without an authenticated session.

> **Prompt: Auth Gate Audit**
>
> *List every screen and navigation route in this application. For each protected screen, confirm there is an authentication check that prevents unauthenticated access. Identify any screen that displays user-specific data but does not verify session state before rendering. Also confirm that Supabase queries for user data include the session context and would return empty results rather than all rows if called without authentication.*

---

### 1.4 Data Deletion Capability
**Priority: 🟠 HIGH**

Users increasingly expect — and in many jurisdictions are legally entitled to — the ability to delete their data completely. This is especially important for Notata, where users store personal life logs. Soft-delete (hiding data without removing it) is not sufficient. True deletion must remove rows from Supabase, not just flag them as inactive.

**What to verify:**
- A delete account / delete all data function exists or is planned.
- Deletion removes records from the database, not just marks them hidden.
- Deleting an account cascades to all associated data (moments, trips, locations, notes, etc.).

> **Prompt: Data Deletion Audit**
>
> *Does this application implement account deletion or user data deletion? If so, show me the deletion logic and confirm whether it performs hard deletes (removing rows from the database) or soft deletes (marking rows as deleted). If deletion cascades across related tables, show the cascade configuration. If deletion is not yet implemented, flag this as a gap.*

---

### 1.5 Error Handling and Graceful Failure
**Priority: 🟠 HIGH**

AI-generated code often handles the happy path well but leaves error states undefined. A failed API call, a lost network connection, or an empty data set should produce a clear, friendly message — not a crash or a blank screen.

**What to verify:**
- All Supabase queries have error handling (`try/catch` or `.catch()`) that surfaces a message to the user.
- API calls handle network failure gracefully.
- Empty states (no data yet) are handled with helpful UI rather than a crash or blank screen.

> **Prompt: Error Handling Audit**
>
> *Review the error handling across this codebase. Identify any Supabase query or external API call that does not have explicit error handling. For each unhandled case, describe what the user would experience if that call failed. Flag any location where an unhandled error could cause the app to crash or display a blank screen.*

---

### 1.6 Monitoring and Logging
**Priority: 🟠 HIGH**

When something breaks in production, the difference between a 5-minute fix and a 3-hour crisis is whether you have logs that tell you what happened. Supabase provides built-in logging; the question is whether the application is configured to surface meaningful errors.

**What to verify:**
- Supabase project has logging enabled (check the Supabase dashboard under Logs).
- Critical errors in the application are logged, not silently swallowed.
- Consider adding a lightweight error reporting service (Sentry has a free tier) before public launch.

> **Prompt: Logging Audit**
>
> *Review how errors are currently logged in this application. Are failed Supabase operations logged? Are unhandled exceptions caught and recorded? Is there any integration with an error reporting service such as Sentry? List any significant error paths that currently produce no log output.*

---

## Section 2: Witness Lives — Specific Audit Items

Witness Lives ingests Ancestry.com GEDCOM files and transforms them into analytical stories about family history. The risk profile is relatively contained: the data is user-supplied, largely historical, and not transmitted to third parties. The items below address the areas where problems are most likely to emerge.

---

### 2.1 GEDCOM File Handling and Storage
**Priority: 🔴 CRITICAL**

GEDCOM is a complex format with significant variation between providers and versions. AI-generated parsers may handle standard cases well but fail on edge cases — unusual character encodings, very large files, non-standard date formats, or GEDCOM 7.0 vs. 5.5.1 differences. Additionally, if GEDCOM files are stored in Supabase rather than processed locally and discarded, they must be protected by RLS.

**What to verify:**
- The parser handles malformed or non-standard GEDCOM input without crashing.
- File size limits are enforced (large family trees can produce very large files).
- If files are stored in Supabase Storage, the storage bucket is private and RLS-protected.
- If files are processed locally and not stored, confirm no GEDCOM data is transmitted to any server except Supabase under the user's own account.

> **Prompt: GEDCOM Handling Audit**
>
> *How does this application handle GEDCOM file ingestion? (1) Is the file parsed on-device or uploaded to a server? (2) If stored, where is it stored and what access controls protect it? (3) What happens if the file is malformed, very large, or uses an unexpected GEDCOM version? (4) Are there file size or format validation checks before parsing begins? Identify any scenario where a bad file could crash the app or expose data.*

---

### 2.2 Geolocation — "Within 25 Miles" Feature
**Priority: 🟠 HIGH**

The feature that shows which ancestors lived within 25 miles of the user requires the user's current location. How that location is obtained, used, and whether it is retained or transmitted matters both for privacy and for platform app store compliance (Apple and Google both require explicit justification for location access in app review).

**What to verify:**
- Location permission is requested with a clear explanation of why it is needed.
- The location calculation is performed on-device; the user's coordinates are not transmitted to Supabase or any third party.
- The location is used once for the calculation and not stored or logged.
- The app handles the case where the user denies location permission gracefully.

> **Prompt: Geolocation Audit**
>
> *How does the "ancestors within 25 miles" feature obtain and use the user's location? (1) What permission string is shown to the user? (2) Is the location calculation done on-device or does the coordinate get sent to a server? (3) Is the location stored anywhere after the calculation? (4) What happens if the user denies location access? Show me the relevant code.*

---

### 2.3 Living Persons in GEDCOM Data
**Priority: 🟢 MEDIUM**

GEDCOM files from Ancestry.com may contain records for living people — children, siblings, or other close relatives. By convention, genealogy software marks living individuals with privacy flags. Displaying full names, birthdates, or other details about living people without their consent raises privacy considerations and, in some jurisdictions, legal ones.

**What to verify:**
- The application checks for the GEDCOM "living" flag and suppresses or anonymizes those records in displayed output.
- If living persons are shown, their data is not more detailed than what the user themselves uploaded.

> **Prompt: Living Persons Audit**
>
> *Does the application handle GEDCOM records marked as living persons? How are individuals with the GEDCOM "living" flag (or inferred as living based on birth year) treated in the display output? Are their names, dates, or other details suppressed or anonymized? Show me the relevant logic.*

---

## Section 3: Notata — Specific Audit Items

Notata is a private life logging application that captures GPS locations, timestamps, personal notes, and a running Lifeline of where users lived, worked, and traveled. The word "private" in the product's identity creates an explicit user expectation that must be matched by the technical implementation. The data stored here — location history, personal notes, life patterns — is more sensitive in aggregate than any single data point suggests.

---

### 3.1 Row Level Security for User Data (Notata)
**Priority: 🔴 CRITICAL**

Because Notata's data is particularly personal — GPS history, personal notes, life patterns — the RLS requirement from Section 1.1 deserves its own emphasis here. A failure of data isolation in Notata would be a significant breach of the trust users place in the "private" promise. One user seeing another user's location history or personal notes would be a serious incident.

**What to verify — Notata specific tables:**
- **Moments table:** readable and writable only by the owning user.
- **Trips table:** readable and writable only by the owning user.
- **GPS/location records:** readable and writable only by the owning user.
- **Lifeline records** (residence, employment, travel history): readable and writable only by the owning user.
- **Notes or text content:** readable and writable only by the owning user.

> **Prompt: Notata RLS Deep Audit**
>
> *List every table in the Notata database that stores user-generated content, including moments, trips, GPS coordinates, notes, Lifeline entries, and any other personal data. For each table, show me: (1) whether RLS is enabled, (2) the exact RLS policies in place, and (3) confirm that no query path exists by which one authenticated user could read another user's records. This is a privacy-critical review.*

---

### 3.2 Third-Party API Data Transmission
**Priority: 🟠 HIGH**

When Notata captures a moment, it records weather and elevation data. Obtaining this data requires calling external APIs with the user's GPS coordinates. While this is technically read-only from your perspective, you are transmitting the user's precise location to a third-party service. Users of a "private" app should know this happens, and the APIs used should have acceptable privacy policies.

**What to verify:**
- Identify every external API being called and what data is transmitted to each.
- Confirm that only the minimum necessary data is sent (coordinates only, not user identity).
- Verify the APIs being used have publicly acceptable privacy policies (most major weather APIs are fine).
- Consider whether your privacy policy or in-app disclosure mentions this data transmission.

> **Prompt: API Transmission Audit**
>
> *List every external API called by the Notata application. For each API: (1) what data is transmitted in the request (coordinates, user ID, device ID, etc.), (2) what service or provider is being called, (3) is any user-identifying information included beyond GPS coordinates, and (4) what is the URL of that provider's privacy policy? Flag any API call that transmits more than the minimum necessary information.*

---

### 3.3 GPS and Location Data Handling
**Priority: 🟠 HIGH**

GPS location data is considered sensitive personal data under GDPR and most modern privacy frameworks, even though it is not health data. The Lifeline and map features mean Notata accumulates a detailed picture of a user's movements over time. The key questions are whether location data is stored with appropriate precision and whether location tracking is user-controlled.

**What to verify:**
- Location data is only captured when the user actively initiates a moment — the app does not passively track location in the background.
- The map and Lifeline features display only data the user has deliberately logged.
- Users can delete individual location records, not just entire account data.
- Location precision stored is appropriate to a personal log.

> **Prompt: Location Data Audit**
>
> *How does Notata handle GPS location data? (1) Is location captured passively in the background or only when the user actively logs a moment? (2) What precision is stored (decimal degrees to how many places)? (3) Can individual location records be deleted without deleting the entire account? (4) Is location data ever transmitted anywhere other than the user's own Supabase tables? Show me the location capture and storage logic.*

---

### 3.4 The "Private" Promise — Alignment Check
**Priority: 🟠 HIGH**

The word "private" in Notata's identity sets a user expectation that the technical implementation must meet. Users who choose a private life logging app over a social one are making a deliberate choice. Before launch, it is worth doing an explicit pass to ensure the implementation matches the promise.

**What to verify:**
- No user data is used for analytics, advertising, or product improvement without explicit opt-in.
- No user data is accessible to you (the developer) except for legitimate operational purposes.
- There is no social or sharing feature that could expose data without explicit user action.
- A privacy policy exists that accurately describes what data is collected and how it is used.

> **Prompt: Privacy Promise Audit**
>
> *Review the Notata codebase with the lens of a "private by design" application. Identify any location where user data could be accessed by the developer or transmitted to any party other than the user's own Supabase account. Are there any analytics integrations, crash reporting tools, or third-party SDKs that receive user data? List every external dependency and what data (if any) it receives.*

---

## Section 4: Code Quality and Performance

These items address the structural quality of the code — patterns that could cause performance problems, maintenance challenges, or unexpected behavior as the user base grows.

---

### 4.1 Rate Limiting and Debouncing
**Priority: 🟠 HIGH**

The failure case highlighted in the vibe coding video — a search feature firing a database query on every keystroke with no debouncing — is the canonical example of this class of problem. Any feature in either app that reacts to user input by calling a database or API should be checked for appropriate rate control.

**What to verify:**
- Search or filter inputs use debouncing (typically 300–500ms delay before querying).
- Repeated rapid actions (e.g., tapping a button multiple times) do not trigger multiple simultaneous database writes.
- Map features that update based on user movement use appropriate throttling.

> **Prompt: Debounce and Rate Limit Audit**
>
> *Identify every location in this codebase where user input (typing, scrolling, button taps, map movement) triggers a call to Supabase or an external API. For each location: (1) is there debouncing or throttling applied, (2) what is the delay or rate limit, and (3) what would happen if the user performed that action 20 times in 5 seconds? Flag any unprotected input-driven API call.*

---

### 4.2 React Native useEffect and Memory Management
**Priority: 🟠 HIGH**

`useEffect` is one of the most commonly misused hooks in React and React Native. Common problems include missing dependency arrays (causing infinite re-render loops), missing cleanup functions (causing memory leaks when components unmount), and subscriptions that continue running after navigation away from a screen.

**What to verify:**
- All `useEffect` hooks have appropriate dependency arrays.
- Any subscription, interval, or event listener set up in `useEffect` has a corresponding cleanup function.
- Supabase real-time subscriptions (if used) are unsubscribed when the component unmounts.

> **Prompt: useEffect Audit**
>
> *Review all useEffect hooks in this codebase. For each one: (1) does it have a dependency array, (2) if it sets up a subscription, interval, or event listener, does it return a cleanup function, and (3) could it cause a memory leak or infinite loop as currently written? Flag any useEffect that is missing a cleanup or has an incorrect dependency array.*

---

### 4.3 Offline and Network Resilience
**Priority: 🟢 MEDIUM**

Mobile apps are used in environments with intermittent connectivity. Both applications involve Supabase calls that will fail when the device is offline. The question is whether the app fails gracefully or crashes, and whether data entered offline (particularly a Notata moment logged in a remote location) is preserved or lost.

**What to verify:**
- The app detects and communicates network unavailability to the user.
- For Notata: moments that cannot be synced due to no connectivity are queued locally and synced when connectivity returns, or the user is clearly informed the log was not saved.
- For Witness Lives: GEDCOM analysis that runs locally is not dependent on connectivity once the file is loaded.

> **Prompt: Offline Resilience Audit**
>
> *How does this application behave when the device has no internet connection? (1) Are network errors caught and communicated to the user? (2) For Notata, if a user logs a moment while offline, is that data preserved locally and synced later, or is it lost? (3) What is the user experience when a Supabase call fails due to connectivity? Identify any data loss scenario under network failure.*

---

### 4.4 Performance at Realistic Scale
**Priority: 🟢 MEDIUM**

A power user of Notata who has logged moments for several years may have thousands of records. A Witness Lives user with a large family tree may have thousands of ancestors. Performance that is acceptable with 50 test records may degrade significantly with real usage volumes.

**What to verify:**
- Database queries are paginated or limited — not loading all records at once.
- Map features with many GPS points use clustering or viewport-based loading rather than rendering all points simultaneously.
- GEDCOM parsing with large files (2,000+ individuals) completes in a reasonable time and does not freeze the UI.
- Supabase tables used for lookups have appropriate indexes.

> **Prompt: Performance Audit**
>
> *Review this codebase for performance risks at realistic data volumes. (1) Do any Supabase queries load all records without pagination or limits? (2) Does the map feature render all GPS points simultaneously, or does it use clustering/viewport filtering? (3) Are there database indexes on columns used in WHERE clauses and ORDER BY statements? (4) How does the GEDCOM parser handle files with more than 2,000 individuals — is parsing done synchronously on the main thread? Flag any operation that could freeze the UI or time out with large datasets.*

---

## Section 5: Pre-Launch Checklist

Use this checklist as a gate before any public launch. Each item maps to a section above.

| Done | Priority | Item |
|---|---|---|
| ☐ | 🔴 CRITICAL | RLS enabled and correctly configured on all user data tables (§1.1) |
| ☐ | 🔴 CRITICAL | Supabase service role key not present in any client-side code (§1.2) |
| ☐ | 🔴 CRITICAL | All protected screens require authentication before rendering (§1.3) |
| ☐ | 🔴 CRITICAL | GEDCOM files stored or processed securely with no cross-user access (§2.1) |
| ☐ | 🔴 CRITICAL | Notata user data (moments, GPS, notes, Lifeline) isolated per user (§3.1) |
| ☐ | 🟠 HIGH | Data deletion capability exists and performs hard deletes (§1.4) |
| ☐ | 🟠 HIGH | All API calls and database queries have error handling (§1.5) |
| ☐ | 🟠 HIGH | Logging in place; Supabase logs enabled (§1.6) |
| ☐ | 🟠 HIGH | Geolocation in Witness Lives is on-device only; coordinates not stored (§2.2) |
| ☐ | 🟠 HIGH | All external APIs used by Notata identified; data transmitted is minimal (§3.2) |
| ☐ | 🟠 HIGH | Location data only captured on explicit user action; not background tracked (§3.3) |
| ☐ | 🟠 HIGH | No third-party analytics or SDKs receiving user data without disclosure (§3.4) |
| ☐ | 🟠 HIGH | Input-driven database/API calls have debouncing or rate limiting (§4.1) |
| ☐ | 🟠 HIGH | All useEffect hooks have cleanup functions where needed (§4.2) |
| ☐ | 🟢 MEDIUM | Living persons in GEDCOM handled appropriately (§2.3) |
| ☐ | 🟢 MEDIUM | Privacy policy exists and accurately describes data handling (§3.4) |
| ☐ | 🟢 MEDIUM | App communicates network errors; Notata handles offline moment logging (§4.3) |
| ☐ | 🟢 MEDIUM | Database queries paginated; map uses clustering for large datasets (§4.4) |

---

## Section 6: Recommended Next Steps

### Human Code Review
Engage a senior developer with Supabase and React Native experience for a focused 3–4 hour review. Brief them specifically on RLS configuration, authentication flows, and the location data handling in Notata. This is the most effective single investment for code confidence and does not require an ongoing relationship — a one-time pre-launch engagement is sufficient.

### Beta Testing with Real Data Volumes
Before public launch, populate both applications with data volumes that approximate real usage: a large GEDCOM file (1,000+ individuals) in Witness Lives, and several hundred moments across multiple trips in Notata. Verify that performance remains acceptable and that no unexpected behavior emerges at realistic scale.

### App Store Privacy Declarations
Both Apple App Store and Google Play require privacy nutrition labels declaring what data your app collects and how it is used. For Notata in particular, location data must be declared. Prepare these declarations as part of the submission process, not as an afterthought.

### Staged Rollout
Consider a limited beta release before public launch — invite a small group of known users to stress-test both applications in real conditions. This surfaces issues that testing cannot anticipate and limits the blast radius of any problems that emerge. A soft launch to 50–100 users is meaningfully safer than an immediate open launch.

---

*End of Audit Document*
