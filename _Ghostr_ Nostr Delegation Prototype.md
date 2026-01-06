# ---

**"Ghostr" Nostr Delegation Prototype**

**Role:** You are a Senior Frontend Engineer and Nostr Protocol Specialist.

**Objective:** Build a functional React prototype for "Ghostr," a Nostr application that allows "Delegate" users to draft content and send it to an "Admin" user for approval and publishing.

**Tech Stack:**

* **Framework:** React \+ Vite \+ TypeScript  
* **Styling:** Tailwind CSS (via shadcn/ui if possible, otherwise standard Tailwind)  
* **Nostr Library:** @nostr-dev-kit/ndk (Essential for handling NIP-07, NIP-78, and NIP-59/17 complexity)  
* **State Management:** Zustand (for managing the NDK instance and user profile)

## ---

**Core Features & Requirements**

### **1\. Authentication**

* Support **NIP-07** (Browser Extension like Alby/nos2x).  
* Support **NSEC** login (for testing purposes).  
* Upon login, determine if the user is acting as a "Delegate" (Writer) or "Admin" (Publisher). (For the prototype, allow the user to toggle between these views manually).

### **2\. Data Structures (JSON Schemas)**

A. The Local Draft (NIP-78)  
Stored on relays using kind: 30078 with the d-tag ghostr-drafts. This allows the Delegate to save work-in-progress.

* **Encryption:** Encrypted to self (NIP-44 or NIP-04).  
* **Schema:**

TypeScript

interface DraftStore {  
  drafts: Array\<{  
    id: string; // UUID  
    title: string; // Internal title  
    content: string; // The post body  
    targetKind: number; // 1 (Short note) or 30023 (Long form)  
    tags: string\[\]\[\]; // Array of tags  
    status: 'draft' | 'submitted' | 'published';  
    updatedAt: number;  
  }\>  
}

B. The Submission Payload (NIP-59/17)  
Sent as a Direct Message (Giftwrap) from Delegate to Admin.

* **Transport:** Use NDK's send() or NIP-17 implementation to wrap this payload inside a generic chat event or a custom ephemeral event.  
* **Schema (The JSON stringified inside the message):**

TypeScript

interface SubmissionPayload {  
  protocol: "ghostr\_v1";  
  type: "submission";  
  id: string; // The original draft UUID  
  content: string;  
  kind: number; // 1 or 30023  
  tags: string\[\]\[\];  
  note: string; // Optional note to admin: "Please review this by Tuesday"  
}

### **3\. Delegate View (The Writer)**

* **Draft Editor:** A simple textarea (for Kind 1\) and a Title field.  
* **Save Button:** Saves the current state to NIP-78 (merging with existing drafts).  
* **"Submit for Review" Button:**  
  * Input field for "Admin NPUB".  
  * Constructs the SubmissionPayload.  
  * Sends via NIP-59 (Giftwrap) to the Admin's NPUB.  
  * Updates local NIP-78 status to submitted.

### **4\. Admin View (The Publisher)**

* **Inbox/Queue:**  
  * Fetches NIP-59/17 messages (DMs).  
  * Filters messages to find those containing protocol: "ghostr\_v1".  
  * Displays a list of "Pending Approvals."  
* **Review Pane:**  
  * Clicking an item in the queue populates a "Final Polish" editor.  
  * **Action \- Publish:**  
    * Takes the content and tags from the payload.  
    * Creates a **NEW** event (Kind 1 or 30023).  
    * Signs it with the **Admin's Key**.  
    * Publishes to relays.  
    * (Optional) Sends a "Receipt" message back to the delegate.

## ---

**Implementation Steps for Prototype**

1. **Project Setup:** Initialize Vite project with NDK.  
2. **NDK Context:** Create a context provider that initializes NDK with explicit relay list (use wss://relay.damus.io, wss://nos.lol).  
3. **Draft Manager:** Implement the saveDraft and loadDrafts functions using ndk.publish(kind30078).  
4. **Messaging:** Implement sendSubmission(adminNpub, payload) using NDK's encryption/wrapping methods.  
5. **UI Construction:** Create a split view or tabs for "Writer Dashboard" and "Admin Dashboard."

## **Key Technical Constraints**

* Do not overcomplicate the editor for this version (standard textarea is fine).  
* Ensure NIP-78 replaces the *entire* list of drafts (fetch \-\> update \-\> publish) to avoid data loss, as NIP-78 is key-value replacement.  
* Use ndk.signer for all cryptographic operations.

**Please generate the full code structure, focusing on the NDK integration logic and the React components for the workflow.**