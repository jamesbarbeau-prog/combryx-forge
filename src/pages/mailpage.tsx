import { Mail, ExternalLink } from 'lucide-react';

export default function MailPage() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: 'calc(100vh - 56px)',
        fontFamily: 'var(--font-body)',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: 'rgba(30,95,164,0.08)',
            border: '1px solid rgba(30,95,164,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }}
        >
          <Mail size={28} color="#1E5FA4" strokeWidth={1.5} />
        </div>

        <h2
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: 'var(--color-text)',
            marginBottom: 8,
            letterSpacing: '-0.02em',
          }}
        >
          Email via Your Email Client
        </h2>

        <p
          style={{
            fontSize: 13,
            color: 'var(--color-muted)',
            lineHeight: 1.7,
            marginBottom: 28,
          }}
        >
          Builder Guardian does not host a mail inbox. Emails are sent and received through
          your connected Outlook or Gmail account.
          <br />
          <br />
          Open a case and click <strong>Email Homeowner</strong> to compose directly
          in your email client. Incoming emails are automatically logged to the case
          timeline when you use the Builder Guardian add-in.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <a
            href="https://outlook.office.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '10px 20px',
              borderRadius: 9,
              fontSize: 12,
              fontWeight: 700,
              background: 'rgba(0,120,212,0.08)',
              border: '1px solid rgba(0,120,212,0.25)',
              color: '#0078D4',
              textDecoration: 'none',
              fontFamily: 'var(--font-body)',
            }}
          >
            <ExternalLink size={13} />
            Open Outlook
          </a>

          <a
            href="https://mail.google.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '10px 20px',
              borderRadius: 9,
              fontSize: 12,
              fontWeight: 700,
              background: 'rgba(234,67,53,0.08)',
              border: '1px solid rgba(234,67,53,0.25)',
              color: '#EA4335',
              textDecoration: 'none',
              fontFamily: 'var(--font-body)',
            }}
          >
            <ExternalLink size={13} />
            Open Gmail
          </a>
        </div>

        <p
          style={{
            fontSize: 11,
            color: 'var(--color-muted)',
            marginTop: 24,
            opacity: 0.6,
          }}
        >
          Auto-emails for PO approvals and Tarion notices are sent automatically
          through your connected account via Settings → Email & API.
        </p>
      </div>
    </div>
  );
}
