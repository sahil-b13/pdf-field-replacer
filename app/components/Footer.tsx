export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="contact-block">
          <p className="contact-line">
            Built and maintained by <strong>[Sahil Birje]</strong>
          </p>
          <p className="contact-line">
            Questions or bugs?{" "}
            <a href="mailto:[your.email@example.com]">[sahilbirje13@gmail.com]</a>
          </p>
        </div>
      </div>

      <style jsx>{`
        .site-footer {
          border-top: 1px solid var(--rule);
          margin-top: 64px;
          padding: 28px 24px 40px;
        }
        .footer-inner {
          max-width: 880px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          flex-wrap: wrap;
        }
        .contact-block {
          font-size: 0.85rem;
          color: var(--ink-soft);
        }
        .contact-line {
          margin: 2px 0;
        }
        .contact-line strong {
          color: var(--ink);
        }
        .contact-line a {
          color: var(--ledger-green-dark);
          text-decoration: underline;
        }
      `}</style>
    </footer>
  );
}
