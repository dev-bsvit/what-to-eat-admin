const wrap: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "48px 24px 96px",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  lineHeight: 1.65,
  color: "#1a1a1a",
};

export const metadata = {
  title: "Privacy Policy — Dishday",
};

export default function PrivacyPage() {
  return (
    <div style={wrap}>
      <h1>Privacy Policy</h1>
      <p>
        <strong>Dishday — Meal Planner</strong>
        <br />
        Last updated: June 10, 2026
      </p>

      <p>
        This Privacy Policy explains how Dishday — Meal Planner (&ldquo;the App&rdquo;,
        &ldquo;we&rdquo;, &ldquo;us&rdquo;) collects, uses and protects your information when you
        use our iOS application.
      </p>

      <h2>1. Information We Collect</h2>
      <ul>
        <li>
          <strong>Account information:</strong> email address and name when you create an
          account with email, Sign in with Apple or Google.
        </li>
        <li>
          <strong>Content you create:</strong> recipes, photos, pantry items, shopping lists,
          meal plans, favorites and reviews.
        </li>
        <li>
          <strong>Dietary preferences:</strong> goals, preferred cuisines, calorie targets and
          similar settings you choose during onboarding or in your profile.
        </li>
        <li>
          <strong>Purchase information:</strong> subscription and purchase status processed by
          Apple. We never see or store your payment card details.
        </li>
        <li>
          <strong>Usage and device data:</strong> anonymous usage events, device identifiers
          and app interaction analytics used to improve the App.
        </li>
        <li>
          <strong>Push notification token:</strong> if you allow notifications, a device token
          used to deliver reminders.
        </li>
      </ul>

      <h2>2. How We Use Your Information</h2>
      <ul>
        <li>To provide the App&rsquo;s features: sync your recipes, plans and lists across sessions.</li>
        <li>To personalize recommendations and meal plans.</li>
        <li>To process AI features you explicitly request (see Section 3).</li>
        <li>To send notifications you opted into (meal reminders, shopping reminders, import status).</li>
        <li>To analyze aggregated usage and improve the App.</li>
      </ul>

      <h2>3. AI Features</h2>
      <p>
        Some features use artificial intelligence: ingredient recognition from photos, voice
        input, recipe import and chat suggestions. When you actively use these features, the
        content you submit (a photo, a text query or a link) is processed by our server and
        OpenAI&rsquo;s API to generate the result. We do not use your content to train AI
        models. AI-generated content may contain mistakes — always verify ingredients and
        allergens before cooking.
      </p>

      <h2>4. Third-Party Services</h2>
      <ul>
        <li>
          <strong>Supabase</strong> — database, authentication and file storage hosting.
        </li>
        <li>
          <strong>PostHog</strong> — first-party product analytics. We do not use advertising
          networks and do not track you across other companies&rsquo; apps or websites.
        </li>
        <li>
          <strong>OpenAI</strong> — processing of AI requests you explicitly initiate.
        </li>
        <li>
          <strong>Apple</strong> — App Store purchases, subscriptions and push notification
          delivery.
        </li>
      </ul>
      <p>We do not sell your personal data and we do not show third-party ads.</p>

      <h2>5. User-Generated Content and Moderation</h2>
      <p>
        Recipes you publish may be visible to other users. You can report inappropriate
        content and block users directly in the App. We review reports and remove content that
        violates our rules.
      </p>

      <h2>6. Data Retention and Deletion</h2>
      <p>
        Your data is stored for as long as your account exists. You can delete your account at
        any time in the App (Profile → Delete Account). Account deletion permanently removes
        your personal data, recipes, lists and plans from our servers.
      </p>

      <h2>7. Your Rights</h2>
      <p>
        Depending on your region (including the EU/EEA under GDPR), you may have the right to
        access, correct, export or delete your personal data, and to object to or restrict
        certain processing. To exercise these rights, contact us at the email below.
      </p>

      <h2>8. Children</h2>
      <p>
        The App is not directed at children under 13 (or the equivalent minimum age in your
        jurisdiction), and we do not knowingly collect personal data from children.
      </p>

      <h2>9. Security</h2>
      <p>
        Data is transmitted over encrypted connections (HTTPS/TLS) and stored with
        industry-standard protections, including row-level access control.
      </p>

      <h2>10. Changes to This Policy</h2>
      <p>
        We may update this policy from time to time. Material changes will be reflected by the
        &ldquo;Last updated&rdquo; date above.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions about privacy: <a href="mailto:designbsvit@gmail.com">designbsvit@gmail.com</a>
      </p>
    </div>
  );
}
