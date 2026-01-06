Original prompt: I'd like to write a spec for a Nostr application short form/long form post delegation app that can do the following:

1\. Delegated users can draft posts to be assigned to an admin user for review

2\. Draft posts are saved as arbitrary data stored using (NIP-78) encrypted with the author's key until they are ready to be sent for review

3\. Posts sent for review are shared via giftwrap messages like how keychat works: https://github.com/keychat-io/keychat-app

These posts can be formatted for either kind 1 short from or NIP-23 longform content, this is up to the author

4\. Admin user can sign in with NIP07, NIP46, or nsec to review posts in queue sent to them.

5\. Admin user can duplicate these posts to edit, discard, or publish with their own npub

If you have suggestions on how to improve this process, I am open to it. The purpose of this app is to create a decentralized way for social media and brand managers to create posts for brands where the brand owner doesn't have to relinquish control of the private key to employees or contractors.

---

This is a strong use case for Nostr. You are essentially building a **CMS (Content Management System) Approval Workflow** on top of the protocol.

The approach you outlined is actually superior to NIP-26 (Delegation) for high-value brands because NIP-26 allows a delegate to sign *anything* within the constraints. Your method ensures the Brand Owner (Admin) retains "Human-in-the-Loop" final approval for every single event.

Here is a technical specification for the application, which we will call **"Ghostr"** (placeholder name for a Ghostwriter/Manager app).

# ---

**Technical Specification: Ghostr (Nostr Approval Workflow)**

## **1\. Terminology & Roles**

* **The Delegate (Writer):** The employee or contractor creating content.  
* **The Admin (Signer):** The brand owner who holds the private key (nsec) and has final publishing authority.  
* **The Payload:** The draft content (Short note or Long-form article) moving between parties.

## **2\. Protocol Flow & Architecture**

### **A. Draft Storage (NIP-78)**

The Delegate needs to save work in progress without sending it to the Admin yet.

* **Mechanism:** NIP-78 (Arbitrary Custom App Data).  
* **Kind:** 30078\.  
* **d-tag:** ghostr-drafts.  
* **Content:** Encrypted JSON blob (encrypted to self).  
* **Structure:**  
  JSON  
  \[  
    {  
      "id": "uuid-v4",  
      "title": "Q1 Roadmap Update",  
      "content": "Here is the body...",  
      "target\_kind": 30023, // or 1  
      "tags": \[\["t", "nostr"\], \["title", "Roadmap"\]\],  
      "status": "draft",  
      "updated\_at": 1700000000  
    }  
  \]

### **B. Submission Pipeline (NIP-59 / NIP-17)**

When the Delegate hits "Submit for Review," the app constructs a message to the Admin.

* **Mechanism:** NIP-59 (Gift Wrap) / NIP-17 (Private Direct Messages).  
* **Why:** This hides metadata. No one on the public relay knows the Delegate is communicating with the Admin.  
* **Inner Event (The Payload):**  
  * Instead of a standard Kind 14 (Chat), we should use a specific **Job Request** or **Draft Event**.  
  * **Proposed Kind:** Kind 1063 (File Metadata) or generic Kind 14 with a specific JSON structure inside. Let's use Kind 14 (Chat) containing a structured JSON payload to ensure compatibility with other clients (like Keychat) if necessary, or a custom ephemeral kind.  
* **Payload Data:**  
  JSON  
  {  
    "type": "draft\_submission",  
    "target\_kind": 1, // The kind the Admin will publish  
    "content": "Excited to announce our new product\! \#bitcoin",  
    "suggested\_tags": \[\["t", "bitcoin"\], \["r", "wss://relay.damus.io"\]\]  
  }

### **C. Admin Review & Publishing**

The Admin logs in (NIP-07/NIP-46). The app decrypts the inbox (Giftwraps).

1. **Queue View:** Admin sees a list of "Pending Drafts" parsed from the incoming messages.  
2. **Action \- "Publish":**  
   * The app takes the content and suggested\_tags from the Delegate's payload.  
   * The app constructs a **NEW** unsigned event (Kind 1 or 30023).  
   * **CRITICAL:** The app prompts the Admin to sign this new event with their *own* key.  
3. **Action \- "Reject/Request Changes":**  
   * Admin sends a reply (Giftwrap) back to the Delegate with feedback.

## ---

**3\. Feature Breakdown**

### **1\. The Writer Interface (Delegate)**

* **Rich Text Editor:** Markdown support for NIP-23; simple text area for Kind 1\.  
* **Preview Mode:** Renders the post exactly as it will look when signed by the brand.  
* **"Send to Admin" Button:**  
  * Requires the Admin's public key (npub).  
  * Wraps the draft into a NIP-59 package.  
  * Publishes to the Admin's read relays (NIP-65).

### **2\. The Brand Interface (Admin)**

* **Login Support:**  
  * **NIP-07:** Browser extension (Alby, nos2x) \- *Recommended for security.*  
  * **NIP-46:** Nostr Connect (Bunker) \- *Excellent for mobile approval without holding keys.*  
  * **nsec:** (Not recommended, but supported for fallback).  
* **The Approval Queue:** A "Inbox" style view showing pending drafts.  
* **Diff/Edit View:** The Admin can click a draft, make final tweaks (fix a typo), and then press "Sign & Publish."

## ---

**4\. Suggestions for Improvement**

To make this a production-ready tool for brands, consider adding these layers:

### **A. Feedback Loop (Status Updates)**

Currently, step 5 says the Admin "publishes." The Delegate needs to know this happened.

* **Suggestion:** When the Admin publishes the final Kind 1/30023 note, the app should automatically send a silent "Receipt" (NIP-59) back to the Delegate containing the event\_id of the published post.  
* **UI Result:** The Delegate's dashboard moves the item from "Pending" to "Published."

### **B. Media Handling (NIP-96)**

Brand posts often have images/video.

* **Problem:** If the Delegate uploads an image to *their* NIP-96 server, the URL might expire or be associated with their pubkey.  
* **Solution:** The Admin should configure a specific NIP-96 server (like nostr.build or a self-hosted one). When the Delegate uploads media *for a draft*, the app should try to use a shared authentication token or simply include the URL. Ensure the Admin's final signature doesn't break if the media host checks ownership (usually they don't, once uploaded).

### **C. Prevent "Double Posting"**

* **Scenario:** Admin clicks "Publish" twice by accident.  
* **Solution:** Implement an idempotency check. Once a draft payload is converted to a published event, mark that specific draft ID as processed in the Admin's local NIP-78 settings.

### **D. Scheduled Posting (The "Holy Grail")**

Brands love scheduling.

* **Implementation:** Since the Admin must sign, true scheduling is hard without a hot wallet.  
* **Workaround:** The Admin can "Pre-sign" the event with a created\_at timestamp in the future. The app (or a backend service) holds the *signed* event and broadcasts it to relays only when that timestamp arrives.

## ---

**5\. Sequence Diagram**

Here is how the data flows between the Delegate, the Relays, and the Admin.

Code snippet

sequenceDiagram  
    participant D as Delegate (Writer)  
    participant R as Nostr Relays  
    participant A as Admin (Brand Owner)

    Note over D: Drafts post content\<br/\>(Kind 1 or NIP-23)

    D-\>\>R: Save Draft to Self (NIP-78)  
    Note right of D: Encrypted backup

    D-\>\>D: Wrap Content in NIP-59 (Giftwrap)  
    D-\>\>R: Publish Giftwrap to Admin's Inbox

    Note over A: Admin Logs in (NIP-07/46)  
    A-\>\>R: Fetch Giftwraps  
    R--\>\>A: Return Encrypted Events

    A-\>\>A: Unwrap & Decrypt  
    Note right of A: Admin sees "Proposed Post"

    alt Admin Approves  
        A-\>\>A: Edit (Optional) & Create New Event  
        A-\>\>A: Sign Event with Brand Key  
        A-\>\>R: Publish Final Event (Kind 1/30023)  
        A-\>\>R: Send "Approved" Receipt to Delegate  
    else Admin Rejects  
        A-\>\>R: Send "Feedback" Message to Delegate  
    end

## **Next Steps**

This architecture is solid. The most complex part will be the **UI for the Admin**—ensuring that when they "unwrap" a Kind 23 draft, it renders beautifully with all markdown formatting preserved before they hit "Sign."

**Would you like me to write a specific JSON schema for the "Draft Payload" to ensure your Delegate and Admin clients parse the data consistently?**