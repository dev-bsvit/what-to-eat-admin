const wrap: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "48px 24px 96px",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  lineHeight: 1.65,
  color: "#1a1a1a",
};

export const metadata = {
  title: "Terms of Use — Dishday",
};

export default function TermsPage() {
  return (
    <div style={wrap}>
      <h1>Terms of Use</h1>
      <p>
        <strong>Dishday — Meal Planner</strong>
        <br />
        Last updated: June 10, 2026
      </p>

      <p>
        By downloading or using Dishday — Meal Planner (&ldquo;the App&rdquo;), you agree to
        these Terms of Use. If you do not agree, please do not use the App.
      </p>

      <h2>1. License</h2>
      <p>
        We grant you a personal, non-exclusive, non-transferable, revocable license to use the
        App for personal, non-commercial purposes on Apple devices you own or control, in
        accordance with the App Store Terms of Service. Apple&rsquo;s standard Licensed
        Application End User License Agreement (EULA) also applies.
      </p>

      <h2>2. Accounts</h2>
      <p>
        Some features require an account. You are responsible for keeping your credentials
        secure and for all activity under your account. You can delete your account at any
        time in the App (Profile → Delete Account).
      </p>

      <h2>3. Subscriptions and Purchases</h2>
      <ul>
        <li>
          The App offers auto-renewable subscriptions (monthly, yearly), a one-time lifetime
          unlock and one-time catalog purchases.
        </li>
        <li>Payment is charged to your Apple Account at confirmation of purchase.</li>
        <li>
          Subscriptions renew automatically unless cancelled at least 24 hours before the end
          of the current period. Your account is charged for renewal within 24 hours before
          the period ends.
        </li>
        <li>
          You can manage or cancel subscriptions in your App Store account settings at any
          time. A free trial, if offered, converts to a paid subscription unless cancelled at
          least 24 hours before the trial ends; any unused portion of a free trial is
          forfeited when you purchase a subscription.
        </li>
        <li>One-time purchases remain available to your account after purchase.</li>
      </ul>

      <h2>4. User Content</h2>
      <p>
        You retain ownership of recipes, photos and other content you create. By publishing
        content visible to other users, you grant us a non-exclusive, worldwide, royalty-free
        license to host and display it within the App. You must not upload content that is
        unlawful, infringing, offensive or harmful. We may remove content that violates these
        Terms and suspend accounts of repeat violators. You can report content and block users
        in the App.
      </p>

      <h2>5. AI-Generated Content</h2>
      <p>
        The App can generate recipes, suggestions and ingredient lists with artificial
        intelligence. AI output may be inaccurate or incomplete. It is provided for
        informational purposes only and is not medical or nutritional advice. Always verify
        ingredients, allergens and cooking safety yourself.
      </p>

      <h2>6. Acceptable Use</h2>
      <p>
        You agree not to misuse the App: no reverse engineering, automated scraping, abuse of
        AI features, attempts to access other users&rsquo; data, or interference with the
        service.
      </p>

      <h2>7. Disclaimer and Limitation of Liability</h2>
      <p>
        The App is provided &ldquo;as is&rdquo; without warranties of any kind. To the maximum
        extent permitted by law, we are not liable for any indirect, incidental or
        consequential damages arising from your use of the App, including reliance on recipes
        or nutritional information.
      </p>

      <h2>8. Changes</h2>
      <p>
        We may update the App and these Terms. Continued use after changes take effect
        constitutes acceptance. Material changes will be reflected by the &ldquo;Last
        updated&rdquo; date above.
      </p>

      <h2>9. Termination</h2>
      <p>
        We may suspend or terminate access for violation of these Terms. You may stop using
        the App and delete your account at any time.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions about these Terms: <a href="mailto:designbsvit@gmail.com">designbsvit@gmail.com</a>
      </p>
    </div>
  );
}
