export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <p className="disclaimer">
          This tool modifies only labeled personal metadata fields (Name, Roll No, Date, etc.) on
          standard academic documents. It does not alter, generate, or assist with academic
          content. Users are responsible for their own original work.
        </p>

        <div className="footer-row">
          <div className="contact-block">
            <p className="contact-line">
              Built and maintained by <strong>[Sahil Birje]</strong>
            </p>
            <p className="contact-line">
              Questions or bugs?{" "}
              <a href="mailto:[your.email@example.com]">[sahilbirje13@gmail.com]</a>
            </p>
          </div>
          <a
            className="heroes-button"
            href="https://digitalheroesco.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Built for Digital Heroes
          </a>
        </div>
      </div>

      <style jsx>{`
        .site-footer {
          border-top: 1px solid var(--rule);
          margin-top: 64px;
          padding: 28px 24px 40px;
        }
        .footer-inner {
          max-width: 1180px;
          margin: 0 auto;
        }
        .disclaimer {
          font-size: 0.78rem;
          line-height: 1.5;
          color: var(--pencil);
          max-width: 760px;
          margin: 0 0 20px;
          padding-bottom: 18px;
          border-bottom: 1px solid var(--rule);
        }
        .footer-row {
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
        .social-links {
          margin-top: 8px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.85rem;
        }
        .social-links a {
          color: var(--ledger-green-dark);
          text-decoration: underline;
        }
        .social-links .dot {
          color: var(--pencil);
        }
        .heroes-button {
          display: inline-block;
          background: var(--ink);
          color: white;
          text-decoration: none;
          padding: 10px 18px;
          border-radius: 3px;
          font-size: 0.85rem;
          font-weight: 600;
          white-space: nowrap;
        }
        .heroes-button:hover {
          background: var(--ledger-green-dark);
        }
      `}</style>
    </footer>
  );
}
